import * as Constants from '../constants';

describe('Constants', () => {
    describe('URLS', () => {
        it('should have GitHub URLs', () => {
            expect(Constants.URLS.GITHUB_REPO).toBe('https://github.com/nipunap/mydba');
            expect(Constants.URLS.GITHUB_ISSUES).toBe('https://github.com/nipunap/mydba/issues');
            expect(Constants.URLS.DOCUMENTATION).toBe('https://github.com/nipunap/mydba#readme');
        });

        it('should have database documentation URLs', () => {
            expect(Constants.URLS.MYSQL_DOCS).toBe('https://dev.mysql.com/doc/');
            expect(Constants.URLS.MARIADB_DOCS).toBe('https://mariadb.com/kb/en/');
        });

        it('should have policy URLs', () => {
            expect(Constants.URLS.PRIVACY_POLICY).toContain('PRIVACY.md');
            expect(Constants.URLS.SECURITY_POLICY).toContain('SECURITY.md');
        });
    });

    describe('TIMEOUTS', () => {
        it('should have connection timeouts', () => {
            expect(Constants.TIMEOUTS.CONNECTION).toBe(30000);
            expect(Constants.TIMEOUTS.QUERY_EXECUTION).toBe(30000);
        });

        it('should have AI request timeout', () => {
            expect(Constants.TIMEOUTS.AI_REQUEST).toBe(60000);
        });

        it('should have refresh timeouts', () => {
            expect(Constants.TIMEOUTS.METRICS_REFRESH).toBe(5000);
            expect(Constants.TIMEOUTS.PROCESS_LIST_REFRESH).toBe(5000);
        });

        it('should have explain and profiling timeouts', () => {
            expect(Constants.TIMEOUTS.EXPLAIN_TIMEOUT).toBe(30000);
            expect(Constants.TIMEOUTS.PROFILING_TIMEOUT).toBe(60000);
        });
    });

    describe('LIMITS', () => {
        it('should have connection limits', () => {
            expect(Constants.LIMITS.MAX_CONNECTIONS).toBe(10);
        });

        it('should have query history limit', () => {
            expect(Constants.LIMITS.MAX_QUERY_HISTORY).toBe(100);
        });

        it('should have result row limits', () => {
            expect(Constants.LIMITS.MAX_RESULT_ROWS).toBe(1000);
            expect(Constants.LIMITS.MAX_PREVIEW_ROWS).toBe(1000);
            expect(Constants.LIMITS.MAX_DML_AFFECT_ROWS).toBe(1000);
        });

        it('should have size limits', () => {
            expect(Constants.LIMITS.MAX_AUDIT_LOG_SIZE).toBe(10 * 1024 * 1024);
            expect(Constants.LIMITS.MAX_EXPORT_SIZE).toBe(10 * 1024 * 1024);
        });

        it('should have queue size limit', () => {
            expect(Constants.LIMITS.RATE_LIMIT_QUEUE_SIZE).toBe(100);
        });
    });

    describe('CACHE_TTL', () => {
        it('should have schema cache TTL', () => {
            expect(Constants.CACHE_TTL.SCHEMA).toBe(60 * 60 * 1000);
        });

        it('should have query cache TTLs', () => {
            expect(Constants.CACHE_TTL.QUERY_RESULT).toBe(5 * 60 * 1000);
            expect(Constants.CACHE_TTL.EXPLAIN).toBe(10 * 60 * 1000);
        });

        it('should have system cache TTLs', () => {
            expect(Constants.CACHE_TTL.VARIABLES).toBe(5 * 60 * 1000);
            expect(Constants.CACHE_TTL.METRICS).toBe(30 * 1000);
        });

        it('should have persistent RAG docs cache', () => {
            expect(Constants.CACHE_TTL.RAG_DOCS).toBe(-1);
        });
    });

    describe('SUPPORTED_VERSIONS', () => {
        it('should have MySQL version info', () => {
            expect(Constants.SUPPORTED_VERSIONS.MYSQL.MIN).toBe('8.0.0');
            expect(Constants.SUPPORTED_VERSIONS.MYSQL.RECOMMENDED).toBe('8.0.35');
            expect(Constants.SUPPORTED_VERSIONS.MYSQL.LTS_VERSIONS).toContain('8.0');
            expect(Constants.SUPPORTED_VERSIONS.MYSQL.LTS_VERSIONS).toContain('8.4');
        });

        it('should have MariaDB version info', () => {
            expect(Constants.SUPPORTED_VERSIONS.MARIADB.MIN).toBe('10.6.0');
            expect(Constants.SUPPORTED_VERSIONS.MARIADB.RECOMMENDED).toBe('10.11.0');
            expect(Constants.SUPPORTED_VERSIONS.MARIADB.LTS_VERSIONS).toContain('10.6');
            expect(Constants.SUPPORTED_VERSIONS.MARIADB.LTS_VERSIONS).toContain('10.11');
        });
    });

    describe('EOL_VERSIONS', () => {
        it('should list EOL MySQL versions', () => {
            expect(Constants.EOL_VERSIONS.MYSQL).toContain('5.6');
            expect(Constants.EOL_VERSIONS.MYSQL).toContain('5.7');
        });

        it('should list EOL MariaDB versions', () => {
            expect(Constants.EOL_VERSIONS.MARIADB).toContain('10.4');
            expect(Constants.EOL_VERSIONS.MARIADB).toContain('10.5');
        });
    });

    describe('DEFAULTS', () => {
        it('should have default environment', () => {
            expect(Constants.DEFAULTS.ENVIRONMENT).toBe('dev');
        });

        it('should have default connection settings', () => {
            expect(Constants.DEFAULTS.PORT).toBe(3306);
            expect(Constants.DEFAULTS.HOST).toBe('127.0.0.1');
        });

        it('should have default refresh interval', () => {
            expect(Constants.DEFAULTS.REFRESH_INTERVAL).toBe(5000);
        });

        it('should have default slow query threshold', () => {
            expect(Constants.DEFAULTS.SLOW_QUERY_THRESHOLD).toBe(1000);
        });

        it('should have AI defaults', () => {
            expect(Constants.DEFAULTS.AI_ENABLED).toBe(true);
            expect(Constants.DEFAULTS.AI_PROVIDER).toBe('auto');
        });

        it('should have safety defaults', () => {
            expect(Constants.DEFAULTS.SAFE_MODE).toBe(true);
            expect(Constants.DEFAULTS.CONFIRM_DESTRUCTIVE).toBe(true);
            expect(Constants.DEFAULTS.WARN_MISSING_WHERE).toBe(true);
        });
    });

    describe('AI_PROVIDERS', () => {
        it('should have VSCode LM config', () => {
            expect(Constants.AI_PROVIDERS.VSCODE_LM.NAME).toBe('VSCode Language Model');
            expect(Constants.AI_PROVIDERS.VSCODE_LM.FAMILY).toBe('gpt-4o');
            expect(Constants.AI_PROVIDERS.VSCODE_LM.REQUIRES_API_KEY).toBe(false);
        });

        it('should have OpenAI config', () => {
            expect(Constants.AI_PROVIDERS.OPENAI.NAME).toBe('OpenAI');
            expect(Constants.AI_PROVIDERS.OPENAI.DEFAULT_MODEL).toBe('gpt-4o-mini');
            expect(Constants.AI_PROVIDERS.OPENAI.REQUIRES_API_KEY).toBe(true);
        });

        it('should have Anthropic config', () => {
            expect(Constants.AI_PROVIDERS.ANTHROPIC.NAME).toBe('Anthropic Claude');
            expect(Constants.AI_PROVIDERS.ANTHROPIC.DEFAULT_MODEL).toBe('claude-3-5-sonnet-20241022');
            expect(Constants.AI_PROVIDERS.ANTHROPIC.REQUIRES_API_KEY).toBe(true);
        });
    });
});
