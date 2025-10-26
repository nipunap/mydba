import * as vscode from 'vscode';
import { AIProvider, QueryContext, AIAnalysisResult } from '../../../types/ai-types';
import { Logger } from '../../../utils/logger';

/**
 * VSCode Language Model Provider
 *
 * Uses VSCode's built-in Language Model API (GitHub Copilot)
 * Only available in official VSCode with GitHub Copilot subscription
 */
export class VSCodeLMProvider implements AIProvider {
    readonly name = 'VSCode Language Model (GitHub Copilot)';

    constructor(private logger: Logger) {}

    /**
     * Check if VSCode LM is available
     */
    async isAvailable(): Promise<boolean> {
        try {
            // Check if API exists
            if (typeof vscode.lm === 'undefined') {
                return false;
            }

            // Check if any models are available
            const models = await vscode.lm.selectChatModels();
            return models.length > 0;
        } catch (error) {
            this.logger.debug('VSCode LM availability check failed:', error as Error);
            return false;
        }
    }

    /**
     * Analyze query using VSCode Language Model
     */
    async analyzeQuery(query: string, context: QueryContext): Promise<AIAnalysisResult> {
        try {
            // Select best available model
            const models = await vscode.lm.selectChatModels({
                family: 'gpt-4o' // Prefer GPT-4o if available
            });

            if (models.length === 0) {
                throw new Error('No language models available. Please ensure GitHub Copilot is activated.');
            }

            const model = models[0];
            this.logger.info(`Using model: ${model.name} (${model.family})`);

            // Build prompt
            const prompt = this.buildPrompt(context);

            // Create messages
            const messages = [
                vscode.LanguageModelChatMessage.User(prompt)
            ];

            // Send request
            const response = await model.sendRequest(
                messages,
                {},
                new vscode.CancellationTokenSource().token
            );

            // Parse response
            let responseText = '';
            for await (const chunk of response.text) {
                responseText += chunk;
            }

            return this.parseResponse(responseText);
        } catch (error) {
            this.logger.error('VSCode LM analysis failed:', error as Error);
            throw new Error(`AI analysis failed: ${(error as Error).message}`);
        }
    }

    /**
     * Build prompt for AI analysis
     */
    private buildPrompt(context: QueryContext): string {
        let prompt = `You are a MySQL/MariaDB database optimization expert. Analyze the following SQL query and provide optimization suggestions.

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
Tables: ${context.schema.tables.map((t: { name: string }) => t.name).join(', ')}
`;
        }

        // Add RAG documentation if available
        if (context.ragDocs && context.ragDocs.length > 0) {
            prompt += `
**Reference Documentation:**
`;
            for (const doc of context.ragDocs) {
                prompt += `
**[${doc.title}](${doc.source})**
${doc.content}

`;
            }
            prompt += `
Please cite the reference documentation in your response when applicable.
`;
        }

        prompt += `
**Please provide:**
1. A brief summary of what the query does
2. Any anti-patterns or potential issues (with severity: critical/warning/info)
3. Specific optimization suggestions (with impact: high/medium/low)
4. If using reference documentation, cite the sources

Format your response as JSON with this structure:
{
  "summary": "Brief description",
  "antiPatterns": [
    {"type": "string", "severity": "critical|warning|info", "message": "string", "suggestion": "string"}
  ],
  "optimizationSuggestions": [
    {"title": "string", "description": "string", "impact": "high|medium|low", "difficulty": "easy|medium|hard"}
  ],
  "citations": [
    {"title": "string", "source": "string", "relevance": 0.9}
  ]
}
`;

        return prompt;
    }

    /**
     * Parse AI response into structured result
     */
    private parseResponse(responseText: string): AIAnalysisResult {
        try {
            // Try to extract JSON from response
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const result = JSON.parse(jsonMatch[0]);
                return {
                    summary: result.summary || 'No summary provided',
                    antiPatterns: result.antiPatterns || [],
                    optimizationSuggestions: result.optimizationSuggestions || [],
                    citations: result.citations || []
                };
            }

            // Fallback: parse as plain text
            return this.parseUnstructuredResponse(responseText);
        } catch (error) {
            this.logger.warn('Failed to parse AI response, using fallback:', error as Error);
            return this.parseUnstructuredResponse(responseText);
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
