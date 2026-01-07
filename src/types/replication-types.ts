/**
 * Replication Types
 * Type definitions for MySQL/MariaDB replication monitoring
 */

/**
 * Thread status for I/O and SQL threads
 */
export interface ThreadStatus {
    running: boolean;
    state: string;
    lastError?: string;
    lastErrorNumber?: number;
    lastErrorTimestamp?: Date;
}

/**
 * Replication error information
 */
export interface ReplicationError {
    errorNumber: number;
    errorMessage: string;
    timestamp: Date;
    threadType: 'io' | 'sql';
}

/**
 * GTID information
 */
export interface GTIDInfo {
    retrievedGtidSet: string;
    executedGtidSet: string;
    gtidMode: boolean;
    autoPosition: boolean;
}

/**
 * Binary log position information
 */
export interface BinlogPosition {
    masterLogFile: string;
    masterLogPos: number;
    relayLogFile: string;
    relayLogPos: number;
    relayMasterLogFile: string;
}

/**
 * Complete replication status
 */
export interface ReplicationStatus {
    timestamp: Date;
    version: string;
    replicaType: 'gtid' | 'binlog';

    // Connection info
    masterHost: string;
    masterPort: number;
    masterUser: string;

    // Thread status
    ioThread: ThreadStatus;
    sqlThread: ThreadStatus;

    // Lag information
    lagSeconds: number | null;

    // Position information
    binlogPosition?: BinlogPosition;
    gtidInfo?: GTIDInfo;

    // Errors
    lastIOError: ReplicationError | null;
    lastSQLError: ReplicationError | null;

    // Health assessment
    healthStatus: 'healthy' | 'warning' | 'critical' | 'unknown';

    // Additional metrics
    secondsBehindMaster: number | null;
    slaveIORunning: string; // Raw status from SHOW SLAVE STATUS
    slaveSQLRunning: string; // Raw status from SHOW SLAVE STATUS

    // MySQL 8.0+ fields
    replicaIORunning?: string;
    replicaSQLRunning?: string;
    sourceHost?: string;
    sourcePort?: number;
    sourceUser?: string;
}

/**
 * Replication health alert
 */
export interface ReplicationAlert {
    severity: 'info' | 'warning' | 'critical';
    metric: string;
    message: string;
    threshold?: number;
    currentValue?: number | string;
    recommendation?: string;
}

/**
 * Replication lag history entry
 */
export interface LagHistoryEntry {
    timestamp: Date;
    lagSeconds: number;
    ioRunning: boolean;
    sqlRunning: boolean;
}

/**
 * Replication control action result
 */
export interface ReplicationControlResult {
    success: boolean;
    action: 'start_io' | 'stop_io' | 'start_sql' | 'stop_sql';
    message: string;
    newStatus?: ReplicationStatus | null;
}

/**
 * Master/Primary status
 */
export interface MasterStatus {
    file: string;
    position: number;
    binlogDoDb: string;
    binlogIgnoreDb: string;
    executedGtidSet?: string;
}

/**
 * Connected replica information
 */
export interface ConnectedReplica {
    serverId: number;
    host: string;
    port: number;
    replicaUuid?: string;
    masterLogFile: string;
    readMasterLogPos: number;
    slaveIoRunning: string;
    slaveSqlRunning: string;
    secondsBehindMaster: number | null;
    lastIOError: string;
    lastSQLError: string;
}

/**
 * Server replication role
 */
export type ReplicationRole = 'master' | 'replica' | 'standalone' | 'both';

/**
 * Replication worker details from performance_schema
 */
export interface ReplicationWorker {
    workerId: number;
    channelName: string;
    threadId: number | null;
    serviceState: string;
    lastErrorNumber: number;
    lastErrorMessage: string;
    lastErrorTimestamp: Date | null;
    lastAppliedTransaction: string;
    lastAppliedTransactionOriginalCommitTimestamp: Date | null;
    lastAppliedTransactionImmediateCommitTimestamp: Date | null;
    lastAppliedTransactionStartApplyTimestamp: Date | null;
    lastAppliedTransactionEndApplyTimestamp: Date | null;
    applyingTransaction: string;
    applyingTransactionOriginalCommitTimestamp: Date | null;
    applyingTransactionImmediateCommitTimestamp: Date | null;
    applyingTransactionStartApplyTimestamp: Date | null;
}

/**
 * Topology node for visualization
 */
export interface TopologyNode {
    id: string;
    serverId: number;
    host: string;
    port: number;
    role: 'master' | 'replica';
    readOnly: boolean;
    lag: number | null;
    uuid?: string;
    binlogFile?: string;
    binlogPos?: number;
}
