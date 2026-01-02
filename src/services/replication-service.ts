/**
 * Replication Service
 * Service for monitoring and controlling MySQL/MariaDB replication
 */

import { Logger } from '../utils/logger';
import { IDatabaseAdapter } from '../adapters/database-adapter';
import { EventBus } from './event-bus';
import { EventPriority } from '../core/interfaces';
import { AuditLogger } from './audit-logger';
import {
    ReplicationStatus,
    ReplicationAlert,
    ReplicationControlResult,
    MasterStatus,
    ConnectedReplica,
    ReplicationRole
} from '../types/replication-types';
import { ReplicationParser } from './replication-parser';

export class ReplicationService {
    private parser: ReplicationParser;
    private statusCache: Map<string, { status: ReplicationStatus; timestamp: number }> = new Map();
    private readonly CACHE_TTL = 5000; // 5 seconds (shorter for replication)

    constructor(
        private logger: Logger,
        private eventBus: EventBus,
        private auditLogger?: AuditLogger
    ) {
        this.parser = new ReplicationParser();
    }

    /**
     * Get replication status for a connection
     */
    async getReplicationStatus(
        connectionId: string,
        adapter: IDatabaseAdapter
    ): Promise<ReplicationStatus> {
        try {
            // Check cache first
            const cached = this.statusCache.get(connectionId);
            if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
                this.logger.debug(`Returning cached replication status for connection ${connectionId}`);
                return cached.status;
            }

            // Determine which command to use based on version
            const command = this.getReplicationStatusCommand(adapter.version);
            const useReplicaCommand = command.includes('REPLICA');

            // Execute replication status command with fallback
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let result: any[];
            try {
                result = await adapter.query<any>(command); // eslint-disable-line @typescript-eslint/no-explicit-any
            } catch (error) {
                // If REPLICA command failed, try SLAVE fallback
                if (useReplicaCommand && (error as Error).message.includes('syntax error')) {
                    this.logger.debug('SHOW REPLICA STATUS failed, falling back to SHOW SLAVE STATUS');
                    result = await adapter.query<any>('SHOW SLAVE STATUS'); // eslint-disable-line @typescript-eslint/no-explicit-any
                } else {
                    throw error;
                }
            }

            if (!result || result.length === 0) {
                throw new Error('No replication configured on this server');
            }

            // Get server version
            const versionResult = await adapter.query<{ version: string }>('SELECT VERSION() as version');
            const version = versionResult[0].version;

            // Parse the status
            const status = this.parser.parseReplicationStatus(result, version);

            // Cache the result
            this.statusCache.set(connectionId, {
                status,
                timestamp: Date.now()
            });

            // Emit event
            await this.eventBus.emit(
                'REPLICATION_STATUS_FETCHED',
                {
                    connectionId,
                    healthStatus: status.healthStatus,
                    lagSeconds: status.lagSeconds
                },
                EventPriority.NORMAL
            );

            return status;

        } catch (error) {
            this.logger.error(`Failed to get replication status for connection ${connectionId}:`, error as Error);
            throw error;
        }
    }

    /**
     * Get appropriate replication status command based on version
     */
    private getReplicationStatusCommand(version: string): string {
        // MySQL 8.0.22+ uses SHOW REPLICA STATUS
        // Older MySQL and all MariaDB use SHOW SLAVE STATUS
        const [major, minor, patch] = version.split('.').map(v => parseInt(v, 10));

        // Check if MariaDB
        if (version.toLowerCase().includes('mariadb')) {
            return 'SHOW SLAVE STATUS';
        }

        // MySQL 8.0.22+ uses REPLICA terminology
        if (major === 8 && minor === 0 && patch >= 22) {
            return 'SHOW REPLICA STATUS';
        }

        // Older MySQL versions or if we can't determine, try REPLICA first then fall back
        return 'SHOW REPLICA STATUS';
    }

    /**
     * Get replication health alerts
     */
    getReplicationHealth(status: ReplicationStatus): ReplicationAlert[] {
        const alerts: ReplicationAlert[] = [];

        // I/O Thread stopped
        if (!status.ioThread.running) {
            alerts.push({
                severity: 'critical',
                metric: 'io_thread_status',
                message: 'Replication I/O thread is not running',
                currentValue: 'Stopped',
                recommendation: 'Check the last I/O error and network connectivity to master. Use START SLAVE IO_THREAD to restart.'
            });
        }

        // SQL Thread stopped
        if (!status.sqlThread.running) {
            alerts.push({
                severity: 'critical',
                metric: 'sql_thread_status',
                message: 'Replication SQL thread is not running',
                currentValue: 'Stopped',
                recommendation: 'Check the last SQL error. May need to skip error or fix data inconsistency. Use START SLAVE SQL_THREAD to restart.'
            });
        }

        // Replication lag
        if (status.lagSeconds !== null) {
            if (status.lagSeconds > 300) {
                alerts.push({
                    severity: 'critical',
                    metric: 'replication_lag',
                    message: 'Replication lag is critically high',
                    threshold: 300,
                    currentValue: status.lagSeconds,
                    recommendation: 'Check for slow queries on replica, network issues, or high write load on master. Consider parallel replication or read-only mode on replica.'
                });
            } else if (status.lagSeconds > 60) {
                alerts.push({
                    severity: 'warning',
                    metric: 'replication_lag',
                    message: 'Replication lag is elevated',
                    threshold: 60,
                    currentValue: status.lagSeconds,
                    recommendation: 'Monitor lag trend. May indicate slow queries or high load. Review slave_parallel_workers setting.'
                });
            }
        }

        // I/O Errors
        if (status.lastIOError) {
            alerts.push({
                severity: 'critical',
                metric: 'io_error',
                message: `I/O thread error: ${status.lastIOError.errorMessage}`,
                currentValue: `Error ${status.lastIOError.errorNumber}`,
                recommendation: 'Check network connectivity, master server status, and replication user privileges.'
            });
        }

        // SQL Errors
        if (status.lastSQLError) {
            alerts.push({
                severity: 'critical',
                metric: 'sql_error',
                message: `SQL thread error: ${status.lastSQLError.errorMessage}`,
                currentValue: `Error ${status.lastSQLError.errorNumber}`,
                recommendation: 'Check for data inconsistencies, duplicate keys, or missing tables. May need to skip error or resync data.'
            });
        }

        // GTID gap detection (if using GTID)
        if (status.replicaType === 'gtid' && status.gtidInfo) {
            const retrieved = status.gtidInfo.retrievedGtidSet;
            const executed = status.gtidInfo.executedGtidSet;

            if (retrieved && executed && retrieved !== executed) {
                // Simplified gap detection (full implementation would parse GTID sets)
                alerts.push({
                    severity: 'warning',
                    metric: 'gtid_gap',
                    message: 'GTID sets differ between retrieved and executed',
                    recommendation: 'Monitor for GTID gaps. May indicate SQL thread is behind I/O thread.'
                });
            }
        }

        return alerts;
    }

    /**
     * Start I/O thread
     */
    async startIOThread(
        connectionId: string,
        adapter: IDatabaseAdapter
    ): Promise<ReplicationControlResult> {
        try {
            this.logger.info(`Starting I/O thread for connection ${connectionId}`);

            // Audit log the action
            if (this.auditLogger) {
                await this.auditLogger.logDestructiveOperation(
                    connectionId,
                    'START SLAVE IO_THREAD',
                    'system',
                    { success: true }
                );
            }

            // Execute command (works for both SLAVE and REPLICA terminology)
            // Fallback is already in getReplicationStatus
            const command = this.getStartIOCommand(adapter.version || adapter.type || 'mysql');
            await adapter.execute(command);

            // Wait a moment for status to update
            await this.sleep(1000);

            // Clear cache and get new status
            this.statusCache.delete(connectionId);
            const newStatus = await this.getReplicationStatus(connectionId, adapter);

            return {
                success: newStatus.ioThread.running,
                action: 'start_io',
                message: newStatus.ioThread.running
                    ? 'I/O thread started successfully'
                    : 'I/O thread command executed but thread is not running',
                newStatus
            };
        } catch (error) {
            this.logger.error('Failed to start I/O thread:', error as Error);
            return {
                success: false,
                action: 'start_io',
                message: `Failed to start I/O thread: ${(error as Error).message}`
            };
        }
    }

    /**
     * Stop I/O thread
     */
    async stopIOThread(
        connectionId: string,
        adapter: IDatabaseAdapter
    ): Promise<ReplicationControlResult> {
        try {
            this.logger.info(`Stopping I/O thread for connection ${connectionId}`);

            if (this.auditLogger) {
                await this.auditLogger.logDestructiveOperation(
                    connectionId,
                    'STOP SLAVE IO_THREAD',
                    'system',
                    { success: true }
                );
            }

            const command = this.getStopIOCommand(adapter.version || adapter.type || 'mysql');
            await adapter.execute(command);
            await this.sleep(1000);

            this.statusCache.delete(connectionId);
            const newStatus = await this.getReplicationStatus(connectionId, adapter);

            return {
                success: !newStatus.ioThread.running,
                action: 'stop_io',
                message: !newStatus.ioThread.running
                    ? 'I/O thread stopped successfully'
                    : 'I/O thread command executed but thread is still running',
                newStatus
            };
        } catch (error) {
            this.logger.error('Failed to stop I/O thread:', error as Error);
            return {
                success: false,
                action: 'stop_io',
                message: `Failed to stop I/O thread: ${(error as Error).message}`
            };
        }
    }

    /**
     * Start SQL thread
     */
    async startSQLThread(
        connectionId: string,
        adapter: IDatabaseAdapter
    ): Promise<ReplicationControlResult> {
        try {
            this.logger.info(`Starting SQL thread for connection ${connectionId}`);

            if (this.auditLogger) {
                await this.auditLogger.logDestructiveOperation(
                    connectionId,
                    'START SLAVE SQL_THREAD',
                    'system',
                    { success: true }
                );
            }

            const command = this.getStartSQLCommand(adapter.version || adapter.type || 'mysql');
            await adapter.execute(command);
            await this.sleep(1000);

            this.statusCache.delete(connectionId);
            const newStatus = await this.getReplicationStatus(connectionId, adapter);

            return {
                success: newStatus.sqlThread.running,
                action: 'start_sql',
                message: newStatus.sqlThread.running
                    ? 'SQL thread started successfully'
                    : 'SQL thread command executed but thread is not running',
                newStatus
            };
        } catch (error) {
            this.logger.error('Failed to start SQL thread:', error as Error);
            return {
                success: false,
                action: 'start_sql',
                message: `Failed to start SQL thread: ${(error as Error).message}`
            };
        }
    }

    /**
     * Stop SQL thread
     */
    async stopSQLThread(
        connectionId: string,
        adapter: IDatabaseAdapter
    ): Promise<ReplicationControlResult> {
        try {
            this.logger.info(`Stopping SQL thread for connection ${connectionId}`);

            if (this.auditLogger) {
                await this.auditLogger.logDestructiveOperation(
                    connectionId,
                    'STOP SLAVE SQL_THREAD',
                    'system',
                    { success: true }
                );
            }

            const command = this.getStopSQLCommand(adapter.version || adapter.type || 'mysql');
            await adapter.execute(command);
            await this.sleep(1000);

            this.statusCache.delete(connectionId);
            const newStatus = await this.getReplicationStatus(connectionId, adapter);

            return {
                success: !newStatus.sqlThread.running,
                action: 'stop_sql',
                message: !newStatus.sqlThread.running
                    ? 'SQL thread stopped successfully'
                    : 'SQL thread command executed but thread is still running',
                newStatus
            };
        } catch (error) {
            this.logger.error('Failed to stop SQL thread:', error as Error);
            return {
                success: false,
                action: 'stop_sql',
                message: `Failed to stop SQL thread: ${(error as Error).message}`
            };
        }
    }

    /**
     * Get command for starting I/O thread
     */
    private getStartIOCommand(version: string): string {
        if (this.useReplicaTerminology(version)) {
            return 'START REPLICA IO_THREAD';
        }
        return 'START SLAVE IO_THREAD';
    }

    /**
     * Get command for stopping I/O thread
     */
    private getStopIOCommand(version: string): string {
        if (this.useReplicaTerminology(version)) {
            return 'STOP REPLICA IO_THREAD';
        }
        return 'STOP SLAVE IO_THREAD';
    }

    /**
     * Get command for starting SQL thread
     */
    private getStartSQLCommand(version: string): string {
        if (this.useReplicaTerminology(version)) {
            return 'START REPLICA SQL_THREAD';
        }
        return 'START SLAVE SQL_THREAD';
    }

    /**
     * Get command for stopping SQL thread
     */
    private getStopSQLCommand(version: string): string {
        if (this.useReplicaTerminology(version)) {
            return 'STOP REPLICA SQL_THREAD';
        }
        return 'STOP SLAVE SQL_THREAD';
    }

    /**
     * Determine if should use REPLICA or SLAVE terminology
     */
    private useReplicaTerminology(version: string): boolean {
        // MariaDB uses SLAVE
        if (version.toLowerCase().includes('mariadb')) {
            return false;
        }

        // MySQL 8.0.22+ uses REPLICA
        const [major, minor, patch] = version.split('.').map(v => parseInt(v, 10));
        return major === 8 && minor === 0 && patch >= 22;
    }

    /**
     * Sleep helper
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
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

    /**
     * Get master/primary status
     */
    async getMasterStatus(
        connectionId: string,
        adapter: IDatabaseAdapter
    ): Promise<MasterStatus | null> {
        try {
            const result = await adapter.query<MasterStatus>('SHOW MASTER STATUS');

            if (!result || result.length === 0) {
                return null; // Not configured as master
            }

            return {
                file: result[0].file || result[0].File || '',
                position: result[0].position || result[0].Position || 0,
                binlogDoDb: result[0].binlogDoDb || result[0].Binlog_Do_DB || '',
                binlogIgnoreDb: result[0].binlogIgnoreDb || result[0].Binlog_Ignore_DB || '',
                executedGtidSet: result[0].executedGtidSet || result[0].Executed_Gtid_Set
            };
        } catch (error) {
            this.logger.debug(`Failed to get master status for ${connectionId}:`, error as Error);
            return null; // Not a master or binary logging not enabled
        }
    }

    /**
     * Get list of connected replicas (master only)
     */
    async getConnectedReplicas(
        connectionId: string,
        adapter: IDatabaseAdapter
    ): Promise<ConnectedReplica[]> {
        try {
            // Use SHOW SLAVE HOSTS (works on both MySQL and MariaDB)
            const result = await adapter.query<any>('SHOW SLAVE HOSTS'); // eslint-disable-line @typescript-eslint/no-explicit-any

            if (!result || result.length === 0) {
                return [];
            }

            return result.map((row: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
                serverId: row.Server_id || row.server_id || 0,
                host: row.Host || row.host || '',
                port: row.Port || row.port || 3306,
                masterLogFile: row.Master_Log_File || row.master_log_file || '',
                readMasterLogPos: row.Read_Master_Log_Pos || row.read_master_log_pos || 0,
                slaveIoRunning: row.Slave_IO_Running || row.slave_io_running || 'Unknown',
                slaveSqlRunning: row.Slave_SQL_Running || row.slave_sql_running || 'Unknown',
                secondsBehindMaster: row.Seconds_Behind_Master !== null
                    ? (row.Seconds_Behind_Master || row.seconds_behind_master)
                    : null,
                lastIOError: row.Last_IO_Error || row.last_io_error || '',
                lastSQLError: row.Last_SQL_Error || row.last_sql_error || ''
            }));
        } catch (error) {
            this.logger.debug(`Failed to get connected replicas for ${connectionId}:`, error as Error);
            return [];
        }
    }

    /**
     * Detect server replication role
     */
    async getReplicationRole(
        connectionId: string,
        adapter: IDatabaseAdapter
    ): Promise<ReplicationRole> {
        const masterStatus = await this.getMasterStatus(connectionId, adapter);

        let hasReplication = false;
        try {
            const replicationStatus = await this.getReplicationStatus(connectionId, adapter);
            hasReplication = replicationStatus !== null;
        } catch {
            hasReplication = false;
        }

        if (masterStatus && hasReplication) {
            return 'both'; // Multi-source or chained replication
        } else if (masterStatus) {
            return 'master';
        } else if (hasReplication) {
            return 'replica';
        } else {
            return 'standalone';
        }
    }
}
