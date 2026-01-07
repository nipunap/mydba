# Changelog

All notable changes to the MyDBA extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.0] - 2026-01-07

### Added

- Phase 4 - Advanced Monitoring & Enterprise Features ([#13](https://github.com/nipunap/mydba/pull/13))

## [1.5.1] - 2025-12-22

### Fixed

- Improve connection test feedback and lock analysis error handling ([#12](https://github.com/nipunap/mydba/pull/12))

## [1.5.0] - 2025-11-09

### Added

- Complete Phase 2 (UI enhancements, QA polish, advanced AI) [phase-2] ([#11](https://github.com/nipunap/mydba/pull/11))

## [1.4.1] - 2025-11-09

### Fixed

- Queries Without Indexes: exclude system schemas (`performance_schema`, `information_schema`, `mysql`, `sys`) even when referenced with backticks or whitespace, preventing false positives from Performance Schema setup queries.

## [1.4.0] - 2025-11-08

### Added

- Phase 1.5 Critical Path - Production Blockers & Core Test Coverage ([#10](https://github.com/nipunap/mydba/pull/10))

## [1.3.0] - 2025-11-08

### Added

- Query Service implementation with comprehensive query analysis, templating, risk analysis, and validation
- 31 new comprehensive tests for Query Service (836 total tests passing)

### Changed

- Improved null safety in MySQL adapter by removing non-null assertions
- Enhanced type safety with proper pool connection handling
- Test coverage increased from 10.76% to 39% (Phase 1.5 Production Readiness complete)

### Fixed

- Type safety issues in database connection handling
- Removed 14 instances of non-null assertions (`pool!`) in mysql-adapter.ts

### Technical

- **Architecture Integration**: EventBus, CacheManager, PerformanceMonitor, and AuditLogger fully integrated
- **Code Quality**: Zero non-null assertions in production code
- **Test Coverage**: 39% overall coverage (9,400+ lines covered)
  - Critical services: 60%+ coverage (mysql-adapter, ai-coordinator, security)
  - 836 tests passing (11 skipped)
  - Zero test flakiness
- **CI/CD**: Coverage gate enforced at 39% minimum

## [1.2.0] - 2025-11-07

### Added

- Visual Query Analysis & Phase 1.5 Production Readiness ([#8](https://github.com/nipunap/mydba/pull/8))

## [1.1.0] - 2025-10-31

### Added

- Add manual trigger to publish-release workflow ([#7](https://github.com/nipunap/mydba/pull/7))

## [1.0.2] - 2025-10-31

### Fixed

- Improve workflow reliability - Remove dependency review from publish workflow ([#5](https://github.com/nipunap/mydba/pull/5))

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
