import { RAGDocument } from '../types/ai-types';
import { Logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

/**
 * RAG Service
 *
 * Retrieval-Augmented Generation service for MySQL/MariaDB documentation
 * Uses keyword-based retrieval (Phase 1)
 */
export class RAGService {
    private mysqlDocs: RAGDocument[] = [];
    private mariadbDocs: RAGDocument[] = [];
    private allDocs: RAGDocument[] = [];

    constructor(private logger: Logger) {}

    /**
     * Initialize RAG service by loading documentation
     */
    async initialize(extensionPath: string): Promise<void> {
        this.logger.info('Initializing RAG Service...');

        try {
            // Load MySQL documentation
            const mysqlPath = path.join(extensionPath, 'src', 'data', 'mysql-docs.json');
            if (fs.existsSync(mysqlPath)) {
                const mysqlData = JSON.parse(fs.readFileSync(mysqlPath, 'utf8'));
                this.mysqlDocs = mysqlData.documents || [];
                this.logger.info(`Loaded ${this.mysqlDocs.length} MySQL documentation snippets`);
            }

            // Load MariaDB documentation
            const mariadbPath = path.join(extensionPath, 'src', 'data', 'mariadb-docs.json');
            if (fs.existsSync(mariadbPath)) {
                const mariadbData = JSON.parse(fs.readFileSync(mariadbPath, 'utf8'));
                this.mariadbDocs = mariadbData.documents || [];
                this.logger.info(`Loaded ${this.mariadbDocs.length} MariaDB documentation snippets`);
            }

            // Combine all docs
            this.allDocs = [...this.mysqlDocs, ...this.mariadbDocs];
            this.logger.info(`RAG Service initialized with ${this.allDocs.length} total documents`);
        } catch (error) {
            this.logger.error('Failed to initialize RAG Service:', error as Error);
            throw error;
        }
    }

    /**
     * Retrieve relevant documents for a query
     */
    retrieveRelevantDocs(
        query: string,
        dbType: 'mysql' | 'mariadb' = 'mysql',
        maxDocs: number = 3
    ): RAGDocument[] {
        // Extract keywords from query
        const keywords = this.extractKeywords(query);

        if (keywords.length === 0) {
            return [];
        }

        // Select document source
        const docs = dbType === 'mariadb'
            ? [...this.mariadbDocs, ...this.mysqlDocs] // MariaDB-specific first
            : this.allDocs;

        // Score documents by keyword relevance
        const scored = docs.map(doc => ({
            doc,
            score: this.calculateRelevance(doc.keywords, keywords)
        }));

        // Filter out zero-score docs and sort
        const relevant = scored
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, maxDocs)
            .map(item => item.doc);

        this.logger.debug(`Retrieved ${relevant.length} relevant docs for query (top score: ${scored[0]?.score || 0})`);

        return relevant;
    }

    /**
     * Extract keywords from query text
     */
    private extractKeywords(query: string): string[] {
        // Convert to lowercase
        const normalized = query.toLowerCase();

        // Remove SQL noise words
        const noiseWords = new Set([
            'select', 'from', 'where', 'and', 'or', 'not', 'in', 'is', 'as',
            'on', 'the', 'a', 'an', 'to', 'for', 'of', 'with', 'by', 'at',
            'be', 'this', 'that', 'it', 'are', 'was', 'were', 'been', 'have',
            'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could',
            'table', 'column', 'row', 'database', 'query', 'sql'
        ]);

        // Extract words (alphanumeric + underscore)
        const words = normalized.match(/\b[\w]+\b/g) || [];

        // Filter noise words and short words
        const keywords = words.filter(word =>
            word.length > 2 && !noiseWords.has(word)
        );

        // Remove duplicates
        return Array.from(new Set(keywords));
    }

    /**
     * Calculate relevance score between document keywords and query keywords
     */
    private calculateRelevance(docKeywords: string[], queryKeywords: string[]): number {
        let score = 0;

        for (const queryKw of queryKeywords) {
            for (const docKw of docKeywords) {
                // Exact match
                if (queryKw === docKw) {
                    score += 10;
                }
                // Partial match (query keyword contains doc keyword or vice versa)
                else if (queryKw.includes(docKw) || docKw.includes(queryKw)) {
                    score += 5;
                }
                // Plural/singular fuzzy match
                else if (this.isSimilar(queryKw, docKw)) {
                    score += 3;
                }
            }
        }

        // Normalize by document keyword count to prefer focused docs
        return docKeywords.length > 0 ? score / Math.sqrt(docKeywords.length) : 0;
    }

    /**
     * Check if two keywords are similar (handles plurals, etc.)
     */
    private isSimilar(word1: string, word2: string): boolean {
        // Remove trailing 's' for plural matching
        const stem1 = word1.endsWith('s') ? word1.slice(0, -1) : word1;
        const stem2 = word2.endsWith('s') ? word2.slice(0, -1) : word2;

        return stem1 === stem2;
    }

    /**
     * Build prompt with RAG context
     */
    buildPromptWithContext(query: string, docs: RAGDocument[]): string {
        if (docs.length === 0) {
            return query;
        }

        let prompt = 'Reference Documentation:\n\n';

        for (const doc of docs) {
            prompt += `**${doc.title}** (${doc.source})\n`;
            prompt += `${doc.content}\n\n`;
        }

        prompt += `---\n\n`;
        prompt += `User Query: ${query}\n\n`;
        prompt += `Based on the reference documentation above, provide optimization suggestions. `;
        prompt += `Include citations to the documentation in your response when applicable.\n`;

        return prompt;
    }

    /**
     * Get statistics about loaded documents
     */
    getStats(): {
        total: number;
        mysql: number;
        mariadb: number;
        avgKeywordsPerDoc: number;
    } {
        const totalKeywords = this.allDocs.reduce((sum, doc) => sum + doc.keywords.length, 0);

        return {
            total: this.allDocs.length,
            mysql: this.mysqlDocs.length,
            mariadb: this.mariadbDocs.length,
            avgKeywordsPerDoc: this.allDocs.length > 0
                ? Math.round(totalKeywords / this.allDocs.length * 10) / 10
                : 0
        };
    }

    /**
     * Search documents by keyword (for testing/debugging)
     */
    searchByKeyword(keyword: string): RAGDocument[] {
        const normalized = keyword.toLowerCase();
        return this.allDocs.filter(doc =>
            doc.keywords.some(kw => kw.includes(normalized) || normalized.includes(kw))
        );
    }
}
