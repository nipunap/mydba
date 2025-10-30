/**
 * Input validation utilities for MyDBA extension
 */

import { ValidationResult, ConnectionConfig, DatabaseType, Environment } from '../types';

export class InputValidator {
    /**
     * Validates a port number
     */
    static validatePort(portStr: string): ValidationResult<number> {
        const port = parseInt(portStr, 10);

        if (isNaN(port)) {
            return { valid: false, error: 'Port must be a valid number' };
        }

        if (port < 1 || port > 65535) {
            return { valid: false, error: 'Port must be between 1 and 65535' };
        }

        return { valid: true, value: port };
    }

    /**
     * Validates a hostname or IP address
     */
    static validateHostname(hostname: string): ValidationResult {
        if (!hostname || hostname.trim() === '') {
            return { valid: false, error: 'Hostname cannot be empty' };
        }

        // Allow localhost
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return { valid: true };
        }

        // RFC 1123 hostname validation
        const hostnameRegex = /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.[A-Za-z0-9-]{1,63})*$/;

        // IPv4 validation
        const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

        // IPv6 validation (simplified)
        const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

        if (hostnameRegex.test(hostname) || ipv4Regex.test(hostname) || ipv6Regex.test(hostname)) {
            return { valid: true };
        }

        return { valid: false, error: 'Invalid hostname or IP address format' };
    }

    /**
     * Validates a username
     */
    static validateUsername(username: string): ValidationResult {
        if (!username || username.trim() === '') {
            return { valid: false, error: 'Username cannot be empty' };
        }

        if (username.length > 255) {
            return { valid: false, error: 'Username is too long (max 255 characters)' };
        }

        // Check for invalid characters
        const invalidChars = /[<>"']/;
        if (invalidChars.test(username)) {
            return { valid: false, error: 'Username contains invalid characters' };
        }

        return { valid: true };
    }

    /**
     * Validates a database name
     */
    static validateDatabaseName(name: string): ValidationResult {
        if (!name || name.trim() === '') {
            return { valid: false, error: 'Database name cannot be empty' };
        }

        if (name.length > 64) {
            return { valid: false, error: 'Database name is too long (max 64 characters)' };
        }

        // MySQL identifier rules
        const validIdentifier = /^[a-zA-Z0-9_$]+$/;
        if (!validIdentifier.test(name)) {
            return { valid: false, error: 'Database name contains invalid characters (only alphanumeric, underscore, and $ allowed)' };
        }

        return { valid: true };
    }

    /**
     * Validates a connection configuration
     */
    static validateConnectionConfig(config: Partial<ConnectionConfig>): ValidationResult<ConnectionConfig> {
        // Validate name
        if (!config.name || config.name.trim() === '') {
            return { valid: false, error: 'Connection name is required' };
        }

        // Validate type
        const validTypes: DatabaseType[] = ['mysql', 'mariadb', 'postgresql', 'redis', 'valkey'];
        if (!config.type || !validTypes.includes(config.type)) {
            return { valid: false, error: 'Invalid database type' };
        }

        // Validate host
        const hostValidation = this.validateHostname(config.host || '');
        if (!hostValidation.valid) {
            return { valid: false, error: hostValidation.error };
        }

        // Validate port
        const portValidation = this.validatePort(String(config.port));
        if (!portValidation.valid) {
            return { valid: false, error: portValidation.error };
        }

        // Validate user
        const userValidation = this.validateUsername(config.user || '');
        if (!userValidation.valid) {
            return { valid: false, error: userValidation.error };
        }

        // Validate database name if provided
        if (config.database) {
            const dbValidation = this.validateDatabaseName(config.database);
            if (!dbValidation.valid) {
                return { valid: false, error: dbValidation.error };
            }
        }

        // Validate environment
        const validEnvironments: Environment[] = ['dev', 'staging', 'prod'];
        if (!config.environment || !validEnvironments.includes(config.environment)) {
            return { valid: false, error: 'Invalid environment (must be dev, staging, or prod)' };
        }

        return {
            valid: true,
            value: config as ConnectionConfig
        };
    }

    /**
     * Sanitizes a SQL identifier (database, table, column name)
     * Removes potentially dangerous characters
     */
    static sanitizeIdentifier(identifier: string): string {
        // Remove everything except alphanumeric, underscore, and dollar sign
        return identifier.replace(/[^a-zA-Z0-9_$]/g, '');
    }

    /**
     * Escapes a SQL identifier with backticks
     */
    static escapeIdentifier(identifier: string): string {
        // Sanitize first
        const sanitized = this.sanitizeIdentifier(identifier);
        // Wrap in backticks and escape any backticks in the identifier
        return `\`${sanitized.replace(/`/g, '``')}\``;
    }

    /**
     * Detects potential SQL injection patterns
     */
    static hasSQLInjectionPattern(sql: string, allowDataModification: boolean = false): boolean {
        // Check for common SQL injection patterns
        const alwaysDangerousPatterns = [
            /(\$\{|\$\w+)/,                    // Template literals or variables
            /(union\s+select)/i,                // UNION SELECT
            /(drop\s+table)/i,                  // DROP TABLE
            /(-{2}|\/\*|\*\/)/,                 // SQL comments
            /\b(xp_|sp_)\w+/i,                  // Stored procedures (xp_, sp_ prefix)
            /\b(exec|execute)\s+/i,             // EXEC/EXECUTE followed by space (stored procedure call)
            /\bconcat\s*\(/i,                   // CONCAT function call (injection vector)
            /('.*?or.*?'|".*?or.*?")/i         // OR-based injection
        ];

        // These patterns are only dangerous if not properly parameterized
        const conditionallyDangerousPatterns = [
            /(insert\s+into)/i,                 // INSERT INTO
            /(update\s+\w+\s+set)/i,           // UPDATE SET
            /(delete\s+from)/i,                 // DELETE FROM
        ];

        // Always check for always-dangerous patterns
        if (alwaysDangerousPatterns.some(pattern => pattern.test(sql))) {
            return true;
        }

        // Only check conditionally dangerous patterns if not properly parameterized
        if (!allowDataModification && conditionallyDangerousPatterns.some(pattern => pattern.test(sql))) {
            return true;
        }

        return false;
    }

    /**
     * Validates that a query uses parameterized format
     */
    static isParameterizedQuery(sql: string, params?: unknown[]): ValidationResult {
        // Check for template literals or string interpolation
        if (sql.includes('${') || sql.includes('$')) {
            return {
                valid: false,
                error: 'Query contains template literal or string interpolation. Use parameterized queries with ? placeholders.'
            };
        }

        // Count ? placeholders
        const placeholderCount = (sql.match(/\?/g) || []).length;
        const paramCount = params?.length || 0;

        if (placeholderCount !== paramCount) {
            return {
                valid: false,
                error: `Parameter count mismatch: ${placeholderCount} placeholders but ${paramCount} parameters provided`
            };
        }

        // Check for SQL injection patterns
        // If query is properly parameterized (has ? placeholders), allow INSERT/UPDATE/DELETE
        const isProperlyParameterized = placeholderCount > 0 && placeholderCount === paramCount;
        if (this.hasSQLInjectionPattern(sql, isProperlyParameterized)) {
            return {
                valid: false,
                error: 'Query contains potentially dangerous SQL patterns'
            };
        }

        return { valid: true };
    }

    /**
     * Checks if a DELETE or UPDATE query has a WHERE clause
     */
    static hasWhereClause(sql: string): boolean {
        const normalizedSQL = sql.toLowerCase().replace(/\s+/g, ' ').trim();

        if (normalizedSQL.startsWith('delete') || normalizedSQL.startsWith('update')) {
            return /\bwhere\b/i.test(sql);
        }

        return true; // Other queries don't need WHERE clause
    }

    /**
     * Checks if a query is destructive (DROP, TRUNCATE, DELETE without WHERE)
     */
    static isDestructiveQuery(sql: string): { destructive: boolean; reason?: string } {
        const normalizedSQL = sql.toLowerCase().replace(/\s+/g, ' ').trim();

        // Check for DROP
        if (/\bdrop\s+(table|database|schema|index|view)\b/i.test(normalizedSQL)) {
            return { destructive: true, reason: 'DROP statement detected' };
        }

        // Check for TRUNCATE
        if (/\btruncate\s+table\b/i.test(normalizedSQL)) {
            return { destructive: true, reason: 'TRUNCATE statement detected' };
        }

        // Check for DELETE without WHERE
        if (normalizedSQL.startsWith('delete') && !this.hasWhereClause(sql)) {
            return { destructive: true, reason: 'DELETE without WHERE clause' };
        }

        // Check for UPDATE without WHERE
        if (normalizedSQL.startsWith('update') && !this.hasWhereClause(sql)) {
            return { destructive: true, reason: 'UPDATE without WHERE clause' };
        }

        return { destructive: false };
    }
}
