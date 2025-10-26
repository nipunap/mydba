import { ConnectionManager } from './connection-manager';
import { EventBus } from './event-bus';
import { Logger } from '../utils/logger';

export class MetricsCollector {
    private pollingIntervals = new Map<string, NodeJS.Timeout>();

    constructor(
        private connectionManager: ConnectionManager,
        private eventBus: EventBus,
        private logger: Logger
    ) {}

    async collect(connectionId: string): Promise<any> {
        this.logger.debug(`Collecting metrics for connection: ${connectionId}`);

        const adapter = this.connectionManager.getAdapter(connectionId);
        if (!adapter || !adapter.getMetrics) {
            return null;
        }

        try {
            return await adapter.getMetrics();
        } catch (error) {
            this.logger.error(`Failed to collect metrics for ${connectionId}:`, error as Error);
            return null;
        }
    }

    startPolling(connectionId: string, interval: number = 5000): void {
        this.logger.info(`Starting metrics polling for ${connectionId} (${interval}ms)`);

        if (this.pollingIntervals.has(connectionId)) {
            this.stopPolling(connectionId);
        }

        const intervalId = setInterval(async () => {
            try {
                const metrics = await this.collect(connectionId);
                if (metrics) {
                    // TODO: Emit metrics event
                    this.logger.debug(`Collected metrics for ${connectionId}`);
                }
            } catch (error) {
                this.logger.error(`Error collecting metrics for ${connectionId}:`, error as Error);
            }
        }, interval);

        this.pollingIntervals.set(connectionId, intervalId);
    }

    stopPolling(connectionId: string): void {
        const intervalId = this.pollingIntervals.get(connectionId);
        if (intervalId) {
            clearInterval(intervalId);
            this.pollingIntervals.delete(connectionId);
            this.logger.info(`Stopped metrics polling for ${connectionId}`);
        }
    }

    getHistory(connectionId: string, range: any): Promise<any[]> {
        // TODO: Implement metrics history
        this.logger.debug(`Getting metrics history for ${connectionId}`);
        return Promise.resolve([]);
    }

    aggregate(metrics: any[], method: string): any {
        // TODO: Implement metrics aggregation
        this.logger.debug(`Aggregating ${metrics.length} metrics using ${method}`);
        return {};
    }
}
