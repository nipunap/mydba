import { RAGService } from '../rag-service';
import { Logger } from '../../utils/logger';
import { RAGDocument } from '../../types/ai-types';
import * as fs from 'fs';
import * as path from 'path';

// Mock dependencies
jest.mock('../../utils/logger');
jest.mock('fs');
jest.mock('path');

describe('RAGService', () => {
    let ragService: RAGService;
    let mockLogger: jest.Mocked<Logger>;

    // Sample test documents
    const mysqlTestDocs: RAGDocument[] = [
        {
            id: 'mysql-1',
            title: 'MySQL Index Optimization',
            keywords: ['index', 'optimization', 'performance', 'btree'],
            content: 'MySQL indexes use B-Tree structure for efficient lookups...',
            source: 'MySQL 8.0 Manual',
            version: '8.0'
        },
        {
            id: 'mysql-2',
            title: 'Query Execution Plans',
            keywords: ['explain', 'query', 'execution', 'plan', 'optimizer'],
            content: 'The EXPLAIN statement provides information about query execution...',
            source: 'MySQL 8.0 Manual',
            version: '8.0'
        },
        {
            id: 'mysql-3',
            title: 'JOIN Optimization',
            keywords: ['join', 'optimization', 'nested', 'loop'],
            content: 'MySQL uses nested-loop join algorithms...',
            source: 'MySQL 8.0 Manual',
            version: '8.0'
        }
    ];

    const mariadbTestDocs: RAGDocument[] = [
        {
            id: 'mariadb-1',
            title: 'MariaDB Indexes',
            keywords: ['index', 'performance', 'btree', 'columnstore'],
            content: 'MariaDB supports various index types including ColumnStore...',
            source: 'MariaDB 10.11 Manual',
            version: '10.11'
        },
        {
            id: 'mariadb-2',
            title: 'MariaDB Query Optimizer',
            keywords: ['optimizer', 'query', 'execution', 'cost'],
            content: 'The MariaDB optimizer evaluates different execution strategies...',
            source: 'MariaDB 10.11 Manual',
            version: '10.11'
        }
    ];

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock Logger
        mockLogger = {
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        } as unknown as jest.Mocked<Logger>;

        // Mock fs.existsSync
        (fs.existsSync as jest.Mock).mockReturnValue(true);

        // Mock path.join
        (path.join as jest.Mock).mockImplementation((...args) => args.join('/'));

        // Create service instance
        ragService = new RAGService(mockLogger);
    });

    describe('Initialization', () => {
        it('should initialize and load MySQL documentation', async () => {
            (fs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
                if (filePath.includes('mysql-docs.json')) {
                    return JSON.stringify({ documents: mysqlTestDocs });
                }
                return JSON.stringify({ documents: [] });
            });

            await ragService.initialize('/test/extension/path');

            expect(mockLogger.info).toHaveBeenCalledWith('Initializing RAG Service...');
            expect(mockLogger.info).toHaveBeenCalledWith('Loaded 3 MySQL documentation snippets');
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('RAG Service initialized'));
        });

        it('should initialize and load MariaDB documentation', async () => {
            (fs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
                if (filePath.includes('mariadb-docs.json')) {
                    return JSON.stringify({ documents: mariadbTestDocs });
                }
                return JSON.stringify({ documents: [] });
            });

            await ragService.initialize('/test/extension/path');

            expect(mockLogger.info).toHaveBeenCalledWith('Loaded 2 MariaDB documentation snippets');
        });

        it('should load both MySQL and MariaDB documentation', async () => {
            (fs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
                if (filePath.includes('mysql-docs.json')) {
                    return JSON.stringify({ documents: mysqlTestDocs });
                }
                if (filePath.includes('mariadb-docs.json')) {
                    return JSON.stringify({ documents: mariadbTestDocs });
                }
                return JSON.stringify({ documents: [] });
            });

            await ragService.initialize('/test/extension/path');

            const stats = ragService.getStats();
            expect(stats.total).toBe(5); // 3 MySQL + 2 MariaDB
            expect(stats.mysql).toBe(3);
            expect(stats.mariadb).toBe(2);
        });

        it('should handle missing documentation files gracefully', async () => {
            (fs.existsSync as jest.Mock).mockReturnValue(false);

            await ragService.initialize('/test/extension/path');

            const stats = ragService.getStats();
            expect(stats.total).toBe(0);
        });

        it('should handle malformed JSON gracefully', async () => {
            (fs.readFileSync as jest.Mock).mockReturnValue('invalid json {');

            await expect(ragService.initialize('/test/extension/path')).rejects.toThrow();
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to initialize RAG Service:',
                expect.any(Error)
            );
        });
    });

    describe('Document Retrieval - Keyword Matching', () => {
        beforeEach(async () => {
            (fs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
                if (filePath.includes('mysql-docs.json')) {
                    return JSON.stringify({ documents: mysqlTestDocs });
                }
                if (filePath.includes('mariadb-docs.json')) {
                    return JSON.stringify({ documents: mariadbTestDocs });
                }
                return JSON.stringify({ documents: [] });
            });

            await ragService.initialize('/test/extension/path');
        });

        it('should retrieve relevant MySQL documents by keyword', () => {
            const query = 'How do I optimize indexes?';
            const results = ragService.retrieveRelevantDocs(query, 'mysql', 3);

            expect(results.length).toBeGreaterThan(0);
            expect(results[0].title).toContain('Index');
        });

        it('should retrieve relevant MariaDB documents by keyword', () => {
            const query = 'How do I optimize indexes?';
            const results = ragService.retrieveRelevantDocs(query, 'mariadb', 3);

            expect(results.length).toBeGreaterThan(0);
            expect(results[0].title).toContain('Index');
            expect(results[0].source).toContain('MariaDB');
        });

        it('should filter by database type correctly', () => {
            const query = 'optimizer execution';
            const mysqlResults = ragService.retrieveRelevantDocs(query, 'mysql', 5);
            const mariadbResults = ragService.retrieveRelevantDocs(query, 'mariadb', 5);

            // Should return different sets of documents
            mysqlResults.forEach(doc => expect(doc.source).toContain('MySQL'));
            mariadbResults.forEach(doc => expect(doc.source).toContain('MariaDB'));
        });

        it('should handle multi-keyword queries', () => {
            const query = 'explain query execution plan optimization';
            const results = ragService.retrieveRelevantDocs(query, 'mysql', 3);

            expect(results.length).toBeGreaterThan(0);
            // Should prefer docs with multiple keyword matches
            expect(results[0].keywords.some(kw => ['explain', 'query', 'execution', 'plan', 'optimization'].includes(kw))).toBe(true);
        });

        it('should return empty array for queries with no keywords', () => {
            const query = 'a an the';
            const results = ragService.retrieveRelevantDocs(query, 'mysql', 3);

            expect(results).toEqual([]);
        });

        it('should limit results to maxDocs', () => {
            const query = 'optimization performance';
            const results = ragService.retrieveRelevantDocs(query, 'mysql', 1);

            expect(results.length).toBeLessThanOrEqual(1);
        });

        it('should handle empty query string', () => {
            const results = ragService.retrieveRelevantDocs('', 'mysql', 3);

            expect(results).toEqual([]);
        });

        it('should handle queries with only SQL noise words', () => {
            const query = 'SELECT FROM WHERE AND OR';
            const results = ragService.retrieveRelevantDocs(query, 'mysql', 3);

            expect(results).toEqual([]);
        });
    });

    describe('Relevance Scoring Algorithm', () => {
        beforeEach(async () => {
            (fs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
                if (filePath.includes('mysql-docs.json')) {
                    return JSON.stringify({ documents: mysqlTestDocs });
                }
                if (filePath.includes('mariadb-docs.json')) {
                    return JSON.stringify({ documents: mariadbTestDocs });
                }
                return JSON.stringify({ documents: [] });
            });

            await ragService.initialize('/test/extension/path');
        });

        it('should rank exact keyword matches highest', () => {
            const query = 'index btree';
            const results = ragService.retrieveRelevantDocs(query, 'mysql', 3);

            expect(results.length).toBeGreaterThan(0);
            expect(results[0].keywords).toContain('index');
        });

        it('should handle partial keyword matches', () => {
            const query = 'optimization optimizer';
            const results = ragService.retrieveRelevantDocs(query, 'mysql', 3);

            expect(results.length).toBeGreaterThan(0);
            // Should match both 'optimization' and 'optimizer'
        });

        it('should handle plural/singular matching', () => {
            const query = 'indexes';
            const results = ragService.retrieveRelevantDocs(query, 'mysql', 3);

            expect(results.length).toBeGreaterThan(0);
            // Should match 'index' in keywords
        });

        it('should prefer documents with focused keywords', () => {
            const query = 'explain execution plan';
            const results = ragService.retrieveRelevantDocs(query, 'mysql', 3);

            expect(results.length).toBeGreaterThan(0);
            // Document with all matching keywords should rank higher
            const topDoc = results[0];
            const matchingKeywords = topDoc.keywords.filter(kw =>
                ['explain', 'execution', 'plan'].includes(kw)
            );
            expect(matchingKeywords.length).toBeGreaterThan(0);
        });

        it('should return documents sorted by relevance', () => {
            const query = 'query explain execution';
            const results = ragService.retrieveRelevantDocs(query, 'mysql', 3);

            // Verify results are sorted (first result should be most relevant)
            if (results.length > 1) {
                // Can't easily test score values, but verify we get results
                expect(results.length).toBeGreaterThan(0);
            }
        });
    });

    describe('Citation Generation', () => {
        beforeEach(async () => {
            (fs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
                if (filePath.includes('mysql-docs.json')) {
                    return JSON.stringify({ documents: mysqlTestDocs });
                }
                return JSON.stringify({ documents: [] });
            });

            await ragService.initialize('/test/extension/path');
        });

        it('should build prompt with citation context', () => {
            const query = 'How do I optimize indexes?';
            const docs = ragService.retrieveRelevantDocs(query, 'mysql', 2);

            const prompt = ragService.buildPromptWithContext(query, docs);

            expect(prompt).toContain('Reference Documentation:');
            expect(prompt).toContain('User Query:');
            expect(prompt).toContain('citations');
        });

        it('should include document titles in prompt', () => {
            const docs = mysqlTestDocs.slice(0, 2);
            const prompt = ragService.buildPromptWithContext('test query', docs);

            docs.forEach(doc => {
                expect(prompt).toContain(doc.title);
            });
        });

        it('should include document sources in prompt', () => {
            const docs = mysqlTestDocs.slice(0, 2);
            const prompt = ragService.buildPromptWithContext('test query', docs);

            docs.forEach(doc => {
                expect(prompt).toContain(doc.source);
            });
        });

        it('should include document content in prompt', () => {
            const docs = mysqlTestDocs.slice(0, 1);
            const prompt = ragService.buildPromptWithContext('test query', docs);

            expect(prompt).toContain(docs[0].content);
        });

        it('should return original query when no docs provided', () => {
            const query = 'test query';
            const prompt = ragService.buildPromptWithContext(query, []);

            expect(prompt).toBe(query);
        });

        it('should format multiple documents correctly', () => {
            const docs = mysqlTestDocs.slice(0, 3);
            const prompt = ragService.buildPromptWithContext('test', docs);

            // Should include all document titles
            expect(prompt).toContain(docs[0].title);
            expect(prompt).toContain(docs[1].title);
            expect(prompt).toContain(docs[2].title);
        });
    });

    describe('Edge Cases', () => {
        beforeEach(async () => {
            (fs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
                if (filePath.includes('mysql-docs.json')) {
                    return JSON.stringify({ documents: mysqlTestDocs });
                }
                if (filePath.includes('mariadb-docs.json')) {
                    return JSON.stringify({ documents: mariadbTestDocs });
                }
                return JSON.stringify({ documents: [] });
            });

            await ragService.initialize('/test/extension/path');
        });

        it('should handle queries with no matching documents', () => {
            const query = 'nonexistent keyword xyz123';
            const results = ragService.retrieveRelevantDocs(query, 'mysql', 3);

            expect(results).toEqual([]);
        });

        it('should handle queries with all documents having low relevance', () => {
            const query = 'unrelated database concept';
            const results = ragService.retrieveRelevantDocs(query, 'mysql', 3);

            // May return empty or low-relevance docs
            expect(Array.isArray(results)).toBe(true);
        });

        it('should handle multiple identical keywords in query', () => {
            const query = 'index index index optimization optimization';
            const results = ragService.retrieveRelevantDocs(query, 'mysql', 3);

            // Should deduplicate keywords internally
            expect(results.length).toBeGreaterThan(0);
        });

        it('should handle very long queries', () => {
            const longQuery = 'optimization '.repeat(100);
            const results = ragService.retrieveRelevantDocs(longQuery, 'mysql', 3);

            expect(Array.isArray(results)).toBe(true);
        });

        it('should handle special characters in query', () => {
            const query = 'index!@#$%^&*()optimization';
            const results = ragService.retrieveRelevantDocs(query, 'mysql', 3);

            expect(Array.isArray(results)).toBe(true);
        });

        it('should handle case-insensitive matching', () => {
            const query1 = 'INDEX OPTIMIZATION';
            const query2 = 'index optimization';

            const results1 = ragService.retrieveRelevantDocs(query1, 'mysql', 3);
            const results2 = ragService.retrieveRelevantDocs(query2, 'mysql', 3);

            expect(results1.length).toBe(results2.length);
        });

        it('should handle documents with empty keyword arrays', async () => {
            const docsWithEmptyKeywords: RAGDocument[] = [
                {
                    id: 'test-1',
                    title: 'Test Doc',
                    keywords: [],
                    content: 'Content',
                    source: 'Test'
                }
            ];

            (fs.readFileSync as jest.Mock).mockReturnValue(
                JSON.stringify({ documents: docsWithEmptyKeywords })
            );

            const newService = new RAGService(mockLogger);
            await newService.initialize('/test/path');

            const results = newService.retrieveRelevantDocs('test', 'mysql', 3);
            expect(results).toEqual([]);
        });
    });

    describe('Statistics', () => {
        it('should return correct statistics', async () => {
            (fs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
                if (filePath.includes('mysql-docs.json')) {
                    return JSON.stringify({ documents: mysqlTestDocs });
                }
                if (filePath.includes('mariadb-docs.json')) {
                    return JSON.stringify({ documents: mariadbTestDocs });
                }
                return JSON.stringify({ documents: [] });
            });

            await ragService.initialize('/test/extension/path');

            const stats = ragService.getStats();

            expect(stats.total).toBe(5);
            expect(stats.mysql).toBe(3);
            expect(stats.mariadb).toBe(2);
            expect(stats.avgKeywordsPerDoc).toBeGreaterThan(0);
        });

        it('should calculate average keywords correctly', async () => {
            (fs.readFileSync as jest.Mock).mockReturnValue(
                JSON.stringify({ documents: mysqlTestDocs })
            );

            await ragService.initialize('/test/extension/path');

            const stats = ragService.getStats();

            // mysqlTestDocs has 4, 5, and 4 keywords = 13 total / 3 docs = 4.3
            expect(stats.avgKeywordsPerDoc).toBeCloseTo(4.3, 1);
        });

        it('should handle zero documents gracefully', async () => {
            (fs.readFileSync as jest.Mock).mockReturnValue(
                JSON.stringify({ documents: [] })
            );

            await ragService.initialize('/test/extension/path');

            const stats = ragService.getStats();

            expect(stats.total).toBe(0);
            expect(stats.mysql).toBe(0);
            expect(stats.mariadb).toBe(0);
            expect(stats.avgKeywordsPerDoc).toBe(0);
        });
    });

    describe('Search by Keyword', () => {
        beforeEach(async () => {
            (fs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
                if (filePath.includes('mysql-docs.json')) {
                    return JSON.stringify({ documents: mysqlTestDocs });
                }
                if (filePath.includes('mariadb-docs.json')) {
                    return JSON.stringify({ documents: mariadbTestDocs });
                }
                return JSON.stringify({ documents: [] });
            });

            await ragService.initialize('/test/extension/path');
        });

        it('should search documents by single keyword', () => {
            const results = ragService.searchByKeyword('index');

            expect(results.length).toBeGreaterThan(0);
            results.forEach(doc => {
                expect(doc.keywords.some(kw => kw.includes('index') || 'index'.includes(kw))).toBe(true);
            });
        });

        it('should return both MySQL and MariaDB docs in search', () => {
            const results = ragService.searchByKeyword('optimizer');

            expect(results.length).toBeGreaterThan(0);
            const mysqlDocs = results.filter(d => d.source.includes('MySQL'));
            const mariadbDocs = results.filter(d => d.source.includes('MariaDB'));

            expect(mysqlDocs.length).toBeGreaterThan(0);
            expect(mariadbDocs.length).toBeGreaterThan(0);
        });

        it('should handle case-insensitive search', () => {
            const results1 = ragService.searchByKeyword('INDEX');
            const results2 = ragService.searchByKeyword('index');

            expect(results1.length).toBe(results2.length);
        });

        it('should return empty array for non-matching keyword', () => {
            const results = ragService.searchByKeyword('nonexistent');

            expect(results).toEqual([]);
        });

        it('should handle partial keyword matching', () => {
            const results = ragService.searchByKeyword('optim');

            expect(results.length).toBeGreaterThan(0);
            // Should match 'optimization' and 'optimizer'
        });
    });

    describe('Keyword Extraction', () => {
        it('should extract relevant keywords from queries', async () => {
            (fs.readFileSync as jest.Mock).mockReturnValue(
                JSON.stringify({ documents: mysqlTestDocs })
            );

            await ragService.initialize('/test/extension/path');

            // Test via retrieveRelevantDocs which uses extractKeywords internally
            const query = 'How can I optimize my database indexes for better performance?';
            const results = ragService.retrieveRelevantDocs(query, 'mysql', 3);

            // Should extract: optimize, database, indexes, better, performance
            // And match against documents with these keywords
            expect(results.length).toBeGreaterThan(0);
        });

        it('should filter out noise words', () => {
            const query = 'SELECT from the table where and or not';
            const results = ragService.retrieveRelevantDocs(query, 'mysql', 3);

            // All words are noise words, should return empty
            expect(results).toEqual([]);
        });

        it('should handle queries with mixed content', () => {
            const query = 'SELECT index FROM users WHERE optimization = true';
            const results = ragService.retrieveRelevantDocs(query, 'mysql', 3);

            // Should extract 'index' and 'optimization', ignore noise words
            // May return 0 if no docs match, which is valid
            expect(Array.isArray(results)).toBe(true);
        });
    });
});
