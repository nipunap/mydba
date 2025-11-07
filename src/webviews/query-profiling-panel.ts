/* eslint-disable @typescript-eslint/no-explicit-any */

import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { ConnectionManager } from '../services/connection-manager';
import { QueryProfilingService } from '../services/query-profiling-service';
import { AIServiceCoordinator } from '../services/ai-service-coordinator';

export class QueryProfilingPanel {
    private static panelRegistry: Map<string, QueryProfilingPanel> = new Map();
    private readonly panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];
    private service: QueryProfilingService;
    private aiServiceCoordinator?: AIServiceCoordinator;

    private constructor(
        panel: vscode.WebviewPanel,
        private context: vscode.ExtensionContext,
        private logger: Logger,
        private connectionManager: ConnectionManager,
        private connectionId: string,
        private query: string,
        aiServiceCoordinator?: AIServiceCoordinator
    ) {
        this.panel = panel;
        this.service = new QueryProfilingService(logger);
        this.aiServiceCoordinator = aiServiceCoordinator;
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
        query: string,
        aiServiceCoordinator?: AIServiceCoordinator
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
        const p = new QueryProfilingPanel(panel, context, logger, connectionManager, connectionId, query, aiServiceCoordinator);
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

            // Get AI insights asynchronously
            this.getAIInsights(result);
        } catch (error) {
            this.logger.error('Profiling failed:', error as Error);
            this.panel.webview.postMessage({ type: 'error', message: (error as Error).message });
        }
    }

    private async getAIInsights(profile: any): Promise<void> {
        if (!this.aiServiceCoordinator) {
            this.logger.warn('AI service coordinator not available');
            return;
        }

        try {
            this.panel.webview.postMessage({ type: 'aiInsightsLoading' });

            const adapter = this.connectionManager.getAdapter(this.connectionId);
            if (!adapter) {
                this.logger.error('Adapter not found for connection');
                return;
            }

            // Get connection to determine DB type
            const connection = this.connectionManager.getConnection(this.connectionId);
            const dbType = connection?.type === 'mariadb' ? 'mariadb' : 'mysql';

            this.logger.info(`Requesting AI profiling interpretation for ${dbType.toUpperCase()} database...`);

            // Use AIServiceCoordinator's interpretProfiling for specialized profiling analysis
            const interpretation = await this.aiServiceCoordinator.interpretProfiling(
                profile,
                this.query,
                dbType
            );

            this.logger.info('AI profiling interpretation completed successfully');
            
            // Send enhanced insights to webview
            this.panel.webview.postMessage({
                type: 'aiInsights',
                insights: {
                    // Core profiling interpretation
                    stages: interpretation.stages,
                    bottlenecks: interpretation.bottlenecks,
                    totalDuration: interpretation.totalDuration,
                    insights: interpretation.insights,
                    suggestions: interpretation.suggestions,
                    citations: interpretation.citations,
                    // Include summary for backward compatibility
                    summary: interpretation.insights.join('\n\n'),
                    optimizationSuggestions: interpretation.suggestions
                }
            });
        } catch (error) {
            this.logger.error('AI analysis failed:', error as Error);
            this.panel.webview.postMessage({
                type: 'aiInsightsError',
                error: (error as Error).message
            });
        }
    }

    private extractTablesFromQuery(query: string): string[] {
        // Simple regex to extract table names from SQL query
        const tables: string[] = [];
        const normalizedQuery = query.toLowerCase();

        // Match FROM clause
        const fromMatch = normalizedQuery.match(/from\s+`?(\w+)`?/gi);
        if (fromMatch) {
            fromMatch.forEach(match => {
                const tableName = match.replace(/from\s+`?|`/gi, '').trim();
                if (tableName && !tables.includes(tableName)) {
                    tables.push(tableName);
                }
            });
        }

        // Match JOIN clauses
        const joinMatch = normalizedQuery.match(/join\s+`?(\w+)`?/gi);
        if (joinMatch) {
            joinMatch.forEach(match => {
                const tableName = match.replace(/join\s+`?|`/gi, '').trim();
                if (tableName && !tables.includes(tableName)) {
                    tables.push(tableName);
                }
            });
        }

        return tables;
    }

    private async buildSchemaContext(adapter: any, tables: string[]): Promise<any> {
        const schemaContext: any = {
            tables: {}
        };

        for (const tableName of tables) {
            try {
                // Get current database
                const dbResult = await adapter.query('SELECT DATABASE() as db');
                const dbRows = Array.isArray(dbResult) ? dbResult : ((dbResult as any).rows || []);
                const database = dbRows[0]?.db || dbRows[0]?.DB;

                if (!database) continue;

                // Get table structure
                const descResult = await adapter.query(`DESCRIBE \`${tableName}\``);
                const columns = Array.isArray(descResult) ? descResult : ((descResult as any).rows || []);

                // Get indexes
                const indexResult = await adapter.query(`SHOW INDEX FROM \`${tableName}\``);
                const indexes = Array.isArray(indexResult) ? indexResult : ((indexResult as any).rows || []);

                // Get table stats
                const statsResult = await adapter.query(
                    `SELECT TABLE_ROWS, AVG_ROW_LENGTH, DATA_LENGTH, INDEX_LENGTH
                     FROM information_schema.TABLES
                     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
                    [database, tableName]
                );
                const stats = Array.isArray(statsResult) ? statsResult[0] : ((statsResult as any).rows?.[0]);

                schemaContext.tables[tableName] = {
                    columns: columns.map((col: any) => ({
                        name: col.Field || col.field,
                        type: col.Type || col.type,
                        nullable: (col.Null || col.null) === 'YES',
                        key: col.Key || col.key,
                        default: col.Default || col.default,
                        extra: col.Extra || col.extra
                    })),
                    indexes: this.formatIndexes(indexes),
                    stats: stats ? {
                        estimatedRows: stats.TABLE_ROWS || stats.table_rows || 0,
                        avgRowLength: stats.AVG_ROW_LENGTH || stats.avg_row_length || 0,
                        dataLength: stats.DATA_LENGTH || stats.data_length || 0,
                        indexLength: stats.INDEX_LENGTH || stats.index_length || 0
                    } : undefined
                };

                this.logger.info(`Fetched schema for table: ${tableName}`);
            } catch (error) {
                this.logger.warn(`Failed to fetch schema for table ${tableName}:`, error as Error);
            }
        }

        return schemaContext;
    }

    private formatIndexes(indexRows: any[]): any[] {
        const indexMap = new Map<string, any>();

        indexRows.forEach((row: any) => {
            const indexName = row.Key_name || row.key_name;
            const columnName = row.Column_name || row.column_name;
            const seqInIndex = row.Seq_in_index || row.seq_in_index;

            if (!indexMap.has(indexName)) {
                indexMap.set(indexName, {
                    name: indexName,
                    unique: (row.Non_unique || row.non_unique) === 0,
                    type: row.Index_type || row.index_type,
                    columns: []
                });
            }

            const index = indexMap.get(indexName);
            index.columns.push({
                name: columnName,
                position: seqInIndex
            });
        });

        // Sort columns by position within each index
        indexMap.forEach(index => {
            index.columns.sort((a: any, b: any) => a.position - b.position);
        });

        return Array.from(indexMap.values());
    }

    private buildProfilingContext(profile: any): string {
        const lines: string[] = [];

        lines.push('## Query Performance Profile');
        lines.push(`Total Duration: ${profile.totalDuration.toFixed(2)} µs (${(profile.totalDuration / 1000).toFixed(2)} ms)`);
        lines.push(`Rows Examined: ${profile.summary.totalRowsExamined}`);
        lines.push(`Rows Sent: ${profile.summary.totalRowsSent}`);
        lines.push(`Efficiency: ${profile.summary.efficiency.toFixed(2)}% (rows sent / rows examined)`);
        lines.push(`Lock Time: ${profile.summary.totalLockTime.toFixed(2)} µs`);
        lines.push('');

        // Performance assessment
        const efficiency = profile.summary.efficiency;
        if (efficiency < 10) {
            lines.push('⚠️ **Low Efficiency**: Query examines many more rows than it returns. Consider adding indexes or refining WHERE clauses.');
        } else if (efficiency < 50) {
            lines.push('⚡ **Moderate Efficiency**: Some optimization may be possible.');
        } else {
            lines.push('✓ **Good Efficiency**: Query is relatively efficient.');
        }
        lines.push('');

        if (profile.stages && profile.stages.length > 0) {
            lines.push('## Execution Stages (Performance Breakdown):');

            // Find slowest stages
            const sortedStages = [...profile.stages].sort((a, b) => b.duration - a.duration);
            const totalDuration = profile.stages.reduce((sum: number, s: any) => sum + s.duration, 0);

            sortedStages.slice(0, 5).forEach((stage: any, idx: number) => {
                const percentage = ((stage.duration / totalDuration) * 100).toFixed(1);
                const icon = idx === 0 ? '🔴' : idx === 1 ? '🟡' : '⚪';
                lines.push(`${icon} ${stage.eventName}: ${stage.duration.toFixed(2)} µs (${percentage}% of total)`);
            });

            if (sortedStages.length > 5) {
                lines.push(`... and ${sortedStages.length - 5} more stages`);
            }
        }

        return lines.join('\n');
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net; font-src ${this.panel.webview.cspSource};">
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
      <div class="waterfall-section">
        <div class="waterfall-header">
          <h3><span class="codicon codicon-graph"></span> Performance Waterfall</h3>
          <div class="waterfall-controls">
            <button id="toggle-view-btn" class="toggle-btn" title="Toggle between chart and table view">
              <span class="codicon codicon-table"></span> Table View
            </button>
            <button id="export-chart-btn" class="export-btn" title="Export chart as PNG">
              <span class="codicon codicon-export"></span> Export PNG
            </button>
          </div>
        </div>
        <div id="waterfall-chart-container" class="chart-container">
          <canvas id="waterfall-chart"></canvas>
        </div>
        <div id="stages-table-container" class="stages-table-container" style="display:none;">
          <table class="stages-table">
            <thead><tr><th>Stage</th><th>Duration (µs)</th><th>% of Total</th></tr></thead>
            <tbody id="stages-body"></tbody>
          </table>
        </div>
      </div>
      <div class="ai-insights-section">
        <h3 class="ai-insights-header"><span class="codicon codicon-sparkle"></span> AI Performance Insights</h3>
        <div id="ai-insights-loading" class="ai-insights-loading" style="display:none;"><vscode-progress-ring></vscode-progress-ring><span>Analyzing performance...</span></div>
        <div id="ai-insights-error" class="ai-insights-error" style="display:none;"><span class="codicon codicon-warning"></span><span id="ai-insights-error-message"></span></div>
        <div id="ai-insights-content" class="ai-insights-content" style="display:none;"></div>
      </div>
      <div class="query-block"><h4>Query</h4><pre id="query-text"></pre></div>
    </div>
  </div>
  <script type="module" nonce="${nonce}" src="${toolkitUri}"></script>
  <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
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
