# MyDBA Quick Reference Guide

Quick reference for setting up and using MyDBA effectively.

## Quick Setup Checklist

### 1. Database Configuration (5 minutes)

**Enable Performance Schema:**

MySQL 8.0+:
```ini
[mysqld]
performance_schema = ON
```

MariaDB 10.6+:
```ini
[mysqld]
performance_schema = ON
performance-schema-instrument = '%=ON'
performance-schema-consumer-events-statements-current = ON
performance-schema-consumer-events-statements-history = ON
```

**Restart database after configuration changes.**

### 2. User Permissions (2 minutes)

```sql
CREATE USER 'mydba_user'@'%' IDENTIFIED BY 'secure_password';

-- Required permissions
GRANT PROCESS ON *.* TO 'mydba_user'@'%';
GRANT SHOW DATABASES ON *.* TO 'mydba_user'@'%';
GRANT SELECT ON mysql.* TO 'mydba_user'@'%';
GRANT SELECT, UPDATE ON performance_schema.* TO 'mydba_user'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON your_database.* TO 'mydba_user'@'%';

FLUSH PRIVILEGES;
```

### 3. Verify Setup (1 minute)

```sql
-- Check Performance Schema
SHOW VARIABLES LIKE 'performance_schema';

-- Check permissions
SHOW GRANTS FOR 'mydba_user'@'%';

-- Test Performance Schema access
SELECT COUNT(*) FROM performance_schema.events_statements_history_long;
```

## Common Commands

| Action | Command Palette | Keyboard Shortcut | Chat Command |
|--------|----------------|-------------------|--------------|
| New Connection | `MyDBA: New Connection` | - | - |
| Analyze Query | `MyDBA: Analyze Query` | - | `@mydba /analyze` |
| EXPLAIN Plan | `MyDBA: Explain Query` | - | `@mydba /explain` |
| Profile Query | `MyDBA: Profile Query` | - | `@mydba /profile` |
| View Metrics | Click "Metrics Dashboard" | - | - |
| View Process List | Click "Process List" | - | - |
| Find Slow Queries | Click "Slow Queries" | - | - |
| Find Missing Indexes | Click "Queries Without Indexes" | - | - |

## Feature Requirements

| Feature | Performance Schema Required | Min Privileges | Notes |
|---------|----------------------------|----------------|-------|
| Database Explorer | No | SELECT on mysql.* | Shows databases, tables, columns |
| Metrics Dashboard | Yes | SELECT on performance_schema.* | Real-time monitoring |
| Process List | No | PROCESS | Shows active connections |
| EXPLAIN Plans | No | SELECT on target tables | Visual query plans |
| Query Profiling | Yes | SELECT, UPDATE on performance_schema.* | Execution stages |
| Slow Queries | Yes | SELECT on performance_schema.* | Detects slow queries |
| Queries Without Indexes | Yes | SELECT on performance_schema.* | Finds full table scans |
| AI Analysis | No | - | Works with any query |

## Configuration Files

### MySQL
- **Linux**: `/etc/mysql/my.cnf` or `/etc/my.cnf`
- **macOS**: `/usr/local/etc/my.cnf` (Homebrew)
- **Windows**: `C:\ProgramData\MySQL\MySQL Server 8.0\my.ini`

### MariaDB
- **Linux**: `/etc/mysql/mariadb.conf.d/50-server.cnf`
- **macOS**: `/usr/local/etc/my.cnf` (Homebrew)
- **Windows**: `C:\Program Files\MariaDB XX.X\data\my.ini`

## Restart Commands

### MySQL
```bash
# Linux
sudo systemctl restart mysql

# macOS
brew services restart mysql

# Windows (as Administrator)
net stop MySQL80 && net start MySQL80
```

### MariaDB
```bash
# Linux
sudo systemctl restart mariadb

# macOS
brew services restart mariadb

# Windows (as Administrator)
net stop MariaDB && net start MariaDB
```

## Troubleshooting Quick Fixes

### Performance Schema Not Enabled
```sql
-- Check current status
SHOW VARIABLES LIKE 'performance_schema';

-- If OFF: Edit config file, add performance_schema=ON, restart
```

### Permission Denied
```sql
-- Grant missing permissions
GRANT SELECT, UPDATE ON performance_schema.* TO 'mydba_user'@'%';
FLUSH PRIVILEGES;
```

### Empty Performance Schema Tables (MariaDB)
```ini
# Add to config file (MariaDB requires more explicit config)
[mysqld]
performance_schema = ON
performance-schema-instrument = '%=ON'
performance-schema-consumer-events-statements-current = ON
performance-schema-consumer-events-statements-history = ON
```

### Connection Timeout
```json
// In VSCode settings.json
{
  "mydba.queryTimeout": 60000  // Increase to 60 seconds
}
```

### Slow AI Responses
```json
// Switch to faster AI model
{
  "mydba.ai.provider": "openai",
  "mydba.ai.openaiModel": "gpt-4o-mini"  // Faster than gpt-4
}
```

## Performance Schema Configuration (Advanced)

### Minimal Configuration (Basic Features Only)
```ini
[mysqld]
performance_schema = ON
performance-schema-instrument = 'statement/%=ON'
performance-schema-consumer-events-statements-current = ON
```

### Recommended Configuration (All Features)
```ini
[mysqld]
performance_schema = ON
performance-schema-instrument = '%=ON'
performance-schema-consumer-events-statements-current = ON
performance-schema-consumer-events-statements-history = ON
performance-schema-consumer-events-statements-history-long = ON
performance-schema-consumer-events-stages-history-long = ON
performance-schema-consumer-events-transactions-current = ON
performance-schema-consumer-events-transactions-history = ON
```

### Increase History Size (High-Traffic Databases)
```ini
[mysqld]
performance_schema_events_statements_history_long_size = 100000  # Default: 10000
performance_schema_events_stages_history_long_size = 100000      # Default: 10000
```

## AI Provider Setup

### Auto (Recommended)
```json
{
  "mydba.ai.provider": "auto"  // Auto-detects best available
}
```

### OpenAI (Fastest)
```json
{
  "mydba.ai.provider": "openai",
  "mydba.ai.openaiModel": "gpt-4o-mini"
}
```
Get API key: https://platform.openai.com/api-keys

### Anthropic Claude (Most Accurate)
```json
{
  "mydba.ai.provider": "anthropic",
  "mydba.ai.anthropicModel": "claude-3-5-sonnet-20241022"
}
```
Get API key: https://console.anthropic.com/

### Ollama (100% Local & Private)
```bash
# Install Ollama
# Visit: https://ollama.ai/

# Pull model
ollama pull llama3.1
```

```json
{
  "mydba.ai.provider": "ollama",
  "mydba.ai.ollamaModel": "llama3.1",
  "mydba.ai.ollamaEndpoint": "http://localhost:11434"
}
```

## Security Best Practices

### Production Databases
- ✅ Use read-only user for monitoring
- ✅ Grant permissions only on specific databases
- ✅ Use host-specific grants (not `%`)
- ✅ Require SSL/TLS connections
- ✅ Enable query anonymization: `"mydba.ai.anonymizeQueries": true`
- ✅ Enable safe mode: `"mydba.safeMode": true`

### Development Databases
- ✅ Use separate credentials from production
- ✅ Test destructive operations in dev first
- ✅ Enable confirmation prompts: `"mydba.confirmDestructiveOperations": true`

## Useful Settings

```json
{
  // AI Configuration
  "mydba.ai.enabled": true,
  "mydba.ai.provider": "auto",
  "mydba.ai.anonymizeQueries": true,

  // Performance
  "mydba.refreshInterval": 5000,        // Dashboard refresh (ms)
  "mydba.slowQueryThreshold": 1000,    // Slow query threshold (ms)
  "mydba.queryTimeout": 30000,         // Query timeout (ms)

  // Security
  "mydba.confirmDestructiveOperations": true,
  "mydba.warnMissingWhereClause": true,
  "mydba.safeMode": true,
  "mydba.preview.maxRows": 1000,
  "mydba.dml.maxAffectRows": 1000
}
```

## Resources

- **Full Setup Guide**: [docs/DATABASE_SETUP.md](DATABASE_SETUP.md)
- **Testing Guide**: [test/MARIADB_TESTING.md](../test/MARIADB_TESTING.md)
- **Product Roadmap**: [docs/PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md)
- **Security**: [SECURITY.md](../SECURITY.md)
- **Contributing**: [CONTRIBUTING.md](../CONTRIBUTING.md)

## Support

- **GitHub Issues**: https://github.com/your-org/mydba/issues
- **Discussions**: https://github.com/your-org/mydba/discussions
