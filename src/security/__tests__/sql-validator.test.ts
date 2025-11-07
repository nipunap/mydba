import { SQLValidator } from '../sql-validator';

describe('SQLValidator', () => {
    let validator: SQLValidator;

    beforeEach(() => {
        validator = new SQLValidator();
    });

    describe('validate', () => {
        it('should allow safe SELECT queries', () => {
            const query = 'SELECT * FROM users WHERE id = 1';
            const result = validator.validate(query);

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should allow safe INSERT queries', () => {
            const query = 'INSERT INTO users (name, email) VALUES ("John", "john@example.com")';
            const result = validator.validate(query);

            expect(result.isValid).toBe(true);
        });

        it('should detect SQL injection attempts', () => {
            const query = "SELECT * FROM users WHERE name = 'admin' OR '1'='1'";
            const result = validator.validate(query);

            // Should flag as suspicious or invalid
            expect(result.warnings?.length).toBeGreaterThan(0);
        });

        it('should detect comment-based injection', () => {
            const query = "SELECT * FROM users WHERE id = 1 -- ' AND password = 'anything'";
            const result = validator.validate(query);

            // Should have warnings about comments
            expect(result.warnings?.length).toBeGreaterThan(0);
        });

        it('should reject empty queries', () => {
            const query = '';
            const result = validator.validate(query);

            expect(result.isValid).toBe(false);
            expect(result.errors?.length).toBeGreaterThan(0);
        });

        it('should reject queries with only whitespace', () => {
            const query = '   \n\t  ';
            const result = validator.validate(query);

            expect(result.isValid).toBe(false);
        });

        it('should detect UNION-based injection', () => {
            const query = "SELECT * FROM users WHERE id = 1 UNION SELECT password FROM admin";
            const result = validator.validate(query);

            // Should flag as suspicious
            expect(result.warnings?.length).toBeGreaterThan(0);
        });

        it('should detect stacked queries', () => {
            const query = "SELECT * FROM users; DROP TABLE users;";
            const result = validator.validate(query);

            // Should detect multiple statements
            expect(result.warnings?.length).toBeGreaterThan(0);
        });

        it('should allow queries with legitimate comments', () => {
            const query = `
                -- Get active users
                SELECT * FROM users
                WHERE status = 'active'
            `;
            const result = validator.validate(query);

            // Should be valid but may have warnings
            expect(result.isValid).toBe(true);
        });
    });

    describe('isSafe', () => {
        it('should return true for safe SELECT', () => {
            const query = 'SELECT id, name FROM users WHERE status = "active"';
            expect(validator.isSafe(query)).toBe(true);
        });

        it('should return false for DROP statements', () => {
            const query = 'DROP TABLE users';
            expect(validator.isSafe(query)).toBe(false);
        });

        it('should return false for TRUNCATE statements', () => {
            const query = 'TRUNCATE TABLE users';
            expect(validator.isSafe(query)).toBe(false);
        });

        it('should return false for ALTER statements', () => {
            const query = 'ALTER TABLE users ADD COLUMN password VARCHAR(255)';
            expect(validator.isSafe(query)).toBe(false);
        });

        it('should handle empty strings', () => {
            expect(validator.isSafe('')).toBe(false);
        });
    });

    describe('sanitize', () => {
        it('should remove comments from queries', () => {
            const query = 'SELECT * FROM users -- comment here';
            const result = validator.sanitize(query);

            expect(result).not.toContain('--');
            expect(result).toContain('SELECT');
        });

        it('should trim whitespace', () => {
            const query = '   SELECT * FROM users   ';
            const result = validator.sanitize(query);

            expect(result).toBe('SELECT * FROM users');
        });

        it('should handle multi-line queries', () => {
            const query = `
                SELECT *
                FROM users
                WHERE id = 1
            `;
            const result = validator.sanitize(query);

            expect(result).toContain('SELECT');
            expect(result).toContain('FROM users');
        });

        it('should preserve essential structure', () => {
            const query = 'SELECT id, name FROM users WHERE age > 25 ORDER BY name';
            const result = validator.sanitize(query);

            expect(result).toContain('SELECT');
            expect(result).toContain('FROM');
            expect(result).toContain('WHERE');
            expect(result).toContain('ORDER BY');
        });
    });

    describe('edge cases', () => {
        it('should handle very long queries', () => {
            const longQuery = 'SELECT ' + 'column, '.repeat(100) + 'id FROM users';
            const result = validator.validate(longQuery);

            expect(result).toBeDefined();
        });

        it('should handle queries with special characters', () => {
            const query = "SELECT * FROM users WHERE name = 'O\\'Brien'";
            const result = validator.validate(query);

            expect(result.isValid).toBe(true);
        });

        it('should handle case-insensitive SQL keywords', () => {
            const query = 'select * from USERS where ID = 1';
            const result = validator.validate(query);

            expect(result.isValid).toBe(true);
        });
    });

    describe('dangerous patterns', () => {
        it('should detect LOAD DATA INFILE', () => {
            const query = "LOAD DATA INFILE '/etc/passwd' INTO TABLE users";
            const result = validator.validate(query);

            expect(result.isValid).toBe(false);
        });

        it('should detect INTO OUTFILE', () => {
            const query = "SELECT * FROM users INTO OUTFILE '/tmp/output.txt'";
            const result = validator.validate(query);

            expect(result.warnings?.length).toBeGreaterThan(0);
        });

        it('should detect GRANT statements', () => {
            const query = 'GRANT ALL PRIVILEGES ON *.* TO "user"@"localhost"';
            const result = validator.validate(query);

            expect(result.isValid).toBe(false);
        });

        it('should detect CREATE USER', () => {
            const query = 'CREATE USER "hacker"@"%" IDENTIFIED BY "password"';
            const result = validator.validate(query);

            expect(result.isValid).toBe(false);
        });
    });
});
