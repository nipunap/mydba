/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * MariaDB Integration Tests
 * Tests MySQL adapter with MariaDB Docker container
 * Requires Docker to be running with MariaDB test container
 */

import * as assert from 'assert';
import { MySQLAdapter } from '../../adapters/mysql-adapter';
import {
    createMariaDBTestConnection,
    disconnectAdapter,
    isPerformanceSchemaEnabled,
    waitForPerformanceSchema,
    executeSlowQuery,
    executeUnindexedQuery,
    cleanupTestData as _cleanupTestData
} from '../helpers/database-helper';

suite('MariaDB Integration Tests', () => {
    let adapter: MySQLAdapter;

    suiteSetup(async function() {
        this.timeout(30000);
        try {
            adapter = await createMariaDBTestConnection({
                waitForInit: true,
                maxRetries: 10,
                user: 'test_user',
                password: 'test_password'
            });
        } catch {
            console.error('Failed to create MariaDB test connection:', error);
            console.error('Make sure MariaDB container is running on port 3307');
            this.skip();
        }
    });

    suiteTeardown(async function() {
        this.timeout(10000);
        if (adapter) {
            await disconnectAdapter(adapter);
        }
    });

    test('Connect to MariaDB test database', async function() {
        this.timeout(10000);

        assert.ok(adapter, 'Adapter should be initialized');
        assert.ok(adapter.isConnected(), 'Connection should be active');
    });

    test('Detect MariaDB version correctly', async function() {
        this.timeout(10000);

        const version = adapter.version;

        assert.ok(version, 'Should return version string');
        assert.ok(version.length > 0, 'Version should not be empty');

        // MariaDB version string contains "MariaDB"
        assert.ok(
            version.toLowerCase().includes('mariadb'),
            `Version should contain "MariaDB", got: ${version}`
        );

        // Should be MariaDB 10.11
        assert.ok(
            version.includes('10.11'),
            `Should be MariaDB 10.11, got: ${version}`
        );

        // Check isMariaDB flag
        assert.ok(adapter.isMariaDB, 'Adapter should detect MariaDB');
    });

    test('Execute simple query with proper escaping', async function() {
        this.timeout(10000);

        // Test parameterized query (safe from SQL injection)
        const safeValue = '1\' OR \'1\'=\'1';
        const result = await adapter.query<{ safe_value: string }>(
            'SELECT ? as safe_value',
            [safeValue]
        );

        assert.ok(result.rows, 'Query should return rows');
        assert.ok(Array.isArray(result.rows), 'Rows should be an array');
        assert.strictEqual(
            result.rows[0].safe_value,
            safeValue,
            'Value should be properly escaped'
        );
    });

    test('Get MariaDB database list', async function() {
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

    test('Get MariaDB tables from test database', async function() {
        this.timeout(10000);

        const tables = await adapter.getTables('test_db');

        assert.ok(Array.isArray(tables), 'Tables should be an array');
        assert.ok(tables.length > 0, 'Should have at least one table');

        // Check for sample data tables
        const expectedTables = ['users', 'products', 'orders', 'order_items', 'unindexed_logs'];
        expectedTables.forEach(tableName => {
            const table = tables.find(t => t.name === tableName);
            assert.ok(table, `Table ${tableName} should exist`);
        });
    });

    test('Performance Schema is enabled in MariaDB', async function() {
        this.timeout(10000);

        const psEnabled = await isPerformanceSchemaEnabled(adapter);

        assert.ok(psEnabled, 'Performance Schema should be enabled');

        // Verify we can query performance schema
        const result = await adapter.query<{ count: number }>(
            'SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = "performance_schema"'
        );

        assert.ok(result.rows && result.rows.length > 0, 'Should return result');
        assert.ok(result.rows && result.rows[0].count > 0, 'Performance Schema should have tables');
    });

    test('test_user has SELECT permission on performance_schema', async function() {
        this.timeout(10000);

        // This query should succeed with our new permissions
        const result = await adapter.query<{ count: number }>(
            'SELECT COUNT(*) as count FROM performance_schema.events_statements_summary_by_digest'
        );

        assert.ok(result.rows, 'Should be able to query performance_schema');
        assert.ok(Array.isArray(result.rows), 'Should return rows array');
    });

    test('test_user has UPDATE permission on performance_schema configuration', async function() {
        this.timeout(10000);

        // This query should succeed with our new UPDATE permissions
        await adapter.query(
            `UPDATE performance_schema.setup_instruments
             SET ENABLED = 'YES', TIMED = 'YES'
             WHERE NAME LIKE 'statement/%' LIMIT 1`
        );

        // If we get here without error, the permission works
        assert.ok(true, 'Should be able to UPDATE performance_schema configuration');
    });

    test('Get MariaDB process list', async function() {
        this.timeout(10000);

        const processes = await adapter.getProcessList();

        assert.ok(Array.isArray(processes), 'Process list should be an array');
        assert.ok(processes.length >= 0, 'Process list should be valid');

        if (processes.length > 0) {
            // Check process structure
            const process = processes[0];
            assert.ok(typeof process.id === 'number', 'Process should have id');
            assert.ok(typeof process.user === 'string', 'Process should have user');
            assert.ok(typeof process.host === 'string', 'Process should have host');
        }
    });

    test('Get MariaDB global variables', async function() {
        this.timeout(10000);

        const variables = await adapter.getGlobalVariables();

        assert.ok(Array.isArray(variables), 'Variables should be an array');
        assert.ok(variables.length > 0, 'Should have global variables');

        // Check for MariaDB-specific variables
        const versionVar = variables.find(v => v.name === 'version');
        assert.ok(versionVar, 'Should have version variable');
        assert.ok(
            versionVar.value.toLowerCase().includes('mariadb'),
            'Version should indicate MariaDB'
        );

        // Check Performance Schema variable
        const psVar = variables.find(v => v.name === 'performance_schema');
        assert.ok(psVar, 'Should have performance_schema variable');
        assert.strictEqual(psVar.value, 'ON', 'Performance Schema should be ON');
    });

    test('Get MariaDB session variables', async function() {
        this.timeout(10000);

        const variables = await adapter.getSessionVariables();

        assert.ok(Array.isArray(variables), 'Variables should be an array');
        assert.ok(variables.length > 0, 'Should have session variables');

        // Verify some common session variables exist
        const autocommit = variables.find(v => v.name === 'autocommit');
        assert.ok(autocommit, 'Should have autocommit variable');
    });

    test('Get MariaDB metrics', async function() {
        this.timeout(10000);

        const metrics = await adapter.getMetrics();

        assert.ok(metrics, 'Should return metrics object');
        assert.ok(typeof metrics.connections === 'number', 'Should have connections count');
        assert.ok(typeof metrics.threadsRunning === 'number', 'Should have threads running');
        assert.ok(typeof metrics.uptime === 'number', 'Should have uptime');
        assert.ok(metrics.uptime > 0, 'Uptime should be positive');
    });

    test('Query MariaDB with test data', async function() {
        this.timeout(10000);

        const result = await adapter.query<any>('SELECT * FROM users LIMIT 5');

        assert.ok(result.rows, 'Should return rows');
        assert.ok(Array.isArray(result.rows), 'Rows should be an array');
        assert.ok(result.rows.length > 0, 'Should have users from sample data');

        const user = result.rows[0];
        assert.ok(user.id, 'User should have id');
        assert.ok(user.username, 'User should have username');
        assert.ok(user.email, 'User should have email');
    });

    test('Execute slow query in MariaDB', async function() {
        this.timeout(15000);

        const startTime = Date.now();
        await executeSlowQuery(adapter, 1);
        const duration = Date.now() - startTime;

        assert.ok(duration >= 1000, 'Slow query should take at least 1 second');
        assert.ok(duration < 3000, 'Slow query should complete in reasonable time');
    });

    test('Execute unindexed query in MariaDB', async function() {
        this.timeout(10000);

        // This should execute without errors
        await executeUnindexedQuery(adapter);

        // Query should complete (even if slow)
        assert.ok(true, 'Unindexed query should complete');
    });

    test('MariaDB transaction support', async function() {
        this.timeout(10000);

        // Start transaction
        await adapter.query('START TRANSACTION');

        // Insert test data
        const testUsername = 'mariadb_test_user_' + Date.now();
        await adapter.query(
            'INSERT INTO users (username, email, password_hash, first_name, last_name) VALUES (?, ?, ?, ?, ?)',
            [testUsername, 'test@mariadb.com', 'hash123', 'MariaDB', 'Test']
        );

        // Verify data exists in transaction
        const result = await adapter.query<any>(
            'SELECT * FROM users WHERE username = ?',
            [testUsername]
        );
        assert.ok(result.rows, 'Should return rows');
        assert.strictEqual(result.rows.length, 1, 'Should find inserted user in transaction');

        // Rollback
        await adapter.query('ROLLBACK');

        // Verify data was rolled back
        const resultAfter = await adapter.query<any>(
            'SELECT * FROM users WHERE username = ?',
            [testUsername]
        );
        assert.ok(resultAfter.rows, 'Should return rows');
        assert.strictEqual(resultAfter.rows.length, 0, 'User should be rolled back');
    });

    test('MariaDB slow query detection', async function() {
        this.timeout(15000);

        const psEnabled = await isPerformanceSchemaEnabled(adapter);
        if (!psEnabled) {
            this.skip();
            return;
        }

        // Wait for Performance Schema to be ready
        await waitForPerformanceSchema(adapter);

        // Execute a slow query
        await executeSlowQuery(adapter, 1);

        // Give Performance Schema time to record the query
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Query slow queries from performance schema
        const result = await adapter.query<any>(
            `SELECT
                DIGEST_TEXT,
                COUNT_STAR,
                SUM_TIMER_WAIT / 1000000000 AS total_time_ms
             FROM performance_schema.events_statements_summary_by_digest
             WHERE DIGEST_TEXT IS NOT NULL
             ORDER BY SUM_TIMER_WAIT DESC
             LIMIT 10`
        );

        assert.ok(result.rows && result.rows.length > 0, 'Should have slow queries recorded');

        // Find our SLEEP query
        const sleepQuery = result.rows && result.rows.find((row: any) =>
            row.DIGEST_TEXT && row.DIGEST_TEXT.includes('SLEEP')
        );

        if (sleepQuery) {
            assert.ok(
                sleepQuery.total_time_ms >= 1000,
                'Sleep query should have taken at least 1 second'
            );
        }
    });

    test('MariaDB EXPLAIN query support', async function() {
        this.timeout(10000);

        // Test EXPLAIN on a simple query
        const result = await adapter.query<any>(
            'EXPLAIN SELECT * FROM users WHERE email = "test@example.com"'
        );

        assert.ok(result.rows, 'EXPLAIN should return rows');
        assert.ok(result.rows && result.rows.length > 0, 'EXPLAIN should return execution plan');

        // Check for EXPLAIN output fields
        const explainRow = result.rows && result.rows[0];
        assert.ok('id' in explainRow || 'select_type' in explainRow, 'Should have EXPLAIN fields');
    });

    test('MariaDB supports parameterized queries', async function() {
        this.timeout(10000);

        const testEmail = 'mariadb.test@example.com';
        const result = await adapter.query<any>(
            'SELECT * FROM users WHERE email = ?',
            [testEmail]
        );

        assert.ok(result.rows, 'Should return rows');
        assert.ok(Array.isArray(result.rows), 'Rows should be an array');
    });

    test('Handle MariaDB connection errors gracefully', async function() {
        this.timeout(10000);

        let testAdapter: MySQLAdapter | null = null;

        try {
            // Try to connect to invalid port
            testAdapter = await createMariaDBTestConnection({
                port: 9999,
                maxRetries: 1,
                user: 'test_user',
                password: 'test_password'
            });
            assert.fail('Connection should have failed');
        } catch {
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

    test('MariaDB disconnect properly cleans up resources', async function() {
        this.timeout(10000);

        const testAdapter = await createMariaDBTestConnection({
            user: 'test_user',
            password: 'test_password'
        });

        assert.ok(testAdapter.isConnected(), 'Should be connected initially');

        await disconnectAdapter(testAdapter);

        assert.ok(!testAdapter.isConnected(), 'Should be disconnected');

        // Try to query after disconnect (should fail)
        try {
            await testAdapter.query('SELECT 1');
            assert.fail('Query should fail after disconnect');
        } catch {
            assert.ok(error instanceof Error, 'Should throw an Error');
        }
    });

    test('MariaDB supports InnoDB storage engine', async function() {
        this.timeout(10000);

        const result = await adapter.query<any>(
            'SHOW TABLE STATUS FROM test_db WHERE Name = "users"'
        );

        assert.ok(result.rows && result.rows.length > 0, 'Should find users table');
        assert.ok(result.rows, 'Should have rows');
        assert.strictEqual(
            result.rows[0].Engine,
            'InnoDB',
            'Should use InnoDB engine'
        );
    });

    test('MariaDB character set and collation', async function() {
        this.timeout(10000);

        const result = await adapter.query<any>(
            'SHOW TABLE STATUS FROM test_db WHERE Name = "users"'
        );

        assert.ok(result.rows && result.rows.length > 0, 'Should find users table');
        assert.ok(result.rows, 'Should have rows');

        const tableStatus = result.rows[0];
        assert.ok(tableStatus.Collation, 'Should have collation');
        assert.ok(
            tableStatus.Collation.includes('utf8mb4'),
            'Should use utf8mb4 collation'
        );
    });
});
