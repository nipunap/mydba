# Product Requirements Document: MyDBA - AI-Powered Database Assistant

## Executive Summary

MyDBA is an AI-powered VSCode extension designed to assist developers and database administrators in managing, monitoring, and optimizing database performance. The extension provides intelligent insights, query optimization suggestions, and comprehensive database monitoring capabilities directly within the VSCode environment.

**Initial Focus**: MySQL/MariaDB
**Future Support**: PostgreSQL, Redis, Valkey

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

**Requirements**:
- [ ] Support for multiple simultaneous database connections
- [ ] Secure credential storage using VSCode's SecretStorage API
- [ ] Connection profiles with saved configurations
- [ ] Support for SSH tunneling
- [ ] SSL/TLS connection support
- [ ] Connection status indicators
- [ ] Quick connection switching
- [ ] **AWS RDS/Aurora IAM Authentication**:
  - Detect AWS RDS/Aurora endpoints (pattern: `*.rds.amazonaws.com`, `*.cluster-*.rds.amazonaws.com`)
  - Generate temporary password using AWS IAM authentication tokens
  - Support AWS credential sources: environment variables, shared credentials file (`~/.aws/credentials`), IAM roles (EC2/ECS), AWS SSO
  - Auto-refresh tokens before expiration (15-minute token lifetime)
  - UI option: "Use AWS IAM Authentication" checkbox in connection dialog
  - Validate IAM permissions: `rds-db:connect` for the database resource
  - Regional endpoint support (e.g., `us-east-1.rds.amazonaws.com`)
- [ ] Onboarding disclaimer and environment selection:
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

**Requirements**:
- [ ] Hierarchical tree structure:
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
  │   ├── Session Variables
  │   ├── Global Variables
  │   └── Status Variables
  └── Performance Metrics
      ├── Host Dashboard
      └── Database Metrics
  ```
- [ ] Expandable/collapsible nodes
- [ ] Right-click context menus for actions
- [ ] Search functionality within tree
- [ ] Refresh capabilities at each level
- [ ] Visual indicators for table types (InnoDB, MyISAM, etc.)

**User Stories**:
- As a developer, I want to browse database structure in a tree view so I can quickly navigate to tables and views
- As a DBA, I want to see all tables with their storage engines so I can identify optimization opportunities

#### 4.1.3 Process List Monitoring

**Feature**: Real-time Process Monitoring

**Requirements**:
- [ ] Display active MySQL processes (SHOW PROCESSLIST)
- [ ] Columns: ID, User, Host, Database, Command, Time, State, Info (Query)
- [ ] Auto-refresh capability (configurable interval)
- [ ] Filtering by user, database, command type, duration
- [ ] Kill process capability with confirmation
- [ ] Export to CSV
- [ ] Highlight long-running queries (configurable threshold)
- [ ] Query preview on hover
 - [ ] Group processes by active transaction (when available)
   - Cross-compatible: `information_schema.PROCESSLIST` ↔ `information_schema.INNODB_TRX` on `trx_mysql_thread_id`
   - MySQL 8.0+: optionally enrich with `performance_schema.events_transactions_current/history*` joined via `performance_schema.threads.THREAD_ID` and mapped to process via `PROCESSLIST_ID`
   - Show groups: one node per `trx_id` with state/age; include sessions not in a transaction under "No Active Transaction"
   - Optional lock insight: show waiting/blocked indicators using `performance_schema.data_locks` (MySQL) or `information_schema.INNODB_LOCKS/LOCK_WAITS` (MariaDB)

**User Stories**:
- As a DBA, I want to see all active processes so I can identify problematic queries
- As a developer, I want to kill my own stuck queries so I can free up resources
- As a DBA, I want to filter processes by duration so I can focus on long-running queries
 - As a DBA, I want processes grouped by transaction so I can quickly assess long-running or blocking transactions

#### 4.1.4 Queries Without Indexes

**Feature**: Unindexed Query Detection & Index Health

**Requirements**:
- [ ] Display queries from slow query log that don't use indexes
- [ ] Show queries with full table scans
- [ ] Display query execution count and average time
- [ ] Link to AI-powered optimization suggestions
- [ ] Ability to EXPLAIN query directly
- [ ] Show affected tables and suggest indexes
- [ ] Export findings to report
- [ ] **Duplicate/Redundant Index Detector** (Inspired by Percona `pt-duplicate-key-checker`):
  - Scan schema for redundant indexes (e.g., `idx_user` when `idx_user_email` exists)
  - Query `information_schema.STATISTICS` to compare index columns
  - AI suggestion: "Index X is redundant; Index Y covers it. Safe to drop."
  - Show storage savings and write performance impact
- [ ] **Unused Index Tracker** (Inspired by Percona `pt-index-usage`):
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

**Requirements**:
- [ ] Display session variables
- [ ] Display global variables
- [ ] Search and filter capabilities
- [ ] Show variable descriptions and documentation
- [ ] Highlight variables that differ from defaults
- [ ] AI-powered recommendations for optimization
- [ ] Compare current values with recommended values
- [ ] Categorize variables (Memory, InnoDB, Replication, etc.)
- [ ] Show variable change history (if available)
- [ ] **Variable Advisor Rules** (Inspired by Percona `pt-variable-advisor`):
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

**Requirements**:
- [ ] Webview for each database object type
- [ ] AI-powered explanations of:
  - Table structure and relationships
  - Index effectiveness
  - Query execution plans
  - Configuration variables
  - Performance metrics
- [ ] Interactive tutorials
- [ ] Code examples and best practices
- [ ] Links to official documentation
- [ ] Copy-to-clipboard functionality

**User Stories**:
- As a developer, I want explanations of complex database concepts so I can learn while working
- As a junior DBA, I want to understand what each variable does before changing it
- As a user, I want to see examples of how to optimize specific query patterns

#### 4.1.7 Performance Dashboards

**Feature**: Database-Level Metrics Dashboard

**Requirements**:
- [ ] Real-time metrics display (DB-native only in MVP):
  - Connection count
  - Queries per second
  - Slow query count
  - Thread usage
  - Buffer pool usage (InnoDB)
  - Table cache hit rate
  - Query cache hit rate (if enabled)
- [ ] Historical data visualization (charts)
- [ ] Configurable time ranges
- [ ] Alert thresholds with visual indicators
- [ ] Export metrics data
- [ ] Acceptance criteria: initial load < 2s on 100 databases; filter latency < 200ms; time range change < 500ms (with caching)
- [ ] **MVP Scope Note**: OS-level metrics (CPU/Memory/Disk/Network I/O) moved to Phase 2; require external sources (Prometheus/node_exporter, SSH sampling, or cloud provider APIs)

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

**Requirements**:
- [ ] Integration with VSCode AI/Copilot features
- [ ] Query analysis capabilities (MVP scope):
  - Parse and understand SQL queries
  - Identify performance bottlenecks
  - Suggest index additions
  - Recommend query rewrites
  - Explain execution plans in plain language
- [ ] **Visual EXPLAIN Plan Viewer** (Inspired by Percona `pt-visual-explain`):
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
- [ ] **Query Profiling & Execution Analysis** (MySQL/MariaDB):
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
- [ ] **AI EXPLAIN Interpretation**:
  - Natural language summary: "This query scans 145,000 rows from `orders` without an index. Expected time: 2.3s."
  - Step-by-step walkthrough: "Step 1: Scan `orders` table (145K rows). Step 2: For each row, lookup `users` by PRIMARY key."
  - Performance prediction: "Current: ~2.3s. With index on `orders.user_id`: ~0.05s (46x faster)."
  - RAG citations: Link to MySQL docs on index types, join algorithms, filesort
  - **Profiling AI Insights**:
    - "85% of time spent in 'Sending data' stage due to full table scan."
    - "Optimizer rejected index `idx_status` (selectivity too low: 90% of rows match)."
    - "Temporary table created (256KB) for filesort. Consider covering index to avoid."
- [ ] **One-Click Fixes**:
  - Generate index DDL: `CREATE INDEX idx_user_id ON orders(user_id);`
  - Show "Apply Index" button (with Safe Mode confirmation)
  - Alternative query rewrites: "Rewrite using EXISTS instead of IN?"
  - Before/after EXPLAIN comparison side-by-side
  - Before/after profiling comparison: Show time reduction in each stage
- [ ] Auto-complete for database objects
- [ ] Inline optimization suggestions (like code linting)
- [ ] Before/after performance comparison
- [ ] Query complexity scoring (1-10 scale: table scans, joins, subqueries)
- [ ] Best practices validation
 - [ ] Safety: never auto-apply destructive changes; require confirmation and offer rollback steps for index/schema suggestions
 - [ ] Output must include expected impact (e.g., estimated rows scanned/time improvement) and key assumptions
 - [ ] **MVP Scope Note**: AI-powered variable recommendations and full webview AI content deferred to Phase 2; MVP focuses on query EXPLAIN analysis and optimization suggestions
 - [ ] **Fallback Strategy**: If VSCode LM API unavailable or rate-limited, provide static optimization rules (e.g., SELECT * warnings, missing index detection)

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
- [ ] Visual EXPLAIN renders for `EXPLAIN` and `EXPLAIN FORMAT=JSON` within 300ms (p95) for plans ≤ 25 nodes
- [ ] Pain points (full scan/filesort/temp table/high rows) are highlighted with color, icon and text (A11y compliant)
- [ ] Keyboard navigation supports traversing all nodes; tooltips accessible via keyboard
- [ ] Large plans auto-collapse low-impact subtrees; user can expand on demand
- [ ] Profiling timeline shows stage breakdown sourced from Performance Schema; renders within 300ms (p95)
- [ ] AI insights include at least one citation (doc link) per root-cause explanation
- [ ] “Apply Index” is blocked in `prod` unless double-confirmation is completed; prompt supports optional change-ticket URL
- [ ] “Before/After” runs EXPLAIN diff and shows changes to `type`, `rows`, `filtered%`
- [ ] Profiling overhead budget documented and verified: ≤ 2% CPU overhead on sample workload

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

**Objective**: Provide natural language interface for database operations, making MyDBA accessible through VSCode's native chat panel alongside GitHub Copilot and other AI assistants.

**Requirements**:
- [ ] **Chat Participant Registration**:
  - Register `@mydba` chat participant in VSCode
  - Display in chat participant selector with database icon
  - Provide description: "AI-powered MySQL/MariaDB database assistant"

- [ ] **Slash Commands** (5-8 core commands for MVP):
  - `/analyze <query>` - Analyze SQL query performance with EXPLAIN
  - `/explain <query>` - Show detailed EXPLAIN output with AI interpretation
  - `/profile <query>` - Run query profiling with stage breakdown and waterfall chart
  - `/processlist` - Display active database processes
  - `/variables <name>` - Explain system variable with documentation
  - `/optimize <table>` - Suggest table optimization strategies
  - `/connections` - Show current database connections status
  - `/help` - Display available commands and usage examples

- [ ] **Natural Language Understanding**:
  - Parse user intent from conversational queries
  - Support common questions:
    - "Why is my query slow?"
    - "How do I find missing indexes?"
    - "What does [variable name] do?"
    - "Show me slow queries"
    - "How can I optimize this table?"
  - Context detection from open editor files (detect SQL queries)

- [ ] **RAG Integration**:
  - All chat responses grounded in MySQL/MariaDB documentation
  - Display inline citations with 📖 icon
  - Link to official docs in chat messages
  - Version-aware responses based on connected database

- [ ] **Multi-Turn Conversations**:
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

- [ ] **Interactive Elements**:
  - Markdown-formatted responses with code blocks
  - Interactive buttons:
    - "Open in Panel" - Open related view in sidebar
    - "Apply Fix" - Apply suggested optimization
    - "Show EXPLAIN" - Display detailed execution plan
    - "Create Index" - Generate and review index DDL
  - Response streaming for real-time feedback
  - Progress indicators for long operations

- [ ] **Code Editor Integration**:
  - Detect SQL queries in active editor
  - Offer to analyze selected query
  - Insert optimized query at cursor position
  - Highlight problematic query patterns

- [ ] **Error Handling**:
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

**Objective**: Prevent accidental data loss by requiring confirmation, warnings, and previews for risky operations.

**Requirements**:
- [ ] Confirmation dialog for `DROP`, `TRUNCATE`, `DELETE`, and `UPDATE` (configurable per operation)
- [ ] Warning when `UPDATE`/`DELETE` lack a `WHERE` clause
- [ ] Dry-run preview: show estimated affected rows and generated SQL before execution
- [ ] Environment awareness: option to enforce stricter rules for connections marked as "production"
- [ ] Audit log entry for all destructive operations (operation type, table, row estimate, user, timestamp)
- [ ] Integration with @mydba chat: proposals to run destructive commands must include a safety summary and require explicit confirmation
 - [ ] Default caps: previews limited to 1,000 rows; DML affecting more than 1,000 rows requires explicit override (blocked by default in `prod`)

**Settings**:
- `mydba.confirmDestructiveOperations` (default: true)
- `mydba.warnMissingWhereClause` (default: true)
- `mydba.dryRunMode` (default: false)
- `mydba.environment` = `dev` | `staging` | `prod` (optional; stricter defaults in `prod`)

**Acceptance Criteria**:
- [ ] Attempting `DELETE` without `WHERE` shows a blocking warning with option to proceed/cancel
- [ ] With dry-run enabled, executing `UPDATE` shows affected row estimate prior to execution
- [ ] In `prod` environment, destructive queries require a second-step confirmation
- [ ] All confirmed destructive operations are recorded in the audit log

---

#### 4.1.11 Human Error Minimization (Safe Mode)

**Feature**: Safe Mode, SQL Risk Analyzer, and Guardrails

**Objective**: Empower developers/junior DBAs/DBAs with assisted AI while minimizing human errors through defaults, preflight checks, and explain-first flows.

**Requirements**:
- [ ] Safe Mode enabled by default (stricter confirmations, blocker on high-risk operations)
- [ ] SQL Risk Analyzer (static rules):
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

**Requirements**:
- [ ] AI-powered variable recommendations
- [ ] AI-generated webview educational content
- [ ] Configuration optimization suggestions based on workload analysis
- [ ] Natural language explanations for complex database concepts
- [ ] **RAG Enhancements - Semantic Search**:
  - [ ] Vector embeddings for all documentation passages
  - [ ] Semantic similarity search (vs. keyword-only)
  - [ ] Hybrid search combining keywords + embeddings
  - [ ] Expanded doc coverage (~15MB): replication, performance_schema, error codes
  - [ ] Query embedding cache and LRU eviction
  - [ ] Multi-turn conversation context support

#### 4.2.3 Query Execution Environment

**Requirements**:
- [ ] Built-in SQL editor with syntax highlighting
- [ ] Execute queries and view results
- [ ] Query history
- [ ] Query templates
- [ ] Result export (CSV, JSON, SQL)
- [ ] Query execution plan visualization
 - [ ] Acceptance criteria: editor opens < 300ms; run shortcut latency < 150ms (network excluded); export completes < 2s for 50k rows

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

#### 4.2.7 Replication Lag Monitor (Inspired by Percona `pt-heartbeat`) [Low]

**Requirements**:
- [ ] Query `SHOW REPLICA STATUS` (MySQL 8.0) or `SHOW SLAVE STATUS` (MariaDB)
- [ ] Display `Seconds_Behind_Master` for each replica in dashboard
- [ ] Visual indicators: Green (< 5s), Yellow (5-30s), Red (> 30s)
- [ ] Alert when lag exceeds configurable threshold (default: 60s)
- [ ] Historical lag chart (last 1 hour)
- [ ] AI diagnosis: "Replica lag spike at 14:23. Check network, disk I/O, or `binlog_format`."

**User Stories**:
- As a DBA managing replicas, I want real-time lag visibility
- As a DevOps engineer, I want alerts when replicas fall behind

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

**AI Integration**:
- VSCode Language Model API
- VSCode Copilot Chat API (for conversational interface)
- **RAG (Retrieval-Augmented Generation)**:
  - TF-IDF or natural (Node.js NLP library) for keyword-based doc search (Phase 1)
  - Vectra or hnswlib-node for vector embeddings storage (Phase 2)
  - transformers.js or @xenova/transformers for local embeddings (Phase 2)
  - Cheerio or jsdom for live doc parsing (Phase 3)

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

#### 7.3.1 Phase 1 (MVP): Keyword-Based Documentation Retrieval

**Requirements**:
- [ ] **Embedded Documentation Bundle**:
  - Curate and bundle essential MySQL/MariaDB docs with extension (~5MB)
  - Coverage:
    - MySQL 8.0 System Variables reference (all variables)
    - MySQL 8.0 EXPLAIN output interpretation
    - MySQL 8.0 Optimization: Indexes chapter
    - MySQL 8.0 InnoDB Configuration
    - MariaDB 11.x equivalents and differences
  - Store as structured JSON with metadata (version, category, source URL)
  - Version-aware: detect user's DB version and serve matching docs

- [ ] **Keyword-Based Search**:
  - Extract keywords from user query and context (variable names, table names, SQL keywords)
  - Match against doc index using TF-IDF or simple scoring
  - Retrieve top 3-5 most relevant passages (500-1000 tokens total)
  - Return with source citations (doc section, version, official URL)

- [ ] **Prompt Enhancement**:
  - Inject retrieved docs into AI prompt with clear attribution
  - Instruct AI to prioritize doc context over general knowledge
  - Require citations in format: "According to MySQL 8.0 docs: [quote]"
  - If docs don't cover topic: AI must state "not found in official documentation"

- [ ] **UI Integration**:
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

### Milestone 1: Foundation (Weeks 1-4)
- [ ] Project setup and architecture
- [ ] Basic extension structure
- [ ] Connection manager implementation
- [ ] MySQL driver integration
- [ ] Secure credential storage

### Milestone 2: Core UI (Weeks 5-8)
- [ ] Tree view implementation
- [ ] Database explorer
- [ ] Process list view
- [ ] System variables viewer
- [ ] Basic webview panels

### Milestone 3: Monitoring (Weeks 9-12)
- [ ] Host-level dashboard
- [ ] Database metrics
- [ ] Queries without indexes detection
- [ ] Performance data collection
- [ ] Chart visualizations

### Milestone 4: AI Integration (Weeks 13-16)
- [ ] VSCode AI API integration
- [ ] Query analysis engine
- [ ] Optimization suggestion system
- [ ] Interactive explanations
- [ ] **Documentation-Grounded AI (RAG) - Phase 1**:
  - [ ] Curate and embed essential MySQL/MariaDB docs (~5MB)
  - [ ] Keyword-based doc retrieval system
  - [ ] Prompt enhancement with doc citations
  - [ ] UI for displaying sources and citations
- [ ] **VSCode Chat Integration (@mydba participant)**:
  - [ ] Register chat participant with slash commands
  - [ ] Natural language query understanding
  - [ ] Multi-turn conversation context management
  - [ ] Interactive buttons and response streaming
  - [ ] Code editor query detection and analysis

### Milestone 5: Polish and Testing (Weeks 17-20)
- [ ] Comprehensive testing
- [ ] Performance optimization
- [ ] Documentation
- [ ] Bug fixes
- [ ] User feedback integration

### Milestone 6: Beta Release (Week 21)
- [ ] Beta release to limited users
- [ ] Gather feedback
- [ ] Iterate on UX

### Milestone 7: V1.0 Release (Week 24)
- [ ] Public release
- [ ] Marketing materials
- [ ] Tutorial videos
- [ ] Community support setup

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

## 15. Appendix

### A. Inspiration: vscode-kafka-client

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

### B. Market Analysis & Feature Comparison

This comprehensive comparison positions MyDBA against leading database management tools in the market, highlighting our unique value proposition.

#### B.1 Why Now?

Several market and technology trends make this the optimal time to launch MyDBA:

1. **VSCode AI APIs Maturity (2024)**: Microsoft's Language Model API for VSCode extensions became generally available in 2024, enabling native AI integration without external dependencies.

2. **MySQL 8.0+ Adoption**: MySQL 8.0 adoption reached ~65% of production deployments (as of 2024), with performance_schema and sys schema now standard, providing rich telemetry for monitoring tools.

3. **IDE-Native Tool Preference**: Developer surveys show 78% prefer integrated tools over standalone applications (Stack Overflow Developer Survey 2024), with VSCode commanding 73% IDE market share.

4. **Remote Work & Cloud Migration**: The shift to remote development and cloud-hosted databases increased the need for lightweight, SSH-capable tools that don't require VPN or desktop apps.

5. **AI Adoption Curve**: Developers actively seeking AI-assisted tools (GitHub Copilot: 1.3M+ paid users); database optimization is a natural next frontier.

6. **Open-Source Sustainability Models**: Successful sponsor-funded OSS projects (e.g., Babel, Vite) demonstrate viability of "free + optional sponsorship" models.

**Market Window**: The combination of mature AI APIs, high MySQL 8.0 adoption, and VSCode dominance creates a 12-18 month window before larger vendors (e.g., JetBrains, Microsoft) potentially enter this space.

#### B.2 Competitive Landscape Overview

The database management tool market is diverse, ranging from heavyweight standalone applications to lightweight VSCode extensions. Current solutions can be categorized as:

1. **Standalone Database IDEs**: DBeaver, DataGrip, MySQL Workbench, Navicat, TablePlus
2. **VSCode Extensions**: SQLTools, MSSQL Extension, Database Client
3. **Cloud-Native Tools**: Azure Data Studio, AWS Database Query Editor
4. **Specialized Tools**: pgAdmin (PostgreSQL), Redis Commander

#### B.3 Detailed Feature Comparison Matrix

| Feature Category | MyDBA (Proposed) | DBeaver Ultimate | JetBrains DataGrip | MySQL Workbench | TablePlus | SQLTools (VSCode) | Azure Data Studio | Navicat Premium |
|------------------|------------------|------------------|-------------------|-----------------|-----------|-------------------|-------------------|-----------------|
| **Platform & Integration** |  |  |  |  |  |  |  |  |
| VSCode Native | ✅ Yes | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Yes | ❌ Electron-based | ❌ No |
| Cross-Platform | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Lightweight (<100MB) | ✅ Yes | ❌ No (500MB+) | ❌ No (800MB+) | ❌ No (300MB+) | ✅ Yes (50MB) | ✅ Yes | ⚠️ Medium (200MB) | ❌ No (400MB+) |
| Extension Ecosystem | ✅ VSCode Marketplace | ❌ No | ⚠️ Plugin Marketplace | ❌ Limited | ❌ No | ✅ VSCode Marketplace | ⚠️ Extensions | ❌ No |
| **Database Support** |  |  |  |  |  |  |  |  |
| MySQL/MariaDB | ✅ Deep Integration | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ⚠️ Limited | ✅ Yes |
| PostgreSQL | 🔄 Phase 3 | ✅ Yes | ✅ Yes | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Redis/Valkey | 🔄 Phase 3 | ⚠️ Limited | ⚠️ Limited | ❌ No | ✅ Yes | ❌ No | ❌ No | ✅ Yes |
| SQL Server | 🔄 Future | ✅ Yes | ✅ Yes | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| MongoDB | 🔄 Future | ✅ Yes | ✅ Yes | ❌ No | ✅ Yes | ✅ Yes | ❌ No | ✅ Yes |
| Total Databases | 4+ (planned) | 400+ | 25+ | 1 | 14+ | 15+ | 3 | 20+ |
| **Connection Management** |  |  |  |  |  |  |  |  |
| SSH Tunneling | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ⚠️ Limited | ✅ Yes |
| SSL/TLS Support | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Multiple Connections | ✅ Yes (5+) | ✅ Yes (unlimited) | ✅ Yes (unlimited) | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Connection Profiles | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Cloud Integration | 🔄 Phase 4 | ✅ AWS, Azure, GCP | ⚠️ Limited | ❌ No | ✅ AWS, Azure | ❌ No | ✅ Azure | ✅ AWS, Azure |
| Credential Management | ✅ VSCode SecretStorage | ✅ Encrypted | ✅ Encrypted | ⚠️ Basic | ✅ Keychain | ✅ VSCode Secrets | ✅ Encrypted | ✅ Encrypted |
| **Database Explorer** |  |  |  |  |  |  |  |  |
| Tree View Navigation | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Schema Visualization | ✅ Yes | ✅ ERD Generator | ✅ ER Diagrams | ✅ ERD | ✅ Yes | ❌ No | ⚠️ Limited | ✅ ERD |
| Quick Search | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Object Filtering | ✅ Yes | ✅ Advanced | ✅ Yes | ✅ Yes | ✅ Yes | ⚠️ Basic | ✅ Yes | ✅ Yes |
| **Performance Monitoring** |  |  |  |  |  |  |  |  |
| Process List Viewer | ✅ Real-time | ✅ Yes | ✅ Yes | ✅ Yes | ⚠️ Limited | ❌ No | ⚠️ Limited | ✅ Yes |
| Auto-Refresh | ✅ Configurable | ✅ Yes | ✅ Yes | ✅ Yes | ⚠️ Manual | ❌ No | ❌ No | ✅ Yes |
| Kill Process | ✅ With Confirmation | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No | ❌ No | ✅ Yes |
| Slow Query Detection | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No | ❌ No | ❌ No | ⚠️ Limited |
| Queries Without Indexes | ✅ Dedicated View | ⚠️ Via Query | ⚠️ Via Query | ✅ Yes | ❌ No | ❌ No | ❌ No | ❌ No |
| Performance Dashboard | ✅ Host & DB Level | ✅ Yes | ✅ Session Manager | ✅ Performance | ❌ No | ❌ No | ⚠️ Basic | ✅ Yes |
| Real-time Metrics | ✅ QPS, Connections, etc. | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No | ❌ No | ❌ No | ⚠️ Limited |
| Historical Charts | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No | ❌ No | ❌ No | ❌ No |
| Alerting | 🔄 Phase 2 | ✅ Yes | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |
| **Variable & Configuration** |  |  |  |  |  |  |  |  |
| Session Variables View | ✅ Dedicated View | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No | ❌ No | ❌ No | ⚠️ Limited |
| Global Variables View | ✅ Dedicated View | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No | ❌ No | ❌ No | ⚠️ Limited |
| Variable Search/Filter | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No | ❌ No | ❌ No | ❌ No |
| Variable Documentation | ✅ AI-Powered | ⚠️ Basic | ⚠️ Basic | ✅ Yes | ❌ No | ❌ No | ❌ No | ❌ No |
| Configuration Recommendations | ✅ AI-Powered | ⚠️ Limited | ❌ No | ⚠️ Basic | ❌ No | ❌ No | ❌ No | ❌ No |
| **AI-Powered Features** |  |  |  |  |  |  |  |  |
| AI Query Optimization | ✅ VSCode LM API | ✅ AI Assistant | ✅ AI Assistant | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |
| Explain Plan Analysis | ✅ Natural Language | ✅ Yes | ✅ Explain Intent | ⚠️ Basic | ⚠️ Basic | ❌ No | ⚠️ Basic | ⚠️ Basic |
| Index Recommendations | ✅ Context-Aware | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No | ❌ No | ❌ No | ⚠️ Limited |
| Query Rewriting | ✅ AI Suggestions | ⚠️ Limited | ⚠️ Limited | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |
| Educational Webviews | ✅ Interactive AI | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |
| Natural Language Queries | 🔄 Phase 4 | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |
| Performance Insights | ✅ AI-Generated | ⚠️ Basic | ⚠️ Basic | ⚠️ Basic | ❌ No | ❌ No | ❌ No | ❌ No |
| **Query Development** |  |  |  |  |  |  |  |  |
| SQL Editor | 🔄 Phase 2 | ✅ Advanced | ✅ Advanced | ✅ Advanced | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Advanced |
| Syntax Highlighting | 🔄 Phase 2 | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Auto-completion | ✅ Schema-Aware | ✅ Advanced | ✅ Context-Aware | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Query Execution | 🔄 Phase 2 | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Result Visualization | 🔄 Phase 2 | ✅ Multiple Formats | ✅ Advanced | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| Query History | 🔄 Phase 2 | ✅ Persistent | ✅ Yes | ✅ Yes | ✅ Yes | ⚠️ Session | ✅ Yes | ✅ Yes |
| Query Templates | 🔄 Phase 2 | ✅ Yes | ✅ Live Templates | ✅ Snippets | ✅ Yes | ✅ Snippets | ✅ Yes | ✅ Yes |
| Code Formatting | 🔄 Phase 2 | ✅ Yes | ✅ Advanced | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| **Schema Management** |  |  |  |  |  |  |  |  |
| Schema Comparison | 🔄 Phase 2 | ✅ Advanced | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No | ✅ Yes | ✅ Yes |
| DDL Generation | 🔄 Phase 2 | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No | ⚠️ Limited | ✅ Yes |
| Migration Scripts | 🔄 Phase 2 | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No | ✅ Yes | ✅ Yes |
| Version Control Integration | 🔄 Phase 2 | ✅ Yes | ✅ Git Integration | ⚠️ Manual | ⚠️ Manual | ✅ Git (VSCode) | ✅ Git Integration | ⚠️ Limited |
| **Data Management** |  |  |  |  |  |  |  |  |
| Table Data Editor | 🔄 Phase 2 | ✅ Advanced | ✅ Advanced | ✅ Yes | ✅ Yes | ⚠️ Limited | ✅ Yes | ✅ Advanced |
| Data Export | 🔄 Phase 2 | ✅ Multiple Formats | ✅ Multiple Formats | ✅ Yes | ✅ Yes | ✅ CSV | ✅ Multiple | ✅ Multiple |
| Data Import | 🔄 Phase 2 | ✅ Multiple Formats | ✅ Multiple Formats | ✅ Yes | ✅ Yes | ❌ No | ✅ Multiple | ✅ Multiple |
| Data Filtering | 🔄 Phase 2 | ✅ Advanced | ✅ Advanced | ✅ Yes | ✅ Yes | ⚠️ Basic | ✅ Yes | ✅ Advanced |
| **Collaboration & Sharing** |  |  |  |  |  |  |  |  |
| Team Workspaces | 🔄 Phase 4 | ✅ Enterprise | ✅ Team Plans | ❌ No | ⚠️ Limited | ❌ No | ✅ Yes | ✅ Enterprise |
| Shared Queries | 🔄 Phase 4 | ✅ Yes | ✅ Yes | ❌ No | ⚠️ Manual | ⚠️ Via Git | ⚠️ Via Git | ✅ Yes |
| Annotations/Comments | 🔄 Phase 4 | ✅ Yes | ✅ Yes | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Yes |
| **Learning & Documentation** |  |  |  |  |  |  |  |  |
| Interactive Tutorials | ✅ AI-Powered | ❌ No | ❌ No | ⚠️ Basic | ❌ No | ❌ No | ⚠️ Limited | ❌ No |
| Contextual Help | ✅ AI Explanations | ⚠️ Static Docs | ⚠️ Context Help | ✅ Help Panel | ❌ No | ❌ No | ⚠️ Limited | ⚠️ Limited |
| Best Practices | ✅ AI Suggestions | ❌ No | ⚠️ Inspections | ⚠️ Limited | ❌ No | ❌ No | ❌ No | ❌ No |
| Concept Explanations | ✅ Webviews | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No | ❌ No |
| **Pricing** |  |  |  |  |  |  |  |  |
| Free Version | ✅ Full-featured | ✅ Community Edition | ❌ Trial Only | ✅ Community | ✅ Limited | ✅ Yes | ✅ Yes | ✅ Limited Trial |
| Paid Version | 🔄 Future | ✅ $199/year | ✅ $229/year | ❌ Free | ✅ $89 one-time | ❌ No | ❌ Free | ✅ $699 one-time |
| Enterprise Features | 🔄 Phase 4 | ✅ Available | ✅ Available | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Available |

**Legend:**
- ✅ Fully supported
- ⚠️ Partially supported or limited
- ❌ Not supported
- 🔄 Planned in future phase
 - Note: Matrix reflects public information as of 2025-10; features may vary by edition/version

#### B.4 VSCode Extensions Comparison (Direct Competitors)

| Feature | MyDBA (Proposed) | SQLTools | MSSQL Extension | Database Client | MySQL (Weijan Chen) |
|---------|------------------|----------|-----------------|-----------------|---------------------|
| **Core Focus** | MySQL DBA + AI | Multi-DB Development | SQL Server | Multi-DB Basic | MySQL Only |
| **Active Installs** | - | 2M+ | 17M+ | 500K+ | 800K+ |
| **Last Update** | - | Active | Active | Active | Limited |
| **Process Monitoring** | ✅ Real-time | ❌ No | ❌ No | ❌ No | ⚠️ Basic |
| **Performance Dashboard** | ✅ Yes | ❌ No | ⚠️ Limited | ❌ No | ❌ No |
| **AI Features** | ✅ Deep Integration | ❌ No | ❌ No | ❌ No | ❌ No |
| **Variable Management** | ✅ Dedicated Views | ❌ No | ❌ No | ❌ No | ❌ No |
| **Educational Content** | ✅ AI Webviews | ❌ No | ❌ No | ❌ No | ❌ No |
| **Query Optimization** | ✅ AI-Powered | ❌ No | ✅ Query Plans | ❌ No | ❌ No |
| **Index Analysis** | ✅ Proactive | ❌ No | ❌ No | ❌ No | ❌ No |

#### B.5 Market Positioning

```
                           Advanced Features
                                  ▲
                                  │
                                  │
                    DBeaver       │        DataGrip
                    Ultimate      │        (Premium)
                         ●        │          ●
                                  │
                                  │
                          MyDBA ●─┼─────────────────►
                         (Target) │              Specialized
        Multi-purpose             │              (MySQL/MariaDB)
                                  │
         SQLTools ●               │
                                  │
                  Database        │
                  Client ●        │
                                  │
                                  ▼
                           Basic Features
```

#### B.6 Competitive Advantages

**MyDBA's Unique Value Propositions:**

1. **AI-First Approach**
   - Only VSCode extension with deep AI integration for database management
   - Context-aware optimization suggestions
   - Educational AI that explains concepts in real-time
   - Proactive performance issue detection

2. **DBA-Focused Features in VSCode**
   - First VSCode extension with comprehensive process monitoring
   - Dedicated views for queries without indexes
   - Real-time performance dashboards
   - Complete variable management interface
   - Features typically only found in heavyweight tools like DBeaver/DataGrip

3. **Learning Platform**
   - Interactive webviews with AI-generated content
   - Context-sensitive tutorials
   - Best practices enforcement
   - Turns troubleshooting into learning opportunities

4. **Native VSCode Integration**
   - Seamless workflow for developers (no context switching)
   - Leverages VSCode ecosystem (themes, keybindings, extensions)
   - Lightweight compared to standalone IDEs
   - Part of existing development environment

5. **Specialized MySQL/MariaDB Expertise**
   - Deep, focused functionality rather than shallow multi-DB support
   - MySQL-specific optimizations and insights
   - Better user experience for the target database

6. **Modern Architecture**
   - Built on latest VSCode extension APIs
   - Leverages cutting-edge AI capabilities
   - Designed for cloud-native workflows
   - Future-proof technology stack

7. **Fully Open-Source and Free**: Licensed under Apache 2.0, ensuring accessibility for all users and encouraging community contributions—no paid tiers or restrictions.

#### B.7 Market Gaps MyDBA Fills

| Gap in Market | How MyDBA Addresses It |
|---------------|------------------------|
| No AI-powered DB tools in VSCode | Deep integration with VSCode Language Model API |
| Lack of DBA features in VSCode extensions | Process monitoring, dashboards, variable management |
| Complex tools require leaving IDE | Native VSCode integration, zero context switching |
| Steep learning curve for database optimization | AI-powered educational content and explanations |
| Reactive problem-solving only | Proactive detection of queries without indexes |
| Generic multi-DB tools lack depth | Specialized MySQL/MariaDB features and optimizations |
| Expensive enterprise tools | Free, open-source with optional premium features |
| Heavy, bloated database IDEs | Lightweight extension, < 100MB |

#### B.8 Threat Analysis

**Potential Threats and Mitigation:**

1. **JetBrains DataGrip adds VSCode integration**
   - *Likelihood*: Low (competing with their own product)
   - *Mitigation*: First-mover advantage, free pricing, deeper AI integration

2. **DBeaver releases official VSCode extension**
   - *Likelihood*: Medium
   - *Mitigation*: Superior AI features, better UX, specialized focus

3. **GitHub Copilot adds database optimization**
   - *Likelihood*: Medium
   - *Mitigation*: Domain-specific expertise, integrated monitoring, not just code completion

4. **SQLTools adds similar features**
   - *Likelihood*: Low (different focus - query execution vs. DBA)
   - *Mitigation*: Already monitoring landscape, can innovate faster

5. **Large vendors (Oracle, Microsoft) create AI DBA tools**
   - *Likelihood*: High (long-term)
   - *Mitigation*: Open-source community, multi-vendor support, faster iteration

#### B.9 Go-to-Market Positioning

**Target Segments:**

1. **Primary: Backend Developers** (60% of market)
   - Use MySQL/MariaDB in daily work
   - Already use VSCode
   - Want to optimize queries without deep DBA knowledge
   - Value AI-assisted learning

2. **Secondary: Junior/Mid-level DBAs** (25% of market)
   - Need comprehensive monitoring in their IDE
   - Want to learn best practices
   - Require cost-effective tools

3. **Tertiary: DevOps Engineers** (15% of market)
   - Monitor database performance
   - Troubleshoot production issues
   - Need quick insights

**Key Messaging:**

- **For Developers**: "Your Free AI DBA Assistant, Right in VSCode"
- **For DBAs**: "Professional Database Monitoring Without the Cost"
- **For Teams**: "Open-Source Database Intelligence for Everyone"

**Differentiation Statement:**

> "MyDBA is the only AI-powered database assistant built natively for VSCode that combines professional-grade monitoring, proactive optimization, and interactive learning—bringing enterprise DBA capabilities to every developer's fingertips."

#### B.10 Pricing Strategy vs. Competition

| Tool | Price | MyDBA Advantage |
|------|-------|-----------------|
| DBeaver Ultimate | $199/year | MyDBA is completely free and open-source under Apache 2.0 |
| DataGrip | $229/year (first year) | MyDBA is completely free and open-source under Apache 2.0 |
| TablePlus | $89 one-time | MyDBA is completely free and open-source under Apache 2.0 |
| Navicat Premium | $699 one-time | MyDBA is completely free and open-source under Apache 2.0 |
| SQLTools | Free | MyDBA adds advanced DBA/AI features while remaining completely free and open-source under Apache 2.0 |

**MyDBA Pricing Philosophy:**
- Completely free and open-source under Apache 2.0 license for all phases and features.
- Encourages community contributions and broad adoption.
- No premium tiers—sustainability through community support, sponsorships, and optional donations.

### C. Technology References

- [VSCode Extension API](https://code.visualstudio.com/api)
- [VSCode Language Model API](https://code.visualstudio.com/api/extension-guides/language-model)
- [MySQL Documentation](https://dev.mysql.com/doc/)
- [MariaDB Documentation](https://mariadb.com/kb/en/)
- [mysql2 NPM Package](https://www.npmjs.com/package/mysql2)
- [Apache 2.0 License](https://www.apache.org/licenses/LICENSE-2.0) (Project license for open-source distribution)
 - MySQL Reference: performance_schema, information_schema, sys schema

---

## 7. Implementation Status & Progress

### 7.1 Current Phase: Milestone 1, 2 & 3 (Foundation + Core UI + Monitoring)

**Last Updated**: December 26, 2025
**Current Status**: Phase 1 MVP - 90% Complete

---

### 7.2 Completed Features ✅

#### Milestone 1: Foundation (100% Complete)
- ✅ **Project Setup & Architecture**
  - Service Container (Dependency Injection)
  - Event Bus for decoupled communication
  - TypeScript configuration with strict mode
  - ESLint & Prettier formatting
  - Logger utility with multiple log levels

- ✅ **Extension Structure**
  - Extension activation lifecycle
  - Command registry pattern
  - Provider registration system
  - Webview manager with panel management

- ✅ **Connection Management**
  - Add/update/delete connections
  - Connection state management with events
  - Connection persistence to workspace state
  - Secure credential storage via SecretStorage API
  - Password handling for empty passwords
  - Multi-connection support

- ✅ **Database Adapters**
  - Pluggable adapter architecture
  - MySQL/MariaDB adapter with mysql2
  - Connection pooling
  - Query execution with parameterized queries
  - Error handling and logging
  - Version detection (8.0.41 tested)

#### Milestone 2: Core UI (95% Complete)
- ✅ **Tree View Implementation**
  - Connection tree with expand/collapse
  - Database listing
  - Table listing with row counts
  - Column information display
  - Index information display
  - Query Editor node
  - Process List node
  - Variables node
  - Metrics Dashboard node
  - Context menu actions

- ✅ **Connection Dialog**
  - Webview-based connection form
  - SSL/TLS configuration section
  - Environment selection (dev/staging/prod)
  - Production environment warning
  - Test connection functionality
  - Connection editing support
  - File picker for SSL certificates
  - Default host to 127.0.0.1

- ✅ **Process List Viewer**
  - Webview panel (editor-style)
  - `SHOW FULL PROCESSLIST` integration
  - Auto-refresh every 5 seconds
  - Manual refresh button
  - Last updated timestamp
  - Kill query functionality with confirmation
  - Sortable columns
  - SQL injection prevention (parameterized KILL)
  - Case-insensitive database column handling

- ✅ **Variables Viewer**
  - Webview panel (editor-style)
  - Global variables display
  - Session variables display
  - Tabbed interface (Global/Session)
  - Search/filter functionality
  - Sortable columns
  - Real-time data loading

- ✅ **Query Editor**
  - Webview panel (editor-style)
  - SQL query execution
  - Results grid with scrolling
  - Execution time display
  - Row count display
  - EXPLAIN query support with JSON output
  - Visual EXPLAIN plan viewer with:
    - Query summary (cost, rows examined)
    - Table access details
    - Index usage highlighting
    - Performance issue warnings (color-coded)
    - Collapsible raw JSON view
  - SQL query formatter with:
    - Keyword capitalization
    - Proper indentation (2 spaces)
    - Newlines for major clauses
    - CASE statement formatting
    - Comma alignment
  - Export results (CSV, JSON, SQL INSERT)
  - Safety warnings for:
    - DROP statements
    - TRUNCATE statements
    - DELETE without WHERE
    - UPDATE without WHERE
  - Automatic LIMIT 1000 for SELECT queries
  - Query execution cancellation
  - Multiple query support

- ✅ **Table Data Preview**
  - Context menu "Preview Data" on tables
  - Automatic `SELECT * LIMIT 1000`
  - Opens in Query Editor with pre-filled query
  - Metadata passing via tree item context

#### Milestone 3: Monitoring (90% Complete)
- ✅ **Database Metrics Dashboard**
  - Webview panel (editor-style)
  - Real-time metrics collection from:
    - `SHOW GLOBAL STATUS`
    - `SHOW GLOBAL VARIABLES`
  - Current metrics display:
    - Server information (version, uptime)
    - Connections (current, max, max used)
    - Queries (QPS, total, slow queries)
    - Threads (running, connected, cached)
    - Buffer pool (size, hit rate)
    - Table cache (hit rate, open tables)
    - Query cache (hit rate, size) if enabled
  - **Historical trend charts** with Chart.js:
    - Connections chart (current vs max)
    - Queries per second chart
    - Buffer pool hit rate chart
    - Threads chart (running vs connected)
  - Time range filtering (5min, 15min, 30min, 1 hour)
  - Auto-refresh every 5 seconds with toggle
  - Manual refresh button
  - Last updated timestamp
  - Chart.js integration with proper canvas cleanup
  - Category scale for time labels (no date adapter needed)
  - Responsive chart sizing
  - Chart update mechanism (refresh data without recreating charts)

- ✅ **Queries Without Indexes Detection**
  - Performance Schema integration (`performance_schema.events_statements_summary_by_digest`)
  - Detection of full table scans (`rows_examined` vs `rows_examined_est` gap)
  - Webview panel with auto-refresh (10 seconds)
  - Manual refresh button
  - Integration with EXPLAIN viewer (direct optimization analysis)
  - User consent flow for Performance Schema configuration
  - Error handling and graceful degradation
  - Visualization of unindexed queries with execution metrics
  - Suggest indexes with `CREATE INDEX` SQL preview

- ✅ **Slow Queries Panel**
  - Performance Schema-based slow query detection
  - Ranking by `AVG_TIMER_WAIT`
  - Webview panel with auto-refresh (30 seconds)
  - Manual refresh button
  - Integration with EXPLAIN and Profiling viewers
  - Display query digest, execution count, avg time, total time
  - Visual indicators for severity levels

- ✅ **Query Profiling with Performance Schema**
  - MySQL 8.0+ Performance Schema integration
  - Stage-by-stage execution breakdown (`events_stages_history_long`)
  - Waterfall timeline visualization
  - Webview panel for profiling results
  - Performance Schema configuration check with user consent
  - Graceful error handling for unsupported versions

- ⏳ **EXPLAIN Viewer Enhancements** (Partial - 80% Complete)
  - ✅ D3.js tree diagram implementation
  - ✅ Interactive node exploration with hover effects
  - ✅ Performance hotspot highlighting (color-coded severity)
  - ✅ Detailed table view with all EXPLAIN columns
  - ✅ Toggle between tree and table views
  - ✅ Node details popup with severity badges
  - ✅ Responsive layout and animations
  - ⏳ Expand/collapse subtree functionality (not implemented yet)
  - ⏳ Export functionality for diagrams (not implemented yet)
  - ⏳ Search within EXPLAIN plan (not implemented yet)

#### Milestone 4: AI Integration (0% Complete)
- ⏳ **VSCode AI API Integration** (Not Started)
- ⏳ **Query Analysis Engine** (Not Started)
- ⏳ **Documentation-Grounded AI (RAG)** (Not Started)
- ⏳ **@mydba Chat Participant** (Not Started)

---

### 7.3 Recently Completed 🔄

Major features completed in the last development cycle:

1. ✅ **Queries Without Indexes Detection**
   - Performance Schema integration with user consent flow
   - Full table scan detection and visualization
   - Webview panel with auto-refresh
   - Integration with EXPLAIN viewer for optimization analysis

2. ✅ **Slow Queries Panel**
   - Performance Schema-based detection
   - Auto-refresh and manual refresh capabilities
   - Integration with EXPLAIN and Profiling viewers

3. ✅ **Query Profiling with Performance Schema**
   - Stage-by-stage execution breakdown
   - Waterfall timeline visualization
   - User consent flow for configuration

4. ✅ **EXPLAIN Viewer Enhancements**
   - D3.js tree diagram implementation
   - Interactive node exploration
   - Dual view mode (tree + table)
   - Severity-based color coding
   - Performance hotspot highlighting

---

### 7.4 Pending Features ⏳

#### High Priority (Phase 1 Remaining)
- [ ] **EXPLAIN Viewer Improvements**
  - Expand/collapse subtree functionality
  - Export functionality for diagrams (PNG, SVG, JSON)
  - Search within EXPLAIN plan
  - Estimated: 4-6 hours

- [ ] **Queries Without Indexes - Advanced**
  - Configurable detection thresholds
  - Unused/duplicate index detection
  - Index suggestion optimization
  - Estimated: 6-8 hours

- [ ] **Query Profiling Enhancements**
  - Expand/collapse subtree functionality
  - Stage duration analysis
  - Estimated: 8-10 hours

- [ ] **VSCode AI API Integration**
  - Language Model API integration
  - Query optimization suggestions
  - Schema-aware prompting
  - Query anonymization
  - Estimated: 10-12 hours

- [ ] **Documentation-Grounded AI (Phase 1)**
  - MySQL/MariaDB docs curation
  - Keyword-based retrieval
  - Citation requirement
  - Estimated: 12-15 hours

#### Medium Priority (Phase 2)
- [ ] **Host-Level Metrics Dashboard**
  - CPU, memory, disk I/O monitoring
  - Requires external metrics (Prometheus)
  - Estimated: 15-20 hours

- [ ] **Percona Toolkit Features**
  - Duplicate/Unused Index Detector
  - Variable Advisor
  - Replication Lag Monitor
  - Config Diff Tool
  - Estimated: 20-25 hours

- [ ] **@mydba Chat Participant**
  - VSCode Chat API integration
  - Context-aware responses
  - Multi-turn conversations
  - Estimated: 15-20 hours

- [ ] **Advanced Query Editor**
  - Monaco Editor integration for syntax highlighting
  - Query history with favorites
  - Multi-tab support
  - Autocomplete with schema awareness
  - Estimated: 20-25 hours

#### Low Priority (Phase 3)
- [ ] **PostgreSQL Support**
- [ ] **Redis/Valkey Support**
- [ ] **Schema Diff & Migration Tools**
- [ ] **Backup/Restore Integration**
- [ ] **Community Knowledge Base**

---

### 7.5 Technical Debt & Known Issues

#### Resolved ✅
- ✅ SQL injection in KILL query (fixed with parameterized queries)
- ✅ Password storage for empty passwords (fixed with explicit undefined checks)
- ✅ Async memory leak in auto-refresh (fixed with isRefreshing flag)
- ✅ Multiple panel instances per connection (fixed with static panel registry)
- ✅ Process list database column case sensitivity (fixed with `row.db || row.DB`)
- ✅ CSP violations in webviews (fixed with proper nonce and CSP headers)
- ✅ Chart.js canvas reuse errors (fixed with Chart.getChart() cleanup)
- ✅ Chart.js date adapter error (fixed by switching to category scale)
- ✅ Vertical scrolling in query results (fixed with flexbox layout)
- ✅ Last updated timestamp null error (fixed with null checks)
- ✅ EXPLAIN raw JSON display (fixed with formatted HTML table)

#### Active Monitoring 👀
- ⚠️ **Webview iframe sandbox warning**: VSCode warning about `allow-scripts` + `allow-same-origin` (standard VSCode webview behavior, not a security issue)
- ⚠️ **Punycode deprecation warning**: From mysql2 dependency (waiting for upstream fix)
- ⚠️ **SQLite experimental warning**: From VSCode's internal storage (not our issue)

#### Future Improvements 📋
- Add comprehensive error boundaries in webviews
- Implement webview state persistence on hide/show
- Add loading skeletons for better UX
- Optimize metrics collection for large databases
- Add batch query execution
- Implement query cancellation
- Add connection pooling configuration
- Implement connection retry logic with exponential backoff

---

### 7.6 Testing Status

#### Unit Tests
- ✅ Service Container tests (10 tests passing)
- ✅ MySQL Adapter basic tests (8 tests passing)
- ⏳ Connection Manager tests (planned)
- ⏳ Query Service tests (planned)

#### Integration Tests
- ✅ Docker Compose test environment setup
- ✅ MySQL 8.0.41 test container
- ⏳ End-to-end connection tests (planned)
- ⏳ Query execution tests (planned)

#### Manual Testing
- ✅ Connection creation and editing
- ✅ Tree view navigation
- ✅ Process list functionality
- ✅ Variables viewer
- ✅ Query execution and results
- ✅ EXPLAIN plan visualization
- ✅ Metrics dashboard with charts
- ✅ Table data preview
- ✅ Kill query functionality
- ✅ SSL/TLS configuration
- ⏳ SSH tunneling (not implemented)
- ⏳ AWS RDS IAM auth (not implemented)

---

### 7.7 Performance Metrics

**Current Performance** (as of October 26, 2025):

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Extension activation time | < 100ms | ~5ms | ✅ Excellent |
| Tree view render time | < 500ms | ~200ms | ✅ Good |
| Query execution (simple SELECT) | < 100ms | ~15ms | ✅ Excellent |
| Metrics dashboard load | < 2s | ~400ms | ✅ Excellent |
| Process list refresh | < 500ms | ~150ms | ✅ Excellent |
| Webview panel creation | < 1s | ~300ms | ✅ Good |
| Chart.js render time | < 1s | ~200ms | ✅ Excellent |

---

### 7.8 Security Audit Status

#### Completed ✅
- ✅ SQL injection prevention (parameterized queries)
- ✅ Credential storage via SecretStorage API
- ✅ CSP headers in all webviews
- ✅ Nonce-based script loading
- ✅ Input validation for connection params
- ✅ Destructive operation warnings
- ✅ Production environment disclaimers
- ✅ Query anonymization architecture (ready for AI integration)

#### Pending ⏳
- ⏳ Formal security audit (planned for Beta)
- ⏳ Penetration testing (planned for Beta)
- ⏳ GDPR compliance verification (planned for Beta)
- ⏳ Dependency vulnerability scanning (planned for CI/CD)

---

### 7.9 Roadmap Timeline

```
Phase 1 (MVP) - Target: Week 12
├── Milestone 1: Foundation ✅ [Complete]
├── Milestone 2: Core UI ✅ [95% Complete]
├── Milestone 3: Monitoring 🔄 [60% Complete]
│   ├── ✅ Database Metrics Dashboard
│   ├── ⏳ EXPLAIN Visualization (D3.js)
│   ├── ⏳ Queries Without Indexes
│   └── ⏳ Query Profiling
└── Milestone 4: AI Integration ⏳ [Not Started]
    ├── ⏳ VSCode AI API
    ├── ⏳ Query Analysis
    ├── ⏳ RAG Documentation
    └── ⏳ Basic Optimization

Phase 2 (Advanced) - Target: Week 24
├── Host-Level Metrics
├── Percona Toolkit Features
├── @mydba Chat Participant
├── Advanced Query Editor
└── Performance Enhancements

Phase 3 (Expansion) - Target: Week 36
├── PostgreSQL Support
├── Redis/Valkey Support
├── Schema Diff & Migration
└── Community Knowledge Base
```

**Current Position**: Week 6 equivalent (50% of Phase 1 complete)
**Remaining to MVP**: ~6 weeks
**Confidence Level**: High (architecture solid, momentum strong)

---

### 7.10 Next Immediate Actions (Priority Order)

#### This Week's Focus
1. **EXPLAIN Visualization with D3.js** (6-8 hours)
   - Tree diagram rendering
   - Interactive node exploration
   - Performance hotspot highlighting
   - Priority: HIGH ⭐⭐⭐

2. **Queries Without Indexes Detection** (4-6 hours)
   - Performance Schema queries
   - Full table scan detection
   - Webview display
   - Priority: HIGH ⭐⭐⭐

3. **Query Profiling Implementation** (8-10 hours)
   - Performance Schema integration
   - Waterfall visualization
   - Stage analysis
   - Priority: HIGH ⭐⭐⭐

#### Next Week's Focus
4. **VSCode AI API Integration** (10-12 hours)
   - Language Model API setup
   - Query optimization prompts
   - Schema context injection
   - Priority: CRITICAL ⭐⭐⭐

5. **Documentation-Grounded AI** (12-15 hours)
   - MySQL/MariaDB docs curation
   - Keyword retrieval engine
   - Citation extraction
   - Priority: HIGH ⭐⭐⭐

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

---

## Approval and Sign-off

This document requires approval from:
- [x] Product Owner (**Approved with conditions - v1.3 scope refinements applied**)
- [ ] Technical Lead
- [ ] UX Designer
- [ ] Security Team

**Document Status**: Draft → **Approved for Development (v1.3)**
**Next Review Date**: Post-Beta (Week 21)
