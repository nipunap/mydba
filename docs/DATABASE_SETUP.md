# Database Setup Guide

Quick setup guide for MySQL and MariaDB databases with MyDBA.

## Supported Versions

| Database | Supported Versions | Notes |
|----------|-------------------|-------|
| **MySQL** | 8.0 LTS, 8.4 Innovation, 9.x+ | GA versions only |
| **MariaDB** | 10.6+, 10.11 LTS, 11.x+ | GA versions only |

> **Note**: MySQL 5.7 reached End of Life (October 2023) and is not supported.

## Quick Setup (5 Minutes)

### 1. Enable Performance Schema

Performance Schema is required for query profiling, slow query detection, and index analysis.

**MySQL 8.0+:**
```ini
# Linux/macOS: /etc/mysql/my.cnf or /etc/my.cnf
# Windows: C:\ProgramData\MySQL\MySQL Server 8.0\my.ini

[mysqld]
performance_schema = ON
performance-schema-instrument = 'statement/%=ON'
performance-schema-consumer-events-statements-current = ON
performance-schema-consumer-events-statements-history = ON
performance-schema-consumer-events-statements-history-long = ON
```

**MariaDB 10.6+:**
```ini
# Linux: /etc/mysql/mariadb.conf.d/50-server.cnf
# macOS: /usr/local/etc/my.cnf (Homebrew)
# Windows: C:\Program Files\MariaDB XX.X\data\my.ini

[mysqld]
performance_schema = ON
performance-schema-instrument = '%=ON'
performance-schema-consumer-events-statements-current = ON
performance-schema-consumer-events-statements-history = ON
performance-schema-consumer-events-statements-history-long = ON
performance-schema-consumer-events-stages-history-long = ON
performance-schema-consumer-events-transactions-current = ON
```

**Restart your database** after configuration changes:
```bash
# MySQL - Linux
sudo systemctl restart mysql

# MySQL - macOS
brew services restart mysql

# MariaDB - Linux
sudo systemctl restart mariadb

# MariaDB - macOS
brew services restart mariadb
```

### 2. Create User with Permissions

```sql
-- Create user
CREATE USER 'mydba_user'@'%' IDENTIFIED BY 'secure_password';

-- Grant required permissions
GRANT PROCESS ON *.* TO 'mydba_user'@'%';
GRANT SHOW DATABASES ON *.* TO 'mydba_user'@'%';
GRANT SELECT ON mysql.* TO 'mydba_user'@'%';
GRANT SELECT, UPDATE ON performance_schema.* TO 'mydba_user'@'%';

-- Grant database access (adjust as needed)
GRANT SELECT, INSERT, UPDATE, DELETE ON your_database.* TO 'mydba_user'@'%';

FLUSH PRIVILEGES;
```

**For read-only monitoring:**
```sql
CREATE USER 'mydba_readonly'@'%' IDENTIFIED BY 'secure_password';
GRANT PROCESS, SHOW DATABASES ON *.* TO 'mydba_readonly'@'%';
GRANT SELECT ON mysql.* TO 'mydba_readonly'@'%';
GRANT SELECT, UPDATE ON performance_schema.* TO 'mydba_readonly'@'%';
GRANT SELECT ON your_database.* TO 'mydba_readonly'@'%';
FLUSH PRIVILEGES;
```

### 3. Verify Setup

```sql
-- Check Performance Schema
SHOW VARIABLES LIKE 'performance_schema';
-- Expected: performance_schema | ON

-- Check permissions
SHOW GRANTS FOR 'mydba_user'@'%';

-- Test Performance Schema access
SELECT COUNT(*) FROM performance_schema.events_statements_history_long;
-- Should NOT return "Access denied"
```

## Production Security

For production databases:

1. **Use specific hosts** instead of `%`:
   ```sql
   CREATE USER 'mydba_user'@'10.0.1.0/255.255.255.0' IDENTIFIED BY 'secure_password';
   ```

2. **Require SSL/TLS**:
   ```sql
   CREATE USER 'mydba_user'@'%' IDENTIFIED BY 'secure_password' REQUIRE SSL;
   ```

3. **Limit database access**:
   ```sql
   -- Grant only on specific databases
   GRANT SELECT ON production_db.* TO 'mydba_user'@'%';
   ```

4. **Use strong passwords** and rotate regularly

## Docker Setup (Development)

For local development and testing:

**MySQL 8.0:**
```yaml
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
```

**MariaDB 10.11:**
```yaml
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
      --performance-schema-consumer-events-stages-history-long=ON
```

## Troubleshooting

### Performance Schema Not Enabled

**Error**: `Performance Schema is not enabled`

**Solution**:
1. Add `performance_schema = ON` to config file
2. Restart database server
3. Verify: `SHOW VARIABLES LIKE 'performance_schema';`

### Permission Denied

**Error**: `SELECT command denied for table 'performance_schema.events_statements_history_long'`

**Solution**:
```sql
GRANT SELECT, UPDATE ON performance_schema.* TO 'mydba_user'@'%';
FLUSH PRIVILEGES;
```

### MariaDB Performance Schema Empty

**Symptom**: Query profiling shows no data

**Solution**: MariaDB requires explicit configuration:
```ini
[mysqld]
performance_schema = ON
performance-schema-instrument = '%=ON'
performance-schema-consumer-events-statements-current = ON
performance-schema-consumer-events-statements-history = ON
performance-schema-consumer-events-statements-history-long = ON
performance-schema-consumer-events-stages-history-long = ON
```

### Slow Query Detection Not Working

**Possible causes**:
1. No queries exceed threshold (lower it in settings)
2. History tables are full

**Solution**:
```ini
[mysqld]
# Increase history size (default: 10000)
performance_schema_events_statements_history_long_size = 100000
```

## Feature Requirements

| Feature | Performance Schema Required | Min Privileges |
|---------|----------------------------|----------------|
| Database Explorer | No | SELECT on mysql.* |
| Process List | No | PROCESS |
| Query Execution | No | SELECT/INSERT/UPDATE/DELETE on target DB |
| Metrics Dashboard | Yes | SELECT on performance_schema.* |
| Query Profiling | Yes | SELECT, UPDATE on performance_schema.* |
| Slow Queries | Yes | SELECT on performance_schema.* |
| Queries Without Indexes | Yes | SELECT on performance_schema.* |
| EXPLAIN Plans | No | SELECT on target tables |

## Auto-Configuration

MyDBA automatically configures Performance Schema instruments and consumers when needed. This requires:
1. `performance_schema = ON` in config
2. `UPDATE` privilege on `performance_schema.*`

If auto-configuration fails, MyDBA shows helpful error messages with instructions.

## Resources

- [MySQL 8.4 Performance Schema Docs](https://dev.mysql.com/doc/refman/8.4/en/performance-schema.html)
- [MariaDB Performance Schema Docs](https://mariadb.com/kb/en/performance-schema/)
- [MyDBA Quick Reference](QUICK_REFERENCE.md)
- [MyDBA Testing Guide](../test/MARIADB_TESTING.md)

## Support

Having issues?
- Check [GitHub Issues](https://github.com/nipunap/mydba/issues)
- Join [GitHub Discussions](https://github.com/nipunap/mydba/discussions)
