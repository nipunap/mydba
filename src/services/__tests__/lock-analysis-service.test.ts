import { LockAnalysisService } from '../lock-analysis-service';
import type { ConnectionManager } from '../connection-manager';
import type { Logger } from '../../utils/logger';

describe('LockAnalysisService', () => {
    // Minimal adapter mock
    const makeCM = (rows: Array<Record<string, unknown>>) => ({
        getAdapter: () => ({
            query: async () => ({ rows })
        })
    });

    const logger: Pick<Logger, 'warn' | 'debug'> = { warn: jest.fn(), debug: jest.fn() } as unknown as Logger;

    it('maps performance_schema rows into LockInfo', async () => {
        const cm = makeCM([
            { processId: 123, lockObject: 'db.tbl', lockType: 'RECORD', lockMode: 'S', lockStatus: 'GRANTED' },
            { PROCESSID: 456, LOCKOBJECT: 'db2.tbl2', LOCKTYPE: 'TABLE', LOCKMODE: 'X', LOCKSTATUS: 'WAITING', BLOCKINGPROCESSID: 789 }
        ]) as unknown as ConnectionManager;
        const svc = new LockAnalysisService(cm, logger as Logger);
        const locks = await svc.getLocks('conn-1');
        expect(locks).toHaveLength(2);
        expect(locks[0]).toMatchObject({ processId: 123, isBlocked: false, isBlocking: false });
        expect(locks[1]).toMatchObject({ processId: 456, isBlocked: true, isBlocking: true, blockingProcessId: 789 });
    });

    it('returns cached results within TTL', async () => {
        const cm = makeCM([{ processId: 1 }]) as unknown as ConnectionManager;
        const svc = new LockAnalysisService(cm, logger as Logger);
        const first = await svc.getLocks('c1', 5000);
        const second = await svc.getLocks('c1', 5000);
        expect(first).toBe(second); // same array reference due to cache
    });
});
