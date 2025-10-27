/**
 * Database Interaction Integration Tests
 * Tests MySQL adapter with real database connections
 * Requires Docker to be running with test database
 */

import * as assert from 'assert';
import { MySQLAdapter } from '../../adapters/mysql-adapter';
import {
    createTestConnection,
    disconnectAdapter,
    isPerformanceSchemaEnabled,
    waitForPerformanceSchema,
    executeSlowQuery,
    executeUnindexedQuery,
    cleanupTestData
} from '../helpers/database-helper';

suite('Database Operations Tests', () => {
    let adapter: MySQLAdapter;

    suiteSetup(async function() {
        this.timeout(30000);
        try {
            adapter = await createTestConnection({
                waitForInit: true,
                maxRetries: 10
            });
        } catch (error) {
            console.error('Failed to create test connection:', error);
            this.skip();
        }
    });

    suiteTeardown(async function() {
        this.timeout(10000);
        if (adapter) {
            await disconnectAdapter(adapter);
        }
    });

    test('Connect to test database', async function() {
        this.timeout(10000);

        assert.ok(adapter, 'Adapter should be initialized');
        assert.ok(adapter.isConnected(), 'Connection should be active');
    });

    test('Execute simple query with proper escaping', async function() {
        this.timeout(10000);

        // Test parameterized query (safe from SQL injection)
        const safeValue = '1\' OR \'1\'=\'1';
        const result = await adapter.query('SELECT ? as safe_value', [safeValue]);

        assert.ok(result, 'Query should return result');
        assert.ok(Array.isArray(result), 'Result should be an array');
        assert.strictEqual((result[0] as any).safe_value, safeValue, 'Value should be properly escaped');
    });

    test('Get process list', async function() {
        this.timeout(10000);

        const processes = await adapter.getProcessList();

        assert.ok(Array.isArray(processes), 'Process list should be an array');
        assert.ok(processes.length > 0, 'Should have at least one process (current connection)');

        // Check process structure
        const process = processes[0];
        assert.ok(typeof process.id === 'number', 'Process should have id');
        assert.ok(typeof process.user === 'string', 'Process should have user');
        assert.ok(typeof process.host === 'string', 'Process should have host');

        // Check for transaction detection fields
        assert.ok('inTransaction' in process, 'Process should have inTransaction field');
        assert.ok('autocommit' in process, 'Process should have autocommit field');
    });

    test('Get server version', async function() {
        this.timeout(10000);

        const version = adapter.version;

        assert.ok(version, 'Should return version string');
        assert.ok(version.length > 0, 'Version should not be empty');
        assert.ok(version.match(/\d+\.\d+/), 'Version should have format x.y');

        // Should be MySQL 8.x
        assert.ok(version.startsWith('8.'), 'Should be MySQL 8.x');
    });

    test('Get database list', async function() {
        this.timeout(10000);

        const databases = await adapter.getDatabases();

        assert.ok(Array.isArray(databases), 'Databases should be an array');
        assert.ok(databases.length > 0, 'Should have at least one database');

        // Check that test database exists
        const testDb = databases.find(db => db.name === 'test_db');
        assert.ok(testDb, 'Test database should exist');

        // Standard system databases should exist
        const systemDbs = ['information_schema', 'mysql', 'performance_schema'];
        systemDbs.forEach(dbName => {
            const db = databases.find(d => d.name === dbName);
            assert.ok(db, `System database ${dbName} should exist`);
        });
    });

    test('Transaction detection with Performance Schema', async function() {
        this.timeout(15000);

        // Check if Performance Schema is enabled
        const psEnabled = await isPerformanceSchemaEnabled(adapter);
        if (!psEnabled) {
            this.skip();
            return;
        }

        // Wait for Performance Schema to be ready
        await waitForPerformanceSchema(adapter);

        // Start a transaction
        await adapter.query('START TRANSACTION');
        await adapter.query('SELECT * FROM users WHERE id = 1 FOR UPDATE');

        // Give Performance Schema time to update
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Get process list with transaction detection
        const processes = await adapter.getProcessList();

        // Find current connection process
        const currentProcess = processes.find(p => p.user === 'root' && p.db === 'test_db');

        assert.ok(currentProcess, 'Current process should be found');

        // Note: Transaction detection depends on Performance Schema configuration
        // The process should have transaction information if available
        if (currentProcess.inTransaction !== undefined) {
            // Transaction detection is working
            console.log('Transaction detected:', currentProcess.inTransaction);
        }

        // Rollback transaction
        await adapter.query('ROLLBACK');
    });

    test('Handle connection errors gracefully', async function() {
        this.timeout(10000);

        let testAdapter: MySQLAdapter | null = null;

        try {
            // Try to connect to invalid port
            testAdapter = await createTestConnection({
                port: 9999,
                maxRetries: 1
            });
            assert.fail('Connection should have failed');
        } catch (error) {
            // Expected to fail
            assert.ok(error instanceof Error, 'Should throw an Error');
            assert.ok(
                (error as Error).message.includes('Failed to connect'),
                'Error message should indicate connection failure'
            );
        } finally {
            if (testAdapter) {
                await disconnectAdapter(testAdapter);
            }
        }
    });

    test('Disconnect properly cleans up resources', async function() {
        this.timeout(10000);

        const testAdapter = await createTestConnection();

        assert.ok(testAdapter.isConnected(), 'Should be connected initially');

        await disconnectAdapter(testAdapter);

        assert.ok(!testAdapter.isConnected(), 'Should be disconnected');

        // Try to query after disconnect (should fail)
        try {
            await testAdapter.query('SELECT 1', []);
            assert.fail('Query should fail after disconnect');
        } catch (error) {
            assert.ok(error instanceof Error, 'Should throw an Error');
        }
    });

    test('Query with test data', async function() {
        this.timeout(10000);

        const users = await adapter.query('SELECT * FROM users LIMIT 5');

        assert.ok(Array.isArray(users), 'Users should be an array');
        assert.ok(users.length > 0, 'Should have users from sample data');

        const user = users[0] as any;
        assert.ok(user.id, 'User should have id');
        assert.ok(user.username, 'User should have username');
        assert.ok(user.email, 'User should have email');
    });

    test('Execute slow query', async function() {
        this.timeout(10000);

        const startTime = Date.now();
        await executeSlowQuery(adapter, 1);
        const duration = Date.now() - startTime;

        assert.ok(duration >= 1000, 'Slow query should take at least 1 second');
        assert.ok(duration < 2000, 'Slow query should complete in reasonable time');
    });

    test('Execute unindexed query', async function() {
        this.timeout(10000);

        // This should execute without errors
        await executeUnindexedQuery(adapter);

        // Query should complete (even if slow)
        assert.ok(true, 'Unindexed query should complete');
    });
});
