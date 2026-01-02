/**
 * InnoDB Status Service Tests
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { InnoDBStatusService } from '../innodb-status-service';
import { Logger } from '../../utils/logger';
import { EventBus } from '../event-bus';
import { IDatabaseAdapter } from '../../adapters/database-adapter';

describe('InnoDBStatusService', () => {
    let service: InnoDBStatusService;
    let mockLogger: jest.Mocked<Logger>;
    let mockEventBus: jest.Mocked<EventBus>;
    let mockAdapter: jest.Mocked<IDatabaseAdapter>;

    // Sample InnoDB status output for testing
    const sampleInnoDBStatus = `
=====================================
2024-01-15 10:30:45 0x7f8b4c0a1700 INNODB MONITOR OUTPUT
=====================================
Per second averages calculated from the last 60 seconds
-----------------
BACKGROUND THREAD
-----------------
srv_master_thread loops: 1234 srv_active, 0 srv_shutdown, 567890 srv_idle
srv_master_thread log flush and writes: 567890
----------
SEMAPHORES
----------
OS WAIT ARRAY INFO: reservation count 12345
OS WAIT ARRAY INFO: signal count 67890
RW-shared spins 0, rounds 234567, OS waits 8901
RW-excl spins 0, rounds 123456, OS waits 4567
RW-sx spins 0, rounds 0, OS waits 0
Spin rounds per wait: 234567.00 RW-shared, 123456.00 RW-excl, 0.00 RW-sx
------------
TRANSACTIONS
------------
Trx id counter 123456789
Purge done for trx's n:o < 123456780 undo n:o < 50000
History list length 150000
LIST OF TRANSACTIONS FOR EACH SESSION:
---TRANSACTION 421234567890123, not started
0 lock struct(s), heap size 1136, 0 row lock(s)
---TRANSACTION 421234567890124, ACTIVE 30 sec
mysql tables in use 1, locked 1
2 lock struct(s), heap size 1136, 1 row lock(s)
MySQL thread id 12345, OS thread handle 140242842601216, query id 67890 localhost root updating
UPDATE users SET status = 'active' WHERE id = 1
--------
FILE I/O
--------
I/O thread 0 state: waiting for completed aio requests (insert buffer thread)
I/O thread 1 state: waiting for completed aio requests (log thread)
I/O thread 2 state: waiting for completed aio requests (read thread)
I/O thread 3 state: waiting for completed aio requests (read thread)
I/O thread 4 state: waiting for completed aio requests (read thread)
I/O thread 5 state: waiting for completed aio requests (read thread)
I/O thread 6 state: waiting for completed aio requests (write thread)
I/O thread 7 state: waiting for completed aio requests (write thread)
I/O thread 8 state: waiting for completed aio requests (write thread)
I/O thread 9 state: waiting for completed aio requests (write thread)
Pending normal aio reads: 5, aio writes: 10, ibuf aio reads: 0, log i/o's: 0, sync i/o's: 0
Pending flushes (fsync) log: 0; buffer pool: 0
1234 OS file reads, 5678 OS file writes, 234 OS fsyncs
0.50 reads/s, 16384 avg bytes/read, 2.50 writes/s, 0.10 fsyncs/s
-------------------------------------
INSERT BUFFER AND ADAPTIVE HASH INDEX
-------------------------------------
Ibuf: size 1, free list len 0, seg size 2, 0 merges
merged operations:
 insert 0, delete mark 0, delete 0
discarded operations:
 insert 0, delete mark 0, delete 0
Hash table size 2267, node heap has 0 buffer(s)
Hash table size 2267, node heap has 0 buffer(s)
Hash table size 2267, node heap has 0 buffer(s)
Hash table size 2267, node heap has 0 buffer(s)
0.00 hash searches/s, 0.00 non-hash searches/s
---
LOG
---
Log sequence number 1234567890
Log flushed up to   1234567800
Pages flushed up to 1234567700
Last checkpoint at  1234567600
0 pending log flushes, 0 pending chkp writes
123 log i/o's done, 0.50 log i/o's/second
----------------------
BUFFER POOL AND MEMORY
----------------------
Total large memory allocated 137428992
Dictionary memory allocated 123456
Buffer pool size   8192
Free buffers       1024
Database pages     7000
Old database pages 2580
Modified db pages  500
Pending reads      0
Pending writes: LRU 0, flush list 0, single page 0
Pages made young 1234, not young 5678
0.10 youngs/s, 0.20 non-youngs/s
Pages read 12345, created 234, written 5678
0.50 reads/s, 0.01 creates/s, 2.30 writes/s
Buffer pool hit rate 980 / 1000, young-making rate 0 / 1000 not 2 / 1000
Pages read ahead 0.00/s, evicted without access 0.00/s, Random read ahead 0.00/s
LRU len: 7000, unzip_LRU len: 0
I/O sum[0]:cur[0], unzip sum[0]:cur[0]
--------------
ROW OPERATIONS
--------------
0 queries inside InnoDB, 0 queries in queue
0 read views open inside InnoDB
Process ID=12345, Main thread ID=140242842601216, state: sleeping
Number of rows inserted 1234, updated 567, deleted 89, read 123456
0.50 inserts/s, 0.20 updates/s, 0.05 deletes/s, 5.00 reads/s
----------------------------
END OF INNODB MONITOR OUTPUT
============================
`;

    const sampleDeadlockStatus = `
=====================================
2024-01-15 10:30:45 0x7f8b4c0a1700 INNODB MONITOR OUTPUT
=====================================
------------------------
LATEST DETECTED DEADLOCK
------------------------
2024-01-15 10:25:30 0x7f8b4c0a1700
*** (1) TRANSACTION:
TRANSACTION 421234567890100, ACTIVE 5 sec starting index read
mysql tables in use 1, locked 1
LOCK WAIT 3 lock struct(s), heap size 1136, 2 row lock(s)
MySQL thread id 100, OS thread handle 140242842601216, query id 1000 localhost root updating
UPDATE accounts SET balance = balance - 100 WHERE id = 1
*** (1) WAITING FOR THIS LOCK TO BE GRANTED:
RECORD LOCKS space id 2 page no 3 n bits 72 index PRIMARY of table test.accounts trx id 421234567890100 lock_mode X locks rec but not gap waiting
*** (2) TRANSACTION:
TRANSACTION 421234567890101, ACTIVE 3 sec starting index read
mysql tables in use 1, locked 1
4 lock struct(s), heap size 1136, 3 row lock(s)
MySQL thread id 101, OS thread handle 140242842601217, query id 1001 localhost root updating
UPDATE accounts SET balance = balance + 100 WHERE id = 2
*** (2) HOLDS THE LOCK(S):
RECORD LOCKS space id 2 page no 3 n bits 72 index PRIMARY of table test.accounts trx id 421234567890101 lock_mode X locks rec but not gap
*** (2) WAITING FOR THIS LOCK TO BE GRANTED:
RECORD LOCKS space id 2 page no 4 n bits 72 index PRIMARY of table test.accounts trx id 421234567890101 lock_mode X locks rec but not gap waiting
*** WE ROLL BACK TRANSACTION (1)
------------
TRANSACTIONS
------------
Trx id counter 123456789
Purge done for trx's n:o < 123456780 undo n:o < 50000
History list length 150000
--------
FILE I/O
--------
Pending normal aio reads: 0, aio writes: 0
---
LOG
---
Log sequence number 1234567890
Last checkpoint at  1234567600
----------------------
BUFFER POOL AND MEMORY
----------------------
Total large memory allocated 137428992
Buffer pool size   8192
Free buffers       1024
Database pages     7000
Modified db pages  500
Buffer pool hit rate 980 / 1000
--------------
ROW OPERATIONS
--------------
0 queries inside InnoDB, 0 queries in queue
Number of rows inserted 0, updated 0, deleted 0, read 0
0.00 inserts/s, 0.00 updates/s, 0.00 deletes/s, 0.00 reads/s
----------------------------
END OF INNODB MONITOR OUTPUT
============================
`;

    beforeEach(() => {
        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        } as any;

        mockEventBus = {
            emit: jest.fn(),
            on: jest.fn(),
            off: jest.fn()
        } as any;

        mockAdapter = {
            query: jest.fn(),
            connect: jest.fn(),
            disconnect: jest.fn()
        } as any;

        service = new InnoDBStatusService(mockLogger, mockEventBus);
    });

    describe('getInnoDBStatus', () => {
        it('should parse InnoDB status successfully', async () => {
            mockAdapter.query
                .mockResolvedValueOnce([{ Status: sampleInnoDBStatus }])
                .mockResolvedValueOnce([{ version: '8.0.35' }]);

            const status = await service.getInnoDBStatus('conn-1', mockAdapter);

            expect(status).toBeDefined();
            expect(status.version).toBe('8.0.35');
            expect(status.transactions.historyListLength).toBe(150000);
            expect(status.bufferPool.totalSize).toBeGreaterThan(0);
            expect(status.healthScore).toBeGreaterThanOrEqual(0);
            expect(status.healthScore).toBeLessThanOrEqual(100);
        });

        it('should cache status results', async () => {
            mockAdapter.query
                .mockResolvedValueOnce([{ Status: sampleInnoDBStatus }])
                .mockResolvedValueOnce([{ version: '8.0.35' }]);

            // First call
            await service.getInnoDBStatus('conn-1', mockAdapter);

            // Second call should use cache
            await service.getInnoDBStatus('conn-1', mockAdapter);

            // Should only call adapter once (cached second time)
            expect(mockAdapter.query).toHaveBeenCalledTimes(2); // SHOW ENGINE + SELECT VERSION
        });

        it('should emit event after fetching status', async () => {
            mockAdapter.query
                .mockResolvedValueOnce([{ Status: sampleInnoDBStatus }])
                .mockResolvedValueOnce([{ version: '8.0.35' }]);

            await service.getInnoDBStatus('conn-1', mockAdapter);

            expect(mockEventBus.emit).toHaveBeenCalledWith(
                'INNODB_STATUS_FETCHED',
                expect.objectContaining({
                    connectionId: 'conn-1'
                }),
                expect.anything()
            );
        });

        it('should handle errors gracefully', async () => {
            mockAdapter.query.mockRejectedValueOnce(new Error('Connection failed'));

            await expect(
                service.getInnoDBStatus('conn-1', mockAdapter)
            ).rejects.toThrow('Connection failed');

            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should handle missing status data', async () => {
            mockAdapter.query.mockResolvedValueOnce([]);

            await expect(
                service.getInnoDBStatus('conn-1', mockAdapter)
            ).rejects.toThrow('No InnoDB status data returned');
        });
    });

    describe('calculateHealthScore', () => {
        it('should return 100 for perfect health', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const status: any = {
                transactions: {
                    historyListLength: 1000,
                    purgeLag: 100
                },
                bufferPool: {
                    hitRate: 99
                },
                log: {
                    checkpointAgePercent: 50
                },
                io: {
                    pendingReads: 5,
                    pendingWrites: 5
                },
                semaphores: {
                    longSemaphoreWaits: []
                }
            };

            const score = service.calculateHealthScore(status);
            expect(score).toBe(100);
        });

        it('should penalize high transaction history', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const status: any = {
                transactions: {
                    historyListLength: 2000000, // Critical
                    purgeLag: 100
                },
                bufferPool: {
                    hitRate: 99
                },
                log: {
                    checkpointAgePercent: 50
                },
                io: {
                    pendingReads: 5,
                    pendingWrites: 5
                },
                semaphores: {
                    longSemaphoreWaits: []
                }
            };

            const score = service.calculateHealthScore(status);
            expect(score).toBeLessThan(100);
            expect(score).toBeGreaterThanOrEqual(0);
        });

        it('should penalize low buffer pool hit rate', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const status: any = {
                transactions: {
                    historyListLength: 1000,
                    purgeLag: 100
                },
                bufferPool: {
                    hitRate: 85 // Critical
                },
                log: {
                    checkpointAgePercent: 50
                },
                io: {
                    pendingReads: 5,
                    pendingWrites: 5
                },
                semaphores: {
                    longSemaphoreWaits: []
                }
            };

            const score = service.calculateHealthScore(status);
            expect(score).toBeLessThan(80);
        });

        it('should not return negative scores', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const status: any = {
                transactions: {
                    historyListLength: 5000000, // Critical
                    purgeLag: 2000000 // High
                },
                bufferPool: {
                    hitRate: 80 // Critical
                },
                log: {
                    checkpointAgePercent: 90 // Critical
                },
                io: {
                    pendingReads: 200,
                    pendingWrites: 200 // High
                },
                semaphores: {
                    longSemaphoreWaits: [
                        { threadId: 1, waitTime: 300, waitType: 'mutex', location: 'test' }
                    ]
                }
            };

            const score = service.calculateHealthScore(status);
            expect(score).toBeGreaterThanOrEqual(0);
        });
    });

    describe('getHealthAlerts', () => {
        it('should return no alerts for healthy status', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const status: any = {
                transactions: {
                    historyListLength: 1000,
                    purgeLag: 100
                },
                bufferPool: {
                    hitRate: 99
                },
                log: {
                    checkpointAgePercent: 50
                },
                io: {
                    pendingReads: 5,
                    pendingWrites: 5
                },
                semaphores: {
                    longSemaphoreWaits: []
                }
            };

            const alerts = service.getHealthAlerts(status);
            expect(alerts).toHaveLength(0);
        });

        it('should return critical alert for high transaction history', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const status: any = {
                transactions: {
                    historyListLength: 2000000,
                    purgeLag: 100
                },
                bufferPool: {
                    hitRate: 99
                },
                log: {
                    checkpointAgePercent: 50
                },
                io: {
                    pendingReads: 5,
                    pendingWrites: 5
                },
                semaphores: {
                    longSemaphoreWaits: []
                }
            };

            const alerts = service.getHealthAlerts(status);
            expect(alerts.length).toBeGreaterThan(0);
            expect(alerts[0].severity).toBe('critical');
            expect(alerts[0].metric).toBe('transaction_history_length');
            expect(alerts[0].recommendation).toBeDefined();
        });

        it('should return warning alert for low buffer pool hit rate', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const status: any = {
                transactions: {
                    historyListLength: 1000,
                    purgeLag: 100
                },
                bufferPool: {
                    hitRate: 92
                },
                log: {
                    checkpointAgePercent: 50
                },
                io: {
                    pendingReads: 5,
                    pendingWrites: 5
                },
                semaphores: {
                    longSemaphoreWaits: []
                }
            };

            const alerts = service.getHealthAlerts(status);
            expect(alerts.length).toBeGreaterThan(0);
            const bufferPoolAlert = alerts.find(a => a.metric === 'buffer_pool_hit_rate');
            expect(bufferPoolAlert).toBeDefined();
            expect(bufferPoolAlert?.severity).toBe('warning');
        });
    });

    describe('compareSnapshots', () => {
        it('should calculate deltas correctly', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const before: any = {
                transactions: { historyListLength: 100000 },
                bufferPool: { hitRate: 95, dirtyPages: 100 },
                log: { checkpointAgePercent: 60 },
                healthScore: 90
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const after: any = {
                transactions: { historyListLength: 150000 },
                bufferPool: { hitRate: 92, dirtyPages: 200 },
                log: { checkpointAgePercent: 70 },
                healthScore: 85
            };

            const comparison = service.compareSnapshots(before, after);

            expect(comparison.deltas).toBeDefined();
            expect(comparison.deltas.length).toBeGreaterThan(0);

            const historyDelta = comparison.deltas.find(d => d.metric === 'Transaction History Length');
            expect(historyDelta?.change).toBe(50000);
            expect(historyDelta?.changePercent).toBeCloseTo(50, 1);
        });

        it('should identify significant changes', () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const before: any = {
                transactions: { historyListLength: 100000 },
                bufferPool: { hitRate: 95, dirtyPages: 100 },
                log: { checkpointAgePercent: 60 },
                healthScore: 90
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const after: any = {
                transactions: { historyListLength: 200000 }, // 100% increase
                bufferPool: { hitRate: 80, dirtyPages: 500 }, // Large increase
                log: { checkpointAgePercent: 85 },
                healthScore: 70
            };

            const comparison = service.compareSnapshots(before, after);

            expect(comparison.significantChanges.length).toBeGreaterThan(0);
            expect(comparison.significantChanges.some(c => c.includes('Transaction History'))).toBe(true);
        });
    });

    describe('cache management', () => {
        it('should clear cache for specific connection', async () => {
            mockAdapter.query
                .mockResolvedValue([{ Status: sampleInnoDBStatus }])
                .mockResolvedValue([{ version: '8.0.35' }]);

            await service.getInnoDBStatus('conn-1', mockAdapter);
            service.clearCache('conn-1');

            // Next call should not use cache
            await service.getInnoDBStatus('conn-1', mockAdapter);

            // Should call adapter twice (no cache)
            expect(mockAdapter.query).toHaveBeenCalled();
        });

        it('should clear all caches', async () => {
            mockAdapter.query
                .mockResolvedValue([{ Status: sampleInnoDBStatus }])
                .mockResolvedValue([{ version: '8.0.35' }]);

            await service.getInnoDBStatus('conn-1', mockAdapter);
            await service.getInnoDBStatus('conn-2', mockAdapter);

            service.clearAllCaches();

            // Both should require new queries
            await service.getInnoDBStatus('conn-1', mockAdapter);
            await service.getInnoDBStatus('conn-2', mockAdapter);
        });
    });

    describe('deadlock parsing', () => {
        it('should parse deadlock information', async () => {
            mockAdapter.query
                .mockResolvedValueOnce([{ Status: sampleDeadlockStatus }])
                .mockResolvedValueOnce([{ version: '8.0.35' }]);

            const status = await service.getInnoDBStatus('conn-1', mockAdapter);

            expect(status.deadlocks.latestDeadlock).toBeDefined();
            expect(status.deadlocks.latestDeadlock?.transactions.length).toBeGreaterThan(0);
            expect(status.deadlocks.latestDeadlock?.victim).toBeDefined();
        });
    });
});
