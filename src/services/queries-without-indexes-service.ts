import { IDatabaseAdapter } from '../adapters/database-adapter';
import { Logger } from '../utils/logger';

/**
 * Custom error for Performance Schema configuration issues
 */
export class PerformanceSchemaConfigurationError extends Error {
    constructor(
        message: string,
        public config: {
            needsInstruments: boolean;
            needsConsumers: boolean;
            instrumentCount: number;
            consumerCount: number;
        }
    ) {
        super(message);
        this.name = 'PerformanceSchemaConfigurationError';
    }
}

export interface QueryWithoutIndexInfo {
    digest: string;
    digestText: string;
    schema: string;
    countStar: number;
    sumRowsExamined: number;
    sumRowsSent: number;
    firstSeen: Date;
    lastSeen: Date;
    avgRowsExamined: number;
    avgRowsSent: number;
    efficiency: number; // Percentage of rows examined vs sent
    severity: 'critical' | 'warning' | 'info';
    suggestedIndexes: string[];
}

export class QueriesWithoutIndexesService {
    constructor(private logger: Logger) {}

    /**
     * Detect queries without indexes using Performance Schema
     */
    async detectQueriesWithoutIndexes(adapter: IDatabaseAdapter): Promise<QueryWithoutIndexInfo[]> {
        this.logger.info('Detecting queries without indexes...');

        try {
            // First, ensure Performance Schema is enabled
            await this.ensurePerformanceSchemaEnabled(adapter);

            // Query performance_schema for queries with full table scans or high row examination
            const cfg = (await import('vscode')).workspace.getConfiguration('mydba');
            const minAvgRowsExamined = cfg.get<number>('qwi.minAvgRowsExamined', 1000);
            const minExecutions = cfg.get<number>('qwi.minExecutions', 5);
            const maxEfficiency = cfg.get<number>('qwi.maxEfficiencyPercent', 10);

            const query = `
                SELECT
                    digest,
                    digest_text,
                    schema_name,
                    count_star,
                    sum_rows_examined,
                    sum_rows_sent,
                    first_seen,
                    last_seen,
                    sum_no_index_used,
                    sum_no_good_index_used
                FROM performance_schema.events_statements_summary_by_digest
                WHERE schema_name IS NOT NULL
                    AND schema_name NOT IN ('performance_schema', 'information_schema', 'mysql', 'sys')
                    AND digest_text NOT LIKE 'SHOW%'
                    AND digest_text NOT LIKE 'SELECT @@%'
                    AND (
                        sum_no_index_used > 0
                        OR sum_no_good_index_used > 0
                        OR (sum_rows_examined / GREATEST(count_star, 1)) > ${minAvgRowsExamined}
                    )
                    AND count_star >= ${minExecutions}
                    AND ( (sum_rows_sent / NULLIF(sum_rows_examined,0)) * 100 ) <= ${maxEfficiency}
                ORDER BY sum_rows_examined DESC
                LIMIT 100
            `;

            const result = await adapter.query<any>(query);
            const rows = Array.isArray(result) ? result : ((result as any).rows || []);

            this.logger.info(`Found ${rows.length} queries without optimal indexes`);

            // Process and analyze each query
            const queriesInfo: QueryWithoutIndexInfo[] = [];
            for (const row of rows) {
                const info = await this.analyzeQuery(adapter, row);
                queriesInfo.push(info);
            }

            return queriesInfo;
        } catch (error) {
            this.logger.error('Failed to detect queries without indexes:', error as Error);
            throw error;
        }
    }

    private async ensurePerformanceSchemaEnabled(adapter: IDatabaseAdapter): Promise<void> {
        // Check if performance_schema is enabled
        const result = await adapter.query<any>(`SHOW VARIABLES LIKE 'performance_schema'`);
        const rows = Array.isArray(result) ? result : ((result as any).rows || []);

        if (rows.length === 0 || rows[0].Value !== 'ON') {
            throw new Error('Performance Schema is not enabled. Please enable it in MySQL configuration and restart the server.');
        }

        // Check if statement instrumentation is already enabled
        const instrumentsCheck = await adapter.query<any>(`
            SELECT COUNT(*) as disabled_count
            FROM performance_schema.setup_instruments
            WHERE NAME LIKE 'statement/%' AND (ENABLED = 'NO' OR TIMED = 'NO')
        `);
        const instrumentRows = Array.isArray(instrumentsCheck) ? instrumentsCheck : ((instrumentsCheck as any).rows || []);
        const needsInstruments = instrumentRows.length > 0 && instrumentRows[0].disabled_count > 0;

        // Check if statement consumers are enabled
        const consumersCheck = await adapter.query<any>(`
            SELECT COUNT(*) as disabled_count
            FROM performance_schema.setup_consumers
            WHERE NAME LIKE '%statements%' AND ENABLED = 'NO'
        `);
        const consumerRows = Array.isArray(consumersCheck) ? consumersCheck : ((consumersCheck as any).rows || []);
        const needsConsumers = consumerRows.length > 0 && consumerRows[0].disabled_count > 0;

        // If configuration is needed, return configuration info (caller will handle UI)
        if (needsInstruments || needsConsumers) {
            const config = {
                needsInstruments,
                needsConsumers,
                instrumentCount: needsInstruments ? instrumentRows[0].disabled_count : 0,
                consumerCount: needsConsumers ? consumerRows[0].disabled_count : 0
            };
            throw new PerformanceSchemaConfigurationError(
                'Performance Schema is not fully configured',
                config
            );
        }
    }

    /**
     * Applies Performance Schema configuration
     * This method should only be called after user consent
     */
    async applyPerformanceSchemaConfiguration(adapter: IDatabaseAdapter): Promise<void> {
        this.logger.info('Applying Performance Schema configuration...');

        // Enable statement instrumentation
        await adapter.query(`
            UPDATE performance_schema.setup_instruments
            SET ENABLED = 'YES', TIMED = 'YES'
            WHERE NAME LIKE 'statement/%'
        `);

        // Enable statement consumers
        await adapter.query(`
            UPDATE performance_schema.setup_consumers
            SET ENABLED = 'YES'
            WHERE NAME LIKE '%statements%'
        `);

        this.logger.info('Performance Schema configuration applied successfully');
    }

    private async analyzeQuery(adapter: IDatabaseAdapter, row: any): Promise<QueryWithoutIndexInfo> {
        const countStar = parseInt(row.count_star || row.COUNT_STAR || 0);
        const sumRowsExamined = parseInt(row.sum_rows_examined || row.SUM_ROWS_EXAMINED || 0);
        const sumRowsSent = parseInt(row.sum_rows_sent || row.SUM_ROWS_SENT || 0);

        const avgRowsExamined = countStar > 0 ? sumRowsExamined / countStar : 0;
        const avgRowsSent = countStar > 0 ? sumRowsSent / countStar : 0;

        // Calculate efficiency (lower is worse)
        const efficiency = sumRowsExamined > 0 ? (sumRowsSent / sumRowsExamined) * 100 : 100;

        // Determine severity
        let severity: 'critical' | 'warning' | 'info' = 'info';
        // Use current configuration thresholds for categorization
        const cfg = (await import('vscode')).workspace.getConfiguration('mydba');
        const cfgMinAvg = cfg.get<number>('qwi.minAvgRowsExamined', 1000);
        const cfgMaxEff = cfg.get<number>('qwi.maxEfficiencyPercent', 10);
        if (avgRowsExamined > cfgMinAvg * 10 || efficiency < Math.min(1, cfgMaxEff / 10)) {
            severity = 'critical';
        } else if (avgRowsExamined > cfgMinAvg || efficiency < cfgMaxEff) {
            severity = 'warning';
        }

        // Suggest indexes
        const suggestedIndexes = await this.suggestIndexes(
            adapter,
            row.digest_text || row.DIGEST_TEXT || '',
            row.schema_name || row.SCHEMA_NAME || ''
        );

        return {
            digest: row.digest || row.DIGEST || '',
            digestText: row.digest_text || row.DIGEST_TEXT || '',
            schema: row.schema_name || row.SCHEMA_NAME || '',
            countStar,
            sumRowsExamined,
            sumRowsSent,
            firstSeen: new Date(row.first_seen || row.FIRST_SEEN),
            lastSeen: new Date(row.last_seen || row.LAST_SEEN),
            avgRowsExamined,
            avgRowsSent,
            efficiency,
            severity,
            suggestedIndexes
        };
    }

    private async suggestIndexes(adapter: IDatabaseAdapter, queryText: string, schemaName: string): Promise<string[]> {
        const suggestions: string[] = [];

        try {
            // Extract table names from query (simple regex-based)
            const tableMatches = queryText.match(/FROM\s+`?(\w+)`?/gi);
            const joinMatches = queryText.match(/JOIN\s+`?(\w+)`?/gi);
            const tables = new Set<string>();

            if (tableMatches) {
                tableMatches.forEach(match => {
                    const tableName = match.replace(/FROM\s+`?/i, '').replace(/`/g, '');
                    tables.add(tableName);
                });
            }

            if (joinMatches) {
                joinMatches.forEach(match => {
                    const tableName = match.replace(/JOIN\s+`?/i, '').replace(/`/g, '');
                    tables.add(tableName);
                });
            }

            // Extract WHERE clause columns
            const whereMatch = queryText.match(/WHERE\s+(.+?)(?:GROUP BY|ORDER BY|LIMIT|$)/i);
            if (whereMatch) {
                const whereClause = whereMatch[1];
                // Extract column names (simplified)
                const columnMatches = whereClause.match(/`?(\w+)`?\s*[=<>]/g);
                if (columnMatches) {
                    const columns = columnMatches.map(m => m.replace(/`/g, '').replace(/\s*[=<>]/, ''));

                    if (columns.length > 0) {
                        suggestions.push(`Consider adding index on: (${columns.join(', ')})`);
                    }
                }
            }

            // Extract ORDER BY columns
            const orderByMatch = queryText.match(/ORDER BY\s+(.+?)(?:LIMIT|$)/i);
            if (orderByMatch) {
                const orderByClause = orderByMatch[1];
                const columns = orderByClause.split(',').map(c => c.trim().replace(/`/g, '').replace(/\s+(ASC|DESC)$/i, ''));

                if (columns.length > 0) {
                    suggestions.push(`Consider adding index for ORDER BY: (${columns.join(', ')})`);
                }
            }

            // Extract JOIN conditions
            const onMatches = queryText.match(/ON\s+`?(\w+)`?\.`?(\w+)`?\s*=\s*`?(\w+)`?\.`?(\w+)`?/gi);
            if (onMatches) {
                onMatches.forEach(match => {
                    const parts = match.replace(/ON\s+/i, '').split('=');
                    if (parts.length === 2) {
                        const leftCol = parts[0].trim().split('.').pop()?.replace(/`/g, '');
                        const rightCol = parts[1].trim().split('.').pop()?.replace(/`/g, '');
                        if (leftCol) suggestions.push(`Consider adding index for JOIN: ${leftCol}`);
                        if (rightCol) suggestions.push(`Consider adding index for JOIN: ${rightCol}`);
                    }
                });
            }

            // If no specific suggestions, provide general advice
            if (suggestions.length === 0) {
                suggestions.push('Run EXPLAIN to identify which columns need indexing');
            }

        } catch (error) {
            this.logger.error('Failed to suggest indexes:', error as Error);
            suggestions.push('Unable to auto-suggest indexes - use EXPLAIN for details');
        }

        // Remove duplicates
        return [...new Set(suggestions)];
    }

    /**
     * Get index usage statistics for a schema
     */
    async getIndexUsageStats(adapter: IDatabaseAdapter, schemaName: string): Promise<any[]> {
        const query = `
            SELECT
                t.TABLE_SCHEMA as schema_name,
                t.TABLE_NAME as table_name,
                t.INDEX_NAME as index_name,
                t.COLUMN_NAME as column_name,
                t.SEQ_IN_INDEX as seq_in_index,
                t.NON_UNIQUE as non_unique,
                s.rows_examined
            FROM information_schema.STATISTICS t
            LEFT JOIN (
                SELECT
                    object_schema,
                    object_name,
                    index_name,
                    SUM(count_read) + SUM(count_write) + SUM(count_fetch) as rows_examined
                FROM performance_schema.table_io_waits_summary_by_index_usage
                WHERE object_schema = ?
                GROUP BY object_schema, object_name, index_name
            ) s ON t.TABLE_SCHEMA = s.object_schema
                AND t.TABLE_NAME = s.object_name
                AND t.INDEX_NAME = s.index_name
            WHERE t.TABLE_SCHEMA = ?
                AND t.INDEX_NAME != 'PRIMARY'
            ORDER BY t.TABLE_NAME, t.INDEX_NAME, t.SEQ_IN_INDEX
        `;

        const result = await adapter.query<any>(query, [schemaName, schemaName]);
        return Array.isArray(result) ? result : ((result as any).rows || []);
    }

    /**
     * Find duplicate indexes
     */
    async findDuplicateIndexes(adapter: IDatabaseAdapter, schemaName: string): Promise<any[]> {
        // Security: Validate schema name to prevent SQL injection
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName)) {
            throw new Error('Invalid schema name: only alphanumeric characters and underscores allowed');
        }

        const query = `
            SELECT
                TABLE_NAME as table_name,
                INDEX_NAME as index_name,
                GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as columns,
                COUNT(*) as column_count
            FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = ?
                AND INDEX_NAME != 'PRIMARY'
            GROUP BY TABLE_NAME, INDEX_NAME
            HAVING columns IN (
                SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX)
                FROM information_schema.STATISTICS
                WHERE TABLE_SCHEMA = ?
                    AND INDEX_NAME != 'PRIMARY'
                GROUP BY TABLE_NAME, INDEX_NAME
                HAVING COUNT(*) > 1
            )
            ORDER BY TABLE_NAME, columns
        `;

        const result = await adapter.query<any>(query, [schemaName, schemaName]);
        return Array.isArray(result) ? result : ((result as any).rows || []);
    }

    /**
     * Find unused indexes (indexes with no usage in Performance Schema)
     */
    async findUnusedIndexes(adapter: IDatabaseAdapter, schemaName: string): Promise<any[]> {
        // Security: Validate schema name to prevent SQL injection
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName)) {
            throw new Error('Invalid schema name: only alphanumeric characters and underscores allowed');
        }

        const query = `
            SELECT
                s.TABLE_NAME as table_name,
                s.INDEX_NAME as index_name,
                GROUP_CONCAT(s.COLUMN_NAME ORDER BY s.SEQ_IN_INDEX) as columns,
                COUNT(*) as column_count,
                s.INDEX_TYPE as index_type,
                s.CARDINALITY as cardinality
            FROM information_schema.STATISTICS s
            LEFT JOIN performance_schema.table_io_waits_summary_by_index_usage i
                ON s.TABLE_SCHEMA = i.object_schema
                AND s.TABLE_NAME = i.object_name
                AND s.INDEX_NAME = i.index_name
            WHERE s.TABLE_SCHEMA = ?
                AND s.INDEX_NAME != 'PRIMARY'
                AND (
                    i.count_read IS NULL
                    OR i.count_read = 0
                )
            GROUP BY s.TABLE_NAME, s.INDEX_NAME
            HAVING COUNT(*) > 0
            ORDER BY s.TABLE_NAME, s.INDEX_NAME
        `;

        const result = await adapter.query<any>(query, [schemaName]);
        return Array.isArray(result) ? result : ((result as any).rows || []);
    }
}
