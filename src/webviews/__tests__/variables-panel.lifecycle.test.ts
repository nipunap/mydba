import * as vscode from 'vscode';
import { VariablesPanel } from '../variables-panel';
import { Logger } from '../../utils/logger';
import type { ConnectionManager } from '../../services/connection-manager';

describe('VariablesPanel lifecycle (smoke)', () => {
    const logger = new Logger('VariablesPanelTest');
    const context = {
        extensionUri: vscode.Uri.file('/tmp')
    } as unknown as vscode.ExtensionContext;

    const connectionManager = {
        getConnection: jest.fn(() => ({ id: 'c1', name: 'Test', type: 'mysql', host: 'localhost', port: 3306 })),
        getAdapter: jest.fn(() => ({
            isConnected: () => true,
            getGlobalVariables: async () => [],
            getSessionVariables: async () => []
        }))
    } as unknown as ConnectionManager;

    function makePanel(): vscode.WebviewPanel {
        return {
            webview: {
                html: '',
                postMessage: jest.fn(async () => true),
                onDidReceiveMessage: jest.fn((handler) => {
                    // send initial refresh
                    setTimeout(() => handler({ type: 'refresh' }), 0);
                    return { dispose: jest.fn() };
                }),
                asWebviewUri: jest.fn((u) => u)
            } as unknown as vscode.Webview,
            onDidDispose: jest.fn((_h, _t, _d) => undefined),
            onDidChangeViewState: jest.fn(),
            dispose: jest.fn(),
            reveal: jest.fn(),
            title: 'Variables',
            viewType: 'mydbaVariables',
            options: {},
            viewColumn: vscode.ViewColumn.One
        } as unknown as vscode.WebviewPanel;
    }

    it('creates and disposes panel without throwing', () => {
        const panel = makePanel();
        jest.spyOn(vscode.window, 'createWebviewPanel').mockReturnValue(panel);
        expect(() => {
            VariablesPanel.show(context, logger, connectionManager, 'c1');
        }).not.toThrow();
        // Dispose should not throw
        expect(() => {
            panel.dispose();
        }).not.toThrow();
    });
});
