# MyDBA - AI-Powered Database Assistant

[![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://marketplace.visualstudio.com/items?itemName=mydba.mydba)
[![License](https://img.shields.io/badge/license-Apache%202.0-green.svg)](LICENSE)
[![VSCode](https://img.shields.io/badge/VSCode-1.85%2B-blue.svg)](https://code.visualstudio.com/)

MyDBA is an AI-powered VSCode extension that brings database management, monitoring, and optimization directly into your development environment. Built for developers and database administrators who want intelligent insights without leaving their IDE.

## 🚀 Features

### Phase 1 MVP (Current)
- **Multi-Database Support**: MySQL 8.0+, MariaDB 10.6+ (GA versions only)
- **AI-Powered Query Analysis**: Intelligent optimization suggestions with VSCode AI
- **Visual EXPLAIN Plans**: Interactive tree diagrams with pain point highlighting
- **Query Profiling**: Performance Schema integration with waterfall charts
- **Database Explorer**: Tree view with databases, tables, indexes, and processes
- **VSCode Chat Integration**: `@mydba` participant with slash commands
- **Security-First Design**: Credential isolation, production safeguards
- **Documentation-Grounded AI**: RAG system to reduce hallucinations

### Coming Soon (Phase 2)
- PostgreSQL, Redis, Valkey support
- Host-level metrics integration
- Advanced AI features with semantic search
- Percona Toolkit inspired features

## 📋 Requirements

- **VSCode**: 1.85.0 or higher
- **Node.js**: 18.x or higher
- **Databases**: MySQL 8.0+, MariaDB 10.6+ (GA versions only)

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

1. **Connect to Database**
   - Open Command Palette (`Ctrl+Shift+P`)
   - Run `MyDBA: New Connection`
   - Enter connection details (host, port, username, password)
   - Choose environment (dev/staging/prod)

2. **Explore Database**
   - View databases and tables in the MyDBA sidebar
   - Click to expand and explore schema
   - Right-click for context actions

3. **Analyze Queries**
   - Select SQL query in editor
   - Run `MyDBA: Analyze Query` or use `@mydba /analyze`
   - View AI-powered insights and recommendations

4. **Visual EXPLAIN Plans**
   - Run `MyDBA: Explain Query`
   - See interactive tree diagram
   - Identify performance bottlenecks
   - Apply one-click fixes

## 🔧 Configuration

### AI Settings
```json
{
  "mydba.ai.enabled": true,
  "mydba.ai.anonymizeData": true,
  "mydba.ai.chatEnabled": true,
  "mydba.ai.confirmBeforeSend": false
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
- **Documentation**: [Wiki](https://github.com/your-org/mydba/wiki)

## 🙏 Acknowledgments

- Inspired by [vscode-kafka-client](https://github.com/jlandersen/vscode-kafka-client)
- Built with [VSCode Extension API](https://code.visualstudio.com/api)
- AI powered by [VSCode Language Model API](https://code.visualstudio.com/api/ai)

---

**Made with ❤️ for the database community**
