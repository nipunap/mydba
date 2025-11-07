/**
 * Application Constants
 *
 * Centralized location for all constants used throughout the extension
 */

// URLs
export const URLS = {
    GITHUB_REPO: 'https://github.com/nipunap/mydba',
    GITHUB_ISSUES: 'https://github.com/nipunap/mydba/issues',
    DOCUMENTATION: 'https://github.com/nipunap/mydba#readme',
    MYSQL_DOCS: 'https://dev.mysql.com/doc/',
    MARIADB_DOCS: 'https://mariadb.com/kb/en/',
    PRIVACY_POLICY: 'https://github.com/nipunap/mydba/blob/main/PRIVACY.md',
    SECURITY_POLICY: 'https://github.com/nipunap/mydba/blob/main/SECURITY.md'
} as const;

// Timeouts (milliseconds)
export const TIMEOUTS = {
    CONNECTION: 30000, // 30 seconds
    QUERY_EXECUTION: 30000, // 30 seconds
    AI_REQUEST: 60000, // 60 seconds
    METRICS_REFRESH: 5000, // 5 seconds
    PROCESS_LIST_REFRESH: 5000, // 5 seconds
    EXPLAIN_TIMEOUT: 30000, // 30 seconds
    PROFILING_TIMEOUT: 60000 // 60 seconds
} as const;

// Limits
export const LIMITS = {
    MAX_CONNECTIONS: 10,
    MAX_QUERY_HISTORY: 100,
    MAX_RESULT_ROWS: 1000,
    MAX_PREVIEW_ROWS: 1000,
    MAX_DML_AFFECT_ROWS: 1000,
    MAX_AUDIT_LOG_SIZE: 10 * 1024 * 1024, // 10MB
    MAX_EXPORT_SIZE: 10 * 1024 * 1024, // 10MB
    RATE_LIMIT_QUEUE_SIZE: 100
} as const;

// Cache TTLs (milliseconds)
export const CACHE_TTL = {
    SCHEMA: 60 * 60 * 1000, // 1 hour
    QUERY_RESULT: 5 * 60 * 1000, // 5 minutes
    EXPLAIN: 10 * 60 * 1000, // 10 minutes
    VARIABLES: 5 * 60 * 1000, // 5 minutes
    METRICS: 30 * 1000, // 30 seconds
    RAG_DOCS: -1 // Persistent (no expiration)
} as const;

// Database Version Support
export const SUPPORTED_VERSIONS = {
    MYSQL: {
        MIN: '8.0.0',
        RECOMMENDED: '8.0.35',
        LTS_VERSIONS: ['8.0', '8.4']
    },
    MARIADB: {
        MIN: '10.6.0',
        RECOMMENDED: '10.11.0',
        LTS_VERSIONS: ['10.6', '10.11', '11.x']
    }
} as const;

// EOL Versions (End of Life)
export const EOL_VERSIONS = {
    MYSQL: ['5.6', '5.7'],
    MARIADB: ['10.4', '10.5']
} as const;

// Default Configuration
export const DEFAULTS = {
    ENVIRONMENT: 'dev' as 'dev' | 'staging' | 'prod',
    PORT: 3306,
    HOST: '127.0.0.1',
    REFRESH_INTERVAL: 5000,
    SLOW_QUERY_THRESHOLD: 1000, // milliseconds
    AI_ENABLED: true,
    AI_PROVIDER: 'auto' as 'auto' | 'vscode-lm' | 'openai' | 'anthropic' | 'ollama' | 'none',
    SAFE_MODE: true,
    CONFIRM_DESTRUCTIVE: true,
    WARN_MISSING_WHERE: true
} as const;

// AI Provider Configuration
export const AI_PROVIDERS = {
    VSCODE_LM: {
        NAME: 'VSCode Language Model',
        FAMILY: 'gpt-4o',
        REQUIRES_API_KEY: false
    },
    OPENAI: {
        NAME: 'OpenAI',
        DEFAULT_MODEL: 'gpt-4o-mini',
        REQUIRES_API_KEY: true
    },
    ANTHROPIC: {
        NAME: 'Anthropic Claude',
        DEFAULT_MODEL: 'claude-3-5-sonnet-20241022',
        REQUIRES_API_KEY: true
    },
    OLLAMA: {
        NAME: 'Ollama (Local)',
        DEFAULT_MODEL: 'llama3.1',
        DEFAULT_ENDPOINT: 'http://localhost:11434',
        REQUIRES_API_KEY: false
    }
} as const;

// Rate Limits (per provider)
export const RATE_LIMITS = {
    VSCODE_LM: {
        MAX_TOKENS: 10,
        REFILL_RATE: 1, // tokens per second
        MAX_QUEUE: 50
    },
    OPENAI: {
        MAX_TOKENS: 20,
        REFILL_RATE: 2,
        MAX_QUEUE: 100
    },
    ANTHROPIC: {
        MAX_TOKENS: 15,
        REFILL_RATE: 1.5,
        MAX_QUEUE: 75
    },
    OLLAMA: {
        MAX_TOKENS: 5,
        REFILL_RATE: 0.5,
        MAX_QUEUE: 25
    }
} as const;

// Circuit Breaker Configuration
export const CIRCUIT_BREAKER = {
    FAILURE_THRESHOLD: 3,
    SUCCESS_THRESHOLD: 2,
    TIMEOUT: 30000, // 30 seconds
    RESET_TIMEOUT: 60000 // 1 minute
} as const;

// Performance Budgets
export const PERFORMANCE_BUDGETS = {
    ACTIVATION: 500, // milliseconds
    TREE_REFRESH: 200,
    QUERY_EXECUTION: 5000,
    AI_ANALYSIS: 3000,
    METRICS_COLLECTION: 1000,
    WEBVIEW_RENDER: 300
} as const;

// Alert Thresholds
export const ALERT_THRESHOLDS = {
    CONNECTION_USAGE_WARNING: 80, // percentage
    CONNECTION_USAGE_CRITICAL: 95,
    BUFFER_POOL_HIT_RATE_WARNING: 90,
    SLOW_QUERIES_THRESHOLD: 10, // per minute
    QUERY_EXECUTION_WARNING: 1000, // milliseconds
    QUERY_EXECUTION_CRITICAL: 5000
} as const;

// Storage Keys
export const STORAGE_KEYS = {
    CONNECTIONS: 'connections',
    QUERY_HISTORY: 'queryHistory',
    LAST_SELECTED_CONNECTION: 'lastSelectedConnection',
    AI_PROVIDER_CONFIG: 'aiProviderConfig',
    METRICS_TIME_RANGE: 'metricsTimeRange',
    PROCESS_LIST_GROUP_BY: 'processListGroupBy',
    ONBOARDING_COMPLETED: 'onboardingCompleted'
} as const;

// File Paths
export const FILE_PATHS = {
    AUDIT_LOG: 'mydba-audit.log',
    CACHE_DIR: '.mydba-cache',
    TEMP_DIR: '.mydba-temp'
} as const;

// Event Names
export const EVENTS = {
    CONNECTION_ADDED: 'CONNECTION_ADDED',
    CONNECTION_REMOVED: 'CONNECTION_REMOVED',
    CONNECTION_CHANGED: 'CONNECTION_CHANGED',
    QUERY_EXECUTED: 'QUERY_EXECUTED',
    QUERY_FAILED: 'QUERY_FAILED',
    AI_REQUEST_SENT: 'AI_REQUEST_SENT',
    AI_RESPONSE_RECEIVED: 'AI_RESPONSE_RECEIVED',
    AI_REQUEST_FAILED: 'AI_REQUEST_FAILED',
    METRICS_UPDATED: 'METRICS_UPDATED',
    ALERT_TRIGGERED: 'ALERT_TRIGGERED',
    CONFIG_CHANGED: 'CONFIG_CHANGED'
} as const;

// Error Messages
export const ERROR_MESSAGES = {
    NOT_CONNECTED: 'Not connected to database',
    POOL_NOT_INITIALIZED: 'Connection pool not initialized',
    INVALID_DATABASE_NAME: 'Invalid database name',
    INVALID_TABLE_NAME: 'Invalid table name',
    QUERY_TIMEOUT: 'Query execution timeout',
    CONNECTION_FAILED: 'Failed to connect to database',
    AI_UNAVAILABLE: 'AI service is unavailable',
    RATE_LIMIT_EXCEEDED: 'Rate limit exceeded',
    CIRCUIT_BREAKER_OPEN: 'Circuit breaker is open',
    UNSUPPORTED_VERSION: 'Database version is not supported'
} as const;

// Success Messages
export const SUCCESS_MESSAGES = {
    CONNECTED: 'Successfully connected to database',
    DISCONNECTED: 'Successfully disconnected from database',
    QUERY_EXECUTED: 'Query executed successfully',
    CONFIGURATION_SAVED: 'Configuration saved',
    CONFIGURATION_RELOADED: 'Configuration reloaded successfully'
} as const;

// Warning Messages
export const WARNING_MESSAGES = {
    DESTRUCTIVE_QUERY: 'This query may modify or delete data',
    MISSING_WHERE_CLAUSE: 'Query is missing WHERE clause',
    PRODUCTION_ENVIRONMENT: 'You are connected to a production environment',
    UNSUPPORTED_VERSION: 'Database version may not be fully supported',
    EOL_VERSION: 'Database version has reached End of Life',
    PERFORMANCE_SCHEMA_DISABLED: 'Performance Schema is disabled',
    AI_DISABLED: 'AI features are disabled'
} as const;

// Command IDs
export const COMMANDS = {
    CONNECT: 'mydba.connect',
    DISCONNECT: 'mydba.disconnect',
    REFRESH: 'mydba.refresh',
    NEW_CONNECTION: 'mydba.newConnection',
    DELETE_CONNECTION: 'mydba.deleteConnection',
    ANALYZE_QUERY: 'mydba.analyzeQuery',
    EXPLAIN_QUERY: 'mydba.explainQuery',
    PROFILE_QUERY: 'mydba.profileQuery',
    CONFIGURE_AI: 'mydba.configureAIProvider',
    TOGGLE_AI: 'mydba.toggleAI',
    SHOW_PROCESS_LIST: 'mydba.showProcessList',
    SHOW_VARIABLES: 'mydba.showVariables',
    SHOW_QUERY_EDITOR: 'mydba.showQueryEditor',
    SHOW_QUERY_HISTORY: 'mydba.showQueryHistory',
    PREVIEW_TABLE_DATA: 'mydba.previewTableData',
    VIEW_AUDIT_LOG: 'mydba.viewAuditLog',
    CLEAR_CACHE: 'mydba.clearCache',
    RESET_CONFIGURATION: 'mydba.resetConfiguration'
} as const;

// View IDs
export const VIEWS = {
    TREE_VIEW: 'mydba.treeView',
    PROCESS_LIST: 'processListPanel',
    VARIABLES: 'variablesPanel',
    QUERY_EDITOR: 'queryEditorPanel',
    QUERY_HISTORY: 'queryHistoryPanel',
    METRICS_DASHBOARD: 'metricsDashboardPanel',
    EXPLAIN_VIEWER: 'explainViewerPanel',
    PROFILING_VIEWER: 'profilingViewerPanel',
    QUERIES_WITHOUT_INDEXES: 'queriesWithoutIndexesPanel',
    SLOW_QUERIES: 'slowQueriesPanel'
} as const;

// Output Channel Name
export const OUTPUT_CHANNEL = 'MyDBA';

// Extension Information
export const EXTENSION = {
    ID: 'mydba',
    NAME: 'MyDBA',
    DISPLAY_NAME: 'MyDBA - AI-Powered Database Assistant',
    VERSION: '1.1.0' // Should match package.json
} as const;
