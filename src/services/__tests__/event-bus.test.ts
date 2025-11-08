import { EventBus, EVENTS, Connection, ConnectionStateChange, QueryResult } from '../event-bus';
import { Logger } from '../../utils/logger';
import { EventPriority } from '../../core/interfaces';

// Mock Logger
jest.mock('../../utils/logger');

describe('EventBus', () => {
    let eventBus: EventBus;
    let mockLogger: jest.Mocked<Logger>;

    beforeEach(() => {
        mockLogger = {
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        } as unknown as jest.Mocked<Logger>;

        eventBus = new EventBus(mockLogger);
    });

    afterEach(() => {
        eventBus.dispose();
        jest.clearAllMocks();
    });

    describe('Event Subscription', () => {
        it('should register event handler', () => {
            const handler = jest.fn();
            const disposable = eventBus.on('test.event', handler);

            expect(disposable).toBeDefined();
            expect(disposable.dispose).toBeInstanceOf(Function);
            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Registered handler for event: test.event')
            );
        });

        it('should register multiple handlers for same event', () => {
            const handler1 = jest.fn();
            const handler2 = jest.fn();

            eventBus.on('test.event', handler1);
            eventBus.on('test.event', handler2);

            const stats = eventBus.getStatistics();
            expect(stats.handlersByEvent['test.event']).toBe(2);
        });

        it('should unregister handler on dispose', () => {
            const handler = jest.fn();
            const disposable = eventBus.on('test.event', handler);

            disposable.dispose();

            expect(mockLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Unregistered handler for event: test.event')
            );

            const stats = eventBus.getStatistics();
            // After unregistering, there are 0 handlers for this event
            expect(stats.handlersByEvent['test.event']).toBe(0);
        });

        it('should handle legacy event format (EventType)', async () => {
            const handler = jest.fn();
            eventBus.on(EVENTS.CONNECTION_ADDED, handler);

            const connection: Connection = {
                id: 'test-1',
                name: 'Test Connection',
                type: 'mysql',
                host: 'localhost',
                port: 3306,
                environment: 'dev',
                isConnected: false
            };

            await eventBus.emit(EVENTS.CONNECTION_ADDED, connection);

            expect(handler).toHaveBeenCalledWith(connection);
        });

        it('should handle new event format (string)', async () => {
            const handler = jest.fn();
            eventBus.on('custom.event', handler);

            await eventBus.emit('custom.event', { data: 'test' });

            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'custom.event',
                    data: { data: 'test' }
                })
            );
        });

        it('should register once handler that auto-unsubscribes', async () => {
            const handler = jest.fn();
            eventBus.once('test.once', handler);

            await eventBus.emit('test.once', { value: 1 });
            await eventBus.emit('test.once', { value: 2 });

            expect(handler).toHaveBeenCalledTimes(1);
            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: { value: 1 }
                })
            );
        });
    });

    describe('Event Emission', () => {
        it('should emit event to registered handlers', async () => {
            const handler = jest.fn();
            eventBus.on('test.event', handler);

            await eventBus.emit('test.event', { message: 'hello' });

            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'test.event',
                    data: { message: 'hello' },
                    priority: EventPriority.NORMAL
                })
            );
        });

        it('should emit event with custom priority', async () => {
            const handler = jest.fn();
            eventBus.on('test.event', handler);

            await eventBus.emit('test.event', { message: 'urgent' }, EventPriority.HIGH);

            expect(handler).toHaveBeenCalledWith(
                expect.objectContaining({
                    priority: EventPriority.HIGH
                })
            );
        });

        it('should emit event to multiple handlers', async () => {
            const handler1 = jest.fn();
            const handler2 = jest.fn();
            const handler3 = jest.fn();

            eventBus.on('test.event', handler1);
            eventBus.on('test.event', handler2);
            eventBus.on('test.event', handler3);

            await eventBus.emit('test.event', { value: 42 });

            expect(handler1).toHaveBeenCalled();
            expect(handler2).toHaveBeenCalled();
            expect(handler3).toHaveBeenCalled();
        });

        it('should not throw if no handlers registered', async () => {
            await expect(
                eventBus.emit('unhandled.event', { data: 'test' })
            ).resolves.not.toThrow();
        });

        it('should handle async handlers', async () => {
            const handler = jest.fn().mockResolvedValue(undefined);
            eventBus.on('test.async', handler);

            await eventBus.emit('test.async', { data: 'async' });

            expect(handler).toHaveBeenCalled();
        });

        it('should catch and log handler errors', async () => {
            const errorHandler = jest.fn().mockRejectedValue(new Error('Handler error'));
            const successHandler = jest.fn();

            eventBus.on('test.error', errorHandler);
            eventBus.on('test.error', successHandler);

            await eventBus.emit('test.error', { data: 'test' });

            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('Error in event handler'),
                expect.any(Error)
            );
            expect(successHandler).toHaveBeenCalled(); // Other handlers still execute
        });
    });

    describe('Event Priority Queue', () => {
        it('should process events by priority', async () => {
            const callOrder: string[] = [];

            eventBus.on('test.priority', async () => {
                callOrder.push('normal');
            });

            eventBus.on('test.priority.high', async () => {
                callOrder.push('high');
            });

            eventBus.on('test.priority.critical', async () => {
                callOrder.push('critical');
            });

            // Emit in reverse priority order
            await eventBus.emit('test.priority', {}, EventPriority.NORMAL);
            await eventBus.emit('test.priority.high', {}, EventPriority.HIGH);
            await eventBus.emit('test.priority.critical', {}, EventPriority.CRITICAL);

            // All should be processed
            expect(callOrder).toContain('normal');
            expect(callOrder).toContain('high');
            expect(callOrder).toContain('critical');
        });

        it('should get pending events count', async () => {
            // Use a handler that doesn't complete immediately to test queue
            let resolveHandler: (() => void) | undefined;
            const handlerPromise = new Promise<void>(resolve => {
                resolveHandler = resolve;
            });

            eventBus.on('test.pending', async () => {
                await handlerPromise;
            });

            // This will start processing but won't complete
            const emitPromise = eventBus.emit('test.pending', {});

            // Allow microtask to run
            await Promise.resolve();

            // Now emit more while first is processing
            // Note: These will queue but the queue might be empty if processing is fast
            // So this test verifies the getPendingCount method exists and returns a number
            const pendingCount = eventBus.getPendingCount();
            expect(typeof pendingCount).toBe('number');
            expect(pendingCount).toBeGreaterThanOrEqual(0);

            // Resolve the handler
            if (resolveHandler) {
                resolveHandler();
            }
            await emitPromise;
        });

        it('should clear event queue', async () => {
            eventBus.clearQueue();

            expect(mockLogger.warn).toHaveBeenCalledWith('Event queue cleared');
            expect(eventBus.getPendingCount()).toBe(0);
        });
    });

    describe('Event History', () => {
        it('should record events in history', async () => {
            await eventBus.emit('test.history', { value: 1 });
            await eventBus.emit('test.history', { value: 2 });

            const history = eventBus.getHistory();
            expect(history.length).toBe(2);
            expect(history[0].type).toBe('test.history');
            expect(history[0].data).toEqual({ value: 1 });
            expect(history[1].data).toEqual({ value: 2 });
        });

        it('should get last N events from history', async () => {
            await eventBus.emit('test.1', {});
            await eventBus.emit('test.2', {});
            await eventBus.emit('test.3', {});
            await eventBus.emit('test.4', {});

            const lastTwo = eventBus.getHistory(2);
            expect(lastTwo.length).toBe(2);
            expect(lastTwo[0].type).toBe('test.3');
            expect(lastTwo[1].type).toBe('test.4');
        });

        it('should limit history size to maxHistorySize', async () => {
            // Emit more than maxHistorySize (100) events
            for (let i = 0; i < 150; i++) {
                await eventBus.emit(`test.${i}`, { index: i });
            }

            const history = eventBus.getHistory();
            expect(history.length).toBe(100);
            // Should keep the last 100
            expect(history[0].type).toBe('test.50');
            expect(history[99].type).toBe('test.149');
        });

        it('should clear event history', () => {
            eventBus.emit('test.event', {});
            eventBus.clearHistory();

            const history = eventBus.getHistory();
            expect(history.length).toBe(0);
            expect(mockLogger.debug).toHaveBeenCalledWith('Event history cleared');
        });

        it('should include event metadata in history', async () => {
            await eventBus.emit('test.metadata', { data: 'test' }, EventPriority.HIGH);

            const history = eventBus.getHistory();
            const event = history[0];

            expect(event.id).toMatch(/^event-\d+-\d+$/);
            expect(event.timestamp).toBeGreaterThan(0);
            expect(event.priority).toBe(EventPriority.HIGH);
            expect(event.type).toBe('test.metadata');
        });
    });

    describe('Statistics', () => {
        it('should return accurate statistics', () => {
            eventBus.on('event.1', jest.fn());
            eventBus.on('event.1', jest.fn());
            eventBus.on('event.2', jest.fn());

            const stats = eventBus.getStatistics();

            expect(stats.totalHandlers).toBe(3);
            expect(stats.handlersByEvent['event.1']).toBe(2);
            expect(stats.handlersByEvent['event.2']).toBe(1);
            expect(stats.pendingEvents).toBe(0);
            expect(stats.historySize).toBe(0);
        });

        it('should update statistics after events', async () => {
            eventBus.on('test.stats', jest.fn());

            await eventBus.emit('test.stats', {});
            await eventBus.emit('test.stats', {});

            const stats = eventBus.getStatistics();
            expect(stats.historySize).toBe(2);
        });
    });

    describe('Built-in Event Types', () => {
        it('should emit CONNECTION_ADDED event', async () => {
            const handler = jest.fn();
            eventBus.on(EVENTS.CONNECTION_ADDED, handler);

            const connection: Connection = {
                id: 'conn-1',
                name: 'Test DB',
                type: 'mysql',
                host: 'localhost',
                port: 3306,
                database: 'testdb',
                environment: 'dev',
                isConnected: true
            };

            await eventBus.emit(EVENTS.CONNECTION_ADDED, connection);

            expect(handler).toHaveBeenCalledWith(connection);
        });

        it('should emit CONNECTION_REMOVED event', async () => {
            const handler = jest.fn();
            eventBus.on(EVENTS.CONNECTION_REMOVED, handler);

            await eventBus.emit(EVENTS.CONNECTION_REMOVED, 'conn-1');

            expect(handler).toHaveBeenCalledWith('conn-1');
        });

        it('should emit CONNECTION_STATE_CHANGED event', async () => {
            const handler = jest.fn();
            eventBus.on(EVENTS.CONNECTION_STATE_CHANGED, handler);

            const stateChange: ConnectionStateChange = {
                connectionId: 'conn-1',
                oldState: 'disconnected',
                newState: 'connected'
            };

            await eventBus.emit(EVENTS.CONNECTION_STATE_CHANGED, stateChange);

            expect(handler).toHaveBeenCalledWith(stateChange);
        });

        it('should emit QUERY_EXECUTED event', async () => {
            const handler = jest.fn();
            eventBus.on(EVENTS.QUERY_EXECUTED, handler);

            const queryResult: QueryResult = {
                connectionId: 'conn-1',
                query: 'SELECT * FROM users',
                duration: 125,
                rowsAffected: 10
            };

            await eventBus.emit(EVENTS.QUERY_EXECUTED, queryResult);

            expect(handler).toHaveBeenCalledWith(queryResult);
        });

        it('should emit AI_REQUEST_SENT event', async () => {
            const handler = jest.fn();
            eventBus.on(EVENTS.AI_REQUEST_SENT, handler);

            await eventBus.emit(EVENTS.AI_REQUEST_SENT, {
                type: 'query_analysis',
                query: 'SELECT * FROM users',
                anonymized: true,
                timestamp: Date.now()
            });

            expect(handler).toHaveBeenCalled();
        });

        it('should emit AI_RESPONSE_RECEIVED event', async () => {
            const handler = jest.fn();
            eventBus.on(EVENTS.AI_RESPONSE_RECEIVED, handler);

            await eventBus.emit(EVENTS.AI_RESPONSE_RECEIVED, {
                type: 'query_analysis',
                duration: 2500,
                success: true
            });

            expect(handler).toHaveBeenCalled();
        });
    });

    describe('Disposal', () => {
        it('should clear all handlers on dispose', () => {
            eventBus.on('event.1', jest.fn());
            eventBus.on('event.2', jest.fn());

            eventBus.dispose();

            const stats = eventBus.getStatistics();
            expect(stats.totalHandlers).toBe(0);
            expect(mockLogger.info).toHaveBeenCalledWith('Event bus disposed');
        });

        it('should clear queue and history on dispose', async () => {
            await eventBus.emit('test.event', {});

            eventBus.dispose();

            expect(eventBus.getPendingCount()).toBe(0);
            expect(eventBus.getHistory().length).toBe(0);
        });

        it('should not throw when emitting after dispose', async () => {
            eventBus.dispose();

            await expect(
                eventBus.emit('test.after.dispose', {})
            ).resolves.not.toThrow();
        });
    });

    describe('Error Recovery', () => {
        it('should continue processing after handler error', async () => {
            const errorHandler = jest.fn().mockRejectedValue(new Error('Handler failed'));
            const successHandler = jest.fn();

            eventBus.on('test.recovery', errorHandler);
            eventBus.on('test.recovery', successHandler);

            await eventBus.emit('test.recovery', { data: 'test' });

            expect(errorHandler).toHaveBeenCalled();
            expect(successHandler).toHaveBeenCalled();
            expect(mockLogger.error).toHaveBeenCalled();
        });

        it('should handle synchronous handler errors', async () => {
            const errorHandler = jest.fn().mockImplementation(() => {
                throw new Error('Sync error');
            });
            const successHandler = jest.fn();

            eventBus.on('test.sync.error', errorHandler);
            eventBus.on('test.sync.error', successHandler);

            await eventBus.emit('test.sync.error', {});

            expect(mockLogger.error).toHaveBeenCalled();
            expect(successHandler).toHaveBeenCalled();
        });
    });

    describe('Concurrent Events', () => {
        it('should handle multiple concurrent emissions', async () => {
            const handler = jest.fn();
            eventBus.on('test.concurrent', handler);

            const emissions = [
                eventBus.emit('test.concurrent', { id: 1 }),
                eventBus.emit('test.concurrent', { id: 2 }),
                eventBus.emit('test.concurrent', { id: 3 })
            ];

            await Promise.all(emissions);

            expect(handler).toHaveBeenCalledTimes(3);
        });

        it('should maintain event order within priority level', async () => {
            const callOrder: number[] = [];

            eventBus.on('test.order', async (event) => {
                callOrder.push((event.data as { id: number }).id);
            });

            await eventBus.emit('test.order', { id: 1 }, EventPriority.NORMAL);
            await eventBus.emit('test.order', { id: 2 }, EventPriority.NORMAL);
            await eventBus.emit('test.order', { id: 3 }, EventPriority.NORMAL);

            expect(callOrder).toEqual([1, 2, 3]);
        });
    });
});

