import { AIProvider, QueryContext, AIAnalysisResult, AIProviderConfig } from '../../../types/ai-types';
import { Logger } from '../../../utils/logger';
import OpenAI from 'openai';

/**
 * OpenAI Provider
 *
 * Uses OpenAI's API for query analysis
 * Works in all editors (VSCode, Cursor, Windsurf, etc.)
 */
export class OpenAIProvider implements AIProvider {
    readonly name = 'OpenAI';
    private client: OpenAI;
    private model: string;

    constructor(
        apiKey: string,
        private config: AIProviderConfig,
        private logger: Logger
    ) {
        this.client = new OpenAI({
            apiKey,
            dangerouslyAllowBrowser: false // We're in Node.js environment
        });
        this.model = config.openaiModel || 'gpt-4o-mini';
    }

    /**
     * Check if OpenAI is available
     */
    async isAvailable(): Promise<boolean> {
        try {
            // Try to list models to verify API key
            await this.client.models.list();
            return true;
        } catch (error) {
            this.logger.debug('OpenAI availability check failed:', error as Error);
            return false;
        }
    }

    /**
     * Analyze query using OpenAI
     */
    async analyzeQuery(query: string, context: QueryContext): Promise<AIAnalysisResult> {
        try {
            this.logger.info(`Analyzing query with OpenAI (${this.model})`);

            const prompt = this.buildPrompt(context);

            const response = await this.client.chat.completions.create({
                model: this.model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a MySQL/MariaDB database optimization expert. Provide analysis in JSON format.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3, // Lower temperature for more focused, technical responses
                response_format: { type: 'json_object' }
            });

            const content = response.choices[0]?.message?.content;
            if (!content) {
                throw new Error('Empty response from OpenAI');
            }

            return this.parseResponse(content);
        } catch (error) {
            this.logger.error('OpenAI analysis failed:', error as Error);
            throw new Error(`OpenAI analysis failed: ${(error as Error).message}`);
        }
    }

    /**
     * Build prompt for AI analysis
     */
    private buildPrompt(context: QueryContext): string {
        let prompt = `You are a Senior Database Administrator with 15+ years of experience managing high-performance MySQL and MariaDB systems in production environments. Your expertise includes query optimization, index design, performance tuning, and troubleshooting.

As a DBA, you provide practical, production-ready advice based on real-world experience. You understand the trade-offs between performance, maintainability, and resource utilization.

Analyze the following query as a Senior DBA:

**Query:**
\`\`\`sql
${context.anonymizedQuery || context.query}
\`\`\`
`;

        // Add schema context if available
        if (context.schema) {
            const tables = Array.isArray(context.schema.tables)
                ? context.schema.tables
                : Object.entries(context.schema.tables).map(([name, info]) => ({ name, ...info }));

            prompt += `
**Schema Context:**
Database: ${context.schema.database || 'N/A'}
Tables: ${tables.map((t: any) => `${t.name} (${t.columns?.map((c: any) => c.name).join(', ') || ''})`).join(', ')}
`;

            // Add performance/profiling analysis if available
            if (context.schema.performance) {
                const perf = context.schema.performance;
                prompt += `
**Query Performance Analysis:**
- Execution Time: ${perf.totalDuration ? `${perf.totalDuration.toLocaleString()}µs (${(perf.totalDuration / 1000).toFixed(2)}ms)` : 'N/A'}
- Rows Examined: ${perf.rowsExamined?.toLocaleString() || 'N/A'}
- Rows Sent: ${perf.rowsSent?.toLocaleString() || 'N/A'}
- Efficiency: ${perf.efficiency ? `${perf.efficiency.toFixed(1)}%` : 'N/A'}${perf.efficiency && perf.efficiency < 50 ? ' ⚠️ Low efficiency' : ''}
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
**Reference Documentation (use this to inform your recommendations, but don't cite sources):**
`;
            for (const doc of context.ragDocs) {
                prompt += `
${doc.title}:
${doc.content}

`;
            }
        }

        prompt += `
**As a Senior DBA, provide:**
IMPORTANT: If "Query Performance Analysis" section is present above, your summary MUST analyze the performance metrics including execution time, efficiency (rows examined vs sent), and execution stage bottlenecks.

Provide your response as a JSON object with this exact structure:
{
  "summary": "Your DBA assessment and performance analysis",
  "antiPatterns": [
    {
      "type": "string",
      "severity": "critical|warning|info",
      "message": "description",
      "suggestion": "how to fix"
    }
  ],
  "optimizationSuggestions": [
    {
      "title": "string",
      "description": "detailed description",
      "impact": "high|medium|low",
      "difficulty": "easy|medium|hard",
      "before": "optional: original code",
      "after": "optional: optimized code"
    }
  ],
  "estimatedComplexity": 5
}
`;

        return prompt;
    }

    /**
     * Parse OpenAI response
     */
    private parseResponse(content: string): AIAnalysisResult {
        try {
            const result = JSON.parse(content);
            return {
                summary: result.summary || 'No summary provided',
                antiPatterns: result.antiPatterns || [],
                optimizationSuggestions: result.optimizationSuggestions || [],
                estimatedComplexity: result.estimatedComplexity,
                citations: result.citations || []
            };
        } catch (error) {
            this.logger.warn('Failed to parse OpenAI JSON response:', error as Error);
            // Fallback
            return {
                summary: content.substring(0, 200),
                antiPatterns: [],
                optimizationSuggestions: [{
                    title: 'AI Analysis',
                    description: content,
                    impact: 'medium',
                    difficulty: 'medium'
                }],
                citations: []
            };
        }
    }
}
