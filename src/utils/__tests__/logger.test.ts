import * as vscode from 'vscode';
import { Logger } from '../logger';

// Mock vscode
jest.mock('vscode', () => ({
    window: {
        createOutputChannel: jest.fn()
    }
}));

describe('Logger', () => {
    let logger: Logger;
    let mockOutputChannel: jest.Mocked<vscode.OutputChannel>;
    let consoleErrorSpy: jest.SpyInstance;
    let consoleWarnSpy: jest.SpyInstance;
    let consoleLogSpy: jest.SpyInstance;
    let consoleDebugSpy: jest.SpyInstance;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Mock output channel
        mockOutputChannel = {
            appendLine: jest.fn(),
            append: jest.fn(),
            clear: jest.fn(),
            show: jest.fn(),
            hide: jest.fn(),
            dispose: jest.fn(),
            name: 'TestLogger',
            replace: jest.fn()
        };

        (vscode.window.createOutputChannel as jest.Mock).mockReturnValue(mockOutputChannel);

        // Spy on console methods
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();

        logger = new Logger('TestLogger');
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
        consoleLogSpy.mockRestore();
        consoleDebugSpy.mockRestore();
    });

    describe('constructor', () => {
        it('should create output channel with given name', () => {
            expect(vscode.window.createOutputChannel).toHaveBeenCalledWith('TestLogger');
        });
    });

    describe('error', () => {
        it('should log error message to output channel', () => {
            logger.error('Test error message');

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('[ERROR] Test error message')
            );
        });

        it('should log error with Error object', () => {
            const error = new Error('Test error');
            error.stack = 'Error: Test error\n    at test.js:1:1';

            logger.error('Error occurred', error);

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('[ERROR] Error occurred')
            );
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('Error: Test error')
            );
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('Error: Test error\n    at test.js:1:1')
            );
        });

        it('should log error with context', () => {
            const context = { userId: 123, operation: 'delete' };
            logger.error('Operation failed', undefined, context);

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('[ERROR] Operation failed')
            );
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('{"userId":123,"operation":"delete"}')
            );
        });

        it('should log to console.error', () => {
            logger.error('Console test');

            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('[TestLogger]')
            );
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Console test')
            );
        });

        it('should include timestamp in log message', () => {
            logger.error('Timestamp test');

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/)
            );
        });
    });

    describe('warn', () => {
        it('should log warning message to output channel', () => {
            logger.warn('Test warning');

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('[WARN] Test warning')
            );
        });

        it('should log warning with context', () => {
            const context = { resource: 'database', action: 'backup' };
            logger.warn('Backup slow', context);

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('[WARN] Backup slow')
            );
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('{"resource":"database","action":"backup"}')
            );
        });

        it('should log to console.warn', () => {
            logger.warn('Console warn test');

            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining('[TestLogger]')
            );
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Console warn test')
            );
        });

        it('should include timestamp in log message', () => {
            logger.warn('Timestamp test');

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/)
            );
        });
    });

    describe('info', () => {
        it('should log info message to output channel', () => {
            logger.info('Test info');

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('[INFO] Test info')
            );
        });

        it('should log info with context', () => {
            const context = { version: '1.0.0', status: 'ready' };
            logger.info('Extension activated', context);

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('[INFO] Extension activated')
            );
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('{"version":"1.0.0","status":"ready"}')
            );
        });

        it('should log to console.log', () => {
            logger.info('Console info test');

            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('[TestLogger]')
            );
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('Console info test')
            );
        });

        it('should include timestamp in log message', () => {
            logger.info('Timestamp test');

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/)
            );
        });
    });

    describe('debug', () => {
        it('should log debug message to output channel', () => {
            logger.debug('Test debug');

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('[DEBUG] Test debug')
            );
        });

        it('should log debug with context', () => {
            const context = { query: 'SELECT 1', params: [1, 2] };
            logger.debug('Executing query', context);

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('[DEBUG] Executing query')
            );
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('{"query":"SELECT 1","params":[1,2]}')
            );
        });

        it('should log to console.debug', () => {
            logger.debug('Console debug test');

            expect(consoleDebugSpy).toHaveBeenCalledWith(
                expect.stringContaining('[TestLogger]')
            );
            expect(consoleDebugSpy).toHaveBeenCalledWith(
                expect.stringContaining('Console debug test')
            );
        });

        it('should include timestamp in log message', () => {
            logger.debug('Timestamp test');

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/)
            );
        });
    });

    describe('network', () => {
        it('should log network message to output channel', () => {
            logger.network('Test network');

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('[NETWORK] Test network')
            );
        });

        it('should log network with context', () => {
            const context = { url: 'https://api.example.com', method: 'GET', status: 200 };
            logger.network('HTTP request', context);

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('[NETWORK] HTTP request')
            );
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('{"url":"https://api.example.com","method":"GET","status":200}')
            );
        });

        it('should log to console.log', () => {
            logger.network('Console network test');

            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('[TestLogger]')
            );
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('Console network test')
            );
        });

        it('should include timestamp in log message', () => {
            logger.network('Timestamp test');

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/)
            );
        });
    });

    describe('show', () => {
        it('should show the output channel', () => {
            logger.show();

            expect(mockOutputChannel.show).toHaveBeenCalled();
        });
    });

    describe('dispose', () => {
        it('should dispose the output channel', () => {
            logger.dispose();

            expect(mockOutputChannel.dispose).toHaveBeenCalled();
        });
    });

    describe('formatMessage', () => {
        it('should format message with all components', () => {
            // This tests the private formatMessage method indirectly
            const context = { key: 'value' };
            logger.info('Test', context);

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringMatching(/\[.*?\] \[INFO\] Test {"key":"value"}/)
            );
        });

        it('should format message without context', () => {
            logger.info('Test without context');

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringMatching(/\[.*?\] \[INFO\] Test without context$/)
            );
        });
    });

    describe('error handling edge cases', () => {
        it('should handle error without stack trace', () => {
            const error = new Error('No stack');
            delete error.stack;

            logger.error('Error without stack', error);

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('[ERROR] Error without stack')
            );
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('Error: No stack')
            );
        });

        it('should handle null context gracefully', () => {
            logger.info('Null context', undefined);

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('[INFO] Null context')
            );
        });

        it('should handle complex context objects', () => {
            const complexContext = {
                nested: { deep: { value: 123 } },
                array: [1, 2, 3],
                nullValue: null,
                undefinedValue: undefined,
                boolValue: true
            };

            logger.debug('Complex context', complexContext);

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('"nested":{"deep":{"value":123}}')
            );
        });
    });
});
