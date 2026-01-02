/**
 * Replication Parser
 * Parses SHOW REPLICA STATUS / SHOW SLAVE STATUS output
 */

import {
    ReplicationStatus,
    ThreadStatus,
    ReplicationError,
    GTIDInfo,
    BinlogPosition
} from '../types/replication-types';

export class ReplicationParser {
    /**
     * Parse SHOW REPLICA STATUS / SHOW SLAVE STATUS output
     * Handles both MySQL 8.0+ (REPLICA) and older/MariaDB (SLAVE) terminology
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parseReplicationStatus(rawOutput: any[], version: string): ReplicationStatus {
        if (!rawOutput || rawOutput.length === 0) {
            throw new Error('No replication status data returned');
        }

        const row = rawOutput[0];

        // Determine if using GTID or binlog replication
        const gtidMode = this.detectGTIDMode(row);

        // Parse thread status
        const ioThread = this.parseThreadStatus(row, 'io', version);
        const sqlThread = this.parseThreadStatus(row, 'sql', version);

        // Parse lag
        const lagSeconds = this.parseLag(row);

        // Parse position information
        const binlogPosition = this.parseBinlogPosition(row);
        const gtidInfo = gtidMode ? this.parseGTIDInfo(row) : undefined;

        // Parse errors
        const lastIOError = this.parseError(row, 'io');
        const lastSQLError = this.parseError(row, 'sql');

        // Determine health status
        const healthStatus = this.calculateHealthStatus(ioThread, sqlThread, lagSeconds, lastIOError, lastSQLError);

        // Handle both old and new field names
        const masterHost = row.Master_Host || row.Source_Host || '';
        const masterPort = row.Master_Port || row.Source_Port || 0;
        const masterUser = row.Master_User || row.Source_User || '';

        return {
            timestamp: new Date(),
            version,
            replicaType: gtidMode ? 'gtid' : 'binlog',
            masterHost,
            masterPort,
            masterUser,
            ioThread,
            sqlThread,
            lagSeconds,
            binlogPosition,
            gtidInfo,
            lastIOError,
            lastSQLError,
            healthStatus,
            secondsBehindMaster: lagSeconds,
            slaveIORunning: row.Slave_IO_Running || 'Unknown',
            slaveSQLRunning: row.Slave_SQL_Running || 'Unknown',
            // MySQL 8.0+ fields
            replicaIORunning: row.Replica_IO_Running,
            replicaSQLRunning: row.Replica_SQL_Running,
            sourceHost: row.Source_Host,
            sourcePort: row.Source_Port,
            sourceUser: row.Source_User
        };
    }

    /**
     * Detect if GTID mode is enabled
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private detectGTIDMode(row: any): boolean {
        return !!(row.Retrieved_Gtid_Set || row.Executed_Gtid_Set || row.Auto_Position === '1');
    }

    /**
     * Parse thread status (IO or SQL)
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private parseThreadStatus(row: any, threadType: 'io' | 'sql', _version: string): ThreadStatus {
        let running: boolean;
        let state: string;
        let lastError: string | undefined;
        let lastErrorNumber: number | undefined;
        let lastErrorTimestamp: Date | undefined;

        if (threadType === 'io') {
            // Try MySQL 8.0.22+ field names first, then fall back to legacy names
            const ioRunning = row.Replica_IO_Running || row.Slave_IO_Running || 'No';
            running = ioRunning === 'Yes';
            state = row.Replica_IO_State || row.Slave_IO_State || 'Not running';
            lastError = row.Last_IO_Error || undefined;
            lastErrorNumber = row.Last_IO_Errno ? parseInt(row.Last_IO_Errno, 10) : undefined;

            // Parse timestamp if available
            if (row.Last_IO_Error_Timestamp) {
                lastErrorTimestamp = new Date(row.Last_IO_Error_Timestamp);
            }
        } else {
            // SQL thread
            const sqlRunning = row.Replica_SQL_Running || row.Slave_SQL_Running || 'No';
            running = sqlRunning === 'Yes';
            state = row.Replica_SQL_Running_State || 'Not running';
            lastError = row.Last_SQL_Error || undefined;
            lastErrorNumber = row.Last_SQL_Errno ? parseInt(row.Last_SQL_Errno, 10) : undefined;

            if (row.Last_SQL_Error_Timestamp) {
                lastErrorTimestamp = new Date(row.Last_SQL_Error_Timestamp);
            }
        }

        return {
            running,
            state,
            lastError,
            lastErrorNumber,
            lastErrorTimestamp
        };
    }

    /**
     * Parse replication lag
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private parseLag(row: any): number | null {
        // Try Seconds_Behind_Master first (works for both old and new versions)
        if (row.Seconds_Behind_Master !== undefined && row.Seconds_Behind_Master !== null) {
            // Can be NULL if replication is not running
            return row.Seconds_Behind_Master === 'NULL' ? null : parseInt(row.Seconds_Behind_Master, 10);
        }

        // Try MySQL 8.0.22+ field name
        if (row.Seconds_Behind_Source !== undefined && row.Seconds_Behind_Source !== null) {
            return row.Seconds_Behind_Source === 'NULL' ? null : parseInt(row.Seconds_Behind_Source, 10);
        }

        return null;
    }

    /**
     * Parse binlog position information
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private parseBinlogPosition(row: any): BinlogPosition {
        return {
            masterLogFile: row.Master_Log_File || row.Source_Log_File || '',
            masterLogPos: parseInt(row.Read_Master_Log_Pos || row.Read_Source_Log_Pos || '0', 10),
            relayLogFile: row.Relay_Log_File || '',
            relayLogPos: parseInt(row.Relay_Log_Pos || '0', 10),
            relayMasterLogFile: row.Relay_Master_Log_File || row.Relay_Source_Log_File || ''
        };
    }

    /**
     * Parse GTID information
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private parseGTIDInfo(row: any): GTIDInfo {
        return {
            retrievedGtidSet: row.Retrieved_Gtid_Set || '',
            executedGtidSet: row.Executed_Gtid_Set || '',
            gtidMode: row.Auto_Position === '1',
            autoPosition: row.Auto_Position === '1'
        };
    }

    /**
     * Parse error information
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private parseError(row: any, threadType: 'io' | 'sql'): ReplicationError | null {
        let errorNumber: number | undefined;
        let errorMessage: string | undefined;
        let timestamp: Date | undefined;

        if (threadType === 'io') {
            errorNumber = row.Last_IO_Errno ? parseInt(row.Last_IO_Errno, 10) : undefined;
            errorMessage = row.Last_IO_Error || undefined;
            if (row.Last_IO_Error_Timestamp) {
                timestamp = new Date(row.Last_IO_Error_Timestamp);
            }
        } else {
            errorNumber = row.Last_SQL_Errno ? parseInt(row.Last_SQL_Errno, 10) : undefined;
            errorMessage = row.Last_SQL_Error || undefined;
            if (row.Last_SQL_Error_Timestamp) {
                timestamp = new Date(row.Last_SQL_Error_Timestamp);
            }
        }

        if (errorNumber && errorNumber !== 0 && errorMessage) {
            return {
                errorNumber,
                errorMessage,
                timestamp: timestamp || new Date(),
                threadType
            };
        }

        return null;
    }

    /**
     * Calculate overall health status
     */
    private calculateHealthStatus(
        ioThread: ThreadStatus,
        sqlThread: ThreadStatus,
        lagSeconds: number | null,
        lastIOError: ReplicationError | null,
        lastSQLError: ReplicationError | null
    ): 'healthy' | 'warning' | 'critical' | 'unknown' {
        // Critical: Either thread is stopped
        if (!ioThread.running || !sqlThread.running) {
            return 'critical';
        }

        // Critical: Recent errors present
        if (lastIOError || lastSQLError) {
            return 'critical';
        }

        // Warning: High lag
        if (lagSeconds !== null) {
            if (lagSeconds > 300) {
                return 'critical'; // > 5 minutes
            }
            if (lagSeconds > 60) {
                return 'warning'; // > 1 minute
            }
        }

        // Unknown: Can't determine lag
        if (lagSeconds === null) {
            return 'unknown';
        }

        return 'healthy';
    }
}
