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
    newStatus?: ReplicationStatus;
}
