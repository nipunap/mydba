import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { EventPriority, IEvent, IEventBus } from '../core/interfaces';

export interface EventType<_T> {
    readonly name: string;
}

export interface EventHandler<T> {
    (data: T): void | Promise<void>;
}

/**
 * Enhanced Event Bus with priority queue and history
 */
export class EventBus implements IEventBus {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private handlers = new Map<string, EventHandler<any>[]>();
    private eventQueue: IEvent[] = [];
    private history: IEvent[] = [];
    private maxHistorySize = 100;
    private processing = false;
    private eventCounter = 0;

    constructor(private logger: Logger) {}

    /**
     * Subscribe to an event (legacy compatibility)
     */
    on<T>(
        event: EventType<T>,
        handler: EventHandler<T>
    ): vscode.Disposable;
    on<T>(
        eventType: string,
        handler: (event: IEvent<T>) => void | Promise<void>
    ): vscode.Disposable;
    on<T>(
        eventOrType: EventType<T> | string,
        handler: EventHandler<T> | ((event: IEvent<T>) => void | Promise<void>)
    ): vscode.Disposable {
        const eventName = typeof eventOrType === 'string' ? eventOrType : eventOrType.name;
        const isLegacy = typeof eventOrType !== 'string';

        if (!this.handlers.has(eventName)) {
            this.handlers.set(eventName, []);
        }

        const handlers = this.handlers.get(eventName);

        // Wrap legacy handlers to extract data from event
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wrappedHandler: EventHandler<any> = isLegacy
            ? async (event: IEvent<T>) => {
                // Legacy handler expects just data, not full event
                await (handler as EventHandler<T>)(event.data);
            }
            : (handler as (event: IEvent<T>) => void | Promise<void>);

        if (handlers) {
            handlers.push(wrappedHandler);
        }

        this.logger.debug(`Registered handler for event: ${eventName} (${isLegacy ? 'legacy' : 'new'} format)`);

        return {
            dispose: () => {
                if (handlers) {
                    const index = handlers.indexOf(wrappedHandler);
                    if (index > -1) {
                        handlers.splice(index, 1);
                        this.logger.debug(`Unregistered handler for event: ${eventName}`);
                    }
                }
            }
        };
    }

    /**
     * Subscribe to an event only once
     */
    once<T>(eventType: string, handler: (event: IEvent<T>) => void | Promise<void>): void {
        const wrappedHandler = async (event: IEvent<T>) => {
            await handler(event);
            // Auto-unsubscribe after first call
            const handlers = this.handlers.get(eventType);
            if (handlers) {
                const index = handlers.indexOf(wrappedHandler);
                if (index > -1) {
                    handlers.splice(index, 1);
                }
            }
        };

        this.on(eventType, wrappedHandler);
    }

    /**
     * Emit an event (legacy compatibility)
     */
    async emit<T>(event: EventType<T>, data: T): Promise<void>;
    async emit<T>(eventType: string, data: T, priority?: EventPriority): Promise<void>;
    async emit<T>(
        eventOrType: EventType<T> | string,
        data: T,
        priority: EventPriority = EventPriority.NORMAL
    ): Promise<void> {
        const eventType = typeof eventOrType === 'string' ? eventOrType : eventOrType.name;

        const event: IEvent<T> = {
            type: eventType,
            data,
            priority,
            timestamp: Date.now(),
            id: `event-${++this.eventCounter}-${Date.now()}`
        };

        // Add to queue
        this.eventQueue.push(event);

        // Sort queue by priority (higher priority first)
        this.eventQueue.sort((a, b) => b.priority - a.priority);

        // Add to history
        this.addToHistory(event);

        // Process queue
        await this.processQueue();
    }

    /**
     * Process event queue
     */
    private async processQueue(): Promise<void> {
        if (this.processing) {
            return;
        }

        this.processing = true;

        try {
            while (this.eventQueue.length > 0) {
                const event = this.eventQueue.shift();
                if (event) {
                    await this.dispatchEvent(event);
                }
            }
        } finally {
            this.processing = false;
        }
    }

    /**
     * Dispatch an event to handlers
     */
    private async dispatchEvent<T>(event: IEvent<T>): Promise<void> {
        const handlers = this.handlers.get(event.type) || [];

        this.logger.debug(
            `Dispatching event: ${event.type} (priority: ${event.priority}) to ${handlers.length} handlers`
        );

        const promises = handlers.map(async (handler) => {
            try {
                // Call handler with full event or just data for legacy compatibility
                await handler(event);
            } catch (error) {
                this.logger.error(`Error in event handler for ${event.type}:`, error as Error);
            }
        });

        await Promise.all(promises);
    }

    /**
     * Add event to history
     */
    private addToHistory<T>(event: IEvent<T>): void {
        this.history.push(event);

        // Limit history size
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
        }
    }

    /**
     * Get event history
     */
    getHistory(count?: number): IEvent[] {
        if (count) {
            return this.history.slice(-count);
        }
        return [...this.history];
    }

    /**
     * Get pending events count
     */
    getPendingCount(): number {
        return this.eventQueue.length;
    }

    /**
     * Clear event queue (for testing/emergency)
     */
    clearQueue(): void {
        this.eventQueue = [];
        this.logger.warn('Event queue cleared');
    }

    /**
     * Clear event history
     */
    clearHistory(): void {
        this.history = [];
        this.logger.debug('Event history cleared');
    }

    /**
     * Get statistics
     */
    getStatistics(): {
        totalHandlers: number;
        pendingEvents: number;
        historySize: number;
        handlersByEvent: Record<string, number>;
    } {
        const handlersByEvent: Record<string, number> = {};

        for (const [eventType, handlers] of this.handlers) {
            handlersByEvent[eventType] = handlers.length;
        }

        return {
            totalHandlers: Array.from(this.handlers.values()).reduce(
                (sum, handlers) => sum + handlers.length,
                0
            ),
            pendingEvents: this.eventQueue.length,
            historySize: this.history.length,
            handlersByEvent
        };
    }

    /**
     * Dispose of the event bus
     */
    dispose(): void {
        this.handlers.clear();
        this.eventQueue = [];
        this.history = [];
        this.logger.info('Event bus disposed');
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
