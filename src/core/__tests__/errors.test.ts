import {
    MyDBAError,
    ConnectionError,
    QueryExecutionError,
    AdapterError,
    UnsupportedVersionError,
    FeatureNotSupportedError,
    AIServiceError,
    RAGError,
    AuthenticationError,
    TimeoutError,
    ValidationError,
    SecurityError,
    retryWithBackoff,
    normalizeError
} from '../errors';
import { ErrorCategory } from '../interfaces';

describe('MyDBA Error Classes', () => {
    describe('MyDBAError', () => {
        it('should create a base error with all properties', () => {
            const error = new MyDBAError(
                'Test error',
                ErrorCategory.FATAL,
                'TEST_CODE',
                'User-friendly message',
                true,
                'Fix by doing X',
                { key: 'value' }
            );

            expect(error.message).toBe('Test error');
            expect(error.category).toBe(ErrorCategory.FATAL);
            expect(error.code).toBe('TEST_CODE');
            expect(error.userMessage).toBe('User-friendly message');
            expect(error.retryable).toBe(true);
            expect(error.remediation).toBe('Fix by doing X');
            expect(error.context).toEqual({ key: 'value' });
            expect(error.name).toBe('MyDBAError');
            expect(error.stack).toBeDefined();
        });

        it('should create error with minimal properties', () => {
            const error = new MyDBAError(
                'Minimal error',
                ErrorCategory.USER_ERROR,
                'MIN_CODE',
                'Minimal message'
            );

            expect(error.retryable).toBe(false);
            expect(error.remediation).toBeUndefined();
            expect(error.context).toBeUndefined();
        });

        it('should extend Error', () => {
            const error = new MyDBAError('Test', ErrorCategory.FATAL, 'CODE', 'Message');
            expect(error instanceof Error).toBe(true);
            expect(error instanceof MyDBAError).toBe(true);
        });
    });

    describe('ConnectionError', () => {
        it('should create connection error with all fields', () => {
            const error = new ConnectionError(
                'Connection failed',
                'localhost',
                3306,
                'CONN_TIMEOUT',
                'Custom remediation'
            );

            expect(error.message).toBe('Connection failed');
            expect(error.host).toBe('localhost');
            expect(error.port).toBe(3306);
            expect(error.code).toBe('CONN_TIMEOUT');
            expect(error.category).toBe(ErrorCategory.NETWORK);
            expect(error.userMessage).toBe('Failed to connect to database at localhost:3306');
            expect(error.retryable).toBe(true);
            expect(error.remediation).toBe('Custom remediation');
            expect(error.context).toEqual({ host: 'localhost', port: 3306 });
            expect(error.name).toBe('ConnectionError');
        });

        it('should use default code and remediation', () => {
            const error = new ConnectionError('Failed', 'db.example.com', 5432);

            expect(error.code).toBe('CONNECTION_ERROR');
            expect(error.remediation).toBe('Check that the database server is running and accessible');
        });
    });

    describe('QueryExecutionError', () => {
        it('should create query error with truncated query context', () => {
            const longQuery = 'SELECT * FROM users WHERE ' + 'x'.repeat(300);
            const error = new QueryExecutionError(
                'Syntax error',
                longQuery,
                'SYNTAX_ERROR',
                'Check SQL syntax'
            );

            expect(error.message).toBe('Syntax error');
            expect(error.query).toBe(longQuery);
            expect(error.code).toBe('SYNTAX_ERROR');
            expect(error.category).toBe(ErrorCategory.USER_ERROR);
            expect(error.userMessage).toBe('Query execution failed');
            expect(error.retryable).toBe(false);
            expect(error.remediation).toBe('Check SQL syntax');
            expect(error.context?.query).toHaveLength(200);
            expect(error.name).toBe('QueryExecutionError');
        });

        it('should use default code and remediation', () => {
            const error = new QueryExecutionError('Failed', 'SELECT 1');

            expect(error.code).toBe('QUERY_ERROR');
            expect(error.remediation).toBe('Check query syntax and database schema');
        });
    });

    describe('AdapterError', () => {
        it('should create adapter error', () => {
            const error = new AdapterError('Adapter init failed', 'mysql', 'INIT_ERROR');

            expect(error.message).toBe('Adapter init failed');
            expect(error.adapterType).toBe('mysql');
            expect(error.code).toBe('INIT_ERROR');
            expect(error.category).toBe(ErrorCategory.FATAL);
            expect(error.userMessage).toBe('Database adapter error: mysql');
            expect(error.retryable).toBe(false);
            expect(error.remediation).toBe('This may indicate an internal error. Please report this issue.');
            expect(error.context).toEqual({ adapterType: 'mysql' });
            expect(error.name).toBe('AdapterError');
        });

        it('should use default code', () => {
            const error = new AdapterError('Failed', 'postgres');
            expect(error.code).toBe('ADAPTER_ERROR');
        });
    });

    describe('UnsupportedVersionError', () => {
        it('should create unsupported version error', () => {
            const error = new UnsupportedVersionError('MySQL', '5.5', '5.7');

            expect(error.message).toBe('MySQL version 5.5 is not supported');
            expect(error.dbType).toBe('MySQL');
            expect(error.version).toBe('5.5');
            expect(error.minVersion).toBe('5.7');
            expect(error.category).toBe(ErrorCategory.USER_ERROR);
            expect(error.code).toBe('UNSUPPORTED_VERSION');
            expect(error.userMessage).toBe('MySQL 5.5 is not supported. Minimum version: 5.7');
            expect(error.retryable).toBe(false);
            expect(error.remediation).toBe('Upgrade to MySQL 5.7 or higher');
            expect(error.context).toEqual({ dbType: 'MySQL', version: '5.5', minVersion: '5.7' });
            expect(error.name).toBe('UnsupportedVersionError');
        });
    });

    describe('FeatureNotSupportedError', () => {
        it('should create feature not supported error', () => {
            const error = new FeatureNotSupportedError('Transactions', 'Redis');

            expect(error.message).toBe('Feature Transactions is not supported on Redis');
            expect(error.feature).toBe('Transactions');
            expect(error.dbType).toBe('Redis');
            expect(error.category).toBe(ErrorCategory.USER_ERROR);
            expect(error.code).toBe('FEATURE_NOT_SUPPORTED');
            expect(error.userMessage).toBe('Transactions is not available for Redis');
            expect(error.retryable).toBe(false);
            expect(error.remediation).toBe('This feature requires a different database version or type');
            expect(error.context).toEqual({ feature: 'Transactions', dbType: 'Redis' });
            expect(error.name).toBe('FeatureNotSupportedError');
        });
    });

    describe('AIServiceError', () => {
        it('should create retryable AI error', () => {
            const error = new AIServiceError('Rate limit', 'OpenAI', 'RATE_LIMIT', true);

            expect(error.message).toBe('Rate limit');
            expect(error.provider).toBe('OpenAI');
            expect(error.code).toBe('RATE_LIMIT');
            expect(error.category).toBe(ErrorCategory.NETWORK);
            expect(error.userMessage).toBe('AI service error (OpenAI)');
            expect(error.retryable).toBe(true);
            expect(error.remediation).toBe('The AI service may be temporarily unavailable. Please try again.');
            expect(error.context).toEqual({ provider: 'OpenAI' });
            expect(error.name).toBe('AIServiceError');
        });

        it('should create non-retryable AI error', () => {
            const error = new AIServiceError('Invalid API key', 'Anthropic', 'AUTH_ERROR', false);

            expect(error.retryable).toBe(false);
            expect(error.remediation).toBeUndefined();
        });

        it('should use defaults', () => {
            const error = new AIServiceError('Failed', 'GPT');
            expect(error.code).toBe('AI_ERROR');
            expect(error.retryable).toBe(true);
        });
    });

    describe('RAGError', () => {
        it('should create RAG error', () => {
            const error = new RAGError('Doc retrieval failed', 'RETRIEVAL_ERROR');

            expect(error.message).toBe('Doc retrieval failed');
            expect(error.code).toBe('RETRIEVAL_ERROR');
            expect(error.category).toBe(ErrorCategory.RECOVERABLE);
            expect(error.userMessage).toBe('Documentation retrieval failed');
            expect(error.retryable).toBe(true);
            expect(error.remediation).toBe('The system will continue without documentation context');
            expect(error.context).toEqual({});
            expect(error.name).toBe('RAGError');
        });

        it('should use default code', () => {
            const error = new RAGError('Failed');
            expect(error.code).toBe('RAG_ERROR');
        });
    });

    describe('AuthenticationError', () => {
        it('should create authentication error', () => {
            const error = new AuthenticationError('Invalid credentials', 'db.example.com');

            expect(error.message).toBe('Invalid credentials');
            expect(error.host).toBe('db.example.com');
            expect(error.category).toBe(ErrorCategory.AUTH);
            expect(error.code).toBe('AUTH_ERROR');
            expect(error.userMessage).toBe('Authentication failed for db.example.com');
            expect(error.retryable).toBe(false);
            expect(error.remediation).toBe('Check your username and password');
            expect(error.context).toEqual({ host: 'db.example.com' });
            expect(error.name).toBe('AuthenticationError');
        });
    });

    describe('TimeoutError', () => {
        it('should create timeout error', () => {
            const error = new TimeoutError('Query execution', 5000);

            expect(error.message).toBe('Operation timed out after 5000ms');
            expect(error.timeoutMs).toBe(5000);
            expect(error.category).toBe(ErrorCategory.TIMEOUT);
            expect(error.code).toBe('TIMEOUT');
            expect(error.userMessage).toBe('Query execution timed out');
            expect(error.retryable).toBe(true);
            expect(error.remediation).toBe('Try again or increase the timeout setting');
            expect(error.context).toEqual({ operation: 'Query execution', timeoutMs: 5000 });
            expect(error.name).toBe('TimeoutError');
        });
    });

    describe('ValidationError', () => {
        it('should create validation error', () => {
            const error = new ValidationError('email', 'must be a valid email address');

            expect(error.message).toBe('Validation failed for email: must be a valid email address');
            expect(error.category).toBe(ErrorCategory.USER_ERROR);
            expect(error.code).toBe('VALIDATION_ERROR');
            expect(error.userMessage).toBe('Invalid email');
            expect(error.retryable).toBe(false);
            expect(error.remediation).toBe('must be a valid email address');
            expect(error.context).toEqual({ field: 'email' });
            expect(error.name).toBe('ValidationError');
        });
    });

    describe('SecurityError', () => {
        it('should create security error', () => {
            const error = new SecurityError('SQL injection detected', 'SQL_INJECTION');

            expect(error.message).toBe('SQL injection detected');
            expect(error.securityType).toBe('SQL_INJECTION');
            expect(error.category).toBe(ErrorCategory.FATAL);
            expect(error.code).toBe('SECURITY_ERROR');
            expect(error.userMessage).toBe('Security validation failed');
            expect(error.retryable).toBe(false);
            expect(error.remediation).toBe('This operation has been blocked for security reasons');
            expect(error.context).toEqual({ securityType: 'SQL_INJECTION' });
            expect(error.name).toBe('SecurityError');
        });
    });

    describe('retryWithBackoff', () => {
        it('should succeed on first attempt', async () => {
            const operation = jest.fn().mockResolvedValue('success');

            const result = await retryWithBackoff(operation);

            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(1);
        });

        it('should retry retryable errors', async () => {
            const operation = jest.fn()
                .mockRejectedValueOnce(new TimeoutError('Test', 1000))
                .mockResolvedValue('success');

            const result = await retryWithBackoff(operation, 3, 10);

            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(2);
        });

        it('should not retry non-retryable errors', async () => {
            const error = new ValidationError('field', 'invalid');
            const operation = jest.fn().mockRejectedValue(error);

            await expect(retryWithBackoff(operation)).rejects.toThrow(error);
            expect(operation).toHaveBeenCalledTimes(1);
        });

        it('should throw after max retries', async () => {
            const error = new TimeoutError('Test', 1000);
            const operation = jest.fn().mockRejectedValue(error);

            await expect(retryWithBackoff(operation, 2, 10)).rejects.toThrow(error);
            expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
        });

        it('should use custom isRetryable function', async () => {
            const error = new Error('Custom error');
            const operation = jest.fn()
                .mockRejectedValueOnce(error)
                .mockResolvedValue('success');

            const isRetryable = () => true;
            const result = await retryWithBackoff(operation, 3, 10, isRetryable);

            expect(result).toBe('success');
            expect(operation).toHaveBeenCalledTimes(2);
        });
    });

    describe('normalizeError', () => {
        it('should return MyDBAError as-is', () => {
            const error = new ConnectionError('Test', 'localhost', 3306);
            const normalized = normalizeError(error);

            expect(normalized).toBe(error);
        });

        it('should convert standard Error to MyDBAError', () => {
            const error = new Error('Standard error');
            const normalized = normalizeError(error);

            expect(normalized instanceof MyDBAError).toBe(true);
            expect(normalized.message).toBe('Standard error');
            expect(normalized.category).toBe(ErrorCategory.FATAL);
            expect(normalized.code).toBe('UNKNOWN_ERROR');
            expect(normalized.userMessage).toBe('An unexpected error occurred');
            expect(normalized.retryable).toBe(false);
            expect(normalized.context?.originalError).toBe('Error');
        });

        it('should convert string to MyDBAError', () => {
            const normalized = normalizeError('String error');

            expect(normalized instanceof MyDBAError).toBe(true);
            expect(normalized.message).toBe('String error');
            expect(normalized.category).toBe(ErrorCategory.FATAL);
            expect(normalized.code).toBe('UNKNOWN_ERROR');
        });

        it('should convert null to MyDBAError', () => {
            const normalized = normalizeError(null);

            expect(normalized instanceof MyDBAError).toBe(true);
            expect(normalized.message).toBe('null');
        });

        it('should convert undefined to MyDBAError', () => {
            const normalized = normalizeError(undefined);

            expect(normalized instanceof MyDBAError).toBe(true);
            expect(normalized.message).toBe('undefined');
        });

        it('should convert number to MyDBAError', () => {
            const normalized = normalizeError(404);

            expect(normalized instanceof MyDBAError).toBe(true);
            expect(normalized.message).toBe('404');
        });
    });
});
