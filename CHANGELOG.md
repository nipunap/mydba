# Changelog

All notable changes to the MyDBA extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-beta.1] - 2025-10-27

### 🎉 Phase 1 Complete - Beta Release

This beta release marks the completion of Phase 1 monitoring features with comprehensive AI-powered query optimization capabilities.

### Added

#### AI-Powered Features
- **Senior DBA AI Persona**: All AI providers now act as a Senior Database Administrator with 15+ years of experience
- **Enhanced Query Profiling**: Comprehensive performance analysis with execution time, efficiency metrics, and stage breakdowns
- **Smart Documentation Integration**: AI uses MySQL/MariaDB documentation internally for grounded recommendations
- **Database-Specific RAG**: Documentation filtering ensures only relevant docs (MySQL OR MariaDB, not both)
- **Performance Context**: AI receives detailed profiling data including rows examined, efficiency percentages, and bottleneck analysis

#### Monitoring Features
- **Slow Query Detection**: Automatic identification and sorting of slow queries by impact
- **Impact Score Calculation**: Weighted formula prioritizing queries based on total time, frequency, and efficiency
- **Query Profiling**: Deep dive into query execution with Performance Schema integration
- **EXPLAIN Analysis**: Visual execution plan viewer with AI-powered optimization suggestions
- **Queries Without Indexes**: Detection of queries missing proper indexing

#### Core Infrastructure
- **MySQL 8.0+ Support**: Full compatibility with MySQL 8.0 and above
- **MariaDB 10.6+ Support**: Complete support for MariaDB 10.6 and newer
- **Connection Pooling**: Efficient database connection management
- **Performance Schema Integration**: Advanced query profiling and monitoring
- **Multiple AI Providers**: Support for VSCode LM, OpenAI, Anthropic, and Ollama

### Changed
- **UI Simplification**: Removed citation/reference sections from UI while maintaining AI documentation usage
- **Query Normalization**: Improved Performance Schema query matching with aggressive normalization
- **EXPLAIN Viewer**: Streamlined interface removing expand/collapse/export buttons
- **Profiling Analysis**: AI now mandatory discusses performance metrics in summaries

### Fixed
- **Performance Schema Matching**: Resolved "Could not find statement" errors with improved query normalization
- **Connection Threading**: Fixed thread ID vs connection ID mismatch in profiling
- **Double EXPLAIN Prefix**: Eliminated duplicate EXPLAIN keywords in queries
- **MariaDB Documentation**: Ensured MariaDB connections only receive MariaDB-specific documentation

### Technical Improvements
- **Type System**: Enhanced SchemaContext with performance metrics and flexible table structures
- **Query Matching**: Aggressive normalization (remove spaces, quotes, backticks, lowercase)
- **Connection Handling**: Dedicated connection usage for profiling with proper cleanup
- **Logging**: Comprehensive debug logging for troubleshooting AI and profiling issues

### Testing
- ✅ 53 tests passing
- ✅ MySQL 8.0 integration tests
- ✅ MariaDB 10.11 integration tests
- ✅ AI service tests
- ✅ Query profiling tests
- ✅ Performance Schema tests

### Known Limitations
- PostgreSQL, Redis, and Valkey support planned for Phase 2
- Some Performance Schema queries may timeout on very fast queries
- AI provider configuration required for full AI features

### Upgrade Notes
- Extension now requires VSCode 1.85.0 or higher
- Performance Schema must be enabled for query profiling features
- AI features require configuration of at least one AI provider

### Dependencies
- vscode: ^1.85.0
- mysql2: ^3.11.0
- @anthropic-ai/sdk: ^0.32.1
- openai: ^4.73.1

---

## [0.1.0] - Initial Development

Initial development version with basic database connection capabilities.

