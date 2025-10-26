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
        let prompt = `Analyze the following SQL query and provide optimization suggestions.

**Query:**
\`\`\`sql
${context.anonymizedQuery || context.query}
\`\`\`
`;

        // Add schema context if available
        if (context.schema) {
            prompt += `
**Schema Context:**
Database: ${context.schema.database}
Tables: ${context.schema.tables.map((t: { name: string; columns: Array<{ name: string }> }) => `${t.name} (${t.columns.map((c) => c.name).join(', ')})`).join(', ')}
`;
        }

        // Add RAG documentation if available
        if (context.ragDocs && context.ragDocs.length > 0) {
            prompt += `
**Reference Documentation:**
`;
            for (const doc of context.ragDocs) {
                prompt += `
**${doc.title}** (${doc.source})
${doc.content}

`;
            }
        }

        prompt += `
Provide your response as a JSON object with this exact structure:
{
  "summary": "Brief description of what the query does",
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
  "estimatedComplexity": 5,
  "citations": [
    {
      "title": "reference title",
      "source": "URL",
      "relevance": 0.9
    }
  ]
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
