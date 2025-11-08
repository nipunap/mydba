import { Logger } from '../utils/logger';
import { QueryAnalyzer } from './query-analyzer';
import { QueryAnonymizer } from '../utils/query-anonymizer';
import { AntiPattern } from '../types/ai-types';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ParseResult {
    sql: string;
    queryType: string;
    complexity: number;
    antiPatterns: AntiPattern[];
    valid: boolean;
    error?: string;
}

export interface TemplateResult {
    original: string;
    templated: string;
    fingerprint: string;
}

export interface RiskAnalysisResult {
    level: RiskLevel;
    issues: string[];
    isDestructive: boolean;
    requiresConfirmation: boolean;
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    riskLevel: RiskLevel;
}

export class QueryService {
    private analyzer: QueryAnalyzer;
    private anonymizer: QueryAnonymizer;

    constructor(private logger: Logger) {
        this.analyzer = new QueryAnalyzer();
        this.anonymizer = new QueryAnonymizer();
    }

    /**
     * Parse SQL query and analyze for anti-patterns
     */
    parse(sql: string): ParseResult {
        this.logger.debug(`Parsing SQL: ${sql.substring(0, 50)}...`);

        try {
            const analysis = this.analyzer.analyze(sql);

            return {
                sql,
                queryType: analysis.queryType,
                complexity: analysis.complexity,
                antiPatterns: analysis.antiPatterns,
                valid: true
            };
        } catch (error) {
            this.logger.error('SQL parsing failed:', error as Error);
            return {
                sql,
                queryType: 'unknown',
                complexity: 0,
                antiPatterns: [],
                valid: false,
                error: (error as Error).message
            };
        }
    }

    /**
     * Anonymize and template a SQL query
     */
    templateQuery(sql: string): TemplateResult {
        this.logger.debug(`Templating query: ${sql.substring(0, 50)}...`);

        const templated = this.anonymizer.anonymize(sql);
        const fingerprint = this.anonymizer.fingerprint(sql);

        return {
            original: sql,
            templated,
            fingerprint
        };
    }

    /**
     * Analyze query risk level based on type and patterns
     */
    analyzeRisk(sql: string): RiskAnalysisResult {
        this.logger.debug(`Analyzing risk: ${sql.substring(0, 50)}...`);

        const issues: string[] = [];
        const normalizedSQL = sql.trim().toUpperCase();

        // Detect destructive operations
        const isDestructive = this.isDestructiveQuery(normalizedSQL);

        // Determine risk level based on query type
        let level: RiskLevel = 'LOW';
        let requiresConfirmation = false;

        // CRITICAL: DROP operations
        if (normalizedSQL.startsWith('DROP ')) {
            level = 'CRITICAL';
            requiresConfirmation = true;
            issues.push('DROP operation detected - irreversible data loss possible');
        }
        // CRITICAL: TRUNCATE operations
        else if (normalizedSQL.startsWith('TRUNCATE ')) {
            level = 'CRITICAL';
            requiresConfirmation = true;
            issues.push('TRUNCATE operation detected - all table data will be deleted');
        }
        // HIGH: DELETE without WHERE
        else if (normalizedSQL.startsWith('DELETE ') && !normalizedSQL.includes('WHERE')) {
            level = 'HIGH';
            requiresConfirmation = true;
            issues.push('DELETE without WHERE clause - will affect all rows');
        }
        // HIGH: UPDATE without WHERE
        else if (normalizedSQL.startsWith('UPDATE ') && !normalizedSQL.includes('WHERE')) {
            level = 'HIGH';
            requiresConfirmation = true;
            issues.push('UPDATE without WHERE clause - will affect all rows');
        }
        // HIGH: ALTER TABLE operations
        else if (normalizedSQL.startsWith('ALTER TABLE')) {
            level = 'HIGH';
            requiresConfirmation = true;
            issues.push('ALTER TABLE operation - schema changes can impact application');
        }
        // MEDIUM: DELETE/UPDATE with WHERE
        else if ((normalizedSQL.startsWith('DELETE ') || normalizedSQL.startsWith('UPDATE ')) && normalizedSQL.includes('WHERE')) {
            level = 'MEDIUM';
            issues.push('Destructive operation with WHERE clause');
        }
        // MEDIUM: INSERT operations
        else if (normalizedSQL.startsWith('INSERT ')) {
            level = 'MEDIUM';
            issues.push('INSERT operation - data will be added');
        }
        // LOW: SELECT and other read operations
        else {
            level = 'LOW';
        }

        // Check for additional risk factors using query analyzer
        try {
            const analysis = this.analyzer.analyze(sql);

            // Add anti-pattern issues
            analysis.antiPatterns.forEach(pattern => {
                if (pattern.severity === 'critical') {
                    if (level === 'LOW') level = 'MEDIUM';
                    issues.push(`Critical anti-pattern: ${pattern.message}`);
                } else if (pattern.severity === 'warning') {
                    issues.push(`Warning: ${pattern.message}`);
                }
            });

            // High complexity increases risk
            if (analysis.complexity > 50 && level === 'LOW') {
                level = 'MEDIUM';
                issues.push('Complex query detected - review carefully');
            }
        } catch (error) {
            this.logger.warn('Risk analysis could not parse query:', error as Error);
        }

        return {
            level,
            issues,
            isDestructive,
            requiresConfirmation
        };
    }

    /**
     * Validate query syntax and check for potential issues
     */
    validate(sql: string, schema?: unknown): ValidationResult {
        this.logger.debug(`Validating query: ${sql.substring(0, 50)}...`);

        const errors: string[] = [];
        const warnings: string[] = [];

        // Basic syntax validation through parsing
        const parseResult = this.parse(sql);
        if (!parseResult.valid) {
            errors.push(parseResult.error || 'Invalid SQL syntax');
        }

        // Risk analysis
        const riskAnalysis = this.analyzeRisk(sql);

        // Add risk issues as warnings or errors
        riskAnalysis.issues.forEach(issue => {
            if (riskAnalysis.level === 'CRITICAL' || riskAnalysis.level === 'HIGH') {
                errors.push(issue);
            } else {
                warnings.push(issue);
            }
        });

        // Add anti-pattern warnings
        parseResult.antiPatterns.forEach(pattern => {
            if (pattern.severity === 'critical') {
                errors.push(`${pattern.type}: ${pattern.message}`);
            } else {
                warnings.push(`${pattern.type}: ${pattern.message}`);
            }
        });

        // Schema validation (if schema provided)
        if (schema) {
            this.logger.debug('Schema validation not yet implemented');
            // TODO: Implement schema-aware validation
            // - Check if referenced tables exist
            // - Check if referenced columns exist
            // - Validate data types
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            riskLevel: riskAnalysis.level
        };
    }

    /**
     * Helper to detect destructive queries
     */
    private isDestructiveQuery(normalizedSQL: string): boolean {
        const destructivePatterns = [
            /^DROP\s+/,
            /^TRUNCATE\s+/,
            /^DELETE\s+/,
            /^UPDATE\s+/,
            /^ALTER\s+/,
            /^RENAME\s+/
        ];

        return destructivePatterns.some(pattern => pattern.test(normalizedSQL));
    }
}
