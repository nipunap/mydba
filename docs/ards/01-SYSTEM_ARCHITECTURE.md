# System Architecture ARD

**Document Type**: Architecture Requirement Document (ARD)
**Version**: 1.0
**Last Updated**: October 25, 2025
**Status**: Approved for Implementation
**Architect**: System Architect

---

## 1. Overview

### 1.1 Purpose

This document defines the high-level system architecture for MyDBA, a VSCode extension providing AI-powered database management capabilities. It establishes the architectural patterns, component boundaries, data flows, and integration points required for Phase 1 MVP and future phases.

### 1.2 Scope

- Extension host architecture within VSCode
- Core component design and responsibilities
- Inter-component communication patterns
- External system integrations
- State management and persistence
- Event-driven architecture patterns

### 1.3 Architectural Principles

1. **Modularity**: Loosely coupled components with clear interfaces
2. **Extensibility**: Plugin-based database adapter architecture
3. **Performance**: Lazy loading, caching, and asynchronous operations
4. **Security-First**: Credential isolation, secure storage, minimal permissions
5. **Testability**: Dependency injection, interface-based design
6. **Observability**: Structured logging, error tracking, performance metrics

---

## 2. System Context

### 2.1 System Boundary

```
┌─────────────────────────────────────────────────────────────┐
│                      VSCode Desktop                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              MyDBA Extension                          │  │
│  │  (Node.js Process in VSCode Extension Host)          │  │
│  └───────────────────────────────────────────────────────┘  │
│                    │             │                           │
│              ┌─────┴─────┐  ┌───┴────┐                     │
│              │           │  │        │                       │
└──────────────┼───────────┼──┼────────┼───────────────────────┘
               │           │  │        │
         ┌─────▼─────┐  ┌──▼──▼──┐  ┌─▼────────────┐
         │ Database  │  │ VSCode  │  │ OS Keychain  │
         │ Servers   │  │ LM API  │  │ (SecretStore)│
         │ (MySQL/   │  │ (AI)    │  │              │
         │ MariaDB)  │  └─────────┘  └──────────────┘
         └───────────┘
```

### 2.2 External Systems

| System | Interface | Purpose | Ownership |
|--------|-----------|---------|-----------|
| **MySQL/MariaDB** | mysql2 driver | Database operations | User-managed |
| **VSCode LM API** | vscode.lm namespace | AI query analysis | Microsoft |
| **VSCode Chat API** | vscode.chat namespace | @mydba participant | Microsoft |
| **OS Keychain** | VSCode SecretStorage | Credential storage | OS-level |
| **AWS RDS/Aurora** | @aws-sdk/client-rds | IAM token generation | AWS |

---

## 3. High-Level Architecture

### 3.1 Layered Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Presentation Layer                        │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Tree Views  │  │  Webviews    │  │  Commands    │       │
│  │ (Sidebar)   │  │  (Panels)    │  │  (Palette)   │       │
│  └─────────────┘  └──────────────┘  └──────────────┘       │
└───────────────────────┬──────────────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────────────┐
│                    Application Layer                         │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Connection  │  │  Query       │  │  Metrics     │       │
│  │ Manager     │  │  Analyzer    │  │  Collector   │       │
│  └─────────────┘  └──────────────┘  └──────────────┘       │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ AI Service  │  │  RAG Engine  │  │  Chat        │       │
│  │ Coordinator │  │              │  │  Handler     │       │
│  └─────────────┘  └──────────────┘  └──────────────┘       │
└───────────────────────┬──────────────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────────────┐
│                    Adapter Layer                             │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ MySQL       │  │  PostgreSQL  │  │  Redis       │       │
│  │ Adapter     │  │  Adapter     │  │  Adapter     │       │
│  └─────────────┘  └──────────────┘  └──────────────┘       │
└───────────────────────┬──────────────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────────────┐
│                    Infrastructure Layer                      │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Config      │  │  Secret      │  │  Logger      │       │
│  │ Manager     │  │  Storage     │  │  Service     │       │
│  └─────────────┘  └──────────────┘  └──────────────┘       │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Extension Core                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │             Extension Activation                     │  │
│  │  - Register commands, views, providers              │  │
│  │  - Initialize services and adapters                 │  │
│  │  - Set up event listeners                           │  │
│  └───────────────┬──────────────────────────────────────┘  │
│                  │                                           │
│  ┌───────────────▼──────────────────────────────────────┐  │
│  │           Service Container (DI)                     │  │
│  │  - Dependency injection & lifecycle management       │  │
│  └─┬────────┬────────┬────────┬────────┬───────────────┘  │
│    │        │        │        │        │                     │
│  ┌─▼──────┐ │   ┌────▼─────┐ │   ┌────▼──────┐             │
│  │Connec- │ │   │ Query    │ │   │ Metrics   │             │
│  │tion    │ │   │ Service  │ │   │ Service   │             │
│  │Manager │ │   └──────────┘ │   └───────────┘             │
│  └────┬───┘ │                 │                              │
│       │   ┌─▼──────────────┐  │                              │
│       │   │ AI Service     │  │                              │
│       │   │ Coordinator    │  │                              │
│       │   └───┬────────────┘  │                              │
│       │       │               │                              │
│       │   ┌───▼─────────┐  ┌─▼──────────────┐              │
│       │   │ RAG Engine  │  │ VSCode LM API  │              │
│       │   └─────────────┘  └────────────────┘              │
│       │                                                       │
│  ┌────▼──────────────────────────────────────────────────┐  │
│  │           Database Adapter Registry                   │  │
│  │  ┌──────────┐  ┌───────────┐  ┌──────────┐          │  │
│  │  │ MySQL    │  │PostgreSQL │  │ Redis    │          │  │
│  │  │ Adapter  │  │ Adapter   │  │ Adapter  │          │  │
│  │  └──────────┘  └───────────┘  └──────────┘          │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Core Components

### 4.1 Extension Core

**Responsibility**: Extension lifecycle, activation, registration

**Interface**:
```typescript
export function activate(context: vscode.ExtensionContext): void {
  // Initialize service container
  // Register commands, views, providers
  // Set up event listeners
  // Load saved state
}

export function deactivate(): void {
  // Cleanup resources
  // Dispose connections
  // Save state
}
```

**Key Responsibilities**:
- Extension activation/deactivation
- Service initialization and dependency injection
- Command and provider registration
- Global error handling
- Extension settings management

### 4.2 Service Container (Dependency Injection)

**Responsibility**: Centralized service lifecycle and dependency management

**Interface**:
```typescript
interface IServiceContainer {
  register<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void;
  registerSingleton<T>(token: ServiceToken<T>, instance: T): void;
  get<T>(token: ServiceToken<T>): T;
  dispose(): Promise<void>;
}

// Service registration example
container.register(SERVICE_TOKENS.ConnectionManager,
  (c) => new ConnectionManager(
    c.get(SERVICE_TOKENS.SecretStorage),
    c.get(SERVICE_TOKENS.Logger)
  )
);
```

**Design Pattern**: Service Locator + Factory

**Lifecycle**:
- `activate()`: Create container, register services
- Runtime: Lazy instantiation on first `get()`
- `deactivate()`: Dispose all services in reverse order

### 4.3 Connection Manager

**Responsibility**: Manage database connections and credentials

**Interface**:
```typescript
interface IConnectionManager {
  // Connection CRUD
  createConnection(config: ConnectionConfig): Promise<Connection>;
  getConnection(id: string): Connection | undefined;
  listConnections(): Connection[];
  deleteConnection(id: string): Promise<void>;

  // Connection lifecycle
  connect(id: string): Promise<void>;
  disconnect(id: string): Promise<void>;
  testConnection(config: ConnectionConfig): Promise<TestResult>;

  // Credential management
  saveCredentials(id: string, credentials: Credentials): Promise<void>;
  getCredentials(id: string): Promise<Credentials>;

  // Events
  onConnectionAdded: Event<Connection>;
  onConnectionRemoved: Event<string>;
  onConnectionStateChanged: Event<ConnectionStateChange>;
}
```

**State Management**:
- Connection configs stored in workspace state
- Credentials stored in VSCode SecretStorage
- Active connections held in-memory (auto-reconnect on extension reload)

**Connection Pooling**:
```typescript
interface ConnectionPool {
  maxConnections: number;  // Default: 5 per database
  idleTimeout: number;     // Default: 300000ms (5 min)
  connectionTimeout: number; // Default: 10000ms
}
```

### 4.4 Database Adapter Registry

**Responsibility**: Pluggable database adapter management

**Interface**:
```typescript
interface IDatabaseAdapter {
  readonly type: DatabaseType;
  readonly supportedVersions: string[];

  // Connection lifecycle
  connect(config: ConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  testConnection(): Promise<boolean>;

  // Query execution
  query<T>(sql: string, params?: any[]): Promise<T[]>;
  execute(sql: string, params?: any[]): Promise<ExecuteResult>;

  // Profiling (adapter-specific)
  explain(sql: string): Promise<ExplainResult>;
  profile(sql: string): Promise<ProfileResult>;
  getOptimizerTrace?(sql: string): Promise<OptimizerTrace>;

  // Metadata
  getDatabases(): Promise<string[]>;
  getTables(database: string): Promise<TableInfo[]>;
  getTableSchema(table: string): Promise<TableSchema>;

  // Performance data
  getProcessList?(): Promise<Process[]>;
  getVariables?(): Promise<Variable[]>;
  getMetrics?(): Promise<Metrics>;
}

interface IAdapterRegistry {
  register(type: DatabaseType, factory: AdapterFactory): void;
  create(type: DatabaseType, config: ConnectionConfig): IDatabaseAdapter;
  getSupportedTypes(): DatabaseType[];
}
```

**Phase 1 Adapters**:
- `MySQLAdapter` (MySQL 8.0+, MariaDB 10.6+)

**Phase 3 Adapters**:
- `PostgreSQLAdapter`
- `RedisAdapter`

### 4.5 AI Service Coordinator

**Responsibility**: Orchestrate AI features (query analysis, chat, RAG)

**Interface**:
```typescript
interface IAIServiceCoordinator {
  // Query analysis
  analyzeQuery(request: AnalyzeQueryRequest): Promise<QueryAnalysis>;

  // EXPLAIN interpretation
  interpretExplain(explainResult: ExplainResult, context: QueryContext):
    Promise<ExplainInterpretation>;

  // Profiling insights
  interpretProfiling(profilingResult: ProfileResult, context: QueryContext):
    Promise<ProfilingInsights>;

  // General AI request
  askAI(prompt: string, context: AIContext): Promise<AIResponse>;

  // Configuration
  isEnabled(): boolean;
  getSettings(): AISettings;
}

interface AnalyzeQueryRequest {
  query: string;
  connectionId: string;
  includeSchema: boolean;
  includeExplain: boolean;
  includeProfiling: boolean;
  anonymize: boolean;
}
```

**Workflow**:
1. Check `mydba.ai.enabled` setting
2. Anonymize query (if enabled)
3. Retrieve RAG context from documentation
4. Build prompt with context + citations
5. Call VSCode LM API
6. Parse response and extract structured data
7. Return with citations

### 4.6 RAG Engine

**Responsibility**: Documentation retrieval and context injection

**Interface**:
```typescript
interface IRAGEngine {
  // Query documentation
  search(query: string, limit?: number): Promise<DocSegment[]>;

  // Context building
  buildContext(query: string, type: ContextType): Promise<RAGContext>;

  // Index management
  initialize(): Promise<void>;
  updateIndex(docs: Document[]): Promise<void>;
}

interface DocSegment {
  content: string;
  source: string;      // URL to MySQL/MariaDB docs
  title: string;
  relevanceScore: number;
  metadata: {
    version: string;  // MySQL 8.0, MariaDB 10.11, etc.
    category: string; // performance, indexes, etc.
  };
}
```

**Phase 1 Implementation** (Keyword-based):
```typescript
class KeywordRAGEngine implements IRAGEngine {
  private index: TFIDFIndex;
  private segments: DocSegment[];

  async search(query: string, limit = 3): Promise<DocSegment[]> {
    // 1. Tokenize query
    // 2. TF-IDF similarity search
    // 3. Return top N segments
  }
}
```

**Phase 2 Enhancement** (Semantic):
```typescript
class SemanticRAGEngine implements IRAGEngine {
  private vectorStore: VectorStore;
  private embeddingModel: EmbeddingModel;

  async search(query: string, limit = 3): Promise<DocSegment[]> {
    // 1. Generate query embedding
    // 2. Vector similarity search
    // 3. Hybrid: combine with keyword scores
    // 4. Return top N segments
  }
}
```

### 4.7 Query Service

**Responsibility**: Query parsing, templating, risk analysis

**Interface**:
```typescript
interface IQueryService {
  // Parsing
  parse(sql: string): ParseResult;

  // Anonymization
  templateQuery(sql: string): TemplatedQuery;

  // Risk analysis
  analyzeRisk(sql: string): RiskAnalysis;

  // Validation
  validate(sql: string, schema: SchemaContext): ValidationResult;
}

interface RiskAnalysis {
  level: RiskLevel; // LOW, MEDIUM, HIGH, CRITICAL
  issues: RiskIssue[];
  recommendations: string[];
}

interface RiskIssue {
  type: RiskType; // MISSING_WHERE, FULL_SCAN, DROP_TABLE, etc.
  severity: RiskLevel;
  message: string;
  affectedObjects: string[]; // tables, columns
}
```

**Static Risk Detection Rules**:
```typescript
const RISK_RULES: RiskRule[] = [
  {
    pattern: /DELETE\s+FROM\s+\w+(?!\s+WHERE)/i,
    type: 'MISSING_WHERE',
    severity: 'CRITICAL',
    message: 'DELETE without WHERE clause will remove all rows'
  },
  {
    pattern: /DROP\s+(TABLE|DATABASE)/i,
    type: 'DROP_OBJECT',
    severity: 'CRITICAL',
    message: 'DROP operation is irreversible'
  },
  // ... more rules
];
```

### 4.8 Metrics Collector

**Responsibility**: Gather and aggregate database performance metrics

**Interface**:
```typescript
interface IMetricsCollector {
  // Collection
  collect(connectionId: string): Promise<Metrics>;
  startPolling(connectionId: string, interval: number): void;
  stopPolling(connectionId: string): void;

  // History
  getHistory(connectionId: string, range: TimeRange): Promise<MetricsHistory>;

  // Aggregation
  aggregate(metrics: Metrics[], method: AggregationMethod): AggregatedMetrics;
}

interface Metrics {
  timestamp: number;
  connectionId: string;

  // Query metrics
  queriesPerSecond: number;
  slowQueries: number;

  // Connection metrics
  activeConnections: number;
  maxConnections: number;

  // Table metrics
  hotTables: TableMetric[];

  // InnoDB metrics (MySQL-specific)
  bufferPoolHitRate?: number;
  rowsRead?: number;
  rowsInserted?: number;
}
```

**Polling Strategy**:
- Default interval: 5 seconds (configurable)
- Exponential backoff on error
- Pause when VSCode loses focus (battery optimization)

---

## 5. Data Flow Patterns

### 5.1 Query Analysis Flow

```
User Executes Query
        │
        ▼
┌───────────────────┐
│ Query Service     │ ──► Parse SQL
│                   │ ──► Anonymize (if AI enabled)
│                   │ ──► Risk analysis
└───────┬───────────┘
        │
        ▼ (if AI enabled)
┌───────────────────┐
│ RAG Engine        │ ──► Retrieve docs
│                   │ ──► Build context
└───────┬───────────┘
        │
        ▼
┌───────────────────┐
│ AI Coordinator    │ ──► Build prompt + context
│                   │ ──► Call VSCode LM API
│                   │ ──► Parse AI response
└───────┬───────────┘
        │
        ▼
┌───────────────────┐
│ Database Adapter  │ ──► Run EXPLAIN
│                   │ ──► Run profiling (if requested)
└───────┬───────────┘
        │
        ▼
┌───────────────────┐
│ Webview           │ ──► Render tree diagram
│ (EXPLAIN Viewer)  │ ──► Display AI insights
│                   │ ──► Show one-click fixes
└───────────────────┘
```

### 5.2 Connection Lifecycle

```
User Adds Connection
        │
        ▼
┌───────────────────┐
│ Connection Manager│
└───────┬───────────┘
        │
        ├──► Save config to workspace state
        │
        ├──► Save credentials to SecretStorage
        │
        ├──► Detect version (SELECT VERSION())
        │
        ├──► Version gating (MySQL 8.0+, MariaDB 10.6+)
        │    ├─► If unsupported: Show EOL warning
        │    └─► If supported: Continue
        │
        ├──► Test connection
        │    ├─► Create adapter instance
        │    └─► adapter.testConnection()
        │
        └──► Fire onConnectionAdded event
                 │
                 ├──► Tree view refreshes
                 └──► Metrics collector starts polling
```

### 5.3 VSCode Chat (@mydba) Flow

```
User: "@mydba /analyze SELECT * FROM users WHERE id = 123"
        │
        ▼
┌───────────────────┐
│ Chat Handler      │
│ (vscode.chat)     │
└───────┬───────────┘
        │
        ├──► Parse command and args
        │
        ├──► Detect active connection
        │
        ▼
┌───────────────────┐
│ Query Service     │ ──► Template query
└───────┬───────────┘
        │
        ▼
┌───────────────────┐
│ AI Coordinator    │ ──► RAG context
│                   │ ──► Build prompt
│                   │ ──► Call AI
└───────┬───────────┘
        │
        ▼
┌───────────────────┐
│ Chat Response     │
│ Streaming         │ ──► Stream markdown response
│                   │ ──► Render citations
│                   │ ──► Add action buttons
└───────────────────┘
```

---

## 6. State Management

### 6.1 Workspace State

**Storage**: `context.workspaceState` (per-workspace)

**Data**:
```typescript
interface WorkspaceState {
  connections: ConnectionConfig[];
  activeConnectionId?: string;
  treeViewState: TreeViewState;
  uiSettings: {
    expandedNodes: string[];
    selectedTab: string;
  };
}
```

### 6.2 Global State

**Storage**: `context.globalState` (cross-workspace)

**Data**:
```typescript
interface GlobalState {
  userSettings: UserPreferences;
  onboardingCompleted: boolean;
  ragIndexVersion: string;
  telemetryConsent?: boolean;
}
```

### 6.3 Secret Storage

**Storage**: VSCode SecretStorage API (OS keychain)

**Data**:
```typescript
// Key format: `mydba.connection.${connectionId}.${credentialType}`
await context.secrets.store(
  `mydba.connection.${id}.password`,
  encryptedPassword
);
```

**Encryption**: Handled by OS
- macOS: Keychain
- Windows: Credential Manager
- Linux: libsecret

---

## 7. Event-Driven Architecture

### 7.1 Event Bus

**Pattern**: Observer / Pub-Sub

```typescript
interface IEventBus {
  on<T>(event: EventType<T>, handler: EventHandler<T>): Disposable;
  emit<T>(event: EventType<T>, data: T): void;
}

// Usage
eventBus.on(Events.CONNECTION_STATE_CHANGED, (data) => {
  if (data.state === 'connected') {
    metricsCollector.startPolling(data.connectionId);
  }
});
```

### 7.2 Core Events

| Event | Payload | Subscribers |
|-------|---------|-------------|
| `CONNECTION_ADDED` | `Connection` | TreeView, MetricsCollector |
| `CONNECTION_REMOVED` | `connectionId` | TreeView, MetricsCollector |
| `CONNECTION_STATE_CHANGED` | `StateChange` | TreeView, StatusBar |
| `QUERY_EXECUTED` | `QueryResult` | AuditLog, MetricsCollector |
| `AI_REQUEST_SENT` | `AIRequest` | NetworkLog, TelemetryCollector |
| `AI_RESPONSE_RECEIVED` | `AIResponse` | NetworkLog |

---

## 8. Performance Requirements

### 8.1 Response Time Targets

| Operation | Target (p95) | Max Acceptable |
|-----------|--------------|----------------|
| Extension activation | 500ms | 1s |
| Connection test | 2s | 5s |
| Tree view refresh | 200ms | 500ms |
| Query execution | Variable | 30s (timeout) |
| EXPLAIN visualization | 300ms | 1s |
| AI query analysis | 3s | 10s |
| Webview render | 300ms | 1s |

### 8.2 Resource Limits

| Resource | Limit | Rationale |
|----------|-------|-----------|
| Memory (idle) | 50MB | VSCode best practices |
| Memory (active) | 200MB | With caching, metrics history |
| CPU (idle) | 0% | No background polling when idle |
| CPU (active) | 5% | Metrics collection, UI updates |
| Concurrent connections | 10 | Per extension instance |
| Metrics history | 1 hour | Rolling window, 5s intervals |

### 8.3 Caching Strategy

```typescript
interface CacheLayer {
  // Schema metadata (1 hour TTL)
  schemaCache: LRUCache<string, TableSchema>;

  // Query results (5 min TTL, max 10 entries)
  queryResultCache: LRUCache<string, QueryResult>;

  // RAG document segments (persist across sessions)
  ragCache: PersistentCache<string, DocSegment[]>;

  // EXPLAIN plans (10 min TTL)
  explainCache: LRUCache<string, ExplainResult>;
}
```

---

## 9. Error Handling Strategy

### 9.1 Error Categories

```typescript
enum ErrorCategory {
  CONNECTION = 'connection',
  QUERY = 'query',
  AI = 'ai',
  AUTHENTICATION = 'authentication',
  PERMISSION = 'permission',
  TIMEOUT = 'timeout',
  UNKNOWN = 'unknown'
}

class MyDBAError extends Error {
  constructor(
    message: string,
    public category: ErrorCategory,
    public code: string,
    public recoverable: boolean,
    public context?: Record<string, any>
  ) {
    super(message);
  }
}
```

### 9.2 Error Handling Layers

1. **Component Level**: Catch, log, rethrow with context
2. **Service Level**: Catch, convert to MyDBAError, log
3. **UI Level**: Display user-friendly message, offer recovery actions

```typescript
// Example: Connection error handling
try {
  await adapter.connect(config);
} catch (error) {
  if (error.code === 'ECONNREFUSED') {
    throw new MyDBAError(
      'Cannot connect to database. Please check host and port.',
      ErrorCategory.CONNECTION,
      'CONNECTION_REFUSED',
      true,
      { host: config.host, port: config.port }
    );
  }
  throw error;
}
```

### 9.3 Retry Strategy

```typescript
interface RetryPolicy {
  maxAttempts: number;
  backoff: 'exponential' | 'linear';
  initialDelay: number;
  maxDelay: number;
  retryableErrors: string[];
}

// Default policy
const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  backoff: 'exponential',
  initialDelay: 1000,
  maxDelay: 10000,
  retryableErrors: ['ETIMEDOUT', 'ECONNRESET', 'PROTOCOL_CONNECTION_LOST']
};
```

---

## 10. Testing Strategy

### 10.1 Test Pyramid

```
                  ┌───────────┐
                  │    E2E    │  10%
                  │  (VSCode  │
                  │Extension) │
                  └───────────┘
              ┌─────────────────┐
              │   Integration   │  20%
              │  (with Docker   │
              │   databases)    │
              └─────────────────┘
          ┌───────────────────────┐
          │      Unit Tests       │  70%
          │ (Components, Services,│
          │      Utilities)       │
          └───────────────────────┘
```

### 10.2 Test Doubles

```typescript
// Interface-based mocking
interface IConnectionManager { ... }

class MockConnectionManager implements IConnectionManager {
  // Stub implementation for testing
}

// Dependency injection in tests
const container = new ServiceContainer();
container.registerSingleton(
  SERVICE_TOKENS.ConnectionManager,
  new MockConnectionManager()
);
```

### 10.3 Integration Test Environment

```yaml
# docker-compose.test.yml
services:
  mysql-8.0:
    image: mysql:8.0
    ports: ["3306:3306"]
    environment:
      MYSQL_ROOT_PASSWORD: test_password
      MYSQL_DATABASE: test_db

  mariadb-10.11:
    image: mariadb:10.11
    ports: ["3307:3306"]
    environment:
      MYSQL_ROOT_PASSWORD: test_password
      MYSQL_DATABASE: test_db
```

---

## 11. Observability

### 11.1 Logging

**Levels**: ERROR, WARN, INFO, DEBUG

**Output Channels**:
- `MyDBA - Main` (default user-visible logs)
- `MyDBA - Network` (AI requests, database queries)
- `MyDBA - Debug` (verbose internal state)

```typescript
interface ILogger {
  error(message: string, error?: Error, context?: object): void;
  warn(message: string, context?: object): void;
  info(message: string, context?: object): void;
  debug(message: string, context?: object): void;
}
```

### 11.2 Performance Monitoring

```typescript
interface IPerformanceMonitor {
  startTrace(name: string): TraceHandle;
  endTrace(handle: TraceHandle): void;
  recordMetric(name: string, value: number, unit: string): void;
}

// Usage
const trace = perfMonitor.startTrace('query.execute');
try {
  await adapter.query(sql);
} finally {
  perfMonitor.endTrace(trace);
}
```

### 11.3 Telemetry (Opt-in)

**Default**: Disabled

**Data Collected** (if enabled):
- Feature usage counts
- Error types (no stack traces, no user data)
- Performance metrics (p50, p95, p99)
- Database version distribution

**Privacy**: See `docs/PRIVACY.md`

---

## 12. Deployment & Packaging

### 12.1 Extension Bundle

```
mydba-1.0.0.vsix
├── extension.js (bundled, minified)
├── package.json
├── README.md
├── LICENSE
├── resources/
│   ├── icons/
│   └── docs/ (embedded RAG bundle)
└── webviews/
    ├── explain-viewer.html
    └── dashboard.html
```

### 12.2 Build Pipeline

```bash
# 1. Compile TypeScript
npm run compile

# 2. Bundle with webpack
npm run bundle

# 3. Package extension
vsce package

# 4. Validate
vsce ls
```

### 12.3 Release Checklist

- [ ] All tests pass
- [ ] Linting clean
- [ ] Security audit (`npm audit`)
- [ ] CHANGELOG.md updated
- [ ] Version bumped in `package.json`
- [ ] Tag git commit
- [ ] Generate VSIX
- [ ] Test install in clean VSCode
- [ ] Publish to marketplace

---

## 13. Security Architecture

See dedicated ARD: `02-SECURITY_ARCHITECTURE.md`

Key points:
- Zero-trust: Never trust user input
- Credential isolation: SecretStorage only
- SQL injection prevention: Parameterized queries
- CSP enforcement: Strict CSP for webviews
- Audit logging: All destructive operations

---

## 14. Future Architecture Considerations

### 14.1 Phase 2 Enhancements

- Semantic RAG with vector embeddings
- Host-level metrics integration
- Multi-database connection pooling
- Query history persistence

### 14.2 Phase 3 Multi-Database

- PostgreSQL adapter
- Redis adapter
- Valkey adapter
- Unified metrics interface

### 14.3 Scalability

- Connection pooling across workspaces
- Distributed metrics collection
- Cloud-native deployment (VSCode.dev support)

---

## 15. Approval

**Reviewed By**:
- [ ] Lead Architect
- [ ] Senior Backend Engineer
- [ ] Security Architect
- [ ] DevOps Engineer

**Status**: Draft → Review → **Approved**

**Next Steps**:
1. Create detailed component ARDs
2. Define API contracts
3. Begin Phase 1 implementation

---

**Document Version**: 1.0
**Last Updated**: October 25, 2025
**Next Review**: Post-MVP (Week 25)
