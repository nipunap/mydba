# MyDBA Phase 1 MVP - Quick Start Guide

## 🚀 Getting Started

### Prerequisites
- Node.js 18.x or higher
- npm 9.x or higher
- VSCode 1.85.0 or higher
- MySQL 8.0+ or MariaDB 10.6+ (for testing)

### Installation

1. **Clone and Install**
   ```bash
   git clone https://github.com/your-org/mydba.git
   cd mydba
   npm install
   ```

2. **Compile TypeScript**
   ```bash
   npm run compile
   ```

3. **Run Tests**
   ```bash
   # Unit tests
   npm test

   # Integration tests (requires Docker)
   docker-compose -f docker-compose.test.yml up -d
   npm run test:integration
   ```

4. **Package Extension**
   ```bash
   npm run package
   ```

5. **Install Locally**
   ```bash
   npm run install-extension
   ```

### Development

1. **Start Development Mode**
   ```bash
   npm run watch
   ```

2. **Open Extension Development Host**
   - Open VSCode in the project directory
   - Press `F5` to launch Extension Development Host
   - The extension will be loaded in the new VSCode window

3. **Test the Extension**
   - Open Command Palette (`Ctrl+Shift+P`)
   - Run `MyDBA: New Connection`
   - Enter connection details
   - Explore the database in the MyDBA sidebar

## 🏗️ Architecture Overview

### Core Components
- **Service Container**: Dependency injection for testability
- **Connection Manager**: Manages database connections and credentials
- **MySQL Adapter**: Database operations for MySQL/MariaDB
- **Tree View Provider**: Database explorer UI
- **Command Registry**: VSCode command handlers
- **Event Bus**: Pub-sub pattern for loose coupling

### Project Structure
```
src/
├── core/                 # Core framework
│   └── service-container.ts
├── services/            # Business logic services
│   ├── connection-manager.ts
│   ├── ai-service-coordinator.ts
│   ├── query-service.ts
│   └── metrics-collector.ts
├── adapters/            # Database adapters
│   ├── database-adapter.ts
│   ├── mysql-adapter.ts
│   └── adapter-registry.ts
├── providers/           # VSCode providers
│   └── tree-view-provider.ts
├── commands/            # Command handlers
│   └── command-registry.ts
├── utils/               # Utilities
│   └── logger.ts
└── test/                # Tests
    ├── adapters/
    ├── core/
    └── suite/
```

## 🔧 Configuration

### Extension Settings
```json
{
  "mydba.ai.enabled": true,
  "mydba.ai.anonymizeData": true,
  "mydba.confirmDestructiveOperations": true,
  "mydba.safeMode": true,
  "mydba.preview.maxRows": 1000,
  "mydba.refreshInterval": 5000
}
```

### Test Database Setup
```bash
# Start test databases
docker-compose -f docker-compose.test.yml up -d

# Verify containers are running
docker ps | grep mydba

# Stop test databases
docker-compose -f docker-compose.test.yml down
```

## 🧪 Testing

### Unit Tests
```bash
npm test
```

### Integration Tests
```bash
# Start test databases
docker-compose -f docker-compose.test.yml up -d

# Run integration tests
npm run test:integration

# Stop test databases
docker-compose -f docker-compose.test.yml down
```

### Extension Tests
```bash
# Run VSCode extension tests
npm run test
```

## 📊 Current Features (Phase 1 MVP)

### ✅ Implemented
- [x] Project structure and architecture
- [x] Service container with dependency injection
- [x] Connection manager with credential storage
- [x] MySQL/MariaDB adapter with version detection
- [x] Tree view provider for database explorer
- [x] Command registry for VSCode integration
- [x] Basic testing framework (unit + integration)
- [x] Configuration management
- [x] Event-driven architecture
- [x] Logging and error handling

### 🚧 In Progress
- [ ] AI service integration (VSCode LM API)
- [ ] RAG engine for documentation grounding
- [ ] Query analysis and optimization
- [ ] Visual EXPLAIN plan viewer
- [ ] Query profiling with Performance Schema
- [ ] VSCode chat integration (@mydba)
- [ ] Webview components (D3.js, Plotly.js)
- [ ] Security safeguards and production guardrails

### 📋 Next Steps
1. **Week 5-8**: Core UI implementation
   - Complete tree view with database operations
   - Basic webview panels for EXPLAIN and profiling
   - Connection dialog improvements

2. **Week 9-12**: Monitoring features
   - Process list viewer
   - Variables viewer
   - Basic metrics collection

3. **Week 13-16**: AI integration
   - VSCode LM API integration
   - RAG engine implementation
   - Query analysis and optimization

4. **Week 17-20**: Polish and testing
   - Comprehensive testing
   - Performance optimization
   - Documentation and examples

## 🐛 Troubleshooting

### Common Issues

1. **Extension won't activate**
   - Check VSCode version (1.85.0+)
   - Verify TypeScript compilation (`npm run compile`)
   - Check output panel for errors

2. **Database connection fails**
   - Verify MySQL/MariaDB is running
   - Check host, port, and credentials
   - Ensure database version is supported (MySQL 8.0+, MariaDB 10.6+)

3. **Tests fail**
   - Run `npm install` to ensure dependencies are installed
   - For integration tests, ensure Docker containers are running
   - Check test database setup

### Debug Mode
- Open VSCode Developer Tools (`Help > Toggle Developer Tools`)
- Check Console for errors
- Use `MyDBA` output channel for extension logs

## 📚 Resources

- [VSCode Extension API](https://code.visualstudio.com/api)
- [MySQL 8.0 Documentation](https://dev.mysql.com/doc/refman/8.0/en/)
- [MariaDB 10.11 Documentation](https://mariadb.com/kb/en/mariadb-1011-release-notes/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

---

**Status**: Phase 1 MVP Foundation Complete ✅
**Next Milestone**: Core UI Implementation (Weeks 5-8)
