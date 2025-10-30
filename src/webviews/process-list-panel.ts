import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { ConnectionManager } from '../services/connection-manager';
// import { Process } from '../types';

export class ProcessListPanel {
    private static currentPanel: ProcessListPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];
    private refreshInterval: NodeJS.Timeout | null = null;
    private isRefreshing: boolean = false; // Prevent concurrent refreshes

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
        this.loadProcessList();
        this.startAutoRefresh();

        // Handle panel disposal
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

        // Stop refresh when panel is not visible
        this.panel.onDidChangeViewState(() => {
            if (!this.panel.visible) {
                this.stopAutoRefresh();
            } else {
                this.startAutoRefresh();
            }
        }, null, this.disposables);
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
        if (ProcessListPanel.currentPanel) {
            ProcessListPanel.currentPanel.panel.reveal(column);
            ProcessListPanel.currentPanel.connectionId = connectionId;
            ProcessListPanel.currentPanel.panel.title = `Process List - ${connection.name}`;
            ProcessListPanel.currentPanel.loadProcessList();
            ProcessListPanel.currentPanel.startAutoRefresh();
            return;
        }

        // Create new panel
        const panel = vscode.window.createWebviewPanel(
            'mydbaProcessList',
            `Process List - ${connection.name}`,
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

        ProcessListPanel.currentPanel = new ProcessListPanel(panel, context, logger, connectionManager, connectionId);
    }

    private setupMessageHandlers(): void {
        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.type) {
                    case 'refresh':
                        await this.loadProcessList();
                        break;
                    case 'killProcess':
                        await this.killProcess(message.processId);
                        break;
                    case 'toggleAutoRefresh':
                        if (message.enabled) {
                            this.startAutoRefresh();
                        } else {
                            this.stopAutoRefresh();
                        }
                        break;
                }
            },
            null,
            this.disposables
        );
    }

    private async loadProcessList(): Promise<void> {
        // Prevent concurrent requests
        if (this.isRefreshing) {
            this.logger.debug('Skipping refresh - already in progress');
            return;
        }

        this.isRefreshing = true;
        this.logger.info(`Loading process list for connection: ${this.connectionId}`);

        try {
            const adapter = this.connectionManager.getAdapter(this.connectionId);
            if (!adapter) {
                throw new Error('Connection not found or not connected. Please ensure the connection is active.');
            }

            if (!adapter.isConnected()) {
                throw new Error('Database is not connected. Please connect to the database first.');
            }

            this.logger.debug('Calling adapter.getProcessList()...');
            const processes = await adapter.getProcessList();
            this.logger.info(`Retrieved ${processes.length} processes`);

            this.panel.webview.postMessage({
                type: 'processListLoaded',
                processes: processes,
                timestamp: new Date().toISOString()
            });
        } catch {
            this.logger.error('Failed to load process list:', error as Error);
            this.panel.webview.postMessage({
                type: 'error',
                message: (error as Error).message
            });
        } finally {
            this.isRefreshing = false;
        }
    }

    private async killProcess(processId: number): Promise<void> {
        // Validate process ID to prevent SQL injection
        if (!Number.isInteger(processId) || processId <= 0) {
            vscode.window.showErrorMessage('Invalid process ID');
            return;
        }

        const confirm = await vscode.window.showWarningMessage(
            `Kill process ${processId}?`,
            { modal: true },
            'Kill'
        );

        if (confirm !== 'Kill') {
            return;
        }

        try {
            const adapter = this.connectionManager.getAdapter(this.connectionId);
            if (!adapter) {
                throw new Error('Connection not found');
            }

            // Use parameterized query to prevent SQL injection
            await adapter.query('KILL ?', [processId]);
            vscode.window.showInformationMessage(`Process ${processId} killed`);
            await this.loadProcessList();
        } catch {
            this.logger.error(`Failed to kill process ${processId}:`, error as Error);
            vscode.window.showErrorMessage(`Failed to kill process: ${(error as Error).message}`);
        }
    }

    private startAutoRefresh(): void {
        this.stopAutoRefresh();
        this.refreshInterval = setInterval(async () => {
            if (this.panel.visible && !this.isRefreshing) {
                await this.loadProcessList();
            }
        }, 5000);
    }

    private stopAutoRefresh(): void {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    private getHtml(): string {
        const scriptUri = this.panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'processListView.js')
        );
        const styleUri = this.panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'processListView.css')
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
    <title>Process List</title>
</head>
<body>
    <div class="container">
        <div class="toolbar">
            <div class="toolbar-left">
                <h2>MySQL Process List</h2>
                <span id="last-updated" class="last-updated"></span>
            </div>
            <div class="toolbar-controls">
                <label for="group-by">Group By:</label>
                <select id="group-by" class="dropdown" aria-label="Group processes by">
                    <option value="none">None</option>
                    <option value="user">User</option>
                    <option value="host">Host</option>
                    <option value="query">Query Fingerprint</option>
                </select>
                <input
                    type="text"
                    id="filter-input"
                    placeholder="Filter processes..."
                    class="filter-input"
                    aria-label="Filter processes by text" />
            </div>
            <div class="toolbar-actions">
                <vscode-button id="refresh-btn" appearance="secondary" title="Refresh Now">
                    <span class="codicon codicon-refresh"></span>
                    Refresh
                </vscode-button>
                <vscode-checkbox id="auto-refresh-toggle" checked>
                    Auto-refresh (5s)
                </vscode-checkbox>
            </div>
        </div>

        <div id="loading" class="loading">
            <vscode-progress-ring></vscode-progress-ring>
            <span>Loading process list...</span>
        </div>

        <div id="error" class="error" style="display: none;">
            <span class="codicon codicon-error"></span>
            <span id="error-message"></span>
        </div>

        <div id="process-list" style="display: none;">
            <table id="process-table">
                <thead>
                    <tr>
                        <th data-sort="id">ID</th>
                        <th data-sort="user">User</th>
                        <th data-sort="host">Host</th>
                        <th data-sort="db">Database</th>
                        <th data-sort="command">Command</th>
                        <th data-sort="time">Time (s)</th>
                        <th data-sort="state">State</th>
                        <th data-sort="inTransaction">Transaction</th>
                        <th data-sort="info">Info</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="process-tbody">
                    <!-- Populated by JavaScript -->
                </tbody>
            </table>
            <div id="process-count"></div>
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
        ProcessListPanel.currentPanel = undefined;
        this.stopAutoRefresh();
        this.panel.dispose();

        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
