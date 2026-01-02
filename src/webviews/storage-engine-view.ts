/**
 * Storage Engine Status View
 * Webview for monitoring InnoDB and Aria storage engine status
 */

import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { InnoDBStatusService } from '../services/innodb-status-service';
import { AriaStatusService } from '../services/aria-status-service';
import { AIServiceCoordinator } from '../services/ai-service-coordinator';
import { IDatabaseAdapter } from '../adapters/database-adapter';
import { InnoDBStatus } from '../types/storage-engine-types';

export class StorageEngineView implements vscode.WebviewViewProvider {
    public static readonly viewType = 'mydba.storageEngineView';

    private view?: vscode.WebviewView;
    private disposables: vscode.Disposable[] = [];
    private autoRefreshInterval?: NodeJS.Timeout;
    private autoRefreshEnabled = false;
    private refreshIntervalSeconds = 10;
    private failureCount = 0;
    private readonly MAX_FAILURES = 3;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly logger: Logger,
        private readonly innoDBService: InnoDBStatusService,
        private readonly ariaService: AriaStatusService,
        private readonly aiCoordinator: AIServiceCoordinator
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void | Thenable<void> {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.extensionUri, 'media'),
                vscode.Uri.joinPath(this.extensionUri, 'out')
            ]
        };

        webviewView.webview.html = this.getHtmlContent(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(
            message => this.handleMessage(message),
            null,
            this.disposables
        );

        // Handle visibility changes
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible && this.autoRefreshEnabled) {
                this.startAutoRefresh();
            } else {
                this.stopAutoRefresh();
            }
        }, null, this.disposables);

        // Clean up on dispose
        webviewView.onDidDispose(() => {
            this.dispose();
        }, null, this.disposables);
    }

    /**
     * Handle messages from the webview
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async handleMessage(message: any): Promise<void> {
        try {
            switch (message.command) {
                case 'getInnoDBStatus':
                    await this.handleGetInnoDBStatus(message.connectionId, message.adapter);
                    break;

                case 'getAriaStatus':
                    await this.handleGetAriaStatus(message.connectionId, message.adapter);
                    break;

                case 'refresh':
                    await this.handleRefresh(message.connectionId, message.adapter);
                    break;

                case 'compareSnapshots':
                    await this.handleCompareSnapshots(message.before, message.after);
                    break;

                case 'export':
                    await this.handleExport(message.data, message.format);
                    break;

                case 'setAutoRefresh':
                    this.handleSetAutoRefresh(message.enabled, message.interval);
                    break;

                case 'ready':
                    // Webview is ready, can send initial data if needed
                    this.logger.debug('Storage Engine webview is ready');
                    break;
            }
        } catch (error) {
            this.logger.error('Error handling webview message:', error as Error);
            this.postMessage({
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
                    this.postMessage({
                        command: 'aiAnalysis',
                        type: 'innodb',
                        analysis: aiAnalysis
                    });
                })
                .catch(error => {
                    this.logger.warn('AI analysis failed:', error);
                });

            this.postMessage({
                command: 'innoDBStatus',
                status,
                alerts
            });

            this.failureCount = 0; // Reset on success
        } catch (error) {
            this.failureCount++;
            this.logger.error('Failed to get InnoDB status:', error as Error);

            // Disable auto-refresh after multiple failures
            if (this.failureCount >= this.MAX_FAILURES && this.autoRefreshEnabled) {
                this.logger.warn(`Auto-refresh disabled after ${this.MAX_FAILURES} failures`);
                this.stopAutoRefresh();
                this.postMessage({
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
                    this.postMessage({
                        command: 'aiAnalysis',
                        type: 'aria',
                        analysis: aiAnalysis
                    });
                })
                .catch(error => {
                    this.logger.warn('Aria AI analysis failed:', error);
                });

            this.postMessage({
                command: 'ariaStatus',
                status,
                alerts
            });

            this.failureCount = 0;
        } catch (error) {
            this.failureCount++;
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
     * Compare two status snapshots
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async handleCompareSnapshots(before: any, after: any): Promise<void> {
        const comparison = this.innoDBService.compareSnapshots(before as InnoDBStatus, after as InnoDBStatus);

        this.postMessage({
            command: 'snapshotComparison',
            comparison
        });
    }

    /**
     * Export data
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async handleExport(data: any, format: 'json' | 'csv' | 'html'): Promise<void> {
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
    private handleSetAutoRefresh(enabled: boolean, interval?: number): void {
        this.autoRefreshEnabled = enabled;

        if (interval && interval >= 5) {
            this.refreshIntervalSeconds = interval;
        }

        if (enabled && this.view?.visible) {
            this.startAutoRefresh();
        } else {
            this.stopAutoRefresh();
        }
    }

    /**
     * Start auto-refresh
     */
    private startAutoRefresh(): void {
        if (this.autoRefreshInterval) {
            return; // Already running
        }

        this.autoRefreshInterval = setInterval(() => {
            this.postMessage({ command: 'autoRefresh' });
        }, this.refreshIntervalSeconds * 1000);

        this.logger.debug(`Auto-refresh started (interval: ${this.refreshIntervalSeconds}s)`);
    }

    /**
     * Stop auto-refresh
     */
    private stopAutoRefresh(): void {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = undefined;
            this.logger.debug('Auto-refresh stopped');
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
    private postMessage(message: any): void {
        this.view?.webview.postMessage(message);
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
            <div id="comparison-view">
                <p>Take snapshots to compare status over time</p>
                <button id="takeSnapshotBtn" class="btn">📸 Take Snapshot</button>
            </div>
        </div>
    </div>
    <script src="${scriptUri}"></script>
</body>
</html>`;
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        this.stopAutoRefresh();

        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            disposable?.dispose();
        }
    }
}
