import * as vscode from 'vscode';
import { WebviewManager } from '../webview-manager';
import { Logger } from '../../utils/logger';
import type { ConnectionManager } from '../../services/connection-manager';

describe('WebviewManager', () => {
    const logger = new Logger('WebviewManagerTest');
    const context = { extensionUri: vscode.Uri.file('/tmp') } as unknown as vscode.ExtensionContext;
    const connectionManager = {
        getConnection: jest.fn(() => ({ id: 'c1', name: 'Test', type: 'mysql', host: 'localhost', port: 3306 })),
        getAdapter: jest.fn(() => ({ isConnected: () => true }))
    } as unknown as ConnectionManager;

    function mockPanel(): vscode.WebviewPanel {
        return {
            webview: { html: '', postMessage: jest.fn(), onDidReceiveMessage: jest.fn(), asWebviewUri: jest.fn((u) => u) } as unknown as vscode.Webview,
            onDidDispose: jest.fn(),
            onDidChangeViewState: jest.fn(),
            dispose: jest.fn(),
            reveal: jest.fn(),
            title: 'Mock',
            viewType: 'mock',
            options: {},
            viewColumn: vscode.ViewColumn.One
        } as unknown as vscode.WebviewPanel;
    }

    beforeEach(() => {
        jest.spyOn(vscode.window, 'createWebviewPanel').mockReturnValue(mockPanel());
    });

    it('initializes without throwing', () => {
        const wvm = new WebviewManager(context, logger, connectionManager);
        expect(() => wvm.initialize()).not.toThrow();
    });

    it('shows variables panel without throwing', async () => {
        const wvm = new WebviewManager(context, logger, connectionManager);
        await expect(wvm.showVariables('c1')).resolves.toBeUndefined();
    });
});
