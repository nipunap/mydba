# Database Setup Guide

This guide provides detailed instructions for setting up MySQL and MariaDB databases for use with MyDBA.

## Table of Contents

- [Supported Versions](#supported-versions)
- [Performance Schema Setup](#performance-schema-setup)
- [User Permissions](#user-permissions)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)
- [Docker Setup](#docker-setup)

## Supported Versions

MyDBA supports the following database versions:

| Database | Supported Versions | Notes |
|----------|-------------------|-------|
| **MySQL** | 8.0 LTS, 8.4 Innovation, 9.x+ | GA (General Availability) versions only |
| **MariaDB** | 10.6+, 10.11 LTS, 11.x+ | GA versions only |

**Important**: MySQL 5.7 reached End of Life in October 2023 and is not supported. Please upgrade to MySQL 8.0+ for security and performance.

## Performance Schema Setup

### Why Performance Schema?

Performance Schema is required for:
- **Query Profiling**: Detailed execution stage analysis
- **Slow Query Detection**: Identify queries exceeding thresholds
- **Transaction Monitoring**: Detect active transactions in process list
- **Query Without Indexes**: Find queries performing full table scans
- **Real-time Metrics**: Collect database performance statistics

### MySQL 8.0+ Configuration

#### Step 1: Enable Performance Schema

Edit your MySQL configuration file:

**Linux/macOS**: `/etc/mysql/my.cnf` or `/etc/my.cnf`
**Windows**: `C:\ProgramData\MySQL\MySQL Server 8.0\my.ini`

```ini
[mysqld]
# Enable Performance Schema
performance_schema = ON

# Optional: Pre-configure common instruments (MyDBA can auto-configure these)
performance-schema-instrument = 'statement/%=ON'
performance-schema-instrument = 'stage/%=ON'
performance-schema-instrument = 'transaction/%=ON'

# Optional: Pre-enable consumers (MyDBA can auto-configure these)
performance-schema-consumer-events-statements-current = ON
performance-schema-consumer-events-statements-history = ON
performance-schema-consumer-events-statements-history-long = ON
performance-schema-consumer-events-stages-history-long = ON
```

#### Step 2: Restart MySQL

```bash
# Linux (systemd)
sudo systemctl restart mysql

# Linux (SysV)
sudo service mysql restart

# macOS (Homebrew)
brew services restart mysql

# Windows (Command Prompt as Administrator)
net stop MySQL80
net start MySQL80
```

### MariaDB 10.6+ Configuration

MariaDB requires more explicit configuration than MySQL:

#### Step 1: Enable Performance Schema

Edit your MariaDB configuration file:

**Linux**: `/etc/mysql/mariadb.conf.d/50-server.cnf` or `/etc/my.cnf.d/server.cnf`
**macOS**: `/usr/local/etc/my.cnf` (Homebrew) or `/opt/homebrew/etc/my.cnf` (Apple Silicon)
**Windows**: `C:\Program Files\MariaDB XX.X\data\my.ini`

```ini
[mysqld]
# Enable Performance Schema (REQUIRED)
performance_schema = ON

# Enable all instruments (RECOMMENDED for MyDBA)
performance-schema-instrument = '%=ON'

# Enable statement consumers (REQUIRED)
performance-schema-consumer-events-statements-current = ON
performance-schema-consumer-events-statements-history = ON
performance-schema-consumer-events-statements-history-long = ON

# Enable stage consumers (REQUIRED for query profiling)
performance-schema-consumer-events-stages-current = ON
performance-schema-consumer-events-stages-history = ON
performance-schema-consumer-events-stages-history-long = ON

# Enable transaction consumers (REQUIRED for transaction monitoring)
performance-schema-consumer-events-transactions-current = ON
performance-schema-consumer-events-transactions-history = ON
```

#### Step 2: Restart MariaDB

```bash
# Linux (systemd)
sudo systemctl restart mariadb

# Linux (SysV)
sudo service mariadb restart

# macOS (Homebrew)
brew services restart mariadb

# Windows (Command Prompt as Administrator)
net stop MariaDB
net start MariaDB
```

### Auto-Configuration

MyDBA automatically configures Performance Schema instruments and consumers when you use profiling features. However, this requires:
1. Performance Schema to be enabled (`performance_schema = ON`)
2. User to have `UPDATE` privilege on `performance_schema.*`

If auto-configuration fails, MyDBA will display helpful error messages with configuration instructions.

## User Permissions

### Minimum Required Permissions

For full MyDBA functionality, create a dedicated user with these privileges:

```sql
-- Create user (adjust host as needed)
CREATE USER 'mydba_user'@'%' IDENTIFIED BY 'secure_password';

-- REQUIRED: Process monitoring
GRANT PROCESS ON *.* TO 'mydba_user'@'%';

-- REQUIRED: Database listing
GRANT SHOW DATABASES ON *.* TO 'mydba_user'@'%';

-- REQUIRED: Metadata access (schema information)
GRANT SELECT ON mysql.* TO 'mydba_user'@'%';

-- REQUIRED: Performance Schema access
-- SELECT: Read performance data
-- UPDATE: Configure instruments and consumers (auto-configuration)
GRANT SELECT, UPDATE ON performance_schema.* TO 'mydba_user'@'%';

-- OPTIONAL: Replication monitoring
GRANT REPLICATION CLIENT ON *.* TO 'mydba_user'@'%';

-- Database-specific access (adjust as needed)
GRANT SELECT, INSERT, UPDATE, DELETE ON your_database.* TO 'mydba_user'@'%';

-- Apply changes
FLUSH PRIVILEGES;
```

### Read-Only User (Monitoring Only)

If you only need monitoring features without query execution:

```sql
CREATE USER 'mydba_readonly'@'%' IDENTIFIED BY 'secure_password';

GRANT PROCESS ON *.* TO 'mydba_readonly'@'%';
GRANT SHOW DATABASES ON *.* TO 'mydba_readonly'@'%';
GRANT SELECT ON mysql.* TO 'mydba_readonly'@'%';
GRANT SELECT, UPDATE ON performance_schema.* TO 'mydba_readonly'@'%';
GRANT REPLICATION CLIENT ON *.* TO 'mydba_readonly'@'%';
GRANT SELECT ON your_database.* TO 'mydba_readonly'@'%';

FLUSH PRIVILEGES;
```

### Production Considerations

For production databases:

1. **Use specific hosts** instead of `%`:
   ```sql
   CREATE USER 'mydba_user'@'10.0.1.0/255.255.255.0' IDENTIFIED BY 'secure_password';
   ```

2. **Use SSL/TLS** for encrypted connections:
   ```sql
   CREATE USER 'mydba_user'@'%' IDENTIFIED BY 'secure_password' REQUIRE SSL;
   ```

3. **Limit database access** to only what's needed:
   ```sql
   GRANT SELECT ON production_db.* TO 'mydba_user'@'%';
   -- Avoid GRANT ALL or global privileges
   ```

4. **Enable audit logging** to track MyDBA operations

## Verification

### Verify Performance Schema

```sql
-- Check if Performance Schema is enabled
SHOW VARIABLES LIKE 'performance_schema';
-- Expected: performance_schema | ON

-- Check enabled instruments (MySQL/MariaDB)
SELECT COUNT(*) as enabled_statements
FROM performance_schema.setup_instruments
WHERE NAME LIKE 'statement/%' AND ENABLED = 'YES';
-- Expected: > 0 (ideally all statement instruments)

-- Check enabled consumers
SELECT NAME, ENABLED
FROM performance_schema.setup_consumers
WHERE NAME LIKE '%statements%' OR NAME LIKE '%stages%' OR NAME LIKE '%transactions%';
-- Expected: All should show ENABLED = YES
```

### Verify User Permissions

```sql
-- Check grants for your user
SHOW GRANTS FOR 'mydba_user'@'%';

-- Test Performance Schema access
SELECT COUNT(*) FROM performance_schema.events_statements_history_long;
-- Should NOT return "Access denied" error

-- Test UPDATE privilege (required for auto-configuration)
UPDATE performance_schema.setup_instruments
SET ENABLED = 'YES', TIMED = 'YES'
WHERE NAME LIKE 'statement/%';
-- Should complete without error
```

### Test Connection from MyDBA

1. Open VSCode/Cursor
2. Run `MyDBA: New Connection` from Command Palette
3. Enter your connection details:
   - Host: `localhost` or your server IP
   - Port: `3306` (MySQL) or `3307` (MariaDB)
   - Username: `mydba_user`
   - Password: `your_password`
   - Database: `your_database`
4. Select environment (dev/staging/prod)
5. Click "Connect"

MyDBA will automatically verify:
- Connection succeeds
- Performance Schema is enabled
- User has required permissions

## Troubleshooting

### Performance Schema Not Enabled

**Error**: `Performance Schema is not enabled`

**Solution**:
1. Add `performance_schema = ON` to configuration file
2. Restart database server
3. Verify with `SHOW VARIABLES LIKE 'performance_schema';`

### Permission Denied Errors

**Error**: `SELECT command denied for table 'performance_schema.events_statements_history_long'`

**Solution**:
```sql
-- Grant Performance Schema access
GRANT SELECT, UPDATE ON performance_schema.* TO 'mydba_user'@'%';
FLUSH PRIVILEGES;
```

### MariaDB Performance Schema Tables Empty

**Error**: Query profiling shows no data

**Solution**: MariaDB needs explicit command-line flags:
```ini
[mysqld]
performance_schema = ON
performance-schema-instrument = '%=ON'
performance-schema-consumer-events-statements-current = ON
performance-schema-consumer-events-statements-history = ON
performance-schema-consumer-events-statements-history-long = ON
performance-schema-consumer-events-stages-history-long = ON
```

### Auto-Configuration Fails

**Error**: `Cannot update performance_schema.setup_instruments`

**Solution**: Grant UPDATE privilege:
```sql
GRANT UPDATE ON performance_schema.* TO 'mydba_user'@'%';
FLUSH PRIVILEGES;
```

### Slow Query Detection Not Working

**Possible causes**:
1. No queries are actually slow (increase threshold in settings)
2. Performance Schema not collecting statement history
3. History tables are full (increase `performance_schema_events_statements_history_long_size`)

**Solution**:
```ini
[mysqld]
# Increase history size (default: 10000)
performance_schema_events_statements_history_long_size = 100000
```

## Docker Setup

For development and testing, use the provided Docker configuration:

### MySQL 8.0

```yaml
# docker-compose.yml
version: '3.8'
services:
  mysql:
    image: mysql:8.0
    ports:
      - "3306:3306"
    environment:
      MYSQL_ROOT_PASSWORD: root_password
      MYSQL_DATABASE: test_db
      MYSQL_USER: mydba_user
      MYSQL_PASSWORD: mydba_password
    command: >
      --performance-schema=ON
      --performance-schema-instrument='%=ON'
      --performance-schema-consumer-events-statements-current=ON
      --performance-schema-consumer-events-statements-history=ON
      --performance-schema-consumer-events-statements-history-long=ON
```

### MariaDB 10.11

```yaml
# docker-compose.yml
version: '3.8'
services:
  mariadb:
    image: mariadb:10.11
    ports:
      - "3307:3306"
    environment:
      MYSQL_ROOT_PASSWORD: root_password
      MYSQL_DATABASE: test_db
      MYSQL_USER: mydba_user
      MYSQL_PASSWORD: mydba_password
    command: >
      --performance-schema=ON
      --performance-schema-instrument='%=ON'
      --performance-schema-consumer-events-statements-current=ON
      --performance-schema-consumer-events-statements-history=ON
      --performance-schema-consumer-events-statements-history-long=ON
      --performance-schema-consumer-events-stages-history-long=ON
      --performance-schema-consumer-events-transactions-current=ON
```

### Start and Test

```bash
# Start database
docker-compose up -d

# Wait for initialization
sleep 10

# Connect and verify
docker exec -it <container_name> mysql -u mydba_user -p

# In MySQL/MariaDB prompt:
SHOW VARIABLES LIKE 'performance_schema';
SELECT COUNT(*) FROM performance_schema.events_statements_history_long;
```

## Additional Resources

- [MySQL 8.4 Performance Schema Documentation](https://dev.mysql.com/doc/refman/8.4/en/performance-schema.html)
- [MySQL Performance Schema Quick Start](https://dev.mysql.com/doc/refman/8.4/en/performance-schema-quick-start.html)
- [MariaDB Performance Schema Documentation](https://mariadb.com/kb/en/performance-schema/)
- [MyDBA Testing Guide](../test/MARIADB_TESTING.md)

## Support

If you encounter issues not covered in this guide:
1. Check [GitHub Issues](https://github.com/your-org/mydba/issues)
2. Review [Troubleshooting Guide](TROUBLESHOOTING.md)
3. Open a new issue with:
   - Database version (`SELECT VERSION();`)
   - Performance Schema status (`SHOW VARIABLES LIKE 'performance_schema';`)
   - User grants (`SHOW GRANTS FOR CURRENT_USER();`)
   - Error messages from MyDBA
