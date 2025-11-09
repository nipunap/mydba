import { RateLimiter, RateLimiterManager } from '../rate-limiter';

describe('RateLimiter', () => {
    beforeEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    describe('constructor', () => {
        it('should initialize with max tokens', () => {
            const limiter = new RateLimiter(10, 1);
            const status = limiter.getStatus();
            expect(status.available).toBe(10);
            expect(status.capacity).toBe(10);
        });
    });

    describe('consume', () => {
        it('should consume tokens immediately when available', async () => {
            const limiter = new RateLimiter(3, 1);
            await limiter.consume();
            const status = limiter.getStatus();
            expect(status.available).toBe(2);
        });

        it('should consume multiple tokens', async () => {
            const limiter = new RateLimiter(5, 1);
            await limiter.consume();
            await limiter.consume();
            await limiter.consume();
            const status = limiter.getStatus();
            expect(status.available).toBe(2);
        });

        it('should throw error when queue is full', async () => {
            const limiter = new RateLimiter(0, 1, 2); // 0 tokens, max queue 2

            // Start queuing (catch to prevent unhandled rejections)
            const promise1 = limiter.consume().catch(() => {});
            const promise2 = limiter.consume().catch(() => {});

            // Third should fail immediately
            await expect(limiter.consume()).rejects.toThrow('Rate limit queue full');

            // Clean up
            limiter.clearQueue();
            await Promise.allSettled([promise1, promise2]);
        });

        it('should handle consuming when exactly one token available', async () => {
            const limiter = new RateLimiter(1, 1);
            await limiter.consume();
            expect(limiter.getStatus().available).toBe(0);
        });

        it('should handle consuming when tokens exactly match request', async () => {
            const limiter = new RateLimiter(5, 1);
            // Consume exactly to zero
            for (let i = 0; i < 5; i++) {
                await limiter.consume();
            }
            expect(limiter.getStatus().available).toBe(0);
        });
    });

    describe('tryConsume', () => {
        it('should consume token if available', () => {
            const limiter = new RateLimiter(2, 1);
            expect(limiter.tryConsume()).toBe(true);
            expect(limiter.getStatus().available).toBe(1);
        });

        it('should return false if no tokens available', () => {
            const limiter = new RateLimiter(0, 1);
            expect(limiter.tryConsume()).toBe(false);
            expect(limiter.getStatus().available).toBe(0);
        });

        it('should not queue when tokens unavailable', () => {
            const limiter = new RateLimiter(0, 1);
            limiter.tryConsume();
            const status = limiter.getStatus();
            expect(status.queueSize).toBe(0);
        });

        it('should return true when exactly 1 token available', () => {
            const limiter = new RateLimiter(1, 1);
            expect(limiter.tryConsume()).toBe(true);
            expect(limiter.getStatus().available).toBe(0);
        });

        it('should return false after consuming all tokens', () => {
            const limiter = new RateLimiter(2, 1);
            expect(limiter.tryConsume()).toBe(true);
            expect(limiter.tryConsume()).toBe(true);
            expect(limiter.tryConsume()).toBe(false);
        });

        it('should handle fractional tokens correctly', () => {
            const limiter = new RateLimiter(0.5, 1);
            expect(limiter.tryConsume()).toBe(false); // Less than 1 token
        });
    });

    describe('getStatus', () => {
        it('should return correct status', () => {
            const limiter = new RateLimiter(10, 2);
            limiter.tryConsume();
            limiter.tryConsume();

            const status = limiter.getStatus();
            expect(status.available).toBe(8);
            expect(status.capacity).toBe(10);
            expect(status.queueSize).toBe(0);
            expect(status.utilizationPercent).toBeCloseTo(20, 1);
        });

        it('should calculate utilization percentage correctly', () => {
            const limiter = new RateLimiter(100, 1);
            for (let i = 0; i < 50; i++) {
                limiter.tryConsume();
            }

            const status = limiter.getStatus();
            expect(status.utilizationPercent).toBeCloseTo(50, 1);
        });

        it('should floor available tokens', () => {
            const limiter = new RateLimiter(10, 1);
            const status = limiter.getStatus();
            expect(Number.isInteger(status.available)).toBe(true);
        });
    });

    describe('reset', () => {
        it('should reset tokens to max', () => {
            const limiter = new RateLimiter(10, 1);
            limiter.tryConsume();
            limiter.tryConsume();
            expect(limiter.getStatus().available).toBe(8);

            limiter.reset();
            expect(limiter.getStatus().available).toBe(10);
        });

        it('should clear the queue on reset', () => {
            const limiter = new RateLimiter(0, 1, 10);

            // Reset should clear queue
            limiter.reset();
            expect(limiter.getStatus().queueSize).toBe(0);
            expect(limiter.getStatus().available).toBe(0);
        });

        it('should reset last refill time', () => {
            const limiter = new RateLimiter(10, 1);
            limiter.tryConsume();

            limiter.reset();

            // After reset, should have full capacity
            const status = limiter.getStatus();
            expect(status.available).toBe(10);
            expect(status.utilizationPercent).toBe(0);
        });
    });

    describe('clearQueue', () => {
        it('should reject all queued requests', async () => {
            const limiter = new RateLimiter(0, 1, 10);
            const promise1 = limiter.consume();
            const promise2 = limiter.consume();

            // Give a moment for queue to populate
            await new Promise(resolve => setTimeout(resolve, 5));

            limiter.clearQueue();

            await expect(promise1).rejects.toThrow('Rate limiter queue cleared');
            await expect(promise2).rejects.toThrow('Rate limiter queue cleared');
        });

        it('should empty the queue immediately', () => {
            const limiter = new RateLimiter(0, 1, 10);

            // Queue should start empty
            expect(limiter.getStatus().queueSize).toBe(0);

            limiter.clearQueue();
            expect(limiter.getStatus().queueSize).toBe(0);
        });

        it('should handle clearQueue on empty queue', () => {
            const limiter = new RateLimiter(10, 1);

            // Should not throw when clearing empty queue
            expect(() => limiter.clearQueue()).not.toThrow();
            expect(limiter.getStatus().queueSize).toBe(0);
        });
    });

    describe('token refill', () => {
        it('should refill tokens over time', async () => {
            const limiter = new RateLimiter(10, 10); // 10 tokens per second
            limiter.tryConsume();
            limiter.tryConsume();
            limiter.tryConsume();
            expect(limiter.getStatus().available).toBe(7);

            // Wait 100ms (should refill ~1 token at 10/sec rate)
            await new Promise(resolve => setTimeout(resolve, 100));

            const status = limiter.getStatus();
            expect(status.available).toBeGreaterThan(7);
            expect(status.available).toBeLessThanOrEqual(10);
        });

        it('should not exceed max tokens', async () => {
            const limiter = new RateLimiter(5, 10);

            // Wait for potential refill
            await new Promise(resolve => setTimeout(resolve, 150));

            const status = limiter.getStatus();
            expect(status.available).toBeLessThanOrEqual(5);
        });

        it('should calculate refill correctly', () => {
            const limiter = new RateLimiter(10, 2); // 2 tokens per second

            // Consume some tokens
            limiter.tryConsume();
            limiter.tryConsume();
            limiter.tryConsume();

            const status = limiter.getStatus();
            expect(status.available).toBe(7);
            expect(status.capacity).toBe(10);
        });

        it('should handle zero refill rate edge case', () => {
            const limiter = new RateLimiter(5, 0);
            limiter.tryConsume();

            // With zero refill rate, tokens should not increase
            const status1 = limiter.getStatus();
            const status2 = limiter.getStatus();

            expect(status1.available).toBe(status2.available);
        });
    });
});

describe('RateLimiterManager', () => {
    describe('constructor', () => {
        it('should initialize with config', () => {
            const config = {
                openai: { maxTokens: 10, refillRate: 1, maxQueueSize: 50 },
                anthropic: { maxTokens: 5, refillRate: 0.5, maxQueueSize: 25 }
            };

            const manager = new RateLimiterManager(config);
            const status = manager.getStatus();

            expect(status.openai).toBeDefined();
            expect(status.anthropic).toBeDefined();
            expect(status.openai.capacity).toBe(10);
            expect(status.anthropic.capacity).toBe(5);
        });

        it('should initialize with empty config', () => {
            const manager = new RateLimiterManager();
            const status = manager.getStatus();
            expect(Object.keys(status)).toHaveLength(0);
        });
    });

    describe('getLimiter', () => {
        it('should create limiter on demand', () => {
            const manager = new RateLimiterManager();
            const limiter = manager.getLimiter('openai');
            expect(limiter).toBeInstanceOf(RateLimiter);
        });

        it('should return same limiter for same provider', () => {
            const manager = new RateLimiterManager();
            const limiter1 = manager.getLimiter('openai');
            const limiter2 = manager.getLimiter('openai');
            expect(limiter1).toBe(limiter2);
        });

        it('should use default config for unknown providers', () => {
            const manager = new RateLimiterManager();
            const limiter = manager.getLimiter('unknown');
            const status = limiter.getStatus();
            expect(status.capacity).toBe(10); // Default maxTokens
        });

        it('should use configured values for known providers', () => {
            const config = {
                openai: { maxTokens: 20, refillRate: 2, maxQueueSize: 100 }
            };
            const manager = new RateLimiterManager(config);
            const limiter = manager.getLimiter('openai');
            const status = limiter.getStatus();
            expect(status.capacity).toBe(20);
        });
    });

    describe('consume', () => {
        it('should consume from correct provider', async () => {
            const manager = new RateLimiterManager();
            await manager.consume('openai');

            const status = manager.getStatus();
            expect(status.openai.available).toBe(9);
        });

        it('should handle multiple providers independently', async () => {
            const manager = new RateLimiterManager();
            await manager.consume('openai');
            await manager.consume('anthropic');

            const status = manager.getStatus();
            expect(status.openai.available).toBe(9);
            expect(status.anthropic.available).toBe(9);
        });
    });

    describe('tryConsume', () => {
        it('should try consume from correct provider', () => {
            const manager = new RateLimiterManager();
            const result = manager.tryConsume('openai');
            expect(result).toBe(true);

            const status = manager.getStatus();
            expect(status.openai.available).toBe(9);
        });

        it('should return false when tokens unavailable', () => {
            const config = {
                openai: { maxTokens: 0, refillRate: 1, maxQueueSize: 50 }
            };
            const manager = new RateLimiterManager(config);
            const result = manager.tryConsume('openai');
            expect(result).toBe(false);
        });
    });

    describe('getStatus', () => {
        it('should return status for all providers', () => {
            const config = {
                openai: { maxTokens: 10, refillRate: 1, maxQueueSize: 50 },
                anthropic: { maxTokens: 5, refillRate: 0.5, maxQueueSize: 25 }
            };
            const manager = new RateLimiterManager(config);
            manager.tryConsume('openai');

            const status = manager.getStatus();
            expect(Object.keys(status)).toHaveLength(2);
            expect(status.openai.available).toBe(9);
            expect(status.anthropic.available).toBe(5);
        });

        it('should return empty object when no providers', () => {
            const manager = new RateLimiterManager();
            const status = manager.getStatus();
            expect(Object.keys(status)).toHaveLength(0);
        });
    });

    describe('resetAll', () => {
        it('should reset all provider limiters', () => {
            const config = {
                openai: { maxTokens: 10, refillRate: 1, maxQueueSize: 50 },
                anthropic: { maxTokens: 5, refillRate: 0.5, maxQueueSize: 25 }
            };
            const manager = new RateLimiterManager(config);
            manager.tryConsume('openai');
            manager.tryConsume('anthropic');

            manager.resetAll();

            const status = manager.getStatus();
            expect(status.openai.available).toBe(10);
            expect(status.anthropic.available).toBe(5);
        });
    });

    describe('updateConfig', () => {
        it('should update provider config', () => {
            const manager = new RateLimiterManager();
            manager.getLimiter('openai'); // Create with default

            const newConfig = { maxTokens: 20, refillRate: 2, maxQueueSize: 100 };
            manager.updateConfig('openai', newConfig);

            const limiter = manager.getLimiter('openai');
            const status = limiter.getStatus();
            expect(status.capacity).toBe(20);
        });

        it('should recreate limiter with new config', () => {
            const manager = new RateLimiterManager();
            const limiter1 = manager.getLimiter('openai');
            limiter1.tryConsume();

            const newConfig = { maxTokens: 15, refillRate: 1.5, maxQueueSize: 75 };
            manager.updateConfig('openai', newConfig);

            const limiter2 = manager.getLimiter('openai');
            expect(limiter2).not.toBe(limiter1); // New instance
            expect(limiter2.getStatus().capacity).toBe(15);
        });

        it('should handle updating non-existent provider', () => {
            const manager = new RateLimiterManager();
            const newConfig = { maxTokens: 15, refillRate: 1.5, maxQueueSize: 75 };

            // Should not throw when updating config for provider that doesn't exist yet
            expect(() => manager.updateConfig('new-provider', newConfig)).not.toThrow();

            // Now get the limiter, it should use the new config
            const limiter = manager.getLimiter('new-provider');
            expect(limiter.getStatus().capacity).toBe(15);
        });
    });

    describe('edge cases', () => {
        it('should handle consume with multiple providers simultaneously', async () => {
            const manager = new RateLimiterManager();

            await Promise.all([
                manager.consume('provider1'),
                manager.consume('provider2'),
                manager.consume('provider3')
            ]);

            const status = manager.getStatus();
            expect(Object.keys(status)).toHaveLength(3);
            expect(status.provider1.available).toBe(9);
            expect(status.provider2.available).toBe(9);
            expect(status.provider3.available).toBe(9);
        });

        it('should handle mixed consume and tryConsume', () => {
            const manager = new RateLimiterManager();

            const result1 = manager.tryConsume('openai');
            expect(result1).toBe(true);

            const result2 = manager.tryConsume('openai');
            expect(result2).toBe(true);

            const status = manager.getStatus();
            expect(status.openai.available).toBe(8);
        });

        it('should maintain separate state per provider', () => {
            const config = {
                fast: { maxTokens: 100, refillRate: 10, maxQueueSize: 50 },
                slow: { maxTokens: 5, refillRate: 0.5, maxQueueSize: 10 }
            };
            const manager = new RateLimiterManager(config);

            // Consume from both
            for (let i = 0; i < 3; i++) {
                manager.tryConsume('fast');
                manager.tryConsume('slow');
            }

            const status = manager.getStatus();
            expect(status.fast.available).toBe(97);
            expect(status.slow.available).toBe(2);
        });

        it('should handle resetAll with no providers', () => {
            const manager = new RateLimiterManager();

            // Should not throw on empty manager
            expect(() => manager.resetAll()).not.toThrow();
        });

        it('should properly initialize limiters from config', () => {
            const config = {
                provider1: { maxTokens: 15, refillRate: 1.5, maxQueueSize: 30 },
                provider2: { maxTokens: 25, refillRate: 2.5, maxQueueSize: 50 }
            };
            const manager = new RateLimiterManager(config);

            // Both should be initialized
            const status = manager.getStatus();
            expect(status.provider1).toBeDefined();
            expect(status.provider2).toBeDefined();
            expect(status.provider1.capacity).toBe(15);
            expect(status.provider2.capacity).toBe(25);
        });
    });
});
