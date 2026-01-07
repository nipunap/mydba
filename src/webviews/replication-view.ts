/**
 * Replication View
 * Webview panel for monitoring and controlling MySQL/MariaDB replication
 */

import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { ReplicationService } from '../services/replication-service';
import { AIServiceCoordinator } from '../services/ai-service-coordinator';
import { IDatabaseAdapter } from '../adapters/database-adapter';
import { ReplicationAlert, ConnectedReplica } from '../types/replication-types';

export class ReplicationView {
    public static readonly viewType = 'mydba.replicationView';

    // Track panels per connection - allows multiple connections to have their own monitors
    private panels = new Map<string, vscode.WebviewPanel>();
    private disposables: vscode.Disposable[] = [];
    private autoRefreshIntervals = new Map<string, NodeJS.Timeout>();

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly logger: Logger,
        private readonly replicationService: ReplicationService,
        private readonly aiCoordinator: AIServiceCoordinator
    ) {}

    /**
     * Show the view for a specific connection
     */
    public async show(connectionId: string): Promise<void> {
        // Get connection name for panel title
        const connectionName = `Replication Monitor - ${connectionId.substring(0, 8)}`;

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
            `${ReplicationView.viewType}-${connectionId}`,
            connectionName,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')]
            }
        );

        panel.webview.html = this.getHtmlContent(panel.webview);

        // Store panel
        this.panels.set(connectionId, panel);

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
                case 'ready':
                    // Webview is ready, trigger initial data load
                    this.logger.debug('Replication webview is ready, loading initial data');
                    await this.handleGetStatus(connectionId, adapter);
                    break;

                case 'getStatus':
                    await this.handleGetStatus(connectionId, adapter);
                    break;

                case 'startIOThread':
                    await this.handleStartIOThread(connectionId, adapter);
                    break;

                case 'stopIOThread':
                    await this.handleStopIOThread(connectionId, adapter);
                    break;

                case 'startSQLThread':
                    await this.handleStartSQLThread(connectionId, adapter);
                    break;

                case 'stopSQLThread':
                    await this.handleStopSQLThread(connectionId, adapter);
                    break;

                case 'getWorkers':
                    await this.handleGetWorkers(connectionId, adapter);
                    break;
            }
        } catch (error) {
            this.logger.error('Error handling replication message:', error as Error);
            const panel = this.panels.get(connectionId);
            panel?.webview.postMessage({
                command: 'error',
                error: (error as Error).message
            });
        }
    }

    private async handleGetStatus(connectionId: string, adapter: IDatabaseAdapter): Promise<void> {
        try {
            // Get server replication role
            const role = await this.replicationService.getReplicationRole(connectionId, adapter);

            // Get data based on role
            let replicaStatus = null;
            let masterStatus = null;
            let connectedReplicas: ConnectedReplica[] = [];
            let alerts: ReplicationAlert[] = [];

            if (role === 'replica' || role === 'both') {
                // This server is a replica - get replica status
                replicaStatus = await this.replicationService.getReplicationStatus(connectionId, adapter);

                if (replicaStatus) {
                    alerts = this.replicationService.getReplicationHealth(replicaStatus);

                    // Get AI analysis for replica status
                    this.aiCoordinator.analyzeReplicationStatus(replicaStatus, adapter.type === 'mariadb' ? 'mariadb' : 'mysql')
                        .then(aiAnalysis => {
                            this.postMessage(connectionId, { command: 'aiAnalysis', analysis: aiAnalysis });
                        })
                        .catch(error => {
                            this.logger.warn('Replication AI analysis failed:', error);
                        });
                }
            }

            if (role === 'master' || role === 'both') {
                // This server is a master - get master status and connected replicas
                try {
                    masterStatus = await this.replicationService.getMasterStatus(connectionId, adapter);
                } catch (error) {
                    this.logger.warn('Failed to get master status:', error as Error);
                }

                try {
                    connectedReplicas = await this.replicationService.getConnectedReplicas(connectionId, adapter);
                } catch (error) {
                    this.logger.warn('Failed to get connected replicas:', error as Error);
                }
            }

            this.postMessage(connectionId, {
                command: 'replicationStatus',
                role,
                replicaStatus,
                masterStatus,
                connectedReplicas,
                alerts
            });
        } catch (error) {
            this.logger.error('Failed to get replication status:', error as Error);
            this.postMessage(connectionId, {
                command: 'error',
                error: (error as Error).message
            });
        }
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
            this.postMessage(connectionId, { command: 'controlResult', result });
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
            this.postMessage(connectionId, { command: 'controlResult', result });
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
            this.postMessage(connectionId, { command: 'controlResult', result });
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
            this.postMessage(connectionId, { command: 'controlResult', result });
        }
    }

    private async handleGetWorkers(connectionId: string, adapter: IDatabaseAdapter): Promise<void> {
        try {
            const workers = await this.replicationService.getReplicationWorkers(connectionId, adapter);
            this.postMessage(connectionId, { command: 'workers', workers });
        } catch (error) {
            this.logger.error('Failed to get replication workers:', error as Error);
            this.postMessage(connectionId, {
                command: 'error',
                error: (error as Error).message
            });
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private postMessage(connectionId: string, message: any): void {
        const panel = this.panels.get(connectionId);
        panel?.webview.postMessage(message);
    }

    private getHtmlContent(webview: vscode.Webview): string {
        // Get URIs for local resources with cache busting
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'media', 'replicationTopology.js')
        );
        const cacheBust = `v2.6.${Date.now()}`; // Version 2.6 - Ultra compact cards

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${webview.cspSource} https://d3js.org 'unsafe-inline'; style-src ${webview.cspSource} 'unsafe-inline';">
    <title>Replication Monitor</title>
    <script src="https://d3js.org/d3.v7.min.js"></script>
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

        /* Topology Container */
        #topology-container {
            position: relative;
        }
        #topology {
            border: 2px solid var(--vscode-panel-border);
            border-radius: 4px;
            margin: 16px 0;
            min-height: 500px;
            background: var(--vscode-editor-background);
            overflow: hidden;
            position: relative;
        }
        #topology-legend {
            display: flex;
            gap: 12px;
            align-items: center;
            font-size: 11px;
            color: var(--vscode-editor-foreground);
            margin: 4px 0 0 0;
            flex-wrap: wrap;
        }
        #topology-legend .badge {
            width: 12px;
            height: 12px;
            border-radius: 3px;
            display: inline-block;
            margin-right: 6px;
        }

        /* Worker Modal */
        .worker-modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.7);
            justify-content: center;
            align-items: center;
            z-index: 1000;
        }

        .worker-modal-content {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            width: 90%;
            max-width: 700px;
            max-height: 80vh;
            overflow-y: auto;
            padding: 24px;
            position: relative;
        }

        .worker-modal-close {
            position: absolute;
            top: 16px;
            right: 16px;
            background: none;
            border: none;
            color: var(--vscode-editor-foreground);
            font-size: 24px;
            cursor: pointer;
            padding: 4px 8px;
        }

        .worker-modal-close:hover {
            background-color: var(--vscode-list-hoverBackground);
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <h2>Replication Monitor</h2>

    <!-- Topology Visualization -->
    <div id="topology-container">
        <h3>Replication Topology</h3>
        <div id="topology"></div>
        <div id="topology-legend">
            <span><span class="badge" style="border: 2px solid #2196f3;"></span>Master</span>
            <span><span class="badge" style="border: 2px solid #4caf50;"></span>Replica (lag < 5s)</span>
            <span><span class="badge" style="border: 2px solid #ff9800;"></span>Replica (5-10s)</span>
            <span><span class="badge" style="border: 2px solid #f44336;"></span>Replica (>10s or error)</span>
            <span>RO = read-only, RW = read-write</span>
        </div>
    </div>

    <!-- Details Section -->
    <div id="status"></div>

    <!-- Control Actions -->
    <div id="controls" style="margin-top: 16px; display: none;">
        <h3>Control Actions</h3>
        <button class="btn" onclick="startIOThread()">▶ Start I/O Thread</button>
        <button class="btn" onclick="stopIOThread()">⏸ Stop I/O Thread</button>
        <button class="btn" onclick="startSQLThread()">▶ Start SQL Thread</button>
        <button class="btn" onclick="stopSQLThread()">⏸ Stop SQL Thread</button>
    </div>

    <!-- Worker Details Modal -->
    <div id="worker-modal" class="worker-modal">
        <div class="worker-modal-content">
            <button class="worker-modal-close" onclick="closeWorkerModal()">×</button>
            <div id="worker-modal-content">
                <!-- Content will be inserted here -->
            </div>
        </div>
    </div>

    <script src="${scriptUri}?v=${cacheBust}"></script>
    <script>
        const vscode = window.__mydbaVscodeApi || acquireVsCodeApi();
        // Share the API for other scripts to reuse without re-acquiring
        // @ts-ignore
        window.__mydbaVscodeApi = vscode;

        // Initialize - send ready message to trigger initial data load
        document.addEventListener('DOMContentLoaded', () => {
            vscode.postMessage({ command: 'ready' });
        });

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
                renderStatus(message);
                renderTopology(message);
            } else if (message.command === 'controlResult') {
                alert(message.result.message);
            } else if (message.command === 'workers') {
                renderWorkerDetails(message.workers);
            } else if (message.command === 'error') {
                alert('Error: ' + message.error);
            }
        });

        function renderStatus(data) {
            const { role, replicaStatus, masterStatus, connectedReplicas, alerts } = data;

            let html = \`<h3>Server Role: \${role.toUpperCase()}</h3>\`;

            // Show Master Status if applicable
            if (masterStatus) {
                html += \`
                    <div class="status-card">
                        <h3>📤 Master/Primary Status</h3>
                        <div class="thread-status">
                            <span>Binlog File:</span>
                            <span>\${masterStatus.file}</span>
                        </div>
                        <div class="thread-status">
                            <span>Binlog Position:</span>
                            <span>\${masterStatus.position}</span>
                        </div>
                        \${masterStatus.executedGtidSet ? \`
                            <div class="thread-status">
                                <span>Executed GTID Set:</span>
                                <span style="font-size: 11px;">\${masterStatus.executedGtidSet || 'N/A'}</span>
                            </div>
                        \` : ''}
                    </div>
                \`;
            }

            // Show Connected Replicas if any
            if (connectedReplicas && connectedReplicas.length > 0) {
                html += \`
                    <div class="status-card">
                        <h3>🔗 Connected Replicas (\${connectedReplicas.length})</h3>
                        \${connectedReplicas.map(replica => \`
                            <div style="border-top: 1px solid var(--vscode-panel-border); padding-top: 8px; margin-top: 8px;">
                                <div class="thread-status">
                                    <span>Server ID:</span>
                                    <span>\${replica.serverId}</span>
                                </div>
                                \${replica.replicaUuid ? \`
                                <div class="thread-status">
                                    <span>Replica UUID:</span>
                                    <span style="font-size: 11px; font-family: monospace;">\${replica.replicaUuid}</span>
                                </div>
                                \` : ''}
                                <div class="thread-status">
                                    <span>Host:</span>
                                    <span>\${replica.host || '(not reporting)'}:\${replica.port}</span>
                                </div>
                                <div class="thread-status">
                                    <span>Binlog Position:</span>
                                    <span>\${replica.masterLogFile || 'N/A'} @ \${replica.readMasterLogPos}</span>
                                </div>
                            </div>
                        \`).join('')}
                    </div>
                \`;
            }

            // Show Replica Status if applicable
            if (replicaStatus) {
                const ioClass = replicaStatus.ioThread.running ? 'running' : 'stopped';
                const sqlClass = replicaStatus.sqlThread.running ? 'running' : 'stopped';

                html += \`
                    <div class="lag">Replication Lag: \${replicaStatus.lagSeconds !== null ? replicaStatus.lagSeconds + 's' : 'N/A'}</div>
                    <div class="status-card">
                        <h3>📥 Replica Status</h3>
                        <div class="thread-status">
                            <span>I/O Thread:</span>
                            <span class="\${ioClass}">\${replicaStatus.ioThread.running ? '✅ Running' : '❌ Stopped'}</span>
                        </div>
                        <div class="thread-status">
                            <span>SQL Thread:</span>
                            <span class="\${sqlClass}">\${replicaStatus.sqlThread.running ? '✅ Running' : '❌ Stopped'}</span>
                        </div>
                        <div class="thread-status">
                            <span>Type:</span>
                            <span>\${replicaStatus.replicaType.toUpperCase()}</span>
                        </div>
                        <div class="thread-status">
                            <span>Source:</span>
                            <span>\${replicaStatus.masterHost}:\${replicaStatus.masterPort}</span>
                        </div>
                    </div>
                \`;
            }

            // Show Alerts
            if (alerts && alerts.length > 0) {
                html += \`
                    <div class="status-card">
                        <h3>⚠️ Alerts</h3>
                        \${alerts.map(a => \`<div style="margin: 8px 0;">\${a.message}</div>\`).join('')}
                    </div>
                \`;
            }

            // Show message if standalone
            if (role === 'standalone') {
                html += \`
                    <div class="status-card">
                        <p>ℹ️ This server is not configured for replication.</p>
                        <p style="margin-top: 8px; font-size: 12px; opacity: 0.8;">
                            To set up replication, configure this server as either a master (primary) or replica (secondary).
                        </p>
                    </div>
                \`;
            }

            document.getElementById('status').innerHTML = html;

            // Update controls visibility based on role
            const controls = document.getElementById('controls');
            if (role === 'replica' || role === 'both') {
                controls.style.display = 'block';
                controls.querySelector('h3').textContent = '⚙️ Control Actions';
            } else {
                // Show info message for non-replica servers
                controls.style.display = 'block';
                let infoHtml = '<div style="padding: 12px; background: var(--vscode-editorWidget-background); border-radius: 4px; margin-top: 16px;">';
                infoHtml += '<p style="margin: 0; opacity: 0.8; font-size: 12px;">';
                infoHtml += 'ℹ️ <strong>Replication Controls:</strong> Start/Stop thread controls are only available when viewing a replica server.';
                if (connectedReplicas.length > 0) {
                    infoHtml += '<br/><br/>To control replication on a connected replica, open its Replication Monitor separately.';
                }
                infoHtml += '</p></div>';
                controls.innerHTML = infoHtml;
            }
        }
    </script>
</body>
</html>`;
    }

    /**
     * Dispose resources for a specific connection
     */
    private disposeConnection(connectionId: string): void {
        const interval = this.autoRefreshIntervals.get(connectionId);
        if (interval) {
            clearInterval(interval);
            this.autoRefreshIntervals.delete(connectionId);
        }
        this.panels.delete(connectionId);
        this.logger.debug(`Disposed replication monitor for connection: ${connectionId}`);
    }

    /**
     * Dispose all resources
     */
    public dispose(): void {
        // Clear all auto-refresh intervals
        for (const interval of this.autoRefreshIntervals.values()) {
            clearInterval(interval);
        }
        this.autoRefreshIntervals.clear();

        // Clear all panels
        this.panels.clear();

        // Dispose all event listeners
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            disposable?.dispose();
        }
    }
}
