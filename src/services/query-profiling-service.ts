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
     */
    async profileQuery(adapter: IDatabaseAdapter, query: string): Promise<QueryProfile> {
        this.logger.info(`Profiling query: ${query.substring(0, 100)}`);

        try {
            // Ensure Performance Schema is enabled
            await this.ensurePerformanceSchemaEnabled(adapter);

            // Clear previous profiling data
            await adapter.query('TRUNCATE TABLE performance_schema.events_statements_history_long');
            await adapter.query('TRUNCATE TABLE performance_schema.events_stages_history_long');

            // Execute the query to profile
            const startTime = Date.now();
            await adapter.query(query);
            const endTime = Date.now();
            const totalDuration = (endTime - startTime) * 1000; // Convert to microseconds

            // Get the statement event
            const stmtQuery = `
                SELECT
                    EVENT_ID,
                    SQL_TEXT,
                    TIMER_WAIT / 1000000 as duration_us,
                    LOCK_TIME / 1000000 as lock_time_us,
                    ROWS_AFFECTED,
                    ROWS_SENT,
                    ROWS_EXAMINED
                FROM performance_schema.events_statements_history_long
                WHERE SQL_TEXT LIKE ?
                ORDER BY EVENT_ID DESC
                LIMIT 1
            `;

            const stmtResult = await adapter.query<any>(stmtQuery, [`%${query.substring(0, 50)}%`]);
            const stmtRows = Array.isArray(stmtResult) ? stmtResult : ((stmtResult as any).rows || []);

            if (stmtRows.length === 0) {
                throw new Error('Could not find statement in Performance Schema');
            }

            const stmt = stmtRows[0];
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

            const stagesResult = await adapter.query<any>(stagesQuery, [eventId]);
            const stageRows = Array.isArray(stagesResult) ? stagesResult : ((stagesResult as any).rows || []);

            // Build profile
            const stages: ProfileStage[] = stageRows.map((stage: any) => ({
                eventName: this.cleanEventName(stage.event_name || stage.EVENT_NAME),
                duration: parseFloat(stage.duration_us || stage.DURATION_US || 0),
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
        const result = await adapter.query<any>(`SHOW VARIABLES LIKE 'performance_schema'`);
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

        const result = await adapter.query<any>(query, [minDurationMs]);
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

        const result = await adapter.query<any>(query, params);
        return Array.isArray(result) ? result : ((result as any).rows || []);
    }
}
