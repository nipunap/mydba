# Phase 2.5: Advanced AI Features

## Overview

Phase 2.5 introduces cutting-edge vector-based RAG (Retrieval-Augmented Generation) and live documentation parsing to dramatically improve the quality and accuracy of AI-powered query analysis.

## Features

### 1. Vector-Based RAG with Embeddings

**What it does:**
- Converts documentation into semantic embeddings (vector representations)
- Enables similarity-based search that understands meaning, not just keywords
- Supports hybrid search combining semantic similarity + keyword matching
- Dramatically improves retrieval accuracy for complex queries

**Components:**

#### Embedding Providers
- **OpenAI Embeddings** (`text-embedding-3-small`): Best quality, requires API key
- **Mock Provider**: Fallback for testing/development
- **Future**: Transformers.js for local embeddings (zero-cost, privacy-friendly)

#### Vector Store
- In-memory vector database with cosine similarity search
- Supports filtering by database type (MySQL, MariaDB, PostgreSQL)
- Export/import for caching and persistence
- Hybrid search with configurable weights (default: 70% semantic, 30% keyword)

#### Document Chunking
Intelligently splits large documentation into smaller, semantically meaningful chunks:
- **Paragraph strategy**: Best for technical docs with clear sections
- **Sentence strategy**: Better granularity for dense content
- **Markdown strategy**: Preserves document structure (headers, sections)
- **Fixed-size**: Fallback with overlapping windows
- **Smart chunking**: Auto-detects best strategy

**Configuration:**

```json
{
  "mydba.ai.useVectorSearch": true,
  "mydba.ai.embeddingProvider": "openai", // or "mock"
  "mydba.ai.hybridSearchWeights": {
    "semantic": 0.7,
    "keyword": 0.3
  },
  "mydba.ai.chunkingStrategy": "paragraph",
  "mydba.ai.maxChunkSize": 1000
}
```

**API Usage:**

```typescript
// Initialize Enhanced RAG Service
const enhancedRAG = new EnhancedRAGService(logger, embeddingProvider);
await enhancedRAG.initialize(extensionPath, {
    embeddingApiKey: openAIKey,
    useOpenAI: true
});

// Index documents with embeddings
await enhancedRAG.indexDocuments(documents, {
    chunkLargeDocs: true,
    maxChunkSize: 1000
});

// Retrieve with hybrid search
const relevantDocs = await enhancedRAG.retrieveRelevantDocs(
    query,
    'mysql',
    5, // max docs
    {
        useVectorSearch: true,
        hybridSearchWeights: { semantic: 0.7, keyword: 0.3 }
    }
);
```

**Benefits:**
- **Improved Relevance**: Semantic search understands query intent
- **Context-Aware**: Finds related concepts even without exact keyword matches
- **Better Rankings**: Hybrid approach combines best of both worlds
- **Scalable**: Works with large documentation corpora

---

### 2. Live Documentation Parsing

**What it does:**
- Fetches and parses MySQL/MariaDB documentation directly from official websites
- Version-specific retrieval (e.g., MySQL 8.0, MariaDB 10.11)
- Background fetching doesn't block UI
- Intelligent caching with 7-day TTL

**Components:**

#### Documentation Parsers
- **MySQLDocParser**: Parses `dev.mysql.com/doc/refman/`
- **MariaDBDocParser**: Parses `mariadb.com/kb/en/`
- Extracts titles, content, code blocks, headers
- Cleans and structures text for optimal indexing

#### Caching Layer
- Disk-based cache with TTL (default: 7 days)
- Automatic cache invalidation on expiry
- Statistics tracking (cache hits, disk usage)
- Manual cache clearing via command

#### Background Fetching
- Non-blocking, queue-based fetching
- Rate limiting to avoid overwhelming servers
- Graceful error handling (continues on failure)
- Progress logging

**Configuration:**

```json
{
  "mydba.ai.liveDocsEnabled": true,
  "mydba.ai.autoDetectVersion": true,
  "mydba.ai.backgroundFetchOnStartup": true,
  "mydba.ai.maxPagesToFetch": 20,
  "mydba.ai.docCacheTTL": 604800000 // 7 days in ms
}
```

**API Usage:**

```typescript
// Initialize Live Doc Service
const liveDocService = new LiveDocService(logger, enhancedRAG, {
    enableBackgroundFetch: true,
    autoDetectVersion: true,
    cacheDir: '.doc-cache',
    cacheTTL: 7 * 24 * 60 * 60 * 1000
});

// Fetch and index docs (blocking)
const docCount = await liveDocService.fetchAndIndexDocs('mysql', '8.0', {
    forceRefresh: false,
    maxPages: 20
});

// Fetch in background (non-blocking)
await liveDocService.fetchInBackground('mariadb', '10.11', 15);

// Check if cached
const isCached = liveDocService.isCached('mysql', '8.0');
```

**Supported Documentation:**

**MySQL:**
- Query Optimization
- Index Strategies
- EXPLAIN Output
- Performance Schema
- InnoDB Configuration
- Lock Management
- Variables Reference

**MariaDB:**
- Query Optimization
- Index Hints
- Storage Engines
- System Variables
- Transactions
- Performance Monitoring

**Benefits:**
- **Always Up-to-Date**: Fetches latest documentation
- **Version-Specific**: Matches your database version exactly
- **Comprehensive**: Covers all optimization topics
- **Fast**: Cached for instant retrieval

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     AI Service Coordinator                   │
└───────────────────────┬─────────────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
┌───────▼──────────┐          ┌────────▼─────────┐
│  Enhanced RAG    │          │  Live Doc Service│
│   Service        │          │                  │
└────┬──────┬──────┘          └────┬──────┬──────┘
     │      │                      │      │
     │      │                      │      │
┌────▼──┐ ┌▼────────┐      ┌──────▼─┐  ┌▼────────┐
│Vector │ │Embedding│      │Doc     │  │Doc      │
│Store  │ │Provider │      │Cache   │  │Parser   │
└───────┘ └─────────┘      └────────┘  └─────────┘
     │         │                 │          │
     │         │                 │          │
     └─────────┴─────────────────┴──────────┘
                        │
               ┌────────▼─────────┐
               │ Persisted Storage│
               │  (Cache, Index)  │
               └──────────────────┘
```

---

## Performance Considerations

### Bundle Size
- Embedding providers are lazy-loaded
- Document parsing uses streaming where possible
- Vector store uses efficient in-memory structures
- Total added bundle size: ~50KB (excluding cheerio)

### Memory Usage
- Vector embeddings: ~6KB per document (1536 dims)
- Document cache: ~10KB per doc average
- Vector store: O(n) space complexity
- Recommended max docs: 10,000 (60MB RAM)

### Network
- Fetching docs: ~20 requests for full documentation
- Rate limited to 2 requests/second
- Background fetching prevents UI blocking
- Cache reduces network usage by 95%+

### Performance Budgets
- Initial index creation: <5 seconds (20 docs)
- Query embedding generation: <500ms
- Hybrid search: <100ms (1000 docs)
- Cache lookup: <10ms

---

## Feature Flags

All Phase 2.5 features are feature-flagged:

```typescript
// Check if vector search is enabled
if (config.get('mydba.ai.useVectorSearch')) {
    // Use enhanced RAG with vectors
} else {
    // Fall back to keyword-only search
}

// Check if live docs are enabled
if (config.get('mydba.ai.liveDocsEnabled')) {
    // Fetch live documentation
} else {
    // Use bundled static docs
}
```

**Default Settings:**
- Vector search: **Disabled** (requires OpenAI API key)
- Live docs: **Enabled** (uses cached docs)
- Background fetch: **Enabled**
- Auto version detection: **Enabled**

---

## Migration Guide

### From Phase 2 to Phase 2.5

1. **Install Dependencies:**
   ```bash
   npm install cheerio@^1.0.0
   ```

2. **Update Service Container:**
   ```typescript
   // Register enhanced services
   container.register(SERVICE_TOKENS.EnhancedRAGService, (c) =>
       new EnhancedRAGService(
           c.get(SERVICE_TOKENS.Logger),
           embeddingProvider
       )
   );

   container.register(SERVICE_TOKENS.LiveDocService, (c) =>
       new LiveDocService(
           c.get(SERVICE_TOKENS.Logger),
           c.get(SERVICE_TOKENS.EnhancedRAGService)
       )
   );
   ```

3. **Initialize Services:**
   ```typescript
   // In extension.ts activate()
   const enhancedRAG = container.get(SERVICE_TOKENS.EnhancedRAGService);
   await enhancedRAG.initialize(context.extensionPath, {
       embeddingApiKey: config.get('mydba.ai.openaiKey')
   });

   const liveDocService = container.get(SERVICE_TOKENS.LiveDocService);
   await liveDocService.initialize();
   
   // Optional: Fetch docs in background
   if (config.get('mydba.ai.backgroundFetchOnStartup')) {
       liveDocService.fetchInBackground('mysql', '8.0', 20);
   }
   ```

4. **Update AI Providers:**
   Replace `ragService.retrieveRelevantDocs()` with `enhancedRAG.retrieveRelevantDocs()`

---

## Testing

### Unit Tests

```typescript
describe('EnhancedRAGService', () => {
    test('should perform hybrid search', async () => {
        const service = new EnhancedRAGService(logger, mockEmbedding);
        await service.initialize(extensionPath);
        
        const results = await service.retrieveRelevantDocs(
            'optimize index',
            'mysql',
            5
        );
        
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].semanticScore).toBeDefined();
        expect(results[0].keywordScore).toBeDefined();
    });
});

describe('VectorStore', () => {
    test('should calculate cosine similarity correctly', () => {
        const store = new VectorStore(logger);
        // Test similarity calculation
    });
});

describe('DocumentChunker', () => {
    test('should chunk by paragraph strategy', () => {
        const chunker = new DocumentChunker();
        const chunks = chunker.chunk(longDoc, 'Test Doc', {
            strategy: 'paragraph',
            maxChunkSize: 1000
        });
        
        expect(chunks.length).toBeGreaterThan(1);
    });
});
```

### Integration Tests

```typescript
describe('Live Documentation Fetching', () => {
    test('should fetch and parse MySQL docs', async () => {
        const service = new LiveDocService(logger, enhancedRAG);
        const docCount = await service.fetchAndIndexDocs('mysql', '8.0', {
            maxPages: 2 // Limit for testing
        });
        
        expect(docCount).toBeGreaterThan(0);
    });

    test('should use cached docs', async () => {
        // First fetch
        await service.fetchAndIndexDocs('mysql', '8.0');
        
        // Second fetch should use cache
        const start = Date.now();
        await service.fetchAndIndexDocs('mysql', '8.0');
        const duration = Date.now() - start;
        
        expect(duration).toBeLessThan(100); // Cache should be fast
    });
});
```

---

## Roadmap

### Future Enhancements

1. **Local Embeddings** (Phase 3)
   - Transformers.js integration
   - Zero-cost, privacy-friendly
   - Offline support

2. **PostgreSQL Support** (Phase 3)
   - PostgreSQL doc parser
   - PostgreSQL-specific optimizations

3. **Smart Caching** (Phase 3)
   - Incremental updates
   - Differential caching
   - Version migration

4. **Advanced Search** (Phase 3)
   - Multi-query retrieval
   - Re-ranking with cross-encoders
   - Query expansion

---

## Troubleshooting

### Vector Search Not Working
- Check if OpenAI API key is configured
- Verify `mydba.ai.useVectorSearch` is enabled
- Check logs for embedding errors

### Live Docs Failing
- Verify network connectivity
- Check if doc URLs are accessible
- Clear cache and retry: `mydba.clearDocCache`

### High Memory Usage
- Reduce `maxPagesToFetch`
- Disable background fetching
- Clear vector store: `mydba.clearVectorStore`

### Slow Performance
- Increase `hybridSearchWeights.keyword` (faster)
- Reduce chunk size
- Limit max docs retrieved

---

## Commands

New VS Code commands:

- `mydba.clearDocCache`: Clear documentation cache
- `mydba.clearVectorStore`: Clear vector embeddings
- `mydba.fetchLiveDocs`: Manually fetch documentation
- `mydba.showRAGStats`: Show RAG statistics

---

## Configuration Reference

```json
{
  // Vector Search
  "mydba.ai.useVectorSearch": false,
  "mydba.ai.embeddingProvider": "openai",
  "mydba.ai.hybridSearchWeights": {
    "semantic": 0.7,
    "keyword": 0.3
  },
  
  // Document Chunking
  "mydba.ai.chunkingStrategy": "paragraph",
  "mydba.ai.maxChunkSize": 1000,
  "mydba.ai.minChunkSize": 100,
  "mydba.ai.chunkOverlap": 200,
  
  // Live Documentation
  "mydba.ai.liveDocsEnabled": true,
  "mydba.ai.autoDetectVersion": true,
  "mydba.ai.backgroundFetchOnStartup": true,
  "mydba.ai.maxPagesToFetch": 20,
  "mydba.ai.docCacheTTL": 604800000,
  "mydba.ai.docCacheDir": ".doc-cache"
}
```

---

## License

Phase 2.5 features are part of MyDBA and licensed under Apache 2.0.

