import { Logger } from '../utils/logger';

/**
 * Natural Language Query Parser
 * 
 * Understands natural language database questions and extracts intent/parameters.
 */
export class NaturalLanguageQueryParser {
    constructor(private logger: Logger) {}

    /**
     * Parse a natural language query and extract intent and parameters
     */
    parse(prompt: string): ParsedQuery {
        const lowerPrompt = prompt.toLowerCase().trim();

        // Try to match patterns
        const intent = this.detectIntent(lowerPrompt);
        const parameters = this.extractParameters(lowerPrompt, intent);
        const sqlQuery = this.extractExistingSQLQuery(prompt);

        return {
            originalPrompt: prompt,
            intent,
            parameters,
            sqlQuery,
            requiresConfirmation: this.requiresConfirmation(intent)
        };
    }

    /**
     * Detect the user's intent from the prompt
     */
    private detectIntent(prompt: string): QueryIntent {
        // Information retrieval patterns
        if (this.matchesPattern(prompt, [
            /show\s+(me\s+)?(all\s+)?(\w+)/,
            /list\s+(all\s+)?(\w+)/,
            /get\s+(all\s+)?(\w+)/,
            /find\s+(all\s+)?(\w+)/,
            /what\s+(are|is)\s+(\w+)/,
            /which\s+(\w+)/,
            /how\s+many\s+(\w+)/
        ])) {
            return QueryIntent.RETRIEVE_DATA;
        }

        // Count patterns
        if (this.matchesPattern(prompt, [
            /count\s+(\w+)/,
            /how\s+many/,
            /number\s+of\s+(\w+)/,
            /total\s+(\w+)/
        ])) {
            return QueryIntent.COUNT;
        }

        // Analysis patterns
        if (this.matchesPattern(prompt, [
            /analyze/,
            /analysis/,
            /check\s+(the\s+)?performance/,
            /is\s+(\w+)\s+slow/,
            /why\s+is\s+(\w+)\s+slow/,
            /problems?\s+with/
        ])) {
            return QueryIntent.ANALYZE;
        }

        // Explanation patterns
        if (this.matchesPattern(prompt, [
            /explain/,
            /execution\s+plan/,
            /how\s+does\s+(\w+)\s+execute/,
            /query\s+plan/
        ])) {
            return QueryIntent.EXPLAIN;
        }

        // Optimization patterns
        if (this.matchesPattern(prompt, [
            /optimize/,
            /make\s+(\w+)\s+faster/,
            /improve\s+performance/,
            /speed\s+up/,
            /better\s+way\s+to/
        ])) {
            return QueryIntent.OPTIMIZE;
        }

        // Schema exploration
        if (this.matchesPattern(prompt, [
            /schema/,
            /structure\s+of/,
            /tables?\s+in/,
            /columns?\s+(in|of)/,
            /indexes?\s+on/,
            /foreign\s+keys?\s+(in|on|of)/,
            /what\s+(are|is)\s+the\s+(columns?|fields?)/
        ])) {
            return QueryIntent.SCHEMA_INFO;
        }

        // Connection/monitoring
        if (this.matchesPattern(prompt, [
            /active\s+connections?/,
            /running\s+queries?/,
            /current\s+processes?/,
            /who\s+is\s+connected/,
            /show\s+processlist/
        ])) {
            return QueryIntent.MONITOR;
        }

        // Modification intents (destructive)
        if (this.matchesPattern(prompt, [
            /update\s+/,
            /delete\s+(from\s+)?/,
            /drop\s+/,
            /truncate\s+/,
            /insert\s+into/,
            /create\s+(table|index|database)/
        ])) {
            return QueryIntent.MODIFY_DATA;
        }

        return QueryIntent.GENERAL;
    }

    /**
     * Extract parameters from the prompt based on intent
     */
    private extractParameters(prompt: string, _intent: QueryIntent): QueryParameters {
        const params: QueryParameters = {};

        // Extract table names
        const tableMatch = prompt.match(/(?:from|table|in)\s+[`"]?(\w+)[`"]?/i);
        if (tableMatch) {
            params.tableName = tableMatch[1];
        }

        // Extract column names
        const columnMatches = prompt.match(/columns?\s+(?:named\s+)?[`"]?(\w+)[`"]?/gi);
        if (columnMatches) {
            params.columns = columnMatches.map(m => {
                const match = m.match(/[`"]?(\w+)[`"]?$/);
                return match ? match[1] : '';
            }).filter(Boolean);
        }

        // Extract conditions
        const whereMatch = prompt.match(/where\s+(.+?)(?:\s+and|\s+or|$)/i);
        if (whereMatch) {
            params.condition = whereMatch[1].trim();
        }

        // Extract time ranges
        params.timeRange = this.extractTimeRange(prompt);

        // Extract limit
        const limitMatch = prompt.match(/(?:first|top|limit)\s+(\d+)/i);
        if (limitMatch) {
            params.limit = parseInt(limitMatch[1], 10);
        }

        // Extract ordering
        const orderMatch = prompt.match(/(?:order\s+by|sort\s+by)\s+(\w+)\s*(asc|desc)?/i);
        if (orderMatch) {
            params.orderBy = orderMatch[1];
            params.orderDirection = orderMatch[2]?.toUpperCase() as 'ASC' | 'DESC' || 'ASC';
        }

        return params;
    }

    /**
     * Extract time range from prompt
     */
    private extractTimeRange(prompt: string): TimeRange | undefined {
        // Last N days
        let match = prompt.match(/last\s+(\d+)\s+(day|week|month|year|hour|minute)s?/i);
        if (match) {
            return {
                type: 'relative',
                value: parseInt(match[1], 10),
                unit: match[2].toLowerCase() as TimeUnit
            };
        }

        // Today, yesterday, this week, etc.
        match = prompt.match(/(?:this\s+(\w+)|today|yesterday)/i);
        if (match) {
            const period = match[1] || match[0];
            return {
                type: 'named',
                period: period.toLowerCase()
            };
        }

        // Specific dates
        match = prompt.match(/(?:since|after|from)\s+(\d{4}-\d{2}-\d{2})/i);
        if (match) {
            return {
                type: 'absolute',
                start: match[1]
            };
        }

        return undefined;
    }

    /**
     * Extract existing SQL query from prompt (if any)
     */
    private extractExistingSQLQuery(prompt: string): string | undefined {
        // Look for SQL keywords
        const sqlKeywords = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER'];
        
        for (const keyword of sqlKeywords) {
            const regex = new RegExp(`(${keyword}\\s+.+?)(?:;|$)`, 'is');
            const match = prompt.match(regex);
            if (match) {
                return match[1].trim();
            }
        }

        return undefined;
    }

    /**
     * Check if a prompt matches any of the given patterns
     */
    private matchesPattern(prompt: string, patterns: RegExp[]): boolean {
        return patterns.some(pattern => pattern.test(prompt));
    }

    /**
     * Determine if the intent requires user confirmation
     */
    private requiresConfirmation(intent: QueryIntent): boolean {
        return intent === QueryIntent.MODIFY_DATA;
    }

    /**
     * Generate SQL from natural language (simple version)
     * In production, this would call an AI service
     */
    async generateSQL(parsedQuery: ParsedQuery, schemaContext?: SchemaContext): Promise<string | null> {
        const { intent, parameters } = parsedQuery;

        // Simple SQL generation for common patterns
        if (intent === QueryIntent.RETRIEVE_DATA && parameters.tableName) {
            let sql = `SELECT *\nFROM ${parameters.tableName}`;

            if (parameters.condition) {
                sql += `\nWHERE ${parameters.condition}`;
            }

            if (parameters.timeRange) {
                const timeCondition = this.generateTimeCondition(parameters.timeRange, schemaContext);
                if (timeCondition) {
                    sql += sql.includes('WHERE') ? `\n  AND ${timeCondition}` : `\nWHERE ${timeCondition}`;
                }
            }

            if (parameters.orderBy) {
                sql += `\nORDER BY ${parameters.orderBy} ${parameters.orderDirection || 'ASC'}`;
            }

            if (parameters.limit) {
                sql += `\nLIMIT ${parameters.limit}`;
            }

            return sql;
        }

        if (intent === QueryIntent.COUNT && parameters.tableName) {
            let sql = `SELECT COUNT(*) as total\nFROM ${parameters.tableName}`;

            if (parameters.condition) {
                sql += `\nWHERE ${parameters.condition}`;
            }

            return sql;
        }

        // For complex queries, we would need AI assistance
        return null;
    }

    /**
     * Generate time condition SQL
     */
    private generateTimeCondition(timeRange: TimeRange, schemaContext?: SchemaContext): string | null {
        const dateColumn = this.guessDateColumn(schemaContext);
        if (!dateColumn) {
            return null;
        }

        if (timeRange.type === 'relative') {
            return `${dateColumn} >= NOW() - INTERVAL ${timeRange.value} ${timeRange.unit.toUpperCase()}`;
        }

        if (timeRange.type === 'named') {
            switch (timeRange.period) {
                case 'today':
                    return `DATE(${dateColumn}) = CURDATE()`;
                case 'yesterday':
                    return `DATE(${dateColumn}) = CURDATE() - INTERVAL 1 DAY`;
                case 'week':
                case 'this week':
                    return `YEARWEEK(${dateColumn}) = YEARWEEK(NOW())`;
                case 'month':
                case 'this month':
                    return `YEAR(${dateColumn}) = YEAR(NOW()) AND MONTH(${dateColumn}) = MONTH(NOW())`;
                default:
                    return null;
            }
        }

        if (timeRange.type === 'absolute' && timeRange.start) {
            return `${dateColumn} >= '${timeRange.start}'`;
        }

        return null;
    }

    /**
     * Guess the date/timestamp column from schema
     */
    private guessDateColumn(_schemaContext?: SchemaContext): string | null {
        // TODO: Implement schema-aware date column detection
        // For now, return a sensible default
        return 'created_at';
    }
}

// Types

export enum QueryIntent {
    RETRIEVE_DATA = 'retrieve_data',
    COUNT = 'count',
    ANALYZE = 'analyze',
    EXPLAIN = 'explain',
    OPTIMIZE = 'optimize',
    SCHEMA_INFO = 'schema_info',
    MONITOR = 'monitor',
    MODIFY_DATA = 'modify_data',
    GENERAL = 'general'
}

export interface ParsedQuery {
    originalPrompt: string;
    intent: QueryIntent;
    parameters: QueryParameters;
    sqlQuery?: string;
    requiresConfirmation: boolean;
}

export interface QueryParameters {
    tableName?: string;
    columns?: string[];
    condition?: string;
    timeRange?: TimeRange;
    limit?: number;
    orderBy?: string;
    orderDirection?: 'ASC' | 'DESC';
}

export interface TimeRange {
    type: 'relative' | 'named' | 'absolute';
    value?: number;
    unit?: TimeUnit;
    period?: string;
    start?: string;
    end?: string;
}

export type TimeUnit = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

export interface SchemaContext {
    tables: Array<{
        name: string;
        columns: Array<{
            name: string;
            type: string;
        }>;
    }>;
}

