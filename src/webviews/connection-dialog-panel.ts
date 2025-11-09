/* eslint-disable @typescript-eslint/no-explicit-any */

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
                    case 'browseSSHKey':
                        await this.browseSSHKey();
                        break;
                    case 'discoverRDSInstances':
                        await this.discoverRDSInstances(message.region, message.profile);
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
                } : undefined,
                ssh: config.sshEnabled ? {
                    host: config.sshHost,
                    port: config.sshPort || 22,
                    user: config.sshUser,
                    keyPath: config.sshKeyPath,
                    privateKey: config.sshPrivateKey,
                    passphrase: config.sshPassphrase
                } : undefined,
                awsIamAuth: config.awsIamEnabled ? {
                    region: config.awsRegion,
                    profile: config.awsProfile,
                    assumeRole: config.awsRoleArn
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
                } : undefined,
                ssh: config.sshEnabled ? {
                    host: config.sshHost,
                    port: config.sshPort || 22,
                    user: config.sshUser,
                    keyPath: config.sshKeyPath,
                    privateKey: config.sshPrivateKey,
                    passphrase: config.sshPassphrase
                } : undefined,
                awsIamAuth: config.awsIamEnabled ? {
                    region: config.awsRegion,
                    profile: config.awsProfile,
                    assumeRole: config.awsRoleArn
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

    private async browseSSHKey(): Promise<void> {
        const fileUri = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            openLabel: 'Select SSH Private Key',
            filters: {
                'SSH Key Files': ['pem', 'key', ''],
                'All Files': ['*']
            }
        });

        if (fileUri && fileUri[0]) {
            // Read the SSH key file content
            try {
                const fs = await import('fs');
                const keyContent = fs.readFileSync(fileUri[0].fsPath, 'utf8');

                this.panel.webview.postMessage({
                    type: 'sshKeySelected',
                    path: fileUri[0].fsPath,
                    content: keyContent
                });
            } catch (error) {
                this.logger.error('Failed to read SSH key file:', error as Error);
                vscode.window.showErrorMessage(`Failed to read SSH key file: ${(error as Error).message}`);
            }
        }
    }

    private async discoverRDSInstances(region: string, profile?: string): Promise<void> {
        try {
            this.logger.info(`Discovering RDS instances in region: ${region}${profile ? ` with profile: ${profile}` : ''}`);

            // Send loading status
            this.panel.webview.postMessage({
                type: 'rdsDiscoveryStatus',
                status: 'loading',
                message: `Discovering RDS instances in ${region}...`
            });

            // Get RDS discovery service
            const rdsDiscoveryService = this.connectionManager.getRDSDiscoveryService();

            // Discover instances
            const instances = await rdsDiscoveryService.discoverInstances(region, profile);

            if (instances.length === 0) {
                this.panel.webview.postMessage({
                    type: 'rdsDiscoveryStatus',
                    status: 'info',
                    message: `No MySQL/MariaDB RDS instances found in ${region}`
                });
            } else {
                this.panel.webview.postMessage({
                    type: 'rdsInstancesDiscovered',
                    instances: instances
                });

                this.panel.webview.postMessage({
                    type: 'rdsDiscoveryStatus',
                    status: 'success',
                    message: `Found ${instances.length} instance(s) in ${region}`
                });
            }

        } catch (error) {
            this.logger.error('Failed to discover RDS instances:', error as Error);
            this.panel.webview.postMessage({
                type: 'rdsDiscoveryStatus',
                status: 'error',
                message: `Failed to discover instances: ${(error as Error).message}`
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
                        <vscode-option value="aws-rds-mysql">AWS RDS MySQL</vscode-option>
                        <vscode-option value="aws-rds-mariadb">AWS RDS MariaDB</vscode-option>
                    </vscode-dropdown>
                </div>
            </section>

            <!-- AWS RDS Discovery (shown only for AWS RDS types) -->
            <section class="form-section" id="aws-discovery-section" style="display: none;">
                <h2>AWS RDS Discovery</h2>

                <div class="form-group">
                    <label for="aws-profile">AWS Profile (optional)</label>
                    <vscode-text-field id="aws-profile" placeholder="default"></vscode-text-field>
                    <span class="help-text">AWS CLI profile from ~/.aws/credentials (leave empty for default)</span>
                </div>

                <div class="form-group">
                    <label for="aws-region">AWS Region *</label>
                    <vscode-dropdown id="aws-region">
                        <vscode-option value="">Select Region...</vscode-option>
                        <vscode-option value="us-east-1">US East (N. Virginia)</vscode-option>
                        <vscode-option value="us-east-2">US East (Ohio)</vscode-option>
                        <vscode-option value="us-west-1">US West (N. California)</vscode-option>
                        <vscode-option value="us-west-2">US West (Oregon)</vscode-option>
                        <vscode-option value="ca-central-1">Canada (Central)</vscode-option>
                        <vscode-option value="eu-west-1">Europe (Ireland)</vscode-option>
                        <vscode-option value="eu-west-2">Europe (London)</vscode-option>
                        <vscode-option value="eu-central-1">Europe (Frankfurt)</vscode-option>
                        <vscode-option value="ap-south-1">Asia Pacific (Mumbai)</vscode-option>
                        <vscode-option value="ap-northeast-1">Asia Pacific (Tokyo)</vscode-option>
                        <vscode-option value="ap-southeast-1">Asia Pacific (Singapore)</vscode-option>
                        <vscode-option value="ap-southeast-2">Asia Pacific (Sydney)</vscode-option>
                    </vscode-dropdown>
                </div>

                <div class="form-group">
                    <vscode-button id="discover-rds-btn" appearance="secondary">
                        <span class="codicon codicon-search"></span>
                        Discover RDS Instances
                    </vscode-button>
                    <span class="help-text">Find MySQL/MariaDB RDS instances in selected region</span>
                </div>

                <div class="form-group" id="rds-instance-group" style="display: none;">
                    <label for="rds-instance">RDS Instance</label>
                    <vscode-dropdown id="rds-instance">
                        <vscode-option value="">Select instance...</vscode-option>
                    </vscode-dropdown>
                    <span class="help-text">Select an instance to auto-fill host and port</span>
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

            <!-- SSH Tunnel Settings -->
            <section class="form-section" id="ssh-section" style="display: none;">
                <h2>SSH Tunnel</h2>

                <div class="form-group">
                    <vscode-checkbox id="ssh-enabled">Enable SSH Tunnel</vscode-checkbox>
                    <span class="help-text">Connect through an SSH bastion/jump server</span>
                </div>

                <div id="ssh-options" style="display: none;">
                    <div class="form-row">
                        <div class="form-group flex-2">
                            <label for="ssh-host">SSH Host *</label>
                            <vscode-text-field id="ssh-host" placeholder="bastion.example.com" required></vscode-text-field>
                        </div>
                        <div class="form-group flex-1">
                            <label for="ssh-port">SSH Port *</label>
                            <vscode-text-field id="ssh-port" type="number" placeholder="22" value="22" required></vscode-text-field>
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="ssh-user">SSH Username *</label>
                        <vscode-text-field id="ssh-user" placeholder="ubuntu" required></vscode-text-field>
                    </div>

                    <div class="form-group">
                        <label for="ssh-key-path">SSH Private Key *</label>
                        <div class="file-input-group">
                            <vscode-text-field id="ssh-key-path" placeholder="/path/to/private_key or ~/.ssh/id_rsa" readonly></vscode-text-field>
                            <vscode-button id="browse-ssh-key" appearance="secondary">Browse</vscode-button>
                        </div>
                        <span class="help-text">Path to your SSH private key file (e.g., ~/.ssh/id_rsa)</span>
                    </div>

                    <div class="form-group">
                        <label for="ssh-passphrase">SSH Key Passphrase (optional)</label>
                        <vscode-text-field id="ssh-passphrase" type="password" placeholder="Leave empty if key has no passphrase"></vscode-text-field>
                    </div>
                </div>
            </section>

            <!-- AWS IAM Authentication -->
            <section class="form-section" id="aws-iam-section" style="display: none;">
                <h2>AWS IAM Authentication</h2>

                <div class="form-group">
                    <vscode-checkbox id="aws-iam-enabled">Enable AWS IAM Authentication</vscode-checkbox>
                    <span class="help-text">Use IAM credentials to authenticate to RDS. Uses AWS Profile and Region from discovery above.</span>
                </div>

                <div id="aws-iam-options" style="display: none;">
                    <div class="form-group">
                        <label for="aws-iam-role-arn">Role ARN (optional)</label>
                        <vscode-text-field id="aws-iam-role-arn" placeholder="arn:aws:iam::123456789012:role/MyRDSRole"></vscode-text-field>
                        <span class="help-text">IAM role to assume for RDS access (for cross-account or elevated permissions)</span>
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
