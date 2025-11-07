/**
 * Circuit Breaker Pattern Implementation
 *
 * Prevents cascading failures by monitoring error rates and
 * temporarily disabling failing services.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service is failing, requests are rejected immediately
 * - HALF_OPEN: Testing if service has recovered
 */
export class CircuitBreaker {
    private state: CircuitState = 'CLOSED';
    private failureCount = 0;
    private successCount = 0;
    private lastFailureTime = 0;
    private nextAttemptTime = 0;

    constructor(
        private config: CircuitBreakerConfig = {
            failureThreshold: 3,
            successThreshold: 2,
            timeout: 30000, // 30 seconds
            resetTimeout: 60000 // 1 minute
        }
    ) {}

    /**
     * Execute a function with circuit breaker protection
     */
    async execute<T>(fn: () => Promise<T>): Promise<T> {
        if (this.state === 'OPEN') {
            if (Date.now() < this.nextAttemptTime) {
                throw new CircuitBreakerError(
                    'Circuit breaker is OPEN',
                    this.state,
                    this.getTimeUntilRetry()
                );
            }

            // Transition to HALF_OPEN to test the service
            this.state = 'HALF_OPEN';
            this.successCount = 0;
        }

        try {
            const result = await this.executeWithTimeout(fn);
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    /**
     * Get current circuit breaker state
     */
    getState(): CircuitState {
        return this.state;
    }

    /**
     * Get circuit breaker statistics
     */
    getStats(): CircuitStats {
        return {
            state: this.state,
            failureCount: this.failureCount,
            successCount: this.successCount,
            lastFailureTime: this.lastFailureTime,
            nextAttemptTime: this.nextAttemptTime,
            timeUntilRetry: this.getTimeUntilRetry()
        };
    }

    /**
     * Manually reset the circuit breaker
     */
    reset(): void {
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCount = 0;
        this.lastFailureTime = 0;
        this.nextAttemptTime = 0;
    }

    /**
     * Manually open the circuit breaker
     */
    trip(): void {
        this.state = 'OPEN';
        this.lastFailureTime = Date.now();
        this.nextAttemptTime = Date.now() + this.config.resetTimeout;
    }

    // Private methods

    private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
                reject(new Error('Circuit breaker timeout'));
            }, this.config.timeout);
        });

        return Promise.race([fn(), timeoutPromise]);
    }

    private onSuccess(): void {
        this.failureCount = 0;

        if (this.state === 'HALF_OPEN') {
            this.successCount++;

            if (this.successCount >= this.config.successThreshold) {
                this.state = 'CLOSED';
                this.successCount = 0;
            }
        }
    }

    private onFailure(): void {
        this.lastFailureTime = Date.now();
        this.failureCount++;

        if (this.state === 'HALF_OPEN') {
            // Immediately open if failure occurs in HALF_OPEN state
            this.state = 'OPEN';
            this.nextAttemptTime = Date.now() + this.config.resetTimeout;
            this.successCount = 0;
        } else if (this.failureCount >= this.config.failureThreshold) {
            // Open circuit if failure threshold exceeded
            this.state = 'OPEN';
            this.nextAttemptTime = Date.now() + this.config.resetTimeout;
        }
    }

    private getTimeUntilRetry(): number {
        if (this.state !== 'OPEN') {
            return 0;
        }

        const remaining = this.nextAttemptTime - Date.now();
        return Math.max(0, remaining);
    }
}

/**
 * Circuit Breaker Manager for multiple services
 */
export class CircuitBreakerManager {
    private breakers: Map<string, CircuitBreaker> = new Map();

    constructor(private defaultConfig?: CircuitBreakerConfig) {}

    /**
     * Get or create a circuit breaker for a service
     */
    getBreaker(service: string, config?: CircuitBreakerConfig): CircuitBreaker {
        if (!this.breakers.has(service)) {
            this.breakers.set(
                service,
                new CircuitBreaker(config || this.defaultConfig)
            );
        }

        const breaker = this.breakers.get(service);
        if (!breaker) {
            throw new Error(`Failed to get circuit breaker for service: ${service}`);
        }
        return breaker;
    }

    /**
     * Execute a function with circuit breaker protection
     */
    async execute<T>(
        service: string,
        fn: () => Promise<T>,
        config?: CircuitBreakerConfig
    ): Promise<T> {
        const breaker = this.getBreaker(service, config);
        return breaker.execute(fn);
    }

    /**
     * Get status for all circuit breakers
     */
    getAllStats(): Record<string, CircuitStats> {
        const stats: Record<string, CircuitStats> = {};

        this.breakers.forEach((breaker, service) => {
            stats[service] = breaker.getStats();
        });

        return stats;
    }

    /**
     * Reset all circuit breakers
     */
    resetAll(): void {
        this.breakers.forEach(breaker => breaker.reset());
    }

    /**
     * Reset a specific circuit breaker
     */
    reset(service: string): void {
        const breaker = this.breakers.get(service);
        if (breaker) {
            breaker.reset();
        }
    }

    /**
     * Trip a specific circuit breaker
     */
    trip(service: string): void {
        const breaker = this.breakers.get(service);
        if (breaker) {
            breaker.trip();
        }
    }

    /**
     * Check if any circuit breakers are open
     */
    hasOpenCircuits(): boolean {
        for (const breaker of this.breakers.values()) {
            if (breaker.getState() === 'OPEN') {
                return true;
            }
        }
        return false;
    }

    /**
     * Get list of services with open circuits
     */
    getOpenCircuits(): string[] {
        const open: string[] = [];

        this.breakers.forEach((breaker, service) => {
            if (breaker.getState() === 'OPEN') {
                open.push(service);
            }
        });

        return open;
    }
}

// Types

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
    failureThreshold: number; // Number of failures before opening
    successThreshold: number; // Number of successes in HALF_OPEN before closing
    timeout: number; // Request timeout in milliseconds
    resetTimeout: number; // Time to wait before transitioning from OPEN to HALF_OPEN
}

export interface CircuitStats {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number;
    nextAttemptTime: number;
    timeUntilRetry: number;
}

export class CircuitBreakerError extends Error {
    constructor(
        message: string,
        public readonly state: CircuitState,
        public readonly retryAfter: number
    ) {
        super(message);
        this.name = 'CircuitBreakerError';
    }
}
