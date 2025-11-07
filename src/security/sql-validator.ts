/**
 * SQL validator for security and safety checks
 * Validates SQL statements before execution to prevent dangerous operations
 */

import { Logger } from '../utils/logger';
import { ValidationError } from '../core/errors';

/**
 * SQL statement types
 */
export enum SQLStatementType {
    SELECT = 'SELECT',
    INSERT = 'INSERT',
    UPDATE = 'UPDATE',
    DELETE = 'DELETE',
    CREATE = 'CREATE',
    ALTER = 'ALTER',
    DROP = 'DROP',
    TRUNCATE = 'TRUNCATE',
    GRANT = 'GRANT',
    REVOKE = 'REVOKE',
    UNKNOWN = 'UNKNOWN'
}

/**
 * Validation result
 */
export interface SQLValidationResult {
    valid: boolean;
    statementType: SQLStatementType;
    isDestructive: boolean;
    requiresConfirmation: boolean;
    issues: string[];
    warnings: string[];
    affectedObjects?: string[];
}

/**
 * Validation options
 */
export interface SQLValidationOptions {
    environment?: 'dev' | 'staging' | 'prod';
    allowDestructive?: boolean;
    requireWhereClause?: boolean;
    maxAffectedRows?: number;
}

/**
 * SQL Validator class
 */
export class SQLValidator {
    constructor(private logger: Logger) {}

    /**
     * Validate a SQL statement
     */
    validate(sql: string, options: SQLValidationOptions = {}): SQLValidationResult {
        const issues: string[] = [];
        const warnings: string[] = [];

        // Normalize SQL
        const normalizedSQL = this.normalizeSQL(sql);

        // Check for empty or whitespace-only queries
        if (!normalizedSQL || normalizedSQL.trim().length === 0) {
            issues.push('Query cannot be empty');
        }

        // Detect statement type
        const statementType = this.detectStatementType(normalizedSQL);

        // Check if destructive
        const isDestructive = this.isDestructive(statementType);

        // Check for dangerous file operations
        if (/LOAD\s+DATA\s+(LOCAL\s+)?INFILE/i.test(normalizedSQL)) {
            issues.push('LOAD DATA INFILE is not allowed due to security risks');
        }

        if (/INTO\s+OUTFILE/i.test(normalizedSQL)) {
            warnings.push('INTO OUTFILE writes data to files on the server');
        }

        // Check for dangerous privilege operations
        if (statementType === SQLStatementType.GRANT) {
            issues.push('GRANT statements are not allowed - use database admin tools instead');
        }

        // Check for user management operations
        if (/CREATE\s+USER/i.test(normalizedSQL)) {
            issues.push('CREATE USER statements are not allowed - use database admin tools instead');
        }

        // Check for basic SQL injection patterns
        if (this.hasSQLInjection(normalizedSQL)) {
            issues.push('Potential SQL injection detected');
        }

        // Check for multiple statements (potential SQL injection)
        if (this.hasMultipleStatements(normalizedSQL)) {
            warnings.push('Multiple statements detected');
        }

        // Check for missing WHERE clause in UPDATE/DELETE
        if (options.requireWhereClause && this.isMissingWhereClause(normalizedSQL, statementType)) {
            issues.push(`${statementType} statement missing WHERE clause`);
        }

        // Check for SELECT *
        if (statementType === SQLStatementType.SELECT && /SELECT\s+\*\s+FROM/i.test(normalizedSQL)) {
            warnings.push('SELECT * can be inefficient; consider selecting specific columns');
        }

        // Production environment checks
        if (options.environment === 'prod') {
            if (isDestructive && !options.allowDestructive) {
                issues.push('Destructive operations not allowed in production without explicit confirmation');
            }

            // Stricter checks for production
            if (statementType === SQLStatementType.DROP) {
                issues.push('DROP statements are highly discouraged in production');
            }

            if (statementType === SQLStatementType.TRUNCATE) {
                issues.push('TRUNCATE statements are highly discouraged in production');
            }
        }

        // Extract affected objects
        const affectedObjects = this.extractAffectedObjects(normalizedSQL, statementType);

        // Determine if confirmation is required
        const requiresConfirmation =
            isDestructive ||
            (options.environment === 'prod' && statementType !== SQLStatementType.SELECT);

        const valid = issues.length === 0;

        if (!valid) {
            this.logger.warn(`SQL validation failed: ${issues.join(', ')}`);
        }

        if (warnings.length > 0) {
            this.logger.info(`SQL validation warnings: ${warnings.join(', ')}`);
        }

        return {
            valid,
            statementType,
            isDestructive,
            requiresConfirmation,
            issues,
            warnings,
            affectedObjects
        };
    }

    /**
     * Validate and throw if invalid
     */
    validateOrThrow(sql: string, options: SQLValidationOptions = {}): void {
        const result = this.validate(sql, options);

        if (!result.valid) {
            throw new ValidationError(
                'SQL',
                result.issues.join('; ')
            );
        }
    }

    /**
     * Check if SQL has injection patterns
     */
    private hasSQLInjection(sql: string): boolean {
        // Common SQL injection patterns
        const injectionPatterns = [
            /'\s*OR\s+'1'\s*=\s*'1/i,
            /'\s*OR\s+1\s*=\s*1/i,
            /--\s*$/,
            /;\s*DROP\s+TABLE/i,
            /;\s*DELETE\s+FROM/i,
            /UNION\s+ALL\s+SELECT/i,
            /'\s*;\s*--/,
            /xp_cmdshell/i,
            /exec\s*\(/i,
            /execute\s*\(/i
        ];

        return injectionPatterns.some(pattern => pattern.test(sql));
    }

    /**
     * Check if SQL contains multiple statements
     */
    private hasMultipleStatements(sql: string): boolean {
        // Remove string literals to avoid false positives
        const withoutStrings = sql.replace(/'[^']*'/g, '');

        // Count semicolons outside of comments
        const semicolons = (withoutStrings.match(/;/g) || []).length;

        return semicolons > 1;
    }

    /**
     * Check if statement is missing WHERE clause
     */
    private isMissingWhereClause(sql: string, type: SQLStatementType): boolean {
        if (type !== SQLStatementType.UPDATE && type !== SQLStatementType.DELETE) {
            return false;
        }

        return !/WHERE/i.test(sql);
    }

    /**
     * Detect SQL statement type
     */
    private detectStatementType(sql: string): SQLStatementType {
        const firstWord = sql.trim().split(/\s+/)[0]?.toUpperCase();

        switch (firstWord) {
            case 'SELECT':
                return SQLStatementType.SELECT;
            case 'INSERT':
                return SQLStatementType.INSERT;
            case 'UPDATE':
                return SQLStatementType.UPDATE;
            case 'DELETE':
                return SQLStatementType.DELETE;
            case 'CREATE':
                return SQLStatementType.CREATE;
            case 'ALTER':
                return SQLStatementType.ALTER;
            case 'DROP':
                return SQLStatementType.DROP;
            case 'TRUNCATE':
                return SQLStatementType.TRUNCATE;
            case 'GRANT':
                return SQLStatementType.GRANT;
            case 'REVOKE':
                return SQLStatementType.REVOKE;
            default:
                return SQLStatementType.UNKNOWN;
        }
    }

    /**
     * Check if statement type is destructive
     */
    private isDestructive(type: SQLStatementType): boolean {
        return [
            SQLStatementType.DELETE,
            SQLStatementType.DROP,
            SQLStatementType.TRUNCATE,
            SQLStatementType.ALTER
        ].includes(type);
    }

    /**
     * Extract affected database objects from SQL
     */
    private extractAffectedObjects(sql: string, type: SQLStatementType): string[] {
        const objects: string[] = [];

        try {
            switch (type) {
                case SQLStatementType.DROP: {
                    const match = sql.match(/DROP\s+(TABLE|INDEX|DATABASE)\s+`?(\w+)`?/i);
                    if (match) {
                        objects.push(`${match[1]}: ${match[2]}`);
                    }
                    break;
                }

                case SQLStatementType.TRUNCATE: {
                    const match = sql.match(/TRUNCATE\s+TABLE\s+`?(\w+)`?/i);
                    if (match) {
                        objects.push(`TABLE: ${match[1]}`);
                    }
                    break;
                }

                case SQLStatementType.ALTER: {
                    const match = sql.match(/ALTER\s+TABLE\s+`?(\w+)`?/i);
                    if (match) {
                        objects.push(`TABLE: ${match[1]}`);
                    }
                    break;
                }

                case SQLStatementType.CREATE: {
                    const match = sql.match(/CREATE\s+(TABLE|INDEX|DATABASE)\s+`?(\w+)`?/i);
                    if (match) {
                        objects.push(`${match[1]}: ${match[2]}`);
                    }
                    break;
                }

                case SQLStatementType.DELETE:
                case SQLStatementType.UPDATE: {
                    const match = sql.match(/(?:FROM|UPDATE)\s+`?(\w+)`?/i);
                    if (match) {
                        objects.push(`TABLE: ${match[1]}`);
                    }
                    break;
                }

                case SQLStatementType.INSERT: {
                    const match = sql.match(/INSERT\s+INTO\s+`?(\w+)`?/i);
                    if (match) {
                        objects.push(`TABLE: ${match[1]}`);
                    }
                    break;
                }

                case SQLStatementType.GRANT: {
                    // Match GRANT privileges ON object TO user
                    const onMatch = sql.match(/GRANT\s+[\w\s,]+\s+ON\s+(?:TABLE\s+)?`?(\w+)`?/i);
                    const toMatch = sql.match(/TO\s+'?(\w+)'?@?/i);
                    if (onMatch) {
                        objects.push(`GRANT ON: ${onMatch[1]}`);
                    }
                    if (toMatch) {
                        objects.push(`USER: ${toMatch[1]}`);
                    }
                    break;
                }

                case SQLStatementType.REVOKE: {
                    // Match REVOKE privileges ON object FROM user
                    const onMatch = sql.match(/REVOKE\s+[\w\s,]+\s+ON\s+(?:TABLE\s+)?`?(\w+)`?/i);
                    const fromMatch = sql.match(/FROM\s+'?(\w+)'?@?/i);
                    if (onMatch) {
                        objects.push(`REVOKE ON: ${onMatch[1]}`);
                    }
                    if (fromMatch) {
                        objects.push(`USER: ${fromMatch[1]}`);
                    }
                    break;
                }
            }
        } catch (error) {
            this.logger.warn('Error extracting affected objects:', error as Error);
        }

        return objects;
    }

    /**
     * Normalize SQL for validation
     */
    private normalizeSQL(sql: string): string {
        return sql
            .replace(/\s+/g, ' ')
            .replace(/\n/g, ' ')
            .trim();
    }

    /**
     * Validate DDL statement (CREATE INDEX, etc.)
     */
    validateDDL(sql: string, options: SQLValidationOptions = {}): SQLValidationResult {
        const result = this.validate(sql, options);

        // Additional DDL-specific checks
        if (result.statementType === SQLStatementType.CREATE) {
            // Check if creating index with proper syntax
            if (/CREATE\s+INDEX/i.test(sql)) {
                if (!/ON\s+\w+\s*\(/i.test(sql)) {
                    result.issues.push('CREATE INDEX statement appears to be missing ON clause');
                    result.valid = false;
                }
            }
        }

        return result;
    }

    /**
     * Estimate query impact (for confirmation dialogs)
     */
    estimateImpact(sql: string, estimatedRows?: number): {
        risk: 'low' | 'medium' | 'high' | 'critical';
        description: string;
    } {
        const result = this.validate(sql);

        if (result.statementType === SQLStatementType.DROP) {
            return {
                risk: 'critical',
                description: 'This will permanently delete the entire object and all its data'
            };
        }

        if (result.statementType === SQLStatementType.TRUNCATE) {
            return {
                risk: 'critical',
                description: 'This will permanently delete all rows in the table'
            };
        }

        if (result.statementType === SQLStatementType.DELETE) {
            if (!result.issues.includes('DELETE statement missing WHERE clause')) {
                return {
                    risk: 'high',
                    description: `This will delete ${estimatedRows || 'all'} rows from the table`
                };
            }
            return {
                risk: 'critical',
                description: 'This will delete ALL rows from the table (no WHERE clause)'
            };
        }

        if (result.statementType === SQLStatementType.UPDATE) {
            if (!result.issues.includes('UPDATE statement missing WHERE clause')) {
                return {
                    risk: 'medium',
                    description: `This will update ${estimatedRows || 'some'} rows`
                };
            }
            return {
                risk: 'critical',
                description: 'This will update ALL rows in the table (no WHERE clause)'
            };
        }

        if (result.statementType === SQLStatementType.ALTER) {
            return {
                risk: 'high',
                description: 'This will modify the table structure'
            };
        }

        return {
            risk: 'low',
            description: 'This operation should be safe'
        };
    }
}
