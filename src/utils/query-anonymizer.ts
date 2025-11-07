/* eslint-disable @typescript-eslint/no-explicit-any */

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
            // Validate query syntax by attempting to parse
            this.parser.astify(query, { database: 'MySQL' });

            // Use regex-based approach as it's more reliable
            // AST approach with sqlify has issues with placeholder quoting
            return this.anonymizeWithRegex(query);
        } catch {
            // If parsing fails, also use regex fallback
            return this.anonymizeWithRegex(query);
        }
    }

    /**
     * Anonymize AST by replacing literal values
     */
    private anonymizeAST(node: any): void {
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
            if (Object.prototype.hasOwnProperty.call(node, key) && key !== 'type') {
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
            /credit[_\s]?card|\bcard\b/i, // Use word boundaries to avoid matching "discard", "cardboard"
            /ssn|social[_\s]?security/i,
            /api[_\s]?key/i,
            /token/i,
            /secret/i,
            /phone/i,
            /email/i,
        ];

        return sensitivePatterns.some(pattern => pattern.test(query));
    }
}
