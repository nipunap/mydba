/* eslint-disable @typescript-eslint/no-explicit-any */

import { IDatabaseAdapter } from '../adapters/database-adapter';
import { Logger } from '../utils/logger';

export interface ProfileStage {
    eventName: string;
    duration: number; // microseconds
    lockTime?: number;
    rowsAffected?: number;
    rowsSent?: number;
    rowsExamined?: number;
}

export interface QueryProfile {
    query: string;
    totalDuration: number; // microseconds
    stages: ProfileStage[];
    summary: {
        totalLockTime: number;
        totalRowsExamined: number;
        totalRowsSent: number;
        efficiency: number; // rows sent / rows examined
    };
}

export class QueryProfilingService {
    constructor(private logger: Logger) {}

    /**
     * Profile a query using MySQL 8.0+ Performance Schema
     * Uses a dedicated connection to ensure all queries run on the same thread
     */
    async profileQuery(adapter: IDatabaseAdapter, query: string): Promise<QueryProfile> {
        this.logger.info(`Profiling query: ${query.substring(0, 100)}`);

        try {
            // Replace parameter placeholders with sample values for profiling
            const { QueryDeanonymizer } = await import('../utils/query-deanonymizer');
            let executableQuery = query;
            if (QueryDeanonymizer.hasParameters(query)) {
                this.logger.info(`Query has ${QueryDeanonymizer.countParameters(query)} parameters, replacing with sample values for profiling`);
                executableQuery = QueryDeanonymizer.replaceParametersForExplain(query);
                this.logger.debug(`Deanonymized query: ${executableQuery}`);
            }

            // Check if adapter supports withConnection (MySQLAdapter)
            const mysqlAdapter = adapter as any;
            if (typeof mysqlAdapter.withConnection !== 'function') {
                throw new Error('Profiling requires MySQL adapter with connection pooling support');
            }

            // Ensure Performance Schema is enabled first
            await this.ensurePerformanceSchemaEnabled(adapter);

            // Step 1: Execute the query on a dedicated connection and get metrics
            let threadId: number = 0;
            let lastEventId: number = 0;
            let totalDuration: number = 0;

            await mysqlAdapter.withConnection(async (conn: any) => {
                // Get PROCESSLIST_ID (what CONNECTION_ID() returns)
                const [connIdRows] = await conn.query('SELECT CONNECTION_ID() as connection_id');
                const connectionId = connIdRows[0]?.connection_id || connIdRows[0]?.CONNECTION_ID;

                // Map PROCESSLIST_ID to THREAD_ID (what Performance Schema uses)
                const [threadMapRows] = await conn.query(`
                    SELECT THREAD_ID
                    FROM performance_schema.threads
                    WHERE PROCESSLIST_ID = ?
                `, [connectionId]);
                threadId = threadMapRows[0]?.THREAD_ID || threadMapRows[0]?.thread_id;

                this.logger.info(`Profiling on dedicated connection, PROCESSLIST_ID: ${connectionId}, THREAD_ID: ${threadId}`);

                // Get the last EVENT_ID before executing our query
                const lastEventQuery = `
                    SELECT MAX(EVENT_ID) as last_event_id
                    FROM performance_schema.events_statements_history_long
                    WHERE THREAD_ID = ?
                `;
                const [lastEventRows] = await conn.query(lastEventQuery, [threadId]);
                lastEventId = lastEventRows[0]?.last_event_id || lastEventRows[0]?.LAST_EVENT_ID || 0;

                this.logger.info(`Last EVENT_ID before execution: ${lastEventId}`);

                // Execute the query to profile ON THE SAME CONNECTION
                const startTime = Date.now();
                await conn.query(executableQuery);
                const endTime = Date.now();
                totalDuration = (endTime - startTime) * 1000; // Convert to microseconds

                this.logger.info(`Query executed in ${endTime - startTime}ms on thread ${threadId}`);

                // Execute one more simple query to force Performance Schema to flush
                await conn.query('SELECT 1');

                this.logger.info('Connection will be released to allow Performance Schema to flush');
            });

            // Step 2: Now that the connection is released, query Performance Schema from a different connection
            // Wait a bit to allow Performance Schema to process
            await new Promise(resolve => setTimeout(resolve, 500));

            // Aggressive normalization for matching - remove ALL spaces, lowercase, remove quotes
            const normalizeQueryForMatching = (q: string) => {
                return q
                    .replace(/`/g, '') // Remove backticks
                    .replace(/"/g, '') // Remove double quotes
                    .replace(/'/g, '') // Remove single quotes
                    .replace(/\s+/g, '') // Remove ALL whitespace
                    .toLowerCase(); // Convert to lowercase
            };

            const normalizedTargetQuery = normalizeQueryForMatching(query);
            this.logger.info(`Normalized target query: ${normalizedTargetQuery.substring(0, 80)}`);

            // Try to get statements from multiple sources (using regular adapter, different connection)
            let stmtRows: any[] = [];
            let sourceUsed = '';

            // First try: events_statements_history_long with EVENT_ID filter
            let stmtQuery = `
                SELECT
                    EVENT_ID,
                    SQL_TEXT,
                    TIMER_WAIT / 1000000 as duration_us,
                    LOCK_TIME / 1000000 as lock_time_us,
                    ROWS_AFFECTED,
                    ROWS_SENT,
                    ROWS_EXAMINED,
                    TIMER_START
                FROM performance_schema.events_statements_history_long
                WHERE THREAD_ID = ?
                    AND EVENT_ID > ?
                ORDER BY EVENT_ID DESC
                LIMIT 30
            `;

            let stmtResult = await adapter.query<unknown>(stmtQuery, [threadId, lastEventId]);
            stmtRows = Array.isArray(stmtResult) ? stmtResult : ((stmtResult as any).rows || []);
            sourceUsed = 'events_statements_history_long (with EVENT_ID filter)';

            this.logger.info(`Found ${stmtRows.length} new statements in ${sourceUsed} on thread ${threadId} after EVENT_ID ${lastEventId}`);

            // Second try: events_statements_history_long without EVENT_ID filter
            if (stmtRows.length === 0) {
                this.logger.warn('Trying events_statements_history_long without EVENT_ID filter...');
                stmtQuery = `
                    SELECT
                        EVENT_ID,
                        SQL_TEXT,
                        TIMER_WAIT / 1000000 as duration_us,
                        LOCK_TIME / 1000000 as lock_time_us,
                        ROWS_AFFECTED,
                        ROWS_SENT,
                        ROWS_EXAMINED,
                        TIMER_START
                    FROM performance_schema.events_statements_history_long
                    WHERE THREAD_ID = ?
                    ORDER BY EVENT_ID DESC
                    LIMIT 30
                `;

                stmtResult = await adapter.query<unknown>(stmtQuery, [threadId]);
                stmtRows = Array.isArray(stmtResult) ? stmtResult : ((stmtResult as any).rows || []);
                sourceUsed = 'events_statements_history_long (no EVENT_ID filter)';
                this.logger.info(`Found ${stmtRows.length} statements in ${sourceUsed}`);
            }

            // Third try: events_statements_history
            if (stmtRows.length === 0) {
                this.logger.warn('Trying events_statements_history...');
                stmtQuery = `
                    SELECT
                        EVENT_ID,
                        SQL_TEXT,
                        TIMER_WAIT / 1000000 as duration_us,
                        LOCK_TIME / 1000000 as lock_time_us,
                        ROWS_AFFECTED,
                        ROWS_SENT,
                        ROWS_EXAMINED,
                        TIMER_START
                    FROM performance_schema.events_statements_history
                    WHERE THREAD_ID = ?
                    ORDER BY EVENT_ID DESC
                    LIMIT 10
                `;

                stmtResult = await adapter.query<unknown>(stmtQuery, [threadId]);
                stmtRows = Array.isArray(stmtResult) ? stmtResult : ((stmtResult as any).rows || []);
                sourceUsed = 'events_statements_history';
                this.logger.info(`Found ${stmtRows.length} statements in ${sourceUsed}`);
            }

            // Fourth try: events_statements_current
            if (stmtRows.length === 0) {
                this.logger.warn('Trying events_statements_current...');
                stmtQuery = `
                    SELECT
                        EVENT_ID,
                        SQL_TEXT,
                        TIMER_WAIT / 1000000 as duration_us,
                        LOCK_TIME / 1000000 as lock_time_us,
                        ROWS_AFFECTED,
                        ROWS_SENT,
                        ROWS_EXAMINED,
                        TIMER_START
                    FROM performance_schema.events_statements_current
                    WHERE THREAD_ID = ?
                `;

                stmtResult = await adapter.query<unknown>(stmtQuery, [threadId]);
                stmtRows = Array.isArray(stmtResult) ? stmtResult : ((stmtResult as any).rows || []);
                sourceUsed = 'events_statements_current';
                this.logger.info(`Found ${stmtRows.length} statements in ${sourceUsed}`);
            }

            // Log all found statements for debugging
            if (stmtRows.length > 0) {
                stmtRows.forEach((row: any, index: number) => {
                    const sqlText = ((row.SQL_TEXT || row.sql_text || '') as string).substring(0, 80);
                    this.logger.info(`  [${index}] EVENT_ID ${row.EVENT_ID || row.event_id}: ${sqlText}`);
                });
            }

            // Filter in memory with aggressive normalization
            let stmt = stmtRows.find((row: any) => {
                const sqlText = row.SQL_TEXT || row.sql_text || '';
                const normalizedSql = normalizeQueryForMatching(sqlText);

                // Log for debugging
                this.logger.info(`Comparing:\n  SQL: ${normalizedSql.substring(0, 60)}\n  Target: ${normalizedTargetQuery.substring(0, 60)}`);

                // Match if normalized queries are equal (or contain each other for partial matches)
                const compareLength = Math.min(Math.min(normalizedSql.length, normalizedTargetQuery.length), 100);

                return normalizedSql.substring(0, compareLength) === normalizedTargetQuery.substring(0, compareLength) ||
                       normalizedSql.includes(normalizedTargetQuery.substring(0, 50)) ||
                       normalizedTargetQuery.includes(normalizedSql.substring(0, 50));
            });

            // Fallback: if not found, use the most recent query on this thread (excluding setup queries)
            if (!stmt && stmtRows.length > 0) {
                this.logger.warn('Exact query match not found, filtering out setup queries...');
                // Filter out performance_schema setup queries
                const nonSetupQueries = stmtRows.filter((row: any) => {
                    const sqlText = ((row.SQL_TEXT || row.sql_text || '') as string).toLowerCase();
                    const isSetup = sqlText.includes('performance_schema') ||
                                   sqlText.includes('connection_id()') ||
                                   sqlText.includes('select 1') ||
                                   sqlText.trim().length === 0;
                    if (!isSetup) {
                        this.logger.info(`  Candidate non-setup query: ${sqlText.substring(0, 80)}`);
                    }
                    return !isSetup;
                });

                if (nonSetupQueries.length > 0) {
                    this.logger.warn(`Using most recent non-setup statement (${nonSetupQueries.length} candidates)`);
                    stmt = nonSetupQueries[0];
                } else {
                    this.logger.error('All queries were setup queries!');
                }
            }

            if (!stmt) {
                this.logger.error(`Failed to find statement. Total rows: ${stmtRows.length}, Thread: ${threadId}, Last Event ID: ${lastEventId}, Source: ${sourceUsed}`);
                throw new Error(`Could not find statement in Performance Schema (tried multiple sources: ${sourceUsed}). This could mean:
1. Performance Schema is not retaining statement history. Try: SET GLOBAL performance_schema_events_statements_history_long_size = 10000;
2. The events_statements_history_long consumer is not properly enabled.
3. The query executed on a different thread or before monitoring was set up.

To diagnose, check: SELECT COUNT(*) FROM performance_schema.events_statements_history_long WHERE THREAD_ID = ${threadId};`);
            }

            this.logger.info(`Successfully matched statement with EVENT_ID: ${stmt.EVENT_ID || stmt.event_id} from ${sourceUsed}`);

            const eventId = stmt.EVENT_ID || stmt.event_id;

            // Get stage events for this statement
            const stagesQuery = `
                SELECT
                    EVENT_NAME as event_name,
                    TIMER_WAIT / 1000000 as duration_us,
                    NESTING_EVENT_ID as nesting_event_id
                FROM performance_schema.events_stages_history_long
                WHERE NESTING_EVENT_ID = ?
                ORDER BY EVENT_ID
            `;

            const stagesResult = await adapter.query<unknown>(stagesQuery, [eventId]);
            const stageRows = Array.isArray(stagesResult) ? stagesResult : ((stagesResult as any).rows || []);

            // Build profile
            const stages: ProfileStage[] = stageRows.map((stage: any) => ({
                eventName: this.cleanEventName(stage.event_name || stage.EVENT_NAME),
                duration: parseFloat((stage.duration_us || stage.DURATION_US || 0) as string),
            }));

            const profile: QueryProfile = {
                query,
                totalDuration: parseFloat(stmt.duration_us || stmt.DURATION_US || totalDuration),
                stages,
                summary: {
                    totalLockTime: parseFloat(stmt.lock_time_us || stmt.LOCK_TIME_US || 0),
                    totalRowsExamined: parseInt(stmt.ROWS_EXAMINED || stmt.rows_examined || 0),
                    totalRowsSent: parseInt(stmt.ROWS_SENT || stmt.rows_sent || 0),
                    efficiency: 0
                }
            };

            // Calculate efficiency
            if (profile.summary.totalRowsExamined > 0) {
                profile.summary.efficiency =
                    (profile.summary.totalRowsSent / profile.summary.totalRowsExamined) * 100;
            } else {
                profile.summary.efficiency = 100;
            }

            return profile;

        } catch (error) {
            this.logger.error('Failed to profile query:', error as Error);
            throw error;
        }
    }

    private async ensurePerformanceSchemaEnabled(adapter: IDatabaseAdapter): Promise<void> {
        // Check if performance_schema is enabled
        const result = await adapter.query<unknown>(`SHOW VARIABLES LIKE 'performance_schema'`);
        const rows = Array.isArray(result) ? result : ((result as any).rows || []);

        if (rows.length === 0 || (rows[0].Value !== 'ON' && rows[0].value !== 'ON')) {
            throw new Error('Performance Schema is not enabled. Please enable it in MySQL configuration.');
        }

        // Enable statement and stage instrumentation
        await adapter.query(`
            UPDATE performance_schema.setup_instruments
            SET ENABLED = 'YES', TIMED = 'YES'
            WHERE NAME LIKE 'statement/%' OR NAME LIKE 'stage/%'
        `);

        await adapter.query(`
            UPDATE performance_schema.setup_consumers
            SET ENABLED = 'YES'
            WHERE NAME LIKE '%statements%' OR NAME LIKE '%stages%'
        `);

        // Enable history_long consumers
        await adapter.query(`
            UPDATE performance_schema.setup_consumers
            SET ENABLED = 'YES'
            WHERE NAME IN ('events_statements_history_long', 'events_stages_history_long')
        `);
    }

    private cleanEventName(eventName: string): string {
        // Remove 'stage/' prefix and make it more readable
        return eventName
            .replace(/^stage\/sql\//, '')
            .replace(/_/g, ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    /**
     * Get slow queries from Performance Schema
     */
    async getSlowQueries(adapter: IDatabaseAdapter, minDurationMs: number = 1000): Promise<any[]> {
        const query = `
            SELECT
                DIGEST_TEXT as digest_text,
                SCHEMA_NAME as schema_name,
                COUNT_STAR as count_star,
                AVG_TIMER_WAIT / 1000000000 as avg_duration_ms,
                MAX_TIMER_WAIT / 1000000000 as max_duration_ms,
                SUM_ROWS_EXAMINED as sum_rows_examined,
                SUM_ROWS_SENT as sum_rows_sent,
                FIRST_SEEN as first_seen,
                LAST_SEEN as last_seen
            FROM performance_schema.events_statements_summary_by_digest
            WHERE SCHEMA_NAME IS NOT NULL
                AND SCHEMA_NAME NOT IN ('performance_schema', 'information_schema', 'mysql', 'sys')
                AND AVG_TIMER_WAIT / 1000000000 > ?
            ORDER BY AVG_TIMER_WAIT DESC
            LIMIT 50
        `;

        const result = await adapter.query<unknown>(query, [minDurationMs]);
        return Array.isArray(result) ? result : ((result as any).rows || []);
    }

    /**
     * Get query statistics from Performance Schema
     */
    async getQueryStatistics(adapter: IDatabaseAdapter, schemaName?: string): Promise<any[]> {
        let query = `
            SELECT
                DIGEST_TEXT as digest_text,
                SCHEMA_NAME as schema_name,
                COUNT_STAR as count_star,
                AVG_TIMER_WAIT / 1000000000 as avg_duration_ms,
                SUM_TIMER_WAIT / 1000000000 as total_duration_ms,
                SUM_LOCK_TIME / 1000000000 as total_lock_time_ms,
                SUM_ROWS_AFFECTED as total_rows_affected,
                SUM_ROWS_SENT as total_rows_sent,
                SUM_ROWS_EXAMINED as total_rows_examined,
                SUM_CREATED_TMP_TABLES as tmp_tables,
                SUM_CREATED_TMP_DISK_TABLES as tmp_disk_tables,
                SUM_SORT_ROWS as sort_rows,
                FIRST_SEEN as first_seen,
                LAST_SEEN as last_seen
            FROM performance_schema.events_statements_summary_by_digest
            WHERE SCHEMA_NAME IS NOT NULL
                AND SCHEMA_NAME NOT IN ('performance_schema', 'information_schema', 'mysql', 'sys')
        `;

        const params: any[] = [];
        if (schemaName) {
            query += ' AND SCHEMA_NAME = ?';
            params.push(schemaName);
        }

        query += ' ORDER BY SUM_TIMER_WAIT DESC LIMIT 100';

        const result = await adapter.query<unknown>(query, params);
        return Array.isArray(result) ? result : ((result as any).rows || []);
    }
}
