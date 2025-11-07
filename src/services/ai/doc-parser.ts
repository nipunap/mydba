/**
 * Live Documentation Parser
 * 
 * Fetches and parses MySQL/MariaDB documentation from official websites
 * Supports version-specific retrieval
 */

import { Logger } from '../../utils/logger';
import { RAGDocument } from '../../types/ai-types';
import * as cheerio from 'cheerio';

export interface DocParserOptions {
    version?: string; // e.g., "8.0", "10.11"
    maxPages?: number; // Max pages to parse
    cacheDir?: string; // Cache directory
    cacheTTL?: number; // Cache TTL in milliseconds
}

export interface ParsedDocSection {
    title: string;
    content: string;
    url: string;
    headers: string[];
    codeBlocks: string[];
}

/**
 * Base Documentation Parser
 */
abstract class BaseDocParser {
    constructor(protected logger: Logger) {}

    abstract getBaseUrl(version?: string): string;
    abstract getDocUrls(version?: string): Promise<string[]>;
    abstract parseDoc(url: string): Promise<ParsedDocSection[]>;

    /**
     * Fetch HTML content from URL
     */
    protected async fetchHTML(url: string): Promise<string> {
        try {
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.text();
        } catch (error) {
            this.logger.error(`Failed to fetch ${url}:`, error as Error);
            throw error;
        }
    }

    /**
     * Extract keywords from text
     */
    protected extractKeywords(text: string): string[] {
        const words = text
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 3);

        // Remove duplicates and common words
        const commonWords = new Set([
            'this', 'that', 'with', 'from', 'have', 'will', 'your', 'there',
            'their', 'they', 'then', 'than', 'when', 'where', 'which', 'while',
        ]);

        const uniqueWords = [...new Set(words)].filter(w => !commonWords.has(w));

        // Return top 20 keywords by frequency
        const frequency = new Map<string, number>();
        words.forEach(w => {
            if (!commonWords.has(w)) {
                frequency.set(w, (frequency.get(w) || 0) + 1);
            }
        });

        return Array.from(frequency.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([word]) => word);
    }

    /**
     * Clean HTML content
     */
    protected cleanText(text: string): string {
        return text
            .replace(/\s+/g, ' ')
            .replace(/\n\s*\n/g, '\n\n')
            .trim();
    }
}

/**
 * MySQL Documentation Parser
 */
export class MySQLDocParser extends BaseDocParser {
    getBaseUrl(version?: string): string {
        const ver = version || '8.0';
        return `https://dev.mysql.com/doc/refman/${ver}/en/`;
    }

    async getDocUrls(version?: string): Promise<string[]> {
        const baseUrl = this.getBaseUrl(version);
        
        // Key MySQL documentation pages
        const pages = [
            'optimization.html',
            'indexes.html',
            'index-hints.html',
            'optimization-indexes.html',
            'execution-plan-information.html',
            'explain-output.html',
            'query-optimization.html',
            'select-optimization.html',
            'subquery-optimization.html',
            'join-optimization.html',
            'where-optimization.html',
            'range-optimization.html',
            'index-merge-optimization.html',
            'performance-schema.html',
            'sys-schema.html',
            'variables.html',
            'innodb-optimization.html',
            'lock-tables.html',
            'table-locking.html',
            'internal-locking.html',
        ];

        return pages.map(page => baseUrl + page);
    }

    async parseDoc(url: string): Promise<ParsedDocSection[]> {
        try {
            this.logger.debug(`Parsing MySQL doc: ${url}`);
            const html = await this.fetchHTML(url);
            const $ = cheerio.load(html);

            const sections: ParsedDocSection[] = [];

            // Find main content div
            const contentDiv = $('.section, .chapter, .refentry').first();

            if (contentDiv.length === 0) {
                this.logger.warn(`No content found in ${url}`);
                return [];
            }

            // Extract title
            const title = $('title').text().split('::')[0]?.trim() || 'MySQL Documentation';

            // Parse sections
            contentDiv.find('.section').each((_, element) => {
                const section = $(element);
                const sectionTitle = section.find('.title').first().text().trim();
                
                // Get all text, preserving structure
                const paragraphs: string[] = [];
                section.find('p, li, dd').each((_, p) => {
                    const text = $(p).text().trim();
                    if (text.length > 0) {
                        paragraphs.push(text);
                    }
                });

                const content = paragraphs.join('\n\n');

                // Extract code blocks
                const codeBlocks: string[] = [];
                section.find('pre, code').each((_, code) => {
                    const codeText = $(code).text().trim();
                    if (codeText.length > 0) {
                        codeBlocks.push(codeText);
                    }
                });

                // Extract headers
                const headers: string[] = [];
                section.find('h1, h2, h3, h4').each((_, h) => {
                    headers.push($(h).text().trim());
                });

                if (content.length > 100) {
                    sections.push({
                        title: sectionTitle || title,
                        content: this.cleanText(content),
                        url,
                        headers,
                        codeBlocks,
                    });
                }
            });

            // If no sections found, use whole content
            if (sections.length === 0) {
                const fullContent = contentDiv.text();
                if (fullContent.length > 100) {
                    sections.push({
                        title,
                        content: this.cleanText(fullContent),
                        url,
                        headers: [],
                        codeBlocks: [],
                    });
                }
            }

            this.logger.debug(`Parsed ${sections.length} sections from ${url}`);
            return sections;
        } catch (error) {
            this.logger.error(`Failed to parse ${url}:`, error as Error);
            return [];
        }
    }

    /**
     * Convert parsed sections to RAG documents
     */
    toRAGDocuments(sections: ParsedDocSection[], version?: string): RAGDocument[] {
        return sections.map((section, index) => ({
            title: section.title,
            content: section.content,
            source: section.url,
            version: version || '8.0',
            keywords: this.extractKeywords(section.content + ' ' + section.title),
            id: `mysql-${version || '8.0'}-${index}`,
        }));
    }
}

/**
 * MariaDB Documentation Parser
 */
export class MariaDBDocParser extends BaseDocParser {
    getBaseUrl(version?: string): string {
        const ver = version || '10.11';
        return `https://mariadb.com/kb/en/`;
    }

    async getDocUrls(version?: string): Promise<string[]> {
        const baseUrl = this.getBaseUrl(version);
        
        // Key MariaDB documentation pages
        const pages = [
            'optimization-and-indexes/',
            'query-optimizations/',
            'explain/',
            'index-hints/',
            'optimization-strategies/',
            'query-cache/',
            'performance-schema/',
            'server-system-variables/',
            'innodb-system-variables/',
            'aria/',
            'table-locking/',
            'transactions/',
        ];

        return pages.map(page => baseUrl + page);
    }

    async parseDoc(url: string): Promise<ParsedDocSection[]> {
        try {
            this.logger.debug(`Parsing MariaDB doc: ${url}`);
            const html = await this.fetchHTML(url);
            const $ = cheerio.load(html);

            const sections: ParsedDocSection[] = [];

            // Find main content
            const contentDiv = $('.content, article, .node').first();

            if (contentDiv.length === 0) {
                this.logger.warn(`No content found in ${url}`);
                return [];
            }

            // Extract title
            const title = $('h1').first().text().trim() || 'MariaDB Documentation';

            // Get content
            const paragraphs: string[] = [];
            contentDiv.find('p, li').each((_, p) => {
                const text = $(p).text().trim();
                if (text.length > 0) {
                    paragraphs.push(text);
                }
            });

            const content = paragraphs.join('\n\n');

            // Extract code blocks
            const codeBlocks: string[] = [];
            contentDiv.find('pre, code').each((_, code) => {
                const codeText = $(code).text().trim();
                if (codeText.length > 0) {
                    codeBlocks.push(codeText);
                }
            });

            // Extract headers
            const headers: string[] = [];
            contentDiv.find('h1, h2, h3').each((_, h) => {
                headers.push($(h).text().trim());
            });

            if (content.length > 100) {
                sections.push({
                    title,
                    content: this.cleanText(content),
                    url,
                    headers,
                    codeBlocks,
                });
            }

            this.logger.debug(`Parsed ${sections.length} sections from ${url}`);
            return sections;
        } catch (error) {
            this.logger.error(`Failed to parse ${url}:`, error as Error);
            return [];
        }
    }

    /**
     * Convert parsed sections to RAG documents
     */
    toRAGDocuments(sections: ParsedDocSection[], version?: string): RAGDocument[] {
        return sections.map((section, index) => ({
            title: section.title,
            content: section.content,
            source: section.url,
            version: version || '10.11',
            keywords: this.extractKeywords(section.content + ' ' + section.title),
            id: `mariadb-${version || '10.11'}-${index}`,
        }));
    }
}

/**
 * Documentation Parser Factory
 */
export class DocParserFactory {
    static create(dbType: 'mysql' | 'mariadb', logger: Logger): MySQLDocParser | MariaDBDocParser {
        switch (dbType) {
            case 'mysql':
                return new MySQLDocParser(logger);
            case 'mariadb':
                return new MariaDBDocParser(logger);
            default:
                throw new Error(`Unsupported database type: ${dbType}`);
        }
    }
}

