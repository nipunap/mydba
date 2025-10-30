import { ConnectionConfig, ConnectionTestResult } from '../services/connection-manager';

export enum DatabaseType {
    MYSQL = 'mysql',
    MARIADB = 'mariadb',
    POSTGRESQL = 'postgresql',
    REDIS = 'redis',
    VALKEY = 'valkey'
}

export interface VersionRange {
    min: string;
    max?: string;
    recommended: string;
}

export interface DatabaseFeatures {
    transactions: boolean;
    preparedStatements: boolean;
    storedProcedures: boolean;
    explain: boolean;
    profiling: boolean;
    processList: boolean;
    performanceSchema: boolean;
    optimizerTrace: boolean;
    replication: boolean;
    partitioning: boolean;
    fullTextSearch: boolean;
}

export interface ExecuteResult {
    affected: number;
    insertId?: number;
    result?: unknown;
}

export interface ExplainResult {
    id: number;
    selectType: string;
    table: string;
    partitions?: string;
    type: string;
    possibleKeys?: string;
    key?: string;
    keyLen?: number;
    ref?: string;
    rows: number;
    filtered?: number;
    extra?: string;
    children?: ExplainResult[];
}

export interface ProfileResult {
    statement: string;
    stages: Array<{
        Stage: string;
        Duration: number;
    }>;
    totalDuration: number;
    source: string;
}

export interface OptimizerTrace {
    trace: unknown;
    source: string;
}

export interface Process {
    id: number;
    user: string;
    host: string;
    db?: string;
    command: string;
    time: number;
    state?: string;
    info?: string;
}

export interface Variable {
    name: string;
    value: string;
    scope: 'GLOBAL' | 'SESSION';
}

export interface Metrics {
    timestamp: number;
    connectionId: string;
    queriesPerSecond: number;
    slowQueries: number;
    activeConnections: number;
    maxConnections: number;
    hotTables: TableMetric[];
    bufferPoolHitRate?: number;
    rowsRead?: number;
    rowsInserted?: number;
}

export interface TableMetric {
    database: string;
    table: string;
    rowsRead: number;
    rowsInserted: number;
    rowsUpdated: number;
    rowsDeleted: number;
}

export interface Database {
    name: string;
    charset?: string;
    collation?: string;
}

export interface Table {
    name: string;
    engine?: string;
    rows?: number;
    dataLength?: number;
    indexLength?: number;
    comment?: string;
}

export interface TableSchema {
    columns: Column[];
    indexes: Index[];
    foreignKeys: ForeignKey[];
    rowEstimate: number;
}

export interface Column {
    name: string;
    type: string;
    nullable: boolean;
    defaultValue?: unknown;
    key?: string;
    extra?: string;
    comment?: string;
}

export interface Index {
    name: string;
    columns: string[];
    unique: boolean;
    type: string;
    cardinality?: number;
}

export interface ForeignKey {
    name: string;
    column: string;
    referencedTable: string;
    referencedColumn: string;
    onDelete?: string;
    onUpdate?: string;
}

export interface Transaction {
    commit(): Promise<void>;
    rollback(): Promise<void>;
}

export interface IDatabaseAdapter {
    readonly type: DatabaseType;
    readonly version: string;
    readonly supportedVersions: VersionRange[];
    readonly features: DatabaseFeatures;

    connect(config: ConnectionConfig): Promise<void>;
    disconnect(): Promise<void>;
    testConnection(): Promise<ConnectionTestResult>;
    isConnected(): boolean;

    query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
    execute(sql: string, params?: unknown[]): Promise<ExecuteResult>;
    beginTransaction(): Promise<Transaction>;

    getDatabases(): Promise<Database[]>;
    getTables(database: string): Promise<Table[]>;
    getTableSchema(database: string, table: string): Promise<TableSchema>;
    getIndexes(database: string, table: string): Promise<Index[]>;

    explain?(sql: string): Promise<ExplainResult>;
    profile?(sql: string): Promise<ProfileResult>;
    getOptimizerTrace?(sql: string): Promise<OptimizerTrace>;
    getProcessList?(): Promise<Process[]>;
    getVariables?(): Promise<Variable[]>;
    getMetrics?(): Promise<Metrics>;

    dispose(): Promise<void>;
}
