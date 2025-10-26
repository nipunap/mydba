# Performance & Scalability ARD

**Document Type**: Architecture Requirement Document (ARD)
**Version**: 1.0
**Last Updated**: October 25, 2025
**Status**: Approved for Implementation

---

## 1. Overview

Define performance requirements, caching strategies, and scalability patterns for MyDBA extension.

---

## 2. Performance Targets

| Operation | Target (p95) | Max Acceptable |
|-----------|--------------|----------------|
| Extension activation | 500ms | 1s |
| Connection test | 2s | 5s |
| Tree view refresh | 200ms | 500ms |
| Query execution | Variable | 30s timeout |
| EXPLAIN visualization | 300ms | 1s |
| AI analysis | 3s | 10s |
| Webview render | 300ms | 1s |

---

## 3. Resource Limits

| Resource | Limit | Rationale |
|----------|-------|-----------|
| Memory (idle) | 50MB | VSCode best practices |
| Memory (active) | 200MB | With caching, metrics |
| CPU (idle) | 0% | No background polling |
| CPU (active) | 5% | Metrics collection |
| Concurrent connections | 10 | Per extension |
| Metrics history | 1 hour | Rolling window |

---

## 4. Caching Strategy

### 4.1 Cache Layers
```typescript
interface CacheLayer {
  // Schema metadata (1 hour TTL)
  schemaCache: LRUCache<string, TableSchema>;

  // Query results (5 min TTL, max 10 entries)
  queryResultCache: LRUCache<string, QueryResult>;

  // RAG docs (persist across sessions)
  ragCache: PersistentCache<string, DocSegment[]>;

  // EXPLAIN plans (10 min TTL)
  explainCache: LRUCache<string, ExplainResult>;
}
```

### 4.2 Cache Invalidation
- Schema changes → Clear schema cache
- Connection disconnect → Clear all caches
- Manual refresh → Clear specific cache

---

## 5. Lazy Loading

### 5.1 Tree View
- Load databases on expand
- Load tables on expand
- Load columns on expand
- Cache expanded state

### 5.2 Webviews
- Create on-demand
- Dispose when hidden > 5 minutes
- Max 3 active webviews

---

## 6. Profiling Overhead

### 6.1 Performance Schema Impact
- **CPU**: ≤ 2% overhead (MySQL 8.0+)
- **Memory**: ~10MB per connection
- **Disk**: Minimal (in-memory tables)

### 6.2 Mitigation
- Auto-disable if overhead > 5%
- Configurable timeout (default 30s)
- Production warnings

---

## 7. Scalability Patterns

### 7.1 Connection Pooling
- 5-10 connections per database
- Idle timeout: 5 minutes
- Acquire timeout: 10 seconds

### 7.2 Async Operations
- Non-blocking UI updates
- Background metrics collection
- Streaming for large results

---

## 8. Monitoring

### 8.1 Performance Metrics
```typescript
interface PerformanceMetrics {
  extensionActivationTime: number;
  queryExecutionTimes: number[];
  webviewRenderTimes: number[];
  aiRequestTimes: number[];
  memoryUsage: number;
  cpuUsage: number;
}
```

### 8.2 Alerts
- Memory usage > 150MB
- CPU usage > 10%
- Query timeout > 20s
- AI request timeout > 8s

---

**Status**: Approved
**Next Steps**: Implement caching layer, performance monitoring, lazy loading
