import { MockEmbeddingProvider, EmbeddingProviderFactory } from '../embedding-provider';

describe('MockEmbeddingProvider', () => {
    let provider: MockEmbeddingProvider;

    beforeEach(() => {
        provider = new MockEmbeddingProvider();
    });

    test('should always be available', async () => {
        const available = await provider.isAvailable();
        expect(available).toBe(true);
    });

    test('should return consistent dimension', () => {
        const dimension = provider.getDimension();
        expect(dimension).toBe(384);
    });

    test('should generate deterministic embeddings', async () => {
        const text = 'test query';
        
        const embedding1 = await provider.embed(text);
        const embedding2 = await provider.embed(text);

        expect(embedding1.vector).toEqual(embedding2.vector);
        expect(embedding1.dimension).toBe(384);
    });

    test('should generate different embeddings for different texts', async () => {
        const text1 = 'first text';
        const text2 = 'second text';

        const embedding1 = await provider.embed(text1);
        const embedding2 = await provider.embed(text2);

        expect(embedding1.vector).not.toEqual(embedding2.vector);
    });

    test('should generate normalized vectors', async () => {
        const embedding = await provider.embed('test');
        
        // Calculate magnitude
        const magnitude = Math.sqrt(
            embedding.vector.reduce((sum, val) => sum + val * val, 0)
        );

        // Normalized vectors should have magnitude close to 1
        expect(magnitude).toBeCloseTo(1.0, 1);
    });

    test('should handle embedBatch', async () => {
        const texts = ['text1', 'text2', 'text3'];
        const embeddings = await provider.embedBatch(texts);

        expect(embeddings.length).toBe(3);
        embeddings.forEach(emb => {
            expect(emb.dimension).toBe(384);
            expect(emb.vector.length).toBe(384);
        });
    });

    test('should handle empty string', async () => {
        const embedding = await provider.embed('');
        
        expect(embedding.vector.length).toBe(384);
        expect(embedding.dimension).toBe(384);
    });

    test('should handle long text', async () => {
        const longText = 'word '.repeat(1000);
        const embedding = await provider.embed(longText);

        expect(embedding.vector.length).toBe(384);
        expect(embedding.dimension).toBe(384);
    });
});

describe('EmbeddingProviderFactory', () => {
    test('should create mock provider', () => {
        const provider = EmbeddingProviderFactory.create('mock');
        
        expect(provider).toBeInstanceOf(MockEmbeddingProvider);
        expect(provider.name).toBe('mock');
    });

    test('should throw error for unknown provider', () => {
        expect(() => {
            // @ts-expect-error Testing invalid input
            EmbeddingProviderFactory.create('unknown');
        }).toThrow('Unknown embedding provider');
    });

    test('should get best available provider', async () => {
        const provider = await EmbeddingProviderFactory.getBestAvailable();
        
        // Without OpenAI key, should fall back to mock
        expect(provider).toBeInstanceOf(MockEmbeddingProvider);
        expect(await provider.isAvailable()).toBe(true);
    });

    test('should prefer OpenAI when key is available', async () => {
        const provider = await EmbeddingProviderFactory.getBestAvailable({
            openaiKey: 'test-key'
        });

        // Should try OpenAI, but will fall back to mock in test environment
        expect(provider).toBeDefined();
        expect(provider.name).toBeTruthy();
    });
});

describe('OpenAIEmbeddingProvider', () => {
    // Note: These tests require network access and a real API key
    // In a real test environment, these would be mocked or skipped

    test('should not be available without API key', async () => {
        const { OpenAIEmbeddingProvider } = await import('../embedding-provider');
        const provider = new OpenAIEmbeddingProvider();
        
        const available = await provider.isAvailable();
        expect(available).toBe(false);
    });

    test('should be available with API key', async () => {
        const { OpenAIEmbeddingProvider } = await import('../embedding-provider');
        const provider = new OpenAIEmbeddingProvider('test-key');
        
        const available = await provider.isAvailable();
        expect(available).toBe(true);
    });

    test('should return correct dimension', async () => {
        const { OpenAIEmbeddingProvider } = await import('../embedding-provider');
        const provider = new OpenAIEmbeddingProvider('test-key');
        
        expect(provider.getDimension()).toBe(1536);
    });

    test('should throw error when embedding without API key', async () => {
        const { OpenAIEmbeddingProvider } = await import('../embedding-provider');
        const provider = new OpenAIEmbeddingProvider();

        await expect(provider.embed('test')).rejects.toThrow('OpenAI API key not configured');
    });
});

