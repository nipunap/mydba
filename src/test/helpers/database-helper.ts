/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Database Test Helper Utilities
 * Provides helper functions for integration tests with Docker MySQL/MariaDB
 */

import { MySQLAdapter } from '../../adapters/mysql-adapter';
import { Logger } from '../../utils/logger';
import { ConnectionConfig } from '../../types';

export interface TestConnectionConfig extends ConnectionConfig {
    waitForInit?: boolean;
    maxRetries?: number;
}

/**
 * Create a test database connection
 */
export async function createTestConnection(
    config: Partial<TestConnectionConfig> = {}
): Promise<MySQLAdapter> {
    const logger = new Logger('TestHelper');

    const defaultConfig: ConnectionConfig = {
        id: 'test-connection',
        name: 'Test Connection',
        host: config.host || 'localhost',
        port: config.port || 3306,
        user: config.user || 'root',
        password: config.password || 'test_password',
        database: config.database || 'test_db',
        ssl: config.ssl,
        type: 'mysql',
        environment: 'dev'
    };

    const adapter = new MySQLAdapter(defaultConfig, logger);

    // Retry connection if needed (container might still be starting)
    const maxRetries = config.maxRetries || 5;
    let lastError: Error | null = null;

    for (let i = 0; i < maxRetries; i++) {
        try {
            await adapter.connect(defaultConfig);

            // Wait for test data to be initialized if requested
            if (config.waitForInit) {
                await waitForTestData(adapter);
            }

            return adapter;
        } catch (error) {
            lastError = error as Error;
            logger.warn(`Connection attempt ${i + 1}/${maxRetries} failed: ${(error as Error).message}`);

            if (i < maxRetries - 1) {
                await sleep(2000); // Wait 2 seconds before retry
            }
        }
    }

    throw new Error(`Failed to connect after ${maxRetries} attempts: ${lastError?.message}`);
}

/**
 * Wait for test data to be initialized
 */
async function waitForTestData(adapter: MySQLAdapter, maxWait: number = 30000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
        try {
            // Check if sample data exists
            const result = await adapter.query<{ count: number }>(
                'SELECT COUNT(*) as count FROM users'
            );

            if (result.rows && result.rows.length > 0 && result.rows[0].count > 0) {
                return; // Data is ready
            }
        } catch (error) {
            // Table might not exist yet, keep waiting
        }

        await sleep(1000);
    }

    throw new Error('Test data initialization timeout');
}

/**
 * Clean up test data (truncate tables)
 */
export async function cleanupTestData(adapter: MySQLAdapter): Promise<void> {
    try {
        // Disable foreign key checks temporarily
        await adapter.query('SET FOREIGN_KEY_CHECKS = 0');

        // Truncate tables in order
        await adapter.query('TRUNCATE TABLE order_items');
        await adapter.query('TRUNCATE TABLE orders');
        await adapter.query('TRUNCATE TABLE products');
        await adapter.query('TRUNCATE TABLE users');
        await adapter.query('TRUNCATE TABLE unindexed_logs');

        // Re-enable foreign key checks
        await adapter.query('SET FOREIGN_KEY_CHECKS = 1');
    } catch (error) {
        console.error('Failed to cleanup test data:', error);
        // Don't throw - cleanup is best effort
    }
}

/**
 * Wait for Performance Schema to populate
 */
export async function waitForPerformanceSchema(
    adapter: MySQLAdapter,
    minStatements: number = 5,
    maxWait: number = 10000
): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
        try {
            const result = await adapter.query<{ count: number }>(
                'SELECT COUNT(*) as count FROM performance_schema.events_statements_current'
            );

            if (result.rows && result.rows.length > 0 && result.rows[0].count >= minStatements) {
                return;
            }
        } catch (error) {
            // Performance Schema might not be ready yet
        }

        await sleep(500);
    }

    console.warn('Performance Schema did not populate within timeout');
}

/**
 * Check if Performance Schema is enabled
 */
export async function isPerformanceSchemaEnabled(adapter: MySQLAdapter): Promise<boolean> {
    try {
        const result = await adapter.query<{ Value: string }>(
            "SHOW VARIABLES LIKE 'performance_schema'"
        );

        return !!(result.rows && Array.isArray(result.rows) && result.rows.length > 0 && result.rows[0].Value === 'ON');
    } catch (error) {
        return false;
    }
}

/**
 * Start a long-running transaction for testing
 */
export async function startLongTransaction(
    adapter: MySQLAdapter,
    durationMs: number = 5000
): Promise<void> {
    await adapter.query('START TRANSACTION');
    await adapter.query('SELECT * FROM users WHERE id = 1 FOR UPDATE');

    // Keep transaction open
    setTimeout(async () => {
        try {
            await adapter.query('COMMIT');
        } catch (error) {
            // Ignore errors if connection was closed
        }
    }, durationMs);
}

/**
 * Create a slow query for testing
 */
export async function executeSlowQuery(
    adapter: MySQLAdapter,
    durationSeconds: number = 2
): Promise<void> {
    await adapter.query(`SELECT SLEEP(${durationSeconds})`);
}

/**
 * Execute query without index for testing
 */
export async function executeUnindexedQuery(adapter: MySQLAdapter): Promise<void> {
    // This query will do a full table scan
    await adapter.query(
        "SELECT * FROM unindexed_logs WHERE action LIKE '%login%'"
    );
}

/**
 * Get process list with transaction information
 */
export async function getProcessListWithTransactions(adapter: MySQLAdapter): Promise<any[]> {
    const processes = await adapter.getProcessList();
    return processes;
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Disconnect and cleanup adapter
 */
export async function disconnectAdapter(adapter: MySQLAdapter): Promise<void> {
    try {
        await adapter.disconnect();
    } catch (error) {
        // Ignore disconnect errors
    }
}

/**
 * Create MariaDB test connection
 */
export async function createMariaDBTestConnection(
    config: Partial<TestConnectionConfig> = {}
): Promise<MySQLAdapter> {
    return createTestConnection({
        ...config,
        port: config.port || 3307,
        database: config.database || 'test_db'
    });
}

/**
 * Reset Performance Schema statistics
 */
export async function resetPerformanceSchema(adapter: MySQLAdapter): Promise<void> {
    try {
        await adapter.query('CALL sys.ps_truncate_all_tables(FALSE)');
    } catch (error) {
        // sys schema might not be available, try alternative
        try {
            await adapter.query('TRUNCATE TABLE performance_schema.events_statements_history');
            await adapter.query('TRUNCATE TABLE performance_schema.events_statements_history_long');
        } catch (e) {
            console.warn('Could not reset Performance Schema:', e);
        }
    }
}

/**
 * Insert test transaction data
 */
export async function insertTestTransaction(adapter: MySQLAdapter): Promise<number> {
    await adapter.query('START TRANSACTION');

    const result = await adapter.query<{ insertId: number }>(
        `INSERT INTO users (username, email, password_hash, first_name, last_name)
         VALUES (?, ?, ?, ?, ?)`,
        ['test_user_' + Date.now(), 'test@example.com', 'hash123', 'Test', 'User']
    );

    // Don't commit - leave transaction open for testing
    return (result.rows && Array.isArray(result.rows) && result.rows.length > 0) ? result.rows[0].insertId : 0;
}

/**
 * Wait for condition with timeout
 */
export async function waitFor(
    condition: () => Promise<boolean>,
    timeoutMs: number = 5000,
    intervalMs: number = 500
): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
        if (await condition()) {
            return;
        }
        await sleep(intervalMs);
    }

    throw new Error('Condition timeout');
}
