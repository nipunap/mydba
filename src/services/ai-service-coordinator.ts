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
            if (node.access_type === 'ALL' && node.rows_examined_per_scan > 10000) {
                painPoints.push({
                    type: 'full_table_scan',
                    severity: 'CRITICAL',
                    description: `Full table scan on ${node.table_name} (${node.rows_examined_per_scan} rows)`,
                    table: node.table_name,
                    rowsAffected: node.rows_examined_per_scan,
                    suggestion: `Add index on ${node.table_name} to avoid full scan`
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
            if (node.possible_keys === null && node.access_type === 'ALL') {
                painPoints.push({
                    type: 'missing_index',
                    severity: 'CRITICAL',
                    description: `No possible indexes for ${node.table_name}`,
                    table: node.table_name,
                    suggestion: `Create appropriate index on ${node.table_name}`
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
        const totalDuration = stages.reduce((sum, stage: unknown) => {
            const s = stage as { duration?: number; Duration?: number };
            return sum + (s.duration || s.Duration || 0);
        }, 0);

        return stages.map(stage => {
            const s = stage as { name?: string; Stage?: string; event_name?: string; duration?: number; Duration?: number };
            const duration = s.duration || s.Duration || 0;
            return {
                name: s.name || s.Stage || s.event_name || 'unknown',
                duration,
                percentage: totalDuration > 0 ? (duration / totalDuration) * 100 : 0
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
    ): Promise<{ summary: string; suggestions: string[]; performancePrediction: null; citations: unknown[] }> {
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
        _stages: ProfilingStage[],
        _bottlenecks: ProfilingStage[],
        _query: string,
        _dbType: string
    ): Promise<{ insights: string[]; suggestions: string[]; citations: unknown[] }> {
        // This would call the AI service with appropriate prompting
        // For now, returning a placeholder structure
        return {
            insights: [],
            suggestions: [],
            citations: []
        };
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
