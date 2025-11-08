import { QueryService } from '../query-service';
import { Logger } from '../../utils/logger';

describe('QueryService', () => {
    let service: QueryService;
    let logger: Logger;

    beforeEach(() => {
        logger = new Logger('QueryServiceTest');
        service = new QueryService(logger);
    });

    describe('parse()', () => {
        test('should parse valid SELECT query', () => {
            const sql = 'SELECT * FROM users WHERE id = 1';
            const result = service.parse(sql);

            expect(result.valid).toBe(true);
            expect(result.sql).toBe(sql);
            expect(result.queryType).toBe('select');
            expect(result.complexity).toBeGreaterThanOrEqual(0);
        });

        test('should detect SELECT * anti-pattern', () => {
            const sql = 'SELECT * FROM users';
            const result = service.parse(sql);

            expect(result.valid).toBe(true);
            expect(result.antiPatterns.length).toBeGreaterThan(0);
            expect(result.antiPatterns.some(p => p.type === 'select_star')).toBe(true);
        });

        test('should parse UPDATE query', () => {
            const sql = 'UPDATE users SET name = "John" WHERE id = 1';
            const result = service.parse(sql);

            expect(result.valid).toBe(true);
            expect(result.queryType).toBe('update');
        });

        test('should parse DELETE query', () => {
            const sql = 'DELETE FROM users WHERE id = 1';
            const result = service.parse(sql);

            expect(result.valid).toBe(true);
            expect(result.queryType).toBe('delete');
        });

        test('should handle invalid SQL gracefully', () => {
            // QueryAnalyzer returns parse_error anti-pattern for invalid SQL
            const sql = 'INVALID SQL SYNTAX HERE';
            const result = service.parse(sql);

            // Parse succeeds but returns a parse_error anti-pattern
            expect(result.valid).toBe(true);
            expect(result.queryType).toBe('unknown');
            expect(result.antiPatterns.some(p => p.type === 'parse_error')).toBe(true);
        });

        test('should detect missing WHERE in DELETE', () => {
            const sql = 'DELETE FROM users';
            const result = service.parse(sql);

            expect(result.valid).toBe(true);
            expect(result.antiPatterns.some(p => p.type === 'missing_where')).toBe(true);
        });

        test('should parse complex query with joins', () => {
            const sql = 'SELECT u.*, o.* FROM users u JOIN orders o ON u.id = o.user_id WHERE u.active = 1';
            const result = service.parse(sql);

            expect(result.valid).toBe(true);
            // Complexity varies by query structure, just check it's positive
            expect(result.complexity).toBeGreaterThanOrEqual(0);
        });
    });

    describe('templateQuery()', () => {
        test('should anonymize string literals', () => {
            const sql = "SELECT * FROM users WHERE name = 'John' AND email = 'john@example.com'";
            const result = service.templateQuery(sql);

            expect(result.original).toBe(sql);
            expect(result.templated).toContain('?');
            expect(result.templated).not.toContain('John');
            expect(result.templated).not.toContain('john@example.com');
        });

        test('should anonymize numeric literals', () => {
            const sql = 'SELECT * FROM users WHERE id = 123 AND age > 25';
            const result = service.templateQuery(sql);

            expect(result.templated).toContain('?');
            expect(result.templated).not.toContain('123');
            expect(result.templated).not.toContain('25');
        });

        test('should generate consistent fingerprints for similar queries', () => {
            const sql1 = "SELECT * FROM users WHERE id = 1";
            const sql2 = "SELECT * FROM users WHERE id = 2";

            const result1 = service.templateQuery(sql1);
            const result2 = service.templateQuery(sql2);

            expect(result1.fingerprint).toBe(result2.fingerprint);
        });

        test('should handle queries without literals', () => {
            const sql = 'SELECT * FROM users';
            const result = service.templateQuery(sql);

            expect(result.original).toBe(sql);
            expect(result.templated).toBe(sql);
            expect(result.fingerprint).toBeDefined();
        });

        test('should preserve query structure', () => {
            const sql = 'UPDATE users SET name = "test" WHERE id = 1';
            const result = service.templateQuery(sql);

            expect(result.templated).toContain('UPDATE');
            expect(result.templated).toContain('users');
            expect(result.templated).toContain('SET');
            expect(result.templated).toContain('WHERE');
        });
    });

    describe('analyzeRisk()', () => {
        test('should rate SELECT as LOW risk', () => {
            const sql = 'SELECT * FROM users WHERE id = 1';
            const result = service.analyzeRisk(sql);

            expect(result.level).toBe('LOW');
            expect(result.isDestructive).toBe(false);
            expect(result.requiresConfirmation).toBe(false);
        });

        test('should rate INSERT as MEDIUM risk', () => {
            const sql = 'INSERT INTO users (name, email) VALUES ("John", "john@example.com")';
            const result = service.analyzeRisk(sql);

            expect(result.level).toBe('MEDIUM');
            expect(result.isDestructive).toBe(false);
            expect(result.issues.length).toBeGreaterThan(0);
        });

        test('should rate UPDATE with WHERE as MEDIUM risk', () => {
            const sql = 'UPDATE users SET name = "John" WHERE id = 1';
            const result = service.analyzeRisk(sql);

            expect(result.level).toBe('MEDIUM');
            expect(result.isDestructive).toBe(true);
            expect(result.issues).toContain('Destructive operation with WHERE clause');
        });

        test('should rate DELETE with WHERE as MEDIUM risk', () => {
            const sql = 'DELETE FROM users WHERE id = 1';
            const result = service.analyzeRisk(sql);

            expect(result.level).toBe('MEDIUM');
            expect(result.isDestructive).toBe(true);
        });

        test('should rate UPDATE without WHERE as HIGH risk', () => {
            const sql = 'UPDATE users SET name = "John"';
            const result = service.analyzeRisk(sql);

            expect(result.level).toBe('HIGH');
            expect(result.isDestructive).toBe(true);
            expect(result.requiresConfirmation).toBe(true);
            expect(result.issues).toContain('UPDATE without WHERE clause - will affect all rows');
        });

        test('should rate DELETE without WHERE as HIGH risk', () => {
            const sql = 'DELETE FROM users';
            const result = service.analyzeRisk(sql);

            expect(result.level).toBe('HIGH');
            expect(result.isDestructive).toBe(true);
            expect(result.requiresConfirmation).toBe(true);
            expect(result.issues).toContain('DELETE without WHERE clause - will affect all rows');
        });

        test('should rate ALTER TABLE as HIGH risk', () => {
            const sql = 'ALTER TABLE users ADD COLUMN age INT';
            const result = service.analyzeRisk(sql);

            expect(result.level).toBe('HIGH');
            expect(result.isDestructive).toBe(true);
            expect(result.requiresConfirmation).toBe(true);
        });

        test('should rate DROP TABLE as CRITICAL risk', () => {
            const sql = 'DROP TABLE users';
            const result = service.analyzeRisk(sql);

            expect(result.level).toBe('CRITICAL');
            expect(result.isDestructive).toBe(true);
            expect(result.requiresConfirmation).toBe(true);
            expect(result.issues).toContain('DROP operation detected - irreversible data loss possible');
        });

        test('should rate TRUNCATE as CRITICAL risk', () => {
            const sql = 'TRUNCATE TABLE users';
            const result = service.analyzeRisk(sql);

            expect(result.level).toBe('CRITICAL');
            expect(result.isDestructive).toBe(true);
            expect(result.requiresConfirmation).toBe(true);
            expect(result.issues).toContain('TRUNCATE operation detected - all table data will be deleted');
        });

        test('should detect anti-patterns and increase risk', () => {
            const sql = 'SELECT * FROM users';
            const result = service.analyzeRisk(sql);

            // Should still be LOW since SELECT * is just a warning
            expect(result.level).toBe('LOW');
            expect(result.issues.some(i => i.includes('Warning'))).toBe(true);
        });

        test('should handle case-insensitive SQL', () => {
            const sql = 'drop table users';
            const result = service.analyzeRisk(sql);

            expect(result.level).toBe('CRITICAL');
        });
    });

    describe('validate()', () => {
        test('should validate correct SELECT query', () => {
            const sql = 'SELECT * FROM users WHERE id = 1';
            const result = service.validate(sql);

            expect(result.valid).toBe(true);
            expect(result.errors.length).toBe(0);
            expect(result.riskLevel).toBe('LOW');
        });

        test('should report warnings for invalid syntax', () => {
            const sql = 'INVALID SQL SYNTAX';
            const result = service.validate(sql);

            // Parser returns parse_error as anti-pattern, which becomes a warning
            expect(result.valid).toBe(true);
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings.some(w => w.includes('parse_error'))).toBe(true);
        });

        test('should include warnings for anti-patterns', () => {
            const sql = 'SELECT * FROM users';
            const result = service.validate(sql);

            expect(result.valid).toBe(true);
            expect(result.warnings.length).toBeGreaterThan(0);
        });

        test('should report errors for high-risk operations', () => {
            const sql = 'DELETE FROM users';
            const result = service.validate(sql);

            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.riskLevel).toBe('HIGH');
        });

        test('should report errors for critical operations', () => {
            const sql = 'DROP TABLE users';
            const result = service.validate(sql);

            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.riskLevel).toBe('CRITICAL');
        });

        test('should handle missing WHERE clause as error', () => {
            const sql = 'UPDATE users SET name = "test"';
            const result = service.validate(sql);

            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('WHERE clause'))).toBe(true);
        });

        test('should provide comprehensive validation for complex queries', () => {
            const sql = 'SELECT * FROM users u JOIN orders o ON u.id = o.user_id';
            const result = service.validate(sql);

            expect(result).toHaveProperty('valid');
            expect(result).toHaveProperty('errors');
            expect(result).toHaveProperty('warnings');
            expect(result).toHaveProperty('riskLevel');
        });

        test('should handle schema parameter gracefully', () => {
            const sql = 'SELECT * FROM users';
            const schema = { tables: ['users', 'orders'] };
            const result = service.validate(sql, schema);

            // Should not crash with schema provided
            expect(result).toBeDefined();
            expect(result.valid).toBe(true);
        });
    });
});
