import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { ServiceContainer, SERVICE_TOKENS } from '../core/service-container';
import { ChatCommandContext, IChatContextProvider } from './types';
import { ConnectionError, QueryExecutionError } from '../core/errors';

/**
 * Handles all chat commands
 */
export class ChatCommandHandlers {
    constructor(
        private logger: Logger,
        private serviceContainer: ServiceContainer,
        private contextProvider: IChatContextProvider
    ) {}

    /**
     * /analyze - Analyze a SQL query with AI insights
     */
    async handleAnalyze(context: ChatCommandContext): Promise<void> {
        const { stream, prompt, activeConnectionId, activeQuery, token } = context;

        try {
            // Show progress
            stream.progress('Analyzing query...');

            // Extract query from prompt or use active query
            const query = this.extractQueryFromPrompt(prompt) || activeQuery;

            if (!query) {
                stream.markdown('❌ **No SQL query found**\n\n');
                stream.markdown('Please provide a SQL query to analyze, or select one in your editor.\n\n');
                stream.markdown('**Example:** `@mydba /analyze SELECT * FROM users WHERE created_at > NOW() - INTERVAL 7 DAY`');
                return;
            }

            if (!activeConnectionId) {
                stream.markdown('⚠️  **No active database connection**\n\n');
                stream.markdown('Please connect to a database first using the MyDBA sidebar.\n');
                
                // Provide button to connect
                stream.button({
                    command: 'mydba.newConnection',
                    title: 'Connect to Database'
                });
                return;
            }

            // Check cancellation
            if (token.isCancellationRequested) {
                return;
            }

            // Get connection manager to access adapter
            const connectionManager = this.serviceContainer.get(SERVICE_TOKENS.ConnectionManager);
            const adapter = connectionManager.getAdapter(activeConnectionId);

            if (!adapter) {
                throw new Error('Database adapter not available for this connection');
            }

            // Show the query being analyzed
            stream.markdown('### 🔍 Analyzing Query\n\n');
            stream.markdown('```sql\n' + query + '\n```\n\n');

            // Perform AI analysis (using AIServiceCoordinator for now)
            stream.progress('Getting AI insights...');
            
            const aiService = this.serviceContainer.get(SERVICE_TOKENS.AIServiceCoordinator);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const analysisResult = await aiService.analyzeQuery({ query, connectionId: activeConnectionId }) as any;

            // Stream the response
            await this.renderAnalysisResults(stream, analysisResult, query, activeConnectionId);

        } catch (error) {
            this.handleCommandError(stream, error as Error, 'analyze query');
        }
    }

    /**
     * /explain - Show and visualize query execution plan
     */
    async handleExplain(context: ChatCommandContext): Promise<void> {
        const { stream, prompt, activeConnectionId, activeQuery } = context;

        try {
            stream.progress('Generating execution plan...');

            const query = this.extractQueryFromPrompt(prompt) || activeQuery;

            if (!query) {
                stream.markdown('❌ **No SQL query found**\n\n');
                stream.markdown('Please provide a SQL query to explain.\n\n');
                stream.markdown('**Example:** `@mydba /explain SELECT * FROM orders JOIN users ON orders.user_id = users.id`');
                return;
            }

            if (!activeConnectionId) {
                stream.markdown('⚠️  **No active database connection**\n\n');
                stream.button({
                    command: 'mydba.newConnection',
                    title: 'Connect to Database'
                });
                return;
            }

            // Show query
            stream.markdown('### 📊 Query Execution Plan\n\n');
            stream.markdown('```sql\n' + query + '\n```\n\n');

            // Open the EXPLAIN viewer panel
            stream.markdown('Opening EXPLAIN Viewer...\n\n');
            
            await vscode.commands.executeCommand('mydba.explainQuery', {
                query,
                connectionId: activeConnectionId
            });

            stream.markdown('✅ **EXPLAIN Viewer opened** - View the interactive execution plan visualization in the panel.\n\n');
            
            // Provide quick insights in chat
            const connectionManager = this.serviceContainer.get(SERVICE_TOKENS.ConnectionManager);
            const adapter = connectionManager.getAdapter(activeConnectionId);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (adapter && 'explain' in adapter && typeof (adapter as any).explain === 'function') {
                try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const explainResult = await (adapter as any).explain(query);

                    stream.markdown('**Quick Insights:**\n\n');
                    
                    if (explainResult) {
                        // Check for full table scans
                        if (explainResult.type === 'ALL') {
                            stream.markdown(`⚠️  **Full table scan detected** on \`${explainResult.table}\` (${explainResult.rows} rows)\n\n`);
                            stream.markdown('💡 Consider adding an index to improve performance.\n');
                        } else if (explainResult.extra?.includes('Using filesort')) {
                            stream.markdown(`⚠️  **File sort operation** detected\n\n`);
                            stream.markdown('💡 This may impact performance for large result sets.\n');
                        } else {
                            stream.markdown('✅ No obvious performance issues detected.\n');
                        }
                    }
                } catch (explainError) {
                    this.logger.warn('Failed to get EXPLAIN quick insights:', explainError as Error);
                }
            }

        } catch (error) {
            this.handleCommandError(stream, error as Error, 'generate execution plan');
        }
    }

    /**
     * /profile - Profile query performance
     */
    async handleProfile(context: ChatCommandContext): Promise<void> {
        const { stream, prompt, activeConnectionId, activeQuery } = context;

        try {
            stream.progress('Profiling query performance...');

            const query = this.extractQueryFromPrompt(prompt) || activeQuery;

            if (!query) {
                stream.markdown('❌ **No SQL query found**\n\n');
                stream.markdown('Please provide a SQL query to profile.\n');
                return;
            }

            if (!activeConnectionId) {
                stream.markdown('⚠️  **No active database connection**\n\n');
                stream.button({
                    command: 'mydba.newConnection',
                    title: 'Connect to Database'
                });
                return;
            }

            // Show query
            stream.markdown('### ⚡ Query Performance Profile\n\n');
            stream.markdown('```sql\n' + query + '\n```\n\n');

            // Execute profiling
            const connectionManager = this.serviceContainer.get(SERVICE_TOKENS.ConnectionManager);
            const adapter = connectionManager.getAdapter(activeConnectionId);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (!adapter || !('profile' in adapter) || typeof (adapter as any).profile !== 'function') {
                stream.markdown('⚠️  Performance profiling is not supported for this database type.\n');
                return;
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const profile = await (adapter as any).profile(query);

            if (!profile || !profile.stages || profile.stages.length === 0) {
                stream.markdown('⚠️  No profiling data available. Performance Schema might not be enabled.\n');
                return;
            }

            // Display profiling results
            stream.markdown('**Execution Summary:**\n\n');
            stream.markdown(`- **Total Time:** ${(profile.totalDuration || 0).toFixed(4)}s\n`);
            stream.markdown(`- **Stages:** ${profile.stages.length}\n\n`);

            // Show execution stages
            if (profile.stages.length > 0) {
                stream.markdown('**Top Execution Stages:**\n\n');
                
                // Sort by duration
                const sortedStages = [...profile.stages].sort((a, b) => b.Duration - a.Duration);
                const topStages = sortedStages.slice(0, 10);

                for (const stage of topStages) {
                    const percentage = ((stage.Duration / (profile.totalDuration || 1)) * 100).toFixed(1);
                    stream.markdown(`- **${stage.Stage}**: ${stage.Duration.toFixed(4)}s (${percentage}%)\n`);
                }

                if (sortedStages.length > 10) {
                    stream.markdown(`\n*...and ${sortedStages.length - 10} more stages*\n`);
                }
            }

            // Provide profiling panel button
            stream.markdown('\n');
            stream.button({
                command: 'mydba.profileQuery',
                title: 'Open Detailed Profile Viewer',
                arguments: [{ query, connectionId: activeConnectionId }]
            });

        } catch (error) {
            this.handleCommandError(stream, error as Error, 'profile query');
        }
    }

    /**
     * /optimize - Get optimization suggestions
     */
    async handleOptimize(context: ChatCommandContext): Promise<void> {
        const { stream, prompt, activeConnectionId, activeQuery, token } = context;

        try {
            stream.progress('Generating optimization suggestions...');

            const query = this.extractQueryFromPrompt(prompt) || activeQuery;

            if (!query) {
                stream.markdown('❌ **No SQL query found**\n\n');
                stream.markdown('Please provide a SQL query to optimize.\n');
                return;
            }

            if (!activeConnectionId) {
                stream.markdown('⚠️  **No active database connection**\n\n');
                stream.button({
                    command: 'mydba.newConnection',
                    title: 'Connect to Database'
                });
                return;
            }

            // Show query
            stream.markdown('### 🚀 Query Optimization\n\n');
            stream.markdown('```sql\n' + query + '\n```\n\n');

            // Check cancellation
            if (token.isCancellationRequested) {
                return;
            }

            // Get AI service
            const aiService = this.serviceContainer.get(SERVICE_TOKENS.AIServiceCoordinator);

            // Get optimization suggestions
            stream.progress('Analyzing query for optimization opportunities...');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const analysis = await aiService.analyzeQuery({ query, connectionId: activeConnectionId }) as any;

            // Render optimization-focused response
            if (analysis.optimizationSuggestions && analysis.optimizationSuggestions.length > 0) {
                stream.markdown('**Optimization Suggestions:**\n\n');
                
                for (const suggestion of analysis.optimizationSuggestions) {
                    const impactEmoji = this.getImpactEmoji(suggestion.impact);
                    const difficultyEmoji = this.getDifficultyEmoji(suggestion.difficulty);
                    
                    stream.markdown(`${impactEmoji} **${suggestion.title}** ${difficultyEmoji}\n\n`);
                    stream.markdown(`${suggestion.description}\n\n`);
                    
                    if (suggestion.before && suggestion.after) {
                        stream.markdown('**Before:**\n');
                        stream.markdown('```sql\n' + suggestion.before + '\n```\n\n');
                        stream.markdown('**After:**\n');
                        stream.markdown('```sql\n' + suggestion.after + '\n```\n\n');
                    } else if (suggestion.after) {
                        stream.markdown('**Optimized Code:**\n');
                        stream.markdown('```sql\n' + suggestion.after + '\n```\n\n');
                    }
                    
                    stream.markdown('---\n\n');
                }
            } else {
                stream.markdown('✅ **No significant optimization opportunities found.**\n\n');
                stream.markdown('Your query appears to be well-optimized!\n');
            }

            // Anti-patterns
            if (analysis.antiPatterns && analysis.antiPatterns.length > 0) {
                stream.markdown('**Anti-Patterns Detected:**\n\n');
                
                for (const pattern of analysis.antiPatterns) {
                    const icon = pattern.severity === 'critical' ? '🔴' : pattern.severity === 'warning' ? '🟡' : '🔵';
                    stream.markdown(`${icon} **${pattern.type}**\n`);
                    stream.markdown(`${pattern.message}\n\n`);
                    if (pattern.suggestion) {
                        stream.markdown(`💡 *${pattern.suggestion}*\n\n`);
                    }
                }
            }

            // Open EXPLAIN viewer for detailed analysis
            stream.button({
                command: 'mydba.explainQuery',
                title: 'View Full Analysis in EXPLAIN Viewer',
                arguments: [{ query, connectionId: activeConnectionId }]
            });

        } catch (error) {
            this.handleCommandError(stream, error as Error, 'optimize query');
        }
    }

    /**
     * /schema - Explore database schema
     */
    async handleSchema(context: ChatCommandContext): Promise<void> {
        const { stream, prompt, activeConnectionId, activeDatabase } = context;

        try {
            stream.progress('Exploring database schema...');

            if (!activeConnectionId) {
                stream.markdown('⚠️  **No active database connection**\n\n');
                stream.button({
                    command: 'mydba.newConnection',
                    title: 'Connect to Database'
                });
                return;
            }

            // Parse what the user is asking for
            const tableName = this.extractTableNameFromPrompt(prompt);

            if (tableName) {
                // Show specific table schema
                await this.showTableSchema(stream, activeConnectionId, tableName);
            } else {
                // Show database overview
                await this.showDatabaseOverview(stream, activeConnectionId, activeDatabase);
            }

        } catch (error) {
            this.handleCommandError(stream, error as Error, 'explore schema');
        }
    }

    // Helper methods

    /**
     * Extract SQL query from chat prompt
     */
    private extractQueryFromPrompt(prompt: string): string | undefined {
        // Look for SQL code blocks
        const codeBlockMatch = prompt.match(/```sql\s*([\s\S]*?)\s*```/);
        if (codeBlockMatch) {
            return codeBlockMatch[1].trim();
        }

        // Look for inline SQL keywords
        const sqlKeywords = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'WITH', 'CREATE', 'ALTER'];
        const upperPrompt = prompt.toUpperCase();
        
        for (const keyword of sqlKeywords) {
            if (upperPrompt.includes(keyword)) {
                // Extract from keyword to end or semicolon
                const startIndex = upperPrompt.indexOf(keyword);
                const queryPart = prompt.substring(startIndex);
                const endIndex = queryPart.indexOf(';');
                
                return endIndex > -1 
                    ? queryPart.substring(0, endIndex + 1).trim()
                    : queryPart.trim();
            }
        }

        return undefined;
    }

    /**
     * Extract table name from prompt
     */
    private extractTableNameFromPrompt(prompt: string): string | undefined {
        const patterns = [
            /table\s+['"`]?(\w+)['"`]?/i,
            /for\s+['"`]?(\w+)['"`]?\s+table/i,
            /about\s+['"`]?(\w+)['"`]?/i,
        ];

        for (const pattern of patterns) {
            const match = prompt.match(pattern);
            if (match) {
                return match[1];
            }
        }

        return undefined;
    }

    /**
     * Render analysis results with citations
     */
    private async renderAnalysisResults(
        stream: vscode.ChatResponseStream,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        analysis: any,
        query: string,
        connectionId: string
    ): Promise<void> {
        // Summary
        if (analysis.summary) {
            stream.markdown('### 💡 Summary\n\n');
            stream.markdown(analysis.summary + '\n\n');
        }

        // Anti-patterns
        if (analysis.antiPatterns && analysis.antiPatterns.length > 0) {
            stream.markdown('### ⚠️  Issues & Anti-Patterns\n\n');
            
            for (const pattern of analysis.antiPatterns) {
                const icon = pattern.severity === 'critical' ? '🔴' : pattern.severity === 'warning' ? '🟡' : 'ℹ️';
                stream.markdown(`${icon} **${pattern.type}**\n\n`);
                stream.markdown(`${pattern.message}\n\n`);
                if (pattern.suggestion) {
                    stream.markdown(`💡 **Suggestion:** ${pattern.suggestion}\n\n`);
                }
                stream.markdown('---\n\n');
            }
        }

        // Optimizations
        if (analysis.optimizationSuggestions && analysis.optimizationSuggestions.length > 0) {
            stream.markdown('### 🚀 Optimization Opportunities\n\n');
            
            const topSuggestions = analysis.optimizationSuggestions.slice(0, 3);
            
            for (const suggestion of topSuggestions) {
                const impactEmoji = this.getImpactEmoji(suggestion.impact);
                stream.markdown(`${impactEmoji} **${suggestion.title}**\n\n`);
                stream.markdown(`${suggestion.description}\n\n`);
                
                if (suggestion.after) {
                    stream.markdown('```sql\n' + suggestion.after + '\n```\n\n');
                }
            }

            if (analysis.optimizationSuggestions.length > 3) {
                stream.markdown(`*...and ${analysis.optimizationSuggestions.length - 3} more suggestions*\n\n`);
            }
        }

        // Citations
        if (analysis.citations && analysis.citations.length > 0) {
            stream.markdown('### 📚 References\n\n');
            
            for (const citation of analysis.citations) {
                if (citation.url) {
                    stream.markdown(`- [${citation.title}](${citation.url})\n`);
                } else {
                    stream.markdown(`- ${citation.title}\n`);
                }
            }
            stream.markdown('\n');
        }

        // Action buttons
        stream.markdown('**Next Steps:**\n\n');
        
        stream.button({
            command: 'mydba.explainQuery',
            title: 'View EXPLAIN Plan',
            arguments: [{ query, connectionId }]
        });
    }

    /**
     * Show database overview
     */
    private async showDatabaseOverview(
        stream: vscode.ChatResponseStream,
        connectionId: string,
        databaseName?: string
    ): Promise<void> {
        const connectionManager = this.serviceContainer.get(SERVICE_TOKENS.ConnectionManager);
        const adapter = connectionManager.getAdapter(connectionId);

        if (!adapter) {
            throw new Error('Database adapter not available for this connection');
        }

        stream.markdown(`### 🗄️  Database Schema${databaseName ? ': ' + databaseName : ''}\n\n`);

        // Get all tables
        const tablesQuery = `
            SELECT 
                TABLE_NAME as name,
                TABLE_ROWS as rows,
                ROUND(((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024), 2) as size_mb,
                ENGINE as engine
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE()
            ORDER BY size_mb DESC
            LIMIT 20
        `;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tables = await adapter.query<any>(tablesQuery);

        if (tables && Array.isArray(tables) && tables.length > 0) {
            stream.markdown('**Tables:**\n\n');
            stream.markdown('| Table | Rows | Size (MB) | Engine |\n');
            stream.markdown('|-------|------|-----------|--------|\n');
            
            for (const table of tables) {
                stream.markdown(`| ${table.name} | ${table.rows || 0} | ${table.size_mb || 0} | ${table.engine} |\n`);
            }
            stream.markdown('\n');
        } else {
            stream.markdown('*No tables found in the database.*\n\n');
        }

        stream.markdown('💡 **Tip:** Ask about a specific table with `@mydba /schema table users`\n');
    }

    /**
     * Show specific table schema
     */
    private async showTableSchema(
        stream: vscode.ChatResponseStream,
        connectionId: string,
        tableName: string
    ): Promise<void> {
        const connectionManager = this.serviceContainer.get(SERVICE_TOKENS.ConnectionManager);
        const adapter = connectionManager.getAdapter(connectionId);

        if (!adapter) {
            throw new Error('Database adapter not available for this connection');
        }

        stream.markdown(`### 📋 Table: \`${tableName}\`\n\n`);

        // Get column information
        const columnsQuery = `
            SELECT 
                COLUMN_NAME as name,
                COLUMN_TYPE as type,
                IS_NULLABLE as nullable,
                COLUMN_KEY as key_type,
                COLUMN_DEFAULT as default_value,
                EXTRA as extra
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = '${tableName}'
            ORDER BY ORDINAL_POSITION
        `;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const columns = await adapter.query<any>(columnsQuery);

        if (columns && Array.isArray(columns) && columns.length > 0) {
            stream.markdown('**Columns:**\n\n');
            stream.markdown('| Name | Type | Nullable | Key | Default | Extra |\n');
            stream.markdown('|------|------|----------|-----|---------|-------|\n');
            
            for (const col of columns) {
                const nullable = col.nullable === 'YES' ? '✓' : '✗';
                const key = col.key_type || '-';
                const defaultVal = col.default_value || '-';
                const extra = col.extra || '-';
                
                stream.markdown(`| ${col.name} | ${col.type} | ${nullable} | ${key} | ${defaultVal} | ${extra} |\n`);
            }
            stream.markdown('\n');
        } else {
            stream.markdown(`⚠️  Table \`${tableName}\` not found.\n\n`);
            return;
        }

        // Get indexes
        const indexesQuery = `SHOW INDEX FROM ${tableName}`;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const indexes = await adapter.query<any>(indexesQuery);

        if (indexes && Array.isArray(indexes) && indexes.length > 0) {
            stream.markdown('**Indexes:**\n\n');
            
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const indexMap = new Map<string, any[]>();
            for (const idx of indexes) {
                if (!indexMap.has(idx.Key_name)) {
                    indexMap.set(idx.Key_name, []);
                }
                indexMap.get(idx.Key_name)?.push(idx);
            }

            for (const [indexName, columns] of indexMap) {
                const columnNames = columns.map(c => c.Column_name).join(', ');
                const indexType = columns[0].Index_type || 'BTREE';
                const isUnique = columns[0].Non_unique === 0 ? '(Unique)' : '';
                
                stream.markdown(`- **${indexName}** ${isUnique}: ${columnNames} (${indexType})\n`);
            }
            stream.markdown('\n');
        }

        // Preview data button
        stream.button({
            command: 'mydba.previewTableData',
            title: 'Preview Table Data',
            arguments: [{ tableName, connectionId }]
        });
    }

    /**
     * Get emoji for impact level
     */
    private getImpactEmoji(impact: string): string {
        switch (impact?.toLowerCase()) {
            case 'high': return '🔴';
            case 'medium': return '🟡';
            case 'low': return '🟢';
            default: return '⚪';
        }
    }

    /**
     * Get emoji for difficulty level
     */
    private getDifficultyEmoji(difficulty: string): string {
        switch (difficulty?.toLowerCase()) {
            case 'hard': return '🔧';
            case 'medium': return '⚙️';
            case 'easy': return '✨';
            default: return '';
        }
    }

    /**
     * Handle command errors
     */
    private handleCommandError(stream: vscode.ChatResponseStream, error: Error, action: string): void {
        this.logger.error(`Failed to ${action}:`, error);

        if (error instanceof ConnectionError) {
            stream.markdown(`❌ **Connection Error**\n\n${error.message}\n\n`);
            stream.button({
                command: 'mydba.newConnection',
                title: 'Connect to Database'
            });
        } else if (error instanceof QueryExecutionError) {
            stream.markdown(`❌ **Query Execution Error**\n\n${error.message}\n`);
        } else {
            stream.markdown(`❌ **Error**\n\n${error.message}\n`);
        }

        stream.markdown('\nPlease try again or contact support if the issue persists.');
    }
}

