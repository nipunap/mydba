import { SQLValidator } from '../sql-validator';
import { Logger } from '../../utils/logger';

describe('SQLValidator', () => {
    let validator: SQLValidator;
    let mockLogger: Logger;

    beforeEach(() => {
        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn()
        } as unknown as Logger;
        validator = new SQLValidator(mockLogger);
    });

    describe('validate', () => {
        it('should allow safe SELECT queries', () => {
            const query = 'SELECT * FROM users WHERE id = 1';
            const result = validator.validate(query);

            expect(result.valid).toBe(true);
            expect(result.issues).toHaveLength(0);
        });

        it('should allow safe INSERT queries', () => {
            const query = 'INSERT INTO users (name, email) VALUES ("John", "john@example.com")';
            const result = validator.validate(query);

            expect(result.valid).toBe(true);
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

            expect(result.valid).toBe(false);
            expect(result.issues?.length).toBeGreaterThan(0);
        });

        it('should reject queries with only whitespace', () => {
            const query = '   \n\t  ';
            const result = validator.validate(query);

            expect(result.valid).toBe(false);
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
            expect(result.valid).toBe(true);
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

            expect(result.valid).toBe(true);
        });

        it('should handle case-insensitive SQL keywords', () => {
            const query = 'select * from USERS where ID = 1';
            const result = validator.validate(query);

            expect(result.valid).toBe(true);
        });
    });

    describe('dangerous patterns', () => {
        it('should detect LOAD DATA INFILE', () => {
            const query = "LOAD DATA INFILE '/etc/passwd' INTO TABLE users";
            const result = validator.validate(query);

            expect(result.valid).toBe(false);
        });

        it('should detect INTO OUTFILE', () => {
            const query = "SELECT * FROM users INTO OUTFILE '/tmp/output.txt'";
            const result = validator.validate(query);

            expect(result.warnings?.length).toBeGreaterThan(0);
        });

        it('should detect GRANT statements', () => {
            const query = 'GRANT ALL PRIVILEGES ON *.* TO "user"@"localhost"';
            const result = validator.validate(query);

            expect(result.valid).toBe(false);
        });

        it('should detect CREATE USER', () => {
            const query = 'CREATE USER "hacker"@"%" IDENTIFIED BY "password"';
            const result = validator.validate(query);

            expect(result.valid).toBe(false);
        });
    });
});
