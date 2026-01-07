/**
 * InnoDB Health Checker
 * Rule-based health checks for InnoDB status
 */

import { InnoDBStatus, HealthAlert } from '../types/storage-engine-types';

export class InnoDBHealthChecker {
    /**
     * Check InnoDB status against defined thresholds
     */
    checkHealth(status: InnoDBStatus): HealthAlert[] {
        const alerts: HealthAlert[] = [];

        // Transaction history list checks
        if (status.transactions.historyListLength > 1000000) {
            alerts.push({
                severity: 'critical',
                metric: 'transaction_history_length',
                message: 'Transaction history list is critically high - purge operations are blocked',
                threshold: 1000000,
                currentValue: status.transactions.historyListLength,
                recommendation: 'Identify and commit/rollback long-running transactions immediately. Check for idle transactions in `SHOW PROCESSLIST`. Consider increasing innodb_purge_threads if purge is the bottleneck.'
            });
        } else if (status.transactions.historyListLength > 100000) {
            alerts.push({
                severity: 'warning',
                metric: 'transaction_history_length',
                message: 'Transaction history list is elevated',
                threshold: 100000,
                currentValue: status.transactions.historyListLength,
                recommendation: 'Monitor for long-running transactions. Review application transaction patterns and ensure proper commit/rollback handling.'
            });
        }

        // Buffer pool hit rate checks
        if (status.bufferPool.hitRate < 90) {
            alerts.push({
                severity: 'critical',
                metric: 'buffer_pool_hit_rate',
                message: 'Buffer pool hit rate is critically low - causing excessive disk I/O',
                threshold: 95,
                currentValue: status.bufferPool.hitRate,
                recommendation: 'Increase innodb_buffer_pool_size to 70-80% of available RAM. Current buffer pool may be severely undersized for workload.'
            });
        } else if (status.bufferPool.hitRate < 95) {
            alerts.push({
                severity: 'warning',
                metric: 'buffer_pool_hit_rate',
                message: 'Buffer pool hit rate is below optimal threshold',
                threshold: 95,
                currentValue: status.bufferPool.hitRate,
                recommendation: 'Consider increasing innodb_buffer_pool_size to reduce disk I/O. Monitor trend over time to determine if increase is warranted.'
            });
        }

        // Checkpoint age checks
        if (status.log.checkpointAgePercent > 85) {
            alerts.push({
                severity: 'critical',
                metric: 'checkpoint_age',
                message: 'Checkpoint age is critically high - risk of write stalls imminent',
                threshold: 85,
                currentValue: status.log.checkpointAgePercent,
                recommendation: 'URGENT: Increase innodb_log_file_size (requires restart) or tune innodb_io_capacity and innodb_io_capacity_max for faster flushing. Reduce write workload if possible.'
            });
        } else if (status.log.checkpointAgePercent > 70) {
            alerts.push({
                severity: 'warning',
                metric: 'checkpoint_age',
                message: 'Checkpoint age is elevated',
                threshold: 70,
                currentValue: status.log.checkpointAgePercent,
                recommendation: 'Monitor checkpoint age trend. May need to increase innodb_log_file_size if consistently high. Plan for maintenance window as change requires server restart.'
            });
        }

        // Pending I/O operations checks
        const totalPendingIO = status.io.pendingReads + status.io.pendingWrites;
        if (totalPendingIO > 100) {
            alerts.push({
                severity: 'warning',
                metric: 'pending_io_operations',
                message: 'High number of pending I/O operations detected',
                threshold: 100,
                currentValue: totalPendingIO,
                recommendation: 'Check disk I/O performance and system load. May need faster storage (SSD/NVMe) or increased innodb_io_capacity to match disk capabilities.'
            });
        }

        // Semaphore wait checks
        if (status.semaphores.longSemaphoreWaits.length > 0) {
            const maxWait = Math.max(...status.semaphores.longSemaphoreWaits.map(w => w.waitTime));
            if (maxWait > 240) {
                alerts.push({
                    severity: 'critical',
                    metric: 'semaphore_wait_time',
                    message: 'Long semaphore wait detected - severe internal contention',
                    threshold: 240,
                    currentValue: maxWait,
                    recommendation: 'URGENT: Check for disk I/O bottlenecks or buffer pool contention. Consider: disabling innodb_adaptive_hash_index, increasing innodb_buffer_pool_instances, or upgrading storage.'
                });
            }
        }

        // Purge lag checks
        if (status.transactions.purgeLag > 1000000) {
            alerts.push({
                severity: 'warning',
                metric: 'purge_lag',
                message: 'Purge lag is high - purge threads cannot keep pace with write rate',
                threshold: 1000000,
                currentValue: status.transactions.purgeLag,
                recommendation: 'Increase innodb_purge_threads (default is 4, can increase to 32). Verify no extremely long-running transactions blocking purge. Review innodb_max_purge_lag setting.'
            });
        }

        // Dirty pages checks (if dirty page ratio > 75% of buffer pool)
        const dirtyPageRatio = (status.bufferPool.dirtyPages / status.bufferPool.databasePages) * 100;
        if (dirtyPageRatio > 75) {
            alerts.push({
                severity: 'warning',
                metric: 'dirty_page_ratio',
                message: 'High dirty page ratio in buffer pool',
                threshold: 75,
                currentValue: dirtyPageRatio,
                recommendation: 'Increase innodb_io_capacity and innodb_io_capacity_max to speed up flushing. Check innodb_max_dirty_pages_pct setting (default 90%).'
            });
        }

        // Active transactions checks
        if (status.transactions.activeTransactions > 1000) {
            alerts.push({
                severity: 'warning',
                metric: 'active_transactions',
                message: 'High number of active transactions',
                threshold: 1000,
                currentValue: status.transactions.activeTransactions,
                recommendation: 'Review application transaction patterns. High concurrency may indicate need for connection pooling optimization or application-level batching.'
            });
        }

        // Mutex/RW-lock contention checks
        if (status.semaphores.mutexOSWaits > 1000000 || status.semaphores.rwLockOSWaits > 1000000) {
            alerts.push({
                severity: 'warning',
                metric: 'mutex_contention',
                message: 'High mutex/rw-lock contention detected',
                currentValue: Math.max(status.semaphores.mutexOSWaits, status.semaphores.rwLockOSWaits),
                recommendation: 'High internal contention. Consider: increasing innodb_buffer_pool_instances, disabling innodb_adaptive_hash_index, or reviewing query patterns for hotspot tables.'
            });
        }

        return alerts;
    }

    /**
     * Get alert summary counts
     */
    getAlertSummary(alerts: HealthAlert[]): { critical: number; warning: number; info: number } {
        return {
            critical: alerts.filter(a => a.severity === 'critical').length,
            warning: alerts.filter(a => a.severity === 'warning').length,
            info: alerts.filter(a => a.severity === 'info').length
        };
    }

    /**
     * Get highest severity level from alerts
     */
    getHighestSeverity(alerts: HealthAlert[]): 'critical' | 'warning' | 'info' | 'healthy' {
        if (alerts.some(a => a.severity === 'critical')) {
            return 'critical';
        }
        if (alerts.some(a => a.severity === 'warning')) {
            return 'warning';
        }
        if (alerts.some(a => a.severity === 'info')) {
            return 'info';
        }
        return 'healthy';
    }
}
