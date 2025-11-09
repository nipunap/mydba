import { MetricsCollector } from '../metrics-collector';
import type { Logger } from '../../utils/logger';
import type { EventBus } from '../event-bus';
import type { ConnectionManager } from '../connection-manager';

describe('MetricsCollector', () => {
    const logger: Pick<Logger, 'info' | 'debug' | 'error'> = {
        info: jest.fn(),
        debug: jest.fn(),
        error: jest.fn()
    } as unknown as Logger;
    const eventBus = {} as unknown as EventBus;

    it('collects metrics when adapter available', async () => {
        const cm = {
            getAdapter: () => ({ getMetrics: async () => ({ connectionId: 'c1', connections: 1 } as Record<string, unknown>) })
        } as unknown as ConnectionManager;
        const mc = new MetricsCollector(cm, eventBus, logger as Logger);
        const metrics = await mc.collect('c1');
        expect(metrics).toMatchObject({ connectionId: 'c1' });
    });

    it('handles missing adapter gracefully', async () => {
        const cm = { getAdapter: () => null } as unknown as ConnectionManager;
        const mc = new MetricsCollector(cm, eventBus, logger as Logger);
        const metrics = await mc.collect('cX');
        expect(metrics).toBeNull();
    });

    it('starts and stops polling without throwing', () => {
        jest.useFakeTimers();
        const cm = {
            getAdapter: () => ({ getMetrics: async () => ({}) as Record<string, unknown> })
        } as unknown as ConnectionManager;
        const mc = new MetricsCollector(cm, eventBus, logger as Logger);
        mc.startPolling('c1', 1000);
        jest.advanceTimersByTime(3000);
        mc.stopPolling('c1');
        jest.useRealTimers();
    });
});
