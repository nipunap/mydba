import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { ConnectionManager } from '../services/connection-manager';
// import { Variable } from '../types';

export class VariablesPanel {
    private static currentPanel: VariablesPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];
    private currentScope: 'global' | 'session' = 'global';

    private constructor(
        panel: vscode.WebviewPanel,
        private context: vscode.ExtensionContext,
        private logger: Logger,
        private connectionManager: ConnectionManager,
        private connectionId: string
    ) {
        this.panel = panel;

        // Set HTML content
        this.panel.webview.html = this.getHtml();
        this.setupMessageHandlers();
        this.loadVariables();

        // Handle panel disposal
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    public static show(
        context: vscode.ExtensionContext,
        logger: Logger,
        connectionManager: ConnectionManager,
        connectionId: string
    ): void {
        const connection = connectionManager.getConnection(connectionId);
        if (!connection) {
            vscode.window.showErrorMessage('Connection not found');
            return;
        }

        const column = vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;

        // If we already have a panel, show it
        if (VariablesPanel.currentPanel) {
            VariablesPanel.currentPanel.panel.reveal(column);
            VariablesPanel.currentPanel.connectionId = connectionId;
            VariablesPanel.currentPanel.panel.title = `Variables - ${connection.name}`;
            VariablesPanel.currentPanel.loadVariables();
            return;
        }

        // Create new panel
        const panel = vscode.window.createWebviewPanel(
            'mydbaVariables',
            `Variables - ${connection.name}`,
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'media'),
                    vscode.Uri.joinPath(context.extensionUri, 'node_modules', '@vscode/webview-ui-toolkit')
                ]
            }
        );

        VariablesPanel.currentPanel = new VariablesPanel(panel, context, logger, connectionManager, connectionId);
    }

    private setupMessageHandlers(): void {
        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.type) {
                    case 'refresh':
                        await this.loadVariables();
                        break;
                    case 'changeScope':
                        this.currentScope = message.scope;
                        await this.loadVariables();
                        break;
                }
            },
            null,
            this.disposables
        );
    }

    private async loadVariables(): Promise<void> {
        try {
            const adapter = this.connectionManager.getAdapter(this.connectionId);
            if (!adapter) {
                throw new Error('Connection not found or not connected');
            }

            const variables = this.currentScope === 'global'
                ? await adapter.getGlobalVariables()
                : await adapter.getSessionVariables();

            this.panel.webview.postMessage({
                type: 'variablesLoaded',
                variables: variables,
                scope: this.currentScope
            });
        } catch {
            this.logger.error('Failed to load variables:', error as Error);
            this.panel.webview.postMessage({
                type: 'error',
                message: (error as Error).message
            });
        }
    }

    private getHtml(): string {
        const scriptUri = this.panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'variablesView.js')
        );
        const styleUri = this.panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'variablesView.css')
        );
        const toolkitUri = this.panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', '@vscode/webview-ui-toolkit', 'dist', 'toolkit.js')
        );

        const nonce = this.getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${this.panel.webview.cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUri}" rel="stylesheet">
    <title>Variables</title>
</head>
<body>
    <div class="container">
        <div class="toolbar">
            <vscode-panels id="scope-tabs">
                <vscode-panel-tab id="tab-global">GLOBAL</vscode-panel-tab>
                <vscode-panel-tab id="tab-session">SESSION</vscode-panel-tab>
            </vscode-panels>
            <vscode-text-field id="search-input" placeholder="Search variables...">
                <span slot="start" class="codicon codicon-search"></span>
            </vscode-text-field>
            <vscode-button id="refresh-btn" appearance="icon" title="Refresh">
                <span class="codicon codicon-refresh"></span>
            </vscode-button>
        </div>

        <div id="loading" class="loading">
            <vscode-progress-ring></vscode-progress-ring>
            <span>Loading variables...</span>
        </div>

        <div id="error" class="error" style="display: none;">
            <span class="codicon codicon-error"></span>
            <span id="error-message"></span>
        </div>

        <div id="variables-list" style="display: none;">
            <table id="variables-table">
                <thead>
                    <tr>
                        <th data-sort="name">Variable Name</th>
                        <th data-sort="value">Value</th>
                    </tr>
                </thead>
                <tbody id="variables-tbody">
                    <!-- Populated by JavaScript -->
                </tbody>
            </table>
            <div id="variable-count"></div>
        </div>
    </div>

    <script type="module" nonce="${nonce}" src="${toolkitUri}"></script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    public dispose(): void {
        VariablesPanel.currentPanel = undefined;
        this.panel.dispose();

        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
