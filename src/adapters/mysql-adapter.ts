import * as mysql from 'mysql2/promise';
import { Logger } from '../utils/logger';
import { DataSanitizer } from '../utils/data-sanitizer';
import { InputValidator } from '../utils/input-validator';
import {
    ConnectionConfig,
    DatabaseInfo,
    TableInfo,
    ColumnInfo,
    IndexInfo,
    TableSchema,
    QueryResult,
    FieldInfo,
    Process,
    Variable,
    Metrics,
    DatabaseFeatures,
    VersionRange,
    ConnectionTestResult,
    ConnectionError,
    QueryError,
    ValidationError
} from '../types';
import { EventBus, EVENTS, QueryResult as QueryResultEvent } from '../services/event-bus';
import { AuditLogger } from '../services/audit-logger';

/**
 * MySQL/MariaDB Database Adapter
 *
 * Provides database connectivity using mysql2/promise for MySQL 8.0+ and MariaDB 10.6+
 */
export class MySQLAdapter {
    public readonly type = 'mysql' as const;
    public readonly id: string;

    private pool: mysql.Pool | null = null;
    private isConnectedState: boolean = false;
    private versionString: string = '';
    private isMariaDBFlag: boolean = false;

    public readonly supportedVersions: VersionRange[] = [
        { min: '8.0.0', recommended: '8.0.35' },      // MySQL 8.0 LTS
        { min: '10.6.0', recommended: '10.11.0' }     // MariaDB 10.6 LTS
    ];

    public readonly features: DatabaseFeatures = {
        transactions: true,
        preparedStatements: true,
        storedProcedures: true,
        explain: true,
        profiling: true,
        processList: true,
        performanceSchema: true,
        optimizerTrace: true,
        replication: true,
        partitioning: true,
        fullTextSearch: true
    };

    constructor(
        private readonly config: ConnectionConfig,
        private readonly logger: Logger,
        private readonly eventBus?: EventBus,
        private readonly auditLogger?: AuditLogger
    ) {
        this.id = config.id;
    }

    get version(): string {
        return this.versionString;
    }

    get isMariaDB(): boolean {
        return this.isMariaDBFlag;
    }

    isConnected(): boolean {
        return this.isConnectedState;
    }

    async connect(config: ConnectionConfig): Promise<void> {
        this.logger.info(`Connecting to MySQL/MariaDB: ${config.host}:${config.port}`);

        try {
            // Create connection pool
            this.pool = mysql.createPool({
                host: config.host,
                port: config.port,
                user: config.user,
                password: config.password || '',
                database: config.database,
                connectionLimit: 10,
                queueLimit: 0,
                waitForConnections: true,
                enableKeepAlive: true,
                keepAliveInitialDelay: 10000,
                connectTimeout: 30000, // 30 seconds
                ssl: config.ssl ? {
                    ca: config.ssl.ca,
                    cert: config.ssl.cert,
                    key: config.ssl.key,
                    rejectUnauthorized: config.ssl.rejectUnauthorized !== false
                } : undefined
            });

            // Test the connection and get version
            const [rows] = await this.pool.query('SELECT VERSION() as version');
            const versionRow = rows as Array<{ version: string }>;
            this.versionString = versionRow[0]?.version || 'Unknown';

            // Detect if it's MariaDB
            this.isMariaDBFlag = this.versionString.toLowerCase().includes('mariadb');

            // Verify version is supported
            if (!this.isSupportedVersion(this.versionString)) {
                this.logger.warn(`Database version ${this.versionString} may not be fully supported`);
            }

            this.isConnectedState = true;
            const dbType = this.isMariaDBFlag ? 'MariaDB' : 'MySQL';
            this.logger.info(`Connected to ${dbType} ${this.versionString}`);

        } catch (error) {
            this.logger.error('Failed to connect to MySQL:', error as Error);

            // Clean up pool if connection failed
            if (this.pool) {
                await this.pool.end().catch(() => {/* ignore cleanup errors */});
                this.pool = null;
            }

            throw new ConnectionError(
                `Failed to connect to ${config.host}:${config.port}`,
                error as Error
            );
        }
    }

    async disconnect(): Promise<void> {
        this.logger.info(`Disconnecting from MySQL: ${this.config.name}`);

        try {
            if (this.pool) {
                await this.pool.end();
                this.pool = null;
            }

            this.isConnectedState = false;
            this.logger.info('Disconnected from MySQL');

        } catch (error) {
            this.logger.error('Error during disconnect:', error as Error);
            this.pool = null; // Force cleanup
            this.isConnectedState = false;
            throw new ConnectionError('Failed to disconnect cleanly', error as Error);
        }
    }

    async testConnection(): Promise<ConnectionTestResult> {
        try {
            await this.connect(this.config);
            return {
                success: true,
                version: this.version,
                features: this.features
            };
        } catch (error) {
            return {
                success: false,
                error: (error as Error).message
            };
        }
    }

    async getDatabases(): Promise<DatabaseInfo[]> {
        this.ensureConnected();

        try {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const [rows] = await this.pool!.query('SHOW DATABASES');
            return (rows as Array<{ Database: string }>).map((row) => ({ name: row.Database }));

        } catch (error) {
            this.logger.error('Failed to get databases:', error as Error);
            throw new QueryError('Failed to retrieve database list', 'SHOW DATABASES', error as Error);
        }
    }

    async getTables(database: string): Promise<TableInfo[]> {
        this.ensureConnected();

        // Validate database name
        const validation = InputValidator.validateDatabaseName(database);
        if (!validation.valid) {
            throw new ValidationError(validation.error ?? 'Invalid database name', 'database');
        }

        try {
            const sql = `SHOW TABLE STATUS FROM \`${database}\``;
            interface TableRow {
                Name: string;
                Engine?: string;
                Rows?: number;
                Data_length?: number;
                Index_length?: number;
                Collation?: string;
            }
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const [rows] = await this.pool!.query(sql) as [TableRow[], mysql.FieldPacket[]];

            return rows.map((row) => ({
                name: row.Name,
                engine: row.Engine,
                rows: row.Rows || 0,
                dataLength: row.Data_length,
                indexLength: row.Index_length,
                collation: row.Collation
            }));

        } catch (error) {
            this.logger.error(`Failed to get tables from ${database}:`, error as Error);
            throw new QueryError(`Failed to retrieve tables from ${database}`, `SHOW TABLES`, error as Error);
        }
    }

    async getTableSchema(database: string, table: string): Promise<TableSchema> {
        this.ensureConnected();

        // Validate inputs
        const dbValidation = InputValidator.validateDatabaseName(database);
        if (!dbValidation.valid) {
            throw new ValidationError(dbValidation.error ?? 'Invalid database name', 'database');
        }

        const tableValidation = InputValidator.validateDatabaseName(table); // Same rules as database
        if (!tableValidation.valid) {
            throw new ValidationError(tableValidation.error ?? 'Invalid table name', 'table');
        }

        try {
            this.logger.debug(`Fetching schema for ${database}.${table}`);

            // Get column information
            const columns = await this.getColumns(database, table);

            // Get index information
            const indexes = await this.getIndexes(database, table);

            // Get foreign key information
            const foreignKeys = await this.getForeignKeys(database, table);

            // Get row estimate
            const rowEstimate = await this.getRowEstimate(database, table);

            return {
                columns,
                indexes,
                foreignKeys,
                rowEstimate
            };

        } catch (error) {
            this.logger.error(`Failed to get schema for ${database}.${table}:`, error as Error);
            throw new QueryError(`Failed to retrieve schema for ${table}`, `INFORMATION_SCHEMA queries`, error as Error);
        }
    }

    /**
     * Get column information from INFORMATION_SCHEMA
     */
    private async getColumns(database: string, table: string): Promise<ColumnInfo[]> {
        const sql = `
            SELECT
                COLUMN_NAME as name,
                COLUMN_TYPE as type,
                IS_NULLABLE as nullable,
                COLUMN_DEFAULT as defaultValue,
                COLUMN_KEY as \`key\`,
                EXTRA as extra
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = ?
              AND TABLE_NAME = ?
            ORDER BY ORDINAL_POSITION
        `;

        interface ColumnRow {
            name: string;
            type: string;
            nullable: 'YES' | 'NO';
            defaultValue: string | null;
            key: string;
            extra: string;
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const [rows] = await this.pool!.query(sql, [database, table]) as [ColumnRow[], mysql.FieldPacket[]];

        return rows.map(row => ({
            name: row.name,
            type: row.type,
            nullable: row.nullable === 'YES',
            defaultValue: row.defaultValue,
            key: row.key,
            extra: row.extra
        }));
    }

    /**
     * Get index information from INFORMATION_SCHEMA
     */
    private async getIndexes(database: string, table: string): Promise<IndexInfo[]> {
        const sql = `
            SELECT
                INDEX_NAME as indexName,
                COLUMN_NAME as columnName,
                NON_UNIQUE as nonUnique,
                INDEX_TYPE as indexType,
                SEQ_IN_INDEX as seqInIndex
            FROM INFORMATION_SCHEMA.STATISTICS
            WHERE TABLE_SCHEMA = ?
              AND TABLE_NAME = ?
            ORDER BY INDEX_NAME, SEQ_IN_INDEX
        `;

        interface IndexRow {
            indexName: string;
            columnName: string;
            nonUnique: 0 | 1;
            indexType: string;
            seqInIndex: number;
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const [rows] = await this.pool!.query(sql, [database, table]) as [IndexRow[], mysql.FieldPacket[]];

        // Group columns by index name
        const indexMap = new Map<string, { columns: string[]; unique: boolean; type: string }>();

        for (const row of rows) {
            if (!indexMap.has(row.indexName)) {
                indexMap.set(row.indexName, {
                    columns: [],
                    unique: row.nonUnique === 0,
                    type: row.indexType
                });
            }
            const index = indexMap.get(row.indexName);
            if (index) {
                index.columns.push(row.columnName);
            }
        }

        // Convert to IndexInfo array
        return Array.from(indexMap.entries()).map(([name, info]) => ({
            name,
            columns: info.columns,
            unique: info.unique,
            type: this.normalizeIndexType(info.type)
        }));
    }

    /**
     * Normalize index type to type-safe value
     */
    private normalizeIndexType(type: string): 'BTREE' | 'HASH' | 'FULLTEXT' | 'SPATIAL' {
        const normalized = type.toUpperCase();
        if (normalized === 'BTREE' || normalized === 'HASH' || normalized === 'FULLTEXT' || normalized === 'SPATIAL') {
            return normalized;
        }
        return 'BTREE'; // Default fallback for unknown types
    }

    /**
     * Get foreign key information from INFORMATION_SCHEMA
     */
    private async getForeignKeys(database: string, table: string): Promise<Array<{
        name: string;
        columns: string[];
        referencedTable: string;
        referencedColumns: string[];
        onDelete: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
        onUpdate: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
    }>> {
        const sql = `
            SELECT
                kcu.CONSTRAINT_NAME as constraintName,
                kcu.COLUMN_NAME as columnName,
                kcu.REFERENCED_TABLE_NAME as referencedTable,
                kcu.REFERENCED_COLUMN_NAME as referencedColumn,
                rc.DELETE_RULE as deleteRule,
                rc.UPDATE_RULE as updateRule
            FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
            JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
                ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
                AND kcu.TABLE_SCHEMA = rc.CONSTRAINT_SCHEMA
            WHERE kcu.TABLE_SCHEMA = ?
              AND kcu.TABLE_NAME = ?
              AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
            ORDER BY kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
        `;

        interface ForeignKeyRow {
            constraintName: string;
            columnName: string;
            referencedTable: string;
            referencedColumn: string;
            deleteRule: string;
            updateRule: string;
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const [rows] = await this.pool!.query(sql, [database, table]) as [ForeignKeyRow[], mysql.FieldPacket[]];

        // Group by constraint name
        const fkMap = new Map<string, {
            columns: string[];
            referencedTable: string;
            referencedColumns: string[];
            onDelete: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
            onUpdate: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
        }>();

        for (const row of rows) {
            if (!fkMap.has(row.constraintName)) {
                fkMap.set(row.constraintName, {
                    columns: [],
                    referencedTable: row.referencedTable,
                    referencedColumns: [],
                    onDelete: this.normalizeReferentialAction(row.deleteRule),
                    onUpdate: this.normalizeReferentialAction(row.updateRule)
                });
            }
            const fk = fkMap.get(row.constraintName);
            if (fk) {
                fk.columns.push(row.columnName);
                fk.referencedColumns.push(row.referencedColumn);
            }
        }

        // Convert to foreign key array
        return Array.from(fkMap.entries()).map(([name, info]) => ({
            name,
            columns: info.columns,
            referencedTable: info.referencedTable,
            referencedColumns: info.referencedColumns,
            onDelete: info.onDelete,
            onUpdate: info.onUpdate
        }));
    }

    /**
     * Normalize referential action to type-safe value
     */
    private normalizeReferentialAction(action: string): 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION' {
        const normalized = action.toUpperCase();
        if (normalized === 'CASCADE' || normalized === 'SET NULL' || normalized === 'RESTRICT' || normalized === 'NO ACTION') {
            return normalized;
        }
        return 'RESTRICT'; // Default fallback
    }

    /**
     * Get estimated row count from INFORMATION_SCHEMA
     */
    private async getRowEstimate(database: string, table: string): Promise<number> {
        const sql = `
            SELECT TABLE_ROWS as rowCount
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_SCHEMA = ?
              AND TABLE_NAME = ?
        `;

        interface RowCountResult {
            rowCount: number | null;
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const [rows] = await this.pool!.query(sql, [database, table]) as [RowCountResult[], mysql.FieldPacket[]];

        return rows[0]?.rowCount ?? 0;
    }

    async query<T = unknown>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
        this.ensureConnected();

        // Track query start time for performance monitoring
        const queryStartTime = Date.now();

        // Check if this is a system/admin query (performance_schema, information_schema, SHOW, etc.)
        const isSystemQuery = this.isSystemQuery(sql);

        // DEBUG: Log what's happening
        const firstLine = sql.trim().split('\n')[0].substring(0, 80);
        this.logger.debug(`Query check: isSystemQuery=${isSystemQuery}, SQL: ${firstLine}`);

        // Only validate non-system queries
        if (!isSystemQuery) {
            // Validate query
            const validation = InputValidator.isParameterizedQuery(sql, params);
            if (!validation.valid) {
                this.logger.error(`Validation failed for SQL: ${sql.substring(0, 200)}`);
                this.logger.error(`Validation error: ${validation.error}`);
                throw new ValidationError(validation.error ?? 'Validation failed', 'sql');
            }

            // Check for destructive queries
            const destructiveCheck = InputValidator.isDestructiveQuery(sql);
            if (destructiveCheck.destructive) {
                this.logger.warn(`Destructive query detected: ${destructiveCheck.reason}`);

                // Log destructive operation to audit log
                if (this.auditLogger) {
                    await this.auditLogger.logDestructiveOperation(
                        this.config.id,
                        sql.substring(0, 500),
                        this.config.user,
                        { success: false } // Will be updated after execution
                    );
                }
                // Note: Actual confirmation would be handled at command level
            }
        }

        try {
            // Sanitize SQL for logging and escape % to avoid console formatter semantics
            const sanitizedSQL = DataSanitizer.sanitizeSQL(sql);
            const safeForConsole = sanitizedSQL.replace(/%/g, '%%');
            this.logger.info(`Executing query: ${DataSanitizer.truncate(safeForConsole, 200)}`);

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const [rows, fields] = await this.pool!.query(sql, params);

            // Calculate query duration
            const queryDuration = Date.now() - queryStartTime;

            // Log slow queries (>100ms)
            if (queryDuration > 100) {
                this.logger.warn(`Slow query detected: ${queryDuration}ms - ${DataSanitizer.truncate(safeForConsole, 100)}`);
            } else {
                this.logger.debug(`Query completed in ${queryDuration}ms`);
            }

            // Convert mysql2 field info to our format
            const fieldInfo: FieldInfo[] = Array.isArray(fields) ? (fields as mysql.FieldPacket[]).map((f) => ({
                name: f.name,
                type: String(f.type)
            })) : [];

            interface QueryResultPacket {
                affectedRows?: number;
                insertId?: number;
            }

            const result = {
                rows: rows as T[],
                fields: fieldInfo,
                affected: Array.isArray(rows) ? 0 : (rows as QueryResultPacket).affectedRows || 0,
                insertId: Array.isArray(rows) ? 0 : (rows as QueryResultPacket).insertId || 0
            };

            // Emit QUERY_EXECUTED event
            if (this.eventBus) {
                const eventData: QueryResultEvent = {
                    connectionId: this.config.id,
                    query: DataSanitizer.truncate(sanitizedSQL, 500),
                    duration: queryDuration,
                    rowsAffected: result.affected
                };
                this.eventBus.emit(EVENTS.QUERY_EXECUTED, eventData);
            }

            return result;

        } catch (error) {
            // Calculate duration even on error
            const queryDuration = Date.now() - queryStartTime;
            this.logger.error(`Query execution failed after ${queryDuration}ms:`, error as Error);

            // Emit QUERY_EXECUTED event with error
            if (this.eventBus) {
                const sanitizedSQL = DataSanitizer.sanitizeSQL(sql);
                const eventData: QueryResultEvent = {
                    connectionId: this.config.id,
                    query: DataSanitizer.truncate(sanitizedSQL, 500),
                    duration: queryDuration,
                    error: error as Error
                };
                this.eventBus.emit(EVENTS.QUERY_EXECUTED, eventData);
            }

            throw new QueryError('Query execution failed', sql, error as Error);
        }
    }

    /**
     * Execute a function with a single dedicated connection from the pool.
     * This ensures all queries within the function run on the same thread.
     * Useful for operations that need thread consistency (like profiling).
     */
    async withConnection<T>(fn: (conn: mysql.PoolConnection) => Promise<T>): Promise<T> {
        this.ensureConnected();

        let connection: mysql.PoolConnection | null = null;
        try {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            connection = await this.pool!.getConnection();
            this.logger.debug('Acquired dedicated connection from pool');

            // Ensure database is selected if configured
            if (this.config.database) {
                await connection.query(`USE \`${this.config.database}\``);
                this.logger.debug(`Selected database: ${this.config.database}`);
            }

            const result = await fn(connection);
            return result;
        } catch (error) {
            this.logger.error('Error in withConnection:', error as Error);
            throw error;
        } finally {
            if (connection) {
                connection.release();
                this.logger.debug('Released dedicated connection back to pool');
            }
        }
    }

    /**
     * Checks if a query is a system/admin query that should bypass validation
     */
    private isSystemQuery(sql: string): boolean {
        const normalizedSQL = sql.toLowerCase().trim();

        // Fast path: common administrative statements
        if (/^(show|describe|desc|explain|set|use)\b/.test(normalizedSQL)) {
            return true;
        }

        // Any SELECT that references system schemas (robust across newlines)
        if (/\bfrom\s+(information_schema|performance_schema|mysql|sys)\./.test(normalizedSQL)) {
            return true;
        }

        // Any UPDATE to system schemas (admin configuration)
        if (/\bupdate\s+(performance_schema|mysql)\./.test(normalizedSQL)) {
            return true;
        }

        return false;
    }

    async getProcessList(): Promise<Process[]> {
        this.ensureConnected();

        try {
            // First, check if Performance Schema is enabled
            interface PerformanceSchemaConfig {
                enabled: number;
            }
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const [psConfig] = await this.pool!.query(
                "SELECT @@global.performance_schema AS enabled"
            ) as [PerformanceSchemaConfig[], mysql.FieldPacket[]];
            const psEnabled = psConfig && psConfig[0]?.enabled === 1;

            if (!psEnabled) {
                // Fallback to basic processlist without transaction info
                this.logger.warn('Performance Schema disabled - transaction detection unavailable');
                return this.getBasicProcessList();
            }

            // Enhanced query with transaction detection
            const query = `
                SELECT
                    p.ID as id,
                    p.USER as user,
                    p.HOST as host,
                    p.DB as db,
                    p.COMMAND as command,
                    p.TIME as time,
                    p.STATE as state,
                    p.INFO as info,
                    t.THREAD_ID as threadId,
                    t.PROCESSLIST_STATE as threadState,
                    tc.TRX_ID as transactionId,
                    tc.TRX_STATE as transactionState,
                    tc.TRX_STARTED as transactionStarted
                FROM information_schema.PROCESSLIST p
                LEFT JOIN performance_schema.threads t
                    ON t.PROCESSLIST_ID = p.ID
                LEFT JOIN information_schema.INNODB_TRX tc
                    ON tc.trx_mysql_thread_id = p.ID
                WHERE p.ID != CONNECTION_ID()
                ORDER BY p.TIME DESC
            `;

            this.logger.debug('Executing enhanced processlist query with transaction detection');
            interface ProcessRow {
                id: number;
                user: string;
                host: string;
                db: string | null;
                command: string;
                time: number;
                state: string | null;
                info: string | null;
                threadId: number | null;
                threadState: string | null;
                transactionId: string | null;
                transactionState: string | null;
                transactionStarted: Date | null;
            }
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const [rows] = await this.pool!.query(query) as [ProcessRow[], mysql.FieldPacket[]];
            this.logger.debug(`Retrieved ${rows.length} processes`);

            // Import QueryAnonymizer for fingerprinting
            const { QueryAnonymizer } = await import('../utils/query-anonymizer');
            const anonymizer = new QueryAnonymizer();

            return rows.map((row) => {
                const inTransaction = !!row.transactionId;
                const queryText = row.info || '';

                return {
                    id: row.id,
                    user: row.user,
                    host: row.host,
                    db: row.db || null,
                    command: row.command,
                    time: row.time,
                    state: row.state || '',
                    info: queryText,
                    inTransaction,
                    transactionId: row.transactionId || undefined,
                    transactionState: row.transactionState || undefined,
                    transactionStarted: row.transactionStarted ? new Date(row.transactionStarted) : undefined,
                    autocommit: undefined, // Note: autocommit is a session variable, not available in INNODB_TRX
                    queryFingerprint: queryText ? anonymizer.fingerprint(queryText) : undefined
                };
            });

        } catch (error) {
            this.logger.error('Failed to get enhanced process list, falling back:', error as Error);
            // Fallback to basic processlist if enhanced query fails
            return this.getBasicProcessList();
        }
    }

    private async getBasicProcessList(): Promise<Process[]> {
        try {
            this.logger.debug('Executing SHOW FULL PROCESSLIST');
            interface BasicProcessRow {
                Id: number;
                User: string;
                Host: string;
                db?: string | null;
                DB?: string | null;
                Command: string;
                Time: number;
                State: string | null;
                Info: string | null;
            }
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const [rows] = await this.pool!.query('SHOW FULL PROCESSLIST') as [BasicProcessRow[], mysql.FieldPacket[]];
            this.logger.debug(`Retrieved ${rows.length} processes`);

            return rows.map((row) => ({
                id: row.Id,
                user: row.User,
                host: row.Host,
                db: row.db || row.DB || null,
                command: row.Command,
                time: row.Time,
                state: row.State || '',
                info: row.Info || null
            }));

        } catch (error) {
            this.logger.error('Failed to get basic process list:', error as Error);
            throw error;
        }
    }

    async getGlobalVariables(): Promise<Variable[]> {
        this.ensureConnected();

        try {
            interface VariableRow {
                Variable_name: string;
                Value: string;
            }
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const [rows] = await this.pool!.query('SHOW GLOBAL VARIABLES') as [VariableRow[], mysql.FieldPacket[]];

            return rows.map((row) => ({
                name: row.Variable_name,
                value: row.Value,
                scope: 'GLOBAL'
            }));

        } catch (error) {
            this.logger.error('Failed to get global variables:', error as Error);
            throw new QueryError('Failed to retrieve global variables', 'SHOW GLOBAL VARIABLES', error as Error);
        }
    }

    async getSessionVariables(): Promise<Variable[]> {
        this.ensureConnected();

        try {
            interface VariableRow {
                Variable_name: string;
                Value: string;
            }
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const [rows] = await this.pool!.query('SHOW SESSION VARIABLES') as [VariableRow[], mysql.FieldPacket[]];

            return rows.map((row) => ({
                name: row.Variable_name,
                value: row.Value,
                scope: 'SESSION'
            }));

        } catch (error) {
            this.logger.error('Failed to get session variables:', error as Error);
            throw new QueryError('Failed to retrieve session variables', 'SHOW SESSION VARIABLES', error as Error);
        }
    }

    async getMetrics(): Promise<Metrics> {
        this.ensureConnected();

        try {
            interface StatusRow {
                Variable_name: string;
                Value: string;
            }
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const [rows] = await this.pool!.query('SHOW GLOBAL STATUS') as [StatusRow[], mysql.FieldPacket[]];

            // Parse status variables into metrics
            const statusMap = new Map<string, string>();
            rows.forEach((row) => {
                statusMap.set(row.Variable_name, row.Value);
            });

            const connections = parseInt(statusMap.get('Threads_connected') || '0');
            const questions = parseInt(statusMap.get('Questions') || '0');
            const uptime = parseInt(statusMap.get('Uptime') || '0');
            const slowQueries = parseInt(statusMap.get('Slow_queries') || '0');

            return {
                connectionId: this.id,
                connections,
                threadsConnected: connections,
                threadsRunning: parseInt(statusMap.get('Threads_running') || '0'),
                questions,
                slowQueries,
                uptime
            };

        } catch (error) {
            this.logger.error('Failed to get metrics:', error as Error);
            throw new QueryError('Failed to retrieve metrics', 'SHOW STATUS', error as Error);
        }
    }

    async dispose(): Promise<void> {
        if (this.isConnected()) {
            await this.disconnect();
        }
    }

    // Private helper methods

    private ensureConnected(): void {
        if (!this.isConnectedState) {
            throw new ConnectionError('Not connected to database');
        }
        if (!this.pool) {
            throw new ConnectionError('Connection pool not initialized');
        }
    }

    private isSupportedVersion(version: string): boolean {
        // Extract major.minor version from version string
        const match = version.match(/^(\d+)\.(\d+)/);
        if (!match) {
            return false;
        }

        const [, major, minor] = match;
        const versionNum = parseFloat(`${major}.${minor}`);

        // Check against supported versions
        for (const range of this.supportedVersions) {
            const minMatch = range.min.match(/^(\d+)\.(\d+)/);
            if (!minMatch) {
                continue;
            }
            const minVersion = parseFloat(`${minMatch[1]}.${minMatch[2]}`);

            if (versionNum >= minVersion) {
                return true;
            }
        }

        return false;
    }
}
