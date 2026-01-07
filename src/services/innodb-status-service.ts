/**
 * InnoDB Status Service
 * Service for monitoring InnoDB storage engine status
 */

import { Logger } from '../utils/logger';
import { IDatabaseAdapter } from '../adapters/database-adapter';
import { EventBus } from './event-bus';
import { EventPriority } from '../core/interfaces';
import { InnoDBStatus, HealthAlert, StatusComparison } from '../types/storage-engine-types';
import { StorageEngineParser } from './storage-engine-parser';

export class InnoDBStatusService {
    private parser: StorageEngineParser;
    private statusCache: Map<string, { status: InnoDBStatus; timestamp: number }> = new Map();
    private readonly CACHE_TTL = 30000; // 30 seconds

    constructor(
        private logger: Logger,
        private eventBus: EventBus
    ) {
        this.parser = new StorageEngineParser();
    }

    /**
     * Get InnoDB status for a connection
     */
    async getInnoDBStatus(
        connectionId: string,
        adapter: IDatabaseAdapter
    ): Promise<InnoDBStatus> {
        try {
            // Check cache first
            const cached = this.statusCache.get(connectionId);
            if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
                this.logger.debug(`Returning cached InnoDB status for connection ${connectionId}`);
                return cached.status;
            }

            // Execute SHOW ENGINE INNODB STATUS
            const result = await adapter.query<unknown>('SHOW ENGINE INNODB STATUS');

            // Handle different result formats from mysql2 driver
            // Format 1: {rows: [{...}], fields: [...]} (OkPacket-style)
            // Format 2: [{...}] (plain array)
            type StatusRow = { Status?: string; STATUS?: string; status?: string };
            let rows: StatusRow[];
            if (result && typeof result === 'object' && 'rows' in result && Array.isArray(result.rows)) {
                this.logger.info(`[DEBUG] Detected OkPacket format with 'rows' property`);
                rows = result.rows as StatusRow[];
            } else if (Array.isArray(result)) {
                this.logger.info(`[DEBUG] Detected plain array format`);
                rows = result as StatusRow[];
            } else {
                const errorMsg = JSON.stringify({
                    type: typeof result,
                    constructor: (result as { constructor?: { name: string } })?.constructor?.name,
                    keys: result && typeof result === 'object' ? Object.keys(result) : 'N/A'
                });
                this.logger.error('Invalid InnoDB status result format:', new Error(errorMsg));
                throw new Error('No InnoDB status data returned');
            }

            if (!rows || rows.length === 0 || !rows[0]) {
                const errorMsg = JSON.stringify({ rows, length: rows?.length });
                this.logger.error('Invalid InnoDB status result - no rows:', new Error(errorMsg));
                throw new Error('No InnoDB status data returned');
            }

            // Extract raw status text (column name can be 'Status', 'STATUS', or 'status')
            const row = rows[0];
            const rawStatus = row.Status || row.STATUS || row.status;
            if (!rawStatus) {
                const errorMsg = JSON.stringify((result as StatusRow[])[0]);
                this.logger.error('InnoDB status result structure:', new Error(errorMsg));
                throw new Error('Invalid InnoDB status format - Status column not found');
            }

            // Get server version
            type VersionRow = { version: string };
            const versionResult = await adapter.query<unknown>('SELECT VERSION() as version');
            const versionRows = (versionResult && typeof versionResult === 'object' && 'rows' in versionResult)
                ? (versionResult.rows as VersionRow[])
                : (versionResult as VersionRow[]);
            const version = versionRows[0].version;

            // Parse the status
            const status = this.parser.parseInnoDBStatus(rawStatus, version);

            // Calculate health score
            status.healthScore = this.calculateHealthScore(status);

            // Cache the result
            this.statusCache.set(connectionId, {
                status,
                timestamp: Date.now()
            });

            // Emit event
            await this.eventBus.emit(
                'INNODB_STATUS_FETCHED',
                {
                    connectionId,
                    healthScore: status.healthScore
                },
                EventPriority.NORMAL
            );

            return status;

        } catch (error) {
            this.logger.error(`Failed to get InnoDB status for connection ${connectionId}:`, error as Error);
            throw error;
        }
    }

    /**
     * Calculate health score (0-100) based on key metrics
     */
    calculateHealthScore(status: InnoDBStatus): number {
        let score = 100;
        const issues: string[] = [];

        // Check transaction history list (critical if > 1M, warning if > 100K)
        if (status.transactions.historyListLength > 1000000) {
            score -= 30;
            issues.push('Critical transaction history buildup');
        } else if (status.transactions.historyListLength > 100000) {
            score -= 15;
            issues.push('High transaction history list');
        }

        // Check buffer pool hit rate (critical if < 90%, warning if < 95%)
        if (status.bufferPool.hitRate < 90) {
            score -= 25;
            issues.push('Very low buffer pool hit rate');
        } else if (status.bufferPool.hitRate < 95) {
            score -= 10;
            issues.push('Low buffer pool hit rate');
        }

        // Check checkpoint age (critical if > 85%, warning if > 70%)
        if (status.log.checkpointAgePercent > 85) {
            score -= 20;
            issues.push('Checkpoint age critically high');
        } else if (status.log.checkpointAgePercent > 70) {
            score -= 10;
            issues.push('Checkpoint age high');
        }

        // Check pending I/O operations (warning if > 100)
        const totalPendingIO = status.io.pendingReads + status.io.pendingWrites;
        if (totalPendingIO > 100) {
            score -= 15;
            issues.push('High pending I/O operations');
        }

        // Check semaphore waits (critical if any long waits > 240s)
        if (status.semaphores.longSemaphoreWaits.length > 0) {
            const maxWait = Math.max(...status.semaphores.longSemaphoreWaits.map(w => w.waitTime));
            if (maxWait > 240) {
                score -= 25;
                issues.push('Critical semaphore wait detected');
            }
        }

        // Check purge lag (warning if > 1M undo records)
        if (status.transactions.purgeLag > 1000000) {
            score -= 10;
            issues.push('High purge lag');
        }

        // Ensure score doesn't go negative
        score = Math.max(0, score);

        if (issues.length > 0) {
            this.logger.warn(`InnoDB health issues detected: ${issues.join(', ')}`);
        }

        return score;
    }

    /**
     * Get health alerts based on thresholds
     */
    getHealthAlerts(status: InnoDBStatus): HealthAlert[] {
        const alerts: HealthAlert[] = [];

        // Transaction history
        if (status.transactions.historyListLength > 1000000) {
            alerts.push({
                severity: 'critical',
                metric: 'transaction_history_length',
                message: 'Transaction history list is critically high',
                threshold: 1000000,
                currentValue: status.transactions.historyListLength,
                recommendation: 'Long-running transactions are preventing purge. Identify and commit/rollback old transactions. Consider increasing innodb_purge_threads.'
            });
        } else if (status.transactions.historyListLength > 100000) {
            alerts.push({
                severity: 'warning',
                metric: 'transaction_history_length',
                message: 'Transaction history list is elevated',
                threshold: 100000,
                currentValue: status.transactions.historyListLength,
                recommendation: 'Monitor for long-running transactions that may be preventing purge operations.'
            });
        }

        // Buffer pool hit rate
        if (status.bufferPool.hitRate < 95) {
            alerts.push({
                severity: status.bufferPool.hitRate < 90 ? 'critical' : 'warning',
                metric: 'buffer_pool_hit_rate',
                message: 'Buffer pool hit rate is low, causing excessive disk I/O',
                threshold: 95,
                currentValue: status.bufferPool.hitRate,
                recommendation: 'Increase innodb_buffer_pool_size to 70-80% of available RAM if possible.'
            });
        }

        // Checkpoint age
        if (status.log.checkpointAgePercent > 85) {
            alerts.push({
                severity: 'critical',
                metric: 'checkpoint_age',
                message: 'Checkpoint age is critically high, risk of write stalls',
                threshold: 85,
                currentValue: status.log.checkpointAgePercent,
                recommendation: 'Increase innodb_log_file_size or tune innodb_io_capacity for faster flushing. Requires server restart.'
            });
        } else if (status.log.checkpointAgePercent > 70) {
            alerts.push({
                severity: 'warning',
                metric: 'checkpoint_age',
                message: 'Checkpoint age is elevated',
                threshold: 70,
                currentValue: status.log.checkpointAgePercent,
                recommendation: 'Monitor checkpoint age. May need to increase innodb_log_file_size if trend continues.'
            });
        }

        // Pending I/O
        const totalPendingIO = status.io.pendingReads + status.io.pendingWrites;
        if (totalPendingIO > 100) {
            alerts.push({
                severity: 'warning',
                metric: 'pending_io',
                message: 'High number of pending I/O operations',
                threshold: 100,
                currentValue: totalPendingIO,
                recommendation: 'Check disk I/O performance. May need faster storage or increased innodb_io_capacity.'
            });
        }

        // Semaphore waits
        if (status.semaphores.longSemaphoreWaits.length > 0) {
            const maxWait = Math.max(...status.semaphores.longSemaphoreWaits.map(w => w.waitTime));
            if (maxWait > 240) {
                alerts.push({
                    severity: 'critical',
                    metric: 'semaphore_wait',
                    message: 'Long semaphore wait detected, indicating severe contention',
                    threshold: 240,
                    currentValue: maxWait,
                    recommendation: 'Check for buffer pool contention or disk I/O bottlenecks. Consider disabling adaptive hash index or increasing buffer pool instances.'
                });
            }
        }

        // Purge lag
        if (status.transactions.purgeLag > 1000000) {
            alerts.push({
                severity: 'warning',
                metric: 'purge_lag',
                message: 'Purge lag is high, purge threads cannot keep up with write rate',
                threshold: 1000000,
                currentValue: status.transactions.purgeLag,
                recommendation: 'Increase innodb_purge_threads. Verify no extremely long-running transactions blocking purge.'
            });
        }

        return alerts;
    }

    /**
     * Compare two status snapshots
     */
    compareSnapshots(before: InnoDBStatus, after: InnoDBStatus): StatusComparison {
        const deltas = [
            {
                metric: 'Transaction History Length',
                before: before.transactions.historyListLength,
                after: after.transactions.historyListLength,
                change: after.transactions.historyListLength - before.transactions.historyListLength,
                changePercent: this.calculatePercentChange(
                    before.transactions.historyListLength,
                    after.transactions.historyListLength
                )
            },
            {
                metric: 'Buffer Pool Hit Rate',
                before: before.bufferPool.hitRate,
                after: after.bufferPool.hitRate,
                change: after.bufferPool.hitRate - before.bufferPool.hitRate,
                changePercent: this.calculatePercentChange(
                    before.bufferPool.hitRate,
                    after.bufferPool.hitRate
                )
            },
            {
                metric: 'Dirty Pages',
                before: before.bufferPool.dirtyPages,
                after: after.bufferPool.dirtyPages,
                change: after.bufferPool.dirtyPages - before.bufferPool.dirtyPages,
                changePercent: this.calculatePercentChange(
                    before.bufferPool.dirtyPages,
                    after.bufferPool.dirtyPages
                )
            },
            {
                metric: 'Checkpoint Age %',
                before: before.log.checkpointAgePercent,
                after: after.log.checkpointAgePercent,
                change: after.log.checkpointAgePercent - before.log.checkpointAgePercent,
                changePercent: this.calculatePercentChange(
                    before.log.checkpointAgePercent,
                    after.log.checkpointAgePercent
                )
            },
            {
                metric: 'Health Score',
                before: before.healthScore,
                after: after.healthScore,
                change: after.healthScore - before.healthScore,
                changePercent: this.calculatePercentChange(
                    before.healthScore,
                    after.healthScore
                )
            }
        ];

        // Identify significant changes (>10% change or >5 point absolute change for critical metrics)
        const significantChanges: string[] = [];
        for (const delta of deltas) {
            if (Math.abs(delta.changePercent) > 10 || Math.abs(delta.change) > 5) {
                const direction = delta.change > 0 ? 'increased' : 'decreased';
                significantChanges.push(
                    `${delta.metric} ${direction} by ${Math.abs(delta.change).toFixed(2)} (${Math.abs(delta.changePercent).toFixed(1)}%)`
                );
            }
        }

        return {
            before,
            after,
            deltas,
            significantChanges
        };
    }

    /**
     * Calculate percent change between two values
     */
    private calculatePercentChange(before: number, after: number): number {
        if (before === 0) {
            return after === 0 ? 0 : 100;
        }
        return ((after - before) / before) * 100;
    }

    /**
     * Clear cache for a connection
     */
    clearCache(connectionId: string): void {
        this.statusCache.delete(connectionId);
    }

    /**
     * Clear all caches
     */
    clearAllCaches(): void {
        this.statusCache.clear();
    }
}
