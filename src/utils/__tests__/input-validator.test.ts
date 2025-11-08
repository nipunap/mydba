import { InputValidator } from '../input-validator';

describe('InputValidator', () => {
  describe('validatePort', () => {
    it('should accept valid port numbers', () => {
      expect(InputValidator.validatePort('3306')).toEqual({ valid: true, value: 3306 });
      expect(InputValidator.validatePort('1')).toEqual({ valid: true, value: 1 });
      expect(InputValidator.validatePort('65535')).toEqual({ valid: true, value: 65535 });
      expect(InputValidator.validatePort('8080')).toEqual({ valid: true, value: 8080 });
    });

    it('should reject invalid port numbers', () => {
      expect(InputValidator.validatePort('0')).toEqual({ valid: false, error: 'Port must be between 1 and 65535' });
      expect(InputValidator.validatePort('65536')).toEqual({ valid: false, error: 'Port must be between 1 and 65535' });
      expect(InputValidator.validatePort('-1')).toEqual({ valid: false, error: 'Port must be between 1 and 65535' });
      expect(InputValidator.validatePort('abc')).toEqual({ valid: false, error: 'Port must be a valid number' });
      expect(InputValidator.validatePort('')).toEqual({ valid: false, error: 'Port must be a valid number' });
    });
  });

  describe('validateHostname', () => {
    it('should accept valid hostnames', () => {
      expect(InputValidator.validateHostname('localhost')).toEqual({ valid: true });
      expect(InputValidator.validateHostname('127.0.0.1')).toEqual({ valid: true });
      expect(InputValidator.validateHostname('192.168.1.1')).toEqual({ valid: true });
      expect(InputValidator.validateHostname('example.com')).toEqual({ valid: true });
      expect(InputValidator.validateHostname('sub.example.com')).toEqual({ valid: true });
      expect(InputValidator.validateHostname('my-server')).toEqual({ valid: true });
    });

    it('should reject invalid hostnames', () => {
      expect(InputValidator.validateHostname('')).toEqual({ valid: false, error: 'Hostname cannot be empty' });
      expect(InputValidator.validateHostname('   ')).toEqual({ valid: false, error: 'Hostname cannot be empty' });
      expect(InputValidator.validateHostname('invalid..hostname')).toEqual({ valid: false, error: 'Invalid hostname or IP address format' });
      expect(InputValidator.validateHostname('-invalid')).toEqual({ valid: false, error: 'Invalid hostname or IP address format' });
      expect(InputValidator.validateHostname('invalid-')).toEqual({ valid: false, error: 'Invalid hostname or IP address format' });
    });

    it('should accept IPv6 addresses', () => {
      expect(InputValidator.validateHostname('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toEqual({ valid: true });
    });
  });

  describe('validateUsername', () => {
    it('should accept valid usernames', () => {
      expect(InputValidator.validateUsername('root')).toEqual({ valid: true });
      expect(InputValidator.validateUsername('admin')).toEqual({ valid: true });
      expect(InputValidator.validateUsername('user123')).toEqual({ valid: true });
      expect(InputValidator.validateUsername('user-name')).toEqual({ valid: true });
    });

    it('should reject invalid usernames', () => {
      expect(InputValidator.validateUsername('')).toEqual({ valid: false, error: 'Username cannot be empty' });
      expect(InputValidator.validateUsername('   ')).toEqual({ valid: false, error: 'Username cannot be empty' });
      expect(InputValidator.validateUsername('a'.repeat(256))).toEqual({ valid: false, error: 'Username is too long (max 255 characters)' });
      expect(InputValidator.validateUsername('user<name')).toEqual({ valid: false, error: 'Username contains invalid characters' });
      expect(InputValidator.validateUsername('user>name')).toEqual({ valid: false, error: 'Username contains invalid characters' });
      expect(InputValidator.validateUsername('user"name')).toEqual({ valid: false, error: 'Username contains invalid characters' });
      expect(InputValidator.validateUsername("user'name")).toEqual({ valid: false, error: 'Username contains invalid characters' });
    });
  });

  describe('validateDatabaseName', () => {
    it('should accept valid database names', () => {
      expect(InputValidator.validateDatabaseName('testdb')).toEqual({ valid: true });
      expect(InputValidator.validateDatabaseName('my_database')).toEqual({ valid: true });
      expect(InputValidator.validateDatabaseName('DB123')).toEqual({ valid: true });
      expect(InputValidator.validateDatabaseName('$db')).toEqual({ valid: true });
    });

    it('should reject invalid database names', () => {
      expect(InputValidator.validateDatabaseName('')).toEqual({ valid: false, error: 'Database name cannot be empty' });
      expect(InputValidator.validateDatabaseName('   ')).toEqual({ valid: false, error: 'Database name cannot be empty' });
      expect(InputValidator.validateDatabaseName('a'.repeat(65))).toEqual({ valid: false, error: 'Database name is too long (max 64 characters)' });
      expect(InputValidator.validateDatabaseName('my-database')).toEqual({ valid: false, error: 'Database name contains invalid characters (only alphanumeric, underscore, and $ allowed)' });
      expect(InputValidator.validateDatabaseName('my.database')).toEqual({ valid: false, error: 'Database name contains invalid characters (only alphanumeric, underscore, and $ allowed)' });
    });
  });

  describe('validateConnectionConfig', () => {
    const validConfig = {
      name: 'Test Connection',
      type: 'mysql' as const,
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: 'password',
      database: 'testdb',
      environment: 'dev' as const
    };

    it('should accept valid connection config', () => {
      const result = InputValidator.validateConnectionConfig(validConfig);
      expect(result.valid).toBe(true);
      expect(result.value).toEqual(validConfig);
    });

    it('should reject config without name', () => {
      const config = { ...validConfig, name: '' };
      expect(InputValidator.validateConnectionConfig(config)).toEqual({ valid: false, error: 'Connection name is required' });
    });

    it('should reject config with invalid database type', () => {
      const config = { ...validConfig, type: 'invalid' as never };
      expect(InputValidator.validateConnectionConfig(config)).toEqual({ valid: false, error: 'Invalid database type' });
    });

    it('should reject config with invalid host', () => {
      const config = { ...validConfig, host: '' };
      expect(InputValidator.validateConnectionConfig(config)).toEqual({ valid: false, error: 'Hostname cannot be empty' });
    });

    it('should reject config with invalid port', () => {
      const config = { ...validConfig, port: 0 };
      expect(InputValidator.validateConnectionConfig(config)).toEqual({ valid: false, error: 'Port must be between 1 and 65535' });
    });

    it('should reject config with invalid user', () => {
      const config = { ...validConfig, user: '' };
      expect(InputValidator.validateConnectionConfig(config)).toEqual({ valid: false, error: 'Username cannot be empty' });
    });

    it('should reject config with invalid database name', () => {
      const config = { ...validConfig, database: 'invalid-db' };
      expect(InputValidator.validateConnectionConfig(config)).toEqual({ valid: false, error: 'Database name contains invalid characters (only alphanumeric, underscore, and $ allowed)' });
    });

    it('should reject config with invalid environment', () => {
      const config = { ...validConfig, environment: 'invalid' as never };
      expect(InputValidator.validateConnectionConfig(config)).toEqual({ valid: false, error: 'Invalid environment (must be dev, staging, or prod)' });
    });

    it('should accept config without database name', () => {
      const config = { ...validConfig, database: undefined };
      const result = InputValidator.validateConnectionConfig(config);
      expect(result.valid).toBe(true);
    });
  });

  describe('sanitizeIdentifier', () => {
    it('should remove invalid characters', () => {
      expect(InputValidator.sanitizeIdentifier('valid_identifier')).toBe('valid_identifier');
      expect(InputValidator.sanitizeIdentifier('my-table')).toBe('mytable');
      expect(InputValidator.sanitizeIdentifier('table.name')).toBe('tablename');
      expect(InputValidator.sanitizeIdentifier('table name')).toBe('tablename');
      expect(InputValidator.sanitizeIdentifier('table@name')).toBe('tablename');
      expect(InputValidator.sanitizeIdentifier('$column')).toBe('$column');
    });

    it('should allow alphanumeric, underscore, and dollar sign', () => {
      expect(InputValidator.sanitizeIdentifier('abc123_$')).toBe('abc123_$');
      expect(InputValidator.sanitizeIdentifier('ABC_123')).toBe('ABC_123');
    });
  });

  describe('escapeIdentifier', () => {
    it('should wrap identifier in backticks', () => {
      expect(InputValidator.escapeIdentifier('tablename')).toBe('`tablename`');
      expect(InputValidator.escapeIdentifier('my_table')).toBe('`my_table`');
    });

    it('should sanitize before escaping', () => {
      expect(InputValidator.escapeIdentifier('my-table')).toBe('`mytable`');
      expect(InputValidator.escapeIdentifier('table name')).toBe('`tablename`');
    });

    it('should escape backticks in identifier', () => {
      expect(InputValidator.escapeIdentifier('table`name')).toBe('`tablename`');
    });
  });

  describe('hasSQLInjectionPattern', () => {
    it('should allow Performance Schema SELECT', () => {
      const sql = `SELECT COUNT(*) as disabled_count
                   FROM performance_schema.setup_consumers
                   WHERE NAME LIKE '%statements%' AND ENABLED = 'NO'`;
      expect(InputValidator.hasSQLInjectionPattern(sql)).toBe(false);
    });

    it('should allow column names containing exec', () => {
      const sql = `SELECT sum_rows_examined FROM performance_schema.events_statements_summary_by_digest`;
      expect(InputValidator.hasSQLInjectionPattern(sql)).toBe(false);
    });

    it('should block EXEC xp_cmdshell', () => {
      const sql = `EXEC xp_cmdshell 'dir'`;
      expect(InputValidator.hasSQLInjectionPattern(sql)).toBe(true);
    });

    it('should block EXECUTE sp_executesql', () => {
      const sql = `EXECUTE sp_executesql N'SELECT 1'`;
      expect(InputValidator.hasSQLInjectionPattern(sql)).toBe(true);
    });

    it('should block CONCAT-based injection', () => {
      const sql = `SELECT CONCAT('a', CHAR(39), 'b')`;
      expect(InputValidator.hasSQLInjectionPattern(sql)).toBe(true);
    });

    it('should block UNION SELECT', () => {
      const sql = `SELECT * FROM users UNION SELECT password FROM admin`;
      expect(InputValidator.hasSQLInjectionPattern(sql)).toBe(true);
    });

    it('should block DROP TABLE', () => {
      const sql = `DROP TABLE users`;
      expect(InputValidator.hasSQLInjectionPattern(sql)).toBe(true);
    });

    it('should block SQL comments', () => {
      expect(InputValidator.hasSQLInjectionPattern(`SELECT * FROM users -- comment`)).toBe(true);
      expect(InputValidator.hasSQLInjectionPattern(`SELECT * FROM users /* comment */`)).toBe(true);
    });

    it('should block template literals', () => {
      expect(InputValidator.hasSQLInjectionPattern(`SELECT * FROM \${table}`)).toBe(true);
      expect(InputValidator.hasSQLInjectionPattern(`SELECT * FROM $table`)).toBe(true);
    });

    it('should block OR-based injection', () => {
      expect(InputValidator.hasSQLInjectionPattern(`SELECT * FROM users WHERE id = '1' or '1'='1'`)).toBe(true);
    });

    it('should block INSERT/UPDATE/DELETE by default', () => {
      expect(InputValidator.hasSQLInjectionPattern(`INSERT INTO users VALUES (1, 'test')`)).toBe(true);
      expect(InputValidator.hasSQLInjectionPattern(`UPDATE users SET name = 'test'`)).toBe(true);
      expect(InputValidator.hasSQLInjectionPattern(`DELETE FROM users`)).toBe(true);
    });

    it('should allow INSERT/UPDATE/DELETE when allowDataModification is true', () => {
      expect(InputValidator.hasSQLInjectionPattern(`INSERT INTO users VALUES (?, ?)`, true)).toBe(false);
      expect(InputValidator.hasSQLInjectionPattern(`UPDATE users SET name = ? WHERE id = ?`, true)).toBe(false);
      expect(InputValidator.hasSQLInjectionPattern(`DELETE FROM users WHERE id = ?`, true)).toBe(false);
    });
  });

  describe('isParameterizedQuery', () => {
    it('should accept properly parameterized queries', () => {
      expect(InputValidator.isParameterizedQuery('SELECT * FROM users WHERE id = ?', [1])).toEqual({ valid: true });
      expect(InputValidator.isParameterizedQuery('INSERT INTO users (name, email) VALUES (?, ?)', ['John', 'john@example.com'])).toEqual({ valid: true });
      expect(InputValidator.isParameterizedQuery('SELECT * FROM users', [])).toEqual({ valid: true });
    });

    it('should reject queries with template literals', () => {
      const result = InputValidator.isParameterizedQuery('SELECT * FROM ${table}', []);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('template literal');
    });

    it('should reject queries with mismatched parameter count', () => {
      const result = InputValidator.isParameterizedQuery('SELECT * FROM users WHERE id = ?', []);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Parameter count mismatch');
    });

    it('should reject queries with SQL injection patterns', () => {
      const result = InputValidator.isParameterizedQuery('SELECT * FROM users UNION SELECT * FROM admin', []);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('dangerous SQL patterns');
    });

    it('should accept parameterized data modification queries', () => {
      expect(InputValidator.isParameterizedQuery('INSERT INTO users VALUES (?, ?)', ['test', 'test@example.com'])).toEqual({ valid: true });
      expect(InputValidator.isParameterizedQuery('UPDATE users SET name = ? WHERE id = ?', ['John', 1])).toEqual({ valid: true });
      expect(InputValidator.isParameterizedQuery('DELETE FROM users WHERE id = ?', [1])).toEqual({ valid: true });
    });
  });

  describe('hasWhereClause', () => {
    it('should detect WHERE clause in DELETE queries', () => {
      expect(InputValidator.hasWhereClause('DELETE FROM users WHERE id = 1')).toBe(true);
      expect(InputValidator.hasWhereClause('DELETE FROM users')).toBe(false);
    });

    it('should detect WHERE clause in UPDATE queries', () => {
      expect(InputValidator.hasWhereClause('UPDATE users SET name = "John" WHERE id = 1')).toBe(true);
      expect(InputValidator.hasWhereClause('UPDATE users SET name = "John"')).toBe(false);
    });

    it('should return true for non-DELETE/UPDATE queries', () => {
      expect(InputValidator.hasWhereClause('SELECT * FROM users')).toBe(true);
      expect(InputValidator.hasWhereClause('INSERT INTO users VALUES (1, "John")')).toBe(true);
    });

    it('should be case insensitive', () => {
      expect(InputValidator.hasWhereClause('delete from users where id = 1')).toBe(true);
      expect(InputValidator.hasWhereClause('UPDATE users SET name = "John" WHERE id = 1')).toBe(true);
    });
  });

  describe('isDestructiveQuery', () => {
    it('should detect DROP statements', () => {
      expect(InputValidator.isDestructiveQuery('DROP TABLE users')).toEqual({ destructive: true, reason: 'DROP statement detected' });
      expect(InputValidator.isDestructiveQuery('DROP DATABASE testdb')).toEqual({ destructive: true, reason: 'DROP statement detected' });
      expect(InputValidator.isDestructiveQuery('DROP INDEX idx_users')).toEqual({ destructive: true, reason: 'DROP statement detected' });
      expect(InputValidator.isDestructiveQuery('DROP VIEW user_view')).toEqual({ destructive: true, reason: 'DROP statement detected' });
      expect(InputValidator.isDestructiveQuery('DROP SCHEMA myschema')).toEqual({ destructive: true, reason: 'DROP statement detected' });
    });

    it('should detect TRUNCATE statements', () => {
      expect(InputValidator.isDestructiveQuery('TRUNCATE TABLE users')).toEqual({ destructive: true, reason: 'TRUNCATE statement detected' });
      expect(InputValidator.isDestructiveQuery('truncate table orders')).toEqual({ destructive: true, reason: 'TRUNCATE statement detected' });
    });

    it('should detect DELETE without WHERE', () => {
      expect(InputValidator.isDestructiveQuery('DELETE FROM users')).toEqual({ destructive: true, reason: 'DELETE without WHERE clause' });
      expect(InputValidator.isDestructiveQuery('DELETE FROM users WHERE id = 1')).toEqual({ destructive: false });
      expect(InputValidator.isDestructiveQuery('delete from products')).toEqual({ destructive: true, reason: 'DELETE without WHERE clause' });
    });

    it('should detect UPDATE without WHERE', () => {
      expect(InputValidator.isDestructiveQuery('UPDATE users SET name = "John"')).toEqual({ destructive: true, reason: 'UPDATE without WHERE clause' });
      expect(InputValidator.isDestructiveQuery('UPDATE users SET name = "John" WHERE id = 1')).toEqual({ destructive: false });
      expect(InputValidator.isDestructiveQuery('update products set price = 0')).toEqual({ destructive: true, reason: 'UPDATE without WHERE clause' });
    });

    it('should not flag SELECT queries as destructive', () => {
      expect(InputValidator.isDestructiveQuery('SELECT * FROM users')).toEqual({ destructive: false });
      expect(InputValidator.isDestructiveQuery('SELECT id, name FROM users WHERE active = 1')).toEqual({ destructive: false });
    });

    it('should not flag INSERT queries as destructive', () => {
      expect(InputValidator.isDestructiveQuery('INSERT INTO users VALUES (1, "John")')).toEqual({ destructive: false });
      expect(InputValidator.isDestructiveQuery('INSERT INTO users (name) VALUES ("Jane")')).toEqual({ destructive: false });
    });

    it('should be case insensitive', () => {
      expect(InputValidator.isDestructiveQuery('drop table users')).toEqual({ destructive: true, reason: 'DROP statement detected' });
      expect(InputValidator.isDestructiveQuery('TRUNCATE table users')).toEqual({ destructive: true, reason: 'TRUNCATE statement detected' });
      expect(InputValidator.isDestructiveQuery('Delete From users')).toEqual({ destructive: true, reason: 'DELETE without WHERE clause' });
    });

    it('should handle queries with extra whitespace', () => {
      expect(InputValidator.isDestructiveQuery('  DELETE   FROM  users  ')).toEqual({ destructive: true, reason: 'DELETE without WHERE clause' });
      expect(InputValidator.isDestructiveQuery('  UPDATE  users  SET  name = "x"  ')).toEqual({ destructive: true, reason: 'UPDATE without WHERE clause' });
    });
  });
});
