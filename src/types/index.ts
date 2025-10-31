/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Core type definitions for MyDBA extension
 */

// ============================================================================
// Connection Types
// ============================================================================

export type DatabaseType = 'mysql' | 'mariadb' | 'postgresql' | 'redis' | 'valkey';
export type Environment = 'dev' | 'staging' | 'prod';
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface SSLConfig {
    ca?: string;
    cert?: string;
    key?: string;
    rejectUnauthorized?: boolean;
}

export interface SSHConfig {
    host: string;
    port: number;
    user: string;
    privateKey?: string;
    passphrase?: string;
}

export interface AWSIAMConfig {
    region: string;
    profile?: string;
}

export interface ConnectionConfig {
    id: string;
    name: string;
    type: DatabaseType;
    host: string;
    port: number;
    user: string;
    password?: string;
    database?: string;
    ssl?: SSLConfig;
    ssh?: SSHConfig;
    awsIamAuth?: AWSIAMConfig;
    environment: Environment;
}

export interface ConnectionTestResult {
    success: boolean;
    version?: string;
    features?: DatabaseFeatures;
    error?: string;
}

// ============================================================================
// Database Types
// ============================================================================

export interface DatabaseInfo {
    name: string;
    characterSet?: string;
    collation?: string;
    size?: number;
}

export interface TableInfo {
    name: string;
    engine?: string;
    rows?: number;
    dataLength?: number;
    indexLength?: number;
    autoIncrement?: number;
    createTime?: Date;
    updateTime?: Date;
}

export interface ColumnInfo {
    name: string;
    type: string;
    nullable: boolean;
    defaultValue: string | null;
    key: string;
    extra: string;
    comment?: string;
}

export interface IndexInfo {
    name: string;
    columns: string[];
    unique: boolean;
    type: 'BTREE' | 'HASH' | 'FULLTEXT' | 'SPATIAL';
    comment?: string;
}

export interface ForeignKeyInfo {
    name: string;
    columns: string[];
    referencedTable: string;
    referencedColumns: string[];
    onDelete: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
    onUpdate: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
}

export interface TableSchema {
    columns: ColumnInfo[];
    indexes: IndexInfo[];
    foreignKeys?: ForeignKeyInfo[];
    rowEstimate?: number;
}

// ============================================================================
// Query Types
// ============================================================================

export interface FieldInfo {
    name: string;
    type: string;
    length?: number;
}

export interface QueryResult<T = unknown> {
    rows?: T[];
    fields?: FieldInfo[];
    affected?: number;
    insertId?: number;
    result?: unknown; // For non-SELECT queries
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

export interface ProfileStage {
    Stage: string;
    Duration: number;
}

export interface ProfileResult {
    statement: string;
    source: string;
    totalDuration: number;
    stages: ProfileStage[];
}

export interface OptimizerTrace {
    source: string;
    trace: {
        steps: unknown[];
    };
}

// ============================================================================
// Process and Variables
// ============================================================================

export interface Process {
    id: number;
    user: string;
    host: string;
    db: string | null;
    command: string;
    time: number;
    state: string;
    info: string | null;
    inTransaction?: boolean;
    transactionId?: string;
    transactionState?: string;
    transactionStarted?: Date;
    autocommit?: boolean;
    queryFingerprint?: string;
}

export interface Variable {
    name: string;
    value: string;
    scope: 'GLOBAL' | 'SESSION';
}

// ============================================================================
// Metrics
// ============================================================================

export interface Metrics {
    connectionId: string;
    connections?: number;
    threadsConnected?: number;
    threadsRunning?: number;
    questions?: number;
    slowQueries?: number;
    uptime?: number;
}

// ============================================================================
// Features
// ============================================================================

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

export interface VersionRange {
    min: string;
    max?: string;
    recommended: string;
}

// ============================================================================
// Error Types
// ============================================================================

export enum ErrorSeverity {
    INFO = 'info',
    WARNING = 'warning',
    ERROR = 'error',
    CRITICAL = 'critical'
}

export class ApplicationError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly severity: ErrorSeverity,
        public readonly recoverable: boolean = true,
        public readonly cause?: Error
    ) {
        super(message);
        this.name = 'ApplicationError';
        Error.captureStackTrace(this, this.constructor);
    }
}

export class ConnectionError extends ApplicationError {
    constructor(message: string, cause?: Error) {
        super(message, 'CONNECTION_ERROR', ErrorSeverity.ERROR, true, cause);
        this.name = 'ConnectionError';
    }
}

export class ValidationError extends ApplicationError {
    constructor(message: string, public readonly field: string) {
        super(message, 'VALIDATION_ERROR', ErrorSeverity.WARNING, true);
        this.name = 'ValidationError';
    }
}

export class QueryError extends ApplicationError {
    constructor(
        message: string,
        public readonly query: string,
        cause?: Error
    ) {
        super(message, 'QUERY_ERROR', ErrorSeverity.ERROR, true, cause);
        this.name = 'QueryError';
    }
}

// ============================================================================
// Validation Types
// ============================================================================

export interface ValidationResult<T = any> {
    valid: boolean;
    value?: T;
    error?: string;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface ExtensionConfig {
    ai: {
        enabled: boolean;
        provider: 'github-copilot' | 'azure-openai' | 'custom';
        anonymizeData: boolean;
    };
    connections: {
        timeout: number;
        retryAttempts: number;
        retryDelay: number;
    };
    query: {
        defaultLimit: number;
        timeout: number;
    };
    security: {
        confirmDestructiveOperations: boolean;
        warnMissingWhereClause: boolean;
        dryRunMode: boolean;
    };
    telemetry: {
        enabled: boolean;
    };
}
