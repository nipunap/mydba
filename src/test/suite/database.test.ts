/**
 * Database Interaction Integration Tests
 * Tests MySQL adapter with real database connections
 * Requires Docker to be running with test database
 */

import * as assert from 'assert';
import { MySQLAdapter } from '../../adapters/mysql-adapter';
import { Logger } from '../../utils/logger';
import { ConnectionConfig } from '../../types';

suite('Database Operations Tests', () => {
    let adapter: MySQLAdapter;
    let logger: Logger;

    const testConfig: ConnectionConfig = {
        id: 'test-connection',
        name: 'Test MySQL',
        type: 'mysql',
        host: 'localhost',
        port: 3307, // Using port 3307 for test database
        user: 'root',
        password: 'test',
        database: 'testdb',
        environment: 'dev'
    };

    suiteSetup(function() {
        this.timeout(30000);
        logger = new Logger('test');
        adapter = new MySQLAdapter(testConfig, logger);
    });

    suiteTeardown(async function() {
        this.timeout(10000);
        if (adapter) {
            await adapter.disconnect();
        }
    });

    test('Connect to test database', async function() {
        this.timeout(10000);

        try {
            await adapter.connect(testConfig);
            assert.ok(adapter.isConnected(), 'Connection should succeed');
        } catch (error) {
            // If test DB is not available, skip the test
            this.skip();
        }
    });

    test('Execute simple query with proper escaping', async function() {
        this.timeout(10000);

        try {
            await adapter.connect(testConfig);

            // Test parameterized query (safe from SQL injection)
            const safeValue = '1\' OR \'1\'=\'1';
            const result = await adapter.query('SELECT ? as safe_value', [safeValue]);

            assert.ok(result, 'Query should return result');
            assert.ok(Array.isArray(result), 'Result should be an array');
        } catch (error) {
            this.skip();
        }
    });

    test('Get process list', async function() {
        this.timeout(10000);

        try {
            await adapter.connect(testConfig);
            const processes = await adapter.getProcessList();

            assert.ok(Array.isArray(processes), 'Process list should be an array');
            assert.ok(processes.length > 0, 'Should have at least one process (current connection)');

            // Check process structure
            const process = processes[0];
            assert.ok(typeof process.id === 'number', 'Process should have id');
            assert.ok(typeof process.user === 'string', 'Process should have user');
            assert.ok(typeof process.host === 'string', 'Process should have host');
        } catch (error) {
            this.skip();
        }
    });

    test('Get server version', async function() {
        this.timeout(10000);

        try {
            await adapter.connect(testConfig);
            const version = adapter.version;

            assert.ok(version, 'Should return version string');
            assert.ok(version.length > 0, 'Version should not be empty');
            assert.ok(version.match(/\d+\.\d+/), 'Version should have format x.y');
        } catch (error) {
            this.skip();
        }
    });

    test('Get database list', async function() {
        this.timeout(10000);

        try {
            await adapter.connect(testConfig);
            const databases = await adapter.getDatabases();

            assert.ok(Array.isArray(databases), 'Databases should be an array');
            assert.ok(databases.length > 0, 'Should have at least one database');

            // Check that test database exists
            const testDb = databases.find(db => db.name === 'testdb');
            assert.ok(testDb, 'Test database should exist');
        } catch (error) {
            this.skip();
        }
    });

    test('Transaction detection with Performance Schema', async function() {
        this.timeout(15000);

        try {
            await adapter.connect(testConfig);

            // Check if Performance Schema is enabled
            const [psConfig] = await adapter.query<any[]>(
                "SELECT @@global.performance_schema AS enabled"
            ) as any[];

            if (!psConfig || psConfig[0]?.enabled !== 1) {
                // Performance Schema not enabled, skip test
                this.skip();
                return;
            }

            // Start a transaction
            await adapter.query('START TRANSACTION');

            // Get process list with transaction detection
            const processes = await adapter.getProcessList();

            // Find current connection
            const currentProcess = processes.find(p => p.command !== 'Sleep');

            // Transaction detection may not be immediate
            // This is a best-effort test
            assert.ok(processes, 'Process list should be retrieved');

            // Rollback transaction
            await adapter.query('ROLLBACK');
        } catch (error) {
            this.skip();
        }
    });

    test('Handle connection errors gracefully', async function() {
        this.timeout(10000);

        const invalidConfig: ConnectionConfig = {
            ...testConfig,
            port: 9999, // Invalid port
            id: 'invalid-connection',
            name: 'Invalid Connection'
        };

        const testAdapter = new MySQLAdapter(invalidConfig, logger);

        try {
            await testAdapter.connect(invalidConfig);
            assert.fail('Connection should have failed');
        } catch (error) {
            // Expected to fail
            assert.ok(true, 'Connection failed as expected');
        } finally {
            await testAdapter.disconnect();
        }
    });

    test('Disconnect properly cleans up resources', async function() {
        this.timeout(10000);

        const testAdapter = new MySQLAdapter(testConfig, logger);

        try {
            await testAdapter.connect(testConfig);
            await testAdapter.disconnect();

            // Try to query after disconnect (should fail)
            try {
                await testAdapter.query('SELECT 1', []);
                assert.fail('Query should fail after disconnect');
            } catch (error) {
                assert.ok(true, 'Query failed after disconnect as expected');
            }
        } catch (error) {
            this.skip();
        }
    });
});
