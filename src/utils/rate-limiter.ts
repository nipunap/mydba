/**
 * Rate Limiter using Token Bucket Algorithm
 *
 * Limits the rate of operations to prevent API quota exhaustion
 * and ensure fair resource usage.
 */
export class RateLimiter {
    private tokens: number;
    private lastRefill: number;
    private queue: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
    private processing = false;

    constructor(
        private maxTokens: number,
        private refillRate: number, // tokens per second
        private maxQueueSize: number = 100
    ) {
        this.tokens = maxTokens;
        this.lastRefill = Date.now();
    }

    /**
     * Attempt to consume a token
     * Returns immediately if token available, otherwise queues the request
     */
    async consume(): Promise<void> {
        this.refillTokens();

        if (this.tokens >= 1) {
            this.tokens -= 1;
            return Promise.resolve();
        }

        // Queue the request if no tokens available
        if (this.queue.length >= this.maxQueueSize) {
            throw new Error('Rate limit queue full');
        }

        return new Promise((resolve, reject) => {
            this.queue.push({ resolve, reject });
            this.processQueue();
        });
    }

    /**
     * Try to consume a token without waiting
     * Returns true if successful, false if rate limited
     */
    tryConsume(): boolean {
        this.refillTokens();

        if (this.tokens >= 1) {
            this.tokens -= 1;
            return true;
        }

        return false;
    }

    /**
     * Get current rate limit status
     */
    getStatus(): {
        available: number;
        capacity: number;
        queueSize: number;
        utilizationPercent: number;
    } {
        this.refillTokens();

        return {
            available: Math.floor(this.tokens),
            capacity: this.maxTokens,
            queueSize: this.queue.length,
            utilizationPercent: ((this.maxTokens - this.tokens) / this.maxTokens) * 100
        };
    }

    /**
     * Reset the rate limiter
     */
    reset(): void {
        this.tokens = this.maxTokens;
        this.lastRefill = Date.now();
        this.queue = [];
    }

    /**
     * Clear the queue and reject all pending requests
     */
    clearQueue(): void {
        const queue = this.queue;
        this.queue = [];

        queue.forEach(item => {
            item.reject(new Error('Rate limiter queue cleared'));
        });
    }

    // Private methods

    private refillTokens(): void {
        const now = Date.now();
        const timePassed = (now - this.lastRefill) / 1000; // seconds
        const tokensToAdd = timePassed * this.refillRate;

        this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
        this.lastRefill = now;
    }

    private async processQueue(): Promise<void> {
        if (this.processing) {
            return;
        }

        this.processing = true;

        while (this.queue.length > 0) {
            this.refillTokens();

            if (this.tokens < 1) {
                // Wait until we have tokens available
                const waitTime = (1 - this.tokens) / this.refillRate * 1000;
                await new Promise(resolve => setTimeout(resolve, Math.min(waitTime, 1000)));
                continue;
            }

            const item = this.queue.shift();
            if (item) {
                this.tokens -= 1;
                item.resolve();
            }
        }

        this.processing = false;
    }
}

/**
 * Rate Limiter Manager for multiple providers
 */
export class RateLimiterManager {
    private limiters: Map<string, RateLimiter> = new Map();

    constructor(private config: Record<string, RateLimiterConfig> = {}) {
        this.initializeLimiters();
    }

    /**
     * Get or create a rate limiter for a provider
     */
    getLimiter(provider: string): RateLimiter {
        if (!this.limiters.has(provider)) {
            const config = this.config[provider] || {
                maxTokens: 10,
                refillRate: 1,
                maxQueueSize: 50
            };
            this.limiters.set(provider, new RateLimiter(
                config.maxTokens,
                config.refillRate,
                config.maxQueueSize
            ));
        }

        const limiter = this.limiters.get(provider);
        if (!limiter) {
            throw new Error(`Failed to get rate limiter for provider: ${provider}`);
        }
        return limiter;
    }

    /**
     * Consume a token from a provider's rate limiter
     */
    async consume(provider: string): Promise<void> {
        const limiter = this.getLimiter(provider);
        return limiter.consume();
    }

    /**
     * Try to consume without waiting
     */
    tryConsume(provider: string): boolean {
        const limiter = this.getLimiter(provider);
        return limiter.tryConsume();
    }

    /**
     * Get status for all providers
     */
    getStatus(): Record<string, { tokens: number; queueSize: number; maxTokens: number; refillRate: number }> {
        const status: Record<string, { tokens: number; queueSize: number; maxTokens: number; refillRate: number }> = {};

        this.limiters.forEach((limiter, provider) => {
            status[provider] = limiter.getStatus();
        });

        return status;
    }

    /**
     * Reset all rate limiters
     */
    resetAll(): void {
        this.limiters.forEach(limiter => limiter.reset());
    }

    /**
     * Update configuration for a provider
     */
    updateConfig(provider: string, config: RateLimiterConfig): void {
        this.config[provider] = config;

        // Reset the limiter with new config
        if (this.limiters.has(provider)) {
            this.limiters.delete(provider);
        }
    }

    private initializeLimiters(): void {
        // Initialize limiters for configured providers
        Object.keys(this.config).forEach(provider => {
            this.getLimiter(provider);
        });
    }
}

export interface RateLimiterConfig {
    maxTokens: number;
    refillRate: number; // tokens per second
    maxQueueSize: number;
}
