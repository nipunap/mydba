/**
 * Transaction Manager
 * Provides transactional DDL execution with rollback capabilities
 */

import { ITransactionManager, ITransactionOptions, ITransactionResult } from './interfaces';
import { Logger } from '../utils/logger';
import { IDatabaseAdapter } from '../adapters/database-adapter';

/**
 * Transaction state
 */
interface TransactionState {
    connectionId: string;
    operations: Array<{ sql: string; rollbackSQL?: string }>;
    startTime: number;
    timeout?: NodeJS.Timeout;
}

/**
 * Transaction manager implementation
 */
export class TransactionManager implements ITransactionManager {
    private activeTransactions = new Map<string, TransactionState>();
    private executedOperations = new Map<string, string[]>(); // Track executed operations for idempotency

    constructor(
        private logger: Logger,
        private getAdapter: (connectionId: string) => Promise<IDatabaseAdapter | undefined>
    ) {}

    /**
     * Execute operations within a transaction
     */
    async execute(
        connectionId: string,
        operations: Array<() => Promise<unknown>>,
        options: ITransactionOptions = {}
    ): Promise<ITransactionResult> {
        const transactionId = `tx-${connectionId}-${Date.now()}`;
        const affectedObjects: string[] = [];
        const executedOps: string[] = [];

        this.logger.info(`Starting transaction ${transactionId} with ${operations.length} operations`);

        // Create transaction state
        const state: TransactionState = {
            connectionId,
            operations: [],
            startTime: Date.now()
        };

        // Set timeout if specified
        if (options.timeout) {
            state.timeout = setTimeout(() => {
                this.logger.warn(`Transaction ${transactionId} timed out after ${options.timeout}ms`);
                this.rollback(connectionId).catch(error => {
                    this.logger.error('Error during timeout rollback:', error as Error);
                });
            }, options.timeout);
        }

        this.activeTransactions.set(transactionId, state);

        try {
            const adapter = await this.getAdapter(connectionId);
            if (!adapter) {
                throw new Error(`No adapter found for connection ${connectionId}`);
            }

            // Dry run mode - don't actually execute
            if (options.dryRun) {
                this.logger.info(`DRY RUN mode - operations will not be executed`);

                for (const operation of operations) {
                    try {
                        // Try to get SQL from operation (for logging)
                        const result = await operation();
                        if (result && typeof result === 'object' && 'sql' in result) {
                            this.logger.info(`[DRY RUN] Would execute: ${result.sql}`);
                        }
                    } catch (error) {
                        this.logger.error(`[DRY RUN] Operation would fail:`, error as Error);
                        throw error;
                    }
                }

                return {
                    success: true,
                    rollback: false,
                    affectedObjects: []
                };
            }

            // Execute operations in sequence
            for (let i = 0; i < operations.length; i++) {
                const operation = operations[i];

                try {
                    this.logger.debug(`Executing operation ${i + 1}/${operations.length}`);

                    const result = await operation();

                    // Track executed operation
                    if (result && typeof result === 'object' && 'sql' in result) {
                        const typedResult = result as {
                            sql: string;
                            rollbackSQL?: string;
                            affectedObject?: string;
                        };
                        executedOps.push(typedResult.sql);
                        state.operations.push({
                            sql: typedResult.sql,
                            rollbackSQL: typedResult.rollbackSQL
                        });

                        // Extract affected objects
                        if (typedResult.affectedObject) {
                            affectedObjects.push(typedResult.affectedObject);
                        }
                    }

                    this.logger.debug(`Operation ${i + 1} completed successfully`);
                } catch (error) {
                    this.logger.error(`Operation ${i + 1} failed:`, error as Error);

                    // Rollback all previously executed operations
                    this.logger.warn(`Rolling back ${executedOps.length} operations`);

                    try {
                        await this.rollbackOperations(adapter, state.operations);
                    } catch (rollbackError) {
                        this.logger.error('Rollback failed:', rollbackError as Error);
                        // Even if rollback fails, we want to report the original error
                    }

                    return {
                        success: false,
                        rollback: true,
                        error: error as Error,
                        affectedObjects
                    };
                }
            }

            // Clear timeout
            if (state.timeout) {
                clearTimeout(state.timeout);
            }

            // Track executed operations for idempotency
            this.executedOperations.set(connectionId, executedOps);

            this.logger.info(`Transaction ${transactionId} completed successfully`);

            return {
                success: true,
                rollback: false,
                affectedObjects
            };
        } catch (error) {
            this.logger.error(`Transaction ${transactionId} failed:`, error as Error);

            return {
                success: false,
                rollback: false,
                error: error as Error,
                affectedObjects
            };
        } finally {
            // Clean up
            if (state.timeout) {
                clearTimeout(state.timeout);
            }
            this.activeTransactions.delete(transactionId);
        }
    }

    /**
     * Rollback a transaction
     */
    async rollback(connectionId: string): Promise<void> {
        const adapter = await this.getAdapter(connectionId);
        if (!adapter) {
            throw new Error(`No adapter found for connection ${connectionId}`);
        }

        // Find active transaction for this connection
        const transaction = Array.from(this.activeTransactions.values())
            .find(tx => tx.connectionId === connectionId);

        if (!transaction) {
            this.logger.warn(`No active transaction found for connection ${connectionId}`);
            return;
        }

        this.logger.info(`Rolling back transaction for connection ${connectionId}`);

        await this.rollbackOperations(adapter, transaction.operations);
    }

    /**
     * Rollback specific operations
     */
    private async rollbackOperations(
        adapter: IDatabaseAdapter,
        operations: Array<{ sql: string; rollbackSQL?: string }>
    ): Promise<void> {
        // Rollback in reverse order
        const reversedOps = [...operations].reverse();

        for (const op of reversedOps) {
            if (op.rollbackSQL) {
                try {
                    this.logger.debug(`Executing rollback: ${op.rollbackSQL}`);
                    await adapter.query(op.rollbackSQL);
                    this.logger.debug('Rollback operation succeeded');
                } catch (error) {
                    this.logger.error(`Rollback operation failed for: ${op.rollbackSQL}`, error as Error);
                    // Continue with other rollback operations
                }
            } else {
                this.logger.warn(`No rollback SQL available for operation: ${op.sql}`);
            }
        }
    }

    /**
     * Check if an operation has already been executed (idempotency check)
     */
    async checkIdempotency(connectionId: string, operation: string): Promise<boolean> {
        const executedOps = this.executedOperations.get(connectionId) || [];

        // Normalize operation for comparison
        const normalizedOp = this.normalizeSQL(operation);
        const normalizedExecuted = executedOps.map(op => this.normalizeSQL(op));

        const isIdempotent = normalizedExecuted.includes(normalizedOp);

        if (isIdempotent) {
            this.logger.info(`Operation already executed (idempotent): ${operation}`);
        }

        return isIdempotent;
    }

    /**
     * Normalize SQL for idempotency comparison
     */
    private normalizeSQL(sql: string): string {
        return sql
            .replace(/\s+/g, ' ')
            .replace(/;+$/, '')
            .trim()
            .toLowerCase();
    }

    /**
     * Generate rollback SQL for common operations
     */
    generateRollbackSQL(sql: string): string | undefined {
        const normalized = sql.trim().toUpperCase();

        // CREATE INDEX -> DROP INDEX
        const createIndexMatch = normalized.match(/CREATE\s+INDEX\s+(\w+)\s+ON\s+(\w+)/);
        if (createIndexMatch) {
            const indexName = createIndexMatch[1];
            const tableName = createIndexMatch[2];
            return `DROP INDEX ${indexName} ON ${tableName}`;
        }

        // CREATE TABLE -> DROP TABLE
        const createTableMatch = normalized.match(/CREATE\s+TABLE\s+(\w+)/);
        if (createTableMatch) {
            const tableName = createTableMatch[1];
            return `DROP TABLE ${tableName}`;
        }

        // ALTER TABLE ADD COLUMN -> ALTER TABLE DROP COLUMN
        const addColumnMatch = normalized.match(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)/);
        if (addColumnMatch) {
            const tableName = addColumnMatch[1];
            const columnName = addColumnMatch[2];
            return `ALTER TABLE ${tableName} DROP COLUMN ${columnName}`;
        }

        // For other operations, no automatic rollback
        this.logger.warn(`No automatic rollback SQL generation for: ${sql}`);
        return undefined;
    }

    /**
     * Clear executed operations history
     */
    clearHistory(connectionId?: string): void {
        if (connectionId) {
            this.executedOperations.delete(connectionId);
            this.logger.debug(`Cleared operation history for connection ${connectionId}`);
        } else {
            this.executedOperations.clear();
            this.logger.debug('Cleared all operation history');
        }
    }

    /**
     * Get active transactions count
     */
    getActiveTransactionsCount(): number {
        return this.activeTransactions.size;
    }

    /**
     * Dispose of the transaction manager
     */
    dispose(): void {
        // Clear all timeouts
        for (const transaction of this.activeTransactions.values()) {
            if (transaction.timeout) {
                clearTimeout(transaction.timeout);
            }
        }

        this.activeTransactions.clear();
        this.executedOperations.clear();

        this.logger.info('Transaction manager disposed');
    }
}
