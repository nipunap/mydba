import * as vscode from 'vscode';
import { AIProvider, QueryContext, AIAnalysisResult, SchemaContext, AIProviderConfig } from '../types/ai-types';
import { Logger } from '../utils/logger';
import { QueryAnonymizer } from '../utils/query-anonymizer';
import { QueryAnalyzer } from './query-analyzer';
import { AIProviderFactory } from './ai/provider-factory';
import { RAGService } from './rag-service';

/**
 * AI Service
 *
 * Main service for AI-powered query analysis and optimization
 * Coordinates between providers, analyzers, and RAG system
 */
export class AIService {
    private provider: AIProvider | null = null;
    private anonymizer: QueryAnonymizer;
    private analyzer: QueryAnalyzer;
    private providerFactory: AIProviderFactory;
    private ragService: RAGService;

    constructor(
        private logger: Logger,
        private context: vscode.ExtensionContext
    ) {
        this.anonymizer = new QueryAnonymizer();
        this.analyzer = new QueryAnalyzer();
        this.providerFactory = new AIProviderFactory(logger, context);
        this.ragService = new RAGService(logger);
    }

    /**
     * Initialize AI service
     */
    async initialize(): Promise<void> {
        this.logger.info('Initializing AI Service...');

        try {
            const config = this.getConfig();

            if (!config.enabled) {
                this.logger.info('AI features are disabled');
                return;
            }

            // Initialize RAG service
            await this.ragService.initialize(this.context.extensionPath);
            const ragStats = this.ragService.getStats();
            this.logger.info(`RAG: ${ragStats.total} docs loaded (MySQL: ${ragStats.mysql}, MariaDB: ${ragStats.mariadb})`);

            // Initialize AI provider
            this.provider = await this.providerFactory.createProvider(config);

            if (this.provider) {
                this.logger.info(`AI Service initialized with provider: ${this.provider.name}`);
            } else {
                this.logger.warn('No AI provider configured');
            }
        } catch (error) {
            this.logger.error('Failed to initialize AI Service:', error as Error);
            // Don't throw - allow extension to work without AI
        }
    }

    /**
     * Analyze a SQL query
     */
    async analyzeQuery(
        query: string,
        schemaContext?: SchemaContext,
        dbType: 'mysql' | 'mariadb' = 'mysql'
    ): Promise<AIAnalysisResult> {
        // First, run static analysis
        const staticAnalysis = this.analyzer.analyze(query);

        // Check if AI provider is available
        if (!this.provider) {
            // Return static analysis only
            return {
                summary: `Query type: ${staticAnalysis.queryType}, Complexity: ${staticAnalysis.complexity}`,
                antiPatterns: staticAnalysis.antiPatterns,
                optimizationSuggestions: [],
                estimatedComplexity: staticAnalysis.complexity
            };
        }

        // Prepare context
        const config = this.getConfig();
        const anonymizedQuery = config.anonymizeQueries
            ? this.anonymizer.anonymize(query)
            : query;

        // Check for sensitive data
        if (this.anonymizer.hasSensitiveData(query)) {
            this.logger.warn('Query contains potentially sensitive data');

            if (!config.anonymizeQueries) {
                const proceed = await vscode.window.showWarningMessage(
                    'Query may contain sensitive data. Anonymize before sending to AI?',
                    'Yes, Anonymize',
                    'Cancel'
                );

                if (proceed !== 'Yes, Anonymize') {
                    throw new Error('Query analysis cancelled - contains sensitive data');
                }
            }
        }

        // Retrieve relevant documentation with RAG
        const ragDocs = this.ragService.retrieveRelevantDocs(query, dbType, 3);
        this.logger.debug(`RAG retrieved ${ragDocs.length} relevant documents`);

        const context: QueryContext = {
            query,
            anonymizedQuery,
            schema: config.includeSchemaContext ? schemaContext : undefined,
            ragDocs
        };

        try {
            // Get AI analysis
            const aiResult = await this.provider.analyzeQuery(anonymizedQuery, context);

            // Merge static and AI analysis
            return {
                summary: aiResult.summary,
                antiPatterns: [
                    ...staticAnalysis.antiPatterns,
                    ...aiResult.antiPatterns
                ],
                optimizationSuggestions: aiResult.optimizationSuggestions,
                estimatedComplexity: aiResult.estimatedComplexity || staticAnalysis.complexity,
                citations: aiResult.citations
            };
        } catch (error) {
            this.logger.error('AI analysis failed, returning static analysis:', error as Error);

            // Show error to user
            vscode.window.showErrorMessage(
                `AI analysis failed: ${(error as Error).message}. Showing static analysis only.`
            );

            // Return static analysis as fallback
            return {
                summary: `Query type: ${staticAnalysis.queryType}, Complexity: ${staticAnalysis.complexity}`,
                antiPatterns: staticAnalysis.antiPatterns,
                optimizationSuggestions: [{
                    title: 'AI Analysis Unavailable',
                    description: 'Static analysis completed successfully. Configure AI provider for detailed suggestions.',
                    impact: 'low',
                    difficulty: 'easy'
                }],
                estimatedComplexity: staticAnalysis.complexity
            };
        }
    }

    /**
     * Get current provider info
     */
    getProviderInfo(): { name: string; available: boolean } | null {
        if (!this.provider) {
            return null;
        }

        return {
            name: this.provider.name,
            available: true
        };
    }

    /**
     * Reinitialize with new configuration
     */
    async reinitialize(): Promise<void> {
        this.provider = null;
        await this.initialize();
    }

    /**
     * Get AI configuration from settings
     */
    private getConfig(): AIProviderConfig {
        const config = vscode.workspace.getConfiguration('mydba.ai');
        
        return {
            provider: config.get<'auto' | 'vscode-lm' | 'openai' | 'anthropic' | 'ollama' | 'none'>('provider', 'auto'),
            enabled: config.get<boolean>('enabled', true),
            anonymizeQueries: config.get<boolean>('anonymizeQueries', true),
            includeSchemaContext: config.get<boolean>('includeSchemaContext', true),
            openaiModel: config.get<string>('openaiModel', 'gpt-4o-mini'),
            anthropicModel: config.get<string>('anthropicModel', 'claude-3-5-sonnet-20241022'),
            ollamaEndpoint: config.get<string>('ollamaEndpoint', 'http://localhost:11434'),
            ollamaModel: config.get<string>('ollamaModel', 'llama3.1')
        };
    }

    /**
     * Generate query fingerprint for grouping
     */
    generateFingerprint(query: string): string {
        return this.anonymizer.fingerprint(query);
    }

    /**
     * Get RAG service statistics
     */
    getRAGStats(): {
        total: number;
        mysql: number;
        mariadb: number;
        avgKeywordsPerDoc: number;
    } {
        return this.ragService.getStats();
    }
}
