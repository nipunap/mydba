/**
 * AI Provider Types
 */

export interface SchemaContext {
    database: string;
    tables: TableInfo[];
}

export interface TableInfo {
    name: string;
    columns: ColumnInfo[];
    indexes: IndexInfo[];
    rowCount?: number;
}

export interface ColumnInfo {
    name: string;
    type: string;
    nullable: boolean;
    key?: string;
}

export interface IndexInfo {
    name: string;
    columns: string[];
    type: string;
    unique: boolean;
}

export interface QueryContext {
    query: string;
    anonymizedQuery?: string;
    schema?: SchemaContext;
    ragDocs?: RAGDocument[];
}

export interface RAGDocument {
    id: string;
    title: string;
    keywords: string[];
    content: string;
    source: string;
    version: string;
}

export interface AntiPattern {
    type: string;
    severity: 'critical' | 'warning' | 'info';
    message: string;
    location?: {
        line?: number;
        column?: number;
    };
    suggestion?: string;
}

export interface AIAnalysisResult {
    summary: string;
    antiPatterns: AntiPattern[];
    optimizationSuggestions: OptimizationSuggestion[];
    estimatedComplexity?: number;
    citations?: Citation[];
}

export interface OptimizationSuggestion {
    title: string;
    description: string;
    impact: 'high' | 'medium' | 'low';
    difficulty: 'easy' | 'medium' | 'hard';
    before?: string;
    after?: string;
}

export interface Citation {
    title: string;
    source: string;
    relevance: number;
}

export interface AIProviderConfig {
    provider: 'auto' | 'vscode-lm' | 'openai' | 'anthropic' | 'ollama' | 'none';
    enabled: boolean;
    anonymizeQueries: boolean;
    includeSchemaContext: boolean;
    openaiModel?: string;
    anthropicModel?: string;
    ollamaEndpoint?: string;
    ollamaModel?: string;
}

/**
 * AI Provider Interface
 */
export interface AIProvider {
    readonly name: string;
    isAvailable(): Promise<boolean>;
    analyzeQuery(query: string, context: QueryContext): Promise<AIAnalysisResult>;
}
