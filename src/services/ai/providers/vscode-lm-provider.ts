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
Tables: ${tables.map((t: { name: string } | { name?: string }) => t.name).join(', ')}
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

        prompt += `
**As a Senior DBA, provide:**
1. A concise summary that MUST include performance analysis if profiling data is available:
   - Assess execution time (acceptable/slow/fast)
   - Analyze efficiency percentage and what it means
   - Identify the primary bottlenecks from execution stages
   - Provide your expert opinion on the query's health
2. Any anti-patterns or issues you've seen cause problems in production (with severity)
3. Specific, actionable optimization recommendations based on your DBA experience
   - Prioritize by impact (high/medium/low)
   - Include difficulty level (easy/medium/hard)
   - Provide before/after examples when helpful

IMPORTANT: If "Query Performance Analysis" section is present above, lead with performance assessment in your summary.

Format your response as JSON with this structure:
{
  "summary": "Your DBA assessment and performance analysis",
  "antiPatterns": [
    {"type": "string", "severity": "critical|warning|info", "message": "string", "suggestion": "string"}
  ],
  "optimizationSuggestions": [
    {"title": "string", "description": "string", "impact": "high|medium|low", "difficulty": "easy|medium|hard", "before": "optional", "after": "optional"}
  ],
  "estimatedComplexity": 5
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

    /**
     * Get a simple text completion from VSCode Language Models
     *
     * Uses VSCode's built-in language models (typically GitHub Copilot) for
     * natural language generation suitable for explanations and descriptions.
     *
     * @param prompt The prompt to send to the VSCode language model
     * @returns The generated text response
     * @throws Error if no language models are available or the API call fails
     */
    async getCompletion(prompt: string): Promise<string> {
        try {
            // Select best available model
            const models = await vscode.lm.selectChatModels({
                family: 'gpt-4o' // Prefer GPT-4o if available
            });

            if (models.length === 0) {
                throw new Error('No language models available. Please ensure GitHub Copilot is activated.');
            }

            const model = models[0];
            this.logger.debug(`Using model for completion: ${model.name} (${model.family})`);

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

            // Collect response text
            let responseText = '';
            for await (const chunk of response.text) {
                responseText += chunk;
            }

            return responseText.trim();
        } catch (error) {
            this.logger.error('VSCode LM completion failed:', error as Error);
            throw new Error(`AI completion failed: ${(error as Error).message}`);
        }
    }
}
