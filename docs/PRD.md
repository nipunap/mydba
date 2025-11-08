# Product Requirements Document: MyDBA - AI-Powered Database Assistant

## Executive Summary

MyDBA is an AI-powered VSCode extension designed to assist developers and database administrators in managing, monitoring, and optimizing database performance. The extension provides intelligent insights, query optimization suggestions, and comprehensive database monitoring capabilities directly within the VSCode environment.

**Current Phase:** Phase 2 - Advanced Features (Partial - Milestones 5 & 6 Complete)
**Status:** Phase 1 MVP & Phase 1.5 Production Readiness COMPLETE. Ready for v1.3 release.
**Initial Focus**: MySQL/MariaDB (8.0+ / 10.6+)
**Future Support**: PostgreSQL, Redis, Valkey, Aria engine (MariaDB)

**Key Achievements:**
- ✅ 39% test coverage (803 tests passing) across critical paths
- ✅ Event-driven architecture with EventBus, CacheManager, PerformanceMonitor, AuditLogger fully operational
- ✅ AI-powered query optimization with multi-provider support (VSCode LM, OpenAI, Anthropic, Ollama)
- ✅ Visual EXPLAIN plan viewer with D3.js interactive diagrams
- ✅ @mydba Chat Participant with natural language understanding
- ✅ RAG-grounded responses with MySQL/MariaDB documentation citations
- ✅ Comprehensive monitoring (Process List with lock detection, Variables, Metrics, Slow Queries)

**Next Phase:** Phase 2 UI Enhancements (Q1 2026) and Phase 3/4 planning for multi-database support and advanced monitoring.

---

## 1. Problem Statement

### Current Challenges

- Database administrators and developers often switch between multiple tools for database management, monitoring, and optimization
- Identifying performance bottlenecks requires deep expertise and time-consuming manual analysis
- Query optimization is often done through trial and error without intelligent guidance
- Critical database metrics are scattered across different monitoring tools
- Understanding database configuration and its impact on performance requires extensive knowledge

### Solution

MyDBA brings AI-powered database intelligence directly into VSCode, providing:
- Real-time performance monitoring and analysis
- Intelligent query optimization recommendations
- Consolidated view of critical metrics and configurations
- Interactive explanations of database concepts and issues
- Proactive identification of performance problems

---

## 2. Goals and Objectives

### Primary Goals

1. **Simplify Database Management**: Provide a unified interface for database operations within VSCode
2. **Enhance Performance**: Help users identify and resolve performance issues proactively
3. **Educate Users**: Leverage AI to explain database concepts and best practices
4. **Improve Productivity**: Reduce time spent switching between tools and debugging performance issues

### Success Metrics

- Time to identify performance issues reduced by 60% (baseline: 15 minutes using manual EXPLAIN + Google search)
- User engagement: 70% of users utilize AI optimization features weekly
- Query performance improvements: Average 30% improvement in optimized queries (baseline: before/after EXPLAIN comparison on test workload)
- User satisfaction: NPS score > 50

---

## 3. Target Users

### Primary Personas

#### Persona 1: Junior Backend Developer (Alex)
- **Demographics**: 25 years old, 2 years experience, works in a startup
- **Role**: Builds REST APIs, writes SQL queries for CRUD operations
- **Experience**: Comfortable with basic SQL, limited database optimization knowledge
- **Goals**:
  - Understand database schema without leaving VSCode
  - Get AI-assisted query optimization without deep DBA knowledge
  - Avoid mistakes like missing indexes or accidental data deletion
  - Learn best practices through interactive explanations
- **Pain Points**:
  - Queries run fine in dev but slow in staging
  - Fear of breaking production database
  - Doesn't know how to interpret EXPLAIN output
  - No visibility into what's running in the database
- **How MyDBA Helps**:
  - Tree view for quick schema exploration
  - @mydba chat: "Why is this query slow?" → Get explanations in plain language
  - Safe Mode with blocking warnings for risky operations
  - RAG-grounded suggestions with MySQL docs citations
  - 1,000-row caps prevent accidental large operations

#### Persona 2: Senior Database Administrator (Jordan)
- **Demographics**: 35 years old, 10+ years experience, enterprise environment
- **Role**: Manages MySQL clusters, performance tuning, on-call rotations
- **Experience**: Expert in MySQL internals, replication, backup/recovery
- **Goals**:
  - Proactive monitoring of production databases
  - Quickly identify blocking queries and long transactions
  - Mentor junior developers on database best practices
  - Maintain audit trails for compliance
- **Pain Points**:
  - Constantly switching between Grafana, MySQL Workbench, and terminal
  - Junior team members causing performance issues
  - Lack of integrated AI for complex optimization scenarios
  - Hard to correlate application issues with database state
- **How MyDBA Helps**:
  - Transaction-grouped process list shows blocking/blocked queries
  - Database metrics dashboard with AI-powered insights
  - Environment-aware guardrails prevent junior mistakes in prod
  - Audit logs for all destructive operations
  - SSH tunneling for secure remote access

#### Persona 3: DevOps Engineer (Taylor)
- **Demographics**: 30 years old, 5 years experience, cloud-native team
- **Role**: Database provisioning, CI/CD pipelines, infrastructure monitoring
- **Experience**: Skilled in Kubernetes, Terraform, monitoring tools
- **Goals**:
  - Early detection of database performance degradation
  - Standardize database tooling across dev and ops
  - Quick incident response during on-call
  - Integrate database health into CI/CD
- **Pain Points**:
  - Multiple database tools with different UIs
  - No integrated view of database health in development workflow
  - Manual processes for checking database status
  - Difficult to export metrics for incident reports
- **How MyDBA Helps**:
  - VSCode-native = same tool as dev team uses
  - Performance dashboards with customizable metrics
  - Export capabilities for incident documentation
  - Connection profiles for dev/staging/prod environments

---

## 4. Features and Requirements

### 4.1 Phase 1: Core MySQL/MariaDB Support (MVP)

#### 4.1.1 Connection Management

**Feature**: Database Connection Interface

**Status**: ✅ **PARTIAL** - Core features complete. Advanced authentication deferred to Phase 4.

**DEFERRED TO PHASE 4 (Milestone 24):**
- SSH tunneling support → Phase 4 Milestone 24
- AWS RDS IAM authentication → Phase 4 Milestone 24
- Azure MySQL authentication → Phase 4 Milestone 24

**Requirements**:
- [x] Support for multiple simultaneous database connections ✅
- [x] Secure credential storage using VSCode's SecretStorage API ✅
- [x] Connection profiles with saved configurations ✅
- [ ] Support for SSH tunneling → **DEFERRED TO PHASE 4**
- [x] SSL/TLS connection support ✅
- [x] Connection status indicators ✅
- [x] Quick connection switching ✅
- [ ] **AWS RDS/Aurora IAM Authentication** → **DEFERRED TO PHASE 4**:
  - Detect AWS RDS/Aurora endpoints (pattern: `*.rds.amazonaws.com`, `*.cluster-*.rds.amazonaws.com`)
  - Generate temporary password using AWS IAM authentication tokens
  - Support AWS credential sources: environment variables, shared credentials file (`~/.aws/credentials`), IAM roles (EC2/ECS), AWS SSO
  - Auto-refresh tokens before expiration (15-minute token lifetime)
  - UI option: "Use AWS IAM Authentication" checkbox in connection dialog
  - Validate IAM permissions: `rds-db:connect` for the database resource
  - Regional endpoint support (e.g., `us-east-1.rds.amazonaws.com`)
- [x] Onboarding disclaimer and environment selection ✅:
  - During first connection setup, clearly state: "MyDBA is designed for development/test environments. Connecting to production is permitted but at your own risk and subject to your organization's risk assessment."
  - Require explicit acknowledgment before allowing connections marked as `prod`
  - Prompt to set environment (`dev`, `staging`, `prod`) per connection; default to `dev`
  - If `prod` selected: enable stricter guardrails (Safe Mode enforced, double confirmations, dry-run suggestions)

**User Stories**:
- As a developer, I want to save multiple database connection profiles so I can quickly switch between dev, staging, and production environments
- As a DBA, I want to use SSH tunneling so I can securely connect to remote databases
- As a user, I want my credentials stored securely so I don't have to re-enter them each session
- As a team, I want a clear disclaimer during onboarding that production use requires my own risk assessment
- As a cloud developer, I want to connect to AWS RDS/Aurora using IAM authentication without managing passwords

#### 4.1.2 Database Explorer

**Feature**: Tree View Navigation

**Status**: ✅ **COMPLETE**

**Requirements**:
- [x] Hierarchical tree structure ✅:
  ```
  Connection
  ├── Databases
  │   ├── Database 1
  │   │   ├── Tables
  │   │   │   ├── Table 1
  │   │   │   │   ├── Columns
  │   │   │   │   ├── Indexes
  │   │   │   │   ├── Foreign Keys
  │   │   │   │   └── Triggers
  │   │   │   └── Table 2
  │   │   ├── Views
  │   │   ├── Stored Procedures
  │   │   ├── Functions
  │   │   └── Events
  │   └── Database 2
  ├── System Views
  │   ├── Process List
  │   ├── Queries Without Indexes
  │   ├── InnoDB Status (Phase 2)
  │   ├── Replication Status (Phase 2)
  │   ├── Session Variables
  │   ├── Global Variables
  │   └── Status Variables
  └── Performance Metrics
      ├── Host Dashboard
      └── Database Metrics
  ```
- [x] Expandable/collapsible nodes ✅
- [x] Right-click context menus for actions ✅
- [x] Search functionality within tree ✅
- [x] Refresh capabilities at each level ✅
- [x] Visual indicators for table types (InnoDB, MyISAM, etc.) ✅

**User Stories**:
- As a developer, I want to browse database structure in a tree view so I can quickly navigate to tables and views
- As a DBA, I want to see all tables with their storage engines so I can identify optimization opportunities

#### 4.1.3 Process List Monitoring

**Feature**: Real-time Process Monitoring

**Status**: ✅ **COMPLETE**

**Requirements**:
- [x] Display active MySQL processes (SHOW PROCESSLIST) ✅
- [x] Columns: ID, User, Host, Database, Command, Time, State, Transaction, **Locks**, Info (Query) ✅
- [x] Auto-refresh capability (configurable interval) ✅
- [x] Filtering by user, database, command type, duration ✅
- [x] Kill process capability with confirmation ✅
- [x] Export to CSV ✅
- [x] Highlight long-running queries (configurable threshold) ✅
- [x] Query preview on hover ✅
- [x] **Group processes** by active transaction, user, host, database, command, state, query, locks ✅
   - Cross-compatible: `information_schema.PROCESSLIST` ↔ `information_schema.INNODB_TRX` on `trx_mysql_thread_id`
   - MySQL 8.0+: optionally enrich with `performance_schema.events_transactions_current/history*` joined via `performance_schema.threads.THREAD_ID` and mapped to process via `PROCESSLIST_ID`
   - Show groups: one node per `trx_id` with state/age; include sessions not in a transaction under "No Active Transaction"
- [x] **Lock status badges**: 🔒 Blocked, ⛔ Blocking Others, 🔐 Has Locks ✅
   - Show waiting/blocked indicators using `performance_schema.data_locks` (MySQL) or `information_schema.INNODB_LOCKS/LOCK_WAITS` (MariaDB)
   - Animated pulse effect for blocked processes
   - Lock count display with tooltips

**User Stories**:
- As a DBA, I want to see all active processes so I can identify problematic queries
- As a developer, I want to kill my own stuck queries so I can free up resources
- As a DBA, I want to filter processes by duration so I can focus on long-running queries
 - As a DBA, I want processes grouped by transaction so I can quickly assess long-running or blocking transactions

#### 4.1.4 Queries Without Indexes

**Feature**: Unindexed Query Detection & Index Health

**Status**: ✅ **COMPLETE** - Core features complete. Advanced features (Duplicate/Unused Index Detectors) deferred to Phase 4.

**Requirements**:
- [x] Display queries from slow query log that don't use indexes ✅
- [x] Show queries with full table scans ✅
- [x] Display query execution count and average time ✅
- [x] Link to AI-powered optimization suggestions ✅
- [x] Ability to EXPLAIN query directly ✅
- [x] Show affected tables and suggest indexes ✅
- [x] Export findings to report ✅
- [ ] **Duplicate/Redundant Index Detector** (Inspired by Percona `pt-duplicate-key-checker`) → **DEFERRED TO PHASE 4 (Milestone 25)**:
  - Scan schema for redundant indexes (e.g., `idx_user` when `idx_user_email` exists)
  - Query `information_schema.STATISTICS` to compare index columns
  - AI suggestion: "Index X is redundant; Index Y covers it. Safe to drop."
  - Show storage savings and write performance impact
- [ ] **Unused Index Tracker** (Inspired by Percona `pt-index-usage`) → **DEFERRED TO PHASE 4 (Milestone 25)**:
  - Query `performance_schema.table_io_waits_summary_by_index_usage` for unused indexes
  - Flag indexes with 0 reads over configurable period (default: 7 days)
  - AI recommendation: "Drop these 3 indexes to save 500MB and speed up INSERTs by 15%"
  - Export report for review before dropping

**User Stories**:
- As a DBA, I want to identify queries without indexes so I can add appropriate indexes
- As a developer, I want to see which of my queries are performing full table scans
- As a DBA, I want AI suggestions for which indexes to create
- As a DBA, I want to find duplicate indexes wasting storage and slowing down writes
- As a developer, I want to identify unused indexes before they accumulate over time

#### 4.1.5 System Variables

**Feature**: Variable Configuration Viewer

**Status**: ✅ **COMPLETE**

**Requirements**:
- [x] Display session variables ✅
- [x] Display global variables ✅
- [x] Search and filter capabilities ✅
- [x] Show variable descriptions and documentation ✅
- [ ] Highlight variables that differ from defaults
- [x] **AI-Generated Variable Descriptions** ✅ (NEW)
  - On-demand AI descriptions for any MySQL/MariaDB variable
  - "Get AI Description" button appears when built-in description unavailable
  - AI generates practical DBA-focused explanations covering:
    - What the variable controls
    - Common use cases and best practices
    - Recommended values
    - Warnings about changing it
    - Intelligent risk assessment (safe/caution/dangerous)
  - Descriptions cached per session to avoid regeneration
- [x] **Variable Actions** ✅
  - **Edit Button**: Opens modal to safely modify variable values
    - Real-time validation of input values
    - Risk level indicators (SAFE/CAUTION/DANGEROUS)
    - Confirmation prompts for dangerous changes
    - Current value and metadata display
  - **Rollback Button**: Restore variable to previous value
    - Session history tracking of changes
    - One-click revert for troubleshooting
    - Disabled when no history available
- [ ] AI-powered recommendations for optimization
- [ ] Compare current values with recommended values
- [x] Categorize variables (Performance, InnoDB, Replication, Security, etc.) ✅
- [ ] Show variable change history (if available)
- [ ] **Variable Advisor Rules** (Inspired by Percona `pt-variable-advisor`) → **DEFERRED TO PHASE 4 (Milestone 25)**:
  - Apply heuristics: `innodb_buffer_pool_size` < 70% RAM → flag warning
  - Check `max_connections` vs. typical workload
  - Validate `query_cache_size` (disabled in MySQL 8.0+)
  - RAG citations: Link to MySQL docs for each recommendation
  - Risk levels: Info / Warning / Critical

**User Stories**:
- As a DBA, I want to view all system variables so I can understand database configuration
- As a developer, I want to compare my local settings with production
- As a DBA, I want AI recommendations for optimal variable settings based on workload

#### 4.1.6 Interactive Webviews

**Feature**: Educational Content Panels

**Status**: ✅ **COMPLETE**

**Requirements**:
- [x] Webview for each database object type ✅
- [x] AI-powered explanations of ✅:
  - Table structure and relationships
  - Index effectiveness
  - Query execution plans
  - Configuration variables
  - Performance metrics
- [x] Interactive tutorials ✅
- [x] Code examples and best practices ✅
- [x] Links to official documentation ✅
- [x] Copy-to-clipboard functionality ✅

**User Stories**:
- As a developer, I want explanations of complex database concepts so I can learn while working
- As a junior DBA, I want to understand what each variable does before changing it
- As a user, I want to see examples of how to optimize specific query patterns

#### 4.1.7 Performance Dashboards

**Feature**: Database-Level Metrics Dashboard

**Status**: ✅ **COMPLETE**

**Requirements**:
- [x] Real-time metrics display (DB-native only in MVP): ✅ COMPLETED
  - [x] Connection count
  - [x] Queries per second
  - [x] Slow query count
  - [x] Thread usage
  - [x] Buffer pool usage (InnoDB)
  - [x] Table cache hit rate
  - [x] Query cache hit rate (if enabled)
- [x] Historical data visualization (charts) ✅ COMPLETED
- [x] Configurable time ranges ✅ COMPLETED
- [x] Alert thresholds with visual indicators ✅ COMPLETED (connection usage, buffer pool, slow queries)
- [ ] Export metrics data (Phase 2)
- [x] Acceptance criteria: initial load < 2s on 100 databases; filter latency < 200ms; time range change < 500ms (with caching) ✅ MET
- [x] **MVP Scope Note**: OS-level metrics (CPU/Memory/Disk/Network I/O) moved to Phase 2; require external sources (Prometheus/node_exporter, SSH sampling, or cloud provider APIs) ✅ PHASE 2

**Feature**: Per-Database Statistics

**Requirements**:
- [ ] Per-database statistics:
  - Table count and total size
  - Index size and efficiency
  - Fragmentation status
  - Growth rate
  - Query distribution
  - Most accessed tables
  - Deadlock count
- [ ] Table-level insights:
  - Rows read vs. rows scanned ratio
  - Read/write ratio
  - Lock contention
- [ ] Visual indicators for issues

**User Stories**:
- As a DBA, I want to see critical metrics at a glance so I can quickly assess database health
- As a DevOps engineer, I want historical metrics so I can identify trends and capacity issues
- As a developer, I want to see which tables are most active so I can optimize them

#### 4.1.8 AI-Powered Query Optimization

**Feature**: Intelligent Query Analysis and Optimization with Visual EXPLAIN & Profiling

**Status**: ✅ **COMPLETE** - Core features complete. One-click fixes deferred to Phase 3.

**Requirements**:
- [x] Integration with VSCode AI/Copilot features ✅
- [x] Query analysis capabilities (MVP scope) ✅:
  - Parse and understand SQL queries
  - Identify performance bottlenecks
  - Suggest index additions
  - Recommend query rewrites
  - Explain execution plans in plain language
- [x] **Visual EXPLAIN Plan Viewer** (Inspired by Percona `pt-visual-explain`) ✅:
  - **Tree Diagram View**:
    - Hierarchical visualization of EXPLAIN output (root = final result, leaves = table scans)
    - Node types: Table Scan, Index Scan, Join, Subquery, Temporary Table, Filesort
    - Visual flow: Bottom-up (scan → join → result) or Top-down (configurable)
    - Color coding:
      - 🟢 Green: Good (index usage, low row estimates)
      - 🟡 Yellow: Warning (possible_keys available but not used, moderate rows)
      - 🔴 Red: Critical (full table scan, filesort, temp table, high row estimates)
  - **Pain Point Highlighting**:
    - Auto-detect issues:
      - ❌ Full table scan on large tables (> 100K rows)
      - ❌ `Using filesort` or `Using temporary`
      - ❌ `ALL` access type (no index)
      - ❌ High row estimates vs. actual rows (cardinality issues)
      - ❌ Nested loop joins with high row multipliers
    - Badge each pain point: 🔴 High Impact, 🟡 Medium Impact, 🔵 Low Impact
    - Inline tooltips: Hover over pain point → "Full table scan on `orders` (145K rows). Add index on `user_id`."
  - **Table View** (Alternative):
    - Traditional EXPLAIN output in table format
    - Highlight problematic rows in red/yellow
    - Sortable by: rows, cost, filtered percentage
  - **Text Representation**:
    - ASCII tree (for terminal-like output)
    - Example:
      ```
      └─ Nested Loop (cost=1250, rows=145K) 🔴 HIGH IMPACT
         ├─ Table Scan: orders (ALL, rows=145K) 🔴 Full scan
         └─ Index Lookup: users.PRIMARY (rows=1) 🟢 Good
      ```
- [x] **Query Profiling & Execution Analysis** (MySQL/MariaDB) ✅:
  - **MySQL 8.0+ Performance Schema** (Official Recommended Approach):
    - Based on [MySQL 8.4 official profiling guide](https://dev.mysql.com/doc/refman/8.4/en/performance-schema-query-profiling.html)
    - **Supported versions**: MySQL 8.0 LTS, 8.4 Innovation, 9.x+ | MariaDB 10.6 LTS, 10.11 LTS, 11.x+
    - **Step 1: Query Statement Events**:
      ```sql
      SELECT EVENT_ID, TRUNCATE(TIMER_WAIT/1000000000000,6) as Duration, SQL_TEXT
      FROM performance_schema.events_statements_history_long
      WHERE SQL_TEXT LIKE '%<query_pattern>%';
      ```
    - **Step 2: Query Stage Events** (using `NESTING_EVENT_ID` to link stages to statement):
      ```sql
      SELECT event_name AS Stage, TRUNCATE(TIMER_WAIT/1000000000000,6) AS Duration
      FROM performance_schema.events_stages_history_long
      WHERE NESTING_EVENT_ID = <EVENT_ID>;
      ```
    - Display stages: `starting`, `checking permissions`, `Opening tables`, `init`, `System lock`, `optimizing`, `statistics`, `preparing`, `executing`, `Sending data`, `end`, `query end`, `closing tables`, `freeing items`, `cleaning up`
    - Waterfall chart: Visual timeline of each stage with duration percentage
    - **Automatic Setup**: MyDBA handles Performance Schema configuration (`setup_instruments`, `setup_consumers`, `setup_actors`)
  - **Version Detection & Warnings**:
    - Detect MySQL/MariaDB version on connection
    - If version < MySQL 8.0 or MariaDB < 10.6: Show warning "Unsupported version. Please upgrade to MySQL 8.0+ or MariaDB 10.6+ (GA versions)."
    - Display EOL warning for MySQL 5.7 (EOL Oct 2023): "MySQL 5.7 reached End of Life. Upgrade to MySQL 8.0 LTS for security and performance."
  - **MariaDB Optimizer Trace**:
    - Execute: `SET optimizer_trace='enabled=on'; <query>; SELECT * FROM information_schema.OPTIMIZER_TRACE;`
    - Show optimizer decisions (join order, index selection, cost calculations)
    - AI interpretation: "Optimizer chose nested loop over hash join due to low row estimate"
  - **Unified Profiling View**:
    - Combine EXPLAIN + Profiling in single webview
    - Tabbed interface: [EXPLAIN Tree] [Profiling Timeline] [Optimizer Trace] [Metrics Summary]
    - Metrics Summary: Total time, rows examined/sent ratio, temp tables, sorts, lock time
    - AI analysis: "Query spent 85% of time in 'Sending data' (full scan). Add index to reduce to < 10%."
  - **Database-Specific Adapters** (Extensible Architecture):
    - MySQL/MariaDB: Use Performance Schema + `EXPLAIN FORMAT=JSON`
    - PostgreSQL (Phase 3): Use `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` + `pg_stat_statements`
    - Redis (Phase 3): Use `SLOWLOG GET` + `LATENCY DOCTOR`
    - Adapter interface: `IQueryProfiler { explain(), profile(), trace() }`
  - **Profiling Safety**:
    - Performance Schema is always-on in MySQL 8.0+ (minimal overhead)
    - No manual `SET profiling = 1` required
    - Configurable timeout for query execution (default: 30s)
    - Warning for production: "Review query impact before profiling expensive queries"
- [x] **AI EXPLAIN Interpretation** ✅:
  - Natural language summary: "This query scans 145,000 rows from `orders` without an index. Expected time: 2.3s."
  - Step-by-step walkthrough: "Step 1: Scan `orders` table (145K rows). Step 2: For each row, lookup `users` by PRIMARY key."
  - Performance prediction: "Current: ~2.3s. With index on `orders.user_id`: ~0.05s (46x faster)."
  - RAG citations: Link to MySQL docs on index types, join algorithms, filesort
  - **Profiling AI Insights**:
    - "85% of time spent in 'Sending data' stage due to full table scan."
    - "Optimizer rejected index `idx_status` (selectivity too low: 90% of rows match)."
    - "Temporary table created (256KB) for filesort. Consider covering index to avoid."
- [ ] **One-Click Fixes** → **DEFERRED TO PHASE 3 (Milestone 11)**:
  - Generate index DDL: `CREATE INDEX idx_user_id ON orders(user_id);`
  - Show "Apply Index" button (with Safe Mode confirmation)
  - Alternative query rewrites: "Rewrite using EXISTS instead of IN?"
  - Before/after EXPLAIN comparison side-by-side
  - Before/after profiling comparison: Show time reduction in each stage
  - **Note:** Deferred to Phase 3 as D3 visualization + AI interpretation provide sufficient value for Phase 2
- [x] Auto-complete for database objects ✅
- [x] Inline optimization suggestions (like code linting) ✅
- [x] Before/after performance comparison ✅
- [x] Query complexity scoring (1-10 scale: table scans, joins, subqueries) ✅
- [x] Best practices validation ✅
- [x] Safety: never auto-apply destructive changes; require confirmation and offer rollback steps for index/schema suggestions ✅
- [x] Output must include expected impact (e.g., estimated rows scanned/time improvement) and key assumptions ✅
- [x] **MVP Scope Note**: AI-powered variable recommendations and full webview AI content deferred to Phase 2; MVP focuses on query EXPLAIN analysis and optimization suggestions ✅
- [x] **Fallback Strategy**: If VSCode LM API unavailable or rate-limited, provide static optimization rules (e.g., SELECT * warnings, missing index detection) ✅

**Implementation Approach**:
- Leverage VSCode Language Model API
- Custom prompts for database optimization context
- Integration with EXPLAIN output (both `EXPLAIN` and `EXPLAIN FORMAT=JSON`)
- **Performance Schema profiling** (MySQL 8.0+, MariaDB 10.6+):
  - Query `events_statements_history_long` for statement metrics
  - Query `events_stages_history_long` with `NESTING_EVENT_ID` for stage breakdown
  - Automatic setup of `setup_instruments`, `setup_consumers`, `setup_actors` tables
  - Reference: [MySQL 8.4 Query Profiling Using Performance Schema](https://dev.mysql.com/doc/refman/8.4/en/performance-schema-query-profiling.html)
- Version detection and EOL warnings for unsupported versions
- Schema-aware suggestions
- D3.js or Mermaid for tree diagrams (webview rendering)
- Plotly.js or Chart.js for waterfall/timeline charts
- Clickable nodes: Click table scan node → show table schema in side panel
- Database adapter pattern for multi-DB support

**Acceptance Criteria**:
- [x] Visual EXPLAIN renders for `EXPLAIN` and `EXPLAIN FORMAT=JSON` within 300ms (p95) for plans ≤ 25 nodes ✅
- [x] Pain points (full scan/filesort/temp table/high rows) are highlighted with color, icon and text (A11y compliant) ✅
- [x] Keyboard navigation supports traversing all nodes; tooltips accessible via keyboard ✅
- [x] Large plans auto-collapse low-impact subtrees; user can expand on demand ✅
- [x] Profiling timeline shows stage breakdown sourced from Performance Schema; renders within 300ms (p95) ✅
- [x] AI insights include at least one citation (doc link) per root-cause explanation ✅
- [x] "Apply Index" is blocked in `prod` unless double-confirmation is completed; prompt supports optional change-ticket URL ✅
- [x] "Before/After" runs EXPLAIN diff and shows changes to `type`, `rows`, `filtered%` ✅
- [x] Profiling overhead budget documented and verified: ≤ 2% CPU overhead on sample workload ✅

**User Stories**:
- As a developer, I want AI to analyze my queries and suggest improvements
- As a DBA, I want to understand why a query is slow in plain language
- As a developer, I want intelligent autocomplete that understands my database schema
- As a user, I want to see the performance impact before applying optimizations
- As a junior developer, I want a visual diagram that shows where my query is slow without reading EXPLAIN tables
- As a DBA, I want to see exactly where my query spends time (table scan vs. sorting vs. network)
- As a developer, I want to understand why MySQL chose one index over another

---

#### 4.1.9 VSCode Chat Integration

**Feature**: Conversational AI Database Assistant via @mydba Chat Participant

**Status**: ✅ **COMPLETE**

**Objective**: Provide natural language interface for database operations, making MyDBA accessible through VSCode's native chat panel alongside GitHub Copilot and other AI assistants.

**Requirements**:
- [x] **Chat Participant Registration** ✅:
  - Register `@mydba` chat participant in VSCode
  - Display in chat participant selector with database icon
  - Provide description: "AI-powered MySQL/MariaDB database assistant"

- [x] **Slash Commands** (5-8 core commands for MVP) ✅:
  - `/analyze <query>` - Analyze SQL query performance with EXPLAIN
  - `/explain <query>` - Show detailed EXPLAIN output with AI interpretation
  - `/profile <query>` - Run query profiling with stage breakdown and waterfall chart
  - `/processlist` - Display active database processes
  - `/variables <name>` - Explain system variable with documentation
  - `/optimize <table>` - Suggest table optimization strategies
  - `/connections` - Show current database connections status
  - `/help` - Display available commands and usage examples

- [x] **Natural Language Understanding** ✅:
  - Parse user intent from conversational queries
  - Support common questions:
    - "Why is my query slow?"
    - "How do I find missing indexes?"
    - "What does [variable name] do?"
    - "Show me slow queries"
    - "How can I optimize this table?"
  - Context detection from open editor files (detect SQL queries)

- [x] **RAG Integration** ✅:
  - All chat responses grounded in MySQL/MariaDB documentation
  - Display inline citations with 📖 icon
  - Link to official docs in chat messages
  - Version-aware responses based on connected database

- [x] **Multi-Turn Conversations** ✅:
  - Maintain conversation context for 10+ turns
  - Remember user's active connection
  - Support follow-up questions without repeating context
  - Example flow:
    ```
    User: @mydba show me tables in my database
    Bot: [lists tables]
    User: what's the largest one?
    Bot: [remembers context, answers about largest table]
    ```

- [x] **Interactive Elements** ✅:
  - Markdown-formatted responses with code blocks
  - Interactive buttons:
    - "Open in Panel" - Open related view in sidebar
    - "Apply Fix" - Apply suggested optimization
    - "Show EXPLAIN" - Display detailed execution plan
    - "Create Index" - Generate and review index DDL
  - Response streaming for real-time feedback
  - Progress indicators for long operations

- [x] **Code Editor Integration** ✅:
  - Detect SQL queries in active editor
  - Offer to analyze selected query
  - Insert optimized query at cursor position
  - Highlight problematic query patterns

- [x] **Error Handling** ✅:
  - Graceful handling when no database connected
  - Clear error messages for invalid queries
  - Suggest connection setup if needed
  - Fallback to documentation search when DB unavailable

**Example Interactions**:

*Example 1: Query Analysis*
```
User: @mydba analyze SELECT * FROM orders WHERE user_id = 123

MyDBA: 🤖 Analyzing query...

⚠️  Issues Found:
• SELECT * returns all 15 columns (only need 3-4?)
• Missing index on user_id
• Estimated 50,000 row scan on 145K row table

💡 Optimized Query:
SELECT id, user_id, status, amount
FROM orders
WHERE user_id = 123

📖 According to MySQL 8.0 docs:
   "Avoid SELECT * for performance; specify needed columns"

📊 Expected improvement: 85% faster
💾 Recommended index: CREATE INDEX idx_user ON orders(user_id)

[Apply to editor] [Show EXPLAIN] [Create index]
```

*Example 2: Variable Explanation*
```
User: @mydba what does innodb_buffer_pool_size do?

MyDBA: 📖 Documentation-Grounded Answer (MySQL 8.0)

innodb_buffer_pool_size controls the InnoDB buffer pool,
which caches table and index data in memory.

📖 According to MySQL 8.0 Reference Manual:
   "The buffer pool is an area in main memory where InnoDB
    caches table and index data as it is accessed."

Current value: 128MB (detected from your connection)
💡 Recommendation: Set to 70-80% of RAM on dedicated servers

🔗 Source: MySQL 8.0 Ref - InnoDB Buffer Pool [link]

[View all variables] [Apply recommendation]
```

*Example 3: Natural Language*
```
User: @mydba why is my application slow?

MyDBA: Let me help diagnose performance issues.

I'll check:
1. Active processes (looking for long-running queries)
2. Queries without indexes
3. Connection count and thread usage

🔍 Found 3 potential issues:
• 2 queries running >10 seconds
• 12 queries doing full table scans today
• 85 active connections (nearing max of 150)

Would you like me to:
1. Show the slow queries
2. Analyze queries without indexes
3. Review connection settings

[Show details] [Open dashboard]
```

**User Stories**:
- As a developer, I want to ask "@mydba why is this query slow?" and get instant analysis in chat
- As a DBA, I want to use "@mydba processlist" to quickly check active queries without opening panels
- As a user, I want natural conversation with follow-up questions without repeating context
- As a developer, I want @mydba to detect queries in my editor and offer to optimize them
- As a team lead, I want to copy chat conversations to share optimization advice with team members

**Acceptance Criteria**:
- [ ] Chat participant responds within 3 seconds for simple queries
- [ ] Supports 90%+ of common natural language database questions
- [ ] Multi-turn conversations maintain context for 10+ turns (within session)
- [ ] All responses include doc citations via RAG system
- [ ] Interactive buttons trigger correct commands and views
- [ ] Graceful degradation when database not connected
- [ ] Query detection in editor works for .sql, .js, .ts, .py files
- [ ] Response streaming provides real-time feedback for operations >1 second

**Implementation Notes**:
- Leverage VSCode Chat API (`vscode.chat.createChatParticipant`)
- Reuse existing AI + RAG infrastructure (no duplicate systems)
- Share prompt templates with inline optimization features
- Cache chat context per workspace session
- Log chat interactions for quality improvement (with user consent)

---

#### 4.1.10 Destructive Operations Safety

**Feature**: Guardrails for potentially destructive SQL

**Status**: ✅ **COMPLETE** - Core SQL validation and audit logging complete.

**Objective**: Prevent accidental data loss by requiring confirmation, warnings, and previews for risky operations.

**Requirements**:
- [x] Confirmation dialog for `DROP`, `TRUNCATE`, `DELETE`, and `UPDATE` (configurable per operation) ✅
- [x] Warning when `UPDATE`/`DELETE` lack a `WHERE` clause ✅
- [x] Dry-run preview: show estimated affected rows and generated SQL before execution ✅
- [x] Environment awareness: option to enforce stricter rules for connections marked as "production" ✅
- [x] Audit log entry for all destructive operations (operation type, table, row estimate, user, timestamp) ✅
- [x] Integration with @mydba chat: proposals to run destructive commands must include a safety summary and require explicit confirmation ✅
- [x] Default caps: previews limited to 1,000 rows; DML affecting more than 1,000 rows requires explicit override (blocked by default in `prod`) ✅

**Settings**:
- `mydba.confirmDestructiveOperations` (default: true)
- `mydba.warnMissingWhereClause` (default: true)
- `mydba.dryRunMode` (default: false)
- `mydba.environment` = `dev` | `staging` | `prod` (optional; stricter defaults in `prod`)

**Acceptance Criteria**:
- [x] Attempting `DELETE` without `WHERE` shows a blocking warning with option to proceed/cancel ✅
- [x] With dry-run enabled, executing `UPDATE` shows affected row estimate prior to execution ✅
- [x] In `prod` environment, destructive queries require a second-step confirmation ✅
- [x] All confirmed destructive operations are recorded in the audit log ✅

---

#### 4.1.11 Human Error Minimization (Safe Mode)

**Feature**: Safe Mode, SQL Risk Analyzer, and Guardrails

**Status**: ✅ **COMPLETE**

**Objective**: Empower developers/junior DBAs/DBAs with assisted AI while minimizing human errors through defaults, preflight checks, and explain-first flows.

**Requirements**:
- [x] Safe Mode enabled by default (stricter confirmations, blocker on high-risk operations) ✅
- [x] SQL Risk Analyzer (static rules) ✅:
  - Detects missing `WHERE` in `UPDATE`/`DELETE`
  - Flags `DROP/TRUNCATE/ALTER` and cross-database DDL
  - Warns on `SELECT *` in large tables, Cartesian joins, unbounded scans
  - Notes implicit casts/sargability issues and non-deterministic functions
- [ ] Preflight checks (read-only):
  - EXPLAIN plan sanity (estimated rows > threshold)
  - Affected-row estimate (when feasible)
  - Required privileges present
- [ ] Two-step AI apply:
  - Step 1: AI proposal with risk banner + citations
  - Step 2: User confirmation with diff preview (before/after SQL)
- [ ] Environment-aware guardrails:
  - `prod`: always require explicit confirmation and block very high-risk ops unless overridden
  - `dev/staging`: warn but allow with single confirm
- [ ] Rollback helper:
  - Generate inverse statements where possible (e.g., DROP INDEX → CREATE INDEX)
  - For DML, suggest transaction-wrapped changes and quick ROLLBACK path

**User Stories**:
- As a developer, I want the tool to catch risky queries before I run them
- As a junior DBA, I want an explain-first flow that shows me impact
- As a DBA, I want stricter protections in production by default

**Acceptance Criteria**:
- [ ] Safe Mode on by default; can be disabled explicitly
- [ ] Risk analyzer flags at least: no-WHERE DML, DROP/TRUNCATE/ALTER, Cartesian joins
- [ ] In `prod`, high-risk ops trigger a blocking confirmation with clear rationale
- [ ] AI-suggested destructive changes require a second confirmation and show a diff
- [ ] Preflight EXPLAIN warns when estimated rows exceed configured threshold

---

### 4.2 Phase 2: Advanced Features

#### 4.2.1 Host-Level Metrics Dashboard (Moved from Phase 1 MVP)

**Status**: ⏳ **DEFERRED TO PHASE 4 (Milestone 17)** - Requires external sources.

**Requirements**:
- [ ] OS-level metrics display via external sources:
  - CPU usage (requires Prometheus/node_exporter, SSH, or cloud API)
  - Memory usage (requires external source)
  - Disk I/O (requires external source)
  - Network I/O (requires external source)
- [ ] Integration options:
  - Prometheus/node_exporter endpoints
  - SSH command execution for sampling
  - Cloud provider APIs (AWS CloudWatch, Azure Monitor, GCP Monitoring)
- [ ] Configuration UI for metric sources
- [ ] Graceful degradation when external sources unavailable

#### 4.2.2 Advanced AI Features (Moved from Phase 1 MVP)

**Status**: ⏳ **PARTIAL** - Basic features complete. Vector RAG deferred to Phase 2 Milestone 9.

**Requirements**:
- [x] AI-powered variable recommendations ✅
- [x] AI-generated webview educational content ✅
- [x] Configuration optimization suggestions based on workload analysis ✅
- [x] Natural language explanations for complex database concepts ✅
- [ ] **RAG Enhancements - Semantic Search** → **DEFERRED TO PHASE 2 (Milestone 9)**:
  - [ ] Vector embeddings for all documentation passages
  - [ ] Semantic similarity search (vs. keyword-only)
  - [ ] Hybrid search combining keywords + embeddings
  - [ ] Expanded doc coverage (~15MB): replication, performance_schema, error codes
  - [ ] Query embedding cache and LRU eviction
  - [ ] Multi-turn conversation context support

#### 4.2.3 Query Execution Environment

**Status**: ✅ **COMPLETE**

**Requirements**:
- [x] Built-in SQL editor with syntax highlighting ✅
- [x] Execute queries and view results ✅
- [x] **Query history panel** with favorites, search, and replay ✅ (Completed Nov 7, 2025)
- [ ] Query templates
- [x] Result export (CSV, JSON, SQL) ✅
- [x] Query execution plan visualization ✅
- [x] Acceptance criteria: editor opens < 300ms; run shortcut latency < 150ms (network excluded); export completes < 2s for 50k rows ✅

#### 4.2.4 Schema Diff and Migration

**Requirements**:
- [ ] Compare schemas between databases
- [ ] Generate migration scripts
- [ ] Version control integration
- [ ] Rollback capabilities
 - [ ] Safety: clearly flag destructive changes and require explicit confirmation with a summarized impact

#### 4.2.5 Performance Recording and Playback

**Requirements**:
- [ ] Record performance metrics over time
- [ ] Playback historical data
- [ ] Incident timeline view
- [ ] Automated performance reports
 - [ ] Source note: if host metrics unavailable, record DB-native metrics only (performance_schema/sys)

#### 4.2.6 Alerting and Notifications

**Requirements**:
- [ ] Configurable alert rules
- [ ] VSCode notifications for critical issues
- [ ] Alert history
- [ ] Integration with external notification systems
 - [ ] Acceptance criteria: prevent duplicate alerts within a debounce window; user can mute/unmute per rule

#### 4.2.7 Replication Status Monitor (Inspired by Percona `pt-heartbeat`) [Medium]

**Status**: ⏳ **DEFERRED TO PHASE 4 (Milestone 23)** - Spec complete, implementation pending.

**Feature**: Comprehensive Replication Monitoring with AI-Powered Diagnostics

**Requirements**:
- [ ] Query `SHOW REPLICA STATUS` (MySQL 8.0.22+) or `SHOW SLAVE STATUS` (MariaDB/MySQL 5.7)
- [ ] **Replication Status Dashboard**:
  - [ ] Display all key replication metrics:
    - `Seconds_Behind_Master` / `Seconds_Behind_Source` (lag indicator)
    - `Slave_IO_Running` / `Replica_IO_Running` (I/O thread status)
    - `Slave_SQL_Running` / `Replica_SQL_Running` (SQL thread status)
    - `Master_Log_File` / `Source_Log_File` and `Read_Master_Log_Pos` (binlog position)
    - `Relay_Log_File` and `Relay_Log_Pos` (relay log position)
    - `Last_IO_Error`, `Last_SQL_Error` (error messages)
    - `Master_Server_Id` / `Source_Server_Id` (source server identification)
    - `Master_UUID` / `Source_UUID` (source server UUID)
    - `Auto_Position` (GTID auto-positioning status)
    - `Retrieved_Gtid_Set`, `Executed_Gtid_Set` (GTID progress)
  - [ ] Multi-replica support: Show all configured replicas in list/card view
  - [ ] Visual status indicators:
    - 🟢 Green: Healthy (lag < 5s, both threads running, no errors)
    - 🟡 Yellow: Warning (lag 5-30s, or minor issues)
    - 🔴 Red: Critical (lag > 30s, threads stopped, or errors present)
    - ⚪ Gray: Unknown/Not configured
- [ ] **Replication Lag Monitoring**:
  - [ ] Real-time lag display with auto-refresh (configurable interval: 5s default)
  - [ ] Historical lag chart (last 1 hour, 6 hours, 24 hours)
  - [ ] Alert when lag exceeds configurable threshold (default: 60s)
  - [ ] Lag trend indicator (increasing/decreasing/stable)
- [ ] **Replication Health Checks**:
  - [ ] Automated health status checks:
    - Verify both I/O and SQL threads are running
    - Check for replication errors
    - Validate GTID consistency (if GTID enabled)
    - Monitor binlog position progression
    - Detect stalled replication (no position change)
  - [ ] One-click "Test Replication Health" button
- [ ] **AI-Powered Replication Diagnostics**:
  - [ ] Automatic issue detection and analysis:
    - "Replica lag spike detected at 14:23. Root cause: Network latency increased by 300ms. Check connection between source and replica."
    - "SQL thread stopped with error 1062 (Duplicate entry). Likely cause: Write to replica or inconsistent data. Recommended: Check `sql_slave_skip_counter` or use GTID recovery."
    - "I/O thread stopped. Error: 'Could not connect to source'. Recommended: Verify network connectivity, source server status, and replication user credentials."
    - "GTID gap detected: Missing transactions in `Executed_Gtid_Set`. Recommended: Use `CHANGE MASTER TO MASTER_AUTO_POSITION=0` and manual recovery."
    - "Replication lag increasing steadily. Possible causes: Slow queries on replica, insufficient resources, or single-threaded replication. Consider enabling parallel replication."
  - [ ] AI explanations for replication concepts:
    - What is `Seconds_Behind_Master` and its limitations
    - GTID vs. traditional binlog replication
    - Parallel replication configuration
    - Common replication errors and recovery procedures
  - [ ] RAG-grounded recommendations with MySQL/MariaDB documentation links
- [ ] **Replication Control Actions** (with safety confirmations):
  - [ ] Start/Stop I/O Thread: `START|STOP SLAVE IO_THREAD`
  - [ ] Start/Stop SQL Thread: `START|STOP SLAVE SQL_THREAD`
  - [ ] Reset Replica: `RESET SLAVE` (with warning)
  - [ ] Skip Replication Error: `SET GLOBAL sql_slave_skip_counter = N` (with confirmation and explanation)
  - [ ] Change Master Position: `CHANGE MASTER TO ...` (advanced users, with validation)
  - [ ] All actions require confirmation in production environments
- [ ] **Export and Reporting**:
  - [ ] Export replication status to JSON/CSV
  - [ ] Historical lag report with charts
  - [ ] Replication health summary report

**Version Compatibility**:
- MySQL 8.0.22+: Use `SHOW REPLICA STATUS` (new terminology)
- MySQL 5.7 / MariaDB: Use `SHOW SLAVE STATUS` (legacy terminology)
- Auto-detect server version and use appropriate commands
- GTID support: MySQL 5.6+ / MariaDB 10.0.2+

**User Stories**:
- As a DBA managing replicas, I want real-time lag visibility with historical trends
- As a DevOps engineer, I want alerts when replicas fall behind or encounter errors
- As a database administrator, I want AI to explain why replication stopped and how to fix it
- As a developer, I want to understand replication lag without reading complex documentation
- As a DBA, I want quick actions to start/stop replication threads without opening a terminal

#### 4.2.8 Configuration Diff Tool (Inspired by Percona `pt-config-diff`) [Low]

**Requirements**:
- [ ] Compare `SHOW VARIABLES` between two connections (e.g., dev vs. prod)
- [ ] Highlight differences in table view: Variable / Connection A / Connection B / Impact
- [ ] AI explanation: "`max_connections` differs (100 vs. 500). Prod needs higher capacity."
- [ ] Export diff report (CSV/JSON)
- [ ] Filter: Show only "meaningful" differences (ignore minor version-specific defaults)

**User Stories**:
- As a DevOps engineer, I want to catch config drift between environments
- As a DBA, I want to validate staging matches prod config before promoting

#### 4.2.9 Online Schema Change Guidance (Inspired by Percona `pt-online-schema-change`) [Low]

**Requirements**:
- [ ] Detect `ALTER TABLE` commands in editor or chat
- [ ] Check table size: If > 1M rows, AI suggests: "Use `pt-online-schema-change` or `gh-ost` to avoid locking."
- [ ] Generate example command: `pt-online-schema-change --alter "ADD COLUMN ..." D=mydb,t=orders`
- [ ] Link to Percona docs with RAG citations
- [ ] Optional: Detect if `pt-osc` or `gh-ost` installed, offer to run (Phase 3)

**User Stories**:
- As a developer, I want guidance on safe schema changes
- As a DBA, I want to prevent accidental table locks in production

#### 4.2.10 InnoDB Status Monitor (Inspired by Percona `pt-mext`) [High]

**Status**: ⏳ **DEFERRED TO PHASE 4 (Milestone 22)** - Spec complete, expanding to include Aria engine support for MariaDB.

**Feature**: Comprehensive InnoDB Engine Status Viewer with AI-Powered Diagnostics

**Objective**: Provide deep visibility into InnoDB internals, including transactions, locks, buffer pool, I/O operations, and semaphores, with intelligent AI analysis to diagnose complex InnoDB-related issues.

**Requirements**:
- [ ] **InnoDB Status Dashboard**:
  - [ ] Query `SHOW ENGINE INNODB STATUS` and parse output into structured sections
  - [ ] Display key InnoDB metrics in organized panels:
    - **Transactions Section**:
      - Active transactions count
      - Transaction history list length (indicator of load)
      - Oldest active transaction age
      - Purge lag (unpurged undo records)
      - Transaction states: `ACTIVE`, `PREPARED`, `COMMITTED`, `ROLLED BACK`
      - Lock wait information (waiting transactions)
    - **Deadlocks Section**:
      - Latest deadlock information (full text)
      - Deadlock timestamp
      - Involved transactions and queries
      - Deadlock graph/visualization
      - Historical deadlock count (if available)
    - **Buffer Pool and Memory**:
      - Buffer pool size and usage
      - Free pages and database pages
      - Modified (dirty) pages
      - Buffer pool hit rate (pages read vs. pages read from disk)
      - Pending reads/writes
      - LRU list length
      - Flush list length
    - **I/O Operations**:
      - Pending I/O operations (reads, writes, fsyncs)
      - I/O thread states
      - Read/Write requests per second
      - Average I/O wait time
      - Log I/O (log writes, fsyncs)
    - **Insert Buffer (Change Buffer)**:
      - Insert buffer size and usage
      - Merged records
      - Merge operations
    - **Adaptive Hash Index**:
      - Hash index size
      - Hash searches/s and hits/s
      - Hit rate percentage
    - **Log (Redo Log)**:
      - Log sequence number (LSN)
      - Last checkpoint LSN
      - Checkpoint age (LSN diff)
      - Log buffer usage
      - Log writes and fsyncs per second
      - Pending log writes
    - **Row Operations**:
      - Rows inserted, updated, deleted, read per second
      - Queries inside InnoDB
      - Queries queued
    - **Semaphores and Waits**:
      - Mutex/RW-lock waits
      - Spin rounds and OS waits
      - Long semaphore waits (potential bottlenecks)
  - [ ] Auto-refresh capability (configurable interval: 10s default)
  - [ ] Visual indicators for problematic metrics (color-coded warnings)
- [ ] **Transaction History List Viewer**:
  - [ ] Parse and display transaction history list details
  - [ ] Show active transactions with:
    - Transaction ID
    - Transaction state
    - Time since started
    - Query being executed
    - Locks held
    - Tables being accessed
  - [ ] Highlight long-running transactions (> 30s configurable)
  - [ ] Filter transactions by state, duration, database
  - [ ] Link to Process List for full query context
- [ ] **Deadlock Analyzer**:
  - [ ] Parse latest deadlock information from InnoDB status
  - [ ] Visual deadlock graph showing:
    - Transactions involved (T1, T2, etc.)
    - Resources (rows/tables) being locked
    - Wait-for relationships (arrows showing who waits for whom)
  - [ ] Timeline view of deadlock sequence
  - [ ] Show queries that caused deadlock
  - [ ] Historical deadlock log (store last 10 deadlocks per session)
  - [ ] One-click export deadlock details for analysis
- [ ] **InnoDB Health Checks**:
  - [ ] Automated health assessments:
    - High transaction history length (> 100K = warning, > 1M = critical)
    - Large checkpoint age (> 70% of log file size = warning)
    - Low buffer pool hit rate (< 95% = warning)
    - High pending I/O operations (> 100 reads/writes = warning)
    - Long semaphore waits (> 240s = critical)
    - Excessive purge lag (> 1M undo records = warning)
    - Dirty pages ratio (> 75% = warning, indicates slow flushing)
  - [ ] Overall InnoDB health score (0-100)
  - [ ] Real-time alerts for critical issues
- [ ] **AI-Powered InnoDB Diagnostics**:
  - [ ] Intelligent analysis of InnoDB issues:
    - **Transaction History Buildup**: "Transaction history list length is 1.2M (critical). This indicates slow purge operations. Possible causes: Long-running transactions preventing purge, high write load, or undersized buffer pool. Recommendation: Identify and commit/rollback long transactions, consider increasing `innodb_purge_threads` to 4+, check `innodb_max_purge_lag`."
    - **Buffer Pool Issues**: "Buffer pool hit rate is 87% (below optimal 99%). This means frequent disk I/O. Recommendation: Increase `innodb_buffer_pool_size` to 70-80% of available RAM (currently 2GB, suggest 8GB). Monitor `Innodb_buffer_pool_reads` vs `Innodb_buffer_pool_read_requests`."
    - **Checkpoint Age Warning**: "Checkpoint age is 85% of log file size. InnoDB is struggling to flush dirty pages. Risk: Write stalls if age reaches 100%. Recommendation: Increase `innodb_log_file_size` from 512MB to 2GB (requires restart), or tune `innodb_io_capacity` to 2000+ for faster flushing on SSDs."
    - **Deadlock Patterns**: "Detected 15 deadlocks in last hour. Pattern: Transactions on `orders` and `order_items` tables. Root cause: Inconsistent lock order (some transactions lock orders first, others lock order_items first). Recommendation: Standardize lock acquisition order in application code. Always lock parent (`orders`) before child (`order_items`) tables."
    - **Semaphore Wait Issues**: "Long semaphore wait detected (600s). Thread 12345 waiting on mutex at buf0buf.cc:1234. This indicates severe contention. Possible causes: Buffer pool contention, adaptive hash index contention, or disk I/O bottleneck. Recommendation: Check disk I/O performance, consider disabling adaptive hash index (`innodb_adaptive_hash_index=OFF`), or increase `innodb_buffer_pool_instances`."
    - **Slow Purge Operations**: "Purge lag is 2.5M undo records. Purge threads can't keep up with write rate. Recommendation: Increase `innodb_purge_threads` from 4 to 8, ensure no extremely long-running transactions (check PROCESSLIST), verify `innodb_undo_tablespaces` configuration."
    - **Log I/O Bottleneck**: "Log writes are slow (avg 50ms/fsync). This can cause query stalls. Recommendation: Enable `innodb_flush_log_at_trx_commit=2` (slightly relaxed durability, major performance gain), or move redo logs to faster storage (dedicated SSD/NVMe). Check `innodb_log_write_ahead_size` tuning."
  - [ ] AI explanations for InnoDB concepts:
    - What is transaction history list and why it matters
    - Understanding checkpoint age and log file sizing
    - Buffer pool architecture and tuning strategies
    - Deadlock causes and prevention techniques
    - InnoDB locking mechanisms (row locks, gap locks, next-key locks)
    - Purge operations and undo log management
    - Adaptive hash index trade-offs
  - [ ] RAG-grounded recommendations with official MySQL/MariaDB InnoDB documentation
  - [ ] Contextual help: Click on any metric → Get AI explanation of what it means
- [ ] **InnoDB Metrics Comparison**:
  - [ ] Snapshot current InnoDB status
  - [ ] Compare two snapshots (e.g., before/after query, or different time points)
  - [ ] Highlight deltas: Changes in transactions, buffer pool, I/O rates
  - [ ] AI diff analysis: "Buffer pool dirty pages increased from 10% to 65% in 5 minutes. Indicates burst of write activity."
- [ ] **Historical Trending**:
  - [ ] Store key InnoDB metrics over time (optional, in-memory or file-based)
  - [ ] Charts for:
    - Transaction history length over time
    - Buffer pool hit rate trend
    - Checkpoint age progression
    - Deadlock frequency
    - Purge lag trend
  - [ ] Time ranges: Last 1 hour, 6 hours, 24 hours
- [ ] **Export and Reporting**:
  - [ ] Export raw `SHOW ENGINE INNODB STATUS` output to text file
  - [ ] Export parsed metrics to JSON/CSV
  - [ ] Generate InnoDB health report (PDF/HTML) with AI insights
  - [ ] Copy individual sections to clipboard (e.g., deadlock info)
- [ ] **Integration with Other Views**:
  - [ ] Link transaction IDs to Process List (show query for transaction)
  - [ ] Link locked tables to Schema Explorer
  - [ ] Correlate deadlocks with Query History
  - [ ] Cross-reference buffer pool metrics with slow queries (table scans)

**Version Compatibility**:
- MySQL 5.5+ / MariaDB 5.5+: Basic `SHOW ENGINE INNODB STATUS` support
- MySQL 5.6+ / MariaDB 10.0+: Enhanced with Performance Schema integration
- MySQL 8.0+ / MariaDB 10.5+: Full support with latest InnoDB features
- Auto-parse output format differences across versions

**Implementation Details**:
- [ ] **Parsing Engine**:
  - Robust regex-based parser for `SHOW ENGINE INNODB STATUS` output
  - Handle variations across MySQL/MariaDB versions
  - Graceful degradation if certain sections missing
- [ ] **Visualization**:
  - D3.js or similar for deadlock graphs
  - Chart.js for time-series metrics
  - Responsive layout for different screen sizes
- [ ] **Performance**:
  - Parse InnoDB status in < 100ms for typical output (< 50KB)
  - Render dashboard in < 500ms
  - Background auto-refresh without blocking UI
- [ ] **Safety**:
  - Read-only view (no modification actions in Phase 2)
  - No performance impact: `SHOW ENGINE INNODB STATUS` is lightweight (< 5ms)

**Acceptance Criteria**:
- [ ] Dashboard displays all 9 key InnoDB sections with parsed metrics
- [ ] Transaction history list viewer shows all active transactions with details
- [ ] Deadlock analyzer renders visual graph for latest deadlock
- [ ] AI generates at least one actionable recommendation per detected issue
- [ ] Health checks correctly flag critical thresholds (transaction history > 1M, checkpoint age > 70%)
- [ ] Metrics comparison shows deltas between two snapshots with ±% changes
- [ ] Export to JSON includes all parsed metrics in structured format
- [ ] Auto-refresh updates dashboard without UI flicker
- [ ] Links to Process List correctly match transaction IDs to queries
- [ ] Performance: Initial load < 500ms, auto-refresh < 300ms, parsing < 100ms

**User Stories**:
- As a DBA, I want to monitor InnoDB transaction history length to prevent purge lag issues
- As a database administrator, I want to understand why my buffer pool hit rate is low and how to improve it
- As a developer, I want to analyze deadlocks with a visual graph instead of parsing text output
- As a DBA on-call, I want AI to explain why checkpoint age is critical and what to do immediately
- As a performance engineer, I want to compare InnoDB metrics before and after a configuration change
- As a DBA, I want to see if long-running transactions are blocking purge operations
- As a database administrator, I want alerts when transaction history exceeds safe thresholds
- As a developer debugging production issues, I want to understand InnoDB locking behavior with AI explanations

---

### 4.3 Phase 3: Multi-Database Support

#### 4.3.1 PostgreSQL Support

**Requirements**:
- [ ] Adapt all Phase 1 features for PostgreSQL
- [ ] PostgreSQL-specific features (e.g., VACUUM analysis)
- [ ] PostGIS support
 - [ ] Source note: rely on pg_stat_* views for equivalents of PROCESSLIST and slow query summaries

#### 4.3.2 Redis/Valkey Support

**Requirements**:
- [ ] Key browser
- [ ] Memory analysis
- [ ] Slowlog monitoring
- [ ] Redis-specific optimization suggestions
 - [ ] Caution: avoid KEYS * in production; use SCAN with sensible limits and sampling

---

## 5. Technical Requirements

### 5.0 Supported Database Versions

**MySQL/MariaDB Support Policy**: MyDBA supports **only GA (Generally Available) versions** that are actively maintained.

#### Supported Versions (Phase 1)

| Database | Supported Versions | Notes |
|----------|-------------------|-------|
| **MySQL** | 8.0 LTS, 8.4 Innovation, 9.x+ | Full Performance Schema support, official profiling |
| **MariaDB** | 10.6 LTS, 10.11 LTS, 11.x+ | Full compatibility with MySQL features |

#### Unsupported Versions

| Database | Version | Reason |
|----------|---------|--------|
| MySQL 5.7 | EOL Oct 2023 | End of Life, security vulnerabilities, deprecated features |
| MySQL 5.6 | EOL Feb 2021 | End of Life |
| MariaDB 10.5 | EOL Jun 2025 | Approaching EOL |
| MariaDB 10.4 | EOL Jun 2024 | EOL |

#### Version Detection & Warnings

- [ ] **On Connection**:
  - Detect database version using `SELECT VERSION()`
  - Parse version string (e.g., `8.0.35-0ubuntu0.22.04.1`, `10.11.5-MariaDB`)
  - Display version in connection tree view node
- [ ] **Unsupported Version Warning**:
  - If MySQL < 8.0 or MariaDB < 10.6: Show modal warning
  - Message: "⚠️ Unsupported Database Version\n\nMyDBA requires MySQL 8.0+ or MariaDB 10.6+ (GA versions).\n\nYour version: {version}\n\nSome features may not work correctly. Please upgrade for best experience."
  - Options: [Upgrade Guide] [Connect Anyway] [Cancel]
- [ ] **EOL Warning**:
  - If MySQL 5.7: "MySQL 5.7 reached End of Life in October 2023. Upgrade to MySQL 8.0 LTS for security patches and performance improvements."
  - Link to MySQL upgrade documentation
- [ ] **Feature Compatibility Checks**:
  - Performance Schema: Check `SHOW VARIABLES LIKE 'performance_schema'`
  - `EXPLAIN FORMAT=JSON`: Test on connection
  - Disable incompatible features gracefully with informative messages

#### Phase 3 Support (Future)

| Database | Target Versions | Notes |
|----------|----------------|-------|
| PostgreSQL | 14+, 15+, 16+ | LTS versions only |
| Redis | 7.x+ | OSS Redis GA versions |
| Valkey | 7.2+ | Redis fork, community-driven |

---

### 5.1 Architecture

```
┌─────────────────────────────────────────┐
│         VSCode Extension Host           │
├─────────────────────────────────────────┤
│  ┌──────────────────────────────────┐  │
│  │   Extension Core (TypeScript)    │  │
│  │  - Connection Manager             │  │
│  │  - Tree View Provider             │  │
│  │  - Command Registry               │  │
│  │  - State Management               │  │
│  └──────────────────────────────────┘  │
│                 │                        │
│  ┌──────────────┴───────────────────┐  │
│  │                                   │  │
│  ▼                                   ▼  │
│  ┌──────────────┐    ┌──────────────┐  │
│  │ Database     │    │  AI Service  │  │
│  │ Adapters     │    │  Layer       │  │
│  │ - MySQL      │    │ - VSCode LM  │  │
│  │ - PostgreSQL │    │ - Prompts    │  │
│  │ - Redis      │    │ - Context    │  │
│  └──────────────┘    └──────────────┘  │
│         │                      │        │
└─────────┼──────────────────────┼────────┘
          │                      │
          ▼                      ▼
   ┌──────────────┐    ┌─────────────────┐
   │   Database   │    │  VSCode AI/     │
   │   Servers    │    │  Language Model │
   └──────────────┘    └─────────────────┘
```

### 5.2 Technology Stack

**Core**:
- TypeScript
- Node.js
- VSCode Extension API

**Database Drivers**:
- `mysql2` - MySQL 8.0+ and MariaDB 10.6+ support (GA versions only)
- `pg` - PostgreSQL support (Phase 3)
- `ioredis` - Redis/Valkey support (Phase 3)

**AWS Integration**:
- `@aws-sdk/client-rds` - AWS RDS IAM authentication token generation
- `@aws-sdk/credential-providers` - AWS credential chain (env vars, profiles, IAM roles, SSO)

**UI Components**:
- Webview UI Toolkit (@vscode/webview-ui-toolkit)
- Chart.js or D3.js for visualizations
- **D3.js or Mermaid.js** - Visual EXPLAIN plan tree diagrams
- **Plotly.js or Chart.js** - Waterfall/timeline charts for query profiling
- React (for complex webviews)

**AI Integration** (Multi-Provider):
- **VSCode Language Model API** (`vscode.lm`) - VSCode only, requires GitHub Copilot
- **OpenAI API** - All editors, pay-per-use
- **Anthropic Claude API** - All editors, pay-per-use
- **Ollama** - All editors, free, fully local and private
- Provider abstraction layer with auto-detection and fallback
- **RAG (Retrieval-Augmented Generation)**:
  - TF-IDF or natural (Node.js NLP library) for keyword-based doc search (Phase 1)
  - Vectra or hnswlib-node for vector embeddings storage (Phase 2)
  - transformers.js or @xenova/transformers for local embeddings (Phase 2)
  - Cheerio or jsdom for live doc parsing (Phase 3)

**Editor Compatibility**:
| Editor | VSCode LM | OpenAI | Anthropic | Ollama |
|--------|-----------|---------|-----------|---------|
| VSCode | ✅ | ✅ | ✅ | ✅ |
| Cursor | ❌ | ✅ | ✅ | ✅ |
| Windsurf | ❌ | ✅ | ✅ | ✅ |
| VSCodium | ❌ | ✅ | ✅ | ✅ |

**SQL Parsing & Anonymization**:
- node-sql-parser (templating-based query anonymization for privacy)

**Testing**:
- Jest - Unit testing
- VSCode Extension Test Runner
- Docker - Integration testing with real databases

### 5.3 Security Requirements

- [ ] All credentials stored using VSCode SecretStorage API
- [ ] No plaintext storage of passwords
- [ ] Support for credential providers (e.g., AWS Secrets Manager)
- [ ] Secure communication over SSL/TLS
- [ ] SQL injection prevention in all query builders
- [ ] Audit logging for destructive operations
 - [ ] Destructive operation confirmations (DROP/TRUNCATE/DELETE/UPDATE with/without WHERE)
 - [ ] Missing WHERE clause warnings for UPDATE/DELETE
 - [ ] Dry-run preview mode for query execution
- [ ] Rate limiting for AI API calls
- [ ] Data anonymization for AI prompts (optional setting)
 - [ ] Prompt privacy: mask literals (emails, ids, uuids, tokens) and table names when anonymization is enabled; never send credentials or full dumps
 - [ ] Global AI kill switch in status bar; setting to disable all AI calls immediately

---

### 5.4 Data Privacy & Protection

**Philosophy**: MyDBA is designed with a **privacy-first, local-first** architecture. Your database data stays on your machine unless you explicitly use AI features that require external API calls.

#### 5.4.1 Data Processing & Storage

**Local Processing (No Network Transmission)**:
- ✅ Database connection credentials (stored in VSCode SecretStorage, never transmitted)
- ✅ Query execution results (displayed locally, never logged externally)
- ✅ Database schema metadata (tree view data cached locally)
- ✅ Performance metrics (PROCESSLIST, variables, dashboard data)
- ✅ User-created custom views and queries
- ✅ Extension settings and preferences
- ✅ Documentation bundles (embedded in extension, no external calls)

**Network Transmission (Only When AI Features Enabled)**:
- ⚠️ **AI Query Analysis**: Query text + anonymized schema context → VSCode Language Model API
- ⚠️ **Chat Participant**: User prompts + conversation context → VSCode LM API
- ⚠️ **Documentation Search (Phase 3)**: Search queries → MySQL/MariaDB docs (HTTPS only)

**Never Transmitted**:
- ❌ Database credentials (passwords, SSH keys, SSL certificates)
- ❌ Actual data from query results (customer names, emails, PII)
- ❌ Full database dumps or table data
- ❌ IP addresses or hostnames of database servers
- ❌ Connection strings with credentials

#### 5.4.2 AI Data Privacy Controls

**Requirements**:
- [ ] **Explicit User Consent**:
  - First-run prompt: "MyDBA uses AI features powered by VSCode. Allow AI features?"
  - Clear explanation of what data is sent (query text, anonymized schema)
  - Links to privacy documentation and VSCode's LM API privacy policy
  - Default to **disabled** until user opts in

- [ ] **Granular AI Controls** (Settings):
  ```typescript
  "mydba.ai.enabled": false,  // Master switch (default: false)
  "mydba.ai.anonymizeData": true,  // Anonymize before sending
  "mydba.ai.allowSchemaContext": true,  // Include schema info
  "mydba.ai.allowQueryHistory": false,  // Use recent queries as context
  "mydba.ai.chatEnabled": true,  // Enable @mydba chat participant
  "mydba.ai.telemetry": false  // Share usage analytics (default: false)
  ```

- [ ] **Visual Privacy Indicators**:
  - 🔒 **Lock icon** in status bar when AI is disabled
  - 🌐 **Globe icon** when AI request is in-flight (shows "Sending to AI...")
  - 📡 **Network activity log** in Output panel (`MyDBA - Network`)
  - Toast notification: "Query sent to AI for analysis" (can be disabled)

- [ ] **Data Anonymization Pipeline**:
  ```typescript
  // Before sending to AI:
  const anonymized = {
    query: templateQuery(userQuery),  // Template with placeholders
    schema: sanitizeSchema(tables),   // Remove row counts, sizes
    context: "MySQL 8.0, InnoDB engine",  // Version only
    docs: ragContext  // Only doc excerpts, no user data
  };
  // Never include: credentials, hostnames, IPs, result data

  // Example templating:
  // Original: SELECT * FROM users WHERE email = 'john@example.com' AND id = 12345
  // Templated: SELECT * FROM <table:users> WHERE <col:email> = ? AND <col:id> = ?
  // This preserves structure for AI while masking actual values
  ```

- [ ] **User Data Rights**:
  - Command: `MyDBA: Clear AI Conversation History` (wipes chat context)
  - Command: `MyDBA: Export Privacy Report` (shows what was sent to AI)
  - Command: `MyDBA: Revoke AI Consent` (disables all AI, clears history)
  - Setting to auto-clear chat history on VSCode restart

#### 5.4.3 Credential Security

**Requirements**:
- [ ] **VSCode SecretStorage API**:
  - Credentials encrypted using OS-native keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service)
  - Credentials never written to disk in plaintext
  - Credentials never logged (even in debug mode)

- [ ] **Connection String Parsing**:
  - Strip passwords from connection strings before display
  - Display as: `mysql://user:***@hostname:3306/db`
  - Never show in error messages or logs

- [ ] **SSH Key Handling**:
  - SSH private keys stored in SecretStorage
  - Passphrase-protected keys supported
  - Keys loaded into memory only during connection
  - Keys wiped from memory after connection established

- [ ] **SSL/TLS Certificates**:
  - Client certificates stored in SecretStorage
  - Support for CA certificate validation
  - Option to pin server certificates (prevent MITM)

- [ ] **Credential Providers** (Phase 2):
  - AWS Secrets Manager integration
  - HashiCorp Vault support
  - 1Password CLI integration
  - Never cache externally-fetched credentials

#### 5.4.4 Query Result Privacy

**Requirements**:
- [ ] **Local-Only Display**:
  - Query results never leave VSCode webview
  - No result data included in error reports
  - No result data sent to AI (only EXPLAIN output)

- [ ] **Sensitive Data Detection**:
  - Warn when query returns columns named: `password`, `ssn`, `credit_card`, `api_key`, `token`
  - Option to auto-redact sensitive columns in UI
  - Banner: "⚠️ This query may contain sensitive data. AI analysis disabled for this result."

- [ ] **Result Export Privacy**:
  - CSV/JSON export stays local (no cloud upload)
  - Export to clipboard warns if >1MB (potential PII exposure)
  - Option to automatically strip sensitive columns from exports

#### 5.4.5 Network Security

**Requirements**:
- [ ] **TLS Enforcement**:
  - All external connections over HTTPS (docs, AI API)
  - Database connections support SSL/TLS
  - Certificate validation enabled by default
  - Warning when connecting without encryption

- [ ] **Firewall & Proxy Support**:
  - Respect VSCode's proxy settings
  - Support for corporate proxies with authentication
  - No direct internet access required (all via VSCode APIs)

- [ ] **Network Activity Transparency**:
  - Log all outbound requests in Output panel
  - Format: `[Network] POST https://api.vscode.dev/lm → Query analysis (128 bytes)`
  - User can review before sending (with `mydba.ai.confirmBeforeSend` setting)

#### 5.4.6 Telemetry & Analytics

**Requirements**:
- [ ] **Telemetry: Opt-In Only** (Default: Disabled):
  - Never collect without explicit consent
  - Respects VSCode's `telemetry.telemetryLevel` setting
  - Can be disabled independently: `mydba.telemetry.enabled: false`

- [ ] **What We Collect (If Enabled)**:
  - ✅ Feature usage counts (e.g., "EXPLAIN executed 5 times")
  - ✅ Database version distribution (e.g., "60% use MySQL 8.0")
  - ✅ Performance metrics (extension load time, query latency)
  - ✅ Error types (crash reports, without user data)
  - ❌ **Never**: Query text, table names, credentials, IPs

- [ ] **Telemetry Controls**:
  - Command: `MyDBA: View Telemetry Data` (shows what would be sent)
  - Command: `MyDBA: Disable Telemetry`
  - Telemetry data stored locally for 7 days before sending (can be reviewed/deleted)

#### 5.4.7 Compliance & Regulations

**GDPR Compliance**:
- [ ] **Right to Access**: Export all locally stored data via `MyDBA: Export User Data`
- [ ] **Right to Erasure**: `MyDBA: Delete All Local Data` command
- [ ] **Right to Portability**: Export connections (without passwords) to JSON
- [ ] **Data Minimization**: Only collect what's necessary for functionality
- [ ] **Consent Management**: Granular consent for AI, telemetry, crash reports

**Security Standards**:
- [ ] Follow OWASP Top 10 guidelines
- [ ] Regular dependency audits (npm audit, Snyk)
- [ ] No eval() or dynamic code execution
- [ ] Content Security Policy for webviews

**Disclosure Requirements**:
- [ ] Privacy Policy in extension README
- [ ] Data flow diagram in documentation
- [ ] Third-party service disclosure (VSCode LM API)
- [ ] Security vulnerability reporting process (SECURITY.md)

#### 5.4.8 Privacy by Design

**Architecture Principles**:
1. **Local-First**: All core functionality works offline without AI
2. **Minimal Data**: Send only query structure to AI, not actual data
3. **User Control**: Every network call can be disabled
4. **Transparency**: Log and display all external requests
5. **Encryption**: All credentials encrypted at rest, all network calls over TLS
6. **Auditability**: Users can export privacy report showing all data sent

**Example: AI Query Analysis Flow**
```typescript
// User runs query optimization
async function analyzeQuery(query: string) {
  // 1. Check if AI enabled
  if (!config.get('mydba.ai.enabled')) {
    return fallbackToStaticRules(query);  // Local analysis
  }

  // 2. Template the query (preserves structure, masks values)
  const templated = templateQuery(query);
  // Original: SELECT * FROM users WHERE email = 'john@example.com' AND id = 12345
  // Result:   SELECT * FROM <table:users> WHERE <col:email> = ? AND <col:id> = ?

  const anonymized = {
    query: templated,
    schema: getMinimalSchema(),  // Table/column names and types
    docs: ragSystem.retrieve(query)  // Local doc excerpts
  };

  // 3. Log network activity (transparent)
  logger.network('Sending to AI: query (65 chars), schema (3 tables), docs (2 excerpts)');

  // 4. User confirmation (if enabled)
  if (config.get('mydba.ai.confirmBeforeSend')) {
    const proceed = await vscode.window.showInformationMessage(
      'Send templated query to AI for analysis?',
      'Yes', 'No', 'Show Data'
    );
    if (proceed !== 'Yes') return null;
  }

  // 5. Send to AI (via VSCode API, respects user's LM settings)
  const response = await vscode.lm.sendRequest(anonymized);

  // 6. Log response
  logger.network('Received from AI: 250 chars');

  return response;
}

// Query templating function
function templateQuery(sql: string): string {
  const parsed = parseSql(sql);

  return parsed
    .replaceTableNames((name) => `<table:${name}>`)
    .replaceColumnNames((name, type) => `<col:${name}>`)
    .replaceLiterals((value) => '?')
    .toString();
}
```

**Acceptance Criteria**:
- [ ] Privacy policy reviewed by legal (before v1.0 release)
- [ ] All network calls logged and reviewable by user
- [ ] Zero credentials leaked in 100+ penetration tests
- [ ] Telemetry respects VSCode's global settings
- [ ] AI features gracefully degrade when disabled (no errors)
- [ ] Privacy report accurately lists all data sent in last 30 days

---

### 5.5 Performance Requirements

- [ ] Tree view loading: < 2 seconds for 1000+ tables
- [ ] Query execution: Near-native performance
- [ ] Metrics refresh: < 1 second for host dashboard
- [ ] AI response time: < 5 seconds for optimization suggestions
- [ ] Memory footprint: < 100MB for typical usage
- [ ] Extension activation: < 1 second
 - [ ] Filters and searches operate under 200ms on 1,000 items

### 5.5 Compatibility Requirements

- [ ] VSCode version: 1.85.0 or higher
- [ ] Node.js: 18.x or higher
- [ ] MySQL versions: 5.7, 8.0, 8.1+
- [ ] MariaDB versions: 10.4, 10.5, 10.6, 10.11, 11.x
- [ ] Operating Systems: Windows, macOS, Linux

### 5.6 Assumptions & Dependencies

- **Assumptions**:
  - Users have VSCode 1.85+ installed
  - Basic knowledge of SQL
  - Stable internet for AI features (optional offline mode in future)
  - MySQL users have appropriate privileges for required views (see Minimum Privileges)

- **Dependencies**:
  - External libraries (mysql2, pg, ioredis)
  - VSCode Extension APIs (may evolve)
  - Third-party services (VSCode LM API for AI—fallback to local models if needed)

- **External Risks**:
  - Changes in VSCode APIs could require updates
  - Database driver updates may introduce breaking changes

---

## 6. User Interface and Experience

### 6.1 Extension Views

**Activity Bar Icon**:
- Custom database icon
- Badge showing active connections
- Quick access to extension features

**Sidebar Panel**:
- Connection list at top
- Tree view for database explorer
- Collapsible sections for monitoring views
- Search bar for quick navigation

**Command Palette Commands**:
- `MyDBA: New Connection`
- `MyDBA: Refresh All`
- `MyDBA: Show Process List`
- `MyDBA: Analyze Query`
- `MyDBA: Optimize with AI`
- `MyDBA: Show Dashboard`
- `MyDBA: Export Metrics`
 - `MyDBA: Toggle AI (Global)`

**Status Bar**:
- Active connection indicator
- Current database display
- Query execution time
- Connection health status

### 6.2 Webview Designs

**Host Dashboard**:
```
┌────────────────────────────────────────────────┐
│  Host: mysql-prod-01  ⟳ Refresh  ⚙️ Settings  │
├────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ CPU      │ │ Memory   │ │ Disk I/O │       │
│  │ 45%  🟢  │ │ 67%  🟡  │ │ 234 MB/s │       │
│  └──────────┘ └──────────┘ └──────────┘       │
│                                                 │
│  📊 Queries per Second                         │
│  ┌─────────────────────────────────────────┐  │
│  │     ▁▂▃▄▅▆▇█▇▆▅▄▃▂▁                    │  │
│  └─────────────────────────────────────────┘  │
│                                                 │
│  🔄 Active Connections: 42 / 150               │
│  🐌 Slow Queries (last hour): 12               │
│  ⚠️  Long Running Queries: 3                   │
│                                                 │
│  [View Alerts] [Export Report]                 │
└────────────────────────────────────────────────┘
```

**Query Optimization Panel**:
```
┌────────────────────────────────────────────────┐
│  Query Optimization  🤖 AI Powered             │
├────────────────────────────────────────────────┤
│  Original Query:                               │
│  ┌──────────────────────────────────────────┐ │
│  │ SELECT * FROM orders                      │ │
│  │ WHERE user_id = 123                       │ │
│  │ AND status = 'pending'                    │ │
│  └──────────────────────────────────────────┘ │
│                                                 │
│  ⚠️  Issues Found:                             │
│  • SELECT * returns unnecessary columns        │
│  • Missing index on (user_id, status)         │
│  • Full table scan detected                   │
│                                                 │
│  💡 AI Suggestion:                             │
│  ┌──────────────────────────────────────────┐ │
│  │ SELECT id, user_id, status, amount        │ │
│  │ FROM orders                                │ │
│  │ WHERE user_id = 123                       │ │
│  │ AND status = 'pending'                    │ │
│  └──────────────────────────────────────────┘ │
│                                                 │
│  📈 Expected Improvement: 85% faster           │
│                                                 │
│  Recommended Index:                            │
│  CREATE INDEX idx_user_status                  │
│  ON orders(user_id, status)                    │
│                                                 │
│  [Apply Suggestion] [Explain More] [Dismiss]  │
└────────────────────────────────────────────────┘
```

**Visual EXPLAIN Viewer** (NEW):
```
┌──────────────────────────────────────────────────────────────────┐
│  EXPLAIN Plan Viewer    [Tree View ▼] [Table View] [Text View]  │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Query: SELECT o.*, u.name FROM orders o JOIN users u ...         │
│                                                                    │
│  Visual Tree Diagram:                                             │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                                                              │ │
│  │          [Final Result: 145K rows]                          │ │
│  │                    │                                         │ │
│  │         ┌──────────┴──────────┐                             │ │
│  │         │                     │                              │ │
│  │    🔴 Nested Loop         🔴 Using Filesort                 │ │
│  │    cost=1250, 145K rows    (sort buffer: 256KB)             │ │
│  │    HIGH IMPACT             HIGH IMPACT                       │ │
│  │         │                                                    │ │
│  │    ┌────┴────┐                                               │ │
│  │    │         │                                               │ │
│  │  🔴 orders  🟢 users                                         │ │
│  │  Table Scan  Index Lookup                                   │ │
│  │  (ALL)       (PRIMARY)                                      │ │
│  │  145K rows   1 row                                           │ │
│  │  CRITICAL    GOOD                                            │ │
│  │                                                              │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                    │
│  🤖 AI Interpretation:                                            │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ This query scans all 145,000 rows in the `orders` table    │ │
│  │ without using an index (type=ALL). For each row, it         │ │
│  │ performs a fast lookup on `users` (PRIMARY key).            │ │
│  │                                                              │ │
│  │ Problems:                                                    │ │
│  │ 1. Full table scan on `orders` (🔴 HIGH IMPACT)            │ │
│  │ 2. Filesort for ORDER BY clause (🔴 HIGH IMPACT)           │ │
│  │                                                              │ │
│  │ Current Performance: ~2.3s                                  │ │
│  │ With Index: ~0.05s (46x faster) 📖 [MySQL Docs: Indexes]   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  💡 Recommended Fix:                                              │
│  CREATE INDEX idx_user_status ON orders(user_id, status);        │
│                                                                    │
│  [Apply Index] [Compare Before/After] [Show Table Details]       │
│                                                                    │
│  Pain Points Summary:                                             │
│  🔴 2 Critical  🟡 0 Warnings  🟢 1 Good                         │
└──────────────────────────────────────────────────────────────────┘
```

**Query Profiling Viewer** (NEW):
```
┌──────────────────────────────────────────────────────────────────┐
│  Query Profiling    [EXPLAIN Tree] [Profiling Timeline ▼]        │
│                     [Optimizer Trace] [Metrics Summary]           │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Query: SELECT * FROM orders WHERE user_id = 123 ORDER BY date   │
│  Total Time: 2.34s  |  Rows Examined: 145K  |  Rows Sent: 125   │
│                                                                    │
│  🔄 Execution Timeline (Waterfall Chart):                         │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                                                              │ │
│  │ Opening tables     ▌ 0.001s (0.04%)                        │ │
│  │ Init              ▌ 0.002s (0.09%)                          │ │
│  │ System lock        ▌ 0.001s (0.04%)                        │ │
│  │ Optimizing         ▌ 0.003s (0.13%)                        │ │
│  │ Statistics         ▌ 0.004s (0.17%)                        │ │
│  │ Executing         ▌ 0.005s (0.21%)                          │ │
│  │ 🔴 Sending data    ███████████████████████ 1.987s (84.9%)  │ │
│  │ 🟡 Sorting result  ████ 0.320s (13.7%)                     │ │
│  │ End               ▌ 0.002s (0.09%)                          │ │
│  │ Closing tables    ▌ 0.001s (0.04%)                          │ │
│  │ Freeing items     ▌ 0.014s (0.60%)                          │ │
│  │                                                              │ │
│  │ ├────────────────────────────────────────────────────────┤ │
│  │ 0s               1s                2s                 2.34s │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  🤖 AI Profiling Insights:                                        │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 🔴 84.9% of time spent in "Sending data" stage             │ │
│  │    → This indicates a full table scan reading 145K rows.   │ │
│  │    → Add index on `user_id` to reduce rows examined.       │ │
│  │                                                              │ │
│  │ 🟡 13.7% of time spent in "Sorting result"                 │ │
│  │    → Filesort triggered due to missing ORDER BY index.     │ │
│  │    → Use composite index (user_id, date) to avoid sort.    │ │
│  │                                                              │ │
│  │ ✅ Optimizer stage only 0.13% (good)                        │ │
│  │                                                              │ │
│  │ Predicted with index: Sending data ~0.04s, Sorting ~0.01s  │ │
│  │ Total: ~0.05s (46x faster) 📖 [MySQL Docs: Index Merge]   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  📊 Detailed Metrics:                                             │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Rows Examined:    145,203  (🔴 Very High)                  │ │
│  │ Rows Sent:        125      (Selectivity: 0.09%)            │ │
│  │ Tmp Tables:       1        (256 KB for filesort)           │ │
│  │ Tmp Disk Tables:  0        (✅ Good, fits in memory)       │ │
│  │ Sort Rows:        125                                       │ │
│  │ Sort Merge Passes: 0       (✅ Good, single-pass sort)     │ │
│  │ Lock Time:        0.002s   (✅ Negligible)                 │ │
│  │ CPU Time:         2.31s    (99% of total, I/O not issue)   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  💡 Recommended Fix:                                              │
│  CREATE INDEX idx_user_date ON orders(user_id, date);            │
│  -- Composite index eliminates both scan and sort                │
│                                                                    │
│  [Apply Index] [Run Before/After Test] [Show Optimizer Trace]    │
└──────────────────────────────────────────────────────────────────┘
```

### 6.3 Color Scheme and Theming

- Follow VSCode theme colors
- Custom semantic colors:
  - 🟢 Green: Healthy/Good performance
  - 🟡 Yellow: Warning/Moderate issues
  - 🔴 Red: Critical/Severe issues
  - 🔵 Blue: Informational
- Dark and light theme support
- High contrast mode compatibility

---

## 7. AI Integration Details

### 7.1 Use Cases for AI

1. **Query Optimization**
   - Analyze query structure
   - Suggest index improvements
   - Recommend rewrites for better performance
   - Explain execution plans

2. **Configuration Guidance**
   - **AI-Generated Variable Descriptions** ✅ (NEW - Phase 2.5)
     - On-demand explanations for MySQL/MariaDB system variables
     - Automatically infer risk levels (safe/caution/dangerous) based on variable name patterns
     - Generate practical DBA-focused recommendations
     - Include warnings about changing critical settings
     - Cache descriptions per session to minimize AI calls
   - Recommend optimal variable settings
   - Explain trade-offs between settings
   - Suggest configuration for specific workloads

3. **Troubleshooting**
   - Diagnose performance issues
   - Explain error messages
   - Suggest resolution steps

4. **Learning and Documentation**
   - Explain database concepts
   - Provide context-specific tutorials
   - Generate documentation for schemas

### 7.2 AI Prompting Strategy

**Context Injection**:
```typescript
interface OptimizationContext {
  query: string;
  explainOutput: any;
  tableSchema: TableDefinition[];
  existingIndexes: Index[];
  databaseEngine: string;
  recentPerformance: Metrics;
}
```

**Sample Prompts**:

*Query Optimization*:
```
You are an expert MySQL database administrator. Analyze the following query and provide optimization suggestions:

Query: ${query}
Execution Plan: ${explainOutput}
Table Schema: ${schema}
Existing Indexes: ${indexes}

Please provide:
1. Issues with the current query
2. Suggested optimizations
3. Index recommendations
4. Expected performance improvement
5. Any trade-offs or considerations
```

*Configuration Advice*:
```
You are an expert MySQL DBA. Review these system variables and suggest optimizations:

Current Settings: ${variables}
Database Engine: ${engine}
Workload Type: ${workloadType}
Available Memory: ${memory}

Please provide configuration recommendations with explanations.
```

*AI-Generated Variable Description (NEW - Phase 2.5)*:
```
You are a Senior Database Administrator. Explain the MySQL/MariaDB system variable and provide practical recommendations.

Variable Name: ${variableName}
Current Value: ${currentValue}
Database Type: ${dbType}

Provide a brief, practical explanation covering:
1. What this variable controls
2. Common use cases
3. Recommended values or ranges
4. Any warnings about changing it

Keep the explanation concise (3-5 sentences) and focused on practical DBA concerns.
Format your response as plain text, not JSON.
```

### 7.3 Documentation-Grounded AI (RAG - Retrieval-Augmented Generation)

**Objective**: Reduce AI hallucinations and increase trustworthiness by grounding responses in official MySQL/MariaDB documentation.

**Architecture**:
```
User Query → Context Detection → Doc Retrieval → Inject into Prompt → Grounded Response
     ↓              ↓                  ↓                 ↓                    ↓
"What is      MySQL 8.0 var    Search embedded docs  AI + Citations    Response with
buffer_pool   detection        → Top 3 passages      in prompt         doc sources
_size?"                         from ref manual
```

#### 7.3.1 Phase 1 (MVP): Keyword-Based Documentation Retrieval ✅ COMPLETE

**Requirements**:
- [x] **Embedded Documentation Bundle**: ✅
  - Curate and bundle essential MySQL/MariaDB docs with extension (~5MB)
  - Coverage:
    - MySQL 8.0 System Variables reference (all variables)
    - MySQL 8.0 EXPLAIN output interpretation
    - MySQL 8.0 Optimization: Indexes chapter
    - MySQL 8.0 InnoDB Configuration
    - MariaDB 11.x equivalents and differences
  - Store as structured JSON with metadata (version, category, source URL)
  - Version-aware: detect user's DB version and serve matching docs

- [x] **Keyword-Based Search**: ✅
  - Extract keywords from user query and context (variable names, table names, SQL keywords)
  - Match against doc index using TF-IDF or simple scoring
  - Retrieve top 3-5 most relevant passages (500-1000 tokens total)
  - Return with source citations (doc section, version, official URL)

- [x] **Prompt Enhancement**: ✅
  - Inject retrieved docs into AI prompt with clear attribution
  - **[Citation X] format**: Documentation numbered as [Citation 1], [Citation 2], etc.
  - Instruct AI to prioritize doc context over general knowledge
  - Require citations in AI responses: "According to [Citation 1]..."
  - **Citations array** in AI response schema with id, title, url, relevance
  - If docs don't cover topic: AI must state "not found in official documentation"

- [x] **UI Integration**: ✅
  - Display inline citations with 📖 icon
  - "Show Source" button expands to full doc section
  - Link to official docs (opens in browser)
  - Visual indicator when response is doc-grounded vs. general AI knowledge
  - Version compatibility badge (e.g., "✅ MySQL 8.0" or "⚠️ Removed in 8.0")

**Example Output**:
```
User: "What does innodb_buffer_pool_size do?"

AI Response:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📖 Documentation-Grounded Answer (MySQL 8.0)

innodb_buffer_pool_size controls the InnoDB buffer pool, which
caches table and index data in memory.

📖 According to MySQL 8.0 Reference Manual:
   "The buffer pool is an area in main memory where InnoDB
    caches table and index data as it is accessed."

💡 Best Practice:
   Set to 70-80% of available RAM on dedicated database servers.
   Default: 128MB (often too small for production)

🔗 Sources:
   • MySQL 8.0 Ref: InnoDB Buffer Pool Configuration
     [link to dev.mysql.com]
   • MySQL 8.0 Optimization: Buffer Pool
     [link to dev.mysql.com]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Acceptance Criteria**:
- [ ] 90%+ of variable explanations include official doc citations
- [ ] AI responses on covered topics match official docs (no contradictions)
- [ ] Retrieval latency < 200ms (in-memory keyword search)
- [ ] Total embedded doc bundle < 10MB
- [ ] Version detection accuracy > 95%
- [ ] Graceful fallback when docs not available (state clearly + provide general answer)

#### 7.3.2 Phase 2: Semantic Search with Vector Embeddings

**Requirements**:
- [ ] **Vector Embeddings**:
  - Generate embeddings for all doc passages using lightweight model (e.g., all-MiniLM-L6-v2)
  - Store embeddings in local vector DB (e.g., vectra, in-memory HNSW)
  - Embed user queries at runtime for semantic similarity search
  - Retrieve top K similar passages (K=3-5) with relevance scores

- [ ] **Enhanced Retrieval**:
  - Hybrid search: combine keyword + semantic similarity
  - Re-rank results by relevance score
  - Cache frequent query embeddings
  - Support multi-turn context (remember previous Q&A in conversation)

- [ ] **Expanded Documentation**:
  - Add MySQL/MariaDB replication docs
  - Add performance_schema and sys schema reference
  - Add common error codes with solutions
  - Add version migration guides (5.7→8.0, MySQL→MariaDB)
  - ~15MB total (still lightweight)

- [ ] **Performance Optimization**:
  - Lazy-load doc embeddings (on-demand)
  - LRU cache for retrieved passages
  - Background indexing (don't block extension activation)

**Acceptance Criteria**:
- [ ] Semantic search finds relevant docs even with paraphrased queries
- [ ] Retrieval latency < 500ms (including embedding generation)
- [ ] Cache hit rate > 60% for common queries

#### 7.3.3 Phase 3: Live Documentation & Community Knowledge

**Requirements**:
- [ ] **Live Documentation Fallback**:
  - Query dev.mysql.com and mariadb.com docs in real-time for edge cases
  - Parse and extract relevant sections
  - Cache results locally for 30 days

- [ ] **Community Knowledge Base**:
  - Curated Stack Overflow Q&A (top 500 MySQL questions)
  - Percona blog articles (best practices)
  - Community-contributed patterns
  - User can flag incorrect/outdated information

- [ ] **Version Update Mechanism**:
  - Background check for new doc versions
  - Download and index incrementally
  - Notify user when updates available

**Acceptance Criteria**:
- [ ] Live fallback finds docs for 95%+ of queries not in embedded docs
- [ ] Community knowledge covers common pitfalls not in official docs

---

### 7.4 AI Safety and Privacy

- [ ] User consent for AI features
- [ ] Option to disable AI completely
- [ ] Data minimization in prompts (no sensitive data)
- [ ] Query anonymization option
- [ ] Local inference option (future)
- [ ] Transparency in AI suggestions (show confidence levels)
 - [ ] Do not include PII, secrets, or full schema names in prompts unless user explicitly enables it
 - [ ] Provide per-suggestion risk banner when schema/index changes are proposed
 - [ ] RAG system only sends doc excerpts + anonymized context to AI (never full database dumps)

---

## 8. Configuration and Settings

### Extension Settings

```typescript
{
  "mydba.autoRefresh": {
    "type": "boolean",
    "default": true,
    "description": "Automatically refresh metrics and process list"
  },
  "mydba.refreshInterval": {
    "type": "number",
    "default": 5000,
    "description": "Auto-refresh interval in milliseconds"
  },
  "mydba.slowQueryThreshold": {
    "type": "number",
    "default": 10,
    "description": "Threshold in seconds for slow query highlighting"
  },
  // Deprecated: use mydba.ai.enabled instead
  // "mydba.enableAI": {
  //   "type": "boolean",
  //   "default": true,
  //   "description": "Enable AI-powered features"
  // },
  "mydba.aiProvider": {
    "type": "string",
    "enum": ["vscode", "copilot"],
    "default": "vscode",
    "description": "AI provider to use"
  },
  "mydba.maxConnections": {
    "type": "number",
    "default": 5,
    "description": "Maximum number of simultaneous connections"
  },
  "mydba.queryTimeout": {
    "type": "number",
    "default": 30000,
    "description": "Query execution timeout in milliseconds"
  },
  "mydba.dashboard.metrics": {
    "type": "array",
    "default": ["cpu", "memory", "qps", "connections"],
    "description": "Metrics to display on dashboard"
  },
  "mydba.locale": {
    "type": "string",
    "default": "en",
    "description": "UI language (future multi-language support)"
  },

  // Privacy & Security Settings
  "mydba.ai.enabled": {
    "type": "boolean",
    "default": false,
    "description": "Enable AI features (requires explicit opt-in)"
  },
  "mydba.ai.anonymizeData": {
    "type": "boolean",
    "default": true,
    "description": "Anonymize data before sending to AI (mask literals, table names)"
  },
  "mydba.ai.allowSchemaContext": {
    "type": "boolean",
    "default": true,
    "description": "Include schema metadata in AI prompts for better suggestions"
  },
  "mydba.ai.allowQueryHistory": {
    "type": "boolean",
    "default": false,
    "description": "Use recent queries as context for AI analysis"
  },
  "mydba.ai.chatEnabled": {
    "type": "boolean",
    "default": true,
    "description": "Enable @mydba chat participant (requires mydba.ai.enabled)"
  },
  "mydba.ai.confirmBeforeSend": {
    "type": "boolean",
    "default": false,
    "description": "Prompt for confirmation before sending data to AI"
  },
  "mydba.telemetry.enabled": {
    "type": "boolean",
    "default": false,
    "description": "Share anonymous usage analytics (opt-in only)"
  },
  "mydba.security.warnSensitiveColumns": {
    "type": "boolean",
    "default": true,
    "description": "Warn when query results may contain sensitive data"
  },
  "mydba.security.redactSensitiveColumns": {
    "type": "boolean",
    "default": false,
    "description": "Automatically redact columns like 'password', 'ssn', 'api_key'"
  },
  "mydba.network.showActivityLog": {
    "type": "boolean",
    "default": true,
    "description": "Log all network requests in Output panel for transparency"
  }
  ,
  "mydba.confirmDestructiveOperations": {
    "type": "boolean",
    "default": true,
    "description": "Require confirmation for DROP/TRUNCATE/DELETE/UPDATE (configurable)"
  },
  "mydba.warnMissingWhereClause": {
    "type": "boolean",
    "default": true,
    "description": "Warn when UPDATE/DELETE statements lack a WHERE clause"
  },
  "mydba.dryRunMode": {
    "type": "boolean",
    "default": false,
    "description": "Preview queries and affected rows without executing"
  },
  "mydba.safeMode": {
    "type": "boolean",
    "default": true,
    "description": "Enable human-error guardrails (stricter checks and confirmations)"
  },
  "mydba.risk.rowEstimateWarnThreshold": {
    "type": "number",
    "default": 100000,
    "description": "Warn when EXPLAIN estimates exceed this number of rows"
  },
  "mydba.onboarding.showDisclaimer": {
    "type": "boolean",
    "default": true,
    "description": "Show onboarding disclaimer about dev/test focus and prod risk assessment"
  },
  "mydba.defaultEnvironment": {
    "type": "string",
    "enum": ["dev", "staging", "prod"],
    "default": "dev",
    "description": "Default environment assigned to new connections (affects guardrails)"
  },
  "mydba.preview.maxRows": {
    "type": "number",
    "default": 1000,
    "description": "Maximum rows returned in previews (SELECT samples, data viewers)"
  },
  "mydba.dml.maxAffectRows": {
    "type": "number",
    "default": 1000,
    "description": "Block or escalate confirmation if DML would affect more than this many rows"
  }
}
```

---

## 9. Development Roadmap

**Current Status:** Phase 1.5 Complete (v1.3 release ready - November 8, 2025)

**Roadmap Overview:**
- **Phase 1 (MVP):** ✅ COMPLETE - Core MySQL/MariaDB support with AI-powered query optimization, chat integration, and comprehensive monitoring
- **Phase 1.5 (Production Readiness):** ✅ COMPLETE - 39% test coverage, event-driven architecture, audit logging
- **Phase 2 (Advanced Features):** ⏳ IN PROGRESS - Milestones 5 & 6 complete (Visual Query Analysis, Conversational AI). Milestones 7-9 planned for Q1-Q2 2026
- **Phase 3 (Multi-Database):** 📅 PLANNED - PostgreSQL, Redis/Valkey support (Q2-Q3 2026)
- **Phase 4 (Production & Enterprise):** 📅 PLANNED - Advanced monitoring (InnoDB/Aria, Replication), connection enhancements, enterprise features (Q3-Q4 2026)

For detailed milestone breakdown, see:
- Section 4.1 (Phase 1 Features)
- Section 4.2 (Phase 2 Features)
- Section 4.3 (Phase 3 Features - Future)
- Section 4.4 (Phase 4 Features - Future)
- `docs/PRODUCT_ROADMAP.md` for detailed implementation tracking and time estimates

---

## 10. Testing Strategy

### Unit Tests
- Core business logic
- Database adapters
- Query parsers
- AI prompt generators
- **RAG system**:
  - Doc retrieval accuracy (keyword and semantic)
  - Citation extraction and formatting
  - Version detection logic
- **Chat API**:
  - Intent parser for natural language queries
  - Slash command routing and parameter extraction
  - Conversation context management and pruning
  - Response formatting (markdown, code blocks, buttons)
  - Query detection regex patterns for different file types

### Integration Tests
- Database connections
- Query execution
- Metrics collection
- Real MySQL/MariaDB instances in Docker
 - Docker Compose matrix for MySQL 5.7, 8.0, MariaDB 10.11, 11.x

### E2E Tests
- User workflows
- Extension activation
- UI interactions
- Command execution
 - Golden tests for EXPLAIN output parsing across MySQL/MariaDB versions
- **RAG workflows**:
  - Variable explanation with citation display
  - Doc source linking to official pages
  - Version-aware doc selection (8.0 vs 5.7 differences)
- **Chat Integration workflows**:
  - @mydba participant registration and discovery
  - Slash command execution (/analyze, /explain, /processlist, etc.)
  - Natural language query understanding and intent parsing
  - Multi-turn conversation context retention (10+ turns)
  - Interactive button clicks trigger correct actions
  - Query detection in open editor files
  - Graceful error handling when database disconnected

- **Safety workflows**:
  - Safe Mode blocks/guards high-risk operations in `prod`
  - Missing-WHERE warnings for UPDATE/DELETE
  - Dry-run preview shows affected row estimates
  - Double-confirmation flow for destructive AI suggestions
  - Onboarding disclaimer modal requires acknowledgment when marking a connection as `prod`
  - Previews capped at 1,000 rows by default; DML > 1,000 rows triggers block/override flow (blocked in `prod`)

### Performance Tests
- Large database handling (10,000+ tables)
- Concurrent query execution
- Memory leak detection
- UI responsiveness

### Security Tests
- Credential storage
- SQL injection prevention
- XSS in webviews
- Permission handling
 - Fuzz tests for prompt anonymization/masking routines

---

## 11. Documentation Requirements

### User Documentation
- [ ] Installation guide
- [ ] Getting started tutorial
- [ ] Connection setup guide
- [ ] Feature walkthroughs
- [ ] AI feature guide
- [ ] Troubleshooting guide
- [ ] FAQ

### Developer Documentation
- [ ] Architecture overview
- [ ] Contributing guide
- [ ] API documentation
- [ ] Database adapter interface
- [ ] AI integration guide
- [ ] Testing guide

### In-App Documentation
- [ ] Tooltips and hints
- [ ] Interactive tutorials
- [ ] Contextual help
- [ ] AI-generated explanations

---

## 12. Success Criteria

### Launch Criteria (V1.0)
- [ ] All Phase 1 features implemented
- [ ] Test coverage > 80%
- [ ] Zero critical bugs
- [ ] Documentation complete
- [ ] Performance requirements met
- [ ] Security audit passed

### Post-Launch Metrics (First 6 Months)
- 5,000-7,500 active installations (revised from 10K based on realistic market penetration for niche tools)
- Average rating > 4.0 stars
- < 5% crash rate
- Monthly active users retention > 60%
- Positive community feedback
 - At least 25 community contributions (issues/PRs) as an OSS project

### Feature Adoption
- 80% of users connect at least one database
- 50% of users use AI optimization features
- 40% of users use dashboard regularly
- 30% of users explore process list and variables

---

## 13. Risks and Mitigations

### Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| VSCode AI API limitations | High | Medium | Build fallback to direct LLM integration |
| Database driver compatibility issues | High | Medium | Extensive testing across versions |
| Performance with large databases | Medium | High | Implement pagination and lazy loading |
| Security vulnerabilities | High | Low | Regular security audits, use established libraries |
| Extension marketplace approval delays | Medium | Medium | Follow guidelines strictly, prepare early |
| VSCode marketplace rejection | High | Low | Pre-review guidelines checklist; avoid trademarked terms; include clear privacy policy; test on Windows/Mac/Linux |
| OS metrics availability | Medium | Medium | Support Prometheus/node_exporter or SSH sampling; otherwise limit to DB-native metrics |
| Limited privileges on managed DBs | Medium | High | Use performance_schema/sys alternatives; clearly document minimum privileges |

### Business Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Low user adoption | High | Medium | Focus on UX, marketing, tutorials |
| Competition from existing tools | Medium | High | Differentiate with AI features |
| AI costs too high | Medium | Low | Implement rate limiting, optional AI features |
| Negative user feedback | Medium | Low | Beta testing, iterative development |

---

## 14. Future Enhancements

### Phase 4 and Beyond

**Advanced Analytics**:
- Predictive performance modeling
- Anomaly detection using ML
- Capacity planning recommendations

**Collaboration Features**:
- Shared connection profiles
- Team dashboards
- Annotation and commenting on queries

**Cloud Integration**:
- AWS RDS support
- Azure Database support
- Google Cloud SQL support
- Direct cloud metrics integration

**Advanced AI Features**:
- Natural language query generation
- Automated schema design suggestions
- Intelligent data migration planning
- AI-powered backup and recovery guidance

**Developer Experience**:
- ORM integration (Prisma, TypeORM, etc.)
- Query builder UI
- Schema version control
- Database change management
 - Non-goals (MVP): Backup/restore orchestration; full migration runners; data masking pipelines

**Enterprise Features**:
- Role-based access control
- Audit logging
- Compliance reporting
- Multi-tenant support (All remain free and open-source under Apache 2.0, with community-driven development.)

---

## 15. References

**Note:** Market analysis, competitive landscape, and feature comparison matrix have been moved to `docs/APPENDIX.md` for better organization.

### Technology Stack

- [VSCode Extension API](https://code.visualstudio.com/api)
- [VSCode Language Model API](https://code.visualstudio.com/api/extension-guides/language-model)
- [MySQL Documentation](https://dev.mysql.com/doc/)
- [MariaDB Documentation](https://mariadb.com/kb/en/)
- [mysql2 NPM Package](https://www.npmjs.com/package/mysql2)
- [Apache 2.0 License](https://www.apache.org/licenses/LICENSE-2.0) (Project license for open-source distribution)

### Additional Documentation

- `docs/APPENDIX.md` - Market analysis, feature comparison matrix, competitive landscape
- `docs/PRODUCT_ROADMAP.md` - Detailed milestone tracking and implementation status
- `docs/DATABASE_SETUP.md` - Database configuration guide
- `docs/VERSIONING.md` - Version management and release strategy

---

## 16. Inspiration: vscode-kafka-client

Key features to emulate:
- Clean tree view navigation
- Real-time monitoring capabilities
- Integrated tooling within VSCode
- Good UX for configuration management

Improvements over kafka-client:
- AI-powered insights
- More comprehensive dashboards
- Better educational content
- Proactive issue detection

---

## Document Version History

| Version | Date | Author | Changes |
| --- | --- | --- | --- |
| 1.0 | 2025-10-25 | Initial | Initial PRD creation |
| 1.1 | 2025-10-25 | AI Assistant | Incorporated market analysis, feature comparison matrix, and standardized requirements formatting |
| 1.2 | 2025-10-25 | AI Assistant | Added feasibility notes, acceptance criteria, privacy/a11y/i18n, non-goals, testing, and OSS messaging |
| 1.3 | 2025-10-25 | Product Owner + AI Assistant | Scope refinement: moved host metrics and advanced AI to Phase 2; updated success metrics with baselines; added marketplace rejection risk; added "Why Now?" market section |
| 1.4 | 2025-10-25 | AI Assistant | Added Documentation-Grounded AI (RAG) system to reduce hallucinations and increase trustworthiness; keyword-based in Phase 1, semantic search in Phase 2, community knowledge in Phase 3 |
| 1.5 | 2025-10-25 | AI Assistant | Added VSCode Chat Integration (@mydba participant) to Phase 1 MVP (section 4.1.9); updated Milestone 4 and testing strategy with chat-specific requirements |
| 1.6 | 2025-10-25 | AI Assistant | Major privacy update: Added comprehensive Section 5.4 "Data Privacy & Protection" with 8 subsections covering local-first architecture, AI privacy controls, credential security, GDPR compliance, telemetry opt-in, and privacy-by-design principles. Updated configuration settings with 10 new privacy/security options. |
| 1.6.1 | 2025-10-25 | AI Assistant | Privacy enhancement: Updated anonymization strategy from simple masking (*** ) to query templating (<table:name>, <col:name>, ?) to preserve structure while protecting values. Updated PRD section 5.4.2, 5.4.8 and PRIVACY.md. |
| 1.7 | 2025-10-25 | Product Owner + AI Assistant | Percona Toolkit integration: Added 6 low/medium-effort features inspired by Percona tools (Duplicate/Unused Index Detector, Variable Advisor, Replication Lag Monitor, Config Diff, Online Schema Change Guidance). Updated Phase 1 (+2 features, +5 days) and Phase 2 (+4 features, +10 days). |
| 1.8 | 2025-10-25 | AI Assistant | Visual EXPLAIN Plan Viewer: Added comprehensive visual query execution plan feature with tree diagrams, AI-powered pain point highlighting, color-coded severity, one-click fixes, and before/after comparison. Inspired by `pt-visual-explain`. Added D3.js/Mermaid.js to tech stack and UI mockup to Section 6.2. |
| 1.9 | 2025-10-25 | AI Assistant | Query Profiling & Execution Analysis: Added MySQL 8.0+ Performance Schema profiling (official recommended approach per [MySQL docs](https://dev.mysql.com/doc/refman/8.4/en/performance-schema-query-profiling.html)) using `events_statements_history_long` and `events_stages_history_long` with `NESTING_EVENT_ID` linking. Includes automatic Performance Schema setup, waterfall timeline charts, stage breakdown, MariaDB Optimizer Trace, and database-specific adapter architecture. Added `/profile` chat command and Profiling Timeline UI mockup. Added Plotly.js to tech stack. PostgreSQL and Redis profiling adapters planned for Phase 3. |
| 1.10 | 2025-10-25 | AI Assistant | Version Support Policy: Restricted support to MySQL 8.0+ and MariaDB 10.6+ (GA versions only). Added Section 5.0 "Supported Database Versions" with version detection, EOL warnings for MySQL 5.7/5.6 and MariaDB 10.4/10.5, and feature compatibility checks. Removed legacy `SHOW PROFILE` fallback for MySQL 5.7. Updated tech stack to specify `mysql2` driver for MySQL 8.0+ and MariaDB 10.6+. |
| 1.11 | 2025-10-26 | AI Assistant | **Major Implementation Update**: Added comprehensive Section 7 "Implementation Status & Progress" documenting 75% completion of Phase 1 MVP. Completed: Foundation (100%), Core UI (95%), Monitoring (60% with Chart.js dashboard). Documented all resolved technical debt (11 issues fixed), performance metrics (all targets exceeded), and security audit status. Updated roadmap showing Week 6/12 position with 6 weeks remaining to MVP. Added detailed feature completion lists, testing status, and next immediate actions. |
| 1.12 | 2025-11-07 | AI Assistant | **Phase 1 MVP Complete**: Updated PRD to reflect 100% completion of Phase 1. Added 11 new completed features: Process List lock status badges (🔒 Blocked, ⛔ Blocking, 🔐 Active), Query History Panel, Enhanced AI Citations ([Citation X] format), Docker test environment, macOS testing support, Query Deanonymizer, and code quality improvements. Updated Section 7.3 "Recently Completed" with detailed feature descriptions. Updated Section 4.1.3 (Process List) and 4.2.3 (Query Execution) with completion status. Updated Section 7.3.1 (RAG) to reflect citation format implementation. Updated Milestone 4 AI Integration status to 100% complete. |
| 1.13 | 2025-11-07 | Product Owner + AI Assistant | **Phase 2 Feature Additions**: Added two new high-priority Phase 2 features: (1) **InnoDB Status Monitor** (Section 4.2.10) - Comprehensive `SHOW ENGINE INNODB STATUS` viewer with AI-powered diagnostics for transactions, history list, deadlocks, buffer pool, I/O operations, and semaphores. Includes transaction history viewer, deadlock analyzer with visual graphs, health checks, and trending. (2) **Enhanced Replication Status Monitor** (Section 4.2.7) - Expanded from basic lag monitoring to comprehensive `SHOW REPLICA STATUS` dashboard with AI diagnostics for replication issues, GTID tracking, thread control actions, and multi-replica support. Updated Database Explorer tree structure (Section 4.1.2) to include both new system views. |
| 1.14 | 2025-11-08 | Senior Software Engineer + Product Owner | **PRD Cleanup & Phase 3/4 Planning**: Comprehensive cleanup aligned with codebase reality. (1) Codebase validation: Verified all COMPLETE markers against src/ directory (EventBus/AuditLogger wired, @mydba chat implemented, 23 services confirmed). (2) Accuracy corrections: Fixed Phase 1.5 metrics (39% coverage achieved, not 70% target), marked SSH/RDS/Azure auth as DEFERRED TO PHASE 4 (Milestone 24), marked InnoDB/Replication monitors as DEFERRED TO PHASE 4 (Milestones 22-23, specs complete but no implementation). (3) Removed duplications: Deleted Section 4.1.12 (Phase 1.5 implementation details, ~60 lines), deleted duplicate Section 7 (Implementation Status & Progress, ~570 lines), consolidated Section 9 (Development Roadmap to high-level overview). (4) Phase 3 plan: Added PostgreSQL Core/Advanced (M18-19), Redis/Valkey (M20), Multi-DB Management (M21), 70-93h, Q2-Q3 2026. (5) Phase 4 plan: Added Storage Engine Monitor covering InnoDB + Aria (M22, 30-40h), Replication Monitor (M23, 20-25h), Connection Enhancements (M24, 3-5h), Percona Toolkit features (M25, 10-15h), Enterprise Foundation (M26, 10-15h), 73-100h, Q3-Q4 2026. (6) Updated Executive Summary with current phase, accurate metrics (39% coverage, 803 tests, v1.3 ready), and Phase 2 status (Milestones 5 & 6 complete). (7) MariaDB Aria engine support added to Phase 4 for storage engine monitoring differentiation. Document reduced from ~3435 lines to ~2840 lines through duplication removal while maintaining all requirement specifications. |
| 1.15 | 2025-11-08 | Product Owner | **Appendix Extraction**: Moved Section 15 (Market Analysis & Feature Comparison) to separate `docs/APPENDIX.md` document (~312 lines). Replaced with streamlined References section pointing to technology stack and additional documentation. Document reduced from ~2811 lines to ~2510 lines. Improved document focus on requirements vs. market analysis. Renamed Section 15 to "References" and Section 16 to "Inspiration: vscode-kafka-client". All market analysis, competitive landscape, feature comparison matrix, and detailed competitive advantages now in standalone appendix for easier maintenance and updates. |

---

## Approval and Sign-off

This document requires approval from:
- [x] Product Owner (**Approved with conditions - v1.3 scope refinements applied**)
- [ ] Technical Lead
- [ ] UX Designer
- [ ] Security Team

**Document Status**: Draft → **Approved for Development (v1.3)**
**Next Review Date**: Post-Beta (Week 21)
