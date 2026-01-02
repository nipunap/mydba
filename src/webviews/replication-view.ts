/**
 * Replication View
 * Webview for monitoring and controlling MySQL/MariaDB replication
 */

import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { ReplicationService } from '../services/replication-service';
import { AIServiceCoordinator } from '../services/ai-service-coordinator';
import { IDatabaseAdapter } from '../adapters/database-adapter';

export class ReplicationView implements vscode.WebviewViewProvider {
    public static readonly viewType = 'mydba.replicationView';

    private view?: vscode.WebviewView;
    private disposables: vscode.Disposable[] = [];
    private autoRefreshInterval?: NodeJS.Timeout;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly logger: Logger,
        private readonly replicationService: ReplicationService,
        private readonly aiCoordinator: AIServiceCoordinator
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView
    ): void | Thenable<void> {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')]
        };

        webviewView.webview.html = this.getHtmlContent(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(
            message => this.handleMessage(message),
            null,
            this.disposables
        );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private async handleMessage(message: any): Promise<void> {
        try {
            switch (message.command) {
                case 'getStatus':
                    await this.handleGetStatus(message.connectionId, message.adapter);
                    break;

                case 'startIOThread':
                    await this.handleStartIOThread(message.connectionId, message.adapter);
                    break;

                case 'stopIOThread':
                    await this.handleStopIOThread(message.connectionId, message.adapter);
                    break;

                case 'startSQLThread':
                    await this.handleStartSQLThread(message.connectionId, message.adapter);
                    break;

                case 'stopSQLThread':
                    await this.handleStopSQLThread(message.connectionId, message.adapter);
                    break;
            }
        } catch (error) {
            this.logger.error('Error handling replication message:', error as Error);
            this.postMessage({
                command: 'error',
                error: (error as Error).message
            });
        }
    }

    private async handleGetStatus(connectionId: string, adapter: IDatabaseAdapter): Promise<void> {
        const status = await this.replicationService.getReplicationStatus(connectionId, adapter);
        const alerts = this.replicationService.getReplicationHealth(status);

        // Get AI analysis (async)
        this.aiCoordinator.analyzeReplicationStatus(status, adapter.type === 'mariadb' ? 'mariadb' : 'mysql')
            .then(aiAnalysis => {
                this.postMessage({ command: 'aiAnalysis', analysis: aiAnalysis });
            })
            .catch(error => {
                this.logger.warn('Replication AI analysis failed:', error);
            });

        this.postMessage({ command: 'replicationStatus', status, alerts });
    }

    private async handleStartIOThread(connectionId: string, adapter: IDatabaseAdapter): Promise<void> {
        // Show confirmation first
        const confirm = await vscode.window.showWarningMessage(
            'Start replication I/O thread? This will resume receiving updates from the master.',
            { modal: true },
            'Start'
        );

        if (confirm === 'Start') {
            const result = await this.replicationService.startIOThread(connectionId, adapter);
            this.postMessage({ command: 'controlResult', result });
        }
    }

    private async handleStopIOThread(connectionId: string, adapter: IDatabaseAdapter): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            '⚠️ Stop replication I/O thread? This will pause receiving updates from the master.',
            { modal: true },
            'Stop'
        );

        if (confirm === 'Stop') {
            const result = await this.replicationService.stopIOThread(connectionId, adapter);
            this.postMessage({ command: 'controlResult', result });
        }
    }

    private async handleStartSQLThread(connectionId: string, adapter: IDatabaseAdapter): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            'Start replication SQL thread? This will resume applying queued updates.',
            { modal: true },
            'Start'
        );

        if (confirm === 'Start') {
            const result = await this.replicationService.startSQLThread(connectionId, adapter);
            this.postMessage({ command: 'controlResult', result });
        }
    }

    private async handleStopSQLThread(connectionId: string, adapter: IDatabaseAdapter): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            '⚠️ Stop replication SQL thread? This will pause applying updates.',
            { modal: true },
            'Stop'
        );

        if (confirm === 'Stop') {
            const result = await this.replicationService.stopSQLThread(connectionId, adapter);
            this.postMessage({ command: 'controlResult', result });
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private postMessage(message: any): void {
        this.view?.webview.postMessage(message);
    }

    private getHtmlContent(_webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Replication Monitor</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 16px;
            color: var(--vscode-editor-foreground);
        }
        .status-card {
            border: 1px solid var(--vscode-panel-border);
            padding: 16px;
            margin: 8px 0;
            border-radius: 4px;
        }
        .thread-status {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin: 8px 0;
        }
        .running { color: #4caf50; }
        .stopped { color: #f44336; }
        .btn {
            padding: 6px 12px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            cursor: pointer;
            margin: 4px;
        }
        .btn:hover { background: var(--vscode-button-hoverBackground); }
        .lag { font-size: 24px; font-weight: bold; margin: 16px 0; }
    </style>
</head>
<body>
    <h2>Replication Monitor</h2>
    <div id="status"></div>
    <div id="controls" style="margin-top: 16px;">
        <h3>Control Actions</h3>
        <button class="btn" onclick="startIOThread()">▶ Start I/O Thread</button>
        <button class="btn" onclick="stopIOThread()">⏸ Stop I/O Thread</button>
        <button class="btn" onclick="startSQLThread()">▶ Start SQL Thread</button>
        <button class="btn" onclick="stopSQLThread()">⏸ Stop SQL Thread</button>
    </div>
    <script>
        const vscode = acquireVsCodeApi();

        function startIOThread() {
            vscode.postMessage({ command: 'startIOThread' });
        }

        function stopIOThread() {
            vscode.postMessage({ command: 'stopIOThread' });
        }

        function startSQLThread() {
            vscode.postMessage({ command: 'startSQLThread' });
        }

        function stopSQLThread() {
            vscode.postMessage({ command: 'stopSQLThread' });
        }

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'replicationStatus') {
                renderStatus(message.status, message.alerts);
            } else if (message.command === 'controlResult') {
                alert(message.result.message);
            }
        });

        function renderStatus(status, alerts) {
            const ioClass = status.ioThread.running ? 'running' : 'stopped';
            const sqlClass = status.sqlThread.running ? 'running' : 'stopped';

            document.getElementById('status').innerHTML = \`
                <div class="lag">Lag: \${status.lagSeconds !== null ? status.lagSeconds + 's' : 'N/A'}</div>
                <div class="status-card">
                    <div class="thread-status">
                        <span>I/O Thread:</span>
                        <span class="\${ioClass}">\${status.ioThread.running ? '✅ Running' : '❌ Stopped'}</span>
                    </div>
                    <div class="thread-status">
                        <span>SQL Thread:</span>
                        <span class="\${sqlClass}">\${status.sqlThread.running ? '✅ Running' : '❌ Stopped'}</span>
                    </div>
                    <div>Type: \${status.replicaType.toUpperCase()}</div>
                    <div>Master: \${status.masterHost}:\${status.masterPort}</div>
                </div>
                \${alerts && alerts.length > 0 ? \`
                    <div class="status-card">
                        <h3>⚠️ Alerts</h3>
                        \${alerts.map(a => \`<div>\${a.message}</div>\`).join('')}
                    </div>
                \` : ''}
            \`;
        }
    </script>
</body>
</html>`;
    }

    public dispose(): void {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
        }

        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            disposable?.dispose();
        }
    }
}
