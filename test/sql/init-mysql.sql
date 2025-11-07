-- MySQL 8.0 Initialization Script
-- Sets up test database with proper permissions and Performance Schema configuration

USE test_db;

-- Grant permissions to test_user
GRANT ALL PRIVILEGES ON test_db.* TO 'test_user'@'%';
GRANT PROCESS ON *.* TO 'test_user'@'%';
GRANT SELECT, UPDATE ON performance_schema.* TO 'test_user'@'%';
GRANT SELECT ON mysql.* TO 'test_user'@'%';
GRANT REPLICATION CLIENT ON *.* TO 'test_user'@'%';

FLUSH PRIVILEGES;

-- Verify Performance Schema is enabled
SELECT @@performance_schema AS performance_schema_enabled;

-- Configure Performance Schema instruments and consumers
UPDATE performance_schema.setup_instruments
SET ENABLED = 'YES', TIMED = 'YES'
WHERE NAME LIKE 'statement/%';

UPDATE performance_schema.setup_instruments
SET ENABLED = 'YES', TIMED = 'YES'
WHERE NAME LIKE 'stage/%';

UPDATE performance_schema.setup_consumers
SET ENABLED = 'YES'
WHERE NAME LIKE 'events_statements_%';

UPDATE performance_schema.setup_consumers
SET ENABLED = 'YES'
WHERE NAME LIKE 'events_stages_%';

-- Verify configuration
SELECT NAME, ENABLED, TIMED
FROM performance_schema.setup_instruments
WHERE NAME LIKE 'statement/%'
LIMIT 5;

SELECT NAME, ENABLED
FROM performance_schema.setup_consumers
WHERE NAME LIKE 'events_%';

SELECT 'MySQL 8.0 test database initialized successfully' AS status;
