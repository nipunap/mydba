/**
 * Storage Engine Status Types
 * Type definitions for InnoDB and Aria storage engine status monitoring
 */

/**
 * Transaction section from InnoDB status
 */
export interface TransactionSection {
    historyListLength: number;
    activeTransactions: number;
    purgeLag: number;
    oldestActiveTransactionAge?: number;
    transactionStates: {
        active: number;
        prepared: number;
        committed: number;
    };
}

/**
 * Deadlock information
 */
export interface DeadlockInfo {
    timestamp: Date;
    transactions: DeadlockTransaction[];
    victim: string; // Transaction ID of the victim
}

export interface DeadlockTransaction {
    id: string;
    query: string;
    locksHeld: LockInfo[];
    locksWaiting: LockInfo[];
}

export interface LockInfo {
    table: string;
    index?: string;
    lockMode: string;
    lockType: string;
}

/**
 * Deadlock section from InnoDB status
 */
export interface DeadlockSection {
    latestDeadlock: DeadlockInfo | null;
    deadlockCount: number;
}

/**
 * Buffer Pool section from InnoDB status
 */
export interface BufferPoolSection {
    totalSize: number; // in pages
    freePages: number;
    databasePages: number;
    dirtyPages: number;
    modifiedDbPages: number;
    hitRate: number; // percentage
    readsFromDisk: number;
    readsFromCache: number;
    pendingReads: number;
    pendingWrites: number;
    lruListLength: number;
    flushListLength: number;
}

/**
 * I/O Operations section from InnoDB status
 */
export interface IOSection {
    pendingReads: number;
    pendingWrites: number;
    pendingFsyncs: number;
    readsPerSecond: number;
    writesPerSecond: number;
    fsyncsPerSecond: number;
    avgIOWaitTime: number; // milliseconds
    ioThreads: IOThreadInfo[];
}

export interface IOThreadInfo {
    id: number;
    type: 'read' | 'write' | 'log' | 'insert_buffer';
    state: string;
}

/**
 * Log (Redo Log) section from InnoDB status
 */
export interface LogSection {
    logSequenceNumber: number;
    lastCheckpointLSN: number;
    checkpointAge: number;
    checkpointAgePercent: number; // percentage of max log file size
    logBufferSize: number;
    logBufferUsed: number;
    logWritesPerSecond: number;
    logFsyncsPerSecond: number;
    pendingLogWrites: number;
}

/**
 * Row Operations section from InnoDB status
 */
export interface RowOperationsSection {
    insertsPerSecond: number;
    updatesPerSecond: number;
    deletesPerSecond: number;
    readsPerSecond: number;
    queriesInside: number;
    queriesQueued: number;
}

/**
 * Semaphores section from InnoDB status
 */
export interface SemaphoreSection {
    mutexWaits: number;
    mutexSpinRounds: number;
    mutexOSWaits: number;
    rwLockWaits: number;
    rwLockSpinRounds: number;
    rwLockOSWaits: number;
    longSemaphoreWaits: SemaphoreWait[];
}

export interface SemaphoreWait {
    threadId: number;
    waitTime: number; // seconds
    waitType: string;
    location: string;
}

/**
 * Complete InnoDB Status
 */
export interface InnoDBStatus {
    timestamp: Date;
    version: string;
    uptime: number; // seconds
    transactions: TransactionSection;
    deadlocks: DeadlockSection;
    bufferPool: BufferPoolSection;
    io: IOSection;
    log: LogSection;
    rowOps: RowOperationsSection;
    semaphores: SemaphoreSection;
    healthScore: number; // 0-100
}

/**
 * Aria Storage Engine Status (MariaDB)
 */

export interface AriaPageCache {
    size: number;
    used: number;
    hitRate: number;
    readsFromDisk: number;
    readsFromCache: number;
}

export interface AriaRecoveryLog {
    size: number;
    used: number;
    checkpointInterval: number;
}

export interface AriaStatus {
    timestamp: Date;
    version: string;
    pageCache: AriaPageCache;
    recoveryLog: AriaRecoveryLog;
    readBufferSize: number;
    writeBufferSize: number;
    crashRecoveryStatus: 'clean' | 'recovering' | 'error';
    healthScore: number; // 0-100
}

/**
 * Health Alert
 */
export interface HealthAlert {
    severity: 'info' | 'warning' | 'critical';
    metric: string;
    message: string;
    threshold?: number;
    currentValue?: number;
    recommendation?: string;
}

/**
 * Snapshot comparison result
 */
export interface StatusComparison {
    before: InnoDBStatus | AriaStatus;
    after: InnoDBStatus | AriaStatus;
    deltas: {
        metric: string;
        before: number;
        after: number;
        change: number;
        changePercent: number;
    }[];
    significantChanges: string[];
}
