/**
 * Performance monitoring and tracing system
 * Tracks operation timings, enforces budgets, and exports traces
 */

import { IPerformanceMonitor, IPerformanceSpan } from './interfaces';
import { Logger } from '../utils/logger';
import { performance } from 'perf_hooks';

/**
 * Performance budgets for operations (in milliseconds)
 */
const PERFORMANCE_BUDGETS: Record<string, number> = {
    'extension.activate': 500,
    'webview.render.explain': 300,
    'webview.render.explain.large': 800,
    'ai.chat.firstToken': 2000,
    'ai.chat.firstToken.local': 500,
    'query.execute': 5000,
    'connection.test': 2000,
    'event.emit': 50,
    'cache.get': 10,
    'cache.set': 10
};

/**
 * Performance monitor implementation
 */
export class PerformanceMonitor implements IPerformanceMonitor {
    private spans = new Map<string, IPerformanceSpan>();
    private activeSpans = new Set<string>();
    private completedSpans: IPerformanceSpan[] = [];
    private maxHistorySize = 1000;
    private spanCounter = 0;

    constructor(private logger: Logger) {}

    /**
     * Start a performance span
     */
    startSpan(operation: string, parent?: string): string {
        const spanId = `span-${++this.spanCounter}-${Date.now()}`;

        const span: IPerformanceSpan = {
            operation,
            startTime: performance.now(),
            metadata: {},
            parent,
            children: []
        };

        this.spans.set(spanId, span);
        this.activeSpans.add(spanId);

        // Add to parent's children
        if (parent) {
            const parentSpan = this.spans.get(parent);
            if (parentSpan) {
                parentSpan.children.push(spanId);
            }
        }

        this.logger.debug(`Started span: ${operation} (${spanId})`);

        return spanId;
    }

    /**
     * End a performance span
     */
    endSpan(spanId: string, metadata?: Record<string, unknown>): void {
        const span = this.spans.get(spanId);
        if (!span) {
            this.logger.warn(`Span not found: ${spanId}`);
            return;
        }

        if (!this.activeSpans.has(spanId)) {
            this.logger.warn(`Span already ended: ${spanId}`);
            return;
        }

        span.endTime = performance.now();
        span.duration = span.endTime - span.startTime;

        if (metadata) {
            span.metadata = { ...span.metadata, ...metadata };
        }

        this.activeSpans.delete(spanId);

        // Check budget
        const budgetExceeded = !this.checkBudget(span.operation, span.duration);
        if (budgetExceeded) {
            this.logger.warn(
                `Performance budget exceeded for ${span.operation}: ${span.duration.toFixed(2)}ms (budget: ${PERFORMANCE_BUDGETS[span.operation] || 'N/A'}ms)`
            );
        }

        // Move to completed spans
        this.completedSpans.push(span);
        if (this.completedSpans.length > this.maxHistorySize) {
            this.completedSpans.shift();
        }

        this.logger.debug(
            `Ended span: ${span.operation} (${spanId}) - ${span.duration.toFixed(2)}ms${budgetExceeded ? ' ⚠️ BUDGET EXCEEDED' : ''}`
        );
    }

    /**
     * Get a specific span
     */
    getSpan(spanId: string): IPerformanceSpan | undefined {
        return this.spans.get(spanId);
    }

    /**
     * Get all spans (active + completed)
     */
    getAllSpans(): IPerformanceSpan[] {
        // Include both active and completed spans as documented
        const activeSpansList = Array.from(this.activeSpans)
            .map(spanId => this.spans.get(spanId))
            .filter((span): span is IPerformanceSpan => span !== undefined);

        return [...activeSpansList, ...this.completedSpans];
    }

    /**
     * Check if duration is within budget
     */
    checkBudget(operation: string, duration: number): boolean {
        const budget = PERFORMANCE_BUDGETS[operation];
        if (!budget) {
            // No budget defined, always pass
            return true;
        }

        return duration <= budget;
    }

    /**
     * Export traces in specified format
     */
    exportTraces(format: 'json' | 'opentelemetry'): unknown {
        if (format === 'opentelemetry') {
            return this.exportOpenTelemetry();
        }

        return {
            format: 'json',
            timestamp: Date.now(),
            spans: this.completedSpans.map(span => ({
                operation: span.operation,
                startTime: span.startTime,
                endTime: span.endTime,
                duration: span.duration,
                metadata: span.metadata,
                parent: span.parent,
                children: span.children
            }))
        };
    }

    /**
     * Export in OpenTelemetry format
     */
    private exportOpenTelemetry(): unknown {
        // Generate a single traceId for all spans in this trace (per OpenTelemetry standards)
        const traceId = this.generateTraceId();

        // Create a mapping from span IDs to their indices in completedSpans array
        // This ensures parent-child relationships are consistent
        const spanIdToIndex = new Map<string, number>();

        // First pass: Build the span ID to index mapping
        // We need to reconstruct the original span IDs to map them properly
        this.completedSpans.forEach((span, index) => {
            // Try to find the span in the spans Map to get its actual ID
            for (const [spanId, storedSpan] of this.spans.entries()) {
                if (storedSpan === span) {
                    spanIdToIndex.set(spanId, index);
                    break;
                }
            }
        });

        return {
            resourceSpans: [
                {
                    resource: {
                        attributes: [
                            { key: 'service.name', value: { stringValue: 'mydba' } },
                            { key: 'service.version', value: { stringValue: '2.0.0' } }
                        ]
                    },
                    scopeSpans: [
                        {
                            scope: {
                                name: 'mydba-performance-monitor',
                                version: '1.0.0'
                            },
                            spans: this.completedSpans.map((span, index) => {
                                // Find parent's index in the completedSpans array
                                const parentIndex = span.parent ? spanIdToIndex.get(span.parent) : undefined;

                                return {
                                    traceId, // Shared traceId for all spans in this trace
                                    spanId: this.generateSpanId(index),
                                    parentSpanId: parentIndex !== undefined ? this.generateSpanId(parentIndex) : undefined,
                                    name: span.operation,
                                    kind: 1, // SPAN_KIND_INTERNAL
                                    startTimeUnixNano: Math.floor(span.startTime * 1000000),
                                    endTimeUnixNano: span.endTime ? Math.floor(span.endTime * 1000000) : undefined,
                                    attributes: Object.entries(span.metadata || {}).map(([key, value]) => ({
                                        key,
                                        value: { stringValue: String(value) }
                                    })),
                                    status: { code: 1 } // STATUS_CODE_OK
                                };
                            })
                        }
                    ]
                }
            ]
        };
    }

    /**
     * Generate a trace ID for OpenTelemetry
     */
    private generateTraceId(): string {
        return Array.from({ length: 32 }, () =>
            Math.floor(Math.random() * 16).toString(16)
        ).join('');
    }

    /**
     * Generate a span ID for OpenTelemetry
     */
    private generateSpanId(index: number): string {
        return index.toString(16).padStart(16, '0');
    }

    /**
     * Get performance statistics
     */
    getStatistics(): {
        totalSpans: number;
        activeSpans: number;
        avgDuration: number;
        budgetViolations: number;
    } {
        const totalSpans = this.completedSpans.length;
        const activeSpans = this.activeSpans.size;

        const durations = this.completedSpans
            .filter(span => span.duration !== undefined)
            .map(span => span.duration as number);

        const avgDuration = durations.length > 0
            ? durations.reduce((sum, d) => sum + d, 0) / durations.length
            : 0;

        const budgetViolations = this.completedSpans.filter(span => {
            const budget = PERFORMANCE_BUDGETS[span.operation];
            return budget && span.duration && span.duration > budget;
        }).length;

        return {
            totalSpans,
            activeSpans,
            avgDuration,
            budgetViolations
        };
    }

    /**
     * Mark a performance mark (compatibility with Performance API)
     */
    mark(name: string): void {
        performance.mark(name);
        this.logger.debug(`Performance mark: ${name}`);
    }

    /**
     * Measure between two marks
     */
    measure(name: string, startMark: string, endMark: string): number | undefined {
        try {
            const measure = performance.measure(name, startMark, endMark);
            this.logger.debug(`Performance measure: ${name} = ${measure.duration.toFixed(2)}ms`);
            return measure.duration;
        } catch (error) {
            this.logger.warn(`Failed to measure ${name}:`, error as Error);
            return undefined;
        }
    }

    /**
     * Clear all performance marks and measures
     */
    clearMarks(): void {
        performance.clearMarks();
        this.logger.debug('Cleared all performance marks');
    }

    /**
     * Dispose of the performance monitor
     */
    dispose(): void {
        this.spans.clear();
        this.activeSpans.clear();
        this.completedSpans = [];
        this.clearMarks();
        this.logger.info('Performance monitor disposed');
    }
}

/**
 * Helper function to wrap an operation with performance tracking
 */
export async function traced<T>(
    monitor: IPerformanceMonitor,
    operation: string,
    fn: () => Promise<T>,
    parent?: string
): Promise<T> {
    const spanId = monitor.startSpan(operation, parent);

    try {
        const result = await fn();
        monitor.endSpan(spanId, { success: true });
        return result;
    } catch (error) {
        monitor.endSpan(spanId, {
            success: false,
            error: error instanceof Error ? error.message : String(error)
        });
        throw error;
    }
}

/**
 * Helper function to wrap a synchronous operation with performance tracking
 */
export function tracedSync<T>(
    monitor: IPerformanceMonitor,
    operation: string,
    fn: () => T,
    parent?: string
): T {
    const spanId = monitor.startSpan(operation, parent);

    try {
        const result = fn();
        monitor.endSpan(spanId, { success: true });
        return result;
    } catch (error) {
        monitor.endSpan(spanId, {
            success: false,
            error: error instanceof Error ? error.message : String(error)
        });
        throw error;
    }
}
