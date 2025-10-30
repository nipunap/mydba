// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { ConnectionManager } from '../services/connection-manager';
import { QueriesWithoutIndexesService, QueryWithoutIndexInfo as _QueryWithoutIndexInfo, PerformanceSchemaConfigurationError } from '../services/queries-without-indexes-service';

export class QueriesWithoutIndexesPanel {
    private static panelRegistry: Map<string, QueriesWithoutIndexesPanel> = new Map();
    private readonly panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];
    private isRefreshing = false;
    private autoRefreshInterval?: NodeJS.Timeout;

    private constructor(
        panel: vscode.WebviewPanel,
        private context: vscode.ExtensionContext,
        private logger: Logger,
        private connectionManager: ConnectionManager,
        private connectionId: string,
        private service: QueriesWithoutIndexesService
    ) {
        this.panel = panel;
        this.panel.webview.html = this.getHtml();
        this.setupMessageHandling();
        this.loadQueries();
        this.startAutoRefresh();
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    public static show(
        context: vscode.ExtensionContext,
        logger: Logger,
        connectionManager: ConnectionManager,
        connectionId: string
    ): void {
        const panelKey = `queriesWithoutIndexes-${connectionId}`;
        const connection = connectionManager.getConnection(connectionId);

        if (!connection) {
            vscode.window.showErrorMessage('Connection not found');
            return;
        }

        // Reuse existing panel if available
        const existingPanel = QueriesWithoutIndexesPanel.panelRegistry.get(panelKey);
        if (existingPanel) {
            existingPanel.panel.reveal(vscode.ViewColumn.Active);
            existingPanel.loadQueries();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'mydbaQueriesWithoutIndexes',
            `Queries Without Indexes - ${connection.name}`,
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'media'),
                    vscode.Uri.joinPath(context.extensionUri, 'node_modules', '@vscode/webview-ui-toolkit')
                ]
            }
        );

        const service = new QueriesWithoutIndexesService(logger);
        const queriesPanel = new QueriesWithoutIndexesPanel(
            panel,
            context,
            logger,
            connectionManager,
            connectionId,
            service
        );
        QueriesWithoutIndexesPanel.panelRegistry.set(panelKey, queriesPanel);
    }

    private setupMessageHandling(): void {
        this.panel.webview.onDidReceiveMessage(
            async (message: unknown) => {
                switch (message.type) {
                    case 'refresh':
                        await this.loadQueries();
                        break;
                    case 'toggleAutoRefresh':
                        this.toggleAutoRefresh();
                        break;
                    case 'explainQuery':
                        await this.explainQuery(message.digestText);
                        break;
                    case 'profileQuery':
                        await this.profileQuery(message.digestText);
                        break;
                }
            },
            null,
            this.disposables
        );
    }

    private async loadQueries(): Promise<void> {
        if (this.isRefreshing) {
            return;
        }

        this.isRefreshing = true;
        this.logger.info(`Loading queries without indexes for connection: ${this.connectionId}`);

        try {
            const adapter = this.connectionManager.getAdapter(this.connectionId);
            if (!adapter) {
                throw new Error('Connection not found');
            }

            const queries = await this.service.detectQueriesWithoutIndexes(adapter as any);

            this.panel.webview.postMessage({
                type: 'queriesLoaded',
                queries,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            // Handle Performance Schema configuration error
            if (error instanceof PerformanceSchemaConfigurationError) {
                await this.handleConfigurationError(error);
            } else {
                this.logger.error('Failed to load queries without indexes:', error as Error);
                this.panel.webview.postMessage({
                    type: 'error',
                    message: (error as Error).message
                });
            }
        } finally {
            this.isRefreshing = false;
        }
    }

    private async handleConfigurationError(error: PerformanceSchemaConfigurationError): Promise<void> {
        const config = error.config;

        // Build informative message
        let message = '**Performance Schema Configuration Required**\n\n';
        message += 'To detect queries without indexes, MyDBA needs to enable Performance Schema instrumentation:\n\n';

        if (config.needsInstruments) {
            message += `• **Statement Instruments**: ${config.instrumentCount} instruments need to be enabled\n`;
            message += '  (Tracks query execution)\n\n';
        }

        if (config.needsConsumers) {
            message += `• **Statement Consumers**: ${config.consumerCount} consumers need to be enabled\n`;
            message += '  (Records query statistics)\n\n';
        }

        message += '**This will:**\n';
        message += '• Slightly increase memory usage (~5-10MB)\n';
        message += '• Add minimal CPU overhead (<1%)\n';
        message += '• Persist across sessions (until server restart)\n\n';
        message += '**Your data remains secure** - only query patterns are collected, not result data.\n\n';
        message += 'Would you like MyDBA to apply this configuration?';

        // Show modal dialog
        const choice = await vscode.window.showInformationMessage(
            'Performance Schema Configuration',
            {
                modal: true,
                detail: message
            },
            'Apply Configuration',
            'View Documentation',
            'Cancel'
        );

        if (choice === 'Apply Configuration') {
            await this.applyConfiguration();
        } else if (choice === 'View Documentation') {
            vscode.env.openExternal(vscode.Uri.parse('https://dev.mysql.com/doc/refman/8.4/en/performance-schema-query-profiling.html'));
            // Show the dialog again
            await this.handleConfigurationError(error);
        } else {
            // User cancelled - show message in panel
            this.panel.webview.postMessage({
                type: 'configurationRequired',
                config: error.config
            });
        }
    }

    private async applyConfiguration(): Promise<void> {
        try {
            this.logger.info('Applying Performance Schema configuration...');

            const adapter = this.connectionManager.getAdapter(this.connectionId);
            if (!adapter) {
                throw new Error('Connection not found');
            }

            // Show progress
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Applying Performance Schema configuration...',
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: 'Enabling instruments...' });
                await this.service.applyPerformanceSchemaConfiguration(adapter as any);
                progress.report({ increment: 100, message: 'Done!' });
            });

            vscode.window.showInformationMessage('Performance Schema configured successfully!');

            // Reload queries
            await this.loadQueries();

        } catch (error) {
            this.logger.error('Failed to apply configuration:', error as Error);
            vscode.window.showErrorMessage(`Failed to apply configuration: ${(error as Error).message}`);
        }
    }

    private startAutoRefresh(): void {
        this.autoRefreshInterval = setInterval(() => {
            this.loadQueries();
        }, 30000); // Refresh every 30 seconds
    }

    private toggleAutoRefresh(): void {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = undefined;
            this.panel.webview.postMessage({ type: 'autoRefreshOff' });
        } else {
            this.startAutoRefresh();
            this.panel.webview.postMessage({ type: 'autoRefreshOn' });
        }
    }

    private async explainQuery(queryText: string): Promise<void> {
        try {
            const adapter = this.connectionManager.getAdapter(this.connectionId);
            if (!adapter) {
                throw new Error('Connection not found');
            }

            // Remove any existing EXPLAIN prefix to avoid double EXPLAIN
            let cleanQuery = queryText.trim();
            const explainPrefixRegex = /^EXPLAIN\s+(FORMAT\s*=\s*(JSON|TRADITIONAL|TREE)\s+)?/i;
            cleanQuery = cleanQuery.replace(explainPrefixRegex, '').trim();

            const explainResult = await adapter.query<unknown>(`EXPLAIN FORMAT=JSON ${cleanQuery}`);

            // Import ExplainViewerPanel and AIService
            const { ExplainViewerPanel } = await import('./explain-viewer-panel');
            const { AIService } = await import('../services/ai-service');

            // Create AI service for enhanced analysis
            const aiService = new AIService(this.logger, this.context);
            await aiService.initialize();

            // Show EXPLAIN viewer with AI insights
            ExplainViewerPanel.show(
                this.context,
                this.logger,
                this.connectionManager,
                this.connectionId,
                cleanQuery,
                Array.isArray(explainResult) ? explainResult[0] : (explainResult.rows?.[0] || {}),
                aiService
            );

        } catch (error) {
            this.logger.error('Failed to explain query:', error as Error);
            vscode.window.showErrorMessage(`Failed to explain query: ${(error as Error).message}`);
        }
    }

    private async profileQuery(queryText: string): Promise<void> {
        try {
            const adapter = this.connectionManager.getAdapter(this.connectionId);
            if (!adapter) {
                throw new Error('Connection not found');
            }
            const { QueryProfilingPanel } = await import('./query-profiling-panel');
            const { AIService } = await import('../services/ai-service');
            const aiService = new AIService(this.logger, this.context);
            await aiService.initialize();
            QueryProfilingPanel.show(
                this.context,
                this.logger,
                this.connectionManager,
                this.connectionId,
                queryText,
                aiService
            );
        } catch (error) {
            this.logger.error('Failed to profile query:', error as Error);
            vscode.window.showErrorMessage(`Failed to profile query: ${(error as Error).message}`);
        }
    }

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
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
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'queriesWithoutIndexesView.js')
        );

        const styleUri = this.panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'queriesWithoutIndexesView.css')
        );

        const nonce = this.getNonce();
        const cacheBuster = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${this.panel.webview.cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUri}?v=${cacheBuster}" rel="stylesheet">
    <title>Queries Without Indexes</title>
</head>
<body>
    <div class="container">
        <div class="toolbar">
            <div class="toolbar-left">
                <h2>Queries Without Indexes</h2>
                <span id="query-count" class="count-badge">0</span>
            </div>
            <div class="toolbar-actions">
                <vscode-button id="refresh-btn" appearance="secondary">
                    <span class="codicon codicon-refresh"></span>
                    Refresh
                </vscode-button>
                <vscode-button id="auto-refresh-btn" appearance="secondary">
                    <span class="codicon codicon-play"></span>
                    Auto-refresh (30s)
                </vscode-button>
            </div>
        </div>

        <div id="loading" class="loading">
            <vscode-progress-ring></vscode-progress-ring>
            <span>Analyzing query performance...</span>
        </div>

        <div id="error" class="error" style="display: none;">
            <span class="codicon codicon-error"></span>
            <div>
                <h3>Error</h3>
                <p id="error-message"></p>
            </div>
        </div>

        <div id="content" style="display: none;">
            <div class="info-panel">
                <p><strong>Note:</strong> This analysis uses MySQL Performance Schema to identify queries that may benefit from indexing.</p>
                <p>Queries are sorted by the number of rows examined (highest impact first).</p>
                <p id="threshold-info" style="margin-top: 8px; font-size: 12px; color: var(--vscode-descriptionForeground);">Detection thresholds: Configure in settings (mydba.qwi.*)</p>
            </div>

            <div id="index-health-section" style="display: none;">
                <h3 style="margin: 20px 0 10px 0;">Index Health</h3>
                <div id="index-health-content"></div>
            </div>

            <div id="queries-list"></div>

            <div id="empty-state" class="empty-state" style="display: none;">
                <span class="codicon codicon-check-all"></span>
                <h3>No Issues Found</h3>
                <p>All queries are using indexes efficiently.</p>
                <p>This is great for performance! 🎉</p>
            </div>
        </div>

        <div class="footer">
            <span id="last-updated"></span>
        </div>
    </div>

    <script type="module" nonce="${nonce}" src="${toolkitUri}"></script>
    <script nonce="${nonce}" src="${scriptUri}?v=${cacheBuster}"></script>
</body>
</html>`;
    }

    dispose(): void {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
        }
        this.panel.dispose();
        const key = Array.from(QueriesWithoutIndexesPanel.panelRegistry.entries())
            .find(([, panel]) => panel === this)?.[0];
        if (key) {
            QueriesWithoutIndexesPanel.panelRegistry.delete(key);
        }
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
