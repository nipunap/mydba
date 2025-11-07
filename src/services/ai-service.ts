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
    private fallbackProviders: AIProvider[] = [];
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

            // Initialize primary AI provider and fallback chain
            await this.initializeProviders(config);

            if (this.provider) {
                const fallbackCount = this.fallbackProviders.length;
                this.logger.info(`AI Service initialized with provider: ${this.provider.name}${fallbackCount > 0 ? ` (${fallbackCount} fallbacks)` : ''}`);
            } else {
                this.logger.warn('No AI provider configured');
            }
        } catch (error) {
            this.logger.error('Failed to initialize AI Service:', error as Error);
            // Don't throw - allow extension to work without AI
        }
    }

    /**
     * Initialize primary provider and fallback chain
     */
    private async initializeProviders(config: AIProviderConfig): Promise<void> {
        // Clear existing providers
        this.provider = null;
        this.fallbackProviders = [];

        // Initialize primary provider (explicit or auto-detected)
        if (config.provider !== 'none') {
            this.provider = await this.providerFactory.createProvider(config);

            // Build fallback chain for all providers (explicit or auto-detected)
            if (this.provider) {
                // Determine the primary provider name (map display name to config value)
                let primaryProviderName: 'auto' | 'vscode-lm' | 'openai' | 'anthropic' | 'ollama' = config.provider;
                if (config.provider === 'auto') {
                    // Map auto-detected provider name to config value
                    const providerNameMap: Record<string, 'vscode-lm' | 'openai' | 'anthropic' | 'ollama'> = {
                        'VS Code Language Models': 'vscode-lm',
                        'OpenAI': 'openai',
                        'Anthropic': 'anthropic',
                        'Ollama': 'ollama'
                    };
                    primaryProviderName = providerNameMap[this.provider.name] || 'auto';
                }

                // Build fallback chain (try other providers)
                const fallbackOrder = this.getFallbackOrder(primaryProviderName);
                for (const fallbackProviderName of fallbackOrder) {
                    try {
                        const fallbackConfig = { ...config, provider: fallbackProviderName as 'auto' | 'vscode-lm' | 'openai' | 'anthropic' | 'ollama' | 'none' };
                        const fallbackProvider = await this.providerFactory.createProvider(fallbackConfig);
                        if (fallbackProvider) {
                            this.fallbackProviders.push(fallbackProvider);
                            this.logger.debug(`Initialized fallback provider: ${fallbackProvider.name}`);
                        }
                    } catch (error) {
                        this.logger.debug(`Fallback provider ${fallbackProviderName} not available:`, error as Error);
                    }
                }
            }
        }
    }

    /**
     * Get fallback provider order based on primary provider
     */
    private getFallbackOrder(primaryProvider: string): string[] {
        const allProviders = ['vscode-lm', 'openai', 'anthropic', 'ollama'];
        return allProviders.filter(p => p !== primaryProvider);
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
        } catch (primaryError) {
            this.logger.warn(`Primary AI provider failed: ${(primaryError as Error).message}`);

            // Try fallback providers
            for (const fallbackProvider of this.fallbackProviders) {
                try {
                    this.logger.info(`Trying fallback provider: ${fallbackProvider.name}`);
                    const aiResult = await fallbackProvider.analyzeQuery(anonymizedQuery, context);

                    // Success! Log and return
                    this.logger.info(`Fallback provider ${fallbackProvider.name} succeeded`);
                    vscode.window.showInformationMessage(
                        `Primary AI provider failed. Using fallback: ${fallbackProvider.name}`
                    );

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
                } catch (fallbackError) {
                    this.logger.debug(`Fallback provider ${fallbackProvider.name} failed:`, fallbackError as Error);
                    // Continue to next fallback
                }
            }

            // All providers failed - return static analysis
            this.logger.error('All AI providers failed, returning static analysis');
            vscode.window.showWarningMessage(
                `AI analysis unavailable. Showing static analysis only.`
            );

            return {
                summary: `Query type: ${staticAnalysis.queryType}, Complexity: ${staticAnalysis.complexity}`,
                antiPatterns: staticAnalysis.antiPatterns,
                optimizationSuggestions: [{
                    title: 'AI Analysis Unavailable',
                    description: 'All AI providers failed. Static analysis completed successfully. Check your API keys and network connection.',
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
     * Reload configuration (called when settings change)
     */
    async reloadConfiguration(): Promise<void> {
        this.logger.info('Reloading AI Service configuration...');
        const config = this.getConfig();

        if (!config.enabled) {
            this.logger.info('AI features disabled, clearing providers');
            this.provider = null;
            this.fallbackProviders = [];
            return;
        }

        await this.initializeProviders(config);
        const fallbackCount = this.fallbackProviders.length;
        this.logger.info(`AI configuration reloaded: ${this.provider?.name || 'none'}${fallbackCount > 0 ? ` (${fallbackCount} fallbacks)` : ''}`);
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

    /**
     * Get a simple text completion from the AI provider
     *
     * This method is designed for general-purpose text generation tasks that don't
     * require structured query analysis. It uses a higher temperature setting for
     * more natural, conversational responses.
     *
     * @param prompt The prompt to send to the AI provider
     * @returns The AI-generated text response
     * @throws Error if AI service is not configured or all providers fail
     *
     * @example
     * ```typescript
     * const description = await aiService.getCompletion(
     *     'Explain what the max_connections MySQL variable does'
     * );
     * ```
     *
     * Use cases:
     * - Variable descriptions and explanations
     * - General database questions
     * - Documentation queries
     * - Natural language responses
     *
     * For structured SQL query analysis, use analyzeQuery() instead.
     */
    async getCompletion(prompt: string): Promise<string> {
        // Check if AI provider is available
        if (!this.provider) {
            throw new Error('AI service not available. Please configure an AI provider in settings.');
        }

        try {
            // Get completion from primary provider
            return await this.provider.getCompletion(prompt);
        } catch (primaryError) {
            this.logger.warn(`Primary AI provider completion failed: ${(primaryError as Error).message}`);

            // Try fallback providers
            for (const fallbackProvider of this.fallbackProviders) {
                try {
                    this.logger.info(`Trying fallback provider for completion: ${fallbackProvider.name}`);
                    const result = await fallbackProvider.getCompletion(prompt);
                    this.logger.info(`Fallback provider ${fallbackProvider.name} succeeded`);
                    return result;
                } catch (fallbackError) {
                    this.logger.debug(`Fallback provider ${fallbackProvider.name} failed:`, fallbackError as Error);
                    // Continue to next fallback
                }
            }

            // All providers failed
            this.logger.error('All AI providers failed for completion');
            throw new Error(`AI completion failed: ${(primaryError as Error).message}`);
        }
    }
}
