import { AIProvider, QueryContext, AIAnalysisResult, AIProviderConfig } from '../../../types/ai-types';
import { Logger } from '../../../utils/logger';
import { Ollama } from 'ollama';

/**
 * Ollama Provider
 *
 * Uses local Ollama models for query analysis
 * 100% private - no data sent externally
 * Works in all editors (VSCode, Cursor, Windsurf, etc.)
 */
export class OllamaProvider implements AIProvider {
    readonly name = 'Ollama (Local)';
    private client: Ollama;
    private model: string;
    private endpoint: string;

    constructor(
        private config: AIProviderConfig,
        private logger: Logger
    ) {
        this.endpoint = config.ollamaEndpoint || 'http://localhost:11434';
        this.model = config.ollamaModel || 'llama3.1';

        this.client = new Ollama({
            host: this.endpoint
        });
    }

    /**
     * Check if Ollama is available
     */
    async isAvailable(): Promise<boolean> {
        try {
            // Check if Ollama is running and model is available
            const models = await this.client.list();
            const hasModel = models.models.some(m => m.name.includes(this.model));

            if (!hasModel) {
                this.logger.debug(`Ollama model '${this.model}' not found. Available models:`, models.models.map(m => m.name));
                return false;
            }

            return true;
        } catch {
            this.logger.debug('Ollama availability check failed:', error as Error);
            return false;
        }
    }

    /**
     * Analyze query using Ollama
     */
    async analyzeQuery(query: string, context: QueryContext): Promise<AIAnalysisResult> {
        try {
            this.logger.info(`Analyzing query with Ollama (${this.model})`);

            const prompt = this.buildPrompt(context);

            const response = await this.client.chat({
                model: this.model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a MySQL/MariaDB database optimization expert. Provide analysis in JSON format only.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                stream: false,
                options: {
                    temperature: 0.3,
                    top_p: 0.9
                }
            });

            const content = response.message.content;
            return this.parseResponse(content);
        } catch {
            this.logger.error('Ollama analysis failed:', error as Error);

            // Provide helpful error message
            if ((error as Error).message.includes('ECONNREFUSED')) {
                throw new Error('Ollama is not running. Please start Ollama with: ollama serve');
            }

            throw new Error(`Ollama analysis failed: ${(error as Error).message}`);
        }
    }

    /**
     * Build prompt for AI analysis
     */
    private buildPrompt(context: QueryContext): string {
        let prompt = `You are a Senior Database Administrator with 15+ years of experience managing high-performance MySQL and MariaDB systems in production environments.

As a DBA, you provide practical, production-ready advice. Analyze this query:

Query:
${context.anonymizedQuery || context.query}
`;

        // Add schema context if available
        if (context.schema) {
            const tables = Array.isArray(context.schema.tables)
                ? context.schema.tables
                : Object.entries(context.schema.tables).map(([name, info]) => ({ name, ...info }));

            prompt += `
Schema Context:
Database: ${context.schema.database || 'N/A'}
Tables: ${tables.map((t: unknown) => {
                const cols = (t.columns || []).slice(0, 5).map((c: unknown) => `${c.name}:${c.type}`).join(', ');
                const more = (t.columns?.length || 0) > 5 ? ` (+${t.columns.length - 5} more)` : '';
                return `${t.name}(${cols}${more})`;
            }).join(', ')}
`;

            // Add performance/profiling analysis if available
            if (context.schema.performance) {
                const perf = context.schema.performance;
                prompt += `
Query Performance Analysis:
- Execution Time: ${perf.totalDuration ? `${perf.totalDuration.toLocaleString()}µs (${(perf.totalDuration / 1000).toFixed(2)}ms)` : 'N/A'}
- Rows Examined: ${perf.rowsExamined?.toLocaleString() || 'N/A'}
- Rows Sent: ${perf.rowsSent?.toLocaleString() || 'N/A'}
- Efficiency: ${perf.efficiency ? `${perf.efficiency.toFixed(1)}%` : 'N/A'}${perf.efficiency && perf.efficiency < 50 ? ' (Low efficiency)' : ''}
- Lock Time: ${perf.lockTime ? `${perf.lockTime.toLocaleString()}µs` : 'N/A'}
`;
                if (perf.stages && perf.stages.length > 0) {
                    const topStages = [...perf.stages].sort((a, b) => b.duration - a.duration).slice(0, 5);
                    prompt += `\nTop Execution Stages:\n`;
                    topStages.forEach(stage => {
                        prompt += `  - ${stage.name}: ${stage.duration.toLocaleString()}µs\n`;
                    });
                }
            }
        }

        // Add RAG documentation if available (for AI context, not shown to user)
        if (context.ragDocs && context.ragDocs.length > 0) {
            prompt += `
Reference Documentation (use this to inform your recommendations):
`;
            for (const doc of context.ragDocs) {
                prompt += `
${doc.title}:
${doc.content.substring(0, 500)}...

`;
            }
        }

        prompt += `
IMPORTANT: If "Query Performance Analysis" section is present above, your summary MUST analyze the performance metrics including execution time, efficiency, and execution bottlenecks.

Respond with ONLY a JSON object in this exact format:
{
  "summary": "Your DBA assessment and performance analysis",
  "antiPatterns": [{"type": "name", "severity": "critical|warning|info", "message": "issue", "suggestion": "fix"}],
  "optimizationSuggestions": [{"title": "name", "description": "details", "impact": "high|medium|low", "difficulty": "easy|medium|hard", "before": "optional", "after": "optional"}],
  "estimatedComplexity": 3
}

Return ONLY the JSON, no explanatory text.`;

        return prompt;
    }

    /**
     * Parse Ollama response
     */
    private parseResponse(content: string): AIAnalysisResult {
        try {
            // Ollama sometimes wraps JSON in markdown code blocks
            const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || content.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                const jsonText = jsonMatch[1] || jsonMatch[0];
                const result = JSON.parse(jsonText);

                return {
                    summary: result.summary || 'Query analyzed',
                    antiPatterns: Array.isArray(result.antiPatterns) ? result.antiPatterns : [],
                    optimizationSuggestions: Array.isArray(result.optimizationSuggestions) ? result.optimizationSuggestions : [],
                    estimatedComplexity: result.estimatedComplexity,
                    citations: Array.isArray(result.citations) ? result.citations : []
                };
            }

            // Fallback for non-JSON responses
            return this.parseUnstructuredResponse(content);
        } catch {
            this.logger.warn('Failed to parse Ollama JSON response, using fallback:', error as Error);
            return this.parseUnstructuredResponse(content);
        }
    }

    /**
     * Parse unstructured response (fallback)
     */
    private parseUnstructuredResponse(text: string): AIAnalysisResult {
        // Try to extract some useful information
        const lines = text.split('\n').filter(l => l.trim());
        const summary = lines[0] || 'Query analyzed by Ollama';

        return {
            summary,
            antiPatterns: [],
            optimizationSuggestions: [{
                title: 'AI Analysis (Ollama)',
                description: text,
                impact: 'medium',
                difficulty: 'medium'
            }],
            citations: []
        };
    }

    /**
     * List available models
     */
    async listAvailableModels(): Promise<string[]> {
        try {
            const response = await this.client.list();
            return response.models.map(m => m.name);
        } catch {
            this.logger.error('Failed to list Ollama models:', error as Error);
            return [];
        }
    }
}
