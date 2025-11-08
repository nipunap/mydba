import { DataSanitizer } from '../data-sanitizer';
import { ConnectionConfig } from '../../types';

describe('DataSanitizer', () => {
    describe('sanitizeConnectionConfig', () => {
        const mockConfig: ConnectionConfig = {
            id: 'test-1',
            name: 'Test Connection',
            type: 'mysql',
            host: 'db.example.com',
            port: 3306,
            user: 'myuser',
            password: 'secretpassword',
            database: 'testdb',
            environment: 'prod',
            ssl: { rejectUnauthorized: true },
            ssh: { host: 'ssh.example.com', port: 22, user: 'sshuser', privateKey: 'keydata' },
            awsIamAuth: { region: 'us-east-1' }
        };

        it('should mask password', () => {
            const sanitized = DataSanitizer.sanitizeConnectionConfig(mockConfig);
            expect(sanitized.password).toBe('***');
        });

        it('should mask sensitive host data', () => {
            const sanitized = DataSanitizer.sanitizeConnectionConfig(mockConfig);
            expect(sanitized.host).toBe('***.com');
        });

        it('should mask username', () => {
            const sanitized = DataSanitizer.sanitizeConnectionConfig(mockConfig);
            expect(sanitized.user).toBe('m***r');
        });

        it('should keep non-sensitive fields', () => {
            const sanitized = DataSanitizer.sanitizeConnectionConfig(mockConfig);
            expect(sanitized.id).toBe('test-1');
            expect(sanitized.name).toBe('Test Connection');
            expect(sanitized.type).toBe('mysql');
            expect(sanitized.port).toBe(3306);
            expect(sanitized.database).toBe('testdb');
            expect(sanitized.environment).toBe('prod');
        });

        it('should indicate SSL is enabled without details', () => {
            const sanitized = DataSanitizer.sanitizeConnectionConfig(mockConfig);
            expect(sanitized.ssl).toEqual({ enabled: true });
        });

        it('should indicate SSH is enabled without details', () => {
            const sanitized = DataSanitizer.sanitizeConnectionConfig(mockConfig);
            expect(sanitized.ssh).toEqual({ enabled: true });
        });

        it('should indicate AWS IAM is enabled without details', () => {
            const sanitized = DataSanitizer.sanitizeConnectionConfig(mockConfig);
            expect(sanitized.awsIamAuth).toEqual({ enabled: true });
        });

        it('should handle config without password', () => {
            const configNoPassword = { ...mockConfig, password: undefined };
            const sanitized = DataSanitizer.sanitizeConnectionConfig(configNoPassword);
            expect(sanitized.password).toBeUndefined();
        });
    });

    describe('maskUsername', () => {
        it('should mask username with first and last char visible', () => {
            expect(DataSanitizer.maskUsername('johnsmith')).toBe('j***h');
            expect(DataSanitizer.maskUsername('alice')).toBe('a***e');
        });

        it('should fully mask short usernames', () => {
            expect(DataSanitizer.maskUsername('ab')).toBe('***');
            expect(DataSanitizer.maskUsername('x')).toBe('***');
        });

        it('should handle empty string', () => {
            expect(DataSanitizer.maskUsername('')).toBe('***');
        });
    });

    describe('maskSensitiveData', () => {
        it('should mask hostnames but keep last chars', () => {
            expect(DataSanitizer.maskSensitiveData('db.example.com')).toBe('***.com');
            expect(DataSanitizer.maskSensitiveData('api.production.server.com')).toBe('***.com');
        });

        it('should keep localhost unchanged', () => {
            expect(DataSanitizer.maskSensitiveData('localhost')).toBe('localhost');
            expect(DataSanitizer.maskSensitiveData('127.0.0.1')).toBe('127.0.0.1');
        });

        it('should fully mask short strings', () => {
            expect(DataSanitizer.maskSensitiveData('abc', 4)).toBe('***');
        });

        it('should respect showLastChars parameter', () => {
            expect(DataSanitizer.maskSensitiveData('example.com', 6)).toBe('***le.com'); // Last 6 chars of "example.com"
            expect(DataSanitizer.maskSensitiveData('example.com', 3)).toBe('***com');
        });

        it('should handle empty string', () => {
            expect(DataSanitizer.maskSensitiveData('')).toBe('');
        });
    });

    describe('sanitizeSQL', () => {
        it('should mask passwords in SQL', () => {
            const sql = "CREATE USER 'user'@'host' IDENTIFIED BY password='secret123'";
            expect(DataSanitizer.sanitizeSQL(sql)).toContain("password='***'");
        });

        it('should mask pwd field', () => {
            const sql = "SET pwd='mypassword'";
            expect(DataSanitizer.sanitizeSQL(sql)).toContain("pwd='***'");
        });

        it('should mask email addresses', () => {
            const sql = "SELECT * FROM users WHERE email = 'john@example.com'";
            const sanitized = DataSanitizer.sanitizeSQL(sql);
            expect(sanitized).toContain('***@***.***');
            expect(sanitized).not.toContain('john@example.com');
        });

        it('should mask SSN', () => {
            const sql = "INSERT INTO users (ssn) VALUES ('123-45-6789')";
            const sanitized = DataSanitizer.sanitizeSQL(sql);
            expect(sanitized).toContain('XXX-XX-XXXX');
            expect(sanitized).not.toContain('123-45-6789');
        });

        it('should mask credit card numbers', () => {
            const sql = "SELECT * FROM payments WHERE cc = '1234-5678-9012-3456'";
            const sanitized = DataSanitizer.sanitizeSQL(sql);
            expect(sanitized).toContain('XXXX-XXXX-XXXX-XXXX');
            expect(sanitized).not.toContain('1234-5678-9012-3456');
        });

        it('should mask phone numbers', () => {
            const sql = "SELECT * FROM contacts WHERE phone = '555-123-4567'";
            const sanitized = DataSanitizer.sanitizeSQL(sql);
            expect(sanitized).toContain('XXX-XXX-XXXX');
            expect(sanitized).not.toContain('555-123-4567');
        });

        it('should mask public IP addresses', () => {
            const sql = "SELECT * FROM logs WHERE ip = '8.8.8.8'";
            const sanitized = DataSanitizer.sanitizeSQL(sql);
            expect(sanitized).toContain('XXX.XXX.XXX.XXX');
        });

        it('should keep local IP addresses', () => {
            expect(DataSanitizer.sanitizeSQL('192.168.1.1')).toContain('192.168.1.1');
            expect(DataSanitizer.sanitizeSQL('10.0.0.1')).toContain('10.0.0.1');
            expect(DataSanitizer.sanitizeSQL('127.0.0.1')).toContain('127.0.0.1');
        });

        it('should mask long string literals', () => {
            const longString = "'" + 'x'.repeat(60) + "'";
            const sql = `SELECT * FROM data WHERE value = ${longString}`;
            const sanitized = DataSanitizer.sanitizeSQL(sql);
            expect(sanitized).not.toContain(longString);
            expect(sanitized).toContain("'***'");
        });

        it('should keep short strings unchanged', () => {
            const sql = "SELECT 'hello'";
            const sanitized = DataSanitizer.sanitizeSQL(sql);
            expect(sanitized).toContain("'hello'");
        });
    });

    describe('anonymizeQueryForAI', () => {
        it('should replace string literals with placeholder', () => {
            const sql = "SELECT * FROM users WHERE name = 'John'";
            const anonymized = DataSanitizer.anonymizeQueryForAI(sql);
            expect(anonymized).toContain('<string>');
            expect(anonymized).not.toContain('John');
        });

        it('should replace numbers with placeholder', () => {
            const sql = "SELECT * FROM products WHERE price > 100";
            const anonymized = DataSanitizer.anonymizeQueryForAI(sql);
            expect(anonymized).toContain('<number>');
            expect(anonymized).not.toContain('100');
        });

        it('should keep SQL keywords', () => {
            const sql = "SELECT id FROM users WHERE active = 1";
            const anonymized = DataSanitizer.anonymizeQueryForAI(sql);
            expect(anonymized).toContain('SELECT');
            expect(anonymized).toContain('FROM');
            expect(anonymized).toContain('WHERE');
        });
    });

    describe('templateQueryForAI', () => {
        it('should replace ? placeholders with typed placeholders', () => {
            const sql = "SELECT * FROM users WHERE id = ?";
            const templated = DataSanitizer.templateQueryForAI(sql, [123]);
            expect(templated).toContain('<number>');
            expect(templated).not.toContain('?');
        });

        it('should identify string parameters', () => {
            const sql = "SELECT * FROM users WHERE name = ?";
            const templated = DataSanitizer.templateQueryForAI(sql, ['John']);
            expect(templated).toContain('<string>');
        });

        it('should identify date parameters', () => {
            const sql = "SELECT * FROM events WHERE date = ?";
            const templated = DataSanitizer.templateQueryForAI(sql, ['2024-01-01']);
            expect(templated).toContain('<date>');
        });

        it('should identify email parameters', () => {
            const sql = "SELECT * FROM users WHERE email = ?";
            const templated = DataSanitizer.templateQueryForAI(sql, ['user@example.com']);
            expect(templated).toContain('<email>');
        });

        it('should identify null parameters', () => {
            const sql = "SELECT * FROM users WHERE deleted = ?";
            const templated = DataSanitizer.templateQueryForAI(sql, [null]);
            expect(templated).toContain('<null>');
        });

        it('should identify boolean parameters', () => {
            const sql = "SELECT * FROM users WHERE active = ?";
            const templated = DataSanitizer.templateQueryForAI(sql, [true]);
            expect(templated).toContain('<boolean>');
        });

        it('should identify array parameters', () => {
            const sql = "SELECT * FROM users WHERE id IN (?)";
            const templated = DataSanitizer.templateQueryForAI(sql, [[1, 2, 3]]);
            expect(templated).toContain('<array>');
        });

        it('should template table names', () => {
            const sql = "SELECT * FROM users";
            const templated = DataSanitizer.templateQueryForAI(sql);
            expect(templated).toContain('<table:users>');
        });

        it('should template column names', () => {
            const sql = "SELECT id, name FROM users";
            const templated = DataSanitizer.templateQueryForAI(sql);
            expect(templated).toContain('<col:id>');
            expect(templated).toContain('<col:name>');
        });
    });

    describe('sanitizeErrorMessage', () => {
        it('should mask file paths (Unix)', () => {
            const error = new Error('Error in /usr/local/bin/myapp.js');
            const sanitized = DataSanitizer.sanitizeErrorMessage(error);
            expect(sanitized).toContain('[path]');
            expect(sanitized).not.toContain('/usr/local/bin/myapp.js');
        });

        it('should mask file paths (Windows)', () => {
            const message = 'Error in C:\\Program Files\\MyApp\\app.exe';
            const sanitized = DataSanitizer.sanitizeErrorMessage(message);
            expect(sanitized).toContain('[path]');
            expect(sanitized).not.toContain('C:\\Program Files\\MyApp\\app.exe');
        });

        it('should mask MySQL connection strings', () => {
            const message = 'Connection failed: mysql://user:pass@localhost/db';
            const sanitized = DataSanitizer.sanitizeErrorMessage(message);
            // File paths are also sanitized, so connection strings get partially masked
            expect(sanitized).toContain('[path]');
            expect(sanitized).not.toContain('user:pass');
            expect(sanitized).not.toContain('mysql://user:pass@localhost/db'); // Original shouldn't be present
        });

        it('should mask PostgreSQL connection strings', () => {
            const message = 'Connection failed: postgresql://user:pass@localhost/db';
            const sanitized = DataSanitizer.sanitizeErrorMessage(message);
            // File paths are also sanitized, so connection strings get partially masked
            expect(sanitized).toContain('[path]');
            expect(sanitized).not.toContain('user:pass');
            expect(sanitized).not.toContain('postgresql://user:pass@localhost/db'); // Original shouldn't be present
        });

        it('should mask passwords', () => {
            const message = 'Auth failed with password=secret123';
            const sanitized = DataSanitizer.sanitizeErrorMessage(message);
            expect(sanitized).toContain('password=***');
            expect(sanitized).not.toContain('secret123');
        });

        it('should mask API keys and tokens', () => {
            const message = 'Invalid token: abc123def456ghi789jkl012mno345pqr678';
            const sanitized = DataSanitizer.sanitizeErrorMessage(message);
            expect(sanitized).toContain('***');
            expect(sanitized).not.toContain('abc123def456ghi789jkl012mno345pqr678');
        });

        it('should handle string input', () => {
            const sanitized = DataSanitizer.sanitizeErrorMessage('Error: password=test123');
            expect(sanitized).toContain('password=***');
        });
    });

    describe('sanitizeQueryResults', () => {
        it('should return empty array unchanged', () => {
            const results = DataSanitizer.sanitizeQueryResults([]);
            expect(results).toEqual([]);
        });

        it('should mask explicitly specified sensitive columns', () => {
            const results = [
                { id: 1, name: 'John', secret_data: 'confidential' }
            ];
            const sanitized = DataSanitizer.sanitizeQueryResults(results, ['secret_data']);
            expect(sanitized[0].secret_data).toBe('***');
            expect(sanitized[0].name).toBe('John');
        });

        it('should auto-detect and mask password fields', () => {
            const results = [
                { id: 1, username: 'john', password: 'secret123' }
            ];
            const sanitized = DataSanitizer.sanitizeQueryResults(results);
            expect(sanitized[0].password).toBe('***');
            expect(sanitized[0].username).toBe('john');
        });

        it('should auto-detect and mask various sensitive field names', () => {
            const results = [{
                id: 1,
                pwd: 'pass',
                secret: 'secret',
                token: 'token123',
                api_key: 'key123',
                credit_card: '1234',
                ssn: '123-45-6789'
            }];
            const sanitized = DataSanitizer.sanitizeQueryResults(results);
            expect(sanitized[0].pwd).toBe('***');
            expect(sanitized[0].secret).toBe('***');
            expect(sanitized[0].token).toBe('***');
            expect(sanitized[0].api_key).toBe('***');
            expect(sanitized[0].credit_card).toBe('***');
            expect(sanitized[0].ssn).toBe('***');
        });

        it('should not modify original results', () => {
            const results = [{ id: 1, password: 'secret' }];
            const original = JSON.parse(JSON.stringify(results));
            DataSanitizer.sanitizeQueryResults(results);
            expect(results).toEqual(original);
        });
    });

    describe('stripAnsiCodes', () => {
        it('should remove ANSI color codes', () => {
            const colored = '\x1b[31mRed text\x1b[0m';
            const stripped = DataSanitizer.stripAnsiCodes(colored);
            expect(stripped).toBe('Red text');
            expect(stripped).not.toContain('\x1b');
        });

        it('should remove multiple color codes', () => {
            const colored = '\x1b[32mGreen\x1b[0m and \x1b[34mBlue\x1b[0m';
            const stripped = DataSanitizer.stripAnsiCodes(colored);
            expect(stripped).toBe('Green and Blue');
        });

        it('should handle string without ANSI codes', () => {
            const plain = 'Plain text';
            const stripped = DataSanitizer.stripAnsiCodes(plain);
            expect(stripped).toBe('Plain text');
        });
    });

    describe('truncate', () => {
        it('should truncate long strings', () => {
            const long = 'a'.repeat(200);
            const truncated = DataSanitizer.truncate(long, 50);
            expect(truncated).toHaveLength(50);
            expect(truncated.endsWith('...')).toBe(true);
        });

        it('should not truncate short strings', () => {
            const short = 'Hello World';
            const result = DataSanitizer.truncate(short, 50);
            expect(result).toBe('Hello World');
        });

        it('should use default max length of 100', () => {
            const long = 'a'.repeat(200);
            const truncated = DataSanitizer.truncate(long);
            expect(truncated).toHaveLength(100);
        });

        it('should use custom suffix', () => {
            const long = 'a'.repeat(200);
            const truncated = DataSanitizer.truncate(long, 50, ' [more]');
            expect(truncated.endsWith(' [more]')).toBe(true);
            expect(truncated).toHaveLength(50);
        });

        it('should handle strings exactly at max length', () => {
            const exact = 'a'.repeat(50);
            const result = DataSanitizer.truncate(exact, 50);
            expect(result).toBe(exact);
        });
    });
});
