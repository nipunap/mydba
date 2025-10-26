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
        } catch (error) {
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
        } catch (error) {
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
        let prompt = `Analyze this SQL query for MySQL/MariaDB and provide optimization suggestions.

Query:
${context.anonymizedQuery || context.query}
`;

        // Add schema context if available
        if (context.schema) {
            prompt += `
Schema Context:
Database: ${context.schema.database}
Tables: ${context.schema.tables.map((t: { name: string; columns: Array<{ name: string; type: string }> }) => {
                const cols = t.columns.slice(0, 5).map((c) => `${c.name}:${c.type}`).join(', ');
                const more = t.columns.length > 5 ? ` (+${t.columns.length - 5} more)` : '';
                return `${t.name}(${cols}${more})`;
            }).join(', ')}
`;
        }

        // Add RAG documentation if available
        if (context.ragDocs && context.ragDocs.length > 0) {
            prompt += `
Reference Documentation:
`;
            for (const doc of context.ragDocs) {
                prompt += `
${doc.title} (${doc.source}):
${doc.content.substring(0, 500)}...

`;
            }
        }

        prompt += `
Respond with ONLY a JSON object in this exact format:
{
  "summary": "what the query does",
  "antiPatterns": [{"type": "name", "severity": "critical|warning|info", "message": "issue", "suggestion": "fix"}],
  "optimizationSuggestions": [{"title": "name", "description": "details", "impact": "high|medium|low", "difficulty": "easy|medium|hard"}],
  "estimatedComplexity": 3,
  "citations": [{"title": "doc", "source": "url", "relevance": 0.8}]
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
        } catch (error) {
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
        } catch (error) {
            this.logger.error('Failed to list Ollama models:', error as Error);
            return [];
        }
    }
}
