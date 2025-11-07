/**
 * Vector Store
 * 
 * In-memory vector database with cosine similarity search
 * Supports persistence to disk for caching
 */

import { Logger } from '../../utils/logger';

export interface VectorDocument {
    id: string;
    text: string;
    embedding: number[];
    metadata: {
        title: string;
        source: string;
        dbType: 'mysql' | 'mariadb' | 'postgresql' | 'general';
        version?: string;
        category?: string;
        url?: string;
        keywords?: string[];
        [key: string]: unknown;
    };
}

export interface SearchResult {
    document: VectorDocument;
    score: number; // Cosine similarity (0-1, higher is better)
}

export interface HybridSearchResult {
    document: VectorDocument;
    semanticScore: number;
    keywordScore: number;
    combinedScore: number;
}

/**
 * Vector Store with cosine similarity search
 */
export class VectorStore {
    private documents: Map<string, VectorDocument> = new Map();
    private dimension: number = 0;

    constructor(private logger: Logger) {}

    /**
     * Add a document to the store
     */
    add(document: VectorDocument): void {
        if (this.dimension === 0) {
            this.dimension = document.embedding.length;
        } else if (document.embedding.length !== this.dimension) {
            throw new Error(
                `Embedding dimension mismatch: expected ${this.dimension}, got ${document.embedding.length}`
            );
        }

        this.documents.set(document.id, document);
        this.logger.debug(`Added document to vector store: ${document.id}`);
    }

    /**
     * Add multiple documents
     */
    addBatch(documents: VectorDocument[]): void {
        documents.forEach(doc => this.add(doc));
        this.logger.info(`Added ${documents.length} documents to vector store`);
    }

    /**
     * Remove a document
     */
    remove(id: string): boolean {
        const deleted = this.documents.delete(id);
        if (deleted) {
            this.logger.debug(`Removed document from vector store: ${id}`);
        }
        return deleted;
    }

    /**
     * Get a document by ID
     */
    get(id: string): VectorDocument | undefined {
        return this.documents.get(id);
    }

    /**
     * Search for similar documents using cosine similarity
     */
    search(queryEmbedding: number[], options?: {
        limit?: number;
        threshold?: number;
        filter?: (doc: VectorDocument) => boolean;
    }): SearchResult[] {
        const limit = options?.limit ?? 10;
        const threshold = options?.threshold ?? 0.0;

        const results: SearchResult[] = [];

        for (const doc of this.documents.values()) {
            // Apply filter if provided
            if (options?.filter && !options.filter(doc)) {
                continue;
            }

            const score = this.cosineSimilarity(queryEmbedding, doc.embedding);

            if (score >= threshold) {
                results.push({ document: doc, score });
            }
        }

        // Sort by score descending
        results.sort((a, b) => b.score - a.score);

        return results.slice(0, limit);
    }

    /**
     * Hybrid search combining semantic (vector) and keyword matching
     */
    hybridSearch(
        queryEmbedding: number[],
        queryText: string,
        options?: {
            limit?: number;
            semanticWeight?: number; // 0-1, default 0.7
            keywordWeight?: number; // 0-1, default 0.3
            filter?: (doc: VectorDocument) => boolean;
        }
    ): HybridSearchResult[] {
        const limit = options?.limit ?? 10;
        const semanticWeight = options?.semanticWeight ?? 0.7;
        const keywordWeight = options?.keywordWeight ?? 0.3;

        const results: HybridSearchResult[] = [];
        const queryTerms = this.tokenize(queryText.toLowerCase());

        for (const doc of this.documents.values()) {
            // Apply filter if provided
            if (options?.filter && !options.filter(doc)) {
                continue;
            }

            // Semantic score (cosine similarity)
            const semanticScore = this.cosineSimilarity(queryEmbedding, doc.embedding);

            // Keyword score (TF-IDF-like)
            const keywordScore = this.keywordMatch(queryTerms, doc);

            // Combined score
            const combinedScore = (semanticScore * semanticWeight) + (keywordScore * keywordWeight);

            results.push({
                document: doc,
                semanticScore,
                keywordScore,
                combinedScore,
            });
        }

        // Sort by combined score descending
        results.sort((a, b) => b.combinedScore - a.combinedScore);

        return results.slice(0, limit);
    }

    /**
     * Cosine similarity between two vectors
     */
    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) {
            throw new Error('Vectors must have same dimension');
        }

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
        
        if (magnitude === 0) {
            return 0;
        }

        return dotProduct / magnitude;
    }

    /**
     * Keyword matching score
     */
    private keywordMatch(queryTerms: string[], doc: VectorDocument): number {
        const docText = `${doc.text} ${doc.metadata.title} ${doc.metadata.keywords?.join(' ') || ''}`;
        const docTerms = this.tokenize(docText.toLowerCase());

        let totalWeight = 0;

        for (const term of queryTerms) {
            const termFreq = docTerms.filter(t => t.includes(term) || term.includes(t)).length;
            
            if (termFreq > 0) {
                // TF-IDF-like: term frequency with diminishing returns
                totalWeight += Math.log(1 + termFreq);
            }
        }

        if (queryTerms.length === 0) {
            return 0;
        }

        // Normalize by query length
        return totalWeight / queryTerms.length;
    }

    /**
     * Simple tokenization
     */
    private tokenize(text: string): string[] {
        return text
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length > 2); // Remove very short words
    }

    /**
     * Get statistics
     */
    getStats(): {
        totalDocuments: number;
        dimension: number;
        byDbType: Record<string, number>;
    } {
        const byDbType: Record<string, number> = {};

        for (const doc of this.documents.values()) {
            const dbType = doc.metadata.dbType;
            byDbType[dbType] = (byDbType[dbType] || 0) + 1;
        }

        return {
            totalDocuments: this.documents.size,
            dimension: this.dimension,
            byDbType,
        };
    }

    /**
     * Clear all documents
     */
    clear(): void {
        this.documents.clear();
        this.dimension = 0;
        this.logger.info('Cleared vector store');
    }

    /**
     * Export to JSON (for persistence)
     */
    export(): string {
        const data = {
            dimension: this.dimension,
            documents: Array.from(this.documents.values()),
        };

        return JSON.stringify(data);
    }

    /**
     * Import from JSON
     */
    import(json: string): void {
        try {
            const data = JSON.parse(json);
            
            this.dimension = data.dimension;
            this.documents.clear();

            for (const doc of data.documents) {
                this.documents.set(doc.id, doc);
            }

            this.logger.info(`Imported ${this.documents.size} documents to vector store`);
        } catch (error) {
            this.logger.error('Failed to import vector store:', error as Error);
            throw error;
        }
    }
}

