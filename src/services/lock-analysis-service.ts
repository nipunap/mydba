import { Logger } from '../utils/logger';
import { ConnectionManager } from './connection-manager';

interface LockInfo {
    processId: number;
    lockObject?: string;
    lockType?: string;
    lockMode?: string;
    lockStatus?: string;
    isBlocked: boolean;
    isBlocking: boolean;
    blockingProcessId?: number;
}

/**
 * LockAnalysisService
 *
 * Provides best-effort lock information from performance_schema (preferred) or legacy INFORMATION_SCHEMA views.
 * Includes simple in-memory TTL caching to avoid thrashing.
 */
export class LockAnalysisService {
    private cache = new Map<string, { at: number; data: LockInfo[] }>();

    constructor(
        private connectionManager: ConnectionManager,
        private logger: Logger
    ) {}

    async getLocks(connectionId: string, ttlMs: number = 1500): Promise<LockInfo[]> {
        const now = Date.now();
        const cached = this.cache.get(connectionId);
        if (cached && now - cached.at < ttlMs) {
            return cached.data;
        }

        const adapter = this.connectionManager.getAdapter(connectionId);
        if (!adapter) {
            return [];
        }

        try {
            const psQuery = `
                SELECT
                    t.trx_mysql_thread_id AS processId,
                    l.OBJECT_NAME AS lockObject,
                    l.LOCK_TYPE AS lockType,
                    l.LOCK_MODE AS lockMode,
                    l.LOCK_STATUS AS lockStatus,
                    t2.trx_mysql_thread_id AS blockingProcessId
                FROM performance_schema.data_locks l
                INNER JOIN information_schema.INNODB_TRX t
                    ON t.trx_id = l.ENGINE_TRANSACTION_ID
                LEFT JOIN performance_schema.data_lock_waits w
                    ON l.ENGINE_LOCK_ID = w.REQUESTED_LOCK_ID
                LEFT JOIN information_schema.INNODB_TRX t2
                    ON t2.trx_id = w.BLOCKING_ENGINE_TRANSACTION_ID
                WHERE t.trx_mysql_thread_id IS NOT NULL
            `;
            const res = await adapter.query(psQuery);
            const rows = (res.rows || []) as Array<Record<string, unknown>>;
            const data = rows.map((r) => {
                const processId = Number(r['processId'] ?? r['PROCESSID']);
                const lockStatus = String(r['lockStatus'] ?? r['LOCKSTATUS'] ?? '');
                const blockingProcessIdRaw = r['blockingProcessId'] ?? r['BLOCKINGPROCESSID'];
                const blockingProcessId = blockingProcessIdRaw != null ? Number(blockingProcessIdRaw) : undefined;
                return {
                    processId,
                    lockObject: (r['lockObject'] ?? r['LOCKOBJECT']) as string | undefined,
                    lockType: (r['lockType'] ?? r['LOCKTYPE']) as string | undefined,
                    lockMode: (r['lockMode'] ?? r['LOCKMODE']) as string | undefined,
                    lockStatus,
                    isBlocked: lockStatus === 'WAITING',
                    isBlocking: !!blockingProcessId,
                    blockingProcessId
                } as LockInfo;
            });

            this.cache.set(connectionId, { at: now, data });
            return data;
        } catch {
            this.logger.warn('LockAnalysisService: performance_schema query failed, falling back to INFORMATION_SCHEMA');
            try {
                const legacyQuery = `
                    SELECT
                        t.trx_mysql_thread_id AS processId,
                        l.lock_table AS lockObject,
                        l.lock_type AS lockType,
                        l.lock_mode AS lockMode,
                        'GRANTED' AS lockStatus,
                        t2.trx_mysql_thread_id AS blockingProcessId
                    FROM INFORMATION_SCHEMA.INNODB_LOCKS l
                    INNER JOIN INFORMATION_SCHEMA.INNODB_TRX t
                        ON t.trx_id = l.lock_trx_id
                    LEFT JOIN INFORMATION_SCHEMA.INNODB_LOCK_WAITS w
                        ON l.lock_id = w.requested_lock_id
                    LEFT JOIN INFORMATION_SCHEMA.INNODB_TRX t2
                        ON t2.trx_id = w.blocking_trx_id
                    WHERE t.trx_mysql_thread_id IS NOT NULL
                `;
                const res = await adapter.query(legacyQuery);
                const rows = (res.rows || []) as Array<Record<string, unknown>>;
                const data = rows.map((r) => {
                    const processId = Number(r['processId'] ?? r['PROCESSID']);
                    const blockingProcessIdRaw = r['blockingProcessId'] ?? r['BLOCKINGPROCESSID'];
                    const blockingProcessId = blockingProcessIdRaw != null ? Number(blockingProcessIdRaw) : undefined;
                    return {
                        processId,
                        lockObject: (r['lockObject'] ?? r['LOCKOBJECT']) as string | undefined,
                        lockType: (r['lockType'] ?? r['LOCKTYPE']) as string | undefined,
                        lockMode: (r['lockMode'] ?? r['LOCKMODE']) as string | undefined,
                        lockStatus: (r['lockStatus'] ?? r['LOCKSTATUS']) as string | undefined,
                        isBlocked: false,
                        isBlocking: !!blockingProcessId,
                        blockingProcessId
                    } as LockInfo;
                });
                this.cache.set(connectionId, { at: now, data });
                return data;
            } catch {
                this.logger.warn('LockAnalysisService: unable to retrieve lock information (no performance_schema/INNODB_* views available)');
                this.cache.set(connectionId, { at: now, data: [] });
                return [];
            }
        }
    }
}
