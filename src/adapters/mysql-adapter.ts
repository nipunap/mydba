import * as vscode from 'vscode';
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
        private readonly logger: Logger
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
            const versionRow = rows as any[];
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
            const [rows] = await this.pool!.query<any[]>('SHOW DATABASES');
            return rows.map((row: any) => ({ name: row.Database }));

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
            throw new ValidationError(validation.error!, 'database');
        }

        try {
            const sql = `SHOW TABLE STATUS FROM \`${database}\``;
            const [rows] = await this.pool!.query<any[]>(sql);

            return rows.map((row: any) => ({
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
            throw new ValidationError(dbValidation.error!, 'database');
        }

        const tableValidation = InputValidator.validateDatabaseName(table); // Same rules as database
        if (!tableValidation.valid) {
            throw new ValidationError(tableValidation.error!, 'table');
        }

        try {
            // TODO: Real implementation
            // const columns = await this.getColumns(database, table);
            // const indexes = await this.getIndexes(database, table);
            // const foreignKeys = await this.getForeignKeys(database, table);

            // Mock data
            const columns: ColumnInfo[] = [
                { name: 'id', type: 'int(11)', nullable: false, defaultValue: null, key: 'PRI', extra: 'auto_increment' },
                { name: 'name', type: 'varchar(255)', nullable: false, defaultValue: null, key: '', extra: '' },
                { name: 'email', type: 'varchar(255)', nullable: true, defaultValue: null, key: 'UNI', extra: '' },
                { name: 'created_at', type: 'timestamp', nullable: false, defaultValue: 'CURRENT_TIMESTAMP', key: '', extra: '' }
            ];

            const indexes: IndexInfo[] = [
                { name: 'PRIMARY', columns: ['id'], unique: true, type: 'BTREE' },
                { name: 'idx_email', columns: ['email'], unique: true, type: 'BTREE' }
            ];

            return {
                columns,
                indexes,
                foreignKeys: [],
                rowEstimate: 1500
            };

        } catch (error) {
            this.logger.error(`Failed to get schema for ${database}.${table}:`, error as Error);
            throw new QueryError(`Failed to retrieve schema for ${table}`, `DESCRIBE ${table}`, error as Error);
        }
    }

    async query<T = unknown>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
        this.ensureConnected();

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
                throw new ValidationError(validation.error!, 'sql');
            }

            // Check for destructive queries
            const destructiveCheck = InputValidator.isDestructiveQuery(sql);
            if (destructiveCheck.destructive) {
                this.logger.warn(`Destructive query detected: ${destructiveCheck.reason}`);
                // Note: Actual confirmation would be handled at command level
            }
        }

        try {
            // Sanitize SQL for logging and escape % to avoid console formatter semantics
            const sanitizedSQL = DataSanitizer.sanitizeSQL(sql);
            const safeForConsole = sanitizedSQL.replace(/%/g, '%%');
            this.logger.info(`Executing query: ${DataSanitizer.truncate(safeForConsole, 200)}`);

            const [rows, fields] = await this.pool!.query(sql, params);

            // Convert mysql2 field info to our format
            const fieldInfo: FieldInfo[] = Array.isArray(fields) ? fields.map((f: any) => ({
                name: f.name,
                type: f.type
            })) : [];

            return {
                rows: rows as T[],
                fields: fieldInfo,
                affected: Array.isArray(rows) ? 0 : (rows as any).affectedRows || 0,
                insertId: Array.isArray(rows) ? 0 : (rows as any).insertId || 0
            };

        } catch (error) {
            this.logger.error('Query execution failed:', error as Error);
            throw new QueryError('Query execution failed', sql, error as Error);
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
            const [psConfig] = await this.pool!.query<any[]>(
                "SELECT @@global.performance_schema AS enabled"
            );
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
            const [rows] = await this.pool!.query<any[]>(query);
            this.logger.debug(`Retrieved ${(rows as any[]).length} processes`);

            // Import QueryAnonymizer for fingerprinting
            const { QueryAnonymizer } = await import('../utils/query-anonymizer');
            const anonymizer = new QueryAnonymizer();

            return (rows as any[]).map((row: any) => {
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
            const [rows] = await this.pool!.query<any[]>('SHOW FULL PROCESSLIST');
            this.logger.debug(`Retrieved ${(rows as any[]).length} processes`);

            return (rows as any[]).map((row: any) => ({
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
            const [rows] = await this.pool!.query<any[]>('SHOW GLOBAL VARIABLES');

            return rows.map((row: any) => ({
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
            const [rows] = await this.pool!.query<any[]>('SHOW SESSION VARIABLES');

            return rows.map((row: any) => ({
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
            const [rows] = await this.pool!.query<any[]>('SHOW GLOBAL STATUS');

            // Parse status variables into metrics
            const statusMap = new Map<string, string>();
            rows.forEach((row: any) => {
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
