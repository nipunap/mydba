/**
 * Embedding Provider Interface
 *
 * Supports multiple embedding providers:
 * - OpenAI embeddings (text-embedding-3-small)
 * - Transformers.js (local, in-browser)
 * - Mock/fallback (for testing)
 */

export interface EmbeddingVector {
    vector: number[];
    dimension: number;
}

export interface EmbeddingProvider {
    /**
     * Provider name
     */
    name: string;

    /**
     * Generate embedding for a single text
     */
    embed(text: string): Promise<EmbeddingVector>;

    /**
     * Generate embeddings for multiple texts (batch)
     */
    embedBatch(texts: string[]): Promise<EmbeddingVector[]>;

    /**
     * Get embedding dimension
     */
    getDimension(): number;

    /**
     * Check if provider is available/configured
     */
    isAvailable(): Promise<boolean>;
}

/**
 * Local Embedding Provider via transformers.js (dynamic import)
 * Note: Models are downloaded at runtime; nothing is bundled into VSIX.
 */
export class LocalTransformersEmbeddingProvider implements EmbeddingProvider {
    name = 'local';
    private dimension = 384; // Typical for MiniLM family; updated after model load
    private modelId = 'Xenova/all-MiniLM-L6-v2';
    private pipelinePromise: Promise<any> | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any

    constructor(modelId?: string) {
        if (modelId) this.modelId = modelId;
    }

    async isAvailable(): Promise<boolean> {
        try {
            await this.ensurePipeline();
            return true;
        } catch {
            return false;
        }
    }

    getDimension(): number {
        return this.dimension;
    }

    async embed(text: string): Promise<EmbeddingVector> {
        const pipe = await this.ensurePipeline();
        const output = await pipe(text);
        const vector = Array.from(output.data as Float32Array);
        this.dimension = vector.length;
        return { vector, dimension: vector.length };
    }

    async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
        const pipe = await this.ensurePipeline();
        const outputs = await pipe(texts);
        // transformers.js can return a single or array depending on input size
        const arr = Array.isArray(outputs) ? outputs : [outputs];
        return arr.map((o: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
            const vector = Array.from(o.data as Float32Array);
            this.dimension = vector.length;
            return { vector, dimension: vector.length } as EmbeddingVector;
        });
    }

    // Lazily load transformers.js pipeline
    private async ensurePipeline(): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
        if (this.pipelinePromise) return this.pipelinePromise;
        this.pipelinePromise = (async () => {
            // Dynamic import so assets are not bundled
            const { pipeline } = await import('@xenova/transformers');
            return await pipeline('feature-extraction', this.modelId);
        })();
        return this.pipelinePromise;
    }
}

/**
 * OpenAI Embedding Provider
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
    name = 'openai';
    private dimension = 1536; // text-embedding-3-small
    private apiKey?: string;

    constructor(apiKey?: string) {
        this.apiKey = apiKey;
    }

    async isAvailable(): Promise<boolean> {
        return !!this.apiKey;
    }

    getDimension(): number {
        return this.dimension;
    }

    async embed(text: string): Promise<EmbeddingVector> {
        if (!this.apiKey) {
            throw new Error('OpenAI API key not configured');
        }

        const response = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                input: text,
                model: 'text-embedding-3-small',
            }),
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.statusText}`);
        }

        const data = await response.json() as {
            data: Array<{ embedding: number[] }>;
        };

        if (!data.data || data.data.length === 0) {
            throw new Error('OpenAI API returned empty embedding data');
        }

        const vector = data.data[0].embedding;

        return {
            vector,
            dimension: vector.length,
        };
    }

    async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
        if (!this.apiKey) {
            throw new Error('OpenAI API key not configured');
        }

        const response = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
                input: texts,
                model: 'text-embedding-3-small',
            }),
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.statusText}`);
        }

        const data = await response.json() as {
            data: Array<{ embedding: number[] }>;
        };

        if (!data.data || data.data.length === 0) {
            throw new Error('OpenAI API returned empty embedding data for batch');
        }

        return data.data.map((item: { embedding: number[] }) => ({
            vector: item.embedding,
            dimension: item.embedding.length,
        }));
    }
}

/**
 * Mock Embedding Provider (for testing/fallback)
 * Uses simple hashing to generate deterministic "embeddings"
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
    name = 'mock';
    private dimension = 384; // Common dimension for small models

    async isAvailable(): Promise<boolean> {
        return true;
    }

    getDimension(): number {
        return this.dimension;
    }

    async embed(text: string): Promise<EmbeddingVector> {
        // Simple hash-based pseudo-embedding
        // This is NOT a real embedding, just for fallback/testing
        const vector = this.hashToVector(text);

        return {
            vector,
            dimension: this.dimension,
        };
    }

    async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
        return Promise.all(texts.map(t => this.embed(t)));
    }

    private hashToVector(text: string): number[] {
        const vector = new Array(this.dimension).fill(0);

        // Use character codes and positions to generate pseudo-random values
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            const index = (char + i) % this.dimension;
            vector[index] += Math.sin(char * i) / text.length;
        }

        // Normalize
        const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
        return vector.map(v => magnitude > 0 ? v / magnitude : 0);
    }
}

/**
 * Embedding Provider Factory
 */
export class EmbeddingProviderFactory {
    static create(type: 'openai' | 'mock' | 'local', config?: { apiKey?: string; modelId?: string }): EmbeddingProvider {
        switch (type) {
            case 'local':
                return new LocalTransformersEmbeddingProvider(config?.modelId);
            case 'openai':
                return new OpenAIEmbeddingProvider(config?.apiKey);
            case 'mock':
                return new MockEmbeddingProvider();
            default:
                throw new Error(`Unknown embedding provider: ${type}`);
        }
    }

    /**
     * Get the best available provider
     */
    static async getBestAvailable(config?: { openaiKey?: string; preferLocal?: boolean; modelId?: string }): Promise<EmbeddingProvider> {
        // Prefer local embeddings to avoid network and keep privacy
        if (config?.preferLocal !== false) {
            const local = new LocalTransformersEmbeddingProvider(config?.modelId);
            if (await local.isAvailable()) {
                return local;
            }
        }
        // Try OpenAI if API key is available
        if (config?.openaiKey) {
            const openai = new OpenAIEmbeddingProvider(config.openaiKey);
            if (await openai.isAvailable()) {
                return openai;
            }
        }

        // Fall back to mock provider
        return new MockEmbeddingProvider();
    }
}
