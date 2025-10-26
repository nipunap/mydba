# AI Integration & RAG Architecture ARD

**Document Type**: Architecture Requirement Document (ARD)
**Version**: 1.0
**Last Updated**: October 25, 2025
**Status**: Approved for Implementation
**Related**: 01-SYSTEM_ARCHITECTURE.md

---

## 1. Overview

Define the AI integration architecture including VSCode Language Model API integration, RAG (Retrieval-Augmented Generation) system, query anonymization, and @mydba chat participant.

---

## 2. AI Service Architecture

### 2.1 Component Diagram

```
┌──────────────────────────────────────────────────────────┐
│                  AI Service Coordinator                  │
└────────┬─────────────┬────────────────┬──────────────────┘
         │             │                │
    ┌────▼────┐   ┌────▼────────┐  ┌───▼──────────┐
    │ Query   │   │ RAG Engine  │  │ Chat Handler │
    │ Analyzer│   │             │  │ (@mydba)     │
    └────┬────┘   └────┬────────┘  └───┬──────────┘
         │             │                │
         └─────────────┴────────────────┘
                       │
              ┌────────▼────────┐
              │ VSCode LM API   │
              └─────────────────┘
```

### 2.2 AI Service Coordinator

```typescript
interface IAIServiceCoordinator {
  // Query analysis workflow
  analyzeQuery(request: AnalyzeQueryRequest): Promise<QueryAnalysis>;

  // Settings
  isEnabled(): boolean;
  getModel(): string; // e.g., 'gpt-4', 'claude-3-sonnet'
}

interface AnalyzeQueryRequest {
  query: string;
  connectionId: string;
  context: {
    database: string;
    schema?: SchemaContext;
    explain?: ExplainResult;
    profiling?: ProfileResult;
  };
  options: {
    anonymize: boolean;
    includeSchema: boolean;
    includeDocs: boolean;
  };
}

interface QueryAnalysis {
  issues: Issue[];
  recommendations: Recommendation[];
  optimizedQuery?: string;
  indexSuggestions: IndexSuggestion[];
  citations: Citation[];
  confidence: number; // 0-1
}
```

---

## 3. RAG Engine

### 3.1 Architecture

```
User Query
    │
    ▼
┌─────────────────┐
│ Query Parser    │ → Extract keywords, detect intent
└────────┬────────┘
         │
    ▼
┌─────────────────┐
│ Doc Retrieval   │ → Search embedded docs (TF-IDF / Vector)
└────────┬────────┘
         │
    ▼
┌─────────────────┐
│ Context Builder │ → Top 3 segments + metadata
└────────┬────────┘
         │
    ▼
┌─────────────────┐
│ Prompt Injector │ → Inject into LM prompt with citations
└─────────────────┘
```

### 3.2 Phase 1: Keyword-Based RAG

```typescript
class KeywordRAGEngine implements IRAGEngine {
  private tfidf: TFIDFIndex;
  private segments: DocSegment[];

  constructor(private docsPath: string) {
    this.loadDocs();
  }

  private async loadDocs(): Promise<void> {
    // Load embedded MySQL/MariaDB docs (~5MB)
    const docs = await fs.readFile(path.join(this.docsPath, 'mysql-8.0-docs.json'));
    this.segments = JSON.parse(docs);

    // Build TF-IDF index
    this.tfidf = new TFIDFIndex();
    for (const segment of this.segments) {
      this.tfidf.addDocument(segment.id, segment.content);
    }
  }

  async search(query: string, limit = 3): Promise<DocSegment[]> {
    // 1. Tokenize query
    const tokens = this.tokenize(query);

    // 2. TF-IDF search
    const scores = this.tfidf.search(tokens);

    // 3. Return top N
    return scores
      .slice(0, limit)
      .map(({ id }) => this.segments.find(s => s.id === id)!);
  }

  async buildContext(query: string, type: ContextType): Promise<RAGContext> {
    const segments = await this.search(query);

    return {
      segments,
      prompt: this.buildPrompt(query, segments),
      citations: segments.map(s => ({ title: s.title, url: s.source }))
    };
  }

  private buildPrompt(query: string, segments: DocSegment[]): string {
    return `
You are an expert MySQL database administrator. Use the following documentation to answer the question.

Documentation:
${segments.map((s, i) => `[${i + 1}] ${s.title}\n${s.content}\nSource: ${s.source}`).join('\n\n')}

Question: ${query}

Requirements:
1. Ground your answer in the provided documentation
2. Cite sources using [1], [2], [3] notation
3. If documentation doesn't cover the question, state that clearly
4. Provide actionable recommendations with expected impact
`.trim();
  }
}
```

### 3.3 Documentation Bundle Structure

```json
{
  "version": "8.0",
  "segments": [
    {
      "id": "perf-schema-profiling-1",
      "title": "Query Profiling Using Performance Schema",
      "category": "performance",
      "content": "The Performance Schema provides detailed instrumentation...",
      "source": "https://dev.mysql.com/doc/refman/8.4/en/performance-schema-query-profiling.html",
      "keywords": ["profiling", "performance_schema", "events_statements_history"],
      "version": "8.0+"
    }
  ],
  "metadata": {
    "totalSegments": 150,
    "categories": ["performance", "indexes", "replication", "variables"],
    "sizeBytes": 5242880
  }
}
```

---

## 4. Query Anonymization

### 4.1 Templating Engine

```typescript
interface IQueryTemplater {
  template(sql: string): TemplatedQuery;
  anonymize(trace: OptimizerTrace): AnonymizedTrace;
}

interface TemplatedQuery {
  templated: string;          // SELECT * FROM <table:users> WHERE <col:id> = ?
  originalTokens: Token[];    // Mapping for de-templating
  literals: Literal[];        // Extracted literal values (not sent to AI)
}

class QueryTemplater implements IQueryTemplater {
  private parser = new Parser();

  template(sql: string): TemplatedQuery {
    const ast = this.parser.astify(sql);
    const literals: Literal[] = [];

    const templated = this.transformAST(ast, {
      onTableName: (name) => `<table:${name}>`,
      onColumnName: (name) => `<col:${name}>`,
      onAlias: (name) => `<alias:${name}>`,
      onLiteral: (value, type) => {
        literals.push({ value, type, position: ast.position });
        return '?';
      }
    });

    return { templated, originalTokens: ast.tokens, literals };
  }
}
```

### 4.2 Privacy Flow

```
Original Query:
  SELECT * FROM users WHERE email = 'john@example.com' AND id = 12345

       ↓ (anonymize = true)

Templated Query (sent to AI):
  SELECT * FROM <table:users> WHERE <col:email> = ? AND <col:id> = ?

Schema Context (sent to AI):
  users: {
    columns: [id (INT, PRIMARY), email (VARCHAR, UNIQUE), name (VARCHAR)],
    indexes: [PRIMARY, idx_email],
    rowEstimate: ~145000
  }

What AI Sees:
  ✅ Table name: users
  ✅ Column names: email, id
  ✅ Structure: WHERE with 2 conditions
  ❌ Actual email: john@example.com
  ❌ Actual ID: 12345
```

---

## 5. VSCode Chat Integration

### 5.1 Chat Participant Registration

```typescript
export function registerChatParticipant(context: vscode.ExtensionContext): void {
  const handler: vscode.ChatRequestHandler = async (
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
  ): Promise<vscode.ChatResult> => {
    // 1. Parse command
    const command = request.command; // e.g., 'analyze', 'explain', 'profile'
    const prompt = request.prompt;   // User's natural language query

    // 2. Detect active connection
    const connection = connectionManager.getActive();
    if (!connection) {
      stream.markdown('⚠️ No active database connection. Please connect first.');
      return { metadata: { command } };
    }

    // 3. Route to handler
    switch (command) {
      case 'analyze':
        return await handleAnalyzeCommand(prompt, connection, stream, token);
      case 'profile':
        return await handleProfileCommand(prompt, connection, stream, token);
      default:
        return await handleNaturalLanguage(prompt, connection, stream, token);
    }
  };

  const participant = vscode.chat.createChatParticipant('mydba', handler);
  participant.iconPath = vscode.Uri.file(path.join(context.extensionPath, 'icon.png'));

  context.subscriptions.push(participant);
}
```

### 5.2 Slash Commands

```typescript
async function handleAnalyzeCommand(
  prompt: string,
  connection: Connection,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<vscode.ChatResult> {
  // 1. Extract SQL from prompt
  const sql = extractSQL(prompt);

  // 2. Anonymize
  const templated = queryTemplater.template(sql);

  // 3. Run EXPLAIN
  stream.progress('Running EXPLAIN...');
  const explain = await connection.adapter.explain(sql);

  // 4. Get RAG context
  const ragContext = await ragEngine.buildContext(`analyze query: ${templated.templated}`);

  // 5. Call AI
  stream.progress('Analyzing with AI...');
  const analysis = await aiCoordinator.analyzeQuery({
    query: templated.templated,
    connectionId: connection.id,
    context: { explain },
    options: { anonymize: true, includeDocs: true }
  });

  // 6. Stream response
  stream.markdown(`## Analysis Results\n\n`);
  stream.markdown(`### Issues Found\n`);
  for (const issue of analysis.issues) {
    stream.markdown(`- ${issue.severity} ${issue.message}\n`);
  }

  stream.markdown(`\n### Recommendations\n`);
  for (const rec of analysis.recommendations) {
    stream.markdown(`- ${rec.description} (${rec.impact})\n`);
    if (rec.sql) {
      stream.markdown(`\`\`\`sql\n${rec.sql}\n\`\`\`\n`);
    }
  }

  // 7. Add action buttons
  stream.button({
    command: 'mydba.applyRecommendation',
    title: 'Apply Fix',
    arguments: [analysis.recommendations[0]]
  });

  // 8. Add citations
  stream.markdown(`\n### Sources\n`);
  for (const citation of analysis.citations) {
    stream.markdown(`- [${citation.title}](${citation.url})\n`);
  }

  return { metadata: { command: 'analyze', issuesFound: analysis.issues.length } };
}
```

---

## 6. Prompt Engineering

### 6.1 Query Analysis Prompt Template

```typescript
const QUERY_ANALYSIS_PROMPT = `
You are an expert ${context.database.type} ${context.database.version} database administrator.
Analyze the following query and provide optimization suggestions.

Context:
- Database: ${context.database.type} ${context.database.version}
- Table: ${context.schema.table}
- Columns: ${context.schema.columns.join(', ')}
- Indexes: ${context.schema.indexes.map(i => i.name).join(', ')}
- Row estimate: ~${context.schema.rowEstimate}

Query (templated for privacy):
\`\`\`sql
${templatedQuery}
\`\`\`

Execution Plan:
\`\`\`
${explainOutput}
\`\`\`

${ragContext.segments.length > 0 ? `
Documentation References:
${ragContext.segments.map((s, i) => `[${i + 1}] ${s.title}\n${s.content}\nSource: ${s.source}`).join('\n\n')}
` : ''}

Instructions:
1. Identify performance issues (full scans, filesort, temp tables, high row estimates)
2. Suggest specific indexes with CREATE INDEX DDL
3. Recommend query rewrites if applicable
4. Estimate performance improvement (e.g., "50x faster")
5. Cite documentation using [1], [2], [3] notation
6. Provide confidence level (0-100%)

Output JSON:
{
  "issues": [{ "type": "FULL_SCAN", "severity": "HIGH", "message": "..." }],
  "recommendations": [{ "type": "ADD_INDEX", "description": "...", "sql": "CREATE INDEX...", "impact": "50x faster" }],
  "citations": ["[1]", "[2]"],
  "confidence": 85
}
`.trim();
```

### 6.2 Prompt Safeguards

```typescript
interface PromptSafeguards {
  // Token limits
  maxPromptTokens: number;      // 4000 (leave room for response)
  maxResponseTokens: number;    // 2000

  // Content filtering
  sanitizeUserInput: boolean;   // Remove code injection attempts
  validateResponse: boolean;    // Ensure JSON parseable

  // Rate limiting
  maxRequestsPerMinute: number; // 10
  cooldownOnError: number;      // 30 seconds
}
```

---

## 7. Performance & Caching

### 7.1 RAG Cache

```typescript
interface RAGCache {
  // Query → Doc segments (5 min TTL)
  queryCache: LRUCache<string, DocSegment[]>;

  // Prompt → AI response (10 min TTL)
  responseCache: LRUCache<string, AIResponse>;

  // Doc index (persist across sessions)
  indexCache: PersistentCache<string, TFIDFIndex>;
}
```

### 7.2 Performance Targets

| Operation | Target (p95) | Budget |
|-----------|--------------|--------|
| RAG doc search | 50ms | Keyword TF-IDF |
| Query anonymization | 20ms | SQL parsing |
| AI request (network) | 2-3s | VSCode LM API |
| Total analysis | 3-5s | End-to-end |

---

## 8. Testing

### 8.1 RAG Tests

```typescript
describe('RAG Engine', () => {
  it('should retrieve relevant docs for index query', async () => {
    const results = await ragEngine.search('how to create index on multiple columns');

    expect(results).toHaveLength(3);
    expect(results[0].title).toContain('Index');
    expect(results[0].content).toContain('composite');
  });

  it('should cite sources in prompt', async () => {
    const context = await ragEngine.buildContext('slow query profiling');

    expect(context.prompt).toContain('[1]');
    expect(context.citations).toHaveLength(3);
    expect(context.citations[0].url).toMatch(/dev\.mysql\.com/);
  });
});
```

### 8.2 Anonymization Tests

```typescript
describe('Query Templater', () => {
  it('should anonymize literals but preserve structure', () => {
    const result = templater.template(
      "SELECT * FROM users WHERE email = 'john@example.com' AND id = 12345"
    );

    expect(result.templated).toBe(
      "SELECT * FROM <table:users> WHERE <col:email> = ? AND <col:id> = ?"
    );
    expect(result.literals).toEqual([
      { value: 'john@example.com', type: 'STRING' },
      { value: 12345, type: 'NUMBER' }
    ]);
  });
});
```

---

## 9. Approval

**Status**: Draft → **Approved**

**Next Steps**:
1. Curate MySQL 8.0 docs (~5MB)
2. Implement keyword RAG
3. Build chat participant
4. Create prompt templates

---

**Document Version**: 1.0
**Last Updated**: October 25, 2025
