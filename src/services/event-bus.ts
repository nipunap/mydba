import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

export interface EventType<_T> {
    readonly name: string;
}

export interface EventHandler<T> {
    (data: T): void | Promise<void>;
}

export class EventBus {
    private handlers = new Map<string, EventHandler<unknown>[]>();

    constructor(private logger: Logger) {}

    on<T>(event: EventType<T>, handler: EventHandler<T>): vscode.Disposable {
        const eventName = event.name;

        if (!this.handlers.has(eventName)) {
            this.handlers.set(eventName, []);
        }

        const handlers = this.handlers.get(eventName);
        if (handlers) {
            handlers.push(handler);
        }

        this.logger.debug(`Registered handler for event: ${eventName}`);

        return {
            dispose: () => {
                const index = handlers.indexOf(handler);
                if (index > -1) {
                    handlers.splice(index, 1);
                    this.logger.debug(`Unregistered handler for event: ${eventName}`);
                }
            }
        };
    }

    async emit<T>(event: EventType<T>, data: T): Promise<void> {
        const eventName = event.name;
        const handlers = this.handlers.get(eventName) || [];

        this.logger.debug(`Emitting event: ${eventName} to ${handlers.length} handlers`);

        const promises = handlers.map(async (handler) => {
            try {
                await handler(data);
            } catch {
                this.logger.error(`Error in event handler for ${eventName}:`, error as Error);
            }
        });

        await Promise.all(promises);
    }

    dispose(): void {
        this.handlers.clear();
        this.logger.debug('Event bus disposed');
    }
}

// Event types
export const EVENTS = {
    CONNECTION_ADDED: { name: 'connection.added' } as EventType<Connection>,
    CONNECTION_REMOVED: { name: 'connection.removed' } as EventType<string>,
    CONNECTION_STATE_CHANGED: { name: 'connection.stateChanged' } as EventType<ConnectionStateChange>,
    QUERY_EXECUTED: { name: 'query.executed' } as EventType<QueryResult>,
    AI_REQUEST_SENT: { name: 'ai.requestSent' } as EventType<AIRequest>,
    AI_RESPONSE_RECEIVED: { name: 'ai.responseReceived' } as EventType<AIResponse>
};

// Event data interfaces
export interface Connection {
    id: string;
    name: string;
    type: string;
    host: string;
    port: number;
    database?: string;
    environment: 'dev' | 'staging' | 'prod';
    isConnected: boolean;
}

export interface ConnectionStateChange {
    connectionId: string;
    oldState: 'disconnected' | 'connecting' | 'connected' | 'error';
    newState: 'disconnected' | 'connecting' | 'connected' | 'error';
    error?: Error;
}

export interface QueryResult {
    connectionId: string;
    query: string;
    duration: number;
    rowsAffected?: number;
    error?: Error;
}

export interface AIRequest {
    type: string;
    query?: string;
    anonymized: boolean;
    timestamp: number;
}

export interface AIResponse {
    type: string;
    duration: number;
    success: boolean;
    error?: Error;
}
