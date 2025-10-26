import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { ConnectionManager } from '../services/connection-manager';

export interface QueryOptimizationSuggestion {
    issue: string;
    severity: 'critical' | 'warning' | 'info';
    suggestion: string;
    estimatedImpact: string;
    sqlExample?: string;
}

export interface AIAnalysisResult {
    summary: string;
    suggestions: QueryOptimizationSuggestion[];
    explanation: string;
}

/**
 * AI Service for query optimization and database assistance
 * Uses VSCode Language Model API (Copilot/Claude/etc)
 */
export class AIService {
    private readonly MODEL_SELECTOR: vscode.LanguageModelChatSelector = {
        vendor: 'copilot',
        family: 'gpt-4'
    };

    constructor(
        private logger: Logger,
        private connectionManager: ConnectionManager
    ) {}

    /**
     * Analyze a query and provide optimization suggestions
     */
    async analyzeQuery(
        connectionId: string,
        query: string,
        explainResult?: any,
        schemaContext?: string
    ): Promise<AIAnalysisResult> {
        this.logger.info('Analyzing query with AI...');

        const cfg = vscode.workspace.getConfiguration('mydba');
        if (!cfg.get<boolean>('ai.enabled')) {
            throw new Error('AI features are disabled (mydba.ai.enabled=false). Enable in settings to use AI analysis.');
        }

        try {
            // Check if AI is available
            const models = await vscode.lm.selectChatModels(this.MODEL_SELECTOR);
            if (models.length === 0) {
                throw new Error('No language model available. Please ensure GitHub Copilot or another language model provider is installed and enabled.');
            }

            const model = models[0];

            // Anonymize the query for privacy
            const anonymizedQuery = this.anonymizeQuery(query);

            // Build context-rich prompt
            const prompt = this.buildQueryAnalysisPrompt(
                anonymizedQuery,
                explainResult,
                schemaContext
            );

            // Send to AI
            const messages = [
                vscode.LanguageModelChatMessage.User(prompt)
            ];

            const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

            // Collect response
            let fullResponse = '';
            for await (const chunk of response.text) {
                fullResponse += chunk;
            }

            // Parse AI response
            return this.parseAIResponse(fullResponse);

        } catch (error) {
            this.logger.error('AI analysis failed:', error as Error);
            throw new Error(`AI analysis failed: ${(error as Error).message}`);
        }
    }

    /**
     * Get configuration recommendations
     */
    async getConfigurationAdvice(
        connectionId: string,
        variables: Record<string, string>
    ): Promise<string> {
        this.logger.info('Getting configuration advice from AI...');

        const cfg = vscode.workspace.getConfiguration('mydba');
        if (!cfg.get<boolean>('ai.enabled')) {
            throw new Error('AI features are disabled (mydba.ai.enabled=false).');
        }

        try {
            const models = await vscode.lm.selectChatModels(this.MODEL_SELECTOR);
            if (models.length === 0) {
                throw new Error('No language model available');
            }

            const model = models[0];

            const prompt = this.buildConfigurationAdvicePrompt(variables);
            const messages = [vscode.LanguageModelChatMessage.User(prompt)];

            const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

            let fullResponse = '';
            for await (const chunk of response.text) {
                fullResponse += chunk;
            }

            return fullResponse;

        } catch (error) {
            this.logger.error('Configuration advice failed:', error as Error);
            throw error;
        }
    }

    /**
     * Explain a concept or error
     */
    async explainConcept(concept: string, context?: string): Promise<string> {
        try {
            const cfg = vscode.workspace.getConfiguration('mydba');
            if (!cfg.get<boolean>('ai.enabled')) {
                throw new Error('AI features are disabled (mydba.ai.enabled=false).');
            }
            const models = await vscode.lm.selectChatModels(this.MODEL_SELECTOR);
            if (models.length === 0) {
                throw new Error('No language model available');
            }

            const model = models[0];

            let prompt = `You are a MySQL/MariaDB database expert. Explain the following concept in clear, concise terms:\n\n${concept}`;

            if (context) {
                prompt += `\n\nContext: ${context}`;
            }

            const messages = [vscode.LanguageModelChatMessage.User(prompt)];
            const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

            let fullResponse = '';
            for await (const chunk of response.text) {
                fullResponse += chunk;
            }

            return fullResponse;

        } catch (error) {
            this.logger.error('Concept explanation failed:', error as Error);
            throw error;
        }
    }

    private buildQueryAnalysisPrompt(
        anonymizedQuery: string,
        explainResult?: any,
        schemaContext?: string
    ): string {
        let prompt = `You are a MySQL/MariaDB performance optimization expert. Analyze the following SQL query and provide optimization suggestions.

**Query (anonymized for privacy):**
\`\`\`sql
${anonymizedQuery}
\`\`\`
`;

        if (explainResult) {
            prompt += `\n**EXPLAIN Result:**
\`\`\`json
${JSON.stringify(explainResult, null, 2).substring(0, 2000)}
\`\`\`
`;
        }

        if (schemaContext) {
            prompt += `\n**Schema Context:**
${schemaContext}
`;
        }

        prompt += `
**Instructions:**
1. Identify performance issues (e.g., full table scans, missing indexes, inefficient joins)
2. Provide specific, actionable optimization suggestions
3. Estimate the potential performance impact (High/Medium/Low)
4. Include SQL examples where applicable
5. Prioritize suggestions by severity (Critical/Warning/Info)

**Response Format:**
Provide your response in the following JSON format:
\`\`\`json
{
  "summary": "Brief overview of query performance",
  "suggestions": [
    {
      "issue": "Description of the issue",
      "severity": "critical|warning|info",
      "suggestion": "How to fix it",
      "estimatedImpact": "High|Medium|Low",
      "sqlExample": "Optional SQL example"
    }
  ],
  "explanation": "Detailed explanation of the analysis"
}
\`\`\`
`;

        return prompt;
    }

    private buildConfigurationAdvicePrompt(variables: Record<string, string>): string {
        // Filter sensitive/irrelevant variables
        const relevantVars = Object.entries(variables)
            .filter(([key]) =>
                key.includes('buffer') ||
                key.includes('cache') ||
                key.includes('pool') ||
                key.includes('thread') ||
                key.includes('connection') ||
                key.includes('timeout') ||
                key.includes('sort') ||
                key.includes('join')
            )
            .slice(0, 50); // Limit to avoid token overflow

        const varList = relevantVars.map(([key, value]) => `${key} = ${value}`).join('\n');

        return `You are a MySQL/MariaDB database configuration expert. Review the following server variables and provide recommendations for optimization:

**Current Configuration:**
\`\`\`
${varList}
\`\`\`

**Instructions:**
1. Identify any misconfigurations or suboptimal settings
2. Provide specific recommendations with reasoning
3. Consider modern best practices for MySQL 8.0+/MariaDB 10.6+
4. Prioritize recommendations by impact
5. Include warnings for any dangerous settings

Provide a clear, well-structured response with actionable recommendations.`;
    }

    /**
     * Anonymize query for privacy by replacing literals with placeholders
     * This is a simplified implementation - could be enhanced with proper SQL parsing
     */
    private anonymizeQuery(query: string): string {
        // Replace string literals
        let anonymized = query.replace(/'[^']*'/g, "'<string>'");

        // Replace numeric literals (but not in function calls or table/column names)
        anonymized = anonymized.replace(/\b\d+\b/g, '<number>');

        // Replace email patterns
        anonymized = anonymized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '<email>');

        // Replace UUID patterns
        anonymized = anonymized.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>');

        return anonymized;
    }

    private parseAIResponse(response: string): AIAnalysisResult {
        try {
            // Try to extract JSON from code blocks
            const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[1]);
                return parsed;
            }

            // Try to parse as direct JSON
            const parsed = JSON.parse(response);
            return parsed;

        } catch (error) {
            // If parsing fails, return a structured fallback
            this.logger.warn('Failed to parse AI response as JSON, using fallback structure');

            return {
                summary: 'AI analysis completed (response format could not be parsed)',
                suggestions: [
                    {
                        issue: 'Analysis available',
                        severity: 'info',
                        suggestion: response,
                        estimatedImpact: 'Unknown'
                    }
                ],
                explanation: response
            };
        }
    }

    /**
     * Check if AI features are available
     */
    async isAIAvailable(): Promise<boolean> {
        try {
            const models = await vscode.lm.selectChatModels(this.MODEL_SELECTOR);
            return models.length > 0;
        } catch {
            return false;
        }
    }

    /**
     * Get AI model information
     */
    async getAIModelInfo(): Promise<{ vendor: string; family: string; name: string } | null> {
        try {
            const models = await vscode.lm.selectChatModels(this.MODEL_SELECTOR);
            if (models.length === 0) {
                return null;
            }
            const model = models[0];
            return {
                vendor: model.vendor,
                family: model.family,
                name: model.name || 'Unknown'
            };
        } catch {
            return null;
        }
    }
}
