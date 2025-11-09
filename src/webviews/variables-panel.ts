import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { ConnectionManager } from '../services/connection-manager';
import { VariablesService } from '../services/variables-service';
import { AuditLogger } from '../services/audit-logger';
import { DisposableManager } from '../core/disposable-manager';
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
    private disposables = new DisposableManager();
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
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables.bag);
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
            this.disposables.bag
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

            // Prod safeguards: block GLOBAL by default; require explict override + reason
            const connection = this.connectionManager.getConnection(this.connectionId);
            const isProd = connection?.environment === 'prod';
            let reason: string | undefined;
            let allowGlobalInProd = false;
            if (isProd && scope === 'global') {
                const override = await vscode.window.showWarningMessage(
                    'GLOBAL variable changes are blocked by default in production. Override?',
                    { modal: true },
                    'Override',
                    'Cancel'
                );
                if (override !== 'Override') {
                    this.panel.webview.postMessage({
                        type: 'editCancelled',
                        name: name
                    });
                    return;
                }
                reason = await vscode.window.showInputBox({
                    title: 'Reason for GLOBAL change (required)',
                    prompt: 'Provide a brief reason for audit logging.',
                    validateInput: (text) => text.trim().length === 0 ? 'Reason is required' : undefined
                });
                if (!reason) {
                    this.panel.webview.postMessage({
                        type: 'editCancelled',
                        name: name
                    });
                    return;
                }
                allowGlobalInProd = true;
            }

            // Use VariablesService for safe setting, validation, audit, undo
            const variablesService = new VariablesService(
                this.context,
                this.logger,
                this.connectionManager,
                new AuditLogger(this.context, this.logger)
            );
            await variablesService.setVariable(
                this.connectionId,
                scope === 'global' ? 'GLOBAL' : 'SESSION',
                name,
                value,
                {
                    allowGlobalInProd,
                    reason
                }
            );

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

    private escapeValue(value: string, variableType: string): string {
        // Handle different value types based on variable metadata
        const trimmedValue = value.trim();
        const upperValue = trimmedValue.toUpperCase();

        // Handle NULL - unquoted keyword
        if (upperValue === 'NULL') {
            return 'NULL';
        }

        // Handle DEFAULT - unquoted keyword to reset to default value
        if (upperValue === 'DEFAULT') {
            return 'DEFAULT';
        }

        // Boolean keywords should only be unquoted for boolean/enum types
        if ((variableType === 'boolean' || variableType === 'enum') &&
            (upperValue === 'ON' || upperValue === 'OFF' || upperValue === 'TRUE' || upperValue === 'FALSE')) {
            // Return uppercase version for MySQL/MariaDB compatibility
            return upperValue;
        }

        // Numeric values (integers and sizes)
        if (variableType === 'integer' || variableType === 'size') {
            // For size types, allow K/M/G suffixes (but not negative values)
            if (variableType === 'size' && /^\d+[KMG]?$/i.test(trimmedValue)) {
                // Validate that size isn't negative
                if (trimmedValue.startsWith('-')) {
                    throw new Error('Size values cannot be negative');
                }
                return trimmedValue;
            }
            // For integers and plain numbers
            if (/^-?\d+(\.\d+)?$/.test(trimmedValue)) {
                return trimmedValue;
            }
        }

        // Enum values (other than boolean keywords handled above) - leave unquoted
        if (variableType === 'enum') {
            // MySQL system variable enum values can be unquoted
            // e.g., innodb_flush_log_at_trx_commit = 0, 1, or 2
            return upperValue;
        }

        // String values and everything else - escape and quote
        // This ensures that if a user wants to set a string variable to "on" or "off",
        // it will be properly quoted as 'on' or 'off' instead of treated as a boolean keyword
        return `'${trimmedValue.replace(/'/g, "''")}'`;
    }

    private validateValue(variableInfo: VariableMetadata, value: string): { valid: boolean; message: string } {
        const trimmedValue = value.trim();
        const upperValue = trimmedValue.toUpperCase();

        // Allow NULL and DEFAULT for all types (MySQL keywords)
        if (upperValue === 'NULL' || upperValue === 'DEFAULT') {
            return { valid: true, message: 'Valid' };
        }

        // Type validation
        if (variableInfo.type === 'boolean') {
            if (!['ON', 'OFF', '0', '1', 'TRUE', 'FALSE'].includes(upperValue)) {
                return { valid: false, message: 'Must be ON, OFF, 0, 1, TRUE, or FALSE (or NULL/DEFAULT)' };
            }
        } else if (variableInfo.type === 'integer') {
            if (!/^-?\d+$/.test(trimmedValue)) {
                return { valid: false, message: 'Must be an integer (or NULL/DEFAULT)' };
            }
            const num = parseInt(trimmedValue, 10);
            if (variableInfo.min !== undefined && num < variableInfo.min) {
                return { valid: false, message: `Must be at least ${variableInfo.min}` };
            }
            if (variableInfo.max !== undefined && num > variableInfo.max) {
                return { valid: false, message: `Must be at most ${variableInfo.max}` };
            }
        } else if (variableInfo.type === 'size') {
            // Size with suffixes like 1M, 1G, etc.
            if (!/^\d+[KMG]?$/i.test(trimmedValue)) {
                return { valid: false, message: 'Must be a number with optional K/M/G suffix (or NULL/DEFAULT)' };
            }
            // Reject negative sizes
            if (trimmedValue.startsWith('-')) {
                return { valid: false, message: 'Size values cannot be negative' };
            }
        } else if (variableInfo.type === 'enum' && variableInfo.options) {
            if (!variableInfo.options.includes(upperValue)) {
                return { valid: false, message: `Must be one of: ${variableInfo.options.join(', ')} (or NULL/DEFAULT)` };
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

            // Initialize AI service coordinator and RAG service
            const { AIServiceCoordinator } = await import('../services/ai-service-coordinator');
            const aiCoordinator = new AIServiceCoordinator(this.logger, this.context);
            await aiCoordinator.initialize();

            // Check if AI is available
            const providerInfo = aiCoordinator.getProviderInfo();
            if (!providerInfo || !providerInfo.available) {
                throw new Error('AI service not available. Please configure an AI provider in settings.');
            }

            // Get RAG statistics to check if documentation is available
            const ragStats = aiCoordinator.getRAGStats();
            this.logger.debug(`RAG stats: ${ragStats.total} documents available`);

            // Create a structured prompt for the AI
            const prompt = `You are a senior database administrator expert. Analyze the ${dbType === 'mariadb' ? 'MariaDB' : 'MySQL'} system variable '${name}' which currently has the value '${currentValue}'.

Provide your response in the following format (use the exact section headers shown):

DESCRIPTION:
Explain what this variable controls, how it affects the database, and what the current value means. 2-3 sentences. Start directly with the explanation - do NOT repeat the word "DESCRIPTION" in your content.

RECOMMENDATION:
Provide specific, actionable advice about whether to keep or change this value, best practices, and any warnings. 1-2 sentences. Start directly with the advice - do NOT repeat the word "RECOMMENDATION" in your content.

Focus on practical, production-ready advice based on real-world DBA experience. If reference documentation is provided, incorporate it into your response.`;

            // Get AI response with RAG support
            // RAG will retrieve relevant documentation about the variable if available
            const response = await aiCoordinator.getSimpleCompletion(
                prompt,
                dbType,
                true, // Include RAG documentation
                name  // Use variable name as RAG query
            );

            // Parse the response to extract description and recommendation
            const { description, recommendation } = this.parseAIResponse(response, name);

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
                recommendation,
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

    /**
     * Parse AI response to extract description and recommendation
     */
    private parseAIResponse(response: string, variableName: string): { description: string; recommendation: string } {
        // Try to extract DESCRIPTION: and RECOMMENDATION: sections
        const descMatch = response.match(/DESCRIPTION:\s*\n([\s\S]*?)(?=\n\s*RECOMMENDATION:|$)/i);
        const recMatch = response.match(/RECOMMENDATION:\s*\n([\s\S]*?)$/i);

        if (descMatch && recMatch) {
            let description = descMatch[1].trim();
            let recommendation = recMatch[1].trim();

            // Remove any markdown headers that AI might have added (e.g., **DESCRIPTION:**, **RECOMMENDATION:**)
            description = description.replace(/^\*\*DESCRIPTION:\*\*\s*/i, '').trim();
            recommendation = recommendation.replace(/^\*\*RECOMMENDATION:\*\*\s*/i, '').trim();

            // Also remove plain text headers if present
            description = description.replace(/^DESCRIPTION:\s*/i, '').trim();
            recommendation = recommendation.replace(/^RECOMMENDATION:\s*/i, '').trim();

            // Clean markdown formatting from content
            description = this.cleanMarkdown(description);
            recommendation = this.cleanMarkdown(recommendation);

            return {
                description,
                recommendation
            };
        }

        // Fallback: Try to split by paragraph or sentence
        const sentences = response.split(/\n\n+|\. (?=[A-Z])/);
        if (sentences.length >= 2) {
            // First part is description, rest is recommendation
            const description = this.cleanMarkdown(sentences.slice(0, Math.ceil(sentences.length / 2)).join('. ').trim());
            const recommendation = this.cleanMarkdown(sentences.slice(Math.ceil(sentences.length / 2)).join('. ').trim());
            return { description, recommendation };
        }

        // Last resort: Use full response as description with generic recommendation
        return {
            description: this.cleanMarkdown(response.trim()),
            recommendation: `Review ${variableName} documentation and test changes in a non-production environment before applying.`
        };
    }

    /**
     * Clean markdown formatting from text
     * Removes common markdown syntax while preserving the text content
     */
    private cleanMarkdown(text: string): string {
        if (!text) return '';

        let cleaned = text;

        // Remove bold markers (**text** or __text__)
        cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');
        cleaned = cleaned.replace(/__([^_]+)__/g, '$1');

        // Remove italic markers (*text* or _text_)
        cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');
        cleaned = cleaned.replace(/_([^_]+)_/g, '$1');

        // Remove inline code markers (`code`)
        cleaned = cleaned.replace(/`([^`]+)`/g, '$1');

        // Remove strikethrough (~~text~~)
        cleaned = cleaned.replace(/~~([^~]+)~~/g, '$1');

        // Remove markdown links [text](url) -> text
        cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

        // Remove markdown headers (## Header -> Header)
        cleaned = cleaned.replace(/^#+\s+/gm, '');

        // Remove markdown list markers (- item, * item, 1. item)
        cleaned = cleaned.replace(/^[\s]*[-*+]\s+/gm, '');
        cleaned = cleaned.replace(/^[\s]*\d+\.\s+/gm, '');

        // Remove blockquote markers (> text)
        cleaned = cleaned.replace(/^>\s+/gm, '');

        // Remove code block markers (```language or ```)
        cleaned = cleaned.replace(/```[\w]*\n?/g, '');

        // Remove horizontal rules (---, ***, ___)
        cleaned = cleaned.replace(/^[\s]*[-*_]{3,}[\s]*$/gm, '');

        // Clean up multiple spaces and trim
        cleaned = cleaned.replace(/\s+/g, ' ').trim();

        return cleaned;
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

        this.disposables.disposeAll();
    }
}
