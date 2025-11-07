import { QueryDeanonymizer } from '../query-deanonymizer';

describe('QueryDeanonymizer - Parameter Replacement', () => {
    describe('hasParameters', () => {
        test('should detect queries with parameters', () => {
            expect(QueryDeanonymizer.hasParameters('SELECT * FROM users WHERE id = ?')).toBe(true);
            expect(QueryDeanonymizer.hasParameters('SELECT * FROM users WHERE id = ? AND name = ?')).toBe(true);
        });

        test('should return false for queries without parameters', () => {
            expect(QueryDeanonymizer.hasParameters('SELECT * FROM users')).toBe(false);
            expect(QueryDeanonymizer.hasParameters('SELECT * FROM users WHERE id = 1')).toBe(false);
        });

        test('should handle empty queries', () => {
            expect(QueryDeanonymizer.hasParameters('')).toBe(false);
        });
    });

    describe('countParameters', () => {
        test('should count single parameter', () => {
            expect(QueryDeanonymizer.countParameters('SELECT * FROM users WHERE id = ?')).toBe(1);
        });

        test('should count multiple parameters', () => {
            expect(QueryDeanonymizer.countParameters(
                'SELECT * FROM users WHERE id = ? AND name = ? AND email = ?'
            )).toBe(3);
        });

        test('should return 0 for queries without parameters', () => {
            expect(QueryDeanonymizer.countParameters('SELECT * FROM users')).toBe(0);
        });

        test('should count parameters in complex queries', () => {
            const query = `
                SELECT u.id, u.name, COUNT(o.id) as order_count
                FROM users u
                LEFT JOIN orders o ON u.id = o.user_id
                WHERE u.email = ?
                  AND u.created_at > ?
                  AND o.total > ?
                GROUP BY u.id, u.name
                HAVING COUNT(o.id) > ?
                LIMIT ?
            `;
            expect(QueryDeanonymizer.countParameters(query)).toBe(5);
        });
    });

    describe('replaceParametersForExplain', () => {
        test('should replace single parameter with sample value', () => {
            const query = 'SELECT * FROM users WHERE id = ?';
            const result = QueryDeanonymizer.replaceParametersForExplain(query);

            expect(result).not.toContain('?');
            expect(result).toMatch(/WHERE id = \d+/);
        });

        test('should replace multiple parameters with sample values', () => {
            const query = 'SELECT * FROM users WHERE id = ? AND name = ? AND email = ?';
            const result = QueryDeanonymizer.replaceParametersForExplain(query);

            expect(result).not.toContain('?');
            // The getSampleValue method checks the ENTIRE query for keywords, so all placeholders
            // get the same type (email in this case)
            expect(result).toContain('email');
        });

        test('should handle numeric context', () => {
            const query = 'SELECT * FROM numbers WHERE value > ? AND count < ?';
            const result = QueryDeanonymizer.replaceParametersForExplain(query);

            expect(result).not.toContain('?');
            // Should use sample values (default to string then number for subsequent params)
            expect(result).toContain('value >');
            expect(result).toContain('count <');
        });

        test('should handle string context', () => {
            const query = "SELECT * FROM users WHERE name = ? AND email LIKE ?";
            const result = QueryDeanonymizer.replaceParametersForExplain(query);

            expect(result).not.toContain('?');
            // Should use strings after = or LIKE
            expect(result).toMatch(/name = '[^']+'/);
            expect(result).toMatch(/email LIKE '[^']+'/);
        });

        test('should handle IN clause', () => {
            const query = 'SELECT * FROM users WHERE id IN (?, ?, ?)';
            const result = QueryDeanonymizer.replaceParametersForExplain(query);

            expect(result).not.toContain('?');
            expect(result).toMatch(/IN \(\d+, \d+, \d+\)/);
        });

        test('should handle INSERT statements', () => {
            const query = 'INSERT INTO users (name, email, age) VALUES (?, ?, ?)';
            const result = QueryDeanonymizer.replaceParametersForExplain(query);

            expect(result).not.toContain('?');
            expect(result).toContain('VALUES');
        });

        test('should handle UPDATE statements', () => {
            const query = 'UPDATE products SET price = ?, quantity = ? WHERE product_id = ?';
            const result = QueryDeanonymizer.replaceParametersForExplain(query);

            expect(result).not.toContain('?');
            expect(result).toContain('SET price =');
            expect(result).toContain('quantity =');
            expect(result).toContain('WHERE product_id =');
        });

        test('should handle DELETE statements', () => {
            const query = 'DELETE FROM users WHERE id = ? AND status = ?';
            const result = QueryDeanonymizer.replaceParametersForExplain(query);

            expect(result).not.toContain('?');
            expect(result).toMatch(/WHERE id = \d+/);
        });

        test('should handle BETWEEN clauses', () => {
            const query = 'SELECT * FROM orders WHERE created_at BETWEEN ? AND ?';
            const result = QueryDeanonymizer.replaceParametersForExplain(query);

            expect(result).not.toContain('?');
            expect(result).toMatch(/BETWEEN '[^']+' AND '[^']+'/);
        });

        test('should handle JOIN conditions', () => {
            const query = `
                SELECT * FROM users u
                JOIN orders o ON u.id = o.user_id
                WHERE u.email = ? AND o.status = ?
            `;
            const result = QueryDeanonymizer.replaceParametersForExplain(query);

            expect(result).not.toContain('?');
            expect(result).toMatch(/u.email = '[^']+'/);
            expect(result).toMatch(/o.status = '[^']+'/);
        });

        test('should handle subqueries with parameters', () => {
            const query = `
                SELECT * FROM people
                WHERE id IN (SELECT person_id FROM transactions WHERE amount > ?)
                AND active = ?
            `;
            const result = QueryDeanonymizer.replaceParametersForExplain(query);

            expect(result).not.toContain('?');
            expect(result).toContain('amount >');
            expect(result).toContain('active =');
        });

        test('should preserve query structure', () => {
            const query = `
                SELECT u.id, u.name, COUNT(o.id) as order_count
                FROM users u
                LEFT JOIN orders o ON u.id = o.user_id
                WHERE u.email = ?
                GROUP BY u.id, u.name
                HAVING COUNT(o.id) > ?
                ORDER BY order_count DESC
                LIMIT ?
            `;
            const result = QueryDeanonymizer.replaceParametersForExplain(query);

            expect(result).toContain('SELECT');
            expect(result).toContain('FROM');
            expect(result).toContain('LEFT JOIN');
            expect(result).toContain('WHERE');
            expect(result).toContain('GROUP BY');
            expect(result).toContain('HAVING');
            expect(result).toContain('ORDER BY');
            expect(result).toContain('LIMIT');
            expect(result).not.toContain('?');
        });

        test('should handle queries with no parameters', () => {
            const query = 'SELECT * FROM users WHERE id = 1';
            const result = QueryDeanonymizer.replaceParametersForExplain(query);

            expect(result).toBe(query);
        });

        test('should handle empty queries', () => {
            const query = '';
            const result = QueryDeanonymizer.replaceParametersForExplain(query);

            expect(result).toBe('');
        });

        test('should use sample values based on keyword detection', () => {
            const query = 'SELECT * FROM products WHERE product_id = ?';
            const result = QueryDeanonymizer.replaceParametersForExplain(query);

            expect(result).not.toContain('?');
            expect(result).toContain('product_id =');
            // The function uses keyword detection to determine sample value type
            // First parameter defaults to 'sample', then subsequent ones use context
        });
    });

    describe('edge cases', () => {
        test('should handle multiple consecutive parameters', () => {
            const query = 'SELECT * FROM test WHERE a = ? AND b = ? AND c = ?';
            const result = QueryDeanonymizer.replaceParametersForExplain(query);

            expect(result).not.toContain('?');
            expect(QueryDeanonymizer.countParameters(result)).toBe(0);
        });

        test('should NOT replace question marks inside string literals', () => {
            const query = "SELECT * FROM users WHERE comment = 'What? Really?' AND user_id = ?";
            const result = QueryDeanonymizer.replaceParametersForExplain(query);

            // The improved implementation preserves ? inside string literals
            // Only the actual placeholder (user_id = ?) should be replaced
            expect(result).toContain("'What? Really?'"); // Literal ? preserved
            expect(result).toContain('user_id = 1'); // Placeholder replaced
            expect(result).not.toMatch(/user_id = \?/); // Verify placeholder was replaced
        });

        test('should handle very long queries', () => {
            const longQuery = `
                SELECT * FROM users
                WHERE id = ? AND name = ? AND email = ? AND age = ? AND status = ?
                  AND created_at = ? AND updated_at = ? AND city = ? AND country = ?
                  AND phone = ? AND address = ? AND zip_code = ? AND score = ?
            `;
            const result = QueryDeanonymizer.replaceParametersForExplain(longQuery);

            expect(result).not.toContain('?');
            expect(QueryDeanonymizer.countParameters(result)).toBe(0);
        });

        test('should handle case-insensitive SQL keywords', () => {
            const query = 'select * from users where id = ? and name = ?';
            const result = QueryDeanonymizer.replaceParametersForExplain(query);

            expect(result).not.toContain('?');
        });
    });
});
