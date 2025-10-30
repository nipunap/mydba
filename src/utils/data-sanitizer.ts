/**
 * Data sanitization utilities for secure logging and display
 */

import { ConnectionConfig } from '../types';

export class DataSanitizer {
    /**
     * Sanitizes a connection config for logging (removes sensitive data)
     */
    static sanitizeConnectionConfig(config: ConnectionConfig): Partial<ConnectionConfig> {
        return {
            id: config.id,
            name: config.name,
            type: config.type,
            host: this.maskSensitiveData(config.host),
            port: config.port,
            user: this.maskUsername(config.user),
            database: config.database,
            environment: config.environment,
            // Sensitive fields omitted or masked
            password: config.password ? '***' : undefined,
            ssl: config.ssl ? { enabled: true } as any : undefined, // eslint-disable-line @typescript-eslint/no-explicit-any
            ssh: config.ssh ? { enabled: true } as any : undefined, // eslint-disable-line @typescript-eslint/no-explicit-any
            awsIamAuth: config.awsIamAuth ? { enabled: true } as any : undefined // eslint-disable-line @typescript-eslint/no-explicit-any
        };
    }

    /**
     * Masks a username for logging
     */
    static maskUsername(username: string): string {
        if (!username || username.length <= 2) {
            return '***';
        }
        return username.charAt(0) + '***' + username.charAt(username.length - 1);
    }

    /**
     * Masks sensitive data like hostnames in production
     */
    static maskSensitiveData(data: string, showLastChars: number = 4): string {
        if (!data || data === 'localhost' || data === '127.0.0.1') {
            return data;
        }

        if (data.length <= showLastChars) {
            return '***';
        }

        return '***' + data.slice(-showLastChars);
    }

    /**
     * Sanitizes SQL for logging (removes sensitive values)
     */
    static sanitizeSQL(sql: string): string {
        return sql
            // Password patterns
            .replace(/password\s*=\s*['"][^'"]*['"]/gi, "password='***'")
            .replace(/pwd\s*=\s*['"][^'"]*['"]/gi, "pwd='***'")

            // Email addresses
            .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '***@***.***')

            // Social Security Numbers (US format)
            .replace(/\b\d{3}-\d{2}-\d{4}\b/g, 'XXX-XX-XXXX')

            // Credit card numbers (simple pattern)
            .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, 'XXXX-XXXX-XXXX-XXXX')

            // Phone numbers (US format)
            .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, 'XXX-XXX-XXXX')

            // IPv4 addresses (optionally mask)
            .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, (match) => {
                if (match.startsWith('192.168.') || match.startsWith('10.') || match.startsWith('127.')) {
                    return match; // Keep local IPs
                }
                return 'XXX.XXX.XXX.XXX';
            })

            // Generic patterns that might be sensitive
            .replace(/(['"])(?:(?=(\\?))\2.)*?\1/g, (match) => {
                // If string is longer than 50 chars, it might be sensitive
                if (match.length > 50) {
                    return match.charAt(0) + '***' + match.charAt(match.length - 1);
                }
                return match;
            });
    }

    /**
     * Anonymizes query for AI processing (preserves structure, masks data)
     */
    static anonymizeQueryForAI(sql: string): string {
        let anonymized = sql;

        // Replace string literals with placeholders
        anonymized = anonymized.replace(/(['"])(?:(?=(\\?))\2.)*?\1/g, (match, quote) => {
            return quote + '<string>' + quote;
        });

        // Replace numbers with placeholders
        anonymized = anonymized.replace(/\b\d+\b/g, '<number>');

        // Keep SQL structure keywords
        return anonymized;
    }

    /**
     * Templates a query for AI processing (replaces values with typed placeholders)
     */
    static templateQueryForAI(sql: string, params?: unknown[]): string {
        let templated = sql;
        let paramIndex = 0;

        // Replace ? placeholders with typed placeholders
        templated = templated.replace(/\?/g, () => {
            const param = params?.[paramIndex++];
            const type = this.getParameterType(param);
            return `<${type}>`;
        });

        // Extract table and column names
        const tablePattern = /FROM\s+([a-zA-Z0-9_]+)/gi;
        const columnPattern = /SELECT\s+([\w\s,]+)\s+FROM/i;

        templated = templated.replace(tablePattern, (match, tableName) => {
            return `FROM <table:${tableName}>`;
        });

        const columnMatch = columnPattern.exec(templated);
        if (columnMatch) {
            const columns = columnMatch[1].split(',').map(c => c.trim());
            const columnTemplates = columns.map(col => `<col:${col}>`).join(', ');
            templated = templated.replace(columnMatch[1], columnTemplates);
        }

        return templated;
    }

    /**
     * Gets the type of a parameter for templating
     */
    private static getParameterType(param: unknown): string {
        if (param === null) {
            return 'null';
        }
        if (typeof param === 'number') {
            return 'number';
        }
        if (typeof param === 'string') {
            if (/^\d{4}-\d{2}-\d{2}/.test(param)) {
                return 'date';
            }
            if (/@/.test(param)) {
                return 'email';
            }
            return 'string';
        }
        if (typeof param === 'boolean') {
            return 'boolean';
        }
        if (Array.isArray(param)) {
            return 'array';
        }
        return 'object';
    }

    /**
     * Sanitizes error messages for display
     */
    static sanitizeErrorMessage(error: Error | string): string {
        const message = typeof error === 'string' ? error : error.message;

        return message
            // Remove file paths
            .replace(/\/[\w/.-]+/g, '[path]')
            .replace(/[A-Z]:\\[\w\\.-]+/g, '[path]')

            // Remove connection strings
            .replace(/mysql:\/\/[^@]+@[^/]+/g, 'mysql://***:***@***/***')
            .replace(/postgresql:\/\/[^@]+@[^/]+/g, 'postgresql://***:***@***/***')

            // Remove passwords
            .replace(/password[=:][\w]+/gi, 'password=***')

            // Remove API keys/tokens
            .replace(/[a-z0-9]{32,}/gi, '***');
    }

    /**
     * Masks query results for display in UI (limit rows, mask sensitive columns)
     */
    static sanitizeQueryResults<T>(results: T[], sensitiveColumns: string[] = []): T[] {
        if (!results || results.length === 0) {
            return results;
        }

        return results.map(row => {
            const sanitized = { ...row } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

            // Auto-detect and mask sensitive columns
            const detectedSensitiveKeys = Object.keys(sanitized).filter(key =>
                /password|pwd|secret|token|key|credit|ssn|api/i.test(key)
            );

            const allSensitiveKeys = [...sensitiveColumns, ...detectedSensitiveKeys];

            allSensitiveKeys.forEach(key => {
                if (sanitized[key] !== undefined) {
                    sanitized[key] = '***';
                }
            });

            return sanitized;
        });
    }

    /**
     * Removes ANSI color codes from strings
     */
    static stripAnsiCodes(str: string): string {
        // eslint-disable-next-line no-control-regex
        return str.replace(/\x1b\[[0-9;]*m/g, '');
    }

    /**
     * Truncates long strings for display
     */
    static truncate(str: string, maxLength: number = 100, suffix: string = '...'): string {
        if (str.length <= maxLength) {
            return str;
        }
        return str.substring(0, maxLength - suffix.length) + suffix;
    }
}
