/**
 * Core service interfaces for MyDBA
 * Defines contracts for all major services to enable mocking and loose coupling
 */

import * as vscode from 'vscode';
import { IDatabaseAdapter } from '../adapters/database-adapter';

/**
 * Base interface for all services with lifecycle management
 */
export interface IService {
    /**
     * Initialize the service (called after construction)
     */
    init?(): Promise<void>;

    /**
     * Clean up resources
     */
    dispose?(): void | Promise<void>;
}

/**
 * Configuration service interface
 */
export interface IConfigurationService extends IService {
    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue: T): T;
    update(key: string, value: unknown): Promise<void>;
    has(key: string): boolean;
}

/**
 * Secret storage service interface
 */
export interface ISecretStorageService extends IService {
    store(key: string, value: string): Promise<void>;
    retrieve(key: string): Promise<string | undefined>;
    delete(key: string): Promise<void>;
}

/**
 * Connection configuration
 */
export interface IConnectionConfig {
    id: string;
    name: string;
    type: 'mysql' | 'mariadb' | 'postgresql' | 'redis' | 'valkey';
    host: string;
    port: number;
    username: string;
    database?: string;
    ssl?: boolean;
    environment: 'dev' | 'staging' | 'prod';
}

/**
 * Connection manager interface
 */
export interface IConnectionManager extends IService {
    addConnection(config: IConnectionConfig, password: string): Promise<void>;
    removeConnection(id: string): Promise<void>;
    getConnection(id: string): Promise<IDatabaseAdapter | undefined>;
    listConnections(): IConnectionConfig[];
    testConnection(config: IConnectionConfig, password: string): Promise<boolean>;
}

/**
 * Query result interface
 */
export interface IQueryResult {
    rows: Record<string, unknown>[];
    fields: Record<string, unknown>[];
    affectedRows?: number;
    insertId?: number;
    duration: number;
}

/**
 * Query service interface
 */
export interface IQueryService extends IService {
    execute(connectionId: string, query: string): Promise<IQueryResult>;
    explain(connectionId: string, query: string): Promise<unknown>;
    cancel(connectionId: string, queryId: string): Promise<void>;
}

/**
 * Query analysis result
 */
export interface IQueryAnalysis {
    query: string;
    issues: IQueryIssue[];
    suggestions: IQuerySuggestion[];
    complexity: 'low' | 'medium' | 'high';
    estimatedCost: number;
}

/**
 * Query issue
 */
export interface IQueryIssue {
    type: string;
    severity: 'info' | 'warning' | 'error';
    message: string;
    line?: number;
    column?: number;
}

/**
 * Query suggestion
 */
export interface IQuerySuggestion {
    type: string;
    message: string;
    fixedQuery?: string;
    indexSuggestion?: string;
}

/**
 * Query analyzer interface
 */
export interface IQueryAnalyzer extends IService {
    analyze(query: string, schemaContext?: unknown): Promise<IQueryAnalysis>;
    validateSyntax(query: string): Promise<boolean>;
}

/**
 * AI request options
 */
export interface IAIRequestOptions {
    query?: string;
    context?: unknown;
    anonymize?: boolean;
    includeSchema?: boolean;
    temperature?: number;
    maxTokens?: number;
}

/**
 * AI response
 */
export interface IAIResponse {
    content: string;
    citations?: string[];
    provider: string;
    model: string;
    tokensUsed?: number;
    cached: boolean;
}

/**
 * AI service interface
 */
export interface IAIService extends IService {
    analyzeQuery(query: string, options?: IAIRequestOptions): Promise<IAIResponse>;
    explainPlan(explainOutput: unknown, options?: IAIRequestOptions): Promise<IAIResponse>;
    chat(message: string, options?: IAIRequestOptions): Promise<IAIResponse>;
    isAvailable(): Promise<boolean>;
}

/**
 * Optimization suggestion
 */
export interface IOptimizationSuggestion {
    type: 'index' | 'rewrite' | 'config';
    title: string;
    description: string;
    impact: 'low' | 'medium' | 'high';
    sql?: string;
    estimatedImprovement?: string;
    risk: 'safe' | 'caution' | 'critical';
}

/**
 * Optimization service interface
 */
export interface IOptimizationService extends IService {
    generateSuggestions(query: string, explainOutput: unknown): Promise<IOptimizationSuggestion[]>;
    applyOptimization(connectionId: string, suggestion: IOptimizationSuggestion): Promise<boolean>;
    validateOptimization(suggestion: IOptimizationSuggestion): Promise<boolean>;
    getDryRunSQL(suggestion: IOptimizationSuggestion): string;
}

/**
 * Event priority levels
 */
export enum EventPriority {
    LOW = 0,
    NORMAL = 1,
    HIGH = 2,
    CRITICAL = 3
}

/**
 * Event envelope with metadata
 */
export interface IEvent<T = unknown> {
    type: string;
    data: T;
    priority: EventPriority;
    timestamp: number;
    id: string;
}

/**
 * Event bus interface
 */
export interface IEventBus extends IService {
    on<T>(eventType: string, handler: (event: IEvent<T>) => void | Promise<void>): vscode.Disposable;
    emit<T>(eventType: string, data: T, priority?: EventPriority): Promise<void>;
    once<T>(eventType: string, handler: (event: IEvent<T>) => void | Promise<void>): void;
    getHistory(count?: number): IEvent[];
}

/**
 * Cache entry with metadata
 */
export interface ICacheEntry<T> {
    value: T;
    timestamp: number;
    ttl: number;
    version: number;
}

/**
 * Cache manager interface
 */
export interface ICacheManager extends IService {
    get<T>(key: string): T | undefined;
    set<T>(key: string, value: T, ttl?: number): void;
    has(key: string): boolean;
    invalidate(key: string): void;
    invalidatePattern(pattern: RegExp): void;
    clear(): void;
    getStats(): { hits: number; misses: number; hitRate: number };
}

/**
 * Transaction options
 */
export interface ITransactionOptions {
    dryRun?: boolean;
    timeout?: number;
}

/**
 * Transaction result
 */
export interface ITransactionResult {
    success: boolean;
    rollback: boolean;
    error?: Error;
    affectedObjects?: string[];
}

/**
 * Transaction manager interface
 */
export interface ITransactionManager extends IService {
    execute(
        connectionId: string,
        operations: Array<() => Promise<unknown>>,
        options?: ITransactionOptions
    ): Promise<ITransactionResult>;
    rollbackByTransactionId(transactionId: string): Promise<void>;
    rollback(connectionId: string): Promise<void>;
    checkIdempotency(connectionId: string, operation: string): Promise<boolean>;
}

/**
 * Performance span for tracing
 */
export interface IPerformanceSpan {
    operation: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    metadata?: Record<string, unknown>;
    parent?: string;
    children: string[];
}

/**
 * Performance monitor interface
 */
export interface IPerformanceMonitor extends IService {
    startSpan(operation: string, parent?: string): string;
    endSpan(spanId: string, metadata?: Record<string, unknown>): void;
    getSpan(spanId: string): IPerformanceSpan | undefined;
    getAllSpans(): IPerformanceSpan[];
    checkBudget(operation: string, duration: number): boolean;
    exportTraces(format: 'json' | 'opentelemetry'): unknown;
}

/**
 * Error categories
 */
export enum ErrorCategory {
    RECOVERABLE = 'recoverable',
    FATAL = 'fatal',
    USER_ERROR = 'user_error',
    NETWORK = 'network',
    TIMEOUT = 'timeout',
    AUTH = 'auth'
}

/**
 * Base error interface
 */
export interface IMyDBAError extends Error {
    category: ErrorCategory;
    code: string;
    userMessage: string;
    remediation?: string;
    retryable: boolean;
    context?: Record<string, unknown>;
}

/**
 * Error reporter interface
 */
export interface IErrorReporter extends IService {
    report(error: IMyDBAError): Promise<void>;
    getErrorHistory(count?: number): IMyDBAError[];
}
