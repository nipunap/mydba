/**
 * Storage Engine Status View
 * Webview panel for monitoring InnoDB and Aria storage engine status
 */

import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { InnoDBStatusService } from '../services/innodb-status-service';
import { AriaStatusService } from '../services/aria-status-service';
import { AIServiceCoordinator } from '../services/ai-service-coordinator';
import { IDatabaseAdapter } from '../adapters/database-adapter';
import { InnoDBStatus, AriaStatus } from '../types/storage-engine-types';

export class StorageEngineView {
    public static readonly viewType = 'mydba.storageEngineView';

    // Track panels per connection - allows multiple connections to have their own monitors
    private panels = new Map<string, vscode.WebviewPanel>();
    private disposables: vscode.Disposable[] = [];

    // Per-connection state
    private autoRefreshIntervals = new Map<string, NodeJS.Timeout>();
    private autoRefreshEnabled = new Map<string, boolean>();
    private refreshIntervalSeconds = new Map<string, number>();
    private failureCounts = new Map<string, number>();
    private readonly MAX_FAILURES = 3;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly logger: Logger,
        private readonly innoDBService: InnoDBStatusService,
        private readonly ariaService: AriaStatusService,
        private readonly aiCoordinator: AIServiceCoordinator
    ) {}

    /**
     * Show the view for a specific connection
     */
    public async show(connectionId: string): Promise<void> {
        // Get connection name for panel title
        const connection = await vscode.commands.executeCommand('mydba.internal.getAdapter', connectionId);
        const connectionName = connection ? `Storage Engine Monitor - ${connectionId.substring(0, 8)}` : 'Storage Engine Monitor';

        // If panel already exists for this connection, reveal it
        const existingPanel = this.panels.get(connectionId);
        if (existingPanel) {
            existingPanel.reveal(vscode.ViewColumn.One);
            existingPanel.webview.postMessage({
                command: 'setConnection',
                connectionId
            });
            return;
        }

        // Create new panel for this connection
        const panel = vscode.window.createWebviewPanel(
            `${StorageEngineView.viewType}-${connectionId}`,
            connectionName,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.extensionUri, 'media'),
                    vscode.Uri.joinPath(this.extensionUri, 'out')
                ]
            }
        );

        panel.webview.html = this.getHtmlContent(panel.webview);

        // Store panel
        this.panels.set(connectionId, panel);

        // Initialize per-connection state
        this.refreshIntervalSeconds.set(connectionId, 10);
        this.failureCounts.set(connectionId, 0);

        // Handle messages from the webview
        panel.webview.onDidReceiveMessage(
            message => this.handleMessage(message, connectionId),
            null,
            this.disposables
        );

        // Handle panel disposal
        panel.onDidDispose(() => {
            this.disposeConnection(connectionId);
        }, null, this.disposables);

        // Send initial connection
        panel.webview.postMessage({
            command: 'setConnection',
            connectionId
        });
    }

    /**
     * Handle messages from the webview
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async handleMessage(message: any, connectionId: string): Promise<void> {
        try {
            const panel = this.panels.get(connectionId);
            if (!panel) {
                this.logger.error(`No panel found for connection ${connectionId}`);
                return;
            }

            // Get adapter from connection manager via command
            const adapter = await vscode.commands.executeCommand<IDatabaseAdapter>(
                'mydba.internal.getAdapter',
                connectionId
            );
            if (!adapter) {
                throw new Error('Connection not found or not active');
            }

            switch (message.command) {
                case 'getInnoDBStatus':
                    await this.handleGetInnoDBStatus(connectionId, adapter);
                    break;

                case 'getAriaStatus':
                    await this.handleGetAriaStatus(connectionId, adapter);
                    break;

                case 'refresh':
                    await this.handleRefresh(connectionId, adapter);
                    break;

                case 'aiExplain':
                    await this.handleAIExplain(connectionId, adapter, message.engine);
                    break;

                case 'compareSnapshots':
                    await this.handleCompareSnapshots(connectionId, message.before, message.after);
                    break;

                case 'export':
                    await this.handleExport(connectionId, message.data, message.format);
                    break;

                case 'setAutoRefresh':
                    this.handleSetAutoRefresh(connectionId, message.enabled, message.interval);
                    break;

                case 'ready':
                    // Webview is ready, trigger initial data load
                    this.logger.debug('Storage Engine webview is ready, loading initial data');
                    await this.handleRefresh(connectionId, adapter);
                    break;
            }
        } catch (error) {
            this.logger.error('Error handling webview message:', error as Error);
            this.postMessage(connectionId, {
                command: 'error',
                error: (error as Error).message
            });
        }
    }

    /**
     * Get InnoDB status
     */
    private async handleGetInnoDBStatus(connectionId: string, adapter: IDatabaseAdapter): Promise<void> {
        try {
            const status = await this.innoDBService.getInnoDBStatus(connectionId, adapter);
            const alerts = this.innoDBService.getHealthAlerts(status);

            // Get AI analysis (async, don't block)
            this.aiCoordinator.analyzeInnoDBStatus(status, adapter.type === 'mariadb' ? 'mariadb' : 'mysql')
                .then(aiAnalysis => {
                    this.postMessage(connectionId, {
                        command: 'aiAnalysis',
                        type: 'innodb',
                        analysis: aiAnalysis
                    });
                })
                .catch(error => {
                    this.logger.warn('AI analysis failed:', error);
                });

            this.postMessage(connectionId, {
                command: 'innoDBStatus',
                status,
                alerts
            });

            this.failureCounts.set(connectionId, 0); // Reset on success
        } catch (error) {
            const currentFailures = (this.failureCounts.get(connectionId) || 0) + 1;
            this.failureCounts.set(connectionId, currentFailures);
            this.logger.error('Failed to get InnoDB status:', error as Error);

            // Disable auto-refresh after multiple failures
            const autoRefreshEnabled = this.autoRefreshEnabled.get(connectionId);
            if (currentFailures >= this.MAX_FAILURES && autoRefreshEnabled) {
                this.logger.warn(`Auto-refresh disabled after ${this.MAX_FAILURES} failures`);
                this.stopAutoRefresh(connectionId);
                this.postMessage(connectionId, {
                    command: 'autoRefreshDisabled',
                    reason: 'Multiple fetch failures'
                });
            }

            throw error;
        }
    }

    /**
     * Get Aria status (MariaDB only)
     */
    private async handleGetAriaStatus(connectionId: string, adapter: IDatabaseAdapter): Promise<void> {
        try {
            if (adapter.type !== 'mariadb') {
                throw new Error('Aria storage engine is only available in MariaDB');
            }

            const status = await this.ariaService.getAriaStatus(connectionId, adapter);
            const alerts = this.ariaService.getHealthAlerts(status);

            // Get AI analysis
            this.aiCoordinator.analyzeAriaStatus(status)
                .then(aiAnalysis => {
                    this.postMessage(connectionId, {
                        command: 'aiAnalysis',
                        type: 'aria',
                        analysis: aiAnalysis
                    });
                })
                .catch(error => {
                    this.logger.warn('Aria AI analysis failed:', error);
                });

            this.postMessage(connectionId, {
                command: 'ariaStatus',
                status,
                alerts
            });

            this.failureCounts.set(connectionId, 0);
        } catch (error) {
            const currentFailures = (this.failureCounts.get(connectionId) || 0) + 1;
            this.failureCounts.set(connectionId, currentFailures);
            this.logger.error('Failed to get Aria status:', error as Error);
            throw error;
        }
    }

    /**
     * Refresh current view
     */
    private async handleRefresh(connectionId: string, adapter: IDatabaseAdapter): Promise<void> {
        // Clear cache and refetch
        this.innoDBService.clearCache(connectionId);
        this.ariaService.clearCache(connectionId);

        await this.handleGetInnoDBStatus(connectionId, adapter);

        if (adapter.type === 'mariadb') {
            await this.handleGetAriaStatus(connectionId, adapter);
        }
    }

    /**
     * Handle AI Explain request
     */
    private async handleAIExplain(connectionId: string, adapter: IDatabaseAdapter, engine: 'innodb' | 'aria'): Promise<void> {
        try {
            this.logger.info(`Requesting AI explanation for ${engine} status`);

            // Get the current status
            let status: InnoDBStatus | AriaStatus;
            if (engine === 'innodb') {
                status = await this.innoDBService.getInnoDBStatus(connectionId, adapter);
            } else {
                status = await this.ariaService.getAriaStatus(connectionId, adapter);
            }

            // Show progress
            this.postMessage(connectionId, {
                command: 'aiExplainProgress',
                message: 'Analyzing status with AI...'
            });

            // Get AI analysis
            const dbType = adapter.type === 'mariadb' ? 'mariadb' : 'mysql';
            const analysis = engine === 'innodb'
                ? await this.aiCoordinator.analyzeInnoDBStatus(status as InnoDBStatus, dbType)
                : await this.aiCoordinator.analyzeAriaStatus(status as AriaStatus);

            // Send analysis to frontend
            this.postMessage(connectionId, {
                command: 'aiExplainResult',
                analysis,
                engine
            });

            this.logger.info('AI explanation completed successfully');
        } catch (error) {
            this.logger.error('Failed to get AI explanation:', error as Error);
            this.postMessage(connectionId, {
                command: 'aiExplainError',
                error: (error as Error).message
            });
        }
    }

    /**
     * Compare two status snapshots
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async handleCompareSnapshots(connectionId: string, before: any, after: any): Promise<void> {
        const comparison = this.innoDBService.compareSnapshots(before as InnoDBStatus, after as InnoDBStatus);

        this.postMessage(connectionId, {
            command: 'snapshotComparison',
            comparison
        });
    }

    /**
     * Export data
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async handleExport(connectionId: string, data: any, format: 'json' | 'csv' | 'html'): Promise<void> {
        try {
            let content: string;
            let fileExtension: string;

            switch (format) {
                case 'json':
                    content = JSON.stringify(data, null, 2);
                    fileExtension = 'json';
                    break;

                case 'csv':
                    content = this.convertToCSV(data);
                    fileExtension = 'csv';
                    break;

                case 'html':
                    content = this.generateHTMLReport(data);
                    fileExtension = 'html';
                    break;

                default:
                    throw new Error(`Unsupported export format: ${format}`);
            }

            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(`innodb-status-${Date.now()}.${fileExtension}`),
                filters: {
                    [format.toUpperCase()]: [fileExtension]
                }
            });

            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
                vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`);
            }
        } catch (error) {
            this.logger.error('Failed to export data:', error as Error);
            throw error;
        }
    }

    /**
     * Set auto-refresh settings
     */
    private handleSetAutoRefresh(connectionId: string, enabled: boolean, interval?: number): void {
        this.autoRefreshEnabled.set(connectionId, enabled);

        if (interval && interval >= 5) {
            this.refreshIntervalSeconds.set(connectionId, interval);
        }

        const panel = this.panels.get(connectionId);
        if (enabled && panel?.visible) {
            this.startAutoRefresh(connectionId);
        } else {
            this.stopAutoRefresh(connectionId);
        }
    }

    /**
     * Start auto-refresh
     */
    private startAutoRefresh(connectionId: string): void {
        const existingInterval = this.autoRefreshIntervals.get(connectionId);
        if (existingInterval) {
            return; // Already running
        }

        const intervalSeconds = this.refreshIntervalSeconds.get(connectionId) || 10;
        const interval = setInterval(() => {
            this.postMessage(connectionId, { command: 'autoRefresh' });
        }, intervalSeconds * 1000);

        this.autoRefreshIntervals.set(connectionId, interval);
        this.logger.debug(`Auto-refresh started for ${connectionId} (interval: ${intervalSeconds}s)`);
    }

    /**
     * Stop auto-refresh
     */
    private stopAutoRefresh(connectionId: string): void {
        const interval = this.autoRefreshIntervals.get(connectionId);
        if (interval) {
            clearInterval(interval);
            this.autoRefreshIntervals.delete(connectionId);
            this.logger.debug(`Auto-refresh stopped for ${connectionId}`);
        }
    }

    /**
     * Convert data to CSV
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private convertToCSV(data: any): string {
        // Simplified CSV conversion
        if (Array.isArray(data)) {
            if (data.length === 0) {
                return '';
            }

            const headers = Object.keys(data[0]);
            const rows = data.map(item =>
                headers.map(header => JSON.stringify(item[header] || '')).join(',')
            );

            return [headers.join(','), ...rows].join('\n');
        }

        // Convert single object to CSV
        const entries = Object.entries(data);
        return entries.map(([key, value]) => `${key},${JSON.stringify(value)}`).join('\n');
    }

    /**
     * Generate HTML report
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private generateHTMLReport(data: any): string {
        return `<!DOCTYPE html>
<html>
<head>
    <title>InnoDB Status Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #333; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #4CAF50; color: white; }
        .critical { color: #d32f2f; font-weight: bold; }
        .warning { color: #f57c00; font-weight: bold; }
        .healthy { color: #388e3c; font-weight: bold; }
    </style>
</head>
<body>
    <h1>InnoDB Status Report</h1>
    <p>Generated: ${new Date().toLocaleString()}</p>
    <pre>${JSON.stringify(data, null, 2)}</pre>
</body>
</html>`;
    }

    /**
     * Post message to webview
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private postMessage(connectionId: string, message: any): void {
        const panel = this.panels.get(connectionId);
        panel?.webview.postMessage(message);
    }

    /**
     * Get HTML content for webview
     */
    private getHtmlContent(webview: vscode.Webview): string {
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'media', 'storageEngineView.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'media', 'storageEngineView.css')
        );

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource};">
    <link href="${styleUri}" rel="stylesheet">
    <title>Storage Engine Status</title>
</head>
<body>
    <div id="app">
        <div class="header">
            <h1>Storage Engine Monitor</h1>
            <div class="controls">
                <button id="refreshBtn" class="btn">🔄 Refresh</button>
                <button id="aiExplainBtn" class="btn">🤖 AI Explain</button>
                <button id="exportBtn" class="btn">💾 Export</button>
                <button id="compareBtn" class="btn">📊 Compare</button>
                <label>
                    <input type="checkbox" id="autoRefreshToggle">
                    Auto-refresh
                </label>
                <select id="refreshInterval">
                    <option value="10">10s</option>
                    <option value="30">30s</option>
                    <option value="60">60s</option>
                </select>
            </div>
        </div>

        <div class="tabs">
            <button class="tab-btn active" data-tab="innodb">InnoDB</button>
            <button class="tab-btn" data-tab="aria" id="ariaTab" style="display: none;">Aria</button>
            <button class="tab-btn" data-tab="comparison">Comparison</button>
        </div>

        <div id="innodb-tab" class="tab-content active">
            <div id="innodb-status" class="status-grid">
                <div class="loading">Loading InnoDB status...</div>
            </div>
        </div>

        <div id="aria-tab" class="tab-content">
            <div id="aria-status" class="status-grid">
                <div class="loading">Loading Aria status...</div>
            </div>
        </div>

        <div id="comparison-tab" class="tab-content">
            <div id="comparison-view" style="padding: 24px;">
                <h3 style="margin-top: 0;">📊 Compare Storage Engine Status</h3>
                <p style="margin-bottom: 16px; line-height: 1.6;">
                    Track how InnoDB or Aria storage engine metrics change over time by taking snapshots.
                </p>
                <ol style="margin-bottom: 20px; line-height: 1.8;">
                    <li><strong>First</strong>: Visit the <strong>InnoDB</strong> or <strong>Aria</strong> tab to load the current status</li>
                    <li><strong>Then</strong>: Return here and click <strong>"Take Snapshot"</strong> below</li>
                    <li>Wait for metrics to change (or refresh the status from the InnoDB/Aria tab)</li>
                    <li>Come back and take another snapshot</li>
                    <li>Click the <strong>"Compare"</strong> button in the header to see the differences</li>
                </ol>
                <div style="background: var(--vscode-textBlockQuote-background); padding: 12px; border-left: 3px solid var(--vscode-focusBorder); margin-bottom: 20px; border-radius: 4px;">
                    <strong>💡 Tip:</strong> The snapshot button captures whichever engine data you last viewed (InnoDB or Aria).
                </div>
                <button id="takeSnapshotBtn" class="btn" style="font-size: 14px; padding: 8px 16px;">
                    📸 Take Snapshot
                </button>
                <p id="snapshotCount" style="margin-top: 16px; opacity: 0.8; font-size: 13px;">
                    Snapshots taken: <strong>0</strong>
                </p>
            </div>
        </div>
    </div>
    <script src="${scriptUri}"></script>
</body>
</html>`;
    }

    /**
     * Dispose resources for a specific connection
     */
    private disposeConnection(connectionId: string): void {
        this.stopAutoRefresh(connectionId);
        this.panels.delete(connectionId);
        this.autoRefreshEnabled.delete(connectionId);
        this.refreshIntervalSeconds.delete(connectionId);
        this.failureCounts.delete(connectionId);
        this.logger.debug(`Disposed storage engine monitor for connection: ${connectionId}`);
    }

    /**
     * Dispose all resources
     */
    public dispose(): void {
        // Stop all auto-refresh intervals
        for (const connectionId of this.panels.keys()) {
            this.stopAutoRefresh(connectionId);
        }

        // Clear all panels
        this.panels.clear();
        this.autoRefreshEnabled.clear();
        this.refreshIntervalSeconds.clear();
        this.failureCounts.clear();

        // Dispose all event listeners
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            disposable?.dispose();
        }
    }
}
