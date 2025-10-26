import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { ConnectionManager } from '../services/connection-manager';
import { SlowQueriesService, SlowQueryDigestInfo } from '../services/slow-queries-service';

export class SlowQueriesPanel {
    private static panelRegistry: Map<string, SlowQueriesPanel> = new Map();
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
        private service: SlowQueriesService
    ) {
        this.panel = panel;
        this.panel.webview.html = this.getHtml();
        this.setupMessageHandling();
        this.loadSlowQueries();
        this.startAutoRefresh();
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    public static show(
        context: vscode.ExtensionContext,
        logger: Logger,
        connectionManager: ConnectionManager,
        connectionId: string
    ): void {
        const panelKey = `slowQueries-${connectionId}`;
        const connection = connectionManager.getConnection(connectionId);
        if (!connection) {
            vscode.window.showErrorMessage('Connection not found');
            return;
        }

        const existing = SlowQueriesPanel.panelRegistry.get(panelKey);
        if (existing) {
            existing.panel.reveal(vscode.ViewColumn.Active);
            existing.loadSlowQueries();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'mydbaSlowQueries',
            `Slow Queries - ${connection.name}`,
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

        const service = new SlowQueriesService(logger);
        const slowPanel = new SlowQueriesPanel(panel, context, logger, connectionManager, connectionId, service);
        SlowQueriesPanel.panelRegistry.set(panelKey, slowPanel);
    }

    private setupMessageHandling(): void {
        this.panel.webview.onDidReceiveMessage(
            async (message: any) => {
                switch (message.type) {
                    case 'refresh':
                        await this.loadSlowQueries();
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

    private async explainQuery(queryText: string): Promise<void> {
        try {
            const { ExplainViewerPanel } = await import('./explain-viewer-panel');
            ExplainViewerPanel.show(this.context, this.logger, this.connectionManager, this.connectionId, queryText, {});
        } catch (error) {
            this.logger.error('Failed to open EXPLAIN:', error as Error);
            vscode.window.showErrorMessage(`Failed to open EXPLAIN: ${(error as Error).message}`);
        }
    }

    private async profileQuery(queryText: string): Promise<void> {
        try {
            const { QueryProfilingPanel } = await import('./query-profiling-panel');
            QueryProfilingPanel.show(this.context, this.logger, this.connectionManager, this.connectionId, queryText);
        } catch (error) {
            this.logger.error('Failed to open Profiling:', error as Error);
            vscode.window.showErrorMessage(`Failed to open Profiling: ${(error as Error).message}`);
        }
    }

    private async loadSlowQueries(): Promise<void> {
        if (this.isRefreshing) return;
        this.isRefreshing = true;
        this.logger.info(`Loading slow queries for connection: ${this.connectionId}`);
        try {
            const adapter = this.connectionManager.getAdapter(this.connectionId);
            if (!adapter) throw new Error('Connection not found');

            const rows: SlowQueryDigestInfo[] = await this.service.detectSlowQueries(adapter as any);
            this.panel.webview.postMessage({ type: 'slowQueriesLoaded', rows, timestamp: new Date().toISOString() });
        } catch (error) {
            this.logger.error('Failed to load slow queries:', error as Error);
            this.panel.webview.postMessage({ type: 'error', message: (error as Error).message });
        } finally {
            this.isRefreshing = false;
        }
    }

    private startAutoRefresh(): void {
        this.autoRefreshInterval = setInterval(() => this.loadSlowQueries(), 30000);
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

    private getHtml(): string {
        const toolkitUri = this.panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', '@vscode/webview-ui-toolkit', 'dist', 'toolkit.js')
        );
        const scriptUri = this.panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'slowQueriesView.js')
        );
        const styleUri = this.panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'slowQueriesView.css')
        );
        const nonce = this.getNonce();
        const v = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${this.panel.webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}?v=${v}" rel="stylesheet">
  <title>Slow Queries</title>
</head>
<body>
  <div class="container">
    <div class="toolbar">
      <div class="toolbar-left">
        <h2>Slow Queries</h2>
        <span id="row-count" class="count-badge">0</span>
      </div>
      <div class="toolbar-actions">
        <vscode-button id="refresh-btn" appearance="secondary"><span class="codicon codicon-refresh"></span> Refresh</vscode-button>
        <vscode-button id="auto-refresh-btn" appearance="secondary"><span class="codicon codicon-play"></span> Auto-refresh (30s)</vscode-button>
      </div>
    </div>

    <div id="loading" class="loading"><vscode-progress-ring></vscode-progress-ring><span>Loading slow queries...</span></div>
    <div id="error" class="error" style="display:none;"><span class="codicon codicon-error"></span><div><h3>Error</h3><p id="error-message"></p></div></div>
    <div id="content" style="display:none;">
      <div class="info-panel"><p><strong>Note:</strong> Based on Performance Schema digests (average time per digest). Use EXPLAIN/Profiling for deeper analysis.</p></div>
      <div id="rows-list"></div>
      <div id="empty-state" class="empty-state" style="display:none;"><span class="codicon codicon-check-all"></span><h3>No Slow Queries Found</h3><p>Great performance!</p></div>
      <div class="footer"><span id="last-updated"></span></div>
    </div>
  </div>
  <script type="module" nonce="${nonce}" src="${toolkitUri}"></script>
  <script nonce="${nonce}" src="${scriptUri}?v=${v}"></script>
</body>
</html>`;
    }

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
        return text;
    }

    dispose(): void {
        if (this.autoRefreshInterval) clearInterval(this.autoRefreshInterval);
        this.panel.dispose();
        const key = Array.from(SlowQueriesPanel.panelRegistry.entries()).find(([, p]) => p === this)?.[0];
        if (key) SlowQueriesPanel.panelRegistry.delete(key);
        while (this.disposables.length) {
            const d = this.disposables.pop();
            if (d) d.dispose();
        }
    }
}
