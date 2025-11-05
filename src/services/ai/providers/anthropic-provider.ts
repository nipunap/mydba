import { AIProvider, QueryContext, AIAnalysisResult, AIProviderConfig } from '../../../types/ai-types';
import { Logger } from '../../../utils/logger';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Anthropic Claude Provider
 *
 * Uses Anthropic's Claude API for query analysis
 * Works in all editors (VSCode, Cursor, Windsurf, etc.)
 */
export class AnthropicProvider implements AIProvider {
    readonly name = 'Anthropic Claude';
    private client: Anthropic;
    private model: string;

    constructor(
        apiKey: string,
        private config: AIProviderConfig,
        private logger: Logger
    ) {
        this.client = new Anthropic({
            apiKey
        });
        this.model = config.anthropicModel || 'claude-3-5-sonnet-20241022';
    }

    /**
     * Check if Anthropic is available
     */
    async isAvailable(): Promise<boolean> {
        try {
            // Try a simple API call to verify credentials
            await this.client.messages.create({
                model: this.model,
                max_tokens: 10,
                messages: [{
                    role: 'user',
                    content: 'test'
                }]
            });
            return true;
        } catch (error) {
            this.logger.debug('Anthropic availability check failed:', error as Error);
            return false;
        }
    }

    /**
     * Analyze query using Anthropic Claude
     */
    async analyzeQuery(query: string, context: QueryContext): Promise<AIAnalysisResult> {
        try {
            this.logger.info(`Analyzing query with Anthropic Claude (${this.model})`);

            const prompt = this.buildPrompt(context);

            const response = await this.client.messages.create({
                model: this.model,
                max_tokens: 4096,
                temperature: 0.3,
                system: 'You are a MySQL/MariaDB database optimization expert. Analyze queries and provide structured optimization advice in JSON format.',
                messages: [{
                    role: 'user',
                    content: prompt
                }]
            });

            const content = response.content[0];
            if (content.type !== 'text') {
                throw new Error('Unexpected response type from Anthropic');
            }

            return this.parseResponse(content.text);
        } catch (error) {
            this.logger.error('Anthropic analysis failed:', error as Error);
            throw new Error(`Anthropic analysis failed: ${(error as Error).message}`);
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
Tables:
`;
            for (const table of tables) {
                const tableName = table.name || 'unknown';
                prompt += `  - ${tableName}: ${table.columns?.map((c: { name: string; type: string }) => `${c.name} (${c.type})`).join(', ') || ''}\n`;
                if (table.indexes && table.indexes.length > 0) {
                    prompt += `    Indexes: ${table.indexes.map((i: { name: string }) => i.name).join(', ')}\n`;
                }
            }

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

        // Add RAG documentation if available (for AI context WITH citations)
        if (context.ragDocs && context.ragDocs.length > 0) {
            prompt += `
**Reference Documentation (cite these sources when relevant to your recommendations):**
`;
            for (let i = 0; i < context.ragDocs.length; i++) {
                const doc = context.ragDocs[i];
                prompt += `
[Citation ${i + 1}] ${doc.title}:
${doc.content}

`;
            }
        }

        prompt += `
**As a Senior DBA, provide:**
IMPORTANT: If "Query Performance Analysis" section is present above, your summary MUST analyze the performance metrics including execution time, efficiency (rows examined vs sent), and execution stage bottlenecks.

When providing recommendations, cite the reference documentation using [Citation X] format where applicable.

Provide your analysis as a JSON object with the following structure:
\`\`\`json
{
  "summary": "Your DBA assessment and performance analysis (include citations like [Citation 1] where relevant)",
  "antiPatterns": [
    {
      "type": "descriptive_type (e.g., Full Table Scan, Missing Index, N+1 Query Pattern)",
      "severity": "critical|warning|info",
      "message": "clear description of the issue",
      "suggestion": "specific recommendation to fix (include citations if applicable)"
    }
  ],
  "optimizationSuggestions": [
    {
      "title": "suggestion title",
      "description": "detailed explanation with citations if applicable (e.g., According to [Citation 1]...)",
      "impact": "high|medium|low",
      "difficulty": "easy|medium|hard",
      "before": "original query/code (if applicable)",
      "after": "optimized query/code (if applicable)"
    }
  ],
  "estimatedComplexity": 5,
  "citations": [
    {
      "id": "citation-1",
      "title": "string (from reference documentation)",
      "url": "optional URL if known",
      "relevance": "brief explanation of why this citation is relevant"
    }
  ]
}
\`\`\`

Only return the JSON object, no additional text.`;

        return prompt;
    }

    /**
     * Parse Anthropic response
     */
    private parseResponse(content: string): AIAnalysisResult {
        try {
            // Extract JSON from code block if present
            const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const jsonText = jsonMatch[1] || jsonMatch[0];
                const result = JSON.parse(jsonText);
                return {
                    summary: result.summary || 'No summary provided',
                    antiPatterns: result.antiPatterns || [],
                    optimizationSuggestions: result.optimizationSuggestions || [],
                    estimatedComplexity: result.estimatedComplexity,
                    citations: result.citations || []
                };
            }

            // Fallback: treat as plain text
            return this.parseUnstructuredResponse(content);
        } catch (error) {
            this.logger.warn('Failed to parse Anthropic JSON response:', error as Error);
            return this.parseUnstructuredResponse(content);
        }
    }

    /**
     * Parse unstructured response (fallback)
     */
    private parseUnstructuredResponse(text: string): AIAnalysisResult {
        return {
            summary: text.split('\n')[0] || 'AI analysis completed',
            antiPatterns: [],
            optimizationSuggestions: [{
                title: 'AI Analysis',
                description: text,
                impact: 'medium',
                difficulty: 'medium'
            }],
            citations: []
        };
    }
}
