/**
 * Custom error classes for MyDBA with standardized error handling
 */

import { ErrorCategory, IMyDBAError } from './interfaces';

/**
 * Base error class for all MyDBA errors
 */
export class MyDBAError extends Error implements IMyDBAError {
    constructor(
        message: string,
        public category: ErrorCategory,
        public code: string,
        public userMessage: string,
        public retryable: boolean = false,
        public remediation?: string,
        public context?: Record<string, unknown>
    ) {
        super(message);
        this.name = 'MyDBAError';
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Connection-related errors
 */
export class ConnectionError extends MyDBAError {
    constructor(
        message: string,
        public host: string,
        public port: number,
        code: string = 'CONNECTION_ERROR',
        remediation?: string
    ) {
        super(
            message,
            ErrorCategory.NETWORK,
            code,
            `Failed to connect to database at ${host}:${port}`,
            true,
            remediation || 'Check that the database server is running and accessible',
            { host, port }
        );
        this.name = 'ConnectionError';
    }
}

/**
 * Query execution errors
 */
export class QueryExecutionError extends MyDBAError {
    constructor(
        message: string,
        public query: string,
        code: string = 'QUERY_ERROR',
        remediation?: string
    ) {
        super(
            message,
            ErrorCategory.USER_ERROR,
            code,
            'Query execution failed',
            false,
            remediation || 'Check query syntax and database schema',
            { query: query.substring(0, 200) }
        );
        this.name = 'QueryExecutionError';
    }
}

/**
 * Adapter-related errors
 */
export class AdapterError extends MyDBAError {
    constructor(
        message: string,
        public adapterType: string,
        code: string = 'ADAPTER_ERROR'
    ) {
        super(
            message,
            ErrorCategory.FATAL,
            code,
            `Database adapter error: ${adapterType}`,
            false,
            'This may indicate an internal error. Please report this issue.',
            { adapterType }
        );
        this.name = 'AdapterError';
    }
}

/**
 * Unsupported version errors
 */
export class UnsupportedVersionError extends MyDBAError {
    constructor(
        public dbType: string,
        public version: string,
        public minVersion: string
    ) {
        super(
            `${dbType} version ${version} is not supported`,
            ErrorCategory.USER_ERROR,
            'UNSUPPORTED_VERSION',
            `${dbType} ${version} is not supported. Minimum version: ${minVersion}`,
            false,
            `Upgrade to ${dbType} ${minVersion} or higher`,
            { dbType, version, minVersion }
        );
        this.name = 'UnsupportedVersionError';
    }
}

/**
 * Feature not supported errors
 */
export class FeatureNotSupportedError extends MyDBAError {
    constructor(
        public feature: string,
        public dbType: string
    ) {
        super(
            `Feature ${feature} is not supported on ${dbType}`,
            ErrorCategory.USER_ERROR,
            'FEATURE_NOT_SUPPORTED',
            `${feature} is not available for ${dbType}`,
            false,
            'This feature requires a different database version or type',
            { feature, dbType }
        );
        this.name = 'FeatureNotSupportedError';
    }
}

/**
 * AI service errors
 */
export class AIServiceError extends MyDBAError {
    constructor(
        message: string,
        public provider: string,
        code: string = 'AI_ERROR',
        retryable: boolean = true
    ) {
        super(
            message,
            ErrorCategory.NETWORK,
            code,
            `AI service error (${provider})`,
            retryable,
            retryable ? 'The AI service may be temporarily unavailable. Please try again.' : undefined,
            { provider }
        );
        this.name = 'AIServiceError';
    }
}

/**
 * RAG service errors
 */
export class RAGError extends MyDBAError {
    constructor(
        message: string,
        code: string = 'RAG_ERROR'
    ) {
        super(
            message,
            ErrorCategory.RECOVERABLE,
            code,
            'Documentation retrieval failed',
            true,
            'The system will continue without documentation context',
            {}
        );
        this.name = 'RAGError';
    }
}

/**
 * Authentication errors
 */
export class AuthenticationError extends MyDBAError {
    constructor(
        message: string,
        public host: string
    ) {
        super(
            message,
            ErrorCategory.AUTH,
            'AUTH_ERROR',
            `Authentication failed for ${host}`,
            false,
            'Check your username and password',
            { host }
        );
        this.name = 'AuthenticationError';
    }
}

/**
 * Timeout errors
 */
export class TimeoutError extends MyDBAError {
    constructor(
        operation: string,
        public timeoutMs: number
    ) {
        super(
            `Operation timed out after ${timeoutMs}ms`,
            ErrorCategory.TIMEOUT,
            'TIMEOUT',
            `${operation} timed out`,
            true,
            'Try again or increase the timeout setting',
            { operation, timeoutMs }
        );
        this.name = 'TimeoutError';
    }
}

/**
 * Validation errors
 */
export class ValidationError extends MyDBAError {
    constructor(
        field: string,
        message: string
    ) {
        super(
            `Validation failed for ${field}: ${message}`,
            ErrorCategory.USER_ERROR,
            'VALIDATION_ERROR',
            `Invalid ${field}`,
            false,
            message,
            { field }
        );
        this.name = 'ValidationError';
    }
}

/**
 * Security errors
 */
export class SecurityError extends MyDBAError {
    constructor(
        message: string,
        public securityType: string
    ) {
        super(
            message,
            ErrorCategory.FATAL,
            'SECURITY_ERROR',
            'Security validation failed',
            false,
            'This operation has been blocked for security reasons',
            { securityType }
        );
        this.name = 'SecurityError';
    }
}

/**
 * Retry helper with exponential backoff
 */
export async function retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelayMs: number = 1000,
    isRetryable: (error: unknown) => boolean = (error) => {
        if (error instanceof MyDBAError) {
            return error.retryable;
        }
        return false;
    }
): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;

            if (attempt === maxRetries || !isRetryable(error)) {
                throw error;
            }

            // Exponential backoff with jitter
            const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

/**
 * Convert unknown errors to MyDBAError
 */
export function normalizeError(error: unknown): MyDBAError {
    if (error instanceof MyDBAError) {
        return error;
    }

    if (error instanceof Error) {
        return new MyDBAError(
            error.message,
            ErrorCategory.FATAL,
            'UNKNOWN_ERROR',
            'An unexpected error occurred',
            false,
            'Please report this issue if it persists',
            { originalError: error.name }
        );
    }

    return new MyDBAError(
        String(error),
        ErrorCategory.FATAL,
        'UNKNOWN_ERROR',
        'An unexpected error occurred',
        false,
        'Please report this issue if it persists'
    );
}
