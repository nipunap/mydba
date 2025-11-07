# Docker Test Environment

This directory contains the Docker-based testing environment for MyDBA with MySQL 8.0 and MariaDB 10.11 LTS.

## Quick Start

### Start Test Databases

```bash
# Start both MySQL 8.0 and MariaDB 10.11
docker-compose -f docker-compose.test.yml up -d

# Wait for databases to be ready (health checks take ~30 seconds)
docker-compose -f docker-compose.test.yml ps

# Check logs
docker-compose -f docker-compose.test.yml logs -f
```

### Run Integration Tests

```bash
# Run all integration tests
npm run test:integration

# Run specific test file
npm test -- --testPathPattern=integration

# Run with coverage
npm run test:coverage
```

### Stop Test Databases

```bash
# Stop containers
docker-compose -f docker-compose.test.yml down

# Stop and remove volumes (clean slate)
docker-compose -f docker-compose.test.yml down -v
```

## Database Connections

### MySQL 8.0

- **Host:** `localhost`
- **Port:** `3306`
- **Database:** `test_db`
- **Root User:** `root` / `test_password`
- **Test User:** `test_user` / `test_password`

**Connection URL:**
```
mysql://test_user:test_password@localhost:3306/test_db
```

### MariaDB 10.11 LTS

- **Host:** `localhost`
- **Port:** `3307`
- **Database:** `test_db`
- **Root User:** `root` / `test_password`
- **Test User:** `test_user` / `test_password`

**Connection URL:**
```
mysql://test_user:test_password@localhost:3307/test_db
```

## Database Configuration

Both databases are configured with:

- **Performance Schema:** Enabled with all instruments
- **Slow Query Log:** Enabled (threshold: 1 second)
- **Log Queries Not Using Indexes:** Enabled
- **Max Connections:** 200
- **Character Set:** utf8mb4_unicode_ci

### Performance Schema Configuration

The following Performance Schema features are enabled:

- `performance_schema = ON`
- `performance-schema-instrument = '%=ON'`
- `performance-schema-consumer-events-statements-current = ON`
- `performance-schema-consumer-events-statements-history = ON`
- `performance-schema-consumer-events-statements-history-long = ON`
- `performance-schema-consumer-events-stages-current = ON`
- `performance-schema-consumer-events-stages-history = ON`

## Test Data

The databases are initialized with sample data from `/test/sql/`:

1. **init-mysql.sql** / **init-mariadb.sql**: Database configuration and permissions
2. **sample-data.sql**: Test data including:
   - 10 users
   - 15 products
   - 10 orders
   - Order items
   - Unindexed logs table (for query optimization testing)

### Sample Schema

- **users** (id, username, email, password_hash, status, created_at, ...)
- **products** (id, sku, name, description, price, stock_quantity, category, ...)
- **orders** (id, user_id, order_number, status, total_amount, created_at, ...)
- **order_items** (id, order_id, product_id, quantity, unit_price, subtotal)
- **unindexed_logs** (id, user_id, action, details, ip_address, created_at)

## Connecting with CLI

### MySQL 8.0

```bash
docker exec -it mydba-mysql-8.0 mysql -u test_user -ptest_password test_db
```

### MariaDB 10.11

```bash
docker exec -it mydba-mariadb-10.11 mysql -u test_user -ptest_password test_db
```

## Verifying Setup

### Check Performance Schema

```sql
-- Check if Performance Schema is enabled
SHOW VARIABLES LIKE 'performance_schema';

-- Check enabled instruments
SELECT NAME, ENABLED, TIMED
FROM performance_schema.setup_instruments
WHERE NAME LIKE 'statement/%'
LIMIT 5;

-- Check enabled consumers
SELECT NAME, ENABLED
FROM performance_schema.setup_consumers
WHERE NAME LIKE 'events_%';
```

### Check Test Data

```sql
-- Check row counts
SELECT 'users' AS table_name, COUNT(*) AS rows FROM users
UNION ALL
SELECT 'products', COUNT(*) FROM products
UNION ALL
SELECT 'orders', COUNT(*) FROM orders
UNION ALL
SELECT 'order_items', COUNT(*) FROM order_items
UNION ALL
SELECT 'unindexed_logs', COUNT(*) FROM unindexed_logs;
```

### Check Permissions

```sql
-- Check grants for test_user
SHOW GRANTS FOR 'test_user'@'%';
```

## Troubleshooting

### Container not starting

```bash
# Check container logs
docker-compose -f docker-compose.test.yml logs mysql-8.0
docker-compose -f docker-compose.test.yml logs mariadb-10.11

# Check container status
docker ps -a | grep mydba
```

### Health check failing

```bash
# Check health status
docker inspect mydba-mysql-8.0 | grep -A 10 Health
docker inspect mydba-mariadb-10.11 | grep -A 10 Health

# Wait longer (containers can take 30-60 seconds to be fully ready)
docker-compose -f docker-compose.test.yml ps
```

### Port already in use

```bash
# Check what's using the port
lsof -i :3306  # MySQL 8.0
lsof -i :3307  # MariaDB 10.11

# Or use different ports in docker-compose.test.yml
```

### Clean restart

```bash
# Stop and remove everything
docker-compose -f docker-compose.test.yml down -v

# Remove images
docker rmi mysql:8.0 mariadb:10.11

# Start fresh
docker-compose -f docker-compose.test.yml up -d
```

### Data not loading

```bash
# Check initialization logs
docker-compose -f docker-compose.test.yml logs mysql-8.0 | grep -i init
docker-compose -f docker-compose.test.yml logs mariadb-10.11 | grep -i init

# Manually run initialization scripts
docker exec -i mydba-mysql-8.0 mysql -u root -ptest_password test_db < test/sql/init-mysql.sql
docker exec -i mydba-mysql-8.0 mysql -u root -ptest_password test_db < test/sql/sample-data.sql
```

## CI Integration

The Docker test environment is designed to work in CI pipelines:

### GitHub Actions Example

```yaml
- name: Start test databases
  run: docker-compose -f docker-compose.test.yml up -d

- name: Wait for databases
  run: |
    timeout 90 bash -c 'until docker exec mydba-mysql-8.0 mysqladmin ping -h localhost -u root -ptest_password --silent; do sleep 2; done'
    timeout 90 bash -c 'until docker exec mydba-mariadb-10.11 mysqladmin ping -h localhost -u root -ptest_password --silent; do sleep 2; done'

- name: Run integration tests
  run: npm run test:integration

- name: Stop test databases
  run: docker-compose -f docker-compose.test.yml down
```

## Performance

### Resource Usage

- **MySQL 8.0:** ~500MB RAM, 1 CPU
- **MariaDB 10.11:** ~400MB RAM, 1 CPU

### Startup Time

- **First run:** 60-90 seconds (downloading images + initialization)
- **Subsequent runs:** 30-45 seconds (initialization only)

## Best Practices

1. **Always use docker-compose down -v** when you want a completely fresh database
2. **Run tests in parallel** when possible (separate databases)
3. **Use health checks** to ensure databases are ready before running tests
4. **Clean up** after tests to free resources
5. **Check logs** if tests fail unexpectedly

## Related Documentation

- [Database Setup Guide](../docs/DATABASE_SETUP.md)
- [Quick Reference](../docs/QUICK_REFERENCE.md)
- [Integration Testing](./integration/)
