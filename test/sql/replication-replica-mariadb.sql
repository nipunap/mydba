-- MariaDB 10.11 Replica Setup
-- This script sets up replication on the MariaDB replica

-- Wait for primary to be ready (via healthcheck dependency)
-- Then configure replication using SLAVE terminology (MariaDB uses SLAVE)

CHANGE MASTER TO
  MASTER_HOST='mariadb-10.11',
  MASTER_PORT=3306,
  MASTER_USER='repl_user',
  MASTER_PASSWORD='repl_password',
  MASTER_USE_GTID=slave_pos;

-- Don't start replication automatically (for testing)
-- Use --skip-slave-start in docker-compose
-- Manual start: START SLAVE;

