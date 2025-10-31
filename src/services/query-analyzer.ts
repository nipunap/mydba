/* eslint-disable @typescript-eslint/no-explicit-any */

import { Parser } from 'node-sql-parser';
import { AntiPattern } from '../types/ai-types';

/**
 * Query Analyzer
 *
 * Analyzes SQL queries for anti-patterns and optimization opportunities
 * using static analysis.
 */
export class QueryAnalyzer {
    private parser: Parser;

    constructor() {
        this.parser = new Parser();
    }

    /**
     * Analyze a query for anti-patterns and issues
     */
    analyze(query: string): {
        antiPatterns: AntiPattern[];
        complexity: number;
        queryType: string;
    } {
        const antiPatterns: AntiPattern[] = [];
        let complexity = 0;

        try {
            const ast = this.parser.astify(query, { database: 'MySQL' });
            const astArray = Array.isArray(ast) ? ast : [ast];

            for (const statement of astArray) {
                // Detect anti-patterns
                antiPatterns.push(...this.detectSelectStar(statement));
                antiPatterns.push(...this.detectMissingWhere(statement));
                antiPatterns.push(...this.detectCartesianJoin(statement));
                antiPatterns.push(...this.detectFunctionsOnIndexedColumns(statement));
                antiPatterns.push(...this.detectImplicitTypeConversions(statement));
                antiPatterns.push(...this.detectSubqueryInSelect(statement));

                // Calculate complexity
                complexity += this.calculateComplexity(statement);
            }

            return {
                antiPatterns,
                complexity,
                queryType: this.getQueryType(astArray[0]),
            };
        } catch {
            // If parsing fails, return basic analysis
            return {
                antiPatterns: [{
                    type: 'parse_error',
                    severity: 'warning',
                    message: 'Unable to parse query for detailed analysis',
                    suggestion: 'Check query syntax'
                }],
                complexity: 0,
                queryType: 'unknown',
            };
        }
    }

    /**
     * Detect SELECT * usage
     */
    private detectSelectStar(ast: any): AntiPattern[] {
        const patterns: AntiPattern[] = [];

        if (ast.type === 'select' && ast.columns) {
            const hasSelectStar = ast.columns.some((col: any) =>
                col.expr && col.expr.type === 'column_ref' && col.expr.column === '*'
            );

            if (hasSelectStar) {
                patterns.push({
                    type: 'select_star',
                    severity: 'warning',
                    message: 'Using SELECT * retrieves all columns, which may be inefficient',
                    suggestion: 'Specify only the columns you need: SELECT col1, col2, col3 FROM table'
                });
            }
        }

        return patterns;
    }

    /**
     * Detect missing WHERE clause in UPDATE/DELETE
     */
    private detectMissingWhere(ast: any): AntiPattern[] {
        const patterns: AntiPattern[] = [];

        if ((ast.type === 'update' || ast.type === 'delete') && !ast.where) {
            patterns.push({
                type: 'missing_where',
                severity: 'critical',
                message: `${ast.type.toUpperCase()} without WHERE clause will affect all rows`,
                suggestion: 'Add a WHERE clause to limit the affected rows'
            });
        }

        return patterns;
    }

    /**
     * Detect Cartesian joins (missing join conditions)
     */
    private detectCartesianJoin(ast: any): AntiPattern[] {
        const patterns: AntiPattern[] = [];

        if (ast.type === 'select' && ast.from) {
            const tables = this.extractTables(ast.from);

            if (tables.length > 1) {
                // Check if there are join conditions or WHERE conditions
                const hasJoinConditions = tables.some((table: any) => table.on);
                const hasWhereConditions = ast.where && this.hasTableComparison(ast.where);

                if (!hasJoinConditions && !hasWhereConditions) {
                    patterns.push({
                        type: 'cartesian_join',
                        severity: 'critical',
                        message: 'Potential Cartesian product detected - missing join conditions',
                        suggestion: 'Add JOIN ... ON conditions or WHERE clause to relate the tables'
                    });
                }
            }
        }

        return patterns;
    }

    /**
     * Detect functions on indexed columns (breaks index usage)
     */
    private detectFunctionsOnIndexedColumns(ast: any): AntiPattern[] {
        const patterns: AntiPattern[] = [];

        if (ast.type === 'select' && ast.where) {
            const functionsInWhere = this.findFunctionsInConditions(ast.where);

            if (functionsInWhere.length > 0) {
                patterns.push({
                    type: 'function_on_column',
                    severity: 'warning',
                    message: 'Using functions on columns in WHERE clause may prevent index usage',
                    suggestion: `Found functions: ${functionsInWhere.join(', ')}. Consider computed columns or functional indexes`
                });
            }
        }

        return patterns;
    }

    /**
     * Detect implicit type conversions
     */
    private detectImplicitTypeConversions(ast: any): AntiPattern[] {
        const patterns: AntiPattern[] = [];

        if (ast.where) {
            const conversions = this.findImplicitConversions(ast.where);

            if (conversions.length > 0) {
                patterns.push({
                    type: 'implicit_conversion',
                    severity: 'warning',
                    message: 'Potential implicit type conversion detected',
                    suggestion: 'Ensure column types match comparison values to avoid index scans'
                });
            }
        }

        return patterns;
    }

    /**
     * Detect subqueries in SELECT list
     */
    private detectSubqueryInSelect(ast: any): AntiPattern[] {
        const patterns: AntiPattern[] = [];

        if (ast.type === 'select' && ast.columns) {
            const hasSubquery = ast.columns.some((col: any) =>
                col.expr && col.expr.type === 'select'
            );

            if (hasSubquery) {
                patterns.push({
                    type: 'subquery_in_select',
                    severity: 'info',
                    message: 'Subquery in SELECT list executes once per row',
                    suggestion: 'Consider using JOINs or moving subquery to FROM clause'
                });
            }
        }

        return patterns;
    }

    /**
     * Calculate query complexity score
     */
    private calculateComplexity(ast: any): number {
        let complexity = 1;

        if (ast.type === 'select') {
            // Add complexity for joins
            if (ast.from) {
                const tables = this.extractTables(ast.from);
                complexity += (tables.length - 1) * 2;
            }

            // Add complexity for subqueries
            complexity += this.countSubqueries(ast) * 3;

            // Add complexity for aggregations
            if (ast.groupby) {
                complexity += 2;
            }

            // Add complexity for sorting
            if (ast.orderby) {
                complexity += 1;
            }

            // Add complexity for HAVING
            if (ast.having) {
                complexity += 2;
            }
        }

        return complexity;
    }

    /**
     * Get query type
     */
    private getQueryType(ast: any): string {
        if (!ast) return 'unknown';
        return ast.type || 'unknown';
    }

    /**
     * Extract tables from FROM clause
     */
    private extractTables(from: any): any[] {
        if (!from) return [];
        if (Array.isArray(from)) return from;
        return [from];
    }

    /**
     * Check if WHERE has table comparisons
     */
    private hasTableComparison(where: any): boolean {
        if (!where) return false;

        if (where.type === 'binary_expr') {
            const leftIsColumn = where.left?.type === 'column_ref';
            const rightIsColumn = where.right?.type === 'column_ref';
            return leftIsColumn && rightIsColumn;
        }

        // Recursively check nested conditions
        if (where.left) {
            if (this.hasTableComparison(where.left)) return true;
        }
        if (where.right) {
            if (this.hasTableComparison(where.right)) return true;
        }

        return false;
    }

    /**
     * Find functions used in WHERE conditions
     */
    private findFunctionsInConditions(where: any): string[] {
        const functions: string[] = [];

        if (!where) return functions;

        if (where.type === 'function') {
            functions.push(where.name);
        }

        if (where.left) {
            functions.push(...this.findFunctionsInConditions(where.left));
        }
        if (where.right) {
            functions.push(...this.findFunctionsInConditions(where.right));
        }

        return functions;
    }

    /**
     * Find implicit type conversions
     */
    private findImplicitConversions(_where: any): any[] {
        // Simplified implementation - would need type information
        // from schema to do proper detection
        return [];
    }

    /**
     * Count subqueries in query
     */
    private countSubqueries(ast: any, count = 0): number {
        if (!ast || typeof ast !== 'object') return count;

        if (ast.type === 'select' && count > 0) {
            // Found a nested select
            count++;
        }

        // Recursively count in nested structures
        for (const key in ast) {
            if (Object.prototype.hasOwnProperty.call(ast, key)) {
                const value = ast[key];
                if (typeof value === 'object') {
                    count = this.countSubqueries(value, count);
                }
            }
        }

        return count;
    }
}
