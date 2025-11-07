import { VectorStore } from '../vector-store';
import { Logger } from '../../../utils/logger';

describe('VectorStore', () => {
    let store: VectorStore;
    let mockLogger: Logger;

    beforeEach(() => {
        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as unknown as Logger;

        store = new VectorStore(mockLogger);
    });

    describe('add', () => {
        test('should add a document successfully', () => {
            const doc = {
                id: 'test-1',
                text: 'Test document',
                embedding: [0.1, 0.2, 0.3],
                metadata: {
                    title: 'Test',
                    source: 'test.com',
                    dbType: 'mysql' as const,
                },
            };

            store.add(doc);
            expect(store.get('test-1')).toEqual(doc);
        });

        test('should throw error on dimension mismatch', () => {
            const doc1 = {
                id: 'test-1',
                text: 'Test 1',
                embedding: [0.1, 0.2, 0.3],
                metadata: {
                    title: 'Test',
                    source: 'test.com',
                    dbType: 'mysql' as const,
                },
            };

            const doc2 = {
                id: 'test-2',
                text: 'Test 2',
                embedding: [0.1, 0.2], // Different dimension
                metadata: {
                    title: 'Test',
                    source: 'test.com',
                    dbType: 'mysql' as const,
                },
            };

            store.add(doc1);
            expect(() => store.add(doc2)).toThrow('Embedding dimension mismatch');
        });
    });

    describe('search', () => {
        beforeEach(() => {
            // Add test documents
            const docs = [
                {
                    id: 'doc-1',
                    text: 'MySQL index optimization',
                    embedding: [1.0, 0.0, 0.0], // Unit vector along x-axis
                    metadata: {
                        title: 'Index Optimization',
                        source: 'mysql.com',
                        dbType: 'mysql' as const,
                    },
                },
                {
                    id: 'doc-2',
                    text: 'Query performance tuning',
                    embedding: [0.0, 1.0, 0.0], // Unit vector along y-axis
                    metadata: {
                        title: 'Performance Tuning',
                        source: 'mysql.com',
                        dbType: 'mysql' as const,
                    },
                },
                {
                    id: 'doc-3',
                    text: 'EXPLAIN output analysis',
                    embedding: [0.7, 0.7, 0.0], // Diagonal vector
                    metadata: {
                        title: 'EXPLAIN Analysis',
                        source: 'mariadb.com',
                        dbType: 'mariadb' as const,
                    },
                },
            ];

            docs.forEach(doc => store.add(doc));
        });

        test('should return similar documents', () => {
            const queryEmbedding = [0.9, 0.1, 0.0]; // Close to doc-1
            const results = store.search(queryEmbedding, { limit: 2 });

            expect(results.length).toBe(2);
            expect(results[0].document.id).toBe('doc-1');
            expect(results[0].score).toBeGreaterThan(0.9);
        });

        test('should respect threshold', () => {
            const queryEmbedding = [1.0, 0.0, 0.0];
            const results = store.search(queryEmbedding, {
                threshold: 0.9,
                limit: 10,
            });

            // Only doc-1 should match with high threshold
            expect(results.length).toBe(1);
            expect(results[0].document.id).toBe('doc-1');
        });

        test('should apply filter', () => {
            const queryEmbedding = [0.5, 0.5, 0.0];
            const results = store.search(queryEmbedding, {
                filter: (doc) => doc.metadata.dbType === 'mariadb',
                limit: 10,
            });

            expect(results.length).toBe(1);
            expect(results[0].document.id).toBe('doc-3');
        });

        test('should return empty array for orthogonal vectors', () => {
            const queryEmbedding = [0.0, 0.0, 1.0]; // Perpendicular to all docs
            const results = store.search(queryEmbedding, {
                threshold: 0.5,
            });

            expect(results.length).toBe(0);
        });
    });

    describe('hybridSearch', () => {
        beforeEach(() => {
            const docs = [
                {
                    id: 'doc-1',
                    text: 'MySQL index optimization strategies for better performance',
                    embedding: [1.0, 0.0, 0.0],
                    metadata: {
                        title: 'Index Optimization',
                        source: 'mysql.com',
                        dbType: 'mysql' as const,
                        keywords: ['index', 'optimization', 'performance'],
                    },
                },
                {
                    id: 'doc-2',
                    text: 'Query tuning techniques',
                    embedding: [0.0, 1.0, 0.0],
                    metadata: {
                        title: 'Query Tuning',
                        source: 'mysql.com',
                        dbType: 'mysql' as const,
                        keywords: ['query', 'tuning'],
                    },
                },
            ];

            docs.forEach(doc => store.add(doc));
        });

        test('should combine semantic and keyword scores', () => {
            const queryEmbedding = [0.5, 0.5, 0.0];
            const queryText = 'index optimization';

            const results = store.hybridSearch(queryEmbedding, queryText, {
                limit: 2,
                semanticWeight: 0.7,
                keywordWeight: 0.3,
            });

            expect(results.length).toBe(2);
            expect(results[0].combinedScore).toBeGreaterThan(0);
            expect(results[0].semanticScore).toBeDefined();
            expect(results[0].keywordScore).toBeDefined();
            
            // doc-1 should rank higher due to keyword matches
            expect(results[0].document.id).toBe('doc-1');
        });

        test('should respect weight configuration', () => {
            const queryEmbedding = [0.9, 0.1, 0.0]; // Strongly toward doc-1
            const queryText = 'tuning'; // Matches doc-2 keyword

            // Semantic-heavy search
            const semanticResults = store.hybridSearch(queryEmbedding, queryText, {
                semanticWeight: 0.9,
                keywordWeight: 0.1,
            });

            // Keyword-heavy search
            const keywordResults = store.hybridSearch(queryEmbedding, queryText, {
                semanticWeight: 0.1,
                keywordWeight: 0.9,
            });

            // Results should differ based on weights
            expect(semanticResults[0].combinedScore).not.toBe(keywordResults[0].combinedScore);
        });
    });

    describe('getStats', () => {
        test('should return correct statistics', () => {
            const docs = [
                {
                    id: 'doc-1',
                    text: 'Test',
                    embedding: [0.1, 0.2, 0.3],
                    metadata: {
                        title: 'Test',
                        source: 'test.com',
                        dbType: 'mysql' as const,
                    },
                },
                {
                    id: 'doc-2',
                    text: 'Test 2',
                    embedding: [0.4, 0.5, 0.6],
                    metadata: {
                        title: 'Test 2',
                        source: 'test.com',
                        dbType: 'mariadb' as const,
                    },
                },
            ];

            docs.forEach(doc => store.add(doc));

            const stats = store.getStats();

            expect(stats.totalDocuments).toBe(2);
            expect(stats.dimension).toBe(3);
            expect(stats.byDbType.mysql).toBe(1);
            expect(stats.byDbType.mariadb).toBe(1);
        });
    });

    describe('export/import', () => {
        test('should export and import correctly', () => {
            const doc = {
                id: 'test-1',
                text: 'Test document',
                embedding: [0.1, 0.2, 0.3],
                metadata: {
                    title: 'Test',
                    source: 'test.com',
                    dbType: 'mysql' as const,
                },
            };

            store.add(doc);

            // Export
            const exported = store.export();
            expect(exported).toContain('test-1');

            // Import into new store
            const newStore = new VectorStore(mockLogger);
            newStore.import(exported);

            expect(newStore.get('test-1')).toEqual(doc);
            expect(newStore.getStats().totalDocuments).toBe(1);
        });
    });

    describe('clear', () => {
        test('should clear all documents', () => {
            const doc = {
                id: 'test-1',
                text: 'Test',
                embedding: [0.1, 0.2, 0.3],
                metadata: {
                    title: 'Test',
                    source: 'test.com',
                    dbType: 'mysql' as const,
                },
            };

            store.add(doc);
            expect(store.getStats().totalDocuments).toBe(1);

            store.clear();
            expect(store.getStats().totalDocuments).toBe(0);
        });
    });
});

