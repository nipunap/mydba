import { QueryAnonymizer } from '../query-anonymizer';

describe('QueryAnonymizer', () => {
    let anonymizer: QueryAnonymizer;

    beforeEach(() => {
        anonymizer = new QueryAnonymizer();
    });

    describe('anonymize', () => {
        it('should anonymize string literals', () => {
            const query = "SELECT * FROM users WHERE name = 'John Doe' AND email = 'john@example.com'";
            const result = anonymizer.anonymize(query);

            expect(result).not.toContain('John Doe');
            expect(result).not.toContain('john@example.com');
            expect(result).toContain('?');
        });

        it('should anonymize numeric literals', () => {
            const query = 'SELECT * FROM orders WHERE amount > 1000 AND user_id = 12345';
            const result = anonymizer.anonymize(query);

            expect(result).not.toContain('1000');
            expect(result).not.toContain('12345');
            expect(result).toContain('?');
        });

        it('should preserve SQL keywords and structure', () => {
            const query = "SELECT * FROM users WHERE age > 25 AND status = 'active'";
            const result = anonymizer.anonymize(query);

            expect(result).toContain('SELECT');
            expect(result).toContain('FROM');
            expect(result).toContain('WHERE');
            expect(result).toContain('AND');
            expect(result).toContain('users');
        });

        it('should handle queries with no sensitive data', () => {
            const query = 'SELECT * FROM users';
            const result = anonymizer.anonymize(query);

            expect(result).toBe(query);
        });

        it('should handle empty strings', () => {
            const result = anonymizer.anonymize('');
            expect(result).toBe('');
        });

        it('should anonymize IN clauses', () => {
            const query = "SELECT * FROM users WHERE id IN (1, 2, 3, 4, 5)";
            const result = anonymizer.anonymize(query);

            expect(result).toContain('IN (?)');
            expect(result).not.toContain('1, 2, 3');
        });
    });

    describe('hasSensitiveData', () => {
        it('should detect email addresses', () => {
            const query = "SELECT * FROM users WHERE email = 'user@example.com'";
            expect(anonymizer.hasSensitiveData(query)).toBe(true);
        });

        it('should detect credit card patterns', () => {
            const query = "UPDATE payments SET card = '4532-1234-5678-9010'";
            expect(anonymizer.hasSensitiveData(query)).toBe(true);
        });

        it('should detect phone numbers', () => {
            const query = "SELECT * FROM contacts WHERE phone = '555-123-4567'";
            expect(anonymizer.hasSensitiveData(query)).toBe(true);
        });

        it('should detect SSN patterns', () => {
            const query = "INSERT INTO users (ssn) VALUES ('123-45-6789')";
            expect(anonymizer.hasSensitiveData(query)).toBe(true);
        });

        it('should not flag normal queries', () => {
            const query = 'SELECT * FROM users WHERE status = "active"';
            expect(anonymizer.hasSensitiveData(query)).toBe(false);
        });

        it('should handle empty strings', () => {
            expect(anonymizer.hasSensitiveData('')).toBe(false);
        });
    });

    describe('edge cases', () => {
        it('should handle queries with escaped quotes', () => {
            const query = "SELECT * FROM users WHERE name = 'John\\'s Computer'";
            const result = anonymizer.anonymize(query);

            expect(result).toBeDefined();
            expect(result.length).toBeGreaterThan(0);
        });

        it('should handle queries with comments', () => {
            const query = "SELECT * FROM users -- This is a comment\nWHERE name = 'John'";
            const result = anonymizer.anonymize(query);

            expect(result).toBeDefined();
        });

        it('should handle multi-line queries', () => {
            const query = `
                SELECT *
                FROM users
                WHERE email = 'test@example.com'
                  AND age > 25
            `;
            const result = anonymizer.anonymize(query);

            expect(result).not.toContain('test@example.com');
            expect(result).not.toContain('25');
        });

        it('should handle queries with special characters', () => {
            const query = "SELECT * FROM users WHERE name LIKE '%test%'";
            const result = anonymizer.anonymize(query);

            expect(result).toBeDefined();
        });
    });
});
