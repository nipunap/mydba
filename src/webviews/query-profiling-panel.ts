import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { ConnectionManager } from '../services/connection-manager';
import { QueryProfilingService } from '../services/query-profiling-service';

export class QueryProfilingPanel {
    private static panelRegistry: Map<string, QueryProfilingPanel> = new Map();
    private readonly panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];
    private service: QueryProfilingService;

    private constructor(
        panel: vscode.WebviewPanel,
        private context: vscode.ExtensionContext,
        private logger: Logger,
        private connectionManager: ConnectionManager,
        private connectionId: string,
        private query: string
    ) {
        this.panel = panel;
        this.service = new QueryProfilingService(logger);
        this.panel.webview.html = this.getHtml();
        this.setupMessageHandling();
        this.profile();
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    public static show(
        context: vscode.ExtensionContext,
        logger: Logger,
        connectionManager: ConnectionManager,
        connectionId: string,
        query: string
    ): void {
        const key = `profile-${connectionId}-${query.substring(0, 64)}`;
        const existing = QueryProfilingPanel.panelRegistry.get(key);
        if (existing) {
            existing.panel.reveal(vscode.ViewColumn.Active);
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'mydbaQueryProfiling',
            `Profile: ${query.substring(0, 50)}...`,
            vscode.ViewColumn.Active,
            { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [
                vscode.Uri.joinPath(context.extensionUri, 'media'),
                vscode.Uri.joinPath(context.extensionUri, 'node_modules', '@vscode/webview-ui-toolkit')
            ] }
        );
        const p = new QueryProfilingPanel(panel, context, logger, connectionManager, connectionId, query);
        QueryProfilingPanel.panelRegistry.set(key, p);
    }

    private setupMessageHandling(): void {
        this.panel.webview.onDidReceiveMessage(async (message: any) => {
            if (message.type === 'reprofile') {
                this.query = message.query || this.query;
                await this.profile();
            }
        }, null, this.disposables);
    }

    private async profile(): Promise<void> {
        try {
            const adapter = this.connectionManager.getAdapter(this.connectionId);
            if (!adapter) throw new Error('Connection not found');
            const result = await this.service.profileQuery(adapter as any, this.query);
            this.panel.webview.postMessage({ type: 'profileLoaded', profile: result, query: this.query });
        } catch (error) {
            this.logger.error('Profiling failed:', error as Error);
            this.panel.webview.postMessage({ type: 'error', message: (error as Error).message });
        }
    }

    private getHtml(): string {
        const toolkitUri = this.panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', '@vscode/webview-ui-toolkit', 'dist', 'toolkit.js')
        );
        const scriptUri = this.panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'queryProfilingView.js')
        );
        const styleUri = this.panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'queryProfilingView.css')
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
  <title>Query Profiling</title>
</head>
<body>
  <div class="container">
    <div class="toolbar">
      <div class="toolbar-left"><h2>Query Profiling</h2></div>
      <div class="toolbar-actions">
        <vscode-button id="reprofile-btn" appearance="secondary"><span class="codicon codicon-refresh"></span> Re-profile</vscode-button>
      </div>
    </div>
    <div id="loading" class="loading"><vscode-progress-ring></vscode-progress-ring><span>Profiling query...</span></div>
    <div id="error" class="error" style="display:none;"><span class="codicon codicon-error"></span><div><h3>Error</h3><p id="error-message"></p></div></div>
    <div id="content" style="display:none;">
      <div class="summary">
        <div><strong>Total Duration:</strong> <span id="total-duration">-</span></div>
        <div><strong>Rows Examined:</strong> <span id="rows-examined">-</span></div>
        <div><strong>Rows Sent:</strong> <span id="rows-sent">-</span></div>
        <div><strong>Efficiency:</strong> <span id="efficiency">-</span></div>
      </div>
      <div class="stages">
        <h3>Stages</h3>
        <table class="stages-table">
          <thead><tr><th>Stage</th><th>Duration (µs)</th></tr></thead>
          <tbody id="stages-body"></tbody>
        </table>
      </div>
      <div class="query-block"><h4>Query</h4><pre id="query-text"></pre></div>
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
        this.panel.dispose();
        const key = Array.from(QueryProfilingPanel.panelRegistry.entries()).find(([, p]) => p === this)?.[0];
        if (key) QueryProfilingPanel.panelRegistry.delete(key);
        while (this.disposables.length) {
            const d = this.disposables.pop();
            if (d) d.dispose();
        }
    }
}
