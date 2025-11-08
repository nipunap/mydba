/**
 * LRU Cache Manager with event-driven invalidation
 * Provides multi-tier caching for schema, query results, and documentation
 */

import { ICacheManager, ICacheEntry } from './interfaces';
import { Logger } from '../utils/logger';
import { EventBus, EVENTS, QueryResult } from '../services/event-bus';

/**
 * Cache configuration for different types
 */
interface CacheConfig {
    maxSize: number;
    defaultTTL: number;
}

const CACHE_CONFIGS: Record<string, CacheConfig> = {
    schema: { maxSize: 100, defaultTTL: 3600000 }, // 1 hour
    query: { maxSize: 50, defaultTTL: 300000 },    // 5 minutes
    explain: { maxSize: 50, defaultTTL: 600000 },  // 10 minutes
    docs: { maxSize: 200, defaultTTL: Infinity }   // persistent
};

/**
 * LRU Cache implementation
 */
class LRUCache<T> {
    private cache = new Map<string, ICacheEntry<T>>();
    private accessOrder: string[] = [];

    constructor(
        private maxSize: number,
        private defaultTTL: number
    ) {}

    get(key: string): T | undefined {
        const entry = this.cache.get(key);

        if (!entry) {
            return undefined;
        }

        // Check if expired
        const now = Date.now();
        if (entry.ttl !== Infinity && now - entry.timestamp > entry.ttl) {
            this.cache.delete(key);
            this.removeFromAccessOrder(key);
            return undefined;
        }

        // Move to end (most recently used)
        this.removeFromAccessOrder(key);
        this.accessOrder.push(key);

        return entry.value;
    }

    set(key: string, value: T, ttl?: number): void {
        // Remove oldest if at capacity
        if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
            const oldest = this.accessOrder.shift();
            if (oldest) {
                this.cache.delete(oldest);
            }
        }

        const entry: ICacheEntry<T> = {
            value,
            timestamp: Date.now(),
            ttl: ttl ?? this.defaultTTL,
            version: 1
        };

        this.cache.set(key, entry);

        // Update access order
        this.removeFromAccessOrder(key);
        this.accessOrder.push(key);
    }

    has(key: string): boolean {
        return this.get(key) !== undefined;
    }

    delete(key: string): boolean {
        this.removeFromAccessOrder(key);
        return this.cache.delete(key);
    }

    clear(): void {
        this.cache.clear();
        this.accessOrder = [];
    }

    size(): number {
        return this.cache.size;
    }

    keys(): string[] {
        return Array.from(this.cache.keys());
    }

    private removeFromAccessOrder(key: string): void {
        const index = this.accessOrder.indexOf(key);
        if (index > -1) {
            this.accessOrder.splice(index, 1);
        }
    }
}

/**
 * Cache manager with event-driven invalidation
 */
export class CacheManager implements ICacheManager {
    private caches = new Map<string, LRUCache<unknown>>();
    private hits = 0;
    private misses = 0;
    private version = 1;

    constructor(
        private logger: Logger,
        private eventBus?: EventBus
    ) {
        // Initialize caches
        for (const [name, config] of Object.entries(CACHE_CONFIGS)) {
            this.caches.set(name, new LRUCache(config.maxSize, config.defaultTTL));
        }

        // Subscribe to QUERY_EXECUTED events for cache invalidation
        if (this.eventBus) {
            this.eventBus.on(EVENTS.QUERY_EXECUTED, (data: QueryResult) => {
                this.handleQueryExecuted(data);
            });
        }
    }

    /**
     * Handle QUERY_EXECUTED event for cache invalidation
     */
    private handleQueryExecuted(data: QueryResult): void {
        // Only invalidate on write operations
        const query = data.query.toUpperCase();
        const isWriteOp = /^\s*(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE|RENAME)\b/i.test(query);

        if (isWriteOp) {
            // Invalidate query cache for this connection
            const pattern = new RegExp(`^query:${data.connectionId}:`);
            this.invalidatePattern(pattern);
            this.logger.debug(`Cache invalidated for write operation on connection: ${data.connectionId}`);
        }
    }

    /**
     * Initialize the cache manager
     */
    async init(): Promise<void> {
        this.logger.info('Cache manager initialized');
    }

    /**
     * Get a value from cache
     */
    get<T>(key: string): T | undefined {
        const [cacheName, cacheKey] = this.parseKey(key);
        const cache = this.caches.get(cacheName);

        if (!cache) {
            this.logger.warn(`Cache not found: ${cacheName}`);
            this.misses++;
            return undefined;
        }

        const value = cache.get(cacheKey);

        if (value === undefined) {
            this.misses++;
            this.logger.debug(`Cache miss: ${key}`);
        } else {
            this.hits++;
            this.logger.debug(`Cache hit: ${key}`);
        }

        return value as T | undefined;
    }

    /**
     * Set a value in cache
     */
    set<T>(key: string, value: T, ttl?: number): void {
        const [cacheName, cacheKey] = this.parseKey(key);
        const cache = this.caches.get(cacheName);

        if (!cache) {
            this.logger.warn(`Cache not found: ${cacheName}`);
            return;
        }

        cache.set(cacheKey, value, ttl);
        this.logger.debug(`Cache set: ${key}`);
    }

    /**
     * Check if key exists in cache
     */
    has(key: string): boolean {
        const [cacheName, cacheKey] = this.parseKey(key);
        const cache = this.caches.get(cacheName);

        if (!cache) {
            return false;
        }

        return cache.has(cacheKey);
    }

    /**
     * Invalidate a specific key
     */
    invalidate(key: string): void {
        const [cacheName, cacheKey] = this.parseKey(key);
        const cache = this.caches.get(cacheName);

        if (cache) {
            cache.delete(cacheKey);
            this.logger.debug(`Cache invalidated: ${key}`);
        }
    }

    /**
     * Invalidate keys matching a pattern
     */
    invalidatePattern(pattern: RegExp): void {
        let count = 0;

        for (const [cacheName, cache] of this.caches) {
            const keys = cache.keys();
            for (const key of keys) {
                const fullKey = `${cacheName}:${key}`;
                if (pattern.test(fullKey)) {
                    cache.delete(key);
                    count++;
                }
            }
        }

        this.logger.info(`Invalidated ${count} cache entries matching pattern: ${pattern}`);
    }

    /**
     * Clear all caches
     */
    clear(): void {
        for (const cache of this.caches.values()) {
            cache.clear();
        }

        this.hits = 0;
        this.misses = 0;
        this.version++;

        this.logger.info('All caches cleared');
    }

    /**
     * Clear a specific cache tier
     */
    clearTier(tier: string): void {
        const cache = this.caches.get(tier);
        if (cache) {
            cache.clear();
            this.logger.info(`Cleared cache tier: ${tier}`);
        }
    }

    /**
     * Get cache statistics
     */
    getStats(): { hits: number; misses: number; hitRate: number } {
        const total = this.hits + this.misses;
        const hitRate = total > 0 ? this.hits / total : 0;

        return {
            hits: this.hits,
            misses: this.misses,
            hitRate
        };
    }

    /**
     * Get detailed statistics for all cache tiers
     */
    getDetailedStats(): Record<string, { size: number; maxSize: number; hitRate: number }> {
        const stats: Record<string, { size: number; maxSize: number; hitRate: number }> = {};

        for (const [name, cache] of this.caches) {
            const config = CACHE_CONFIGS[name];
            stats[name] = {
                size: cache.size(),
                maxSize: config.maxSize,
                hitRate: this.getStats().hitRate
            };
        }

        return stats;
    }

    /**
     * Handle schema change event (invalidate schema and related caches)
     */
    onSchemaChanged(connectionId: string, schema?: string): void {
        const pattern = schema
            ? new RegExp(`^schema:${connectionId}:${schema}`)
            : new RegExp(`^schema:${connectionId}`);

        this.invalidatePattern(pattern);

        // Also invalidate related query and explain caches
        const queryPattern = new RegExp(`^(query|explain):${connectionId}`);
        this.invalidatePattern(queryPattern);

        this.logger.info(`Invalidated caches for connection ${connectionId} due to schema change`);
    }

    /**
     * Handle connection removed event
     */
    onConnectionRemoved(connectionId: string): void {
        const pattern = new RegExp(`^[^:]+:${connectionId}`);
        this.invalidatePattern(pattern);

        this.logger.info(`Invalidated all caches for removed connection ${connectionId}`);
    }

    /**
     * Parse cache key into cache name and key
     */
    private parseKey(key: string): [string, string] {
        const parts = key.split(':', 2);
        if (parts.length !== 2) {
            throw new Error(`Invalid cache key format: ${key}. Expected format: cacheName:key`);
        }

        return [parts[0], parts[1]];
    }

    /**
     * Get cache version (incremented on clear)
     */
    getVersion(): number {
        return this.version;
    }

    /**
     * Dispose of the cache manager
     */
    dispose(): void {
        this.clear();
        this.caches.clear();
        this.logger.info('Cache manager disposed');
    }
}

/**
 * Helper function to generate cache keys
 */
export class CacheKeyBuilder {
    static schema(connectionId: string, database: string, table?: string): string {
        return table
            ? `schema:${connectionId}:${database}:${table}`
            : `schema:${connectionId}:${database}`;
    }

    static query(connectionId: string, queryHash: string): string {
        return `query:${connectionId}:${queryHash}`;
    }

    static explain(connectionId: string, queryHash: string): string {
        return `explain:${connectionId}:${queryHash}`;
    }

    static docs(docId: string): string {
        return `docs:${docId}`;
    }

    /**
     * Generate a hash for a query (simple hash for caching)
     */
    static hashQuery(query: string): string {
        let hash = 0;
        for (let i = 0; i < query.length; i++) {
            const char = query.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(36);
    }
}
