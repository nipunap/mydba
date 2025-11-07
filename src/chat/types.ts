import * as vscode from 'vscode';

/**
 * Supported chat commands
 */
export enum ChatCommand {
    ANALYZE = 'analyze',
    EXPLAIN = 'explain',
    PROFILE = 'profile',
    OPTIMIZE = 'optimize',
    SCHEMA = 'schema',
}

/**
 * Chat command context with all relevant information
 */
export interface ChatCommandContext {
    /** The original chat request */
    request: vscode.ChatRequest;
    
    /** Chat response stream for output */
    stream: vscode.ChatResponseStream;
    
    /** Cancellation token */
    token: vscode.CancellationToken;
    
    /** Active database connection ID (if any) */
    activeConnectionId?: string;
    
    /** Active SQL query from editor or user input */
    activeQuery?: string;
    
    /** Active database name */
    activeDatabase?: string;
    
    /** User's prompt/message */
    prompt: string;
    
    /** Command being executed (if slash command) */
    command?: ChatCommand;
}

/**
 * Chat command handler function signature
 */
export type ChatCommandHandler = (context: ChatCommandContext) => Promise<void>;

/**
 * Chat context provider interface
 */
export interface IChatContextProvider {
    /**
     * Gets the current active connection ID
     */
    getActiveConnectionId(): Promise<string | undefined>;
    
    /**
     * Gets the current active database name
     */
    getActiveDatabase(): Promise<string | undefined>;
    
    /**
     * Gets the selected SQL query from active editor
     */
    getSelectedQuery(): Promise<string | undefined>;
}

/**
 * Result of command handler execution
 */
export interface CommandResult {
    success: boolean;
    message?: string;
    data?: unknown;
    error?: Error;
}

