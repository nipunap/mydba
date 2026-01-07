-- MySQL 8.0 Replica Setup
-- This script sets up replication on the MySQL 8.0 replica

-- Wait for primary to be ready (via healthcheck dependency)
-- Then configure replication

-- Change master to primary with GTID auto-positioning
CHANGE REPLICATION SOURCE TO
  SOURCE_HOST='mysql-8.0',
  SOURCE_PORT=3306,
  SOURCE_USER='repl_user',
  SOURCE_PASSWORD='repl_password',
  SOURCE_AUTO_POSITION=1,
  GET_SOURCE_PUBLIC_KEY=1;

-- Note: Use CHANGE MASTER TO for MySQL < 8.0.23 compatibility testing:
-- CHANGE MASTER TO
--   MASTER_HOST='mysql-8.0',
--   MASTER_PORT=3306,
--   MASTER_USER='repl_user',
--   MASTER_PASSWORD='repl_password',
--   MASTER_AUTO_POSITION=1,
--   GET_MASTER_PUBLIC_KEY=1;

-- Don't start replication automatically (for testing)
-- Use --skip-slave-start in docker-compose
-- Manual start: START REPLICA; (or START SLAVE;)

