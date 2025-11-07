/**
 * Documentation Cache Service
 * 
 * Caches parsed documentation with TTL
 * Supports persistence to disk for faster cold starts
 */

import { Logger } from '../../utils/logger';
import { RAGDocument } from '../../types/ai-types';
import * as fs from 'fs';
import * as path from 'path';

export interface CacheEntry {
    documents: RAGDocument[];
    timestamp: number;
    version: string;
    dbType: 'mysql' | 'mariadb';
}

export interface DocCacheOptions {
    cachedir?: string;
    ttl?: number; // Time to live in milliseconds (default: 7 days)
}

/**
 * Documentation Cache
 */
export class DocCache {
    private cache = new Map<string, CacheEntry>();
    private cacheDir: string;
    private ttl: number;

    constructor(
        private logger: Logger,
        options?: DocCacheOptions
    ) {
        this.cacheDir = options?.cacheDir || '.doc-cache';
        this.ttl = options?.ttl || 7 * 24 * 60 * 60 * 1000; // 7 days default
    }

    /**
     * Get cached documents
     */
    get(dbType: 'mysql' | 'mariadb', version: string): RAGDocument[] | null {
        const key = this.getCacheKey(dbType, version);
        const entry = this.cache.get(key);

        if (!entry) {
            // Try to load from disk
            const diskEntry = this.loadFromDisk(key);
            if (diskEntry) {
                this.cache.set(key, diskEntry);
                return diskEntry.documents;
            }
            return null;
        }

        // Check if expired
        if (this.isExpired(entry)) {
            this.logger.debug(`Cache expired for ${dbType} ${version}`);
            this.cache.delete(key);
            this.deleteFromDisk(key);
            return null;
        }

        this.logger.debug(`Cache hit for ${dbType} ${version} (${entry.documents.length} docs)`);
        return entry.documents;
    }

    /**
     * Set cache entry
     */
    set(dbType: 'mysql' | 'mariadb', version: string, documents: RAGDocument[]): void {
        const key = this.getCacheKey(dbType, version);
        const entry: CacheEntry = {
            documents,
            timestamp: Date.now(),
            version,
            dbType,
        };

        this.cache.set(key, entry);
        this.saveToDisk(key, entry);
        this.logger.info(`Cached ${documents.length} documents for ${dbType} ${version}`);
    }

    /**
     * Check if entry is expired
     */
    private isExpired(entry: CacheEntry): boolean {
        return Date.now() - entry.timestamp > this.ttl;
    }

    /**
     * Generate cache key
     */
    private getCacheKey(dbType: string, version: string): string {
        return `${dbType}-${version}`;
    }

    /**
     * Get cache file path
     */
    private getCacheFilePath(key: string): string {
        return path.join(this.cacheDir, `${key}.json`);
    }

    /**
     * Save cache entry to disk
     */
    private saveToDisk(key: string, entry: CacheEntry): void {
        try {
            // Ensure cache directory exists
            if (!fs.existsSync(this.cacheDir)) {
                fs.mkdirSync(this.cacheDir, { recursive: true });
            }

            const filePath = this.getCacheFilePath(key);
            fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf8');
            this.logger.debug(`Saved cache to disk: ${filePath}`);
        } catch (error) {
            this.logger.warn(`Failed to save cache to disk:`, error as Error);
        }
    }

    /**
     * Load cache entry from disk
     */
    private loadFromDisk(key: string): CacheEntry | null {
        try {
            const filePath = this.getCacheFilePath(key);
            
            if (!fs.existsSync(filePath)) {
                return null;
            }

            const data = fs.readFileSync(filePath, 'utf8');
            const entry = JSON.parse(data) as CacheEntry;

            // Check if expired
            if (this.isExpired(entry)) {
                this.deleteFromDisk(key);
                return null;
            }

            this.logger.debug(`Loaded cache from disk: ${filePath}`);
            return entry;
        } catch (error) {
            this.logger.warn(`Failed to load cache from disk:`, error as Error);
            return null;
        }
    }

    /**
     * Delete cache entry from disk
     */
    private deleteFromDisk(key: string): void {
        try {
            const filePath = this.getCacheFilePath(key);
            
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                this.logger.debug(`Deleted cache file: ${filePath}`);
            }
        } catch (error) {
            this.logger.warn(`Failed to delete cache file:`, error as Error);
        }
    }

    /**
     * Clear all cache
     */
    clear(): void {
        this.cache.clear();
        
        // Clear disk cache
        try {
            if (fs.existsSync(this.cacheDir)) {
                const files = fs.readdirSync(this.cacheDir);
                for (const file of files) {
                    if (file.endsWith('.json')) {
                        fs.unlinkSync(path.join(this.cacheDir, file));
                    }
                }
            }
            this.logger.info('Cleared documentation cache');
        } catch (error) {
            this.logger.warn('Failed to clear disk cache:', error as Error);
        }
    }

    /**
     * Get cache statistics
     */
    getStats(): {
        entries: number;
        totalDocuments: number;
        memorySize: number;
        diskFiles: number;
    } {
        let totalDocs = 0;
        for (const entry of this.cache.values()) {
            totalDocs += entry.documents.length;
        }

        let diskFiles = 0;
        try {
            if (fs.existsSync(this.cacheDir)) {
                diskFiles = fs.readdirSync(this.cacheDir).filter(f => f.endsWith('.json')).length;
            }
        } catch {
            // Ignore errors
        }

        return {
            entries: this.cache.size,
            totalDocuments: totalDocs,
            memorySize: this.cache.size,
            diskFiles,
        };
    }
}

