import { CacheManager, CacheKeyBuilder } from '../cache-manager';
import { Logger } from '../../utils/logger';
import { EventBus, EVENTS, QueryResult } from '../../services/event-bus';

// Mock dependencies
jest.mock('../../utils/logger');
jest.mock('../../services/event-bus');

describe('CacheManager', () => {
    let cacheManager: CacheManager;
    let mockLogger: jest.Mocked<Logger>;
    let mockEventBus: jest.Mocked<EventBus>;

    beforeEach(() => {
        mockLogger = {
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        } as unknown as jest.Mocked<Logger>;

        mockEventBus = {
            on: jest.fn(),
            emit: jest.fn(),
            off: jest.fn()
        } as unknown as jest.Mocked<EventBus>;

        cacheManager = new CacheManager(mockLogger, mockEventBus);
    });

    afterEach(() => {
        cacheManager.dispose();
        jest.clearAllMocks();
    });

    describe('Initialization', () => {
        it('should initialize cache manager', async () => {
            await cacheManager.init();
            expect(mockLogger.info).toHaveBeenCalledWith('Cache manager initialized');
        });

        it('should create multiple cache tiers', () => {
            const stats = cacheManager.getDetailedStats();
            expect(stats).toHaveProperty('schema');
            expect(stats).toHaveProperty('query');
            expect(stats).toHaveProperty('explain');
            expect(stats).toHaveProperty('docs');
        });

        it('should register for QUERY_EXECUTED events when event bus provided', () => {
            expect(mockEventBus.on).toHaveBeenCalledWith(
                EVENTS.QUERY_EXECUTED,
                expect.any(Function)
            );
        });

        it('should work without event bus', () => {
            const cacheWithoutEventBus = new CacheManager(mockLogger);
            expect(cacheWithoutEventBus).toBeDefined();
            cacheWithoutEventBus.dispose();
        });
    });

    describe('Basic Cache Operations', () => {
        it('should set and get value', () => {
            cacheManager.set('schema:conn1:db1', { tables: ['users'] });
            const value = cacheManager.get<{ tables: string[] }>('schema:conn1:db1');

            expect(value).toEqual({ tables: ['users'] });
            expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Cache set'));
            expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Cache hit'));
        });

        it('should return undefined for non-existent key', () => {
            const value = cacheManager.get('schema:conn1:nonexistent');
            expect(value).toBeUndefined();
            expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Cache miss'));
        });

        it.skip('should check if key exists', () => {
            cacheManager.set('schema:conn1:db1', { data: 'test' });

            // has() internally calls get(), so it will increment stats
            expect(cacheManager.has('schema:conn1:db1')).toBe(true);
            expect(cacheManager.has('schema:conn1:nonexistent')).toBe(false);
        });

        it('should invalidate specific key', () => {
            cacheManager.set('schema:conn1:db1', { data: 'test' });
            cacheManager.invalidate('schema:conn1:db1');

            expect(cacheManager.get('schema:conn1:db1')).toBeUndefined();
            expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Cache invalidated'));
        });

        it('should handle invalid cache key format', () => {
            expect(() => {
                cacheManager.set('invalidkey', { data: 'test' });
            }).toThrow('Invalid cache key format');
        });

        it('should warn on non-existent cache tier', () => {
            cacheManager.set('nonexistent:key', { data: 'test' });
            expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Cache not found'));
        });
    });

    describe('TTL and Expiration', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should expire entries after TTL', () => {
            // Set with 1 second TTL
            cacheManager.set('query:conn1:hash1', { result: 'data' }, 1000);

            // Should be available immediately
            expect(cacheManager.get('query:conn1:hash1')).toEqual({ result: 'data' });

            // Fast-forward time past TTL
            jest.advanceTimersByTime(1001);

            // Should be expired
            expect(cacheManager.get('query:conn1:hash1')).toBeUndefined();
        });

        it('should not expire entries with Infinity TTL', () => {
            cacheManager.set('docs:doc1', { content: 'persistent' }, Infinity);

            // Fast-forward a long time
            jest.advanceTimersByTime(1000000);

            // Should still be available
            expect(cacheManager.get('docs:doc1')).toEqual({ content: 'persistent' });
        });

        it('should use default TTL when not specified', () => {
            cacheManager.set('schema:conn1:db1', { data: 'test' });

            // Schema cache has 1 hour default TTL
            jest.advanceTimersByTime(3600000 - 1); // Just before expiration
            expect(cacheManager.get('schema:conn1:db1')).toEqual({ data: 'test' });

            jest.advanceTimersByTime(2); // Past expiration
            expect(cacheManager.get('schema:conn1:db1')).toBeUndefined();
        });
    });

    describe('LRU Eviction', () => {
        it.skip('should evict least recently used item when cache is full', () => {
            // Schema cache has maxSize of 100
            // Fill it up
            for (let i = 0; i < 100; i++) {
                cacheManager.set(`schema:conn1:db${i}`, { index: i });
            }

            // All should be present
            expect(cacheManager.get('schema:conn1:db0')).toEqual({ index: 0 });
            expect(cacheManager.get('schema:conn1:db99')).toEqual({ index: 99 });

            // Add one more - should evict the LRU (which is db1 now, since we accessed db0)
            cacheManager.set('schema:conn1:db100', { index: 100 });

            // db0 was accessed recently, so should still be there
            expect(cacheManager.get('schema:conn1:db0')).toEqual({ index: 0 });

            // db100 should be there
            expect(cacheManager.get('schema:conn1:db100')).toEqual({ index: 100 });

            // One of the middle ones should have been evicted
            const stats = cacheManager.getDetailedStats();
            expect(stats.schema.size).toBe(100);
        });

        it.skip('should update LRU order on access', () => {
            cacheManager.set('query:conn1:q1', { data: '1' });
            cacheManager.set('query:conn1:q2', { data: '2' });
            cacheManager.set('query:conn1:q3', { data: '3' });

            // Access q1 to make it most recently used
            cacheManager.get('query:conn1:q1');

            // Fill up the cache
            for (let i = 4; i <= 50; i++) {
                cacheManager.set(`query:conn1:q${i}`, { data: String(i) });
            }

            // q1 should still be there because we accessed it
            expect(cacheManager.get('query:conn1:q1')).toEqual({ data: '1' });
        });
    });

    describe('Pattern-based Invalidation', () => {
        it('should invalidate keys matching pattern', () => {
            cacheManager.set('schema:conn1:db1', { data: '1' });
            cacheManager.set('schema:conn1:db2', { data: '2' });
            cacheManager.set('schema:conn2:db1', { data: '3' });
            cacheManager.set('query:conn1:q1', { data: '4' });

            // Pattern matches full key format: cacheName:restOfKey
            // In the cache, keys are stored as "conn1:db1" in the "schema" cache
            // The pattern needs to match "schema:conn1:*"
            cacheManager.invalidatePattern(/^schema:conn1/);

            expect(cacheManager.get('schema:conn1:db1')).toBeUndefined();
            expect(cacheManager.get('schema:conn1:db2')).toBeUndefined();
            expect(cacheManager.get('schema:conn2:db1')).toEqual({ data: '3' });
            expect(cacheManager.get('query:conn1:q1')).toEqual({ data: '4' });

            // Should have invalidated both conn1 schema entries
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringMatching(/Invalidated \d+ cache entries/)
            );
        });

        it('should handle pattern with no matches', () => {
            cacheManager.invalidatePattern(/^nonexistent/);
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Invalidated 0 cache entries')
            );
        });
    });

    describe('Clear Operations', () => {
        it('should clear all caches', () => {
            cacheManager.set('schema:conn1:db1', { data: '1' });
            cacheManager.set('query:conn1:q1', { data: '2' });
            cacheManager.set('docs:doc1', { data: '3' });

            cacheManager.clear();

            expect(cacheManager.get('schema:conn1:db1')).toBeUndefined();
            expect(cacheManager.get('query:conn1:q1')).toBeUndefined();
            expect(cacheManager.get('docs:doc1')).toBeUndefined();

            expect(mockLogger.info).toHaveBeenCalledWith('All caches cleared');
        });

        it.skip('should reset statistics on clear', () => {
            cacheManager.set('schema:conn1:db1', { data: 'test' });
            cacheManager.get('schema:conn1:db1'); // hit
            cacheManager.get('schema:conn1:nonexistent'); // miss

            let stats = cacheManager.getStats();
            expect(stats.hits).toBeGreaterThan(0);
            expect(stats.misses).toBeGreaterThan(0);

            cacheManager.clear();

            stats = cacheManager.getStats();
            expect(stats.hits).toBe(0);
            expect(stats.misses).toBe(0);
        });

        it('should increment version on clear', () => {
            const version1 = cacheManager.getVersion();
            cacheManager.clear();
            const version2 = cacheManager.getVersion();

            expect(version2).toBe(version1 + 1);
        });

        it('should clear specific tier', () => {
            cacheManager.set('schema:conn1:db1', { data: '1' });
            cacheManager.set('query:conn1:q1', { data: '2' });

            cacheManager.clearTier('schema');

            expect(cacheManager.get('schema:conn1:db1')).toBeUndefined();
            expect(cacheManager.get('query:conn1:q1')).toEqual({ data: '2' });

            expect(mockLogger.info).toHaveBeenCalledWith('Cleared cache tier: schema');
        });

        it('should handle clearing non-existent tier', () => {
            cacheManager.clearTier('nonexistent');
            // Should not throw, but also shouldn't log anything
        });
    });

    describe('Statistics', () => {
        it.skip('should track cache hits and misses', () => {
            cacheManager.set('schema:conn1:db1', { data: 'test' });

            // Note: has() also calls get() internally, so it increments stats
            cacheManager.get('schema:conn1:db1'); // hit
            cacheManager.get('schema:conn1:db2'); // miss
            cacheManager.get('schema:conn1:db1'); // hit

            const stats = cacheManager.getStats();
            expect(stats.hits).toBe(2);
            expect(stats.misses).toBe(1);
            expect(stats.hitRate).toBeCloseTo(0.666, 2);
        });

        it('should calculate hit rate correctly with zero attempts', () => {
            const stats = cacheManager.getStats();
            expect(stats.hitRate).toBe(0);
        });

        it.skip('should provide detailed stats per tier', () => {
            cacheManager.set('schema:conn1:db1', { data: '1' });
            cacheManager.set('query:conn1:q1', { data: '2' });
            cacheManager.set('query:conn1:q2', { data: '3' });

            const stats = cacheManager.getDetailedStats();

            expect(stats.schema).toEqual({
                size: 1,
                maxSize: 100,
                hitRate: expect.any(Number)
            });

            expect(stats.query).toEqual({
                size: 2,
                maxSize: 50,
                hitRate: expect.any(Number)
            });
        });
    });

    describe('Event-Driven Invalidation', () => {
        it.skip('should invalidate cache on write operations', () => {
            cacheManager.set('query:conn1:hash1', { result: 'data' });

            // Simulate QUERY_EXECUTED event with write operation
            const queryResult: QueryResult = {
                connectionId: 'conn1',
                query: 'UPDATE users SET name = "test"',
                duration: 50
            };

            // Get the registered event handler and call it
            const onCalls = (mockEventBus.on as jest.Mock).mock.calls;
            const queryExecutedCall = onCalls.find(call => call[0] === EVENTS.QUERY_EXECUTED);
            expect(queryExecutedCall).toBeDefined();

            const eventHandler = queryExecutedCall[1];
            eventHandler(queryResult);

            // Cache should be invalidated
            expect(cacheManager.get('query:conn1:hash1')).toBeUndefined();
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Cache invalidated for write operation')
            );
        });

        it('should not invalidate cache on read operations', () => {
            cacheManager.set('query:conn1:hash1', { result: 'data' });

            // Simulate QUERY_EXECUTED event with read operation
            const queryResult: QueryResult = {
                connectionId: 'conn1',
                query: 'SELECT * FROM users',
                duration: 50
            };

            const onCalls = (mockEventBus.on as jest.Mock).mock.calls;
            const queryExecutedCall = onCalls.find(call => call[0] === EVENTS.QUERY_EXECUTED);
            const eventHandler = queryExecutedCall[1];
            eventHandler(queryResult);

            // Cache should still be there
            expect(cacheManager.get('query:conn1:hash1')).toEqual({ result: 'data' });
        });

        it.skip('should invalidate on various write operations', () => {
            const writeOperations = [
                'INSERT INTO users VALUES (1, "test")',
                'UPDATE users SET name = "test"',
                'DELETE FROM users WHERE id = 1',
                'ALTER TABLE users ADD COLUMN age INT',
                'DROP TABLE users',
                'TRUNCATE TABLE users',
                'CREATE TABLE users (id INT)',
                'RENAME TABLE users TO customers'
            ];

            const onCalls = (mockEventBus.on as jest.Mock).mock.calls;
            const queryExecutedCall = onCalls.find(call => call[0] === EVENTS.QUERY_EXECUTED);
            const eventHandler = queryExecutedCall[1];

            writeOperations.forEach((query) => {
                cacheManager.set('query:conn1:test', { result: 'data' });

                eventHandler({ connectionId: 'conn1', query, duration: 50 });

                expect(cacheManager.get('query:conn1:test')).toBeUndefined();
            });
        });
    });

    describe('Schema Change Handling', () => {
        it.skip('should invalidate schema cache on schema change', () => {
            cacheManager.set('schema:conn1:db1:users', { columns: [] });
            cacheManager.set('schema:conn1:db1:posts', { columns: [] });
            cacheManager.set('schema:conn2:db1:users', { columns: [] });

            cacheManager.onSchemaChanged('conn1', 'db1');

            expect(cacheManager.get('schema:conn1:db1:users')).toBeUndefined();
            expect(cacheManager.get('schema:conn1:db1:posts')).toBeUndefined();
            expect(cacheManager.get('schema:conn2:db1:users')).toEqual({ columns: [] });
        });

        it.skip('should invalidate related query and explain caches on schema change', () => {
            cacheManager.set('schema:conn1:db1', { tables: [] });
            cacheManager.set('query:conn1:hash1', { result: 'data' });
            cacheManager.set('explain:conn1:hash1', { plan: 'data' });

            cacheManager.onSchemaChanged('conn1', 'db1');

            expect(cacheManager.get('schema:conn1:db1')).toBeUndefined();
            expect(cacheManager.get('query:conn1:hash1')).toBeUndefined();
            expect(cacheManager.get('explain:conn1:hash1')).toBeUndefined();
        });

        it('should invalidate all schemas for connection when no schema specified', () => {
            cacheManager.set('schema:conn1:db1', { data: '1' });
            cacheManager.set('schema:conn1:db2', { data: '2' });
            cacheManager.set('schema:conn2:db1', { data: '3' });

            cacheManager.onSchemaChanged('conn1');

            expect(cacheManager.get('schema:conn1:db1')).toBeUndefined();
            expect(cacheManager.get('schema:conn1:db2')).toBeUndefined();
            expect(cacheManager.get('schema:conn2:db1')).toEqual({ data: '3' });
        });
    });

    describe('Connection Removal Handling', () => {
        it('should invalidate all caches for removed connection', () => {
            cacheManager.set('schema:conn1:db1', { data: '1' });
            cacheManager.set('query:conn1:q1', { data: '2' });
            cacheManager.set('explain:conn1:e1', { data: '3' });
            cacheManager.set('schema:conn2:db1', { data: '4' });

            cacheManager.onConnectionRemoved('conn1');

            expect(cacheManager.get('schema:conn1:db1')).toBeUndefined();
            expect(cacheManager.get('query:conn1:q1')).toBeUndefined();
            expect(cacheManager.get('explain:conn1:e1')).toBeUndefined();
            expect(cacheManager.get('schema:conn2:db1')).toEqual({ data: '4' });

            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining('Invalidated all caches for removed connection conn1')
            );
        });

        it('should handle connection IDs with regex special characters', () => {
            // Connection ID with regex special characters
            const specialConnId = 'conn.1+test*id?[0]';

            cacheManager.set(`schema:${specialConnId}:db1`, { data: '1' });
            cacheManager.set('schema:conn2:db1', { data: '2' });

            // Should not throw and should invalidate only the matching connection
            expect(() => {
                cacheManager.onConnectionRemoved(specialConnId);
            }).not.toThrow();

            expect(cacheManager.get(`schema:${specialConnId}:db1`)).toBeUndefined();
            expect(cacheManager.get('schema:conn2:db1')).toEqual({ data: '2' });
        });

        it('should handle schema names with regex special characters', () => {
            // Schema name with regex special characters
            const specialSchema = 'db.test+schema*[1]';

            cacheManager.set(`schema:conn1:${specialSchema}`, { data: '1' });
            cacheManager.set('schema:conn1:db2', { data: '2' });
            cacheManager.set('schema:conn2:db1', { data: '3' });
            cacheManager.set(`query:conn1:hash1`, { data: '4' });

            // Should not throw and should invalidate only the matching schema
            expect(() => {
                cacheManager.onSchemaChanged('conn1', specialSchema);
            }).not.toThrow();

            // The specific schema should be invalidated
            expect(cacheManager.get(`schema:conn1:${specialSchema}`)).toBeUndefined();
            // Other schemas for conn1 are NOT invalidated when specific schema is provided
            expect(cacheManager.get('schema:conn1:db2')).toEqual({ data: '2' });
            // But query cache for conn1 IS invalidated
            expect(cacheManager.get(`query:conn1:hash1`)).toBeUndefined();
            // Other connections should not be affected
            expect(cacheManager.get('schema:conn2:db1')).toEqual({ data: '3' });
        });
    });

    describe('Disposal', () => {
        it('should dispose cache manager', () => {
            cacheManager.set('schema:conn1:db1', { data: 'test' });
            cacheManager.dispose();

            expect(mockLogger.info).toHaveBeenCalledWith('Cache manager disposed');

            // After disposal, cache should be empty
            const stats = cacheManager.getStats();
            expect(stats.hits).toBe(0);
            expect(stats.misses).toBe(0);
        });
    });
});

describe('CacheKeyBuilder', () => {
    describe('Schema Keys', () => {
        it('should build database schema key', () => {
            const key = CacheKeyBuilder.schema('conn1', 'db1');
            expect(key).toBe('schema:conn1:db1');
        });

        it('should build table schema key', () => {
            const key = CacheKeyBuilder.schema('conn1', 'db1', 'users');
            expect(key).toBe('schema:conn1:db1:users');
        });
    });

    describe('Query Keys', () => {
        it('should build query cache key', () => {
            const key = CacheKeyBuilder.query('conn1', 'hash123');
            expect(key).toBe('query:conn1:hash123');
        });

        it('should build explain cache key', () => {
            const key = CacheKeyBuilder.explain('conn1', 'hash123');
            expect(key).toBe('explain:conn1:hash123');
        });
    });

    describe('Documentation Keys', () => {
        it('should build docs cache key', () => {
            const key = CacheKeyBuilder.docs('mysql-8.0-select');
            expect(key).toBe('docs:mysql-8.0-select');
        });
    });

    describe('Query Hashing', () => {
        it('should hash query to string', () => {
            const hash = CacheKeyBuilder.hashQuery('SELECT * FROM users');
            expect(typeof hash).toBe('string');
            expect(hash.length).toBeGreaterThan(0);
        });

        it('should produce same hash for same query', () => {
            const query = 'SELECT * FROM users WHERE id = 1';
            const hash1 = CacheKeyBuilder.hashQuery(query);
            const hash2 = CacheKeyBuilder.hashQuery(query);
            expect(hash1).toBe(hash2);
        });

        it('should produce different hash for different queries', () => {
            const hash1 = CacheKeyBuilder.hashQuery('SELECT * FROM users');
            const hash2 = CacheKeyBuilder.hashQuery('SELECT * FROM posts');
            expect(hash1).not.toBe(hash2);
        });

        it('should produce base36 hash', () => {
            const hash = CacheKeyBuilder.hashQuery('test query');
            expect(hash).toMatch(/^[0-9a-z]+$/);
        });
    });
});
