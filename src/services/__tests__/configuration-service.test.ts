import * as vscode from 'vscode';
import { ConfigurationService } from '../configuration-service';

describe('ConfigurationService', () => {
    let service: ConfigurationService;
    let mockContext: vscode.ExtensionContext;
    let mockConfig: {
        get: jest.Mock;
        update: jest.Mock;
        has: jest.Mock;
        inspect: jest.Mock;
    };

    beforeEach(() => {
        jest.clearAllMocks();

        mockContext = {} as vscode.ExtensionContext;

        mockConfig = {
            get: jest.fn((key: string, defaultValue?: unknown) => {
                if (key === 'testKey') {
                    return 'testValue';
                }
                return defaultValue;
            }),
            update: jest.fn().mockResolvedValue(undefined),
            has: jest.fn(),
            inspect: jest.fn()
        };

        (vscode.workspace.getConfiguration as jest.Mock) = jest.fn(() => mockConfig);

        service = new ConfigurationService(mockContext);
    });

    describe('get', () => {
        it('should get configuration value', () => {
            const result = service.get('testKey');
            expect(result).toBe('testValue');
            expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('mydba');
        });

        it('should return default value when key not found', () => {
            const result = service.get('unknownKey', 'defaultValue');
            expect(result).toBe('defaultValue');
        });

        it('should handle numeric values', () => {
            mockConfig.get.mockReturnValueOnce(42);
            const result = service.get<number>('numericKey', 0);
            expect(result).toBe(42);
        });

        it('should handle boolean values', () => {
            mockConfig.get.mockReturnValueOnce(true);
            const result = service.get<boolean>('booleanKey', false);
            expect(result).toBe(true);
        });

        it('should handle null values', () => {
            mockConfig.get.mockReturnValueOnce(null);
            const result = service.get('nullKey');
            expect(result).toBeNull();
        });

        it('should handle undefined with default', () => {
            mockConfig.get.mockImplementationOnce((_key: string, defaultValue?: unknown) => defaultValue);
            const result = service.get('undefinedKey', 'default');
            expect(result).toBe('default');
        });
    });

    describe('update', () => {
        it('should update configuration value', async () => {
            await service.update('testKey', 'newValue');
            expect(mockConfig.update).toHaveBeenCalledWith('testKey', 'newValue', undefined);
        });

        it('should update with specific target', async () => {
            await service.update('testKey', 'newValue', vscode.ConfigurationTarget.Global);
            expect(mockConfig.update).toHaveBeenCalledWith('testKey', 'newValue', vscode.ConfigurationTarget.Global);
        });

        it('should update with workspace target', async () => {
            await service.update('testKey', 'newValue', vscode.ConfigurationTarget.Workspace);
            expect(mockConfig.update).toHaveBeenCalledWith('testKey', 'newValue', vscode.ConfigurationTarget.Workspace);
        });

        it('should handle updating to null', async () => {
            await service.update('testKey', null);
            expect(mockConfig.update).toHaveBeenCalledWith('testKey', null, undefined);
        });

        it('should handle updating to object', async () => {
            const obj = { nested: { value: 123 } };
            await service.update('testKey', obj);
            expect(mockConfig.update).toHaveBeenCalledWith('testKey', obj, undefined);
        });

        it('should handle updating to array', async () => {
            const arr = [1, 2, 3];
            await service.update('testKey', arr);
            expect(mockConfig.update).toHaveBeenCalledWith('testKey', arr, undefined);
        });
    });

    describe('onDidChangeConfiguration', () => {
        it('should register configuration change listener', () => {
            const listener = jest.fn();
            const mockDisposable = { dispose: jest.fn() };
            (vscode.workspace.onDidChangeConfiguration as jest.Mock) = jest.fn(() => mockDisposable);

            const disposable = service.onDidChangeConfiguration(listener);

            expect(vscode.workspace.onDidChangeConfiguration).toHaveBeenCalledWith(listener);
            expect(disposable).toBe(mockDisposable);
        });

        it('should allow multiple listeners', () => {
            const listener1 = jest.fn();
            const listener2 = jest.fn();
            const mockDisposable1 = { dispose: jest.fn() };
            const mockDisposable2 = { dispose: jest.fn() };

            (vscode.workspace.onDidChangeConfiguration as jest.Mock) = jest.fn()
                .mockReturnValueOnce(mockDisposable1)
                .mockReturnValueOnce(mockDisposable2);

            service.onDidChangeConfiguration(listener1);
            service.onDidChangeConfiguration(listener2);

            expect(vscode.workspace.onDidChangeConfiguration).toHaveBeenCalledTimes(2);
        });

        it('should return disposable that can be disposed', () => {
            const listener = jest.fn();
            const mockDisposable = { dispose: jest.fn() };
            (vscode.workspace.onDidChangeConfiguration as jest.Mock) = jest.fn(() => mockDisposable);

            const disposable = service.onDidChangeConfiguration(listener);
            disposable.dispose();

            expect(mockDisposable.dispose).toHaveBeenCalled();
        });
    });
});
