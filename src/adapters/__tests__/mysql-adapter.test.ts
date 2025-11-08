import { MySQLAdapter } from '../mysql-adapter';
import { Logger } from '../../utils/logger';
import { ConnectionConfig } from '../../types';
import * as mysql from 'mysql2/promise';

// Mock mysql2/promise
jest.mock('mysql2/promise');
jest.mock('../../utils/logger');

describe('MySQLAdapter', () => {
    let adapter: MySQLAdapter;
    let mockLogger: jest.Mocked<Logger>;
    let mockPool: jest.Mocked<mysql.Pool>;
    let mockConnection: jest.Mocked<mysql.PoolConnection>;
    const config: ConnectionConfig = {
        id: 'test-connection',
        name: 'Test Connection',
        type: 'mysql',
        host: 'localhost',
        port: 3306,
        user: 'test_user',
        password: 'test_password',
        database: 'test_db',
        environment: 'dev'
    };

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Mock Logger
        mockLogger = {
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        } as unknown as jest.Mocked<Logger>;

        // Mock Pool Connection
        mockConnection = {
            query: jest.fn(),
            release: jest.fn()
        } as unknown as jest.Mocked<mysql.PoolConnection>;

        // Mock Pool
        mockPool = {
            query: jest.fn(),
            getConnection: jest.fn().mockResolvedValue(mockConnection),
            end: jest.fn().mockResolvedValue(undefined)
        } as unknown as jest.Mocked<mysql.Pool>;

        // Mock mysql.createPool
        (mysql.createPool as jest.Mock).mockReturnValue(mockPool);

        // Create adapter instance
        adapter = new MySQLAdapter(config, mockLogger);
    });

    describe('Constructor & Properties', () => {
        it('should initialize with correct config', () => {
            expect(adapter.type).toBe('mysql');
            expect(adapter.id).toBe('test-connection');
            expect(adapter.isConnected()).toBe(false);
        });

        it('should have correct supported versions', () => {
            expect(adapter.supportedVersions).toHaveLength(2);
            expect(adapter.supportedVersions[0].min).toBe('8.0.0');
            expect(adapter.supportedVersions[1].min).toBe('10.6.0'); // MariaDB
        });

        it('should have all database features enabled', () => {
            expect(adapter.features.transactions).toBe(true);
            expect(adapter.features.preparedStatements).toBe(true);
            expect(adapter.features.explain).toBe(true);
            expect(adapter.features.profiling).toBe(true);
            expect(adapter.features.performanceSchema).toBe(true);
        });
    });

    describe('Connection Management', () => {
        it('should connect successfully to MySQL', async () => {
            // Mock version query
            mockPool.query.mockResolvedValueOnce([
                [{ version: '8.0.35' }],
                []
            ] as unknown as [mysql.RowDataPacket[], mysql.FieldPacket[]]);

            await adapter.connect(config);

            expect(mysql.createPool).toHaveBeenCalledWith(
                expect.objectContaining({
                    host: 'localhost',
                    port: 3306,
                    user: 'test_user',
                    password: 'test_password',
                    database: 'test_db'
                })
            );
            expect(adapter.isConnected()).toBe(true);
            expect(adapter.version).toBe('8.0.35');
            expect(adapter.isMariaDB).toBe(false);
        });

        it('should detect MariaDB version', async () => {
            // Mock MariaDB version query
            mockPool.query.mockResolvedValueOnce([
                [{ version: '10.11.5-MariaDB' }],
                []
            ] as unknown as [mysql.RowDataPacket[], mysql.FieldPacket[]]);

            await adapter.connect(config);

            expect(adapter.version).toBe('10.11.5-MariaDB');
            expect(adapter.isMariaDB).toBe(true);
        });

        it('should handle connection errors', async () => {
            mockPool.query.mockRejectedValueOnce(new Error('Connection failed'));

            await expect(adapter.connect(config)).rejects.toThrow();
            expect(adapter.isConnected()).toBe(false);
        });

        it('should disconnect properly', async () => {
            // Setup connected state
            mockPool.query.mockResolvedValueOnce([
                [{ version: '8.0.35' }],
                []
            ] as unknown as [mysql.RowDataPacket[], mysql.FieldPacket[]]);
            await adapter.connect(config);

            // Disconnect
            await adapter.disconnect();

            expect(mockPool.end).toHaveBeenCalled();
            expect(adapter.isConnected()).toBe(false);
        });

        it('should not throw when disconnecting without being connected', async () => {
            await expect(adapter.disconnect()).resolves.not.toThrow();
        });
    });

    describe('Query Execution', () => {
        beforeEach(async () => {
            // Connect before query tests
            mockPool.query.mockResolvedValueOnce([
                [{ version: '8.0.35' }],
                []
            ] as unknown as [mysql.RowDataPacket[], mysql.FieldPacket[]]);
            await adapter.connect(config);
        });

        it('should execute SELECT query successfully', async () => {
            const rows = [
                { id: 1, name: 'Test' },
                { id: 2, name: 'Test2' }
            ];
            const fields = [
                { name: 'id', type: '1' },
                { name: 'name', type: '253' }
            ];

            mockPool.query.mockResolvedValueOnce([rows, fields] as unknown as [mysql.RowDataPacket[], mysql.FieldPacket[]]);

            const result = await adapter.query('SELECT * FROM users WHERE id = ?', [1]);

            expect(result.rows).toEqual(rows);
            expect(result.fields).toHaveLength(2);
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Executing query'));
        });

        it('should track query performance', async () => {
            mockPool.query.mockImplementation(() => {
                // Simulate slow query
                return new Promise((resolve) => {
                    setTimeout(() => {
                        resolve([[{ id: 1 }], []] as [mysql.RowDataPacket[], mysql.FieldPacket[]]);
                    }, 150);
                });
            });

            await adapter.query('SELECT * FROM users');

            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Slow query detected')
            );
        });

        it('should handle query errors', async () => {
            mockPool.query.mockRejectedValueOnce(new Error('Query failed'));

            await expect(
                adapter.query('SELECT * FROM nonexistent')
            ).rejects.toThrow('Query execution failed');

            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should throw error when not connected', async () => {
            const unconnectedAdapter = new MySQLAdapter(config, mockLogger);

            await expect(
                unconnectedAdapter.query('SELECT 1')
            ).rejects.toThrow();
        });

        it('should handle parameterized queries', async () => {
            mockPool.query.mockResolvedValueOnce([
                [{ id: 1, name: 'Test' }],
                []
            ] as unknown as [mysql.RowDataPacket[], mysql.FieldPacket[]]);

            const result = await adapter.query(
                'SELECT * FROM users WHERE id = ? AND name = ?',
                [1, 'Test']
            );

            expect(result.rows).toHaveLength(1);
            expect(mockPool.query).toHaveBeenCalledWith(
                'SELECT * FROM users WHERE id = ? AND name = ?',
                [1, 'Test']
            );
        });

        it('should handle INSERT query with affectedRows', async () => {
            const resultSet = {
                affectedRows: 1,
                insertId: 123
            };

            mockPool.query.mockResolvedValueOnce([resultSet, []] as unknown as [mysql.OkPacket, mysql.FieldPacket[]]);

            const result = await adapter.query('INSERT INTO users (name) VALUES (?)', ['New User']);

            expect(result.affected).toBe(1);
            expect(result.insertId).toBe(123);
        });
    });

    describe('Connection Pooling', () => {
        beforeEach(async () => {
            mockPool.query.mockResolvedValueOnce([
                [{ version: '8.0.35' }],
                []
            ] as unknown as [mysql.RowDataPacket[], mysql.FieldPacket[]]);
            await adapter.connect(config);
        });

        it('should use withConnection for dedicated connection', async () => {
            // Mock the USE database query and the actual query
            mockConnection.query
                .mockResolvedValueOnce([[], []] as [mysql.RowDataPacket[], mysql.FieldPacket[]]) // USE database
                .mockResolvedValueOnce([[{ count: 5 }], []] as [mysql.RowDataPacket[], mysql.FieldPacket[]]); // SELECT query

            const result = await adapter.withConnection(async (conn) => {
                const [rows] = await conn.query('SELECT COUNT(*) as count FROM users') as [mysql.RowDataPacket[], mysql.FieldPacket[]];
                return rows;
            });

            expect(mockPool.getConnection).toHaveBeenCalled();
            expect(mockConnection.release).toHaveBeenCalled();
            expect(result).toEqual([{ count: 5 }]);
        });

        it('should release connection even on error', async () => {
            mockConnection.query.mockRejectedValueOnce(new Error('Query failed'));

            await expect(
                adapter.withConnection(async (conn) => {
                    await conn.query('SELECT * FROM users');
                })
            ).rejects.toThrow();

            expect(mockConnection.release).toHaveBeenCalled();
        });

        it('should select database when using withConnection', async () => {
            mockConnection.query
                .mockResolvedValueOnce([[], []] as [mysql.RowDataPacket[], mysql.FieldPacket[]]) // USE database
                .mockResolvedValueOnce([[{ result: 'ok' }], []] as [mysql.RowDataPacket[], mysql.FieldPacket[]]);  // Actual query

            await adapter.withConnection(async (conn) => {
                await conn.query('SELECT 1');
            });

            expect(mockConnection.query).toHaveBeenCalledWith(expect.stringContaining('USE'));
        });
    });

    describe('Schema Operations', () => {
        beforeEach(async () => {
            mockPool.query.mockResolvedValueOnce([
                [{ version: '8.0.35' }],
                []
            ] as unknown as [mysql.RowDataPacket[], mysql.FieldPacket[]]);
            await adapter.connect(config);
        });

        it('should get list of databases', async () => {
            mockPool.query.mockResolvedValueOnce([
                [
                    { Database: 'information_schema' },
                    { Database: 'test_db' },
                    { Database: 'mysql' }
                ],
                []
            ] as unknown as [mysql.RowDataPacket[], mysql.FieldPacket[]]);

            const databases = await adapter.getDatabases();

            expect(databases).toHaveLength(3);
            expect(databases[0].name).toBe('information_schema');
        });

        it('should get table schema', async () => {
            // getTableSchema uses withConnection internally
            mockPool.getConnection.mockResolvedValueOnce(mockConnection);

            // Mock the USE database query (from withConnection)
            mockConnection.query
                .mockResolvedValueOnce([[], []] as [mysql.RowDataPacket[], mysql.FieldPacket[]]); // USE database

            // Mock the pool queries (getColumns, getIndexes, getForeignKeys, getRowEstimate call pool.query, not connection.query)
            mockPool.query
                .mockResolvedValueOnce([ // getColumns - SELECT from INFORMATION_SCHEMA.COLUMNS
                    [
                        {
                            name: 'id',
                            type: 'int(11)',
                            nullable: 'NO',
                            defaultValue: null,
                            key: 'PRI',
                            extra: 'auto_increment'
                        }
                    ],
                    []
                ] as [mysql.RowDataPacket[], mysql.FieldPacket[]])
                .mockResolvedValueOnce([ // getIndexes - SELECT from INFORMATION_SCHEMA.STATISTICS
                    [
                        {
                            indexName: 'PRIMARY',
                            columnName: 'id',
                            nonUnique: 0,
                            indexType: 'BTREE',
                            seqInIndex: 1
                        }
                    ],
                    []
                ] as [mysql.RowDataPacket[], mysql.FieldPacket[]])
                .mockResolvedValueOnce([ // getForeignKeys
                    [],
                    []
                ] as [mysql.RowDataPacket[], mysql.FieldPacket[]])
                .mockResolvedValueOnce([ // getRowEstimate
                    [{ rowCount: 100 }],
                    []
                ] as [mysql.RowDataPacket[], mysql.FieldPacket[]]);

            const schema = await adapter.getTableSchema('test_db', 'users');

            expect(schema.columns).toHaveLength(1);
            expect(schema.columns[0].name).toBe('id');
            expect(schema.indexes).toHaveLength(1);
            expect(schema.rowEstimate).toBe(100);
        });

        it('should validate database and table names', async () => {
            await expect(
                adapter.getTableSchema('invalid;name', 'users')
            ).rejects.toThrow();

            await expect(
                adapter.getTableSchema('test_db', 'invalid;table')
            ).rejects.toThrow();
        });
    });

    describe('System Query Detection', () => {
        beforeEach(async () => {
            mockPool.query.mockResolvedValueOnce([
                [{ version: '8.0.35' }],
                []
            ] as unknown as [mysql.RowDataPacket[], mysql.FieldPacket[]]);
            await adapter.connect(config);
        });

        it('should bypass validation for SHOW queries', async () => {
            mockPool.query.mockResolvedValueOnce([
                [{ Database: 'test' }],
                []
            ] as unknown as [mysql.RowDataPacket[], mysql.FieldPacket[]]);

            // This query doesn't have parameters but should work because it's SHOW
            await expect(
                adapter.query('SHOW DATABASES')
            ).resolves.not.toThrow();
        });

        it('should bypass validation for INFORMATION_SCHEMA queries', async () => {
            mockPool.query.mockResolvedValueOnce([
                [{ table_name: 'users' }],
                []
            ] as unknown as [mysql.RowDataPacket[], mysql.FieldPacket[]]);

            await expect(
                adapter.query('SELECT table_name FROM information_schema.tables')
            ).resolves.not.toThrow();
        });

        it('should bypass validation for performance_schema queries', async () => {
            mockPool.query.mockResolvedValueOnce([
                [{ count: 10 }],
                []
            ] as unknown as [mysql.RowDataPacket[], mysql.FieldPacket[]]);

            await expect(
                adapter.query('SELECT COUNT(*) as count FROM performance_schema.events_statements_current')
            ).resolves.not.toThrow();
        });
    });

    describe('Error Recovery', () => {
        it('should handle pool creation failures', async () => {
            (mysql.createPool as jest.Mock).mockImplementation(() => {
                throw new Error('Pool creation failed');
            });

            const newAdapter = new MySQLAdapter(config, mockLogger);
            await expect(newAdapter.connect(config)).rejects.toThrow();
        });

        it('should log connection failures with details', async () => {
            mockPool.query.mockRejectedValueOnce(new Error('Connection timeout'));

            await expect(adapter.connect(config)).rejects.toThrow();
            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to connect'),
                expect.any(Error)
            );
        });

        it('should handle disconnection errors gracefully', async () => {
            mockPool.query.mockResolvedValueOnce([
                [{ version: '8.0.35' }],
                []
            ] as unknown as [mysql.RowDataPacket[], mysql.FieldPacket[]]);
            await adapter.connect(config);

            mockPool.end.mockRejectedValueOnce(new Error('Disconnect failed'));

            await expect(adapter.disconnect()).rejects.toThrow();
            expect(mockLogger.error).toHaveBeenCalled();
        });
    });
});
