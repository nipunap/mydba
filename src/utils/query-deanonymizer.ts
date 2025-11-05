/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Query Deanonymizer
 *
 * Replaces parameter placeholders (?) with sample values
 * so queries can be executed for EXPLAIN/profiling purposes.
 */
export class QueryDeanonymizer {
    /**
     * Replace placeholders with sample values for EXPLAIN/profiling
     *
     * @param query Query with ? placeholders
     * @returns Query with sample values
     */
    static replaceParametersForExplain(query: string): string {
        let result = query;
        let placeholderIndex = 0;

        // Replace each ? with a sample value
        result = result.replace(/\?/g, () => {
            placeholderIndex++;
            return this.getSampleValue(placeholderIndex, query);
        });

        return result;
    }

    /**
     * Get a sample value for a placeholder based on context
     */
    private static getSampleValue(index: number, query: string): string {
        const lowerQuery = query.toLowerCase();

        // Try to infer the type based on query context
        // Look for common column names or operators near placeholders

        // Email patterns
        if (lowerQuery.includes('email')) {
            return "'sample@example.com'";
        }

        // Date/time patterns
        if (lowerQuery.match(/\b(date|created|updated|modified|timestamp)\b/)) {
            return "'2024-01-01'";
        }

        // ID patterns (usually numeric)
        if (lowerQuery.match(/\b(id|user_id|customer_id|order_id)\b/)) {
            return '1';
        }

        // Boolean patterns
        if (lowerQuery.match(/\b(active|enabled|deleted|verified|confirmed)\b/)) {
            return '1';
        }

        // Status patterns
        if (lowerQuery.match(/\b(status|state|type)\b/)) {
            return "'active'";
        }

        // Name patterns
        if (lowerQuery.match(/\b(name|first_name|last_name|username)\b/)) {
            return "'sample'";
        }

        // LIKE operator - use pattern with wildcards
        if (lowerQuery.match(/\blike\s+\?/)) {
            return "'%sample%'";
        }

        // IN operator - use list
        if (lowerQuery.match(/\bin\s*\(\s*\?/)) {
            return '1';
        }

        // Default to string for first few parameters, then numbers
        if (index <= 2) {
            return "'sample'";
        } else {
            return '1';
        }
    }

    /**
     * Check if a query has parameter placeholders
     */
    static hasParameters(query: string): boolean {
        return query.includes('?');
    }

    /**
     * Count the number of parameter placeholders in a query
     */
    static countParameters(query: string): number {
        return (query.match(/\?/g) || []).length;
    }
}
