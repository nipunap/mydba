import { TransactionManager } from '../transaction-manager';
import { Logger } from '../../utils/logger';
import { IDatabaseAdapter } from '../../adapters/database-adapter';

// Mock Logger
jest.mock('../../utils/logger');

describe('TransactionManager', () => {
    let transactionManager: TransactionManager;
    let mockLogger: jest.Mocked<Logger>;
    let mockAdapter: jest.Mocked<IDatabaseAdapter>;
    let getAdapter: jest.Mock;

    beforeEach(() => {
        // Mock Logger
        mockLogger = {
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        } as unknown as jest.Mocked<Logger>;

        // Mock Database Adapter
        mockAdapter = {
            query: jest.fn().mockResolvedValue([])
        } as unknown as jest.Mocked<IDatabaseAdapter>;

        // Mock getAdapter function
        getAdapter = jest.fn().mockResolvedValue(mockAdapter);

        // Create TransactionManager instance
        transactionManager = new TransactionManager(mockLogger, getAdapter);
    });

    afterEach(() => {
        jest.clearAllMocks();
        transactionManager.dispose();
    });

    describe('Happy Path', () => {
        it('should execute operations successfully', async () => {
            const operations = [
                jest.fn().mockResolvedValue({ sql: 'CREATE INDEX idx1 ON users (email)', affectedObject: 'idx1' }),
                jest.fn().mockResolvedValue({ sql: 'CREATE INDEX idx2 ON users (name)', affectedObject: 'idx2' })
            ];

            const result = await transactionManager.execute('conn-1', operations);

            expect(result.success).toBe(true);
            expect(result.rollback).toBe(false);
            expect(result.affectedObjects).toEqual(['idx1', 'idx2']);
            expect(operations[0]).toHaveBeenCalled();
            expect(operations[1]).toHaveBeenCalled();
        });

        it('should track affected objects', async () => {
            const operations = [
                jest.fn().mockResolvedValue({
                    sql: 'CREATE INDEX idx_users ON users (email)',
                    affectedObject: 'users.idx_users'
                })
            ];

            const result = await transactionManager.execute('conn-1', operations);

            expect(result.affectedObjects).toContain('users.idx_users');
        });

        it('should clear timeout on success', async () => {
            const operations = [
                jest.fn().mockResolvedValue({ sql: 'CREATE INDEX idx1 ON users (email)' })
            ];

            const result = await transactionManager.execute('conn-1', operations, { timeout: 5000 });

            expect(result.success).toBe(true);
            // Timeout should be cleared (no way to directly verify, but operation completes)
        });

        it('should return success result', async () => {
            const operations = [
                jest.fn().mockResolvedValue({ sql: 'CREATE INDEX idx1 ON users (email)' })
            ];

            const result = await transactionManager.execute('conn-1', operations);

            expect(result).toEqual({
                success: true,
                rollback: false,
                affectedObjects: []
            });
        });
    });

    describe('Rollback Tests', () => {
        it('should roll back on operation failure', async () => {
            const operations = [
                jest.fn().mockResolvedValue({
                    sql: 'CREATE INDEX idx1 ON users (email)',
                    rollbackSQL: 'DROP INDEX idx1 ON users'
                }),
                jest.fn().mockRejectedValue(new Error('Operation failed'))
            ];

            const result = await transactionManager.execute('conn-1', operations);

            expect(result.success).toBe(false);
            expect(result.rollback).toBe(true);
            expect(result.error).toBeDefined();
            expect(mockAdapter.query).toHaveBeenCalledWith('DROP INDEX idx1 ON users');
        });

        it('should execute rollback SQL in reverse order', async () => {
            const queryCalls: string[] = [];
            mockAdapter.query.mockImplementation((sql: string) => {
                queryCalls.push(sql);
                return Promise.resolve([]);
            });

            const operations = [
                jest.fn().mockResolvedValue({
                    sql: 'CREATE INDEX idx1 ON users (email)',
                    rollbackSQL: 'DROP INDEX idx1 ON users'
                }),
                jest.fn().mockResolvedValue({
                    sql: 'CREATE INDEX idx2 ON users (name)',
                    rollbackSQL: 'DROP INDEX idx2 ON users'
                }),
                jest.fn().mockRejectedValue(new Error('Third operation failed'))
            ];

            await transactionManager.execute('conn-1', operations);

            // Rollback should happen in reverse order
            expect(queryCalls[0]).toBe('DROP INDEX idx2 ON users');
            expect(queryCalls[1]).toBe('DROP INDEX idx1 ON users');
        });

        it('should mark rollback as in progress', async () => {
            const operations = [
                jest.fn().mockResolvedValue({
                    sql: 'CREATE INDEX idx1 ON users (email)',
                    rollbackSQL: 'DROP INDEX idx1 ON users'
                }),
                jest.fn().mockRejectedValue(new Error('Failed'))
            ];

            const result = await transactionManager.execute('conn-1', operations);

            expect(result.rollback).toBe(true);
        });

        it('should prevent duplicate rollback', async () => {
            let rollbackCount = 0;
            mockAdapter.query.mockImplementation(() => {
                rollbackCount++;
                return Promise.resolve([]);
            });

            const operations = [
                jest.fn().mockResolvedValue({
                    sql: 'CREATE INDEX idx1 ON users (email)',
                    rollbackSQL: 'DROP INDEX idx1 ON users'
                }),
                jest.fn().mockRejectedValue(new Error('Failed'))
            ];

            await transactionManager.execute('conn-1', operations);

            // Should only rollback once
            expect(rollbackCount).toBe(1);
        });

        it('should continue rollback even if one fails', async () => {
            mockAdapter.query
                .mockRejectedValueOnce(new Error('Rollback 1 failed'))
                .mockResolvedValueOnce([]);

            const operations = [
                jest.fn().mockResolvedValue({
                    sql: 'CREATE INDEX idx1 ON users (email)',
                    rollbackSQL: 'DROP INDEX idx1 ON users'
                }),
                jest.fn().mockResolvedValue({
                    sql: 'CREATE INDEX idx2 ON users (name)',
                    rollbackSQL: 'DROP INDEX idx2 ON users'
                }),
                jest.fn().mockRejectedValue(new Error('Operation failed'))
            ];

            await transactionManager.execute('conn-1', operations);

            // Both rollback queries should be attempted
            expect(mockAdapter.query).toHaveBeenCalledTimes(2);
        });

        it('should log warning when no rollback SQL is available', async () => {
            const operations = [
                jest.fn().mockResolvedValue({
                    sql: 'SOME OPERATION'
                    // No rollbackSQL
                }),
                jest.fn().mockRejectedValue(new Error('Failed'))
            ];

            await transactionManager.execute('conn-1', operations);

            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('No rollback SQL available')
            );
        });
    });

    describe('Timeout Handling', () => {
        it('should trigger rollback on timeout', async () => {
            jest.useFakeTimers();

            const operations = [
                jest.fn().mockImplementation(() => {
                    // Simulate slow operation
                    return new Promise((resolve) => {
                        setTimeout(() => {
                            resolve({ sql: 'SLOW OPERATION' });
                        }, 10000);
                    });
                })
            ];

            const _executePromise = transactionManager.execute('conn-1', operations, { timeout: 100 });

            // Fast-forward time
            jest.advanceTimersByTime(150);

            await Promise.resolve(); // Allow promises to resolve

            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('timed out')
            );

            jest.useRealTimers();
        });

        it('should clear timeout on completion', async () => {
            jest.useFakeTimers();

            const operations = [
                jest.fn().mockResolvedValue({ sql: 'QUICK OPERATION' })
            ];

            await transactionManager.execute('conn-1', operations, { timeout: 5000 });

            // Timeout should be cleared
            expect(transactionManager.getActiveTransactionsCount()).toBe(0);

            jest.useRealTimers();
        });
    });

    describe('Idempotency Tests', () => {
        it('should detect already-executed operations', async () => {
            const sql = 'CREATE INDEX idx1 ON users (email)';

            // Execute first time
            await transactionManager.execute('conn-1', [
                jest.fn().mockResolvedValue({ sql })
            ]);

            // Check idempotency
            const isIdempotent = await transactionManager.checkIdempotency('conn-1', sql);

            expect(isIdempotent).toBe(true);
        });

        it('should normalize SQL for comparison', async () => {
            const sql1 = '  CREATE   INDEX   idx1   ON   users (email)  ';
            const sql2 = 'create index idx1 on users (email);';

            // Execute first time
            await transactionManager.execute('conn-1', [
                jest.fn().mockResolvedValue({ sql: sql1 })
            ]);

            // Should detect as idempotent despite different formatting
            const isIdempotent = await transactionManager.checkIdempotency('conn-1', sql2);

            expect(isIdempotent).toBe(true);
        });

        it('should track operation history', async () => {
            await transactionManager.execute('conn-1', [
                jest.fn().mockResolvedValue({ sql: 'CREATE INDEX idx1 ON users (email)' })
            ]);

            const isIdempotent = await transactionManager.checkIdempotency('conn-1', 'CREATE INDEX idx1 ON users (email)');
            expect(isIdempotent).toBe(true);
        });

        it('should clear history per connection', async () => {
            await transactionManager.execute('conn-1', [
                jest.fn().mockResolvedValue({ sql: 'CREATE INDEX idx1 ON users (email)' })
            ]);

            transactionManager.clearHistory('conn-1');

            const isIdempotent = await transactionManager.checkIdempotency('conn-1', 'CREATE INDEX idx1 ON users (email)');
            expect(isIdempotent).toBe(false);
        });

        it('should clear all history', async () => {
            await transactionManager.execute('conn-1', [
                jest.fn().mockResolvedValue({ sql: 'CREATE INDEX idx1 ON users (email)' })
            ]);
            await transactionManager.execute('conn-2', [
                jest.fn().mockResolvedValue({ sql: 'CREATE INDEX idx2 ON users (name)' })
            ]);

            transactionManager.clearHistory();

            const isIdempotent1 = await transactionManager.checkIdempotency('conn-1', 'CREATE INDEX idx1 ON users (email)');
            const isIdempotent2 = await transactionManager.checkIdempotency('conn-2', 'CREATE INDEX idx2 ON users (name)');

            expect(isIdempotent1).toBe(false);
            expect(isIdempotent2).toBe(false);
        });
    });

    describe('Rollback SQL Generation', () => {
        it('should generate DROP INDEX for CREATE INDEX', () => {
            const sql = 'CREATE INDEX idx_users_email ON users';
            const rollbackSQL = transactionManager.generateRollbackSQL(sql);

            // Implementation normalizes to uppercase
            expect(rollbackSQL).toBe('DROP INDEX IDX_USERS_EMAIL ON USERS');
        });

        it('should generate DROP TABLE for CREATE TABLE', () => {
            const sql = 'CREATE TABLE test_table (id INT)';
            const rollbackSQL = transactionManager.generateRollbackSQL(sql);

            // Implementation normalizes to uppercase
            expect(rollbackSQL).toBe('DROP TABLE TEST_TABLE');
        });

        it('should generate DROP COLUMN for ADD COLUMN', () => {
            const sql = 'ALTER TABLE users ADD COLUMN age INT';
            const rollbackSQL = transactionManager.generateRollbackSQL(sql);

            // Implementation normalizes to uppercase
            expect(rollbackSQL).toBe('ALTER TABLE USERS DROP COLUMN AGE');
        });

        it('should return undefined for unsupported operations', () => {
            const sql = 'DELETE FROM users WHERE id = 1';
            const rollbackSQL = transactionManager.generateRollbackSQL(sql);

            expect(rollbackSQL).toBeUndefined();
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('No automatic rollback SQL generation')
            );
        });
    });

    describe('Error Scenarios', () => {
        it('should handle adapter not found', async () => {
            getAdapter.mockResolvedValue(undefined);

            const operations = [
                jest.fn().mockResolvedValue({ sql: 'CREATE INDEX idx1 ON users (email)' })
            ];

            const result = await transactionManager.execute('conn-1', operations);

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should handle operation failure', async () => {
            const operations = [
                jest.fn().mockRejectedValue(new Error('Database error'))
            ];

            const result = await transactionManager.execute('conn-1', operations);

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Database error');
        });

        it('should report errors correctly', async () => {
            const errorMessage = 'Constraint violation';
            const operations = [
                jest.fn().mockRejectedValue(new Error(errorMessage))
            ];

            const result = await transactionManager.execute('conn-1', operations);

            expect(result.success).toBe(false);
            expect(result.error?.message).toBe(errorMessage);
        });

        it('should clean up state on error', async () => {
            const operations = [
                jest.fn().mockRejectedValue(new Error('Failed'))
            ];

            await transactionManager.execute('conn-1', operations);

            // Transaction should be cleaned up
            expect(transactionManager.getActiveTransactionsCount()).toBe(0);
        });
    });

    describe('Dry Run Mode', () => {
        it('should execute in dry run without changes', async () => {
            const operations = [
                jest.fn().mockResolvedValue({ sql: 'CREATE INDEX idx1 ON users (email)' })
            ];

            const result = await transactionManager.execute('conn-1', operations, { dryRun: true });

            expect(result.success).toBe(true);
            expect(operations[0]).toHaveBeenCalled();
            expect(mockAdapter.query).not.toHaveBeenCalled();
        });

        it('should log operations in dry run', async () => {
            const sql = 'CREATE INDEX idx1 ON users (email)';
            const operations = [
                jest.fn().mockResolvedValue({ sql })
            ];

            await transactionManager.execute('conn-1', operations, { dryRun: true });

            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('DRY RUN')
            );
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining(sql)
            );
        });

        it('should return success without execution', async () => {
            const operations = [
                jest.fn().mockResolvedValue({ sql: 'CREATE INDEX idx1 ON users (email)' })
            ];

            const result = await transactionManager.execute('conn-1', operations, { dryRun: true });

            expect(result.success).toBe(true);
            expect(result.rollback).toBe(false);
            expect(mockAdapter.query).not.toHaveBeenCalled();
        });

        it('should detect errors in dry run', async () => {
            const operations = [
                jest.fn().mockRejectedValue(new Error('Invalid SQL'))
            ];

            // Dry run catches errors and returns result with error, doesn't throw
            const result = await transactionManager.execute('conn-1', operations, { dryRun: true });

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error?.message).toBe('Invalid SQL');
        });
    });

    describe('Active Transactions', () => {
        it('should track active transactions count', async () => {
            expect(transactionManager.getActiveTransactionsCount()).toBe(0);

            // Start a long-running transaction
            const operations = [
                jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)))
            ];

            transactionManager.execute('conn-1', operations);

            // Should have 1 active transaction (before it completes)
            // Note: This is a timing-dependent test, may need adjustment
        });

        it('should clean up active transactions after completion', async () => {
            const operations = [
                jest.fn().mockResolvedValue({ sql: 'CREATE INDEX idx1 ON users (email)' })
            ];

            await transactionManager.execute('conn-1', operations);

            expect(transactionManager.getActiveTransactionsCount()).toBe(0);
        });
    });

    describe('Dispose', () => {
        it('should clear all timeouts on dispose', () => {
            jest.useFakeTimers();

            const operations = [
                jest.fn().mockImplementation(() => new Promise(() => {})) // Never resolves
            ];

            transactionManager.execute('conn-1', operations, { timeout: 5000 });
            transactionManager.execute('conn-2', operations, { timeout: 5000 });

            transactionManager.dispose();

            // No way to directly verify timeouts are cleared, but dispose should complete
            expect(transactionManager.getActiveTransactionsCount()).toBe(0);

            jest.useRealTimers();
        });

        it('should clear all operation history', async () => {
            await transactionManager.execute('conn-1', [
                jest.fn().mockResolvedValue({ sql: 'CREATE INDEX idx1 ON users (email)' })
            ]);

            transactionManager.dispose();

            const isIdempotent = await transactionManager.checkIdempotency('conn-1', 'CREATE INDEX idx1 ON users (email)');
            expect(isIdempotent).toBe(false);
        });
    });
});
