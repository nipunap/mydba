import * as vscode from 'vscode';
import { AIService } from './ai-service';
import { QueryAnalyzer } from './query-analyzer';
import { Logger } from '../utils/logger';
import { SchemaContext, AIAnalysisResult, OptimizationSuggestion, Citation, AntiPattern } from '../types/ai-types';
import { EventBus, EVENTS, AIRequest as AIRequestEvent, AIResponse as AIResponseEvent } from './event-bus';
import { AuditLogger } from './audit-logger';
import { InnoDBStatus, AriaStatus } from '../types/storage-engine-types';
import { ReplicationStatus } from '../types/replication-types';
import * as crypto from 'crypto';

/**
 * AI Service Coordinator
 *
 * Coordinates AI analysis across different aspects of database operations:
 * - Query analysis and optimization
 * - EXPLAIN plan interpretation
 * - Query profiling insights
 */
export class AIServiceCoordinator {
    private aiService: AIService;
    private queryAnalyzer: QueryAnalyzer;

    constructor(
        private logger: Logger,
        private context: vscode.ExtensionContext,
        private eventBus?: EventBus,
        private auditLogger?: AuditLogger
    ) {
        this.aiService = new AIService(logger, context);
        this.queryAnalyzer = new QueryAnalyzer();
    }

    /**
     * Initialize the coordinator
     */
    async initialize(): Promise<void> {
        this.logger.info('Initializing AI Service Coordinator...');
        await this.aiService.initialize();
        this.logger.info('AI Service Coordinator initialized');
    }

    /**
     * Analyze a SQL query and provide optimization suggestions
     */
    async analyzeQuery(
        query: string,
        schema?: SchemaContext,
        dbType: 'mysql' | 'mariadb' = 'mysql'
    ): Promise<AIAnalysisResult> {
        const startTime = Date.now();
        this.logger.info('Analyzing query with AI Service Coordinator');

        // Generate query hash for event
        const queryHash = crypto.createHash('sha256').update(query).digest('hex').substring(0, 16);

        // Get actual AI provider name
        const providerInfo = this.aiService.getProviderInfo();
        const providerName = providerInfo?.name || 'unknown';

        // Emit AI_REQUEST_SENT event
        if (this.eventBus) {
            const requestEvent: AIRequestEvent = {
                type: 'query_analysis',
                query: queryHash, // Use hash instead of actual query for privacy
                anonymized: true,
                timestamp: Date.now()
            };
            await this.eventBus.emit(EVENTS.AI_REQUEST_SENT, requestEvent);
        }

        let success = false;
        let error: Error | undefined;

        try {
            // Get static analysis first
            const staticAnalysis = this.queryAnalyzer.analyze(query);
            this.logger.debug(`Static analysis: ${staticAnalysis.antiPatterns.length} anti-patterns found`);

            // Get AI analysis (includes RAG documentation)
            const aiAnalysis = await this.aiService.analyzeQuery(query, schema, dbType);

            // Merge static and AI analysis
            const result: AIAnalysisResult = {
                summary: aiAnalysis.summary || this.generateStaticSummary(staticAnalysis),
                antiPatterns: [
                    ...staticAnalysis.antiPatterns,
                    ...(aiAnalysis.antiPatterns || [])
                ],
                optimizationSuggestions: aiAnalysis.optimizationSuggestions || [],
                estimatedComplexity: aiAnalysis.estimatedComplexity || staticAnalysis.complexity,
                citations: aiAnalysis.citations
            };

            // Track performance
            const duration = Date.now() - startTime;
            if (duration > 2000) {
                this.logger.warn(`AI query analysis took ${duration}ms (exceeded 2s budget)`);
            } else {
                this.logger.debug(`AI query analysis completed in ${duration}ms`);
            }

            // Mark as successful
            success = true;

            // Emit AI_RESPONSE_RECEIVED event
            if (this.eventBus) {
                const responseEvent: AIResponseEvent = {
                    type: 'query_analysis',
                    duration,
                    success: true
                };
                await this.eventBus.emit(EVENTS.AI_RESPONSE_RECEIVED, responseEvent);
            }

            // Log AI request to audit log with actual result
            if (this.auditLogger) {
                await this.auditLogger.logAIRequest(
                    providerName,
                    'query_analysis',
                    success,
                    undefined
                );
            }

            this.logger.info(`Query analysis complete: ${result.optimizationSuggestions.length} suggestions`);
            return result;

        } catch (err) {
            error = err as Error;
            const duration = Date.now() - startTime;
            this.logger.error(`Query analysis failed after ${duration}ms:`, error);

            // Emit AI_RESPONSE_RECEIVED event with error
            if (this.eventBus) {
                const responseEvent: AIResponseEvent = {
                    type: 'query_analysis',
                    duration,
                    success: false,
                    error
                };
                await this.eventBus.emit(EVENTS.AI_RESPONSE_RECEIVED, responseEvent);
            }

            // Log AI request to audit log with failure status
            if (this.auditLogger) {
                await this.auditLogger.logAIRequest(
                    providerName,
                    'query_analysis',
                    false,
                    undefined,
                    error.message
                );
            }

            // Fallback to static analysis only
            const staticAnalysis = this.queryAnalyzer.analyze(query);
            return {
                summary: this.generateStaticSummary(staticAnalysis),
                antiPatterns: staticAnalysis.antiPatterns,
                optimizationSuggestions: [],
                estimatedComplexity: staticAnalysis.complexity
            };
        }
    }

    /**
     * Interpret EXPLAIN output and provide insights
     */
    async interpretExplain(
        explainOutput: unknown,
        query: string,
        dbType: 'mysql' | 'mariadb' = 'mysql'
    ): Promise<ExplainInterpretation> {
        this.logger.info('Interpreting EXPLAIN output');

        try {
            // Parse EXPLAIN output
            const explainData = typeof explainOutput === 'string'
                ? JSON.parse(explainOutput)
                : explainOutput;

            // Identify pain points
            const painPoints = this.identifyExplainPainPoints(explainData);
            this.logger.debug(`Found ${painPoints.length} pain points`);

            // Get AI interpretation if available
            const providerInfo = this.aiService.getProviderInfo();
            if (providerInfo && providerInfo.available) {
                const aiInterpretation = await this.getAIExplainInterpretation(
                    explainData,
                    query,
                    painPoints,
                    dbType
                );

                return {
                    summary: aiInterpretation.summary,
                    painPoints,
                    suggestions: aiInterpretation.suggestions,
                    performancePrediction: aiInterpretation.performancePrediction,
                    citations: aiInterpretation.citations
                };
            }

            // Fallback to static analysis
            return {
                summary: this.generateStaticExplainSummary(explainData, painPoints),
                painPoints,
                suggestions: this.generateStaticSuggestions(painPoints),
                performancePrediction: null,
                citations: []
            };

        } catch (error) {
            this.logger.error('EXPLAIN interpretation failed:', error as Error);
            throw error;
        }
    }

    /**
     * Interpret query profiling data and provide insights
     */
    async interpretProfiling(
        profilingData: unknown,
        query: string,
        dbType: 'mysql' | 'mariadb' = 'mysql'
    ): Promise<ProfilingInterpretation> {
        this.logger.info('Interpreting profiling data');

        try {
            // Extract efficiency from profile summary if available
            const profile = profilingData as { summary?: { efficiency?: number; totalRowsExamined?: number; totalRowsSent?: number } };
            const efficiency = profile.summary?.efficiency;
            const rowsExamined = profile.summary?.totalRowsExamined;
            const rowsSent = profile.summary?.totalRowsSent;

            // Calculate stage percentages
            const stages = this.calculateStagePercentages(profilingData);

            // Identify bottlenecks (stages > 20% of total time)
            const bottlenecks = stages.filter(stage => stage.percentage > 20);
            this.logger.debug(`Found ${bottlenecks.length} bottleneck stages`);

            // Get AI insights if available
            const providerInfo = this.aiService.getProviderInfo();
            if (providerInfo && providerInfo.available) {
                const aiInsights = await this.getAIProfilingInsights(
                    stages,
                    bottlenecks,
                    query,
                    dbType,
                    efficiency,
                    rowsExamined,
                    rowsSent
                );

                return {
                    stages,
                    bottlenecks,
                    totalDuration: this.calculateTotalDuration(stages),
                    insights: aiInsights.insights,
                    suggestions: aiInsights.suggestions,
                    citations: aiInsights.citations
                };
            }

            // Fallback to static analysis
            return {
                stages,
                bottlenecks,
                totalDuration: this.calculateTotalDuration(stages),
                insights: this.generateStaticProfilingInsights(bottlenecks),
                suggestions: this.generateStaticProfilingSuggestions(bottlenecks),
                citations: []
            };

        } catch (error) {
            this.logger.error('Profiling interpretation failed:', error as Error);
            throw error;
        }
    }

    /**
     * Reinitialize with new configuration
     */
    async reinitialize(): Promise<void> {
        await this.aiService.reinitialize();
    }

    /**
     * Get current provider info
     */
    getProviderInfo() {
        return this.aiService.getProviderInfo();
    }

    /**
     * Get RAG statistics
     */
    getRAGStats() {
        return this.aiService.getRAGStats();
    }

    // Private helper methods

    private generateStaticSummary(analysis: { queryType: string; complexity: number; antiPatterns: unknown[] }): string {
        return `Query type: ${analysis.queryType}, Complexity: ${analysis.complexity}/10, Anti-patterns: ${analysis.antiPatterns.length}`;
    }

    private identifyExplainPainPoints(explainData: unknown): PainPoint[] {
        const painPoints: PainPoint[] = [];

        const findIssues = (node: Record<string, unknown>, path: string[] = []) => {
            if (!node) return;

            // Check for full table scans
            const rowsExamined = typeof node.rows_examined_per_scan === 'number' ? node.rows_examined_per_scan : 0;
            if (node.access_type === 'ALL' && rowsExamined > 10000) {
                painPoints.push({
                    type: 'full_table_scan',
                    severity: 'CRITICAL',
                    description: `Full table scan on ${String(node.table_name || 'table')} (${rowsExamined} rows)`,
                    table: String(node.table_name || 'table'),
                    rowsAffected: rowsExamined,
                    suggestion: `Add index on ${String(node.table_name || 'table')} to avoid full scan`
                });
            }

            // Check for filesort
            if (node.using_filesort) {
                painPoints.push({
                    type: 'filesort',
                    severity: 'WARNING',
                    description: `Filesort operation detected on ${node.table_name || 'result set'}`,
                    suggestion: 'Consider adding covering index to avoid filesort'
                });
            }

            // Check for temporary table
            if (node.using_temporary_table) {
                painPoints.push({
                    type: 'temp_table',
                    severity: 'WARNING',
                    description: 'Temporary table created for query execution',
                    suggestion: 'Optimize query to avoid temporary table creation'
                });
            }

            // Check for missing indexes
            // Use loose equality to catch both null and undefined
            if (node.possible_keys == null && node.access_type === 'ALL') {
                const tableName = String(node.table_name || 'table');
                painPoints.push({
                    type: 'missing_index',
                    severity: 'CRITICAL',
                    description: `No possible indexes for ${tableName}`,
                    table: tableName,
                    suggestion: `Create appropriate index on ${tableName}`
                });
            }

            // Recursively check nested nodes
            if (Array.isArray(node.nested_loop)) {
                node.nested_loop.forEach((child, i: number) => {
                    findIssues(child as Record<string, unknown>, [...path, `nested_loop[${i}]`]);
                });
            }
            if (node.query_block && typeof node.query_block === 'object') {
                findIssues(node.query_block as Record<string, unknown>, [...path, 'query_block']);
            }
            if (node.table && typeof node.table === 'object') {
                findIssues(node.table as Record<string, unknown>, [...path, 'table']);
            }
        };

        findIssues(explainData as Record<string, unknown>);
        return painPoints;
    }

    private generateStaticExplainSummary(_explainData: unknown, painPoints: PainPoint[]): string {
        const critical = painPoints.filter(p => p.severity === 'CRITICAL').length;
        const warnings = painPoints.filter(p => p.severity === 'WARNING').length;

        if (critical > 0) {
            return `Found ${critical} critical issue(s) and ${warnings} warning(s) in query execution plan`;
        } else if (warnings > 0) {
            return `Found ${warnings} warning(s) in query execution plan`;
        }
        return 'Query execution plan looks good';
    }

    private generateStaticSuggestions(painPoints: PainPoint[]): string[] {
        return painPoints.map(p => p.suggestion);
    }

    private calculateStagePercentages(profilingData: unknown): ProfilingStage[] {
        const data = profilingData as { stages?: unknown[] };
        const stages: unknown[] = Array.isArray(profilingData) ? profilingData : data.stages || [];
        const totalDuration = stages.reduce((sum: number, stage: unknown) => {
            const s = stage as { duration?: number; Duration?: number };
            return sum + (s.duration || s.Duration || 0);
        }, 0 as number);

        return stages.map(stage => {
            const s = stage as { name?: string; Stage?: string; event_name?: string; duration?: number; Duration?: number };
            const duration = s.duration || s.Duration || 0;
            return {
                name: s.name || s.Stage || s.event_name || 'unknown',
                duration,
                percentage: (totalDuration as number) > 0 ? (duration / (totalDuration as number)) * 100 : 0
            };
        });
    }

    private calculateTotalDuration(stages: ProfilingStage[]): number {
        return stages.reduce((sum, stage) => sum + stage.duration, 0);
    }

    private generateStaticProfilingInsights(bottlenecks: ProfilingStage[]): string[] {
        return bottlenecks.map(stage =>
            `${stage.name} stage takes ${stage.percentage.toFixed(1)}% of total time (${stage.duration.toFixed(3)}s)`
        );
    }

    private generateStaticProfilingSuggestions(bottlenecks: ProfilingStage[]): string[] {
        const suggestions: string[] = [];

        for (const bottleneck of bottlenecks) {
            if (bottleneck.name.toLowerCase().includes('sending data')) {
                suggestions.push('High "Sending data" time suggests full table scan. Add appropriate indexes.');
            } else if (bottleneck.name.toLowerCase().includes('sorting')) {
                suggestions.push('Sorting operation is slow. Consider adding covering index to avoid sort.');
            } else if (bottleneck.name.toLowerCase().includes('creating tmp table')) {
                suggestions.push('Temporary table creation is expensive. Optimize query to avoid it.');
            } else {
                suggestions.push(`Optimize ${bottleneck.name} stage performance`);
            }
        }

        return suggestions;
    }

    private async getAIExplainInterpretation(
        explainData: unknown,
        query: string,
        painPoints: PainPoint[],
        dbType: string
    ): Promise<{ summary: string; suggestions: string[]; performancePrediction: null; citations: Array<{ source: string; url: string; excerpt: string }> }> {
        this.logger.info('Getting AI EXPLAIN interpretation');

        try {
            // Build schema context with EXPLAIN data
            const schemaContext: SchemaContext & { explainPlan?: unknown; painPoints?: unknown[] } = {
                tables: {},
                explainPlan: explainData,
                painPoints: painPoints.map(p => ({
                    type: p.type,
                    severity: p.severity,
                    description: p.description,
                    table: p.table,
                    rowsAffected: p.rowsAffected
                }))
            };

            // Use AI service to analyze the query with EXPLAIN context
            const aiResult = await this.aiService.analyzeQuery(query, schemaContext, dbType as 'mysql' | 'mariadb');

            // Extract suggestions from AI result
            const suggestions: string[] = [];

            // Add pain point suggestions first
            painPoints.forEach(pp => {
                if (pp.suggestion) {
                    suggestions.push(pp.suggestion);
                }
            });

            // Add AI optimization suggestions
            if (aiResult.optimizationSuggestions && aiResult.optimizationSuggestions.length > 0) {
                aiResult.optimizationSuggestions.forEach((opt: OptimizationSuggestion) => {
                    const suggestion = opt.title ? `${opt.title}: ${opt.description}` : opt.description;
                    if (suggestion && !suggestions.includes(suggestion)) {
                        suggestions.push(suggestion);
                    }
                });
            }

            // Extract citations if available
            const citations: Array<{ source: string; url: string; excerpt: string }> = [];
            if (aiResult.citations && Array.isArray(aiResult.citations)) {
                aiResult.citations.forEach((citation: Citation) => {
                    citations.push({
                        source: citation.title || citation.source || 'Unknown',
                        url: '',
                        excerpt: citation.relevance?.toString() || ''
                    });
                });
            }

            // Build comprehensive summary
            let summary = aiResult.summary || '';
            if (painPoints.length > 0) {
                const criticalCount = painPoints.filter(p => p.severity === 'CRITICAL').length;
                const warningCount = painPoints.filter(p => p.severity === 'WARNING').length;

                if (criticalCount > 0) {
                    summary = `⚠️ Found ${criticalCount} critical issue(s) and ${warningCount} warning(s). ${summary}`;
                } else if (warningCount > 0) {
                    summary = `Found ${warningCount} warning(s). ${summary}`;
                }
            }

            return {
                summary: summary || 'Query execution plan analyzed.',
                suggestions: suggestions.length > 0 ? suggestions : ['No specific optimizations recommended.'],
                performancePrediction: null,
                citations
            };

        } catch (error) {
            this.logger.error('Failed to get AI EXPLAIN interpretation:', error as Error);
            // Return basic analysis instead of throwing
            return {
                summary: `Unable to generate AI insights: ${(error as Error).message}. ${this.generateStaticExplainSummary(explainData, painPoints)}`,
                suggestions: this.generateStaticSuggestions(painPoints),
                performancePrediction: null,
                citations: []
            };
        }
    }

    private async getAIProfilingInsights(
        stages: ProfilingStage[],
        bottlenecks: ProfilingStage[],
        query: string,
        dbType: string,
        efficiency?: number,
        rowsExamined?: number,
        rowsSent?: number
    ): Promise<{ insights: string[]; suggestions: string[]; citations: Array<{ source: string; url: string; excerpt: string }> }> {
        this.logger.info('Getting AI profiling insights');

        try {
            // Build a schema context with performance data
            const totalDuration = this.calculateTotalDuration(stages);

            const schemaContext: SchemaContext = {
                tables: {},
                performance: {
                    totalDuration,
                    efficiency,
                    rowsExamined,
                    rowsSent,
                    stages: stages.map(s => ({
                        name: s.name,
                        duration: s.duration
                    }))
                }
            };

            // Use AI service to analyze the query with profiling context
            const aiResult = await this.aiService.analyzeQuery(query, schemaContext, dbType as 'mysql' | 'mariadb');

            // Extract insights and suggestions from AI result
            const insights: string[] = [];
            const suggestions: string[] = [];

            // Add summary as primary insight
            if (aiResult.summary) {
                insights.push(aiResult.summary);
            }

            // Add anti-patterns as insights
            if (aiResult.antiPatterns && aiResult.antiPatterns.length > 0) {
                aiResult.antiPatterns.forEach((ap: AntiPattern) => {
                    insights.push(`⚠️ ${ap.type || 'Issue'}: ${ap.message}`);
                    if (ap.suggestion) {
                        suggestions.push(ap.suggestion);
                    }
                });
            }

            // Add optimization suggestions
            if (aiResult.optimizationSuggestions && aiResult.optimizationSuggestions.length > 0) {
                aiResult.optimizationSuggestions.forEach((opt: OptimizationSuggestion) => {
                    suggestions.push(`${opt.title}: ${opt.description}`);
                });
            }

            // Extract citations if available
            const citations: Array<{ source: string; url: string; excerpt: string }> = [];
            if (aiResult.citations && Array.isArray(aiResult.citations)) {
                aiResult.citations.forEach((citation: Citation) => {
                    citations.push({
                        source: citation.title || citation.source || 'Unknown',
                        url: '',
                        excerpt: citation.relevance?.toString() || ''
                    });
                });
            }

            return {
                insights: insights.length > 0 ? insights : ['AI analysis completed. Review the performance metrics above.'],
                suggestions: suggestions.length > 0 ? suggestions : [],
                citations
            };

        } catch (error) {
            this.logger.error('Failed to get AI profiling insights:', error as Error);
            // Return empty results instead of throwing to allow profiling to continue
            return {
                insights: [`Unable to generate AI insights: ${(error as Error).message}`],
                suggestions: [],
                citations: []
            };
        }
    }

    /**
     * Get a simple AI response for a prompt without query analysis
     * Useful for variable descriptions, general questions, etc.
     *
     * @param prompt The prompt to send to the AI
     * @param dbType The database type (mysql or mariadb)
     * @param includeRAG Whether to include RAG documentation context (default: false)
     * @param ragQuery Optional custom query for RAG (defaults to using the prompt)
     */
    async getSimpleCompletion(
        prompt: string,
        dbType: 'mysql' | 'mariadb' = 'mysql',
        includeRAG: boolean = false,
        ragQuery?: string
    ): Promise<string> {
        this.logger.info('Getting simple AI completion');

        try {
            let enhancedPrompt = prompt;

            // Optionally include RAG documentation context
            if (includeRAG) {
                const { RAGService } = await import('./rag-service');
                const ragService = new RAGService(this.logger);
                await ragService.initialize(this.context.extensionPath);

                // Use custom RAG query or extract key terms from the prompt
                const queryForRAG = ragQuery || prompt;
                const ragDocs = ragService.retrieveRelevantDocs(queryForRAG, dbType, 3);

                if (ragDocs.length > 0) {
                    this.logger.debug(`RAG retrieved ${ragDocs.length} relevant documents`);

                    // Add RAG context to the prompt
                    enhancedPrompt = `${prompt}

**Reference Documentation:**
`;
                    for (let i = 0; i < ragDocs.length; i++) {
                        const doc = ragDocs[i];
                        enhancedPrompt += `
[${i + 1}] ${doc.title}:
${doc.content}

`;
                    }

                    enhancedPrompt += `
Use the reference documentation above to inform your response when relevant.`;
                } else {
                    this.logger.debug('No RAG documents found for query');
                }
            }

            // Use the new getCompletion method which is designed for general text completion
            return await this.aiService.getCompletion(enhancedPrompt);
        } catch (error) {
            this.logger.error('Failed to get AI completion:', error as Error);
            throw error;
        }
    }

    /**
     * Analyze InnoDB status and provide diagnostic insights
     */
    async analyzeInnoDBStatus(
        status: InnoDBStatus,
        dbType: 'mysql' | 'mariadb' = 'mysql'
    ): Promise<AIAnalysis> {
        const startTime = Date.now();
        this.logger.info('Analyzing InnoDB status with AI');

        try {
            // Build context for AI analysis
            const context = this.buildInnoDBContext(status);

            // Create prompt for AI analysis
            const prompt = `You are a database expert analyzing InnoDB storage engine status. Provide actionable diagnostic insights and recommendations.

**Current Status:**
${context}

**Analysis Requirements:**
1. Identify the top 3 most critical issues or risks
2. Explain the root cause of each issue in simple terms
3. Provide specific, actionable recommendations with configuration changes
4. Prioritize recommendations by impact (high/medium/low)
5. Reference MySQL/MariaDB documentation when relevant

Provide your analysis in the following format:
## Critical Issues
[List issues with severity and impact]

## Root Causes
[Explain why these issues are occurring]

## Recommendations
[Specific actions to take, ordered by priority]

## Configuration Changes
[Exact parameter changes with before/after values]
`;

            // Get AI analysis with RAG
            const response = await this.getSimpleCompletion(
                prompt,
                dbType,
                true,
                ['innodb', 'buffer pool', 'transaction', 'checkpoint', dbType].join(' ')
            );

            // Track performance
            const duration = Date.now() - startTime;
            if (duration > 2000) {
                this.logger.warn(`InnoDB AI analysis took ${duration}ms (exceeded 2s budget)`);
            }

            return {
                summary: this.extractSummary(response),
                issues: this.extractIssues(response),
                recommendations: this.extractRecommendations(response),
                configChanges: this.extractConfigChanges(response),
                rawResponse: response
            };
        } catch (error) {
            this.logger.error('Failed to analyze InnoDB status:', error as Error);
            throw error;
        }
    }

    /**
     * Analyze Aria storage engine status (MariaDB)
     */
    async analyzeAriaStatus(
        status: AriaStatus
    ): Promise<AIAnalysis> {
        const startTime = Date.now();
        this.logger.info('Analyzing Aria status with AI');

        try {
            const context = this.buildAriaContext(status);

            const prompt = `You are a database expert analyzing MariaDB Aria storage engine status. Provide diagnostic insights and optimization recommendations.

**Current Status:**
${context}

**Analysis Requirements:**
1. Identify performance bottlenecks or configuration issues
2. Compare Aria performance characteristics vs InnoDB
3. Provide specific tuning recommendations
4. Suggest if migration to InnoDB would be beneficial

Provide actionable recommendations in structured format.
`;

            const response = await this.getSimpleCompletion(
                prompt,
                'mariadb',
                true,
                ['aria', 'mariadb', 'storage engine', 'page cache'].join(' ')
            );

            const duration = Date.now() - startTime;
            if (duration > 2000) {
                this.logger.warn(`Aria AI analysis took ${duration}ms`);
            }

            return {
                summary: this.extractSummary(response),
                issues: this.extractIssues(response),
                recommendations: this.extractRecommendations(response),
                configChanges: this.extractConfigChanges(response),
                rawResponse: response
            };
        } catch (error) {
            this.logger.error('Failed to analyze Aria status:', error as Error);
            throw error;
        }
    }

    /**
     * Build context string for InnoDB analysis
     */
    private buildInnoDBContext(status: InnoDBStatus): string {
        return `
**Transaction Status:**
- History List Length: ${status.transactions.historyListLength.toLocaleString()}
- Active Transactions: ${status.transactions.activeTransactions}
- Purge Lag: ${status.transactions.purgeLag.toLocaleString()} undo records

**Buffer Pool:**
- Total Size: ${status.bufferPool.totalSize.toLocaleString()} pages
- Free Pages: ${status.bufferPool.freePages.toLocaleString()}
- Dirty Pages: ${status.bufferPool.dirtyPages.toLocaleString()}
- Hit Rate: ${status.bufferPool.hitRate.toFixed(2)}%

**Checkpoint & Redo Log:**
- Log Sequence Number: ${status.log.logSequenceNumber}
- Last Checkpoint: ${status.log.lastCheckpointLSN}
- Checkpoint Age: ${status.log.checkpointAge.toLocaleString()} (${status.log.checkpointAgePercent.toFixed(1)}% of max)

**I/O Operations:**
- Pending Reads: ${status.io.pendingReads}
- Pending Writes: ${status.io.pendingWrites}
- Pending Fsyncs: ${status.io.pendingFsyncs}

**Row Operations (per second):**
- Inserts: ${status.rowOps.insertsPerSecond.toFixed(2)}
- Updates: ${status.rowOps.updatesPerSecond.toFixed(2)}
- Deletes: ${status.rowOps.deletesPerSecond.toFixed(2)}
- Reads: ${status.rowOps.readsPerSecond.toFixed(2)}

**Semaphores:**
- Mutex OS Waits: ${status.semaphores.mutexOSWaits.toLocaleString()}
- RW-Lock OS Waits: ${status.semaphores.rwLockOSWaits.toLocaleString()}
- Long Waits: ${status.semaphores.longSemaphoreWaits.length}

**Overall Health Score:** ${status.healthScore}/100

**Version:** ${status.version}
`;
    }

    /**
     * Build context string for Aria analysis
     */
    private buildAriaContext(status: AriaStatus): string {
        return `
**Page Cache:**
- Size: ${status.pageCache.size.toLocaleString()} blocks
- Used: ${status.pageCache.used.toLocaleString()} blocks
- Hit Rate: ${status.pageCache.hitRate.toFixed(2)}%

**Recovery Log:**
- Size: ${status.recoveryLog.size.toLocaleString()} bytes
- Used: ${status.recoveryLog.used.toLocaleString()} bytes
- Checkpoint Interval: ${status.recoveryLog.checkpointInterval}s

**Buffers:**
- Read Buffer Size: ${status.readBufferSize.toLocaleString()} bytes
- Write Buffer Size: ${status.writeBufferSize.toLocaleString()} bytes

**Recovery Status:** ${status.crashRecoveryStatus}

**Overall Health Score:** ${status.healthScore}/100

**Version:** ${status.version}
`;
    }

    /**
     * Extract summary from AI response
     */
    private extractSummary(response: string): string {
        // Look for summary section or use first paragraph
        const summaryMatch = response.match(/##\s*Summary\s*\n([\s\S]*?)(?=\n##|$)/i);
        if (summaryMatch) {
            return summaryMatch[1].trim();
        }

        // Fall back to first paragraph
        const firstPara = response.split('\n\n')[0];
        return firstPara.replace(/^#+\s*/, '').trim();
    }

    /**
     * Extract issues from AI response
     */
    private extractIssues(response: string): Array<{ severity: string; description: string }> {
        const issues: Array<{ severity: string; description: string }> = [];
        const issuesSection = response.match(/##\s*Critical Issues\s*\n([\s\S]*?)(?=\n##|$)/i);

        if (issuesSection) {
            const lines = issuesSection[1].split('\n');
            for (const line of lines) {
                const match = line.match(/[-*]\s*\*\*(.*?)\*\*:\s*(.*)/);
                if (match) {
                    issues.push({
                        severity: match[1],
                        description: match[2]
                    });
                } else if (line.trim().startsWith('-') || line.trim().startsWith('*')) {
                    issues.push({
                        severity: 'warning',
                        description: line.replace(/^[-*]\s*/, '').trim()
                    });
                }
            }
        }

        return issues;
    }

    /**
     * Extract recommendations from AI response
     */
    private extractRecommendations(response: string): string[] {
        const recommendations: string[] = [];
        const recsSection = response.match(/##\s*Recommendations\s*\n([\s\S]*?)(?=\n##|$)/i);

        if (recsSection) {
            const lines = recsSection[1].split('\n');
            for (const line of lines) {
                if (line.trim().startsWith('-') || line.trim().startsWith('*') || line.trim().match(/^\d+\./)) {
                    recommendations.push(line.replace(/^[-*\d.]\s*/, '').trim());
                }
            }
        }

        return recommendations;
    }

    /**
     * Extract configuration changes from AI response
     */
    private extractConfigChanges(response: string): Array<{ parameter: string; current: string; recommended: string; reason: string }> {
        const changes: Array<{ parameter: string; current: string; recommended: string; reason: string }> = [];
        const configSection = response.match(/##\s*Configuration Changes\s*\n([\s\S]*?)(?=\n##|$)/i);

        if (configSection) {
            const lines = configSection[1].split('\n');

            for (const line of lines) {
                // Match pattern like: innodb_buffer_pool_size: 128M → 4G (Increase for better caching)
                const match = line.match(/[-*]\s*`?(\w+)`?\s*[:=]\s*(\S+)\s*[→>-]+\s*(\S+)\s*\((.*?)\)/);
                if (match) {
                    changes.push({
                        parameter: match[1],
                        current: match[2],
                        recommended: match[3],
                        reason: match[4]
                    });
                }
            }
        }

        return changes;
    }

    /**
     * Analyze replication status and provide diagnostic insights
     */
    async analyzeReplicationStatus(
        status: ReplicationStatus,
        dbType: 'mysql' | 'mariadb' = 'mysql'
    ): Promise<AIAnalysis> {
        const startTime = Date.now();
        this.logger.info('Analyzing replication status with AI');

        try {
            const context = this.buildReplicationContext(status);

            const prompt = `You are a database replication expert. Analyze the following MySQL/MariaDB replication status and provide diagnostic insights.

**Current Status:**
${context}

**Analysis Requirements:**
1. Identify replication health issues or risks
2. Explain root causes of lag spikes or thread failures
3. Provide specific, actionable recommendations
4. Suggest configuration optimizations for replication performance
5. Reference MySQL/MariaDB documentation when relevant

Provide your analysis in structured format with:
## Issues
[List current issues with severity]

## Root Causes
[Explain why lag or failures are occurring]

## Recommendations
[Specific actions to take, ordered by priority]

## Configuration Changes
[Exact parameter changes to improve replication]
`;

            const response = await this.getSimpleCompletion(
                prompt,
                dbType,
                true,
                ['replication', 'lag', 'gtid', 'binlog', dbType].join(' ')
            );

            const duration = Date.now() - startTime;
            if (duration > 2000) {
                this.logger.warn(`Replication AI analysis took ${duration}ms`);
            }

            return {
                summary: this.extractSummary(response),
                issues: this.extractIssues(response),
                recommendations: this.extractRecommendations(response),
                configChanges: this.extractConfigChanges(response),
                rawResponse: response
            };
        } catch (error) {
            this.logger.error('Failed to analyze replication status:', error as Error);
            throw error;
        }
    }

    /**
     * Build context string for replication analysis
     */
    private buildReplicationContext(status: ReplicationStatus): string {
        return `
**Replication Type:** ${status.replicaType.toUpperCase()} ${status.replicaType === 'gtid' ? '(GTID Mode)' : '(Position-based)'}

**Connection:**
- Master: ${status.masterHost}:${status.masterPort}
- User: ${status.masterUser}

**Thread Status:**
- I/O Thread: ${status.ioThread.running ? '✅ Running' : '❌ Stopped'} - ${status.ioThread.state}
- SQL Thread: ${status.sqlThread.running ? '✅ Running' : '❌ Stopped'} - ${status.sqlThread.state}

**Replication Lag:**
- Seconds Behind Master: ${status.lagSeconds !== null ? `${status.lagSeconds}s` : 'NULL (threads stopped)'}

${status.binlogPosition ? `
**Binary Log Position:**
- Master Log File: ${status.binlogPosition.masterLogFile}
- Master Log Pos: ${status.binlogPosition.masterLogPos}
- Relay Log File: ${status.binlogPosition.relayLogFile}
- Relay Log Pos: ${status.binlogPosition.relayLogPos}
` : ''}

${status.gtidInfo ? `
**GTID Status:**
- Retrieved GTID Set: ${status.gtidInfo.retrievedGtidSet || 'N/A'}
- Executed GTID Set: ${status.gtidInfo.executedGtidSet || 'N/A'}
- Auto Position: ${status.gtidInfo.autoPosition ? 'Enabled' : 'Disabled'}
` : ''}

${status.lastIOError ? `
**Last I/O Error:**
- Error ${status.lastIOError.errorNumber}: ${status.lastIOError.errorMessage}
- Timestamp: ${status.lastIOError.timestamp}
` : ''}

${status.lastSQLError ? `
**Last SQL Error:**
- Error ${status.lastSQLError.errorNumber}: ${status.lastSQLError.errorMessage}
- Timestamp: ${status.lastSQLError.timestamp}
` : ''}

**Overall Health:** ${status.healthStatus.toUpperCase()}

**Version:** ${status.version}
`;
    }
}

/**
 * AI Analysis result for storage engine diagnostics
 */
export interface AIAnalysis {
    summary: string;
    issues: Array<{ severity: string; description: string }>;
    recommendations: string[];
    configChanges: Array<{
        parameter: string;
        current: string;
        recommended: string;
        reason: string;
    }>;
    rawResponse: string;
}

// Type definitions

export interface ExplainInterpretation {
    summary: string;
    painPoints: PainPoint[];
    suggestions: string[];
    performancePrediction: {
        current: string;
        optimized: string;
        improvement: string;
    } | null;
    citations: Array<{
        source: string;
        url: string;
        excerpt: string;
    }>;
}

export interface PainPoint {
    type: 'full_table_scan' | 'filesort' | 'temp_table' | 'missing_index' | 'high_row_estimate';
    severity: 'CRITICAL' | 'WARNING' | 'INFO';
    description: string;
    table?: string;
    rowsAffected?: number;
    suggestion: string;
}

export interface ProfilingInterpretation {
    stages: ProfilingStage[];
    bottlenecks: ProfilingStage[];
    totalDuration: number;
    insights: string[];
    suggestions: string[];
    citations: Array<{
        source: string;
        url: string;
        excerpt: string;
    }>;
}

export interface ProfilingStage {
    name: string;
    duration: number;
    percentage: number;
}
