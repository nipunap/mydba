-- Performance Schema Setup for MyDBA Integration Tests
-- Enables and configures Performance Schema for testing transaction detection and query profiling

-- Enable Performance Schema (already enabled via command line flag in docker-compose)
-- SET GLOBAL performance_schema = ON;

-- Enable statement instrumentation
UPDATE performance_schema.setup_instruments
SET ENABLED = 'YES', TIMED = 'YES'
WHERE NAME LIKE 'statement/%';

-- Enable transaction instrumentation
UPDATE performance_schema.setup_instruments
SET ENABLED = 'YES', TIMED = 'YES'
WHERE NAME LIKE 'transaction%';

-- Enable stage instrumentation (for query profiling)
UPDATE performance_schema.setup_instruments
SET ENABLED = 'YES', TIMED = 'YES'
WHERE NAME LIKE 'stage/%';

-- Enable wait instrumentation
UPDATE performance_schema.setup_instruments
SET ENABLED = 'YES', TIMED = 'YES'
WHERE NAME LIKE 'wait/%';

-- Enable statement history consumer
UPDATE performance_schema.setup_consumers
SET ENABLED = 'YES'
WHERE NAME LIKE '%statement%';

-- Enable transaction history consumer
UPDATE performance_schema.setup_consumers
SET ENABLED = 'YES'
WHERE NAME LIKE '%transaction%';

-- Enable stage history consumer (for profiling)
UPDATE performance_schema.setup_consumers
SET ENABLED = 'YES'
WHERE NAME LIKE '%stage%';

-- Enable events_statements_current
UPDATE performance_schema.setup_consumers
SET ENABLED = 'YES'
WHERE NAME = 'events_statements_current';

-- Enable events_statements_history
UPDATE performance_schema.setup_consumers
SET ENABLED = 'YES'
WHERE NAME = 'events_statements_history';

-- Enable events_statements_history_long
UPDATE performance_schema.setup_consumers
SET ENABLED = 'YES'
WHERE NAME = 'events_statements_history_long';

-- Enable events_transactions_current
UPDATE performance_schema.setup_consumers
SET ENABLED = 'YES'
WHERE NAME = 'events_transactions_current';

-- Enable events_transactions_history
UPDATE performance_schema.setup_consumers
SET ENABLED = 'YES'
WHERE NAME = 'events_transactions_history';

-- Enable events_stages_current
UPDATE performance_schema.setup_consumers
SET ENABLED = 'YES'
WHERE NAME = 'events_stages_current';

-- Enable events_stages_history
UPDATE performance_schema.setup_consumers
SET ENABLED = 'YES'
WHERE NAME = 'events_stages_history';

-- Configure statement digest
SET GLOBAL performance_schema_max_digest_length = 1024;

-- Configure max statement history
SET GLOBAL performance_schema_events_statements_history_size = 100;
SET GLOBAL performance_schema_events_statements_history_long_size = 10000;

-- Configure max transaction history
SET GLOBAL performance_schema_events_transactions_history_size = 100;

-- Configure max stage history
SET GLOBAL performance_schema_events_stages_history_size = 100;

-- Verify Performance Schema is enabled and configured
SELECT
    'Performance Schema Status' AS check_name,
    @@performance_schema AS enabled,
    @@performance_schema_max_digest_length AS digest_length;

-- Show enabled consumers
SELECT NAME, ENABLED
FROM performance_schema.setup_consumers
WHERE ENABLED = 'YES'
ORDER BY NAME;

-- Show enabled instruments count
SELECT
    SUBSTRING_INDEX(NAME, '/', 1) AS instrument_category,
    COUNT(*) AS enabled_count
FROM performance_schema.setup_instruments
WHERE ENABLED = 'YES'
GROUP BY instrument_category
ORDER BY enabled_count DESC;

SELECT 'Performance Schema configured successfully for testing!' AS status;
