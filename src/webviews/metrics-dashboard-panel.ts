import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { ConnectionManager } from '../services/connection-manager';

interface DatabaseMetrics {
    connections: {
        current: number;
        max: number;
        running: number;
    };
    queries: {
        perSecond: number;
        slow: number;
    };
    threads: {
        running: number;
        connected: number;
        cached: number;
    };
    bufferPool?: {
        size: number;
        used: number;
        hitRate: number;
    };
    tableCache?: {
        hitRate: number;
        open: number;
        openedRate: number;
    };
    queryCache?: {
        enabled: boolean;
        hitRate: number;
        size: number;
    };
    uptime: number;
    version: string;
}

interface MetricsHistoryPoint {
    timestamp: number;
    metrics: DatabaseMetrics;
}

export class MetricsDashboardPanel {
    private static panels: Map<string, MetricsDashboardPanel> = new Map();
    private readonly panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];
    private refreshInterval?: NodeJS.Timeout;
    private isRefreshing = false;
    private metricsHistory: MetricsHistoryPoint[] = [];
    private maxHistoryPoints = 720; // 1 hour at 5-second intervals
    private alertStates: Map<string, boolean> = new Map();

    private constructor(
        panel: vscode.WebviewPanel,
        private context: vscode.ExtensionContext,
        private logger: Logger,
        private connectionManager: ConnectionManager,
        private connectionId: string
    ) {
        this.panel = panel;
        this.panel.webview.html = this.getHtml();
        this.setupMessageHandlers();
        this.loadMetrics();
        this.startAutoRefresh();
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    public static show(
        context: vscode.ExtensionContext,
        logger: Logger,
        connectionManager: ConnectionManager,
        connectionId: string
    ): void {
        const panelKey = `metrics-${connectionId}`;
        const existingPanel = MetricsDashboardPanel.panels.get(panelKey);
        const connection = connectionManager.getConnection(connectionId);

        if (!connection) {
            vscode.window.showErrorMessage('Connection not found');
            return;
        }

        if (existingPanel) {
            existingPanel.panel.reveal(vscode.ViewColumn.Active);
            existingPanel.loadMetrics();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'mydbaMetrics',
            `Metrics - ${connection.name}`,
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

        const metricsPanel = new MetricsDashboardPanel(
            panel,
            context,
            logger,
            connectionManager,
            connectionId
        );
        MetricsDashboardPanel.panels.set(panelKey, metricsPanel);
    }

    private setupMessageHandlers(): void {
        this.panel.webview.onDidReceiveMessage(
            async (message: any) => {
                switch (message.type) {
                    case 'refresh':
                        await this.loadMetrics();
                        break;
                    case 'toggleAutoRefresh':
                        if (message.enabled) {
                            this.startAutoRefresh();
                        } else {
                            this.stopAutoRefresh();
                        }
                        break;
                }
            },
            null,
            this.disposables
        );
    }

    private async loadMetrics(): Promise<void> {
        if (this.isRefreshing) {
            return;
        }

        this.isRefreshing = true;
        this.logger.info(`Loading metrics for connection: ${this.connectionId}`);

        try {
            const adapter = this.connectionManager.getAdapter(this.connectionId);
            if (!adapter) {
                throw new Error('Connection not found or not connected');
            }

            // Get global status
            const statusResult = await adapter.query<any>('SHOW GLOBAL STATUS');
            const statusMap = new Map<string, string>();
            statusResult.rows?.forEach((row: any) => {
                statusMap.set(row.Variable_name, row.Value);
            });

            // Get global variables
            const variablesResult = await adapter.query<any>('SHOW GLOBAL VARIABLES');
            const variablesMap = new Map<string, string>();
            variablesResult.rows?.forEach((row: any) => {
                variablesMap.set(row.Variable_name, row.Value);
            });

            // Calculate metrics
            const metrics = this.calculateMetrics(statusMap, variablesMap);

            // Store in history
            const now = Date.now();
            this.metricsHistory.push({
                timestamp: now,
                metrics
            });

            // Trim history to max points
            if (this.metricsHistory.length > this.maxHistoryPoints) {
                this.metricsHistory = this.metricsHistory.slice(-this.maxHistoryPoints);
            }

            // Check for alerts
            await this.checkAlerts(metrics);

            // Send current metrics and history to webview
            this.panel.webview.postMessage({
                type: 'metricsLoaded',
                metrics,
                history: this.metricsHistory,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            this.logger.error('Failed to load metrics:', error as Error);
            this.panel.webview.postMessage({
                type: 'metricsError',
                error: (error as Error).message
            });
        } finally {
            this.isRefreshing = false;
        }
    }

    private calculateMetrics(status: Map<string, string>, variables: Map<string, string>): DatabaseMetrics {
        const getNumber = (map: Map<string, string>, key: string): number => {
            return parseInt(map.get(key) || '0', 10);
        };

        const uptime = getNumber(status, 'Uptime');
        const questions = getNumber(status, 'Questions');
        const slowQueries = getNumber(status, 'Slow_queries');

        // Connections
        const connections = {
            current: getNumber(status, 'Threads_connected'),
            max: getNumber(variables, 'max_connections'),
            running: getNumber(status, 'Threads_running')
        };

        // Queries
        const queries = {
            perSecond: uptime > 0 ? Math.round((questions / uptime) * 100) / 100 : 0,
            slow: slowQueries
        };

        // Threads
        const threads = {
            running: getNumber(status, 'Threads_running'),
            connected: getNumber(status, 'Threads_connected'),
            cached: getNumber(status, 'Threads_cached')
        };

        // Buffer Pool (InnoDB)
        const bufferPoolSize = getNumber(variables, 'innodb_buffer_pool_size');
        const bufferPoolReads = getNumber(status, 'Innodb_buffer_pool_reads');
        const bufferPoolReadRequests = getNumber(status, 'Innodb_buffer_pool_read_requests');
        const bufferPoolHitRate = bufferPoolReadRequests > 0
            ? Math.round((1 - (bufferPoolReads / bufferPoolReadRequests)) * 10000) / 100
            : 0;

        const bufferPool = {
            size: bufferPoolSize,
            used: getNumber(status, 'Innodb_buffer_pool_pages_data') * getNumber(variables, 'innodb_page_size'),
            hitRate: bufferPoolHitRate
        };

        // Table Cache
        const tableOpenCache = getNumber(variables, 'table_open_cache');
        const openTables = getNumber(status, 'Open_tables');
        const openedTables = getNumber(status, 'Opened_tables');
        const tableCacheHitRate = openedTables > 0
            ? Math.round((openTables / openedTables) * 10000) / 100
            : 100;

        const tableCache = {
            hitRate: tableCacheHitRate,
            open: openTables,
            openedRate: uptime > 0 ? Math.round((openedTables / uptime) * 100) / 100 : 0
        };

        // Query Cache (if enabled)
        const queryCacheSize = getNumber(variables, 'query_cache_size');
        const queryCacheEnabled = queryCacheSize > 0;
        const queryCacheHits = getNumber(status, 'Qcache_hits');
        const comSelect = getNumber(status, 'Com_select');
        const queryCacheHitRate = (queryCacheHits + comSelect) > 0
            ? Math.round((queryCacheHits / (queryCacheHits + comSelect)) * 10000) / 100
            : 0;

        const queryCache = {
            enabled: queryCacheEnabled,
            hitRate: queryCacheHitRate,
            size: queryCacheSize
        };

        return {
            connections,
            queries,
            threads,
            bufferPool,
            tableCache,
            queryCache: queryCacheEnabled ? queryCache : undefined,
            uptime,
            version: variables.get('version') || 'Unknown'
        };
    }

    private startAutoRefresh(): void {
        this.stopAutoRefresh();
        this.refreshInterval = setInterval(async () => {
            await this.loadMetrics();
        }, 5000); // Refresh every 5 seconds
    }

    private stopAutoRefresh(): void {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = undefined;
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
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'metricsDashboardView.js')
        );

        const styleUri = this.panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'metricsDashboardView.css')
        );

        const nonce = this.getNonce();
        // Use timestamp + random for stronger cache-busting
        const cacheBuster = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource} 'unsafe-inline' https://cdn.jsdelivr.net; script-src 'nonce-${nonce}' ${this.panel.webview.cspSource} https://cdn.jsdelivr.net; font-src ${this.panel.webview.cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUri}?v=${cacheBuster}" rel="stylesheet">
    <title>Database Metrics</title>
</head>
<body>
    <div class="container">
        <div class="toolbar">
            <div class="toolbar-left">
                <h2>Database Metrics Dashboard</h2>
                <span id="last-updated" class="last-updated"></span>
            </div>
            <div class="toolbar-actions">
                <vscode-dropdown id="time-range-selector">
                    <vscode-option value="300000">5 min</vscode-option>
                    <vscode-option value="900000">15 min</vscode-option>
                    <vscode-option value="1800000">30 min</vscode-option>
                    <vscode-option value="3600000" selected>1 hour</vscode-option>
                </vscode-dropdown>
                <vscode-button id="refresh-btn" appearance="secondary" title="Refresh Now">
                    <span class="codicon codicon-refresh"></span>
                    Refresh
                </vscode-button>
                <vscode-checkbox id="auto-refresh-toggle" checked>
                    Auto-refresh (5s)
                </vscode-checkbox>
            </div>
        </div>

        <div id="loading" class="loading">
            <vscode-progress-ring></vscode-progress-ring>
            <span>Loading metrics...</span>
        </div>

        <div id="error" class="error" style="display: none;">
            <span class="codicon codicon-error"></span>
            <div>
                <h3>Error Loading Metrics</h3>
                <p id="error-message"></p>
            </div>
        </div>

        <div id="metrics-container" style="display: none;">
            <!-- Server Info -->
            <div class="metrics-section">
                <h3>Server Information</h3>
                <div class="metric-cards">
                    <div class="metric-card">
                        <div class="metric-label">Version</div>
                        <div class="metric-value" id="server-version">-</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Uptime</div>
                        <div class="metric-value" id="server-uptime">-</div>
                    </div>
                </div>
            </div>

            <!-- Historical Charts -->
            <div class="metrics-section">
                <h3>Historical Trends</h3>
                <div class="charts-grid">
                    <div class="chart-container">
                        <h4>Connections Over Time</h4>
                        <canvas id="connections-chart"></canvas>
                    </div>
                    <div class="chart-container">
                        <h4>Queries Per Second</h4>
                        <canvas id="queries-chart"></canvas>
                    </div>
                    <div class="chart-container">
                        <h4>Buffer Pool Hit Rate</h4>
                        <canvas id="buffer-pool-chart"></canvas>
                    </div>
                    <div class="chart-container">
                        <h4>Thread Activity</h4>
                        <canvas id="threads-chart"></canvas>
                    </div>
                </div>
            </div>

            <!-- Connections -->
            <div class="metrics-section">
                <h3>Connections</h3>
                <div class="metric-cards">
                    <div class="metric-card">
                        <div class="metric-label">Current</div>
                        <div class="metric-value" id="connections-current">-</div>
                        <div class="metric-subtext" id="connections-max">of - max</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Running</div>
                        <div class="metric-value" id="connections-running">-</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Usage</div>
                        <div class="metric-value" id="connections-usage">-%</div>
                        <div class="metric-bar">
                            <div class="metric-bar-fill" id="connections-bar"></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Queries -->
            <div class="metrics-section">
                <h3>Queries</h3>
                <div class="metric-cards">
                    <div class="metric-card">
                        <div class="metric-label">Queries/sec</div>
                        <div class="metric-value" id="queries-per-second">-</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Slow Queries</div>
                        <div class="metric-value" id="queries-slow">-</div>
                    </div>
                </div>
            </div>

            <!-- Threads -->
            <div class="metrics-section">
                <h3>Threads</h3>
                <div class="metric-cards">
                    <div class="metric-card">
                        <div class="metric-label">Running</div>
                        <div class="metric-value" id="threads-running">-</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Connected</div>
                        <div class="metric-value" id="threads-connected">-</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Cached</div>
                        <div class="metric-value" id="threads-cached">-</div>
                    </div>
                </div>
            </div>

            <!-- Buffer Pool (InnoDB) -->
            <div class="metrics-section">
                <h3>InnoDB Buffer Pool</h3>
                <div class="metric-cards">
                    <div class="metric-card">
                        <div class="metric-label">Size</div>
                        <div class="metric-value" id="buffer-pool-size">-</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Used</div>
                        <div class="metric-value" id="buffer-pool-used">-</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Hit Rate</div>
                        <div class="metric-value" id="buffer-pool-hit-rate">-%</div>
                        <div class="metric-bar">
                            <div class="metric-bar-fill" id="buffer-pool-bar"></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Table Cache -->
            <div class="metrics-section">
                <h3>Table Cache</h3>
                <div class="metric-cards">
                    <div class="metric-card">
                        <div class="metric-label">Hit Rate</div>
                        <div class="metric-value" id="table-cache-hit-rate">-%</div>
                        <div class="metric-bar">
                            <div class="metric-bar-fill" id="table-cache-bar"></div>
                        </div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Open Tables</div>
                        <div class="metric-value" id="table-cache-open">-</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Opened/sec</div>
                        <div class="metric-value" id="table-cache-opened-rate">-</div>
                    </div>
                </div>
            </div>

            <!-- Query Cache (if enabled) -->
            <div class="metrics-section" id="query-cache-section" style="display: none;">
                <h3>Query Cache</h3>
                <div class="metric-cards">
                    <div class="metric-card">
                        <div class="metric-label">Hit Rate</div>
                        <div class="metric-value" id="query-cache-hit-rate">-%</div>
                        <div class="metric-bar">
                            <div class="metric-bar-fill" id="query-cache-bar"></div>
                        </div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-label">Size</div>
                        <div class="metric-value" id="query-cache-size">-</div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
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

    private async checkAlerts(metrics: DatabaseMetrics): Promise<void> {
        const config = vscode.workspace.getConfiguration('mydba');
        const connectionUsage = Math.round((metrics.connections.current / metrics.connections.max) * 100);

        // Check connection usage
        const criticalThreshold = config.get<number>('metrics.connectionUsageCritical', 95);
        const warningThreshold = config.get<number>('metrics.connectionUsageWarning', 80);

        if (connectionUsage >= criticalThreshold) {
            if (!this.alertStates.get('connectionCritical')) {
                vscode.window.showErrorMessage(
                    `CRITICAL: Connection usage at ${connectionUsage}%! (Threshold: ${criticalThreshold}%)`
                );
                this.alertStates.set('connectionCritical', true);
            }
        } else {
            this.alertStates.set('connectionCritical', false);
        }

        if (connectionUsage >= warningThreshold && connectionUsage < criticalThreshold) {
            if (!this.alertStates.get('connectionWarning')) {
                vscode.window.showWarningMessage(
                    `WARNING: Connection usage at ${connectionUsage}% (Threshold: ${warningThreshold}%)`
                );
                this.alertStates.set('connectionWarning', true);
            }
        } else if (connectionUsage < warningThreshold) {
            this.alertStates.set('connectionWarning', false);
        }

        // Check buffer pool hit rate
        const bufferPoolThreshold = config.get<number>('metrics.bufferPoolHitRateWarning', 90);
        if (metrics.bufferPool && metrics.bufferPool.hitRate < bufferPoolThreshold) {
            if (!this.alertStates.get('bufferPoolWarning')) {
                vscode.window.showWarningMessage(
                    `WARNING: Buffer pool hit rate is ${metrics.bufferPool.hitRate.toFixed(2)}% (Threshold: ${bufferPoolThreshold}%)`
                );
                this.alertStates.set('bufferPoolWarning', true);
            }
        } else if (metrics.bufferPool && metrics.bufferPool.hitRate >= bufferPoolThreshold) {
            this.alertStates.set('bufferPoolWarning', false);
        }

        // Check slow queries rate (tracked over time)
        const slowQueriesThreshold = config.get<number>('metrics.slowQueriesThreshold', 10);
        // Note: metrics.queries.slow is a cumulative counter, not a rate
        // For proper rate calculation, we'd need to track slow query count over time
        // This is a simplified implementation that won't spam alerts
        if (metrics.queries.slow > slowQueriesThreshold * 10) {
            if (!this.alertStates.get('slowQueriesWarning')) {
                vscode.window.showWarningMessage(
                    `WARNING: Slow queries counter high: ${metrics.queries.slow} (Check threshold: ${slowQueriesThreshold}/min)`
                );
                this.alertStates.set('slowQueriesWarning', true);
            }
        } else {
            this.alertStates.set('slowQueriesWarning', false);
        }
    }

    dispose(): void {
        // Security: Clear alert states to prevent memory leak
        this.alertStates.clear();
        this.stopAutoRefresh();
        MetricsDashboardPanel.panels.delete(`metrics-${this.connectionId}`);
        this.panel.dispose();
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
