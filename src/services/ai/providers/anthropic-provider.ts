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
Tables:
`;
            for (const table of context.schema.tables) {
                prompt += `  - ${table.name}: ${table.columns.map((c: { name: string; type: string }) => `${c.name} (${c.type})`).join(', ')}\n`;
                if (table.indexes.length > 0) {
                    prompt += `    Indexes: ${table.indexes.map((i: { name: string }) => i.name).join(', ')}\n`;
                }
            }
        }

        // Add RAG documentation if available
        if (context.ragDocs && context.ragDocs.length > 0) {
            prompt += `
**Reference Documentation:**
`;
            for (const doc of context.ragDocs) {
                prompt += `
**${doc.title}**
Source: ${doc.source}
${doc.content}

`;
            }
            prompt += `
Please cite these references in your analysis when applicable.
`;
        }

        prompt += `
Provide your analysis as a JSON object with the following structure:
\`\`\`json
{
  "summary": "Brief description of what the query does and its purpose",
  "antiPatterns": [
    {
      "type": "descriptive_type",
      "severity": "critical|warning|info",
      "message": "clear description of the issue",
      "suggestion": "specific recommendation to fix"
    }
  ],
  "optimizationSuggestions": [
    {
      "title": "suggestion title",
      "description": "detailed explanation",
      "impact": "high|medium|low",
      "difficulty": "easy|medium|hard",
      "before": "original query/code (if applicable)",
      "after": "optimized query/code (if applicable)"
    }
  ],
  "estimatedComplexity": 5,
  "citations": [
    {
      "title": "reference document title",
      "source": "URL",
      "relevance": 0.8
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
