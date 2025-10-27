-- Grant permissions to test_user for MyDBA monitoring features
-- This allows test_user to access performance_schema and information_schema tables

-- Grant PROCESS privilege (required for SHOW FULL PROCESSLIST)
GRANT PROCESS ON *.* TO 'test_user'@'%';

-- Grant SHOW DATABASES (required for listing databases)
GRANT SHOW DATABASES ON *.* TO 'test_user'@'%';

-- Grant SELECT on mysql database tables needed for monitoring
-- This gives access to user info, privileges, etc.
GRANT SELECT ON mysql.* TO 'test_user'@'%';

-- Grant SELECT and UPDATE on performance_schema (required for slow query detection, profiling, etc.)
-- In MariaDB, this must be granted explicitly by root
-- UPDATE is needed to configure setup_instruments and setup_consumers tables
GRANT SELECT, UPDATE ON performance_schema.* TO 'test_user'@'%';

-- Grant REPLICATION CLIENT (helpful for monitoring replication status if needed)
GRANT REPLICATION CLIENT ON *.* TO 'test_user'@'%';

-- Flush privileges to ensure they take effect
FLUSH PRIVILEGES;

-- Verify permissions
SHOW GRANTS FOR 'test_user'@'%';

SELECT 'Permissions granted to test_user successfully!' AS status;
