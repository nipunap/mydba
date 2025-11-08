import { QueryHistoryService, QueryHistoryEntry } from '../query-history-service';
import { Logger } from '../../utils/logger';
import * as vscode from 'vscode';

jest.mock('../../utils/logger');

describe('QueryHistoryService', () => {
    let service: QueryHistoryService;
    let mockContext: vscode.ExtensionContext;
    let mockLogger: jest.Mocked<Logger>;
    let mockGlobalState: Map<string, unknown>;

    beforeEach(() => {
        jest.clearAllMocks();

        mockLogger = {
            info: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn()
        } as unknown as jest.Mocked<Logger>;

        mockGlobalState = new Map();

        mockContext = {
            globalState: {
                get: jest.fn((key: string) => mockGlobalState.get(key)),
                update: jest.fn((key: string, value: unknown) => {
                    mockGlobalState.set(key, value);
                    return Promise.resolve();
                }),
                keys: jest.fn(() => Array.from(mockGlobalState.keys()))
            },
            subscriptions: []
        } as unknown as vscode.ExtensionContext;

        service = new QueryHistoryService(mockContext, mockLogger);
    });

    const createMockEntry = (overrides?: Partial<QueryHistoryEntry>): Omit<QueryHistoryEntry, 'id' | 'timestamp' | 'queryHash' | 'isFavorite' | 'tags' | 'notes'> => ({
        query: 'SELECT * FROM test_table',
        connectionId: 'test-conn-1',
        connectionName: 'Test Connection',
        database: 'testdb',
        duration: 100,
        rowsAffected: 10,
        success: true,
        error: null,
        ...overrides
    });

    describe('addQuery', () => {
        it('should add a query to history and persist it', () => {
            const entry = service.addQuery(createMockEntry());
            expect(entry).toBeDefined();
            expect(entry.query).toBe('SELECT * FROM test_table');
            expect(entry.id).toBeDefined();
            expect(entry.timestamp).toBeDefined();
            expect(entry.queryHash).toBeDefined();
            expect(mockContext.globalState.update).toHaveBeenCalledWith('mydba.queryHistory', expect.any(Array));
        });

        it('should limit history size to MAX_HISTORY_SIZE', () => {
            for (let i = 0; i < 1050; i++) {
                service.addQuery(createMockEntry({ query: `SELECT ${i}` }));
            }
            expect(service.getHistory().length).toBeLessThanOrEqual(1000);
        });

        it('should generate a consistent query hash', () => {
            const entry1 = service.addQuery(createMockEntry({ query: 'SELECT * FROM users WHERE id = 1' }));
            const entry2 = service.addQuery(createMockEntry({ query: 'SELECT * FROM users WHERE id = 1' }));
            expect(entry1.queryHash).toBe(entry2.queryHash);
        });
    });

    describe('getHistory', () => {
        it('should return all queries in history', () => {
            service.addQuery(createMockEntry({ query: 'Query 1' }));
            service.addQuery(createMockEntry({ query: 'Query 2' }));
            const history = service.getHistory();
            expect(history).toHaveLength(2);
            expect(history[0].query).toBe('Query 2'); // Most recent first
            expect(history[1].query).toBe('Query 1');
        });

        it('should return an empty array if no history', () => {
            expect(service.getHistory()).toEqual([]);
        });

        it('should filter by connectionId', () => {
            service.addQuery(createMockEntry({ connectionId: 'conn-1' }));
            service.addQuery(createMockEntry({ connectionId: 'conn-2' }));
            service.addQuery(createMockEntry({ connectionId: 'conn-1' }));

            const conn1Queries = service.getHistory({ connectionId: 'conn-1' });
            expect(conn1Queries).toHaveLength(2);
            expect(conn1Queries[0].connectionId).toBe('conn-1');
        });

        it('should filter by favorites', () => {
            const entry1 = service.addQuery(createMockEntry({ query: 'Query 1' }));
            service.addQuery(createMockEntry({ query: 'Query 2' }));
            service.toggleFavorite(entry1.id);

            const favorites = service.getHistory({ onlyFavorites: true });
            expect(favorites).toHaveLength(1);
            expect(favorites[0].isFavorite).toBe(true);
        });

        it('should filter by success status', () => {
            service.addQuery(createMockEntry({ success: true }));
            service.addQuery(createMockEntry({ success: false, error: 'Error' }));
            service.addQuery(createMockEntry({ success: true }));

            const successfulQueries = service.getHistory({ successOnly: true });
            expect(successfulQueries).toHaveLength(2);
            expect(successfulQueries.every(q => q.success)).toBe(true);
        });

        it('should limit results', () => {
            for (let i = 0; i < 10; i++) {
                service.addQuery(createMockEntry({ query: `Query ${i}` }));
            }

            const limited = service.getHistory({ limit: 5 });
            expect(limited).toHaveLength(5);
        });
    });

    describe('search', () => {
        beforeEach(() => {
            service.addQuery(createMockEntry({ query: 'SELECT * FROM users' }));
            service.addQuery(createMockEntry({ query: 'INSERT INTO products' }));
            service.addQuery(createMockEntry({ query: 'SELECT * FROM orders' }));
        });

        it('should find queries matching search term', () => {
            const results = service.search('users');
            expect(results).toHaveLength(1);
            expect(results[0].query).toBe('SELECT * FROM users');
        });

        it('should be case-insensitive', () => {
            const results = service.search('USERS');
            expect(results).toHaveLength(1);
            expect(results[0].query).toBe('SELECT * FROM users');
        });

        it('should return empty array if no match', () => {
            const results = service.search('customers');
            expect(results).toHaveLength(0);
        });

        it('should search in notes', () => {
            const entry = service.addQuery(createMockEntry({ query: 'SELECT 1' }));
            service.updateNotes(entry.id, 'This is about users');

            const results = service.search('users');
            expect(results.length).toBeGreaterThan(0);
        });

        it('should limit search results', () => {
            for (let i = 0; i < 10; i++) {
                service.addQuery(createMockEntry({ query: `SELECT ${i} FROM users` }));
            }

            const results = service.search('users', { limit: 3 });
            expect(results).toHaveLength(3);
        });
    });

    describe('getEntry', () => {
        it('should return entry by id', () => {
            const entry = service.addQuery(createMockEntry());
            const retrieved = service.getEntry(entry.id);

            expect(retrieved).toBeDefined();
            expect(retrieved?.id).toBe(entry.id);
        });

        it('should return undefined for non-existent id', () => {
            const retrieved = service.getEntry('non-existent');
            expect(retrieved).toBeUndefined();
        });
    });

    describe('toggleFavorite', () => {
        it('should toggle isFavorite status of a query', () => {
            const entry = service.addQuery(createMockEntry());
            expect(entry.isFavorite).toBe(false);

            const isFavorite1 = service.toggleFavorite(entry.id);
            expect(isFavorite1).toBe(true);

            const isFavorite2 = service.toggleFavorite(entry.id);
            expect(isFavorite2).toBe(false);
        });

        it('should return false if query not found', () => {
            const result = service.toggleFavorite('non-existent-id');
            expect(result).toBe(false);
        });
    });

    describe('updateNotes', () => {
        it('should update notes for a query', () => {
            const entry = service.addQuery(createMockEntry());
            const newNotes = 'This is a test note.';
            service.updateNotes(entry.id, newNotes);

            const updatedEntry = service.getEntry(entry.id);
            expect(updatedEntry?.notes).toBe(newNotes);
        });

        it('should not throw if query not found', () => {
            expect(() => service.updateNotes('non-existent-id', 'some notes')).not.toThrow();
        });
    });

    describe('updateTags', () => {
        it('should update tags for a query', () => {
            const entry = service.addQuery(createMockEntry());
            const newTags = ['slow', 'important'];
            service.updateTags(entry.id, newTags);

            const updatedEntry = service.getEntry(entry.id);
            expect(updatedEntry?.tags).toEqual(newTags);
        });

        it('should not throw if query not found', () => {
            expect(() => service.updateTags('non-existent-id', ['tag'])).not.toThrow();
        });
    });

    describe('deleteEntry', () => {
        it('should delete a query from history', () => {
            const entry1 = service.addQuery(createMockEntry({ query: 'Query 1' }));
            service.addQuery(createMockEntry({ query: 'Query 2' }));
            expect(service.getHistory()).toHaveLength(2);

            const result = service.deleteEntry(entry1.id);
            expect(result).toBe(true);
            expect(service.getHistory()).toHaveLength(1);
            expect(service.getHistory()[0].query).toBe('Query 2');
        });

        it('should return false if query not found', () => {
            const result = service.deleteEntry('non-existent-id');
            expect(result).toBe(false);
        });
    });

    describe('clearHistory', () => {
        it('should clear all history', () => {
            service.addQuery(createMockEntry());
            expect(service.getHistory()).toHaveLength(1);
            service.clearHistory();
            expect(service.getHistory()).toHaveLength(0);
            expect(mockContext.globalState.update).toHaveBeenCalledWith('mydba.queryHistory', []);
        });
    });

    describe('getStats', () => {
        it('should return correct statistics for queries', () => {
            service.addQuery(createMockEntry({ duration: 50, success: true }));
            service.addQuery(createMockEntry({ duration: 150, success: true }));
            service.addQuery(createMockEntry({ duration: 200, success: false, error: 'Error' }));

            const stats = service.getStats();
            expect(stats.totalQueries).toBe(3);
            expect(stats.successRate).toBeCloseTo(66.67);
            expect(stats.avgDuration).toBe(100); // (50 + 150) / 2
            expect(stats.recentErrors).toHaveLength(1);
            expect(stats.recentErrors[0].success).toBe(false);
        });

        it('should handle empty history for statistics', () => {
            const stats = service.getStats();
            expect(stats.totalQueries).toBe(0);
            expect(stats.successRate).toBe(0);
            expect(stats.avgDuration).toBe(0);
            expect(stats.mostFrequent).toEqual([]);
            expect(stats.recentErrors).toEqual([]);
        });

        it('should calculate most frequent queries', () => {
            const query1 = 'SELECT 1';
            const query2 = 'SELECT 2';

            service.addQuery(createMockEntry({ query: query1 }));
            service.addQuery(createMockEntry({ query: query1 }));
            service.addQuery(createMockEntry({ query: query1 }));
            service.addQuery(createMockEntry({ query: query2 }));

            const stats = service.getStats();
            expect(stats.mostFrequent.length).toBeGreaterThan(0);
            expect(stats.mostFrequent[0].query).toBe(query1);
            expect(stats.mostFrequent[0].count).toBe(3);
        });
    });

    describe('exportToJSON', () => {
        it('should export history to JSON string', () => {
            service.addQuery(createMockEntry({ query: 'SELECT 1' }));
            service.addQuery(createMockEntry({ query: 'SELECT 2' }));

            const json = service.exportToJSON();
            expect(() => JSON.parse(json)).not.toThrow();

            const parsed = JSON.parse(json);
            expect(Array.isArray(parsed)).toBe(true);
            expect(parsed).toHaveLength(2);
        });
    });

    describe('exportToCSV', () => {
        it('should export history to CSV string', () => {
            service.addQuery(createMockEntry({ query: 'SELECT 1', duration: 50 }));
            service.addQuery(createMockEntry({ query: 'SELECT 2', duration: 100 }));

            const csv = service.exportToCSV();
            expect(csv).toContain('Timestamp');
            expect(csv).toContain('Connection');
            expect(csv).toContain('Query');
            expect(csv).toContain('SELECT 1');
            expect(csv).toContain('SELECT 2');
        });

        it('should handle special CSV characters', () => {
            service.addQuery(createMockEntry({ query: 'SELECT * FROM "users"' }));

            const csv = service.exportToCSV();
            expect(csv).toContain('SELECT');
        });
    });
});
