/**
 * Enhanced RAG Service with Vector Search
 *
 * Combines keyword-based retrieval (Phase 1) with vector-based semantic search (Phase 2.5)
 * Falls back to keyword-only if embeddings are not available
 */

import { RAGDocument } from '../../types/ai-types';
import { Logger } from '../../utils/logger';
import { VectorStore, VectorDocument, HybridSearchResult } from './vector-store';
import { EmbeddingProvider, EmbeddingProviderFactory } from './embedding-provider';
import { DocumentChunker } from './document-chunker';
import { RAGService } from '../rag-service';
import * as crypto from 'crypto';

export interface EnhancedRAGOptions {
    useVectorSearch?: boolean; // Enable vector search (default: true if embedding provider available)
    hybridSearchWeights?: {
        semantic: number; // 0-1, default 0.7
        keyword: number; // 0-1, default 0.3
    };
    chunkingStrategy?: 'sentence' | 'paragraph' | 'fixed' | 'markdown';
    maxChunkSize?: number;
}

/**
 * Enhanced RAG Service
 */
export class EnhancedRAGService {
    private vectorStore: VectorStore;
    private embeddingProvider?: EmbeddingProvider;
    private documentChunker: DocumentChunker;
    private fallbackRAG: RAGService;
    private isVectorSearchEnabled = false;
    private indexedDocuments = new Set<string>();

    constructor(
        private logger: Logger,
        embeddingProvider?: EmbeddingProvider
    ) {
        this.vectorStore = new VectorStore(logger);
        this.embeddingProvider = embeddingProvider;
        this.documentChunker = new DocumentChunker();
        this.fallbackRAG = new RAGService(logger);
    }

    /**
     * Initialize the service
     */
    async initialize(extensionPath: string, options?: {
        embeddingApiKey?: string;
        useOpenAI?: boolean;
    }): Promise<void> {
        this.logger.info('Initializing Enhanced RAG Service...');

        // Initialize fallback RAG service
        await this.fallbackRAG.initialize(extensionPath);

        // Initialize embedding provider if not provided
        if (!this.embeddingProvider) {
            try {
                this.embeddingProvider = await EmbeddingProviderFactory.getBestAvailable({
                    openaiKey: options?.embeddingApiKey,
                });

                this.isVectorSearchEnabled = await this.embeddingProvider.isAvailable();
                this.logger.info(
                    `Vector search enabled: ${this.isVectorSearchEnabled} (provider: ${this.embeddingProvider.name})`
                );
            } catch (error) {
                this.logger.warn('Failed to initialize embedding provider, falling back to keyword search:', error as Error);
                this.isVectorSearchEnabled = false;
            }
        } else {
            this.isVectorSearchEnabled = await this.embeddingProvider.isAvailable();
        }

        this.logger.info('Enhanced RAG Service initialized');
    }

    /**
     * Index documents with embeddings
     */
    async indexDocuments(
        documents: RAGDocument[],
        options?: {
            chunkLargeDocs?: boolean;
            maxChunkSize?: number;
        }
    ): Promise<void> {
        if (!this.isVectorSearchEnabled || !this.embeddingProvider) {
            this.logger.warn('Vector search not available, skipping indexing');
            return;
        }

        this.logger.info(`Indexing ${documents.length} documents with embeddings...`);

        const vectorDocuments: VectorDocument[] = [];
        const textsToEmbed: string[] = [];

        for (const doc of documents) {
            // Skip if already indexed
            const docId = this.generateDocId(doc);
            if (this.indexedDocuments.has(docId)) {
                continue;
            }

            // Chunk large documents if requested
            if (options?.chunkLargeDocs && doc.content.length > (options.maxChunkSize || 1000)) {
                const chunks = this.documentChunker.smartChunk(
                    doc.content,
                    doc.title,
                    {
                        maxChunkSize: options.maxChunkSize || 1000,
                        minChunkSize: 100,
                    }
                );

                for (const chunk of chunks) {
                    const chunkId = `${docId}-chunk-${chunk.metadata.chunkIndex}`;
                    textsToEmbed.push(chunk.text);

                    vectorDocuments.push({
                        id: chunkId,
                        text: chunk.text,
                        embedding: [], // Will be filled later
                        metadata: {
                            title: `${doc.title} (${chunk.metadata.chunkIndex + 1}/${chunk.metadata.totalChunks})`,
                            source: doc.source,
                            dbType: this.detectDbType(doc.source),
                            keywords: doc.keywords,
                            originalDocId: docId,
                            isChunk: true,
                            chunkIndex: chunk.metadata.chunkIndex,
                            totalChunks: chunk.metadata.totalChunks,
                        },
                    });
                }
            } else {
                textsToEmbed.push(doc.content);

                vectorDocuments.push({
                    id: docId,
                    text: doc.content,
                    embedding: [], // Will be filled later
                    metadata: {
                        title: doc.title,
                        source: doc.source,
                        dbType: this.detectDbType(doc.source),
                        keywords: doc.keywords,
                        isChunk: false,
                    },
                });
            }

            this.indexedDocuments.add(docId);
        }

        if (textsToEmbed.length === 0) {
            this.logger.info('No new documents to index');
            return;
        }

        // Generate embeddings in batch
        this.logger.info(`Generating ${textsToEmbed.length} embeddings...`);

        try {
            const embeddings = await this.embeddingProvider.embedBatch(textsToEmbed);

            // Add embeddings to vector documents
            for (let i = 0; i < vectorDocuments.length; i++) {
                vectorDocuments[i].embedding = embeddings[i].vector;
            }

            // Add to vector store
            this.vectorStore.addBatch(vectorDocuments);

            this.logger.info(`Indexed ${vectorDocuments.length} document chunks with embeddings`);
        } catch (error) {
            this.logger.error('Failed to generate embeddings:', error as Error);
            throw error;
        }
    }

    /**
     * Retrieve relevant documents (hybrid: vector + keyword)
     */
    async retrieveRelevantDocs(
        query: string,
        dbType: 'mysql' | 'mariadb' = 'mysql',
        maxDocs: number = 3,
        options?: EnhancedRAGOptions
    ): Promise<RAGDocument[]> {
        const useVectorSearch = options?.useVectorSearch ?? this.isVectorSearchEnabled;

        // Fall back to keyword-only search if vector search is disabled
        if (!useVectorSearch || !this.embeddingProvider) {
            this.logger.debug('Using keyword-only search (fallback)');
            return this.fallbackRAG.retrieveRelevantDocs(query, dbType, maxDocs);
        }

        try {
            // Generate query embedding
            this.logger.debug('Generating query embedding...');
            const queryEmbedding = await this.embeddingProvider.embed(query);

            // Hybrid search
            const weights = options?.hybridSearchWeights ?? { semantic: 0.7, keyword: 0.3 };

            const results = this.vectorStore.hybridSearch(
                queryEmbedding.vector,
                query,
                {
                    limit: maxDocs,
                    semanticWeight: weights.semantic,
                    keywordWeight: weights.keyword,
                    filter: (doc) => doc.metadata.dbType === dbType || doc.metadata.dbType === 'general',
                }
            );

            this.logger.debug(
                `Hybrid search returned ${results.length} results (semantic: ${weights.semantic}, keyword: ${weights.keyword})`
            );

            // Convert to RAGDocument format
            return this.convertToRAGDocuments(results);
        } catch (error) {
            this.logger.error('Vector search failed, falling back to keyword search:', error as Error);
            return this.fallbackRAG.retrieveRelevantDocs(query, dbType, maxDocs);
        }
    }

    /**
     * Get statistics
     */
    getStats(): {
        vectorSearchEnabled: boolean;
        embeddingProvider?: string;
        vectorStore: ReturnType<VectorStore['getStats']>;
        fallbackDocs: ReturnType<RAGService['getStats']>;
    } {
        return {
            vectorSearchEnabled: this.isVectorSearchEnabled,
            embeddingProvider: this.embeddingProvider?.name,
            vectorStore: this.vectorStore.getStats(),
            fallbackDocs: this.fallbackRAG.getStats(),
        };
    }

    /**
     * Export vector store (for caching)
     */
    exportVectorStore(): string {
        return this.vectorStore.export();
    }

    /**
     * Import vector store (from cache)
     */
    importVectorStore(json: string): void {
        this.vectorStore.import(json);
        this.logger.info('Imported vector store from cache');
    }

    /**
     * Clear vector store
     */
    clearVectorStore(): void {
        this.vectorStore.clear();
        this.indexedDocuments.clear();
        this.logger.info('Cleared vector store');
    }

    /**
     * Helper: Generate document ID
     */
    private generateDocId(doc: RAGDocument): string {
        return crypto.createHash('md5').update(doc.title + doc.source).digest('hex');
    }

    /**
     * Helper: Detect database type from source
     */
    private detectDbType(source: string): 'mysql' | 'mariadb' | 'postgresql' | 'general' {
        const lowerSource = source.toLowerCase();

        if (lowerSource.includes('mariadb')) {
            return 'mariadb';
        }
        if (lowerSource.includes('mysql')) {
            return 'mysql';
        }
        if (lowerSource.includes('postgres')) {
            return 'postgresql';
        }

        return 'general';
    }

    /**
     * Helper: Convert hybrid search results to RAGDocuments
     */
    private convertToRAGDocuments(results: HybridSearchResult[]): RAGDocument[] {
        return results.map(result => ({
            title: result.document.metadata.title,
            content: result.document.text,
            source: result.document.metadata.source,
            keywords: (result.document.metadata.keywords as string[]) || [],
            // Add semantic relevance score
            relevanceScore: result.combinedScore,
            semanticScore: result.semanticScore,
            keywordScore: result.keywordScore,
        }));
    }
}
