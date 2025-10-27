# MariaDB Integration Testing

This document describes the MariaDB integration tests and how to run them.

## Overview

The MariaDB integration tests verify that MyDBA works correctly with MariaDB 10.11 running in a Docker container. These tests ensure:

- Connection to MariaDB works properly
- MariaDB is correctly detected vs MySQL
- Performance Schema is enabled and accessible
- All monitoring features work with MariaDB
- Proper permissions are granted to `test_user`

## Prerequisites

1. **Docker** - Must be installed and running
2. **Node.js** - Version 18+ with npm
3. **VS Code** - For running the extension tests

## Quick Start

### Run All MariaDB Tests

```bash
# Start MariaDB container and run all tests
npm run test:mariadb
```

### Run All Database Tests (MySQL + MariaDB)

```bash
# Start both MySQL and MariaDB containers
npm run test:db
```

### Manual Setup

If you prefer to manage the Docker containers manually:

```bash
# 1. Start MariaDB container
docker-compose -f docker-compose.test.yml up -d mariadb-10.11

# 2. Wait for initialization (about 20 seconds)
sleep 20

# 3. Verify container is healthy
docker ps | grep mariadb

# 4. Run tests
npm test
```

## MariaDB Test Configuration

### Docker Container

- **Image**: `mariadb:10.11`
- **Container Name**: `mydba-mariadb-10.11`
- **Port**: `3307` (mapped from container port 3306)
- **Root Password**: `test_password`
- **Test Database**: `test_db`
- **Test User**: `test_user` / `test_password`

### Performance Schema

Performance Schema is enabled with the following flags:
- `--performance-schema=ON`
- `--performance-schema-instrument='%=ON'`
- `--performance-schema-consumer-events-statements-current=ON`
- `--performance-schema-consumer-events-statements-history=ON`

### User Permissions

The `test_user` has the following grants:
- `PROCESS` - For process list and monitoring
- `SHOW DATABASES` - For database listing
- `SELECT ON mysql.*` - For metadata access
- `SELECT, UPDATE ON performance_schema.*` - For monitoring and configuration
- `REPLICATION CLIENT` - For replication monitoring
- `ALL PRIVILEGES ON test_db.*` - For test data manipulation

## Test Coverage

The MariaDB integration test suite (`database-mariadb.test.ts`) covers:

### 1. Connection & Detection
- ✅ Connect to MariaDB on port 3307
- ✅ Detect MariaDB version correctly
- ✅ Verify `adapter.isMariaDB` flag
- ✅ Handle connection errors gracefully
- ✅ Disconnect and cleanup properly

### 2. Database Operations
- ✅ List databases (including system databases)
- ✅ List tables from test database
- ✅ Execute parameterized queries safely
- ✅ Query test data
- ✅ Support for InnoDB storage engine
- ✅ UTF8MB4 character set and collation

### 3. Performance Schema
- ✅ Performance Schema is enabled
- ✅ `test_user` can SELECT from performance_schema
- ✅ `test_user` can UPDATE performance_schema configuration
- ✅ Slow query detection works
- ✅ Query statistics are recorded

### 4. Monitoring Features
- ✅ Get process list
- ✅ Get global variables
- ✅ Get session variables
- ✅ Get metrics (connections, threads, uptime)
- ✅ EXPLAIN query support

### 5. Transactions
- ✅ START TRANSACTION support
- ✅ ROLLBACK functionality
- ✅ Data isolation in transactions

### 6. Query Testing
- ✅ Execute slow queries (with SLEEP)
- ✅ Execute unindexed queries
- ✅ SQL injection protection with parameterized queries

## Troubleshooting

### Container Won't Start

```bash
# Check container logs
docker logs mydba-mariadb-10.11

# Common issues:
# - Port 3307 already in use
# - Performance Schema configuration errors
# - Insufficient Docker resources
```

### Tests Skip or Fail

```bash
# Verify container is healthy
docker ps | grep mariadb

# Check if container is on correct port
docker port mydba-mariadb-10.11

# Recreate container from scratch
docker-compose -f docker-compose.test.yml rm -f mariadb-10.11
docker-compose -f docker-compose.test.yml up -d mariadb-10.11
sleep 20
```

### Permission Errors

If you see errors like:
```
SELECT command denied to user 'test_user'@'172.21.0.1' for table `performance_schema`
```

The container needs to be recreated to apply the permission grants:

```bash
# Remove and recreate container
docker-compose -f docker-compose.test.yml rm -f mariadb-10.11
docker-compose -f docker-compose.test.yml up -d mariadb-10.11
sleep 20
```

The initialization SQL files in `test/sql/` will automatically:
1. Create sample data (`sample-data.sql`)
2. Configure Performance Schema (`performance-schema-setup.sql`)
3. Grant permissions to test_user (`user-permissions.sql`)

### Performance Schema Not Enabled

MariaDB requires explicit command-line flags to enable Performance Schema:

```yaml
# In docker-compose.test.yml
command: >
  --performance-schema=ON
  --performance-schema-instrument='%=ON'
  --performance-schema-consumer-events-statements-current=ON
  --performance-schema-consumer-events-statements-history=ON
```

If tests fail with "Performance Schema is not fully configured", verify these flags are present.

## Continuous Integration

For CI/CD pipelines, use the following workflow:

```yaml
# GitHub Actions example
- name: Start MariaDB
  run: docker-compose -f docker-compose.test.yml up -d mariadb-10.11

- name: Wait for MariaDB
  run: |
    timeout 60 bash -c 'until docker exec mydba-mariadb-10.11 mysqladmin ping -h localhost -uroot -ptest_password; do sleep 2; done'

- name: Run MariaDB tests
  run: npm run test:mariadb
```

## Test Data

The test database includes:
- **users** - 10 sample users
- **products** - 15 sample products
- **orders** - 10 sample orders
- **order_items** - 17 order items
- **unindexed_logs** - 7 log entries (for testing unindexed queries)

All test data is automatically loaded on container initialization.

## Differences from MySQL Tests

The MariaDB tests differ from MySQL tests in several ways:

1. **Version Detection**: Checks for "MariaDB" in version string
2. **Port**: Uses 3307 instead of 3306
3. **isMariaDB Flag**: Verifies the adapter correctly identifies MariaDB
4. **Performance Schema**: Tests MariaDB-specific PS behavior
5. **Variables**: Checks MariaDB-specific system variables

## Related Files

- **Test Suite**: `src/test/suite/database-mariadb.test.ts`
- **Test Helper**: `src/test/helpers/database-helper.ts` (see `createMariaDBTestConnection()`)
- **Docker Config**: `docker-compose.test.yml`
- **Sample Data**: `test/sql/sample-data.sql`
- **Performance Schema Setup**: `test/sql/performance-schema-setup.sql`
- **User Permissions**: `test/sql/user-permissions.sql`

## Contributing

When adding new MariaDB-specific features:

1. Add corresponding tests to `database-mariadb.test.ts`
2. Verify tests pass with both fresh and existing containers
3. Document any MariaDB-specific behavior differences
4. Update this documentation as needed
