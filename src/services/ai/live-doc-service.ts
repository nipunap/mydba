/**
 * Live Documentation Service
 * 
 * Orchestrates live documentation fetching, parsing, caching, and indexing
 * Integrates with Enhanced RAG Service for vector search
 */

import { Logger } from '../../utils/logger';
import { RAGDocument } from '../../types/ai-types';
import { DocParserFactory, MySQLDocParser, MariaDBDocParser } from './doc-parser';
import { DocCache } from './doc-cache';
import { EnhancedRAGService } from './enhanced-rag-service';

export interface LiveDocServiceOptions {
    enableBackgroundFetch?: boolean; // Fetch docs in background on startup
    autoDetectVersion?: boolean; // Auto-detect DB version from connection
    cacheDir?: string;
    cacheTTL?: number;
    maxPages?: number;
}

/**
 * Live Documentation Service
 */
export class LiveDocService {
    private docCache: DocCache;
    private isFetching = false;
    private fetchQueue: Array<{ dbType: 'mysql' | 'mariadb'; version: string }> = [];

    constructor(
        private logger: Logger,
        private enhancedRAG: EnhancedRAGService,
        options?: LiveDocServiceOptions
    ) {
        this.docCache = new DocCache(logger, {
            cacheDir: options?.cacheDir || '.doc-cache',
            ttl: options?.cacheTTL || 7 * 24 * 60 * 60 * 1000, // 7 days
        });
    }

    /**
     * Initialize service
     */
    async initialize(): Promise<void> {
        this.logger.info('Initializing Live Documentation Service...');
        // Service is ready to fetch on-demand
    }

    /**
     * Fetch and index documentation for a specific database and version
     */
    async fetchAndIndexDocs(
        dbType: 'mysql' | 'mariadb',
        version: string,
        options?: {
            forceRefresh?: boolean;
            maxPages?: number;
        }
    ): Promise<number> {
        // Check cache first (unless force refresh)
        if (!options?.forceRefresh) {
            const cached = this.docCache.get(dbType, version);
            if (cached) {
                this.logger.info(`Using cached documentation for ${dbType} ${version} (${cached.length} docs)`);
                // Index cached docs
                await this.enhancedRAG.indexDocuments(cached, {
                    chunkLargeDocs: true,
                    maxChunkSize: 1000,
                });
                return cached.length;
            }
        }

        // Add to queue and process
        this.fetchQueue.push({ dbType, version });
        return await this.processFetchQueue(options?.maxPages);
    }

    /**
     * Process fetch queue (one at a time to avoid overwhelming the server)
     */
    private async processFetchQueue(maxPages?: number): Promise<number> {
        if (this.isFetching) {
            this.logger.debug('Already fetching documentation, queued for later');
            return 0;
        }

        this.isFetching = true;
        let totalDocs = 0;

        try {
            while (this.fetchQueue.length > 0) {
                const item = this.fetchQueue.shift();
                if (!item) {
                    break; // Queue is empty
                }
                const { dbType, version } = item;
                
                this.logger.info(`Fetching live documentation for ${dbType} ${version}...`);

                try {
                    const docs = await this.fetchDocs(dbType, version, maxPages);
                    
                    if (docs.length > 0) {
                        // Cache the docs
                        this.docCache.set(dbType, version, docs);

                        // Index with embeddings
                        await this.enhancedRAG.indexDocuments(docs, {
                            chunkLargeDocs: true,
                            maxChunkSize: 1000,
                        });

                        totalDocs += docs.length;
                        this.logger.info(`Fetched and indexed ${docs.length} documents for ${dbType} ${version}`);
                    } else {
                        this.logger.warn(`No documents fetched for ${dbType} ${version}`);
                    }
                } catch (error) {
                    this.logger.error(`Failed to fetch docs for ${dbType} ${version}:`, error as Error);
                }
            }
        } finally {
            this.isFetching = false;
        }

        return totalDocs;
    }

    /**
     * Fetch documentation from web
     */
    private async fetchDocs(
        dbType: 'mysql' | 'mariadb',
        version: string,
        maxPages?: number
    ): Promise<RAGDocument[]> {
        const parser = DocParserFactory.create(dbType, this.logger);
        const urls = await parser.getDocUrls(version);
        const limitedUrls = maxPages ? urls.slice(0, maxPages) : urls;

        this.logger.info(`Fetching ${limitedUrls.length} pages for ${dbType} ${version}...`);

        const allDocs: RAGDocument[] = [];

        for (const url of limitedUrls) {
            try {
                const sections = await parser.parseDoc(url);
                
                // Convert to RAG documents
                const docs = dbType === 'mysql' 
                    ? (parser as MySQLDocParser).toRAGDocuments(sections, version)
                    : (parser as MariaDBDocParser).toRAGDocuments(sections, version);

                allDocs.push(...docs);

                // Rate limiting: wait between requests
                await this.sleep(500); // 500ms between requests
            } catch (error) {
                this.logger.warn(`Failed to fetch ${url}:`, error as Error);
                // Continue with other URLs
            }
        }

        return allDocs;
    }

    /**
     * Fetch documentation in background (non-blocking)
     */
    async fetchInBackground(
        dbType: 'mysql' | 'mariadb',
        version: string,
        maxPages?: number
    ): Promise<void> {
        // Don't await, let it run in background
        this.fetchAndIndexDocs(dbType, version, { maxPages }).catch(error => {
            this.logger.error('Background doc fetch failed:', error as Error);
        });
        
        this.logger.info(`Queued background documentation fetch for ${dbType} ${version}`);
    }

    /**
     * Check if documentation is cached
     */
    isCached(dbType: 'mysql' | 'mariadb', version: string): boolean {
        return this.docCache.get(dbType, version) !== null;
    }

    /**
     * Clear cache
     */
    clearCache(): void {
        this.docCache.clear();
        this.logger.info('Cleared documentation cache');
    }

    /**
     * Get statistics
     */
    getStats(): {
        cache: ReturnType<DocCache['getStats']>;
        queueLength: number;
        isFetching: boolean;
    } {
        return {
            cache: this.docCache.getStats(),
            queueLength: this.fetchQueue.length,
            isFetching: this.isFetching,
        };
    }

    /**
     * Sleep helper
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

