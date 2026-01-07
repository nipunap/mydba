import { ReplicationParser } from '../replication-parser';

describe('ReplicationParser', () => {
    const parser = new ReplicationParser();

    it('throws when no replication status rows are returned', () => {
        expect(() => parser.parseReplicationStatus([], '8.0.41')).toThrow('No replication status data returned');
    });

    it('parses binlog-based status using legacy field names (healthy)', () => {
        const row = {
            Slave_IO_Running: 'Yes',
            Slave_IO_State: 'Waiting for master to send event',
            Slave_SQL_Running: 'Yes',
            Replica_SQL_Running_State: 'Replica has read all relay log; waiting for more updates',
            Seconds_Behind_Master: '10',
            Master_Host: 'primary.local',
            Master_Port: 3306,
            Master_User: 'repl',
            Master_Log_File: 'mysql-bin.000001',
            Read_Master_Log_Pos: '1234',
            Relay_Log_File: 'relay-bin.000002',
            Relay_Log_Pos: '5678',
            Relay_Master_Log_File: 'mysql-bin.000001',
            Last_IO_Errno: '0',
            Last_IO_Error: '',
            Last_SQL_Errno: '0',
            Last_SQL_Error: ''
        };

        const status = parser.parseReplicationStatus([row], '8.0.41');
        expect(status.replicaType).toBe('binlog');
        expect(status.masterHost).toBe('primary.local');
        expect(status.masterPort).toBe(3306);
        expect(status.masterUser).toBe('repl');
        expect(status.ioThread.running).toBe(true);
        expect(status.sqlThread.running).toBe(true);
        expect(status.lagSeconds).toBe(10);
        expect(status.healthStatus).toBe('healthy');
        const pos = status.binlogPosition;
        expect(pos).toBeDefined();
        if (!pos) {
            throw new Error('Expected binlogPosition to be defined');
        }
        expect(pos.masterLogFile).toBe('mysql-bin.000001');
        expect(pos.masterLogPos).toBe(1234);
        expect(pos.relayLogFile).toBe('relay-bin.000002');
        expect(pos.relayLogPos).toBe(5678);
        expect(pos.relayMasterLogFile).toBe('mysql-bin.000001');
        expect(status.timestamp).toEqual(expect.any(Date));
    });

    it('parses GTID-based status using MySQL 8+ field names (warning due to lag)', () => {
        const row = {
            Replica_IO_Running: 'Yes',
            Replica_IO_State: 'Connecting to source',
            Replica_SQL_Running: 'Yes',
            Replica_SQL_Running_State: 'Waiting for dependent transaction to commit',
            Seconds_Behind_Source: '120',
            Source_Host: 'source.local',
            Source_Port: 3306,
            Source_User: 'repl',
            Source_Log_File: 'binlog.000003',
            Read_Source_Log_Pos: '900',
            Retrieved_Gtid_Set: 'uuid:1-10',
            Executed_Gtid_Set: 'uuid:1-9',
            Auto_Position: '1',
            Last_IO_Errno: '0',
            Last_IO_Error: '',
            Last_SQL_Errno: '0',
            Last_SQL_Error: ''
        };

        const status = parser.parseReplicationStatus([row], '8.0.41');
        expect(status.replicaType).toBe('gtid');
        expect(status.gtidInfo).toBeDefined();
        expect(status.gtidInfo?.gtidMode).toBe(true);
        expect(status.masterHost).toBe('source.local');
        expect(status.masterPort).toBe(3306);
        expect(status.ioThread.running).toBe(true);
        expect(status.sqlThread.running).toBe(true);
        expect(status.lagSeconds).toBe(120);
        expect(status.healthStatus).toBe('warning');
        const pos = status.binlogPosition;
        expect(pos).toBeDefined();
        if (!pos) {
            throw new Error('Expected binlogPosition to be defined');
        }
        expect(pos.masterLogFile).toBe('binlog.000003');
        expect(pos.masterLogPos).toBe(900);
    });

    it('returns unknown health when lag is NULL', () => {
        const row = {
            Slave_IO_Running: 'Yes',
            Slave_SQL_Running: 'Yes',
            Seconds_Behind_Master: 'NULL',
            Master_Host: 'primary.local',
            Master_Port: 3306,
            Master_User: 'repl'
        };

        const status = parser.parseReplicationStatus([row], '8.0.41');
        expect(status.lagSeconds).toBeNull();
        expect(status.healthStatus).toBe('unknown');
    });

    it('returns critical health when a thread is stopped', () => {
        const row = {
            Slave_IO_Running: 'No',
            Slave_SQL_Running: 'Yes',
            Seconds_Behind_Master: '0',
            Master_Host: 'primary.local',
            Master_Port: 3306,
            Master_User: 'repl'
        };

        const status = parser.parseReplicationStatus([row], '8.0.41');
        expect(status.healthStatus).toBe('critical');
    });

    it('returns critical health when an error is present', () => {
        const row = {
            Slave_IO_Running: 'Yes',
            Slave_SQL_Running: 'Yes',
            Seconds_Behind_Master: '0',
            Master_Host: 'primary.local',
            Master_Port: 3306,
            Master_User: 'repl',
            Last_IO_Errno: '123',
            Last_IO_Error: 'Access denied',
            Last_IO_Error_Timestamp: '2026-01-07 00:00:00'
        };

        const status = parser.parseReplicationStatus([row], '8.0.41');
        expect(status.lastIOError).not.toBeNull();
        expect(status.healthStatus).toBe('critical');
    });
});


