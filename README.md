# MyDBA - AI-Powered Database Assistant

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://marketplace.visualstudio.com/items?itemName=mydba.mydba)
[![License](https://img.shields.io/badge/license-Apache%202.0-green.svg)](LICENSE)
[![VSCode](https://img.shields.io/badge/VSCode-1.85%2B-blue.svg)](https://code.visualstudio.com/)
[![Phase 1](https://img.shields.io/badge/Phase%201-Complete-brightgreen.svg)](docs/PHASE1_COMPLETION_PLAN.md)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)](https://github.com/your-org/mydba/actions)
[![Coverage](https://img.shields.io/badge/coverage-%3E70%25-brightgreen.svg)](coverage/index.html)
[![License Compliance](https://img.shields.io/badge/licenses-compliant-brightgreen.svg)](docs/LICENSE_COMPLIANCE.md)
[![PR Checks](https://img.shields.io/badge/PR%20checks-automated-blue.svg)](docs/PR_CHECKS.md)

MyDBA is an AI-powered VSCode extension that brings database management, monitoring, and optimization directly into your development environment. Built for developers and database administrators who want intelligent insights without leaving their IDE.

## 🚀 Features

### Phase 1 MVP ✅ (Complete)
- **Multi-Database Support**: MySQL 8.0+, MariaDB 10.6+ (GA versions only)
- **AI-Powered Query Analysis**: Multi-provider support (VSCode LM, OpenAI, Anthropic, Ollama)
- **Visual EXPLAIN Plans**: Interactive tree diagrams with pain point highlighting
- **Query Profiling**: Performance Schema integration with waterfall charts
- **Database Explorer**: Tree view with databases, tables, indexes, and processes
- **Enhanced Process List**: Transaction detection with grouping by user/host/query
- **Security-First Design**: Credential isolation, production safeguards, query anonymization
- **Documentation-Grounded AI**: RAG system with MySQL/MariaDB docs to reduce hallucinations
- **Editor Compatibility**: Works in VSCode, Cursor, Windsurf, and VSCodium
- **Comprehensive Testing**: Integration tests with Docker, 70%+ code coverage

### Metrics Dashboard

![Database Metrics Dashboard](resources/metrics-dashboard-screenshot.png)

Real-time monitoring dashboard showing:
- Server information (version, uptime)
- Connections over time (current vs max)
- Queries per second with slow query detection
- Buffer pool hit rate
- Thread activity (running vs connected)

### Coming Soon (Phase 2)
- PostgreSQL, Redis, Valkey support
- Host-level metrics integration
- Advanced AI features with semantic search
- Percona Toolkit inspired features

## 📋 Requirements

### Editor Requirements
- **VSCode**: 1.85.0 or higher (also supports Cursor, Windsurf, VSCodium)
- **Node.js**: 18.x or higher (for development)

### Database Requirements

#### Supported Versions
- **MySQL**: 8.0+ (LTS and Innovation releases)
- **MariaDB**: 10.6+, 10.11 LTS, 11.x+ (GA versions only)

#### Performance Schema (Required)
MyDBA requires Performance Schema to be enabled for monitoring features like:
- Query profiling and execution analysis
- Slow query detection
- Queries without indexes detection
- Transaction monitoring
- Process list with transaction details

**Enable Performance Schema:**

For MySQL 8.0+:
```ini
# In my.cnf or my.ini
[mysqld]
performance_schema = ON
```

For MariaDB 10.6+:
```ini
# In my.cnf or mariadb.conf.d/50-server.cnf
[mysqld]
performance_schema = ON
performance-schema-instrument = '%=ON'
performance-schema-consumer-events-statements-current = ON
performance-schema-consumer-events-statements-history = ON
```

**Restart your database server** after making configuration changes.

**Verify Performance Schema is enabled:**
```sql
SHOW VARIABLES LIKE 'performance_schema';
```

Should return: `performance_schema | ON`

#### User Permissions (Required)

The database user needs the following privileges for full functionality:

```sql
-- Process monitoring (required for process list)
GRANT PROCESS ON *.* TO 'mydba_user'@'%';

-- Database listing
GRANT SHOW DATABASES ON *.* TO 'mydba_user'@'%';

-- Metadata access (for schema information)
GRANT SELECT ON mysql.* TO 'mydba_user'@'%';

-- Performance Schema access (for monitoring and profiling)
-- UPDATE privilege is needed to configure instruments and consumers
GRANT SELECT, UPDATE ON performance_schema.* TO 'mydba_user'@'%';

-- Optional: Replication monitoring
GRANT REPLICATION CLIENT ON *.* TO 'mydba_user'@'%';

-- Database-specific access (adjust as needed)
GRANT SELECT, INSERT, UPDATE, DELETE ON your_database.* TO 'mydba_user'@'%';

-- Apply changes
FLUSH PRIVILEGES;
```

**Note**: MyDBA automatically configures Performance Schema instruments and consumers when you use profiling features. The `UPDATE` privilege on `performance_schema.*` is required for this auto-configuration.

**Quick Links**:
- 📖 [Database Setup Guide](docs/DATABASE_SETUP.md) - Detailed setup instructions
- ⚡ [Quick Reference](docs/QUICK_REFERENCE.md) - Quick setup checklist and commands
- 🧪 [Testing Guide](test/MARIADB_TESTING.md) - Docker setup for development

## 🛠️ Installation

### From Marketplace (Coming Soon)
```bash
# Install from VSCode marketplace
code --install-extension mydba.mydba
```

### From Source
```bash
# Clone repository
git clone https://github.com/your-org/mydba.git
cd mydba

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Package extension
npm run package

# Install locally
npm run install-extension
```

## 🚀 Quick Start

### Prerequisites

Before connecting, ensure:
- ✅ **Performance Schema is enabled** in your database (see [Database Setup Guide](docs/DATABASE_SETUP.md))
- ✅ **User has required permissions** (PROCESS, SELECT on performance_schema.*, etc.)
- ✅ **Database version is supported** (MySQL 8.0+ or MariaDB 10.6+)

Quick verification:
```sql
-- Check Performance Schema
SHOW VARIABLES LIKE 'performance_schema';  -- Must return 'ON'

-- Check your permissions
SHOW GRANTS FOR CURRENT_USER();
```

### Getting Started

1. **Connect to Database**
   - Open Command Palette (`Ctrl+Shift+P`)
   - Run `MyDBA: New Connection`
   - Enter connection details (host, port, username, password)
   - Choose environment (dev/staging/prod)

2. **Explore Database**
   - View databases and tables in the MyDBA sidebar
   - Click to expand and explore schema
   - Right-click for context actions

3. **View Metrics Dashboard**
   - Click "Metrics Dashboard" in the sidebar
   - Monitor real-time database performance
   - Track connections, queries, buffer pool, and threads

4. **Analyze Queries**
   - Select SQL query in editor
   - Run `MyDBA: Analyze Query` or use `@mydba /analyze`
   - View AI-powered insights and recommendations

5. **Visual EXPLAIN Plans**
   - Run `MyDBA: Explain Query`
   - See interactive tree diagram
   - Identify performance bottlenecks
   - Apply one-click fixes

6. **Profile Slow Queries**
   - Run `MyDBA: Profile Query`
   - View execution stages with waterfall chart
   - Identify time-consuming operations

## 🔧 Configuration

### AI Provider Setup

MyDBA supports multiple AI providers for maximum compatibility:

| Provider | Editors | Cost | Privacy | Setup Required |
|----------|---------|------|---------|----------------|
| **GitHub Copilot** (VSCode LM API) | VSCode only | Included with Copilot subscription | Data sent to GitHub | Automatic (no config) |
| **OpenAI** | All editors | Pay-per-use (~$0.0015/1K tokens) | Data sent to OpenAI | API key required |
| **Anthropic Claude** | All editors | Pay-per-use (~$0.003/1K tokens) | Data sent to Anthropic | API key required |
| **Ollama** | All editors | Free | 100% local, no data sent | Local installation |

#### Auto-Detection (Recommended)
Set `mydba.ai.provider` to `"auto"` (default) and MyDBA will automatically use the best available provider in this order:
1. VSCode Language Model (if available)
2. Configured API keys (OpenAI → Anthropic)
3. Ollama (if running locally)
4. Prompt to configure

#### VSCode with GitHub Copilot
No configuration needed! If you have GitHub Copilot, MyDBA will automatically use it.

#### OpenAI Setup
1. Get API key from [platform.openai.com](https://platform.openai.com/api-keys)
2. Open Command Palette (`Ctrl+Shift+P`)
3. Run `MyDBA: Configure AI Provider`
4. Select "OpenAI" and enter your API key
5. Choose model (default: gpt-4o-mini)

#### Anthropic Claude Setup
1. Get API key from [console.anthropic.com](https://console.anthropic.com/)
2. Open Command Palette (`Ctrl+Shift+P`)
3. Run `MyDBA: Configure AI Provider`
4. Select "Anthropic" and enter your API key
5. Choose model (default: claude-3-5-sonnet)

#### Ollama Setup (Local & Private)
1. Install Ollama from [ollama.ai](https://ollama.ai/)
2. Pull a model: `ollama pull llama3.1`
3. MyDBA will auto-detect Ollama running on `localhost:11434`
4. Configure custom endpoint in settings if needed

**Note for Cursor/Windsurf Users**: VSCode Language Model API is not available in VSCode forks. Use OpenAI, Anthropic, or Ollama instead.

### AI Settings
```json
{
  "mydba.ai.enabled": true,
  "mydba.ai.provider": "auto",
  "mydba.ai.anonymizeQueries": true,
  "mydba.ai.includeSchemaContext": true,
  "mydba.ai.openaiModel": "gpt-4o-mini",
  "mydba.ai.anthropicModel": "claude-3-5-sonnet-20241022",
  "mydba.ai.ollamaEndpoint": "http://localhost:11434",
  "mydba.ai.ollamaModel": "llama3.1"
}
```

### Security Settings
```json
{
  "mydba.confirmDestructiveOperations": true,
  "mydba.warnMissingWhereClause": true,
  "mydba.safeMode": true,
  "mydba.preview.maxRows": 1000,
  "mydba.dml.maxAffectRows": 1000
}
```

### Performance Settings
```json
{
  "mydba.refreshInterval": 5000,
  "mydba.slowQueryThreshold": 1000,
  "mydba.queryTimeout": 30000,
  "mydba.maxConnections": 10
}
```

## 💬 VSCode Chat Integration

Use `@mydba` in VSCode Chat for natural language database assistance:

```
@mydba /analyze SELECT * FROM users WHERE email = 'test@example.com'
@mydba /explain SELECT * FROM orders WHERE created_at > '2024-01-01'
@mydba /profile SELECT COUNT(*) FROM large_table
@mydba how do I optimize this slow query?
@mydba what indexes should I add to the users table?
```

## 🔒 Security & Privacy

### Data Privacy
- **Local Processing**: Schema metadata and query results stay local
- **AI Anonymization**: Queries templated (`<table:name>`, `<col:name>`, `?`) before sending to AI
- **Credential Security**: Stored in OS keychain (Keychain/Credential Manager)
- **No Data Collection**: Telemetry disabled by default

### Production Safeguards
- **Destructive Operations**: Confirmation required for DROP/TRUNCATE/DELETE/UPDATE
- **Missing WHERE Warnings**: Alerts for UPDATE/DELETE without WHERE clause
- **Row Limits**: Previews capped at 1,000 rows, DML operations blocked if > 1,000 rows
- **Environment Awareness**: Stricter rules for production connections

## 🏗️ Architecture

### Core Components
- **Service Container**: Dependency injection for testability
- **Database Adapters**: Pluggable architecture for multi-database support
- **AI Service Coordinator**: VSCode LM API integration with RAG
- **Webview Providers**: Interactive EXPLAIN and profiling viewers
- **Security Layer**: Credential management and safety validators

### Technology Stack
- **Core**: TypeScript, Node.js, VSCode Extension API
- **Database**: mysql2 (MySQL/MariaDB), pg (PostgreSQL), ioredis (Redis)
- **AI**: VSCode Language Model API, VSCode Chat API
- **UI**: Webview UI Toolkit, D3.js, Plotly.js, Chart.js
- **Security**: VSCode SecretStorage, SSL/TLS, SQL injection prevention

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run integration tests (requires Docker)
npm run test:integration

# Run linting
npm run lint

# Run all tests
npm run pretest
```

### Test Environment
```bash
# Start test databases
docker-compose -f docker-compose.test.yml up -d

# Run tests
npm run test:integration

# Cleanup
docker-compose -f docker-compose.test.yml down
```

## 📊 Performance

### Targets
- Extension activation: < 500ms
- Connection test: < 2s
- Tree view refresh: < 200ms
- EXPLAIN visualization: < 300ms
- AI analysis: < 3s

### Resource Limits
- Memory (idle): 50MB
- Memory (active): 200MB
- CPU (idle): 0%
- CPU (active): 5%
- Concurrent connections: 10

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup
```bash
# Clone and install
git clone https://github.com/your-org/mydba.git
cd mydba
npm install

# Start development
npm run watch

# In another terminal, open VSCode
code .
# Press F5 to launch Extension Development Host
```

### Code Style
- TypeScript with strict mode
- ESLint configuration
- Prettier formatting
- Comprehensive tests (unit + integration)

## 📄 License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.

## ⚠️ Disclaimer

**IMPORTANT**: This software is provided "as is" without warranty of any kind. Users are responsible for:

- Testing in non-production environments first
- Understanding the impact of suggested optimizations
- Backing up data before applying changes
- Monitoring database performance after changes

See [SECURITY.md](SECURITY.md) for security policies and supported versions.

## 🗺️ Roadmap

### Phase 1 (Weeks 1-20) - MVP
- [x] Project architecture and documentation
- [ ] Core extension framework
- [ ] MySQL/MariaDB adapter
- [ ] Basic tree view and database explorer
- [ ] AI integration with VSCode LM API
- [ ] Visual EXPLAIN plan viewer
- [ ] Query profiling with Performance Schema
- [ ] VSCode chat integration (@mydba)
- [ ] Security safeguards and production guardrails

### Phase 2 (Weeks 21-40) - Enhancements
- [ ] PostgreSQL adapter
- [ ] Redis/Valkey adapter
- [ ] Host-level metrics integration
- [ ] Advanced AI features (semantic RAG)
- [ ] Percona Toolkit inspired features
- [ ] Enhanced dashboards and visualizations

### Phase 3 (Weeks 41-60) - Multi-Database
- [ ] Unified metrics interface
- [ ] Cross-database query analysis
- [ ] Advanced profiling features
- [ ] Cloud-native deployment support

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/your-org/mydba/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/mydba/discussions)
- **Documentation**:
  - [Database Setup Guide](docs/DATABASE_SETUP.md)
  - [Quick Reference](docs/QUICK_REFERENCE.md)
  - [Testing Guide](test/MARIADB_TESTING.md)
  - [Product Roadmap](docs/PRODUCT_ROADMAP.md)

## 🙏 Acknowledgments

- Inspired by [vscode-kafka-client](https://github.com/jlandersen/vscode-kafka-client)
- Built with [VSCode Extension API](https://code.visualstudio.com/api)
- AI powered by [VSCode Language Model API](https://code.visualstudio.com/api/ai)

---

**Made with ❤️ for the database community**
