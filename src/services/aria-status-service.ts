/**
 * Aria Status Service
 * Service for monitoring Aria storage engine status (MariaDB only)
 */

import { Logger } from '../utils/logger';
import { IDatabaseAdapter } from '../adapters/database-adapter';
import { EventBus } from './event-bus';
import { EventPriority } from '../core/interfaces';
import { AriaStatus, HealthAlert, StatusComparison } from '../types/storage-engine-types';
import { StorageEngineParser } from './storage-engine-parser';

export class AriaStatusService {
    private parser: StorageEngineParser;
    private statusCache: Map<string, { status: AriaStatus; timestamp: number }> = new Map();
    private readonly CACHE_TTL = 30000; // 30 seconds

    constructor(
        private logger: Logger,
        private eventBus: EventBus
    ) {
        this.parser = new StorageEngineParser();
    }

    /**
     * Get Aria status for a MariaDB connection
     */
    async getAriaStatus(
        connectionId: string,
        adapter: IDatabaseAdapter
    ): Promise<AriaStatus> {
        try {
            // Check cache first
            const cached = this.statusCache.get(connectionId);
            if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
                this.logger.debug(`Returning cached Aria status for connection ${connectionId}`);
                return cached.status;
            }

            // Execute SHOW ENGINE ARIA STATUS
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await adapter.query<any>('SHOW ENGINE ARIA STATUS');

            // Debug: Log the result structure
            this.logger.debug(`SHOW ENGINE ARIA STATUS result type: ${typeof result}`);
            this.logger.debug(`Result is array: ${Array.isArray(result)}`);
            this.logger.debug(`Result length: ${result?.length}`);
            this.logger.debug(`First element exists: ${result?.[0] !== undefined}`);
            if (result && result.length > 0) {
                this.logger.debug(`First element keys: ${Object.keys(result[0] || {}).join(', ')}`);
            }

            if (!result || result.length === 0 || result[0] === undefined) {
                this.logger.error('Invalid Aria status result:', JSON.stringify({ result, length: result?.length }));
                throw new Error('No Aria status data returned');
            }

            // Extract raw status text (column name can be 'Status' or 'STATUS')
            const row = result[0];
            const rawStatus = row.Status || row.STATUS || row.status;
            if (!rawStatus) {
                this.logger.error('Aria status result structure:', JSON.stringify(result[0]));
                throw new Error('Invalid Aria status format - Status column not found');
            }

            // Get server version
            const versionResult = await adapter.query<{ version: string }>('SELECT VERSION() as version');
            const version = versionResult[0].version;

            // Parse the status
            const status = this.parser.parseAriaStatus(rawStatus, version);

            // Calculate health score
            status.healthScore = this.calculateHealthScore(status);

            // Cache the result
            this.statusCache.set(connectionId, {
                status,
                timestamp: Date.now()
            });

            // Emit event
            await this.eventBus.emit(
                'ARIA_STATUS_FETCHED',
                {
                    connectionId,
                    healthScore: status.healthScore
                },
                EventPriority.NORMAL
            );

            return status;

        } catch (error) {
            this.logger.error(`Failed to get Aria status for connection ${connectionId}:`, error as Error);
            throw error;
        }
    }

    /**
     * Calculate health score for Aria (0-100)
     */
    calculateHealthScore(status: AriaStatus): number {
        let score = 100;

        // Check page cache hit rate
        if (status.pageCache.hitRate < 90) {
            score -= 25;
        } else if (status.pageCache.hitRate < 95) {
            score -= 10;
        }

        // Check recovery log usage
        if (status.recoveryLog.size > 0) {
            const logUsagePercent = (status.recoveryLog.used / status.recoveryLog.size) * 100;
            if (logUsagePercent > 80) {
                score -= 15;
            }
        }

        // Check crash recovery status
        if (status.crashRecoveryStatus === 'error') {
            score -= 30;
        } else if (status.crashRecoveryStatus === 'recovering') {
            score -= 20;
        }

        return Math.max(0, score);
    }

    /**
     * Get health alerts for Aria
     */
    getHealthAlerts(status: AriaStatus): HealthAlert[] {
        const alerts: HealthAlert[] = [];

        // Page cache hit rate
        if (status.pageCache.hitRate < 95) {
            alerts.push({
                severity: status.pageCache.hitRate < 90 ? 'critical' : 'warning',
                metric: 'aria_page_cache_hit_rate',
                message: 'Aria page cache hit rate is low',
                threshold: 95,
                currentValue: status.pageCache.hitRate,
                recommendation: 'Increase aria_pagecache_buffer_size to improve caching performance.'
            });
        }

        // Recovery log usage
        if (status.recoveryLog.size > 0) {
            const logUsagePercent = (status.recoveryLog.used / status.recoveryLog.size) * 100;
            if (logUsagePercent > 80) {
                alerts.push({
                    severity: 'warning',
                    metric: 'aria_recovery_log_usage',
                    message: 'Aria recovery log is nearly full',
                    threshold: 80,
                    currentValue: logUsagePercent,
                    recommendation: 'Increase aria_log_file_size or reduce checkpoint interval.'
                });
            }
        }

        // Crash recovery status
        if (status.crashRecoveryStatus === 'error') {
            alerts.push({
                severity: 'critical',
                metric: 'aria_crash_recovery',
                message: 'Aria crash recovery encountered errors',
                recommendation: 'Check MariaDB error log for details. May need to repair Aria tables.'
            });
        }

        return alerts;
    }

    /**
     * Compare two Aria status snapshots
     */
    compareSnapshots(before: AriaStatus, after: AriaStatus): StatusComparison {
        const deltas = [
            {
                metric: 'Page Cache Hit Rate',
                before: before.pageCache.hitRate,
                after: after.pageCache.hitRate,
                change: after.pageCache.hitRate - before.pageCache.hitRate,
                changePercent: this.calculatePercentChange(
                    before.pageCache.hitRate,
                    after.pageCache.hitRate
                )
            },
            {
                metric: 'Recovery Log Used',
                before: before.recoveryLog.used,
                after: after.recoveryLog.used,
                change: after.recoveryLog.used - before.recoveryLog.used,
                changePercent: this.calculatePercentChange(
                    before.recoveryLog.used,
                    after.recoveryLog.used
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

        const significantChanges: string[] = [];
        for (const delta of deltas) {
            if (Math.abs(delta.changePercent) > 10) {
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
     * Calculate percent change
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
