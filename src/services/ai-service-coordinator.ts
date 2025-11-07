import * as vscode from 'vscode';
import { AIService } from './ai-service';
import { QueryAnalyzer } from './query-analyzer';
import { Logger } from '../utils/logger';
import { SchemaContext, AIAnalysisResult } from '../types/ai-types';

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
        private context: vscode.ExtensionContext
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
        this.logger.info('Analyzing query with AI Service Coordinator');

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

            this.logger.info(`Query analysis complete: ${result.optimizationSuggestions.length} suggestions`);
            return result;

        } catch (error) {
            this.logger.error('Query analysis failed:', error as Error);

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
                    dbType
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
        _explainData: unknown,
        _query: string,
        _painPoints: PainPoint[],
        _dbType: string
    ): Promise<{ summary: string; suggestions: string[]; performancePrediction: null; citations: Array<{ source: string; url: string; excerpt: string }> }> {
        // This would call the AI service with appropriate prompting
        // For now, returning a placeholder structure
        return {
            summary: 'AI interpretation not yet implemented',
            suggestions: [],
            performancePrediction: null,
            citations: []
        };
    }

    private async getAIProfilingInsights(
        stages: ProfilingStage[],
        bottlenecks: ProfilingStage[],
        query: string,
        dbType: string
    ): Promise<{ insights: string[]; suggestions: string[]; citations: Array<{ source: string; url: string; excerpt: string }> }> {
        this.logger.info('Getting AI profiling insights');

        try {
            // Build a schema context with performance data
            const totalDuration = this.calculateTotalDuration(stages);
            const efficiency = stages.length > 0 ? (stages.reduce((sum, s) => sum + s.duration, 0) / totalDuration) * 100 : 0;

            const schemaContext = {
                tables: {},
                performance: {
                    totalDuration,
                    efficiency,
                    stages: stages.map(s => ({
                        name: s.name,
                        duration: s.duration,
                        percentage: s.percentage
                    })),
                    bottlenecks: bottlenecks.map(b => ({
                        name: b.name,
                        duration: b.duration,
                        percentage: b.percentage
                    }))
                }
            };

            // Use AI service to analyze the query with profiling context
            const aiResult = await this.aiService.analyzeQuery(query, schemaContext as Record<string, unknown>, dbType as 'mysql' | 'mariadb');

            // Extract insights and suggestions from AI result
            const insights: string[] = [];
            const suggestions: string[] = [];

            // Add summary as primary insight
            if (aiResult.summary) {
                insights.push(aiResult.summary);
            }

            // Add anti-patterns as insights
            if (aiResult.antiPatterns && aiResult.antiPatterns.length > 0) {
                aiResult.antiPatterns.forEach((ap: Record<string, unknown>) => {
                    insights.push(`⚠️ ${ap.type || 'Issue'}: ${ap.message}`);
                    if (ap.suggestion) {
                        suggestions.push(String(ap.suggestion));
                    }
                });
            }

            // Add optimization suggestions
            if (aiResult.optimizationSuggestions && aiResult.optimizationSuggestions.length > 0) {
                aiResult.optimizationSuggestions.forEach((opt: Record<string, unknown>) => {
                    suggestions.push(`${opt.title}: ${opt.description}`);
                });
            }

            // Extract citations if available
            const citations: Array<{ source: string; url: string; excerpt: string }> = [];
            if (aiResult.citations && Array.isArray(aiResult.citations)) {
                aiResult.citations.forEach((citation: Record<string, unknown>) => {
                    citations.push({
                        source: String(citation.title || citation.source || 'Unknown'),
                        url: String(citation.url || ''),
                        excerpt: String(citation.relevance || citation.excerpt || '')
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
