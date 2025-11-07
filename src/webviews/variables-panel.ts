import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { ConnectionManager } from '../services/connection-manager';
// import { Variable } from '../types';

interface VariableMetadata {
    category: string;
    type: string;
    risk: 'safe' | 'caution' | 'dangerous';
    description: string;
    recommendation: string;
    min?: number;
    max?: number;
    options?: string[];
}

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
                    case 'editVariable':
                        await this.handleEditVariable(message.name, message.value, message.scope);
                        break;
                    case 'validateVariable':
                        await this.handleValidateVariable(message.name, message.value);
                        break;
                    case 'getAIDescription':
                        await this.handleGetAIDescription(message.name, message.currentValue);
                        break;
                }
            },
            null,
            this.disposables
        );
    }

    private async handleEditVariable(name: string, value: string, scope: 'global' | 'session'): Promise<void> {
        try {
            const adapter = this.connectionManager.getAdapter(this.connectionId);
            if (!adapter) {
                throw new Error('Connection not found or not connected');
            }

            // Validate variable name (prevent SQL injection)
            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
                throw new Error('Invalid variable name');
            }

            // Confirm dangerous changes
            const variableInfo = this.getVariableMetadata(name);
            if (variableInfo.risk === 'dangerous') {
                const confirm = await vscode.window.showWarningMessage(
                    `⚠️ WARNING: Changing '${name}' can have serious consequences!\n\n` +
                    `${variableInfo.description}\n\n` +
                    `Are you sure you want to proceed?`,
                    { modal: true },
                    'Yes, Change It',
                    'Cancel'
                );

                if (confirm !== 'Yes, Change It') {
                    this.panel.webview.postMessage({
                        type: 'editCancelled',
                        name: name
                    });
                    return;
                }
            }

            // Execute SET command
            const scopeKeyword = scope === 'global' ? 'GLOBAL' : 'SESSION';
            const setQuery = `SET ${scopeKeyword} ${name} = ${this.escapeValue(value)}`;

            await adapter.query(setQuery);

            // Success - reload variables
            await this.loadVariables();

            this.panel.webview.postMessage({
                type: 'editSuccess',
                name: name,
                value: value
            });

            vscode.window.showInformationMessage(`✅ Variable '${name}' updated successfully`);
        } catch (error) {
            this.logger.error(`Failed to edit variable ${name}:`, error as Error);
            this.panel.webview.postMessage({
                type: 'editError',
                name: name,
                message: (error as Error).message
            });
            vscode.window.showErrorMessage(`Failed to update variable: ${(error as Error).message}`);
        }
    }

    private async handleValidateVariable(name: string, value: string): Promise<void> {
        try {
            const variableInfo = this.getVariableMetadata(name);
            const validation = this.validateValue(variableInfo, value);

            this.panel.webview.postMessage({
                type: 'validationResult',
                name: name,
                valid: validation.valid,
                message: validation.message
            });
        } catch (error) {
            this.logger.error(`Failed to validate variable ${name}:`, error as Error);
        }
    }

    private escapeValue(value: string): string {
        // Handle different value types
        const upperValue = value.toUpperCase();
        if (upperValue === 'ON' || upperValue === 'OFF' || upperValue === 'TRUE' || upperValue === 'FALSE') {
            // Return uppercase version for MySQL/MariaDB compatibility
            return upperValue;
        }
        // Numeric values
        if (/^-?\d+(\.\d+)?$/.test(value)) {
            return value;
        }
        // String values - escape and quote
        return `'${value.replace(/'/g, "''")}'`;
    }

    private validateValue(variableInfo: VariableMetadata, value: string): { valid: boolean; message: string } {
        // Type validation
        if (variableInfo.type === 'boolean') {
            if (!['ON', 'OFF', '0', '1', 'TRUE', 'FALSE'].includes(value.toUpperCase())) {
                return { valid: false, message: 'Must be ON, OFF, 0, 1, TRUE, or FALSE' };
            }
        } else if (variableInfo.type === 'integer') {
            if (!/^-?\d+$/.test(value)) {
                return { valid: false, message: 'Must be an integer' };
            }
            const num = parseInt(value, 10);
            if (variableInfo.min !== undefined && num < variableInfo.min) {
                return { valid: false, message: `Must be at least ${variableInfo.min}` };
            }
            if (variableInfo.max !== undefined && num > variableInfo.max) {
                return { valid: false, message: `Must be at most ${variableInfo.max}` };
            }
        } else if (variableInfo.type === 'size') {
            // Size with suffixes like 1M, 1G, etc.
            if (!/^\d+[KMG]?$/i.test(value)) {
                return { valid: false, message: 'Must be a number with optional K/M/G suffix' };
            }
        } else if (variableInfo.type === 'enum' && variableInfo.options) {
            if (!variableInfo.options.includes(value.toUpperCase())) {
                return { valid: false, message: `Must be one of: ${variableInfo.options.join(', ')}` };
            }
        }

        return { valid: true, message: 'Valid' };
    }

    private async handleGetAIDescription(name: string, currentValue: string): Promise<void> {
        try {
            this.logger.info(`Generating AI description for variable: ${name}`);

            // Send loading state
            this.panel.webview.postMessage({
                type: 'aiDescriptionLoading',
                name
            });

            // Get database type
            const connection = this.connectionManager.getConnection(this.connectionId);
            const dbType = connection?.type === 'mariadb' ? 'mariadb' : 'mysql';

            // Initialize AI service coordinator
            const { AIServiceCoordinator } = await import('../services/ai-service-coordinator');
            const aiCoordinator = new AIServiceCoordinator(this.logger, this.context);
            await aiCoordinator.initialize();

            // Check if AI is available
            const providerInfo = aiCoordinator.getProviderInfo();
            if (!providerInfo || !providerInfo.available) {
                throw new Error('AI service not available. Please configure an AI provider in settings.');
            }

            // Create a prompt for the AI to describe the variable
            const prompt = `You are a senior database administrator expert. Provide a clear, concise description for the MySQL/MariaDB system variable '${name}' which currently has the value '${currentValue}'.

Include:
1. What this variable controls
2. Common use cases
3. Recommended values or best practices
4. Any risks or warnings about changing it

Be concise (2-3 sentences) and practical. Focus on actionable information for a DBA.`;

            // Get AI response
            const response = await aiCoordinator.analyzeQuery(
                prompt,
                { tables: {} },
                dbType
            );

            // Extract description from summary
            const description = response.summary || 'AI was unable to generate a description.';

            // Determine risk level based on variable name patterns
            let risk: 'safe' | 'caution' | 'dangerous' = 'safe';
            if (name.includes('binlog') || name.includes('log_bin') || name.includes('gtid') ||
                name.includes('sql_mode') || name.includes('read_only')) {
                risk = 'dangerous';
            } else if (name.includes('timeout') || name.includes('lock') || name.includes('innodb')) {
                risk = 'caution';
            }

            // Send the AI-generated description
            this.panel.webview.postMessage({
                type: 'aiDescriptionReceived',
                name,
                description,
                recommendation: response.optimizationSuggestions?.[0]?.description || 'Review documentation before changing',
                risk
            });

        } catch (error) {
            this.logger.error('Failed to generate AI description:', error as Error);
            this.panel.webview.postMessage({
                type: 'aiDescriptionError',
                name,
                error: (error as Error).message
            });
        }
    }

    private getVariableMetadata(name: string): VariableMetadata {
        // Variable metadata with categories, risk levels, and validation rules
        const metadata: Record<string, VariableMetadata> = {
            // Performance variables - Safe to change
            'query_cache_size': {
                category: 'Performance',
                type: 'size',
                risk: 'safe',
                description: 'Size of query cache. 0 disables query cache.',
                recommendation: 'Set based on available memory'
            },
            'max_connections': {
                category: 'Connection',
                type: 'integer',
                min: 1,
                max: 100000,
                risk: 'caution',
                description: 'Maximum number of concurrent connections',
                recommendation: 'Monitor connection usage before changing'
            },
            'innodb_buffer_pool_size': {
                category: 'InnoDB',
                type: 'size',
                risk: 'caution',
                description: 'Size of InnoDB buffer pool (requires restart)',
                recommendation: 'Set to 70-80% of available RAM for dedicated database servers'
            },
            'max_allowed_packet': {
                category: 'Performance',
                type: 'size',
                risk: 'safe',
                description: 'Maximum size of one packet or generated/intermediate string',
                recommendation: 'Increase for large BLOB/TEXT operations'
            },
            'sql_mode': {
                category: 'Behavior',
                type: 'string',
                risk: 'caution',
                description: 'SQL mode affects query behavior and validation',
                recommendation: 'Changing can break existing queries'
            },
            // Dangerous variables
            'read_only': {
                category: 'Replication',
                type: 'boolean',
                risk: 'dangerous',
                description: 'Makes server read-only. Can break applications!',
                recommendation: 'Only change if you know what you are doing'
            },
            'skip_networking': {
                category: 'Security',
                type: 'boolean',
                risk: 'dangerous',
                description: 'Disables TCP/IP connections. Will lock you out!',
                recommendation: 'DO NOT change unless using socket connections only'
            },
            'innodb_flush_log_at_trx_commit': {
                category: 'InnoDB',
                type: 'enum',
                options: ['0', '1', '2'],
                risk: 'caution',
                description: 'Controls durability vs performance tradeoff',
                recommendation: '1 = safest (default), 0/2 = faster but risk data loss'
            }
        };

        return metadata[name] || {
            category: 'Other',
            type: 'string',
            risk: 'safe',
            description: 'No description available',
            recommendation: 'Consult MySQL documentation before changing'
        };
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

            // Enrich variables with metadata
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const enrichedVariables = variables.map((v: any) => ({
                ...v,
                metadata: this.getVariableMetadata(v.name)
            }));

            this.panel.webview.postMessage({
                type: 'variablesLoaded',
                variables: enrichedVariables,
                scope: this.currentScope
            });
        } catch (error) {
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
                        <th class="actions-header">Actions</th>
                    </tr>
                </thead>
                <tbody id="variables-tbody">
                    <!-- Populated by JavaScript -->
                </tbody>
            </table>
            <div id="variable-count"></div>
        </div>
    </div>

    <!-- Edit Variable Modal -->
    <div id="edit-modal" class="modal" style="display: none;">
        <div class="modal-content">
            <div class="modal-header">
                <h3>Edit Variable</h3>
                <button id="modal-close" class="close-btn" title="Close">
                    <span class="codicon codicon-close"></span>
                </button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label for="edit-var-name">Variable Name:</label>
                    <input type="text" id="edit-var-name" readonly class="readonly-input">
                </div>
                <div class="form-group">
                    <label for="edit-var-value">New Value:</label>
                    <input type="text" id="edit-var-value" placeholder="Enter new value">
                    <div id="validation-message" class="validation-message"></div>
                </div>
                <div id="variable-info" class="variable-info">
                    <div class="info-row">
                        <span class="info-label">Category:</span>
                        <span id="var-category"></span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Risk Level:</span>
                        <span id="var-risk" class="risk-badge"></span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Current Value:</span>
                        <span id="var-current"></span>
                    </div>
                    <div class="info-section">
                        <strong>Description:</strong>
                        <p id="var-description"></p>
                        <button id="get-ai-description-btn" class="ai-description-btn" style="display: none;">
                            <span class="codicon codicon-sparkle"></span> Get AI Description
                        </button>
                    </div>
                    <div class="info-section">
                        <strong>Recommendation:</strong>
                        <p id="var-recommendation"></p>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <vscode-button id="cancel-btn" appearance="secondary">Cancel</vscode-button>
                <vscode-button id="save-btn" appearance="primary">Save Changes</vscode-button>
            </div>
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
