# Database Adapter Architecture ARD

**Document Type**: Architecture Requirement Document (ARD)
**Version**: 1.0
**Last Updated**: October 25, 2025
**Status**: Approved for Implementation
**Related**: 01-SYSTEM_ARCHITECTURE.md

---

## 1. Overview

### 1.1 Purpose

Define the pluggable database adapter architecture enabling MyDBA to support multiple database types (MySQL, MariaDB, PostgreSQL, Redis, Valkey) through a unified interface while accommodating database-specific features.

### 1.2 Scope

- Adapter interface contract
- MySQL/MariaDB adapter implementation (Phase 1)
- PostgreSQL/Redis/Valkey adapters (Phase 3)
- Version detection and feature gating
- Performance Schema integration patterns
- Error handling and retries

### 1.3 Design Goals

1. **Abstraction**: Hide database-specific implementation details
2. **Extensibility**: Easy to add new database types
3. **Type Safety**: Strong TypeScript contracts
4. **Feature Parity**: Common operations work across all databases
5. **Graceful Degradation**: Handle missing features elegantly

---

## 2. Adapter Interface

### 2.1 Core Interface

```typescript
/**
 * Base interface for all database adapters.
 * Defines common operations supported across database types.
 */
interface IDatabaseAdapter extends IDisposable {
  // Metadata
  readonly type: DatabaseType;
  readonly version: string;
  readonly supportedVersions: VersionRange[];
  readonly features: DatabaseFeatures;

  // Connection lifecycle
  connect(config: ConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  testConnection(): Promise<ConnectionTestResult>;
  isConnected(): boolean;

  // Query execution
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  execute(sql: string, params?: any[]): Promise<ExecuteResult>;
  beginTransaction(): Promise<Transaction>;

  // Metadata operations
  getDatabases(): Promise<Database[]>;
  getTables(database: string): Promise<Table[]>;
  getTableSchema(database: string, table: string): Promise<TableSchema>;
  getIndexes(database: string, table: string): Promise<Index[]>;

  // Performance operations (optional)
  explain?(sql: string): Promise<ExplainResult>;
  profile?(sql: string): Promise<ProfileResult>;
  getProcessList?(): Promise<Process[]>;
  getVariables?(): Promise<Variable[]>;
  getMetrics?(): Promise<Metrics>;
}
```

### 2.2 Database Types

```typescript
enum DatabaseType {
  MYSQL = 'mysql',
  MARIADB = 'mariadb',
  POSTGRESQL = 'postgresql',
  REDIS = 'redis',
  VALKEY = 'valkey'
}

type VersionRange = {
  min: string;
  max?: string;
  recommended: string;
};
```

### 2.3 Feature Flags

```typescript
interface DatabaseFeatures {
  // Core features
  transactions: boolean;
  preparedStatements: boolean;
  storedProcedures: boolean;

  // Performance features
  explain: boolean;
  profiling: boolean;
  processList: boolean;
  performanceSchema: boolean;

  // Advanced features
  optimizerTrace: boolean;
  replication: boolean;
  partitioning: boolean;
  fullTextSearch: boolean;
}

// Example: MySQL 8.0 features
const MYSQL_8_FEATURES: DatabaseFeatures = {
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
```

---

## 3. MySQL/MariaDB Adapter (Phase 1)

### 3.1 Implementation

```typescript
/**
 * MySQL/MariaDB adapter using mysql2 driver.
 * Supports MySQL 8.0+, 8.4, 9.x and MariaDB 10.6 LTS, 10.11 LTS, 11.x+
 */
class MySQLAdapter implements IDatabaseAdapter {
  readonly type = DatabaseType.MYSQL;
  private connection?: Connection;
  private pool?: Pool;
  private _version?: string;
  private _isMariaDB?: boolean;

  constructor(
    private config: ConnectionConfig,
    private logger: ILogger
  ) {}

  async connect(config: ConnectionConfig): Promise<void> {
    // 1. Create connection pool
    this.pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: await this.getPassword(config),
      database: config.database,
      ssl: config.ssl,
      connectTimeout: config.timeout || 10000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000
    });

    // 2. Test connection
    const conn = await this.pool.getConnection();

    // 3. Detect version
    const [rows] = await conn.query('SELECT VERSION() as version');
    this._version = rows[0].version;
    this._isMariaDB = this._version.toLowerCase().includes('mariadb');

    // 4. Validate version
    if (!this.isSupportedVersion(this._version)) {
      throw new UnsupportedVersionError(this._version, this.supportedVersions);
    }

    // 5. Configure Performance Schema (if available)
    await this.configurePerformanceSchema(conn);

    conn.release();
  }

  private async configurePerformanceSchema(conn: Connection): Promise<void> {
    try {
      // Enable statement and stage instrumentation
      await conn.query(`
        UPDATE performance_schema.setup_instruments
        SET ENABLED = 'YES', TIMED = 'YES'
        WHERE NAME LIKE '%statement/%' OR NAME LIKE '%stage/%'
      `);

      await conn.query(`
        UPDATE performance_schema.setup_consumers
        SET ENABLED = 'YES'
        WHERE NAME LIKE '%events_statements_%' OR NAME LIKE '%events_stages_%'
      `);

      this.logger.info('Performance Schema configured for profiling');
    } catch (error) {
      this.logger.warn('Failed to configure Performance Schema', error);
      // Non-fatal: profiling will be disabled
    }
  }

  async profile(sql: string): Promise<ProfileResult> {
    if (!this.features.profiling) {
      throw new FeatureNotSupportedError('profiling', this.type, this.version);
    }

    const conn = await this.pool!.getConnection();
    try {
      // 1. Execute query
      const startTime = Date.now();
      await conn.query(sql);
      const duration = Date.now() - startTime;

      // 2. Get statement EVENT_ID from performance_schema
      const [stmtRows] = await conn.query<any[]>(`
        SELECT EVENT_ID, SQL_TEXT, TIMER_WAIT, LOCK_TIME,
               ROWS_EXAMINED, ROWS_SENT, CREATED_TMP_TABLES
        FROM performance_schema.events_statements_history_long
        WHERE SQL_TEXT LIKE ?
        ORDER BY EVENT_ID DESC
        LIMIT 1
      `, [`%${sql.substring(0, 50)}%`]);

      if (stmtRows.length === 0) {
        throw new Error('Statement not found in performance_schema');
      }

      const eventId = stmtRows[0].EVENT_ID;

      // 3. Get stage breakdown using NESTING_EVENT_ID
      const [stageRows] = await conn.query<any[]>(`
        SELECT event_name AS Stage,
               TRUNCATE(TIMER_WAIT/1000000000000, 6) AS Duration
        FROM performance_schema.events_stages_history_long
        WHERE NESTING_EVENT_ID = ?
        ORDER BY EVENT_ID
      `, [eventId]);

      return {
        statement: stmtRows[0],
        stages: stageRows,
        totalDuration: duration,
        source: 'performance_schema'
      };
    } finally {
      conn.release();
    }
  }

  get supportedVersions(): VersionRange[] {
    return [
      { min: '8.0.0', recommended: '8.0.35' },
      { min: '8.4.0', recommended: '8.4.0' },
      { min: '9.0.0', recommended: '9.0.0' },
      // MariaDB
      { min: '10.6.0', recommended: '10.6.18' },
      { min: '10.11.0', recommended: '10.11.8' },
      { min: '11.0.0', recommended: '11.4.2' }
    ];
  }

  get features(): DatabaseFeatures {
    return {
      ...MYSQL_8_FEATURES,
      // MariaDB-specific adjustments
      optimizerTrace: !this._isMariaDB || this.versionAtLeast('10.6')
    };
  }
}
```

### 3.2 Connection Configuration

```typescript
interface MySQLConnectionConfig extends ConnectionConfig {
  // SSL/TLS
  ssl?: {
    rejectUnauthorized: boolean;
    ca?: string;
    cert?: string;
    key?: string;
  };

  // SSH Tunnel
  ssh?: {
    host: string;
    port: number;
    user: string;
    privateKey?: string;
    passphrase?: string;
  };

  // AWS RDS IAM
  awsIAM?: {
    region: string;
    enableIAM: boolean;
    credentialProvider?: 'env' | 'profile' | 'iam-role' | 'sso';
  };

  // Connection pooling
  pool?: {
    min: number;
    max: number;
    acquireTimeout: number;
    idleTimeout: number;
  };
}
```

### 3.3 AWS RDS IAM Authentication

```typescript
class MySQLAdapter implements IDatabaseAdapter {
  private async getPassword(config: MySQLConnectionConfig): Promise<string> {
    // Standard password auth
    if (!config.awsIAM?.enableIAM) {
      return config.password || '';
    }

    // AWS RDS IAM token generation
    const { RDSClient, GetAuthTokenCommand } = await import('@aws-sdk/client-rds');
    const { fromEnv, fromIni, fromInstanceMetadata } = await import('@aws-sdk/credential-providers');

    const credentialProvider = this.getAWSCredentialProvider(config.awsIAM.credentialProvider);
    const client = new RDSClient({ region: config.awsIAM.region, credentials: credentialProvider });

    const token = await client.send(new GetAuthTokenCommand({
      hostname: config.host,
      port: config.port,
      username: config.user
    }));

    this.logger.info('Generated AWS RDS IAM auth token');
    return token;
  }

  private getAWSCredentialProvider(type?: string) {
    switch (type) {
      case 'env': return fromEnv();
      case 'profile': return fromIni();
      case 'iam-role': return fromInstanceMetadata();
      default: return fromEnv(); // default
    }
  }
}
```

---

## 4. Adapter Registry

### 4.1 Registry Interface

```typescript
interface IAdapterRegistry {
  // Registration
  register(type: DatabaseType, factory: AdapterFactory): void;
  unregister(type: DatabaseType): void;

  // Creation
  create(type: DatabaseType, config: ConnectionConfig): IDatabaseAdapter;

  // Discovery
  getSupportedTypes(): DatabaseType[];
  getFeatures(type: DatabaseType): DatabaseFeatures;
  isSupported(type: DatabaseType): boolean;
}

type AdapterFactory = (config: ConnectionConfig, logger: ILogger) => IDatabaseAdapter;
```

### 4.2 Implementation

```typescript
class AdapterRegistry implements IAdapterRegistry {
  private factories = new Map<DatabaseType, AdapterFactory>();

  constructor(private logger: ILogger) {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    // Phase 1: MySQL/MariaDB only
    this.register(DatabaseType.MYSQL, (config, logger) =>
      new MySQLAdapter(config, logger)
    );
    this.register(DatabaseType.MARIADB, (config, logger) =>
      new MySQLAdapter(config, logger) // Same adapter
    );
  }

  register(type: DatabaseType, factory: AdapterFactory): void {
    if (this.factories.has(type)) {
      this.logger.warn(`Overwriting existing adapter factory for ${type}`);
    }
    this.factories.set(type, factory);
  }

  create(type: DatabaseType, config: ConnectionConfig): IDatabaseAdapter {
    const factory = this.factories.get(type);
    if (!factory) {
      throw new AdapterNotFoundError(type);
    }
    return factory(config, this.logger);
  }

  getSupportedTypes(): DatabaseType[] {
    return Array.from(this.factories.keys());
  }
}
```

---

## 5. Error Handling

### 5.1 Adapter-Specific Errors

```typescript
class AdapterError extends MyDBAError {
  constructor(
    message: string,
    public adapterType: DatabaseType,
    public originalError?: Error
  ) {
    super(message, ErrorCategory.ADAPTER, 'ADAPTER_ERROR', true);
  }
}

class UnsupportedVersionError extends AdapterError {
  constructor(version: string, supported: VersionRange[]) {
    super(
      `Unsupported database version: ${version}. Supported versions: ${JSON.stringify(supported)}`,
      DatabaseType.MYSQL
    );
  }
}

class FeatureNotSupportedError extends AdapterError {
  constructor(feature: string, type: DatabaseType, version: string) {
    super(
      `Feature '${feature}' not supported on ${type} ${version}`,
      type
    );
  }
}
```

### 5.2 Connection Error Mapping

```typescript
class MySQLAdapter implements IDatabaseAdapter {
  private mapError(error: any): MyDBAError {
    // MySQL error codes
    const errorMap: Record<string, { category: ErrorCategory; recoverable: boolean }> = {
      'ECONNREFUSED': { category: ErrorCategory.CONNECTION, recoverable: true },
      'ER_ACCESS_DENIED_ERROR': { category: ErrorCategory.AUTHENTICATION, recoverable: false },
      'ER_BAD_DB_ERROR': { category: ErrorCategory.CONNECTION, recoverable: false },
      'ER_DBACCESS_DENIED_ERROR': { category: ErrorCategory.PERMISSION, recoverable: false },
      'ETIMEDOUT': { category: ErrorCategory.TIMEOUT, recoverable: true },
      'PROTOCOL_CONNECTION_LOST': { category: ErrorCategory.CONNECTION, recoverable: true }
    };

    const mapped = errorMap[error.code];
    if (mapped) {
      return new MyDBAError(
        this.getUserFriendlyMessage(error),
        mapped.category,
        error.code,
        mapped.recoverable,
        { errno: error.errno, sqlMessage: error.sqlMessage }
      );
    }

    return new MyDBAError(error.message, ErrorCategory.UNKNOWN, error.code, false);
  }

  private getUserFriendlyMessage(error: any): string {
    switch (error.code) {
      case 'ECONNREFUSED':
        return `Cannot connect to database at ${this.config.host}:${this.config.port}. Please check if the server is running.`;
      case 'ER_ACCESS_DENIED_ERROR':
        return `Access denied for user '${this.config.user}'. Please check credentials.`;
      case 'ER_BAD_DB_ERROR':
        return `Database '${this.config.database}' does not exist.`;
      case 'ETIMEDOUT':
        return `Connection timeout. Server may be slow or unreachable.`;
      default:
        return error.message;
    }
  }
}
```

---

## 6. Testing Strategy

### 6.1 Unit Tests (Mock Adapter)

```typescript
class MockMySQLAdapter implements IDatabaseAdapter {
  type = DatabaseType.MYSQL;
  version = '8.0.35';
  connected = false;

  // Stub implementations
  async connect() { this.connected = true; }
  async disconnect() { this.connected = false; }
  async query<T>(sql: string): Promise<T[]> {
    return mockQueryResult as T[];
  }
  // ... other methods
}
```

### 6.2 Integration Tests (Docker)

```typescript
describe('MySQLAdapter Integration', () => {
  let adapter: MySQLAdapter;

  beforeAll(async () => {
    // Start MySQL 8.0 container
    await dockerComposeUp('mysql-8.0');

    adapter = new MySQLAdapter({
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: 'test_password',
      database: 'test_db'
    }, logger);
  });

  it('should connect and detect version', async () => {
    await adapter.connect();
    expect(adapter.version).toMatch(/^8\.0\./);
    expect(adapter.isConnected()).toBe(true);
  });

  it('should execute queries with profiling', async () => {
    const result = await adapter.profile('SELECT * FROM users LIMIT 10');
    expect(result.stages).toBeDefined();
    expect(result.stages.length).toBeGreaterThan(0);
  });

  afterAll(async () => {
    await adapter.disconnect();
    await dockerComposeDown('mysql-8.0');
  });
});
```

---

## 7. Future Adapters (Phase 3)

### 7.1 PostgreSQL Adapter

```typescript
class PostgreSQLAdapter implements IDatabaseAdapter {
  type = DatabaseType.POSTGRESQL;

  async explain(sql: string): Promise<ExplainResult> {
    // Use EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    const [result] = await this.query(`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}
    `);
    return this.parsePostgreSQLExplain(result);
  }

  async profile(sql: string): Promise<ProfileResult> {
    // Use pg_stat_statements
    await this.query(`SELECT pg_stat_statements_reset()`);
    await this.query(sql);
    const [stats] = await this.query(`
      SELECT * FROM pg_stat_statements
      WHERE query LIKE $1
      ORDER BY queryid DESC LIMIT 1
    `, [sql]);
    return this.parsePostgreSQLStats(stats);
  }
}
```

### 7.2 Redis Adapter

```typescript
class RedisAdapter implements IDatabaseAdapter {
  type = DatabaseType.REDIS;

  // Redis doesn't have SQL, so query() is not applicable
  async execute(command: string, args?: any[]): Promise<ExecuteResult> {
    // Use ioredis client
    const result = await this.client.call(command, ...args);
    return { affected: 0, result };
  }

  async profile(command: string): Promise<ProfileResult> {
    // Use SLOWLOG GET
    const slowlog = await this.client.slowlog('GET', 10);
    return this.parseRedisSlowlog(slowlog);
  }
}
```

---

## 8. Performance Considerations

### 8.1 Connection Pooling

- **Pool size**: 5-10 connections per database
- **Idle timeout**: 5 minutes
- **Acquire timeout**: 10 seconds
- **Validation**: Test on acquire with `SELECT 1`

### 8.2 Query Result Streaming

For large result sets (> 1000 rows):

```typescript
interface IDatabaseAdapter {
  stream?(sql: string): AsyncIterable<Row>;
}

// Usage
for await (const row of adapter.stream('SELECT * FROM large_table')) {
  // Process row without loading all into memory
}
```

### 8.3 Prepared Statement Caching

```typescript
class MySQLAdapter {
  private preparedCache = new LRUCache<string, PreparedStatement>(50);

  async query<T>(sql: string, params?: any[]): Promise<T[]> {
    if (params && params.length > 0) {
      const cached = this.preparedCache.get(sql);
      if (cached) {
        return cached.execute(params);
      }

      const prepared = await this.connection.prepare(sql);
      this.preparedCache.set(sql, prepared);
      return prepared.execute(params);
    }

    return this.connection.query(sql);
  }
}
```

---

## 9. Approval

**Reviewed By**:
- [ ] Lead Architect
- [ ] Database Engineer
- [ ] Backend Engineer

**Status**: Draft → **Approved**

**Next Steps**:
1. Implement MySQLAdapter
2. Write adapter integration tests
3. Document adapter extension guide

---

**Document Version**: 1.0
**Last Updated**: October 25, 2025
**Next Review**: Post-MVP (Week 25)
