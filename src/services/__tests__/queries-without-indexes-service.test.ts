import { QueriesWithoutIndexesService } from '../queries-without-indexes-service';
import { IDatabaseAdapter } from '../../adapters/database-adapter';
import { Logger } from '../../utils/logger';

describe('QueriesWithoutIndexesService - Security Tests', () => {
    let service: QueriesWithoutIndexesService;
    let mockAdapter: jest.Mocked<IDatabaseAdapter>;
    let mockLogger: jest.Mocked<Logger>;

    beforeEach(() => {
        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        } as any;

        mockAdapter = {
            query: jest.fn(),
        } as any;

        service = new QueriesWithoutIndexesService(mockLogger);
    });

    describe('SQL Injection Prevention', () => {
        test('should reject schema name with SQL keywords', async () => {
            const maliciousInput = 'test; DROP TABLE users;';

            await expect(
                service.findUnusedIndexes(mockAdapter, maliciousInput)
            ).rejects.toThrow('Invalid schema name');
        });

        test('should reject schema name with special characters', async () => {
            const maliciousInput = 'test/../';

            await expect(
                service.findUnusedIndexes(mockAdapter, maliciousInput)
            ).rejects.toThrow('Invalid schema name');
        });

        test('should reject schema name with quotes', async () => {
            const maliciousInput = "test'schema";

            await expect(
                service.findUnusedIndexes(mockAdapter, maliciousInput)
            ).rejects.toThrow('Invalid schema name');
        });

        test('should reject schema name with semicolon', async () => {
            const maliciousInput = 'test; SELECT * FROM users';

            await expect(
                service.findUnusedIndexes(mockAdapter, maliciousInput)
            ).rejects.toThrow('Invalid schema name');
        });

        test('should accept valid schema names', async () => {
            mockAdapter.query.mockResolvedValue([] as any);

            const result = await service.findUnusedIndexes(mockAdapter, 'valid_schema');

            expect(result).toEqual([]);
            expect(mockAdapter.query).toHaveBeenCalled();
        });

        test('should accept schema names with underscore', async () => {
            mockAdapter.query.mockResolvedValue([] as any);

            await expect(
                service.findUnusedIndexes(mockAdapter, 'test_schema_123')
            ).resolves.toBeDefined();
        });

        test('should reject schema name starting with number', async () => {
            await expect(
                service.findUnusedIndexes(mockAdapter, '123schema')
            ).rejects.toThrow('Invalid schema name');
        });
    });

    describe('Duplicate Index Detection - Security', () => {
        test('should reject malicious schema name for duplicate detection', async () => {
            await expect(
                service.findDuplicateIndexes(mockAdapter, 'test; DELETE * FROM users')
            ).rejects.toThrow('Invalid schema name');
        });

        test('should accept valid schema for duplicate detection', async () => {
            mockAdapter.query.mockResolvedValue([] as any);

            await expect(
                service.findDuplicateIndexes(mockAdapter, 'valid_schema')
            ).resolves.toBeDefined();
        });
    });

    describe('Configuration Error Handling', () => {
        test('should throw PerformanceSchemaConfigurationError when needed', async () => {
            mockAdapter.query.mockRejectedValue(new Error('PS not enabled'));

            await expect(
                service.detectQueriesWithoutIndexes(mockAdapter)
            ).rejects.toThrow();
        });

        test('should handle missing schema gracefully', async () => {
            mockAdapter.query.mockResolvedValue([] as any);

            const result = await service.findUnusedIndexes(mockAdapter, 'non_existent_schema');

            expect(result).toEqual([]);
        });
    });
});

describe('QueriesWithoutIndexesService - Core Functionality', () => {
    let service: QueriesWithoutIndexesService;
    let mockAdapter: jest.Mocked<IDatabaseAdapter>;
    let mockLogger: jest.Mocked<Logger>;

    beforeEach(() => {
        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        } as any;

        mockAdapter = {
            query: jest.fn(),
        } as any;

        service = new QueriesWithoutIndexesService(mockLogger);
    });

    describe('Index Health Detection', () => {
        test('should detect unused indexes', async () => {
            const mockResults = [
                {
                    table_name: 'users',
                    index_name: 'idx_user_email',
                    columns: 'email',
                    column_count: 1,
                    index_type: 'BTREE',
                    cardinality: 1000
                }
            ];

            mockAdapter.query.mockResolvedValue(mockResults as any);

            const result = await service.findUnusedIndexes(mockAdapter, 'test_schema');

            expect(result).toHaveLength(1);
            expect(result[0]).toHaveProperty('table_name', 'users');
            expect(result[0]).toHaveProperty('index_name', 'idx_user_email');
        });

        test('should return empty array when no unused indexes', async () => {
            mockAdapter.query.mockResolvedValue([] as any);

            const result = await service.findUnusedIndexes(mockAdapter, 'test_schema');

            expect(result).toHaveLength(0);
        });

        test('should detect duplicate indexes', async () => {
            const mockResults = [
                {
                    table_name: 'users',
                    index_name: 'idx_user_id',
                    columns: 'user_id',
                    column_count: 1
                },
                {
                    table_name: 'users',
                    index_name: 'idx_user_id_dup',
                    columns: 'user_id',
                    column_count: 1
                }
            ];

            mockAdapter.query.mockResolvedValue(mockResults as any);

            const result = await service.findDuplicateIndexes(mockAdapter, 'test_schema');

            expect(result.length).toBeGreaterThan(0);
            expect(result[0]).toHaveProperty('columns');
        });

        test('should handle database connection errors', async () => {
            mockAdapter.query.mockRejectedValue(new Error('Connection failed'));

            await expect(
                service.findUnusedIndexes(mockAdapter, 'test_schema')
            ).rejects.toThrow('Connection failed');
        });
    });

    describe('Query Analysis', () => {
        test('should suggest indexes based on query patterns', async () => {
            const mockQueryData = {
                digest_text: 'SELECT * FROM users WHERE email = ?',
                schema_name: 'test_schema'
            };

            const result = await service['suggestIndexes'](
                mockAdapter,
                mockQueryData.digest_text,
                mockQueryData.schema_name
            );

            expect(Array.isArray(result)).toBe(true);
        });

        test('should handle complex queries with JOINs', async () => {
            const mockQueryData = {
                digest_text: 'SELECT * FROM users u JOIN orders o ON u.id = o.user_id WHERE u.email = ?',
                schema_name: 'test_schema'
            };

            const result = await service['suggestIndexes'](
                mockAdapter,
                mockQueryData.digest_text,
                mockQueryData.schema_name
            );

            expect(result.length).toBeGreaterThan(0);
        });
    });
});
