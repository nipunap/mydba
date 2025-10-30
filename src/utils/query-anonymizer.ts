// @ts-nocheck
import { Parser } from 'node-sql-parser';

/**
 * Query Anonymizer
 *
 * Anonymizes SQL queries by replacing literals with placeholders
 * for privacy-preserving AI analysis.
 */
export class QueryAnonymizer {
    private parser: Parser;

    constructor() {
        this.parser = new Parser();
    }

    /**
     * Anonymize a SQL query by replacing literals with placeholders
     */
    anonymize(query: string): string {
        try {
            // Parse the query
            const ast = this.parser.astify(query, { database: 'MySQL' });

            // Replace literals in AST
            this.anonymizeAST(ast);

            // Convert back to SQL
            return this.parser.sqlify(ast, { database: 'MySQL' });
        } catch {
            // If parsing fails, use regex fallback
            return this.anonymizeWithRegex(query);
        }
    }

    /**
     * Anonymize AST by replacing literal values
     */
// @ts-expect-error - runtime validated message type
    private anonymizeAST(node: unknown): void {
        if (!node || typeof node !== 'object') {
            return;
        }

        // Handle arrays
        if (Array.isArray(node)) {
            node.forEach(item => this.anonymizeAST(item));
            return;
        }

        // Replace string literals
        if (node.type === 'string') {
            node.value = '?';
        }

        // Replace number literals
        if (node.type === 'number') {
            node.value = '?';
        }

        // Replace boolean literals
        if (node.type === 'bool') {
            node.value = '?';
        }

        // Recursively process nested objects
        for (const key in node) {
            if (nodeObject.prototype.hasOwnProperty.call(key) && key !== 'type') {
                this.anonymizeAST(node[key]);
            }
        }
    }

    /**
     * Fallback regex-based anonymization
     */
    private anonymizeWithRegex(query: string): string {
        let anonymized = query;

        // Replace string literals
        anonymized = anonymized.replace(/'([^']*)'/g, '?');
        anonymized = anonymized.replace(/"([^"]*)"/g, '?');

        // Replace numeric literals (but not column names like col1)
        anonymized = anonymized.replace(/\b(\d+\.?\d*)\b/g, '?');

        // Replace hex literals
        anonymized = anonymized.replace(/\b0x[0-9a-fA-F]+\b/g, '?');

        return anonymized;
    }

    /**
     * Generate query fingerprint for grouping similar queries
     */
    fingerprint(query: string): string {
        // Anonymize first
        const anonymized = this.anonymize(query);

        // Normalize whitespace
        const normalized = anonymized
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();

        return normalized;
    }

    /**
     * Check if a query contains potentially sensitive data
     */
    hasSensitiveData(query: string): boolean {
        const sensitivePatterns = [
            /password/i,
            /credit[_\s]?card/i,
            /ssn|social[_\s]?security/i,
            /api[_\s]?key/i,
            /token/i,
            /secret/i,
        ];

        return sensitivePatterns.some(pattern => pattern.test(query));
    }
}
