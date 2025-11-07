import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { ServiceContainer, SERVICE_TOKENS } from '../core/service-container';
import { ChatCommand, ChatCommandContext, IChatContextProvider } from './types';
import { ChatCommandHandlers } from './command-handlers';
import { NaturalLanguageQueryParser, QueryIntent } from './nl-query-parser';
import { ChatResponseBuilder } from './response-builder';

/**
 * MyDBA Chat Participant
 * Provides conversational AI-powered database assistance through VSCode Chat
 */
export class MyDBAChatParticipant implements IChatContextProvider {
    private participant: vscode.ChatParticipant;
    private commandHandlers: ChatCommandHandlers;
    private nlParser: NaturalLanguageQueryParser;

    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger,
        private serviceContainer: ServiceContainer
    ) {
        // Create the chat participant
        this.participant = vscode.chat.createChatParticipant('mydba.chat', this.handleRequest.bind(this));

        this.participant.iconPath = vscode.Uri.joinPath(
            this.context.extensionUri,
            'resources',
            'mydba.svg'
        );

        // Initialize command handlers
        this.commandHandlers = new ChatCommandHandlers(
            this.logger,
            this.serviceContainer,
            this
        );

        // Initialize NL parser
        this.nlParser = new NaturalLanguageQueryParser(this.logger);

        this.logger.info('MyDBA Chat Participant registered successfully');
    }

    /**
     * Main chat request handler
     */
    private async handleRequest(
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        this.logger.info(`Chat request received: ${request.prompt}`);

        try {
            // Check for cancellation
            if (token.isCancellationRequested) {
                return { errorDetails: { message: 'Request cancelled' } };
            }

            // Build command context
            const commandContext = await this.buildCommandContext(request, stream, token);

            // Route to appropriate handler
            if (request.command) {
                await this.handleCommand(request.command, commandContext);
            } else {
                // No specific command - use general conversation handler
                await this.handleGeneralQuery(commandContext);
            }

            return { metadata: { command: request.command } };

        } catch (error) {
            this.logger.error('Chat request failed:', error as Error);

            // Send error to user with helpful recovery suggestions
            const builder = new ChatResponseBuilder(stream);
            const errorMessage = (error as Error).message;

            builder.error(`Something went wrong: ${errorMessage}`)
                .divider()
                .header('Troubleshooting Tips', '🔧')
                .list([
                    'Check that you have an active database connection',
                    'Verify your SQL syntax is correct',
                    'Try rephrasing your question',
                    'Use a specific command like `/analyze` or `/schema`'
                ])
                .divider()
                .quickActions([
                    {
                        label: '🔌 Check Connections',
                        command: 'mydba.refresh',
                        args: []
                    },
                    {
                        label: '❓ Show Help',
                        command: 'mydba.chat.sendMessage',
                        args: ['@mydba help']
                    }
                ]);

            return {
                errorDetails: {
                    message: errorMessage
                }
            };
        }
    }

    /**
     * Handles slash commands
     */
    private async handleCommand(
        command: string,
        context: ChatCommandContext
    ): Promise<void> {
        const commandEnum = command as ChatCommand;

        switch (commandEnum) {
            case ChatCommand.ANALYZE:
                await this.commandHandlers.handleAnalyze(context);
                break;

            case ChatCommand.EXPLAIN:
                await this.commandHandlers.handleExplain(context);
                break;

            case ChatCommand.PROFILE:
                await this.commandHandlers.handleProfile(context);
                break;

            case ChatCommand.OPTIMIZE:
                await this.commandHandlers.handleOptimize(context);
                break;

            case ChatCommand.SCHEMA:
                await this.commandHandlers.handleSchema(context);
                break;

            default:
                throw new Error(`Unknown command: ${command}`);
        }
    }

    /**
     * Handles general queries without a specific command
     */
    private async handleGeneralQuery(context: ChatCommandContext): Promise<void> {
        const { stream, prompt, token } = context;
        const builder = new ChatResponseBuilder(stream);

        // Show thinking indicator
        stream.progress('Understanding your question...');

        // Parse natural language query
        const parsedQuery = this.nlParser.parse(prompt);
        this.logger.debug(`Parsed query intent: ${parsedQuery.intent}`);

        // Check if there's an explicit SQL query in the prompt
        if (parsedQuery.sqlQuery) {
            this.logger.info('Found SQL query in prompt, routing to analyze');
            context.command = ChatCommand.ANALYZE;
            await this.handleCommand(ChatCommand.ANALYZE, context);
            return;
        }

        // Map NL intent to chat command
        const command = this.mapIntentToCommand(parsedQuery.intent);

        if (command) {
            // Route to specific command handler
            context.command = command;
            await this.handleCommand(command, context);
            return;
        }

        // Handle data retrieval intents with SQL generation
        if (parsedQuery.intent === QueryIntent.RETRIEVE_DATA || parsedQuery.intent === QueryIntent.COUNT) {
            await this.handleDataRetrievalQuery(parsedQuery, context, builder);
            return;
        }

        // Check cancellation
        if (token.isCancellationRequested) {
            return;
        }

        // Fallback: provide general help
        await this.provideGeneralHelp(context);
    }

    /**
     * Handle data retrieval queries with SQL generation
     */
    private async handleDataRetrievalQuery(
        parsedQuery: { originalPrompt: string; intent: QueryIntent; parameters: { tableName?: string; condition?: string; limit?: number }; requiresConfirmation: boolean },
        context: ChatCommandContext,
        builder: ChatResponseBuilder
    ): Promise<void> {
        const { stream, activeConnectionId, token } = context;

        // Check cancellation
        if (token.isCancellationRequested) {
            return;
        }

        if (!activeConnectionId) {
            builder.warning('No active database connection')
                .text('Please connect to a database first.')
                .button('Connect to Database', 'mydba.newConnection');
            return;
        }

        // Check if we have enough info to generate SQL
        if (!parsedQuery.parameters.tableName) {
            builder.warning('I couldn\'t identify which table you\'re asking about')
                .text('Could you please specify the table name? For example:')
                .text('- "Show me all records from **users** table"')
                .text('- "Count rows in **orders** table"');
            return;
        }

        try {
            stream.progress('Generating SQL query...');

            // Check cancellation
            if (token.isCancellationRequested) {
                return;
            }

            // Generate SQL from parsed query
            const generatedSQL = await this.nlParser.generateSQL(parsedQuery);

            // Check cancellation
            if (token.isCancellationRequested) {
                return;
            }

            if (!generatedSQL) {
                builder.info('This query is a bit complex for automatic generation')
                    .text('Could you rephrase it, or try using one of these commands:')
                    .list([
                        '`/analyze` - Analyze a specific SQL query',
                        '`/schema` - Explore database structure',
                        '`/explain` - Get execution plan'
                    ]);
                return;
            }

            // Show the generated SQL
            builder.header('Generated SQL Query', '🔍')
                .sql(generatedSQL)
                .divider();

            // Check if confirmation is needed
            if (parsedQuery.requiresConfirmation) {
                builder.warning('This query will modify data')
                    .text('Please review the query carefully before executing.')
                    .buttons([
                        {
                            title: '✅ Execute Query',
                            command: 'mydba.executeQuery',
                            args: [{ query: generatedSQL, connectionId: activeConnectionId }]
                        },
                        {
                            title: '📋 Copy to Editor',
                            command: 'mydba.copyToEditor',
                            args: [generatedSQL]
                        }
                    ]);
            } else {
                // Provide action buttons
                builder.quickActions([
                    {
                        label: '▶️  Execute Query',
                        command: 'mydba.executeQuery',
                        args: [{ query: generatedSQL, connectionId: activeConnectionId }]
                    },
                    {
                        label: '📊 Analyze Query',
                        command: 'mydba.chat.sendMessage',
                        args: [`@mydba /analyze ${generatedSQL}`]
                    },
                    {
                        label: '📋 Copy to Editor',
                        command: 'mydba.copyToEditor',
                        args: [generatedSQL]
                    }
                ]);
            }

        } catch (error) {
            builder.error(`Failed to process your query: ${(error as Error).message}`)
                .tip('Try rephrasing your question or use a specific command like `/schema` or `/analyze`');
        }
    }

    /**
     * Map NL intent to chat command
     */
    private mapIntentToCommand(intent: QueryIntent): ChatCommand | null {
        switch (intent) {
            case QueryIntent.ANALYZE:
                return ChatCommand.ANALYZE;
            case QueryIntent.EXPLAIN:
                return ChatCommand.EXPLAIN;
            case QueryIntent.OPTIMIZE:
                return ChatCommand.OPTIMIZE;
            case QueryIntent.SCHEMA_INFO:
                return ChatCommand.SCHEMA;
            case QueryIntent.MONITOR:
                // Could route to a process list command
                return null;
            default:
                return null;
        }
    }

    /**
     * Provides general help when intent is unclear
     */
    private async provideGeneralHelp(context: ChatCommandContext): Promise<void> {
        const { stream, activeConnectionId } = context;
        const builder = new ChatResponseBuilder(stream);

        builder.header('Hi! I\'m MyDBA 👋', '🤖')
            .text('Your AI-powered database assistant for MySQL & MariaDB');

        builder.divider();

        // Connection status
        if (activeConnectionId) {
            builder.success(`Connected to database: **${activeConnectionId}**`);
        } else {
            builder.warning('No active database connection')
                .button('Connect to Database', 'mydba.newConnection');
        }

        builder.divider();

        // Commands section
        builder.header('What I Can Do', '✨');

        const commands = [
            {
                icon: '📊',
                cmd: '/analyze',
                desc: 'Analyze SQL queries with AI-powered insights and anti-pattern detection'
            },
            {
                icon: '🔍',
                cmd: '/explain',
                desc: 'Visualize query execution plans with interactive tree diagrams'
            },
            {
                icon: '⚡',
                cmd: '/profile',
                desc: 'Profile query performance with detailed timing and resource metrics'
            },
            {
                icon: '🚀',
                cmd: '/optimize',
                desc: 'Get AI-powered optimization suggestions with before/after comparisons'
            },
            {
                icon: '🗄️',
                cmd: '/schema',
                desc: 'Explore database schema, tables, columns, and indexes'
            }
        ];

        for (const { icon, cmd, desc } of commands) {
            builder.text(`${icon} **\`${cmd}\`** - ${desc}`);
        }

        builder.divider();

        // Natural language section
        builder.header('Ask Me Anything', '💬')
            .text('You can ask questions in plain English! I understand:')
            .list([
                '**"Show me all users created last week"** - I\'ll generate the SQL',
                '**"Count orders from yesterday"** - Get quick counts',
                '**"Why is this query slow?"** - Performance analysis',
                '**"What columns are in the users table?"** - Schema exploration',
                '**"Find all tables with more than 1M rows"** - Database insights'
            ]);

        builder.divider();

        // Quick actions
        builder.header('Quick Actions', '⚡');
        builder.quickActions([
            {
                label: '📝 Open Query Editor',
                command: 'mydba.showQueryEditor',
                args: [activeConnectionId]
            },
            {
                label: '📊 View Schema',
                command: 'mydba.chat.sendMessage',
                args: ['@mydba /schema']
            },
            {
                label: '🔌 New Connection',
                command: 'mydba.newConnection',
                args: []
            }
        ]);

        builder.divider();

        builder.tip('**Pro Tip:** Select SQL code in your editor and ask me to analyze, explain, or optimize it!');
    }

    /**
     * Builds command context from request
     */
    private async buildCommandContext(
        request: vscode.ChatRequest,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<ChatCommandContext> {
        const activeConnectionId = await this.getActiveConnectionId();
        const activeQuery = await this.getSelectedQuery();
        const activeDatabase = await this.getActiveDatabase();

        return {
            request,
            stream,
            token,
            activeConnectionId,
            activeQuery,
            activeDatabase,
            prompt: request.prompt,
            command: request.command as ChatCommand | undefined
        };
    }

    // IChatContextProvider implementation

    async getActiveConnectionId(): Promise<string | undefined> {
        try {
            const connectionManager = this.serviceContainer.get(SERVICE_TOKENS.ConnectionManager);
            const connections = connectionManager.listConnections();

            // Get the first active connection
            const activeConnection = connections.find((conn: { isConnected: boolean }) => conn.isConnected);
            return activeConnection?.id;
        } catch (error) {
            this.logger.warn('Failed to get active connection:', error as Error);
            return undefined;
        }
    }

    async getActiveDatabase(): Promise<string | undefined> {
        try {
            const connectionManager = this.serviceContainer.get(SERVICE_TOKENS.ConnectionManager);
            const connections = connectionManager.listConnections();

            const activeConnection = connections.find((conn: { isConnected: boolean }) => conn.isConnected);
            return activeConnection?.database;
        } catch (error) {
            this.logger.warn('Failed to get active database:', error as Error);
            return undefined;
        }
    }

    async getSelectedQuery(): Promise<string | undefined> {
        try {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return undefined;
            }

            // Check if it's a SQL file
            const isSqlFile = editor.document.languageId === 'sql';

            // Get selected text
            const selection = editor.selection;
            const selectedText = editor.document.getText(selection);

            if (selectedText) {
                return selectedText;
            }

            // If no selection and it's a SQL file, return entire document
            if (isSqlFile) {
                const fullText = editor.document.getText();
                // Only return if it's not too large
                if (fullText.length < 10000) {
                    return fullText;
                }
            }

            return undefined;
        } catch (error) {
            this.logger.warn('Failed to get selected query:', error as Error);
            return undefined;
        }
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        this.participant.dispose();
        this.logger.info('MyDBA Chat Participant disposed');
    }
}
