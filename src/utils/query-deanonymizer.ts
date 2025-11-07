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
        let result = '';
        let placeholderIndex = 0;
        let inSingleQuote = false;
        let inDoubleQuote = false;
        let i = 0;

        // Parse character by character to avoid replacing ? inside string literals
        while (i < query.length) {
            const char = query[i];
            const prevChar = i > 0 ? query[i - 1] : '';

            // Track if we're inside a string literal
            if (char === "'" && prevChar !== '\\') {
                inSingleQuote = !inSingleQuote;
                result += char;
            } else if (char === '"' && prevChar !== '\\') {
                inDoubleQuote = !inDoubleQuote;
                result += char;
            } else if (char === '?' && !inSingleQuote && !inDoubleQuote) {
                // This is a placeholder, not a literal question mark
                placeholderIndex++;
                // Get context around this specific placeholder
                const contextStart = Math.max(0, i - 50);
                const contextEnd = Math.min(query.length, i + 50);
                const context = query.substring(contextStart, contextEnd);
                result += this.getSampleValue(placeholderIndex, context);
            } else {
                result += char;
            }
            i++;
        }

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
     * Check if a query has parameter placeholders (outside string literals)
     */
    static hasParameters(query: string): boolean {
        let inSingleQuote = false;
        let inDoubleQuote = false;

        for (let i = 0; i < query.length; i++) {
            const char = query[i];
            const prevChar = i > 0 ? query[i - 1] : '';

            if (char === "'" && prevChar !== '\\') {
                inSingleQuote = !inSingleQuote;
            } else if (char === '"' && prevChar !== '\\') {
                inDoubleQuote = !inDoubleQuote;
            } else if (char === '?' && !inSingleQuote && !inDoubleQuote) {
                return true;
            }
        }

        return false;
    }

    /**
     * Count the number of parameter placeholders in a query (outside string literals)
     */
    static countParameters(query: string): number {
        let count = 0;
        let inSingleQuote = false;
        let inDoubleQuote = false;

        for (let i = 0; i < query.length; i++) {
            const char = query[i];
            const prevChar = i > 0 ? query[i - 1] : '';

            if (char === "'" && prevChar !== '\\') {
                inSingleQuote = !inSingleQuote;
            } else if (char === '"' && prevChar !== '\\') {
                inDoubleQuote = !inDoubleQuote;
            } else if (char === '?' && !inSingleQuote && !inDoubleQuote) {
                count++;
            }
        }

        return count;
    }
}
