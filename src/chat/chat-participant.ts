import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { ServiceContainer, SERVICE_TOKENS } from '../core/service-container';
import { ChatCommand, ChatCommandContext, IChatContextProvider } from './types';
import { ChatCommandHandlers } from './command-handlers';

/**
 * MyDBA Chat Participant
 * Provides conversational AI-powered database assistance through VSCode Chat
 */
export class MyDBAChatParticipant implements IChatContextProvider {
    private participant: vscode.ChatParticipant;
    private commandHandlers: ChatCommandHandlers;

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
            
            // Send error to user
            stream.markdown(`❌ **Error**: ${(error as Error).message}\n\n`);
            stream.markdown('Please try again or rephrase your question.');

            return {
                errorDetails: {
                    message: (error as Error).message
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
        const { stream, prompt } = context;

        // Show thinking indicator
        stream.progress('Analyzing your question...');

        // Determine intent from prompt
        const intent = this.detectIntent(prompt);

        if (intent) {
            // Route to specific handler based on detected intent
            context.command = intent;
            await this.handleCommand(intent, context);
        } else {
            // Fallback: provide general help or use analyze as default
            await this.provideGeneralHelp(context);
        }
    }

    /**
     * Detects user intent from natural language prompt
     */
    private detectIntent(prompt: string): ChatCommand | null {
        const lowerPrompt = prompt.toLowerCase();

        // Analyze intent
        if (lowerPrompt.includes('analyze') || lowerPrompt.includes('analysis')) {
            return ChatCommand.ANALYZE;
        }
        
        // Explain intent
        if (lowerPrompt.includes('explain') || lowerPrompt.includes('execution plan')) {
            return ChatCommand.EXPLAIN;
        }
        
        // Profile intent
        if (lowerPrompt.includes('profile') || lowerPrompt.includes('performance')) {
            return ChatCommand.PROFILE;
        }
        
        // Optimize intent
        if (lowerPrompt.includes('optimize') || lowerPrompt.includes('optimization') || 
            lowerPrompt.includes('improve') || lowerPrompt.includes('faster')) {
            return ChatCommand.OPTIMIZE;
        }
        
        // Schema intent
        if (lowerPrompt.includes('schema') || lowerPrompt.includes('table') || 
            lowerPrompt.includes('database structure') || lowerPrompt.includes('columns')) {
            return ChatCommand.SCHEMA;
        }

        // Check if there's a SQL query in the prompt
        if (lowerPrompt.includes('select') || lowerPrompt.includes('insert') || 
            lowerPrompt.includes('update') || lowerPrompt.includes('delete')) {
            // Default to analyze for SQL queries
            return ChatCommand.ANALYZE;
        }

        return null;
    }

    /**
     * Provides general help when intent is unclear
     */
    private async provideGeneralHelp(context: ChatCommandContext): Promise<void> {
        const { stream } = context;

        stream.markdown('👋 **Hi! I\'m MyDBA, your AI-powered database assistant.**\n\n');
        stream.markdown('I can help you with:\n\n');
        
        const commands = [
            { cmd: '/analyze', desc: 'Analyze SQL queries with AI-powered insights' },
            { cmd: '/explain', desc: 'Visualize query execution plans (EXPLAIN)' },
            { cmd: '/profile', desc: 'Profile query performance with detailed metrics' },
            { cmd: '/optimize', desc: 'Get optimization suggestions with before/after code' },
            { cmd: '/schema', desc: 'Explore database schema, tables, and indexes' }
        ];

        for (const { cmd, desc } of commands) {
            stream.markdown(`- **\`${cmd}\`** - ${desc}\n`);
        }

        stream.markdown('\n**Examples:**\n');
        stream.markdown('- *"Analyze this query: SELECT * FROM users WHERE email LIKE \'%@example.com\'"*\n');
        stream.markdown('- *"Show me the execution plan for my slow query"*\n');
        stream.markdown('- *"How can I optimize this JOIN query?"*\n');
        stream.markdown('- *"What tables are in my database?"*\n\n');

        stream.markdown('💡 **Tip:** Select a SQL query in your editor and ask me to analyze it!\n');
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

