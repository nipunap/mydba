-- Replication Primary Setup
-- Create replication user for both MySQL and MariaDB

CREATE USER IF NOT EXISTS 'repl_user'@'%' IDENTIFIED BY 'repl_password';
GRANT REPLICATION SLAVE ON *.* TO 'repl_user'@'%';
FLUSH PRIVILEGES;

-- For MySQL 8.0.22+, also grant REPLICATION CLIENT
GRANT REPLICATION CLIENT ON *.* TO 'repl_user'@'%';
FLUSH PRIVILEGES;

-- Show master status (for manual verification)
-- SHOW MASTER STATUS;

