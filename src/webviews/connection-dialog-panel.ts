import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { ConnectionManager } from '../services/connection-manager';
import { ConnectionConfig } from '../types';

export class ConnectionDialogPanel {
    private static currentPanel: ConnectionDialogPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];
    private editingConnectionId?: string;

    private constructor(
        panel: vscode.WebviewPanel,
        private context: vscode.ExtensionContext,
        private logger: Logger,
        private connectionManager: ConnectionManager,
        editingConnectionId?: string
    ) {
        this.panel = panel;
        this.editingConnectionId = editingConnectionId;
        this.panel.webview.html = this.getHtml();
        this.setupMessageHandlers();

        // If editing existing connection, load its data
        if (editingConnectionId) {
            this.loadConnectionData(editingConnectionId);
        }

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    public static show(
        context: vscode.ExtensionContext,
        logger: Logger,
        connectionManager: ConnectionManager,
        editingConnectionId?: string
    ): void {
        const column = vscode.ViewColumn.One;

        if (ConnectionDialogPanel.currentPanel) {
            ConnectionDialogPanel.currentPanel.panel.reveal(column);
            ConnectionDialogPanel.currentPanel.editingConnectionId = editingConnectionId;
            ConnectionDialogPanel.currentPanel.panel.webview.html = ConnectionDialogPanel.currentPanel.getHtml();
            if (editingConnectionId) {
                ConnectionDialogPanel.currentPanel.loadConnectionData(editingConnectionId);
            }
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'mydbaConnectionDialog',
            editingConnectionId ? 'Edit Connection' : 'New Connection',
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

        ConnectionDialogPanel.currentPanel = new ConnectionDialogPanel(
            panel,
            context,
            logger,
            connectionManager,
            editingConnectionId
        );
    }

    private setupMessageHandlers(): void {
        this.panel.webview.onDidReceiveMessage(
            async (message: any) => {
                switch (message.type) {
                    case 'testConnection':
                        await this.testConnection(message.config);
                        break;
                    case 'saveConnection':
                        await this.saveConnection(message.config);
                        break;
                    case 'cancel':
                        this.panel.dispose();
                        break;
                    case 'browseCertFile':
                        await this.browseCertFile(message.field);
                        break;
                }
            },
            null,
            this.disposables
        );
    }

    private async loadConnectionData(connectionId: string): Promise<void> {
        try {
            const config = this.connectionManager.getConnectionConfig(connectionId);
            if (!config) {
                throw new Error('Connection not found');
            }

            this.panel.webview.postMessage({
                type: 'loadConnection',
                config: {
                    ...config,
                    password: '' // Don't send password to frontend for security
                }
            });
        } catch (error) {
            this.logger.error('Failed to load connection data:', error as Error);
            vscode.window.showErrorMessage(`Failed to load connection: ${(error as Error).message}`);
        }
    }

    private async testConnection(config: any): Promise<void> {
        this.logger.info(`Testing connection: ${config.name}`);

        try {
            // Create a temporary connection config for testing only
            const tempConfig: ConnectionConfig = {
                id: 'temp-test-' + Date.now(),
                name: config.name || 'Test Connection',
                type: config.type || 'mysql',
                host: config.host || '127.0.0.1',
                port: config.port || 3306,
                user: config.username || 'root',
                password: config.password || '',
                database: config.database,
                environment: 'dev',
                ssl: config.sslEnabled ? {
                    rejectUnauthorized: config.sslVerify || false,
                    ca: config.sslCa,
                    cert: config.sslCert,
                    key: config.sslKey
                } : undefined
            };

            // Use the proper test method that doesn't save the connection
            const result = await this.connectionManager.testConnection(tempConfig);

            if (result.success) {
                // Test successful
                const message = result.version
                    ? `Connection successful! (${result.version})`
                    : 'Connection successful!';

                this.panel.webview.postMessage({
                    type: 'testResult',
                    success: true,
                    message
                });
            } else {
                // Test failed
                this.panel.webview.postMessage({
                    type: 'testResult',
                    success: false,
                    message: result.error || 'Connection test failed'
                });
            }

        } catch (error) {
            this.logger.error('Connection test failed:', error as Error);
            this.panel.webview.postMessage({
                type: 'testResult',
                success: false,
                message: (error as Error).message
            });
        }
    }

    private async saveConnection(config: any): Promise<void> {
        this.logger.info(`Saving connection: ${config.name}`);

        try {
            const connectionConfig: ConnectionConfig = {
                id: this.editingConnectionId || 'conn_' + Date.now(),
                name: config.name || 'Unnamed Connection',
                type: config.type || 'mysql',
                host: config.host || '127.0.0.1',
                port: parseInt(config.port) || 3306,
                user: config.username || 'root',
                password: config.password || '',
                database: config.database,
                environment: 'dev', // Default to dev
                ssl: config.sslEnabled ? {
                    rejectUnauthorized: config.sslVerify || false,
                    ca: config.sslCa,
                    cert: config.sslCert,
                    key: config.sslKey
                } : undefined
            };

            if (this.editingConnectionId) {
                await this.connectionManager.updateConnection(connectionConfig);
                vscode.window.showInformationMessage(`Connection "${config.name}" updated successfully`);
            } else {
                await this.connectionManager.addConnection(connectionConfig);
                vscode.window.showInformationMessage(`Connection "${config.name}" added successfully`);
            }

            this.panel.dispose();

        } catch (error) {
            this.logger.error('Failed to save connection:', error as Error);
            this.panel.webview.postMessage({
                type: 'saveError',
                message: (error as Error).message
            });
        }
    }

    private async browseCertFile(field: string): Promise<void> {
        const fileUri = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            openLabel: 'Select Certificate File',
            filters: {
                'Certificate Files': ['pem', 'crt', 'key', 'ca-bundle'],
                'All Files': ['*']
            }
        });

        if (fileUri && fileUri[0]) {
            this.panel.webview.postMessage({
                type: 'certFileSelected',
                field: field,
                path: fileUri[0].fsPath
            });
        }
    }

    private getHtml(): string {
        const toolkitUri = this.panel.webview.asWebviewUri(
            vscode.Uri.joinPath(
                this.context.extensionUri,
                'node_modules',
                '@vscode/webview-ui-toolkit',
                'dist',
                'toolkit.js'
            )
        );

        const scriptUri = this.panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'connectionDialogView.js')
        );

        const styleUri = this.panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'connectionDialogView.css')
        );

        const nonce = this.getNonce();
        const cacheBuster = Date.now();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${this.panel.webview.cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUri}?v=${cacheBuster}" rel="stylesheet">
    <title>${this.editingConnectionId ? 'Edit Connection' : 'New Connection'}</title>
</head>
<body>
    <div class="container">
        <h1>${this.editingConnectionId ? 'Edit Connection' : 'New Database Connection'}</h1>

        <form id="connection-form">
            <!-- General Settings -->
            <section class="form-section">
                <h2>General</h2>

                <div class="form-group">
                    <label for="connection-name">Connection Name *</label>
                    <vscode-text-field id="connection-name" placeholder="My Database" required></vscode-text-field>
                </div>

                <div class="form-group">
                    <label for="connection-type">Database Type</label>
                    <vscode-dropdown id="connection-type">
                        <vscode-option value="mysql" selected>MySQL</vscode-option>
                        <vscode-option value="mariadb">MariaDB</vscode-option>
                    </vscode-dropdown>
                </div>
            </section>

            <!-- Connection Settings -->
            <section class="form-section">
                <h2>Connection</h2>

                <div class="form-row">
                    <div class="form-group flex-2">
                        <label for="host">Host *</label>
                        <vscode-text-field id="host" placeholder="127.0.0.1" value="127.0.0.1" required></vscode-text-field>
                    </div>
                    <div class="form-group flex-1">
                        <label for="port">Port *</label>
                        <vscode-text-field id="port" type="number" placeholder="3306" value="3306" required></vscode-text-field>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="username">Username *</label>
                        <vscode-text-field id="username" placeholder="root" value="root" required></vscode-text-field>
                    </div>
                    <div class="form-group">
                        <label for="password">Password</label>
                        <vscode-text-field id="password" type="password" placeholder="(leave empty for no password)"></vscode-text-field>
                    </div>
                </div>

                <div class="form-group">
                    <label for="database">Default Database (optional)</label>
                    <vscode-text-field id="database" placeholder="mydb"></vscode-text-field>
                    <span class="help-text">Leave empty to connect without selecting a database</span>
                </div>
            </section>

            <!-- SSL/TLS Settings -->
            <section class="form-section">
                <h2>SSL/TLS</h2>

                <div class="form-group">
                    <vscode-checkbox id="ssl-enabled">Enable SSL/TLS</vscode-checkbox>
                </div>

                <div id="ssl-options" style="display: none;">
                    <div class="form-group">
                        <vscode-checkbox id="ssl-verify">Verify Server Certificate</vscode-checkbox>
                        <span class="help-text">Disable for self-signed certificates (not recommended for production)</span>
                    </div>

                    <div class="form-group">
                        <label for="ssl-ca">CA Certificate Path (optional)</label>
                        <div class="file-input-group">
                            <vscode-text-field id="ssl-ca" placeholder="/path/to/ca.pem" readonly></vscode-text-field>
                            <vscode-button id="browse-ca" appearance="secondary">Browse</vscode-button>
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="ssl-cert">Client Certificate Path (optional)</label>
                        <div class="file-input-group">
                            <vscode-text-field id="ssl-cert" placeholder="/path/to/client-cert.pem" readonly></vscode-text-field>
                            <vscode-button id="browse-cert" appearance="secondary">Browse</vscode-button>
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="ssl-key">Client Key Path (optional)</label>
                        <div class="file-input-group">
                            <vscode-text-field id="ssl-key" placeholder="/path/to/client-key.pem" readonly></vscode-text-field>
                            <vscode-button id="browse-key" appearance="secondary">Browse</vscode-button>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Production Warning -->
            <section class="form-section warning-section" style="display: none;" id="production-warning">
                <div class="warning-box">
                    <span class="codicon codicon-warning"></span>
                    <div>
                        <strong>Production Environment Warning</strong>
                        <p>This connection appears to be targeting a production environment. Please ensure you have appropriate permissions and exercise caution with destructive operations.</p>
                    </div>
                </div>
            </section>

            <!-- Action Buttons -->
            <div class="actions">
                <vscode-button id="test-btn" appearance="secondary">
                    <span class="codicon codicon-beaker"></span>
                    Test Connection
                </vscode-button>
                <div class="actions-right">
                    <vscode-button id="cancel-btn" appearance="secondary">Cancel</vscode-button>
                    <vscode-button id="save-btn" appearance="primary">
                        <span class="codicon codicon-save"></span>
                        ${this.editingConnectionId ? 'Update' : 'Save'}
                    </vscode-button>
                </div>
            </div>

            <!-- Status Messages -->
            <div id="status-message" class="status-message" style="display: none;"></div>
        </form>
    </div>

    <script type="module" nonce="${nonce}" src="${toolkitUri}"></script>
    <script nonce="${nonce}" src="${scriptUri}?v=${cacheBuster}"></script>
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

    dispose(): void {
        ConnectionDialogPanel.currentPanel = undefined;
        this.panel.dispose();
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
