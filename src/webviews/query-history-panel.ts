import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { QueryHistoryService } from '../services/query-history-service';

export class QueryHistoryPanel {
    private static currentPanel: QueryHistoryPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];

    private constructor(
        panel: vscode.WebviewPanel,
        private context: vscode.ExtensionContext,
        private logger: Logger,
        private historyService: QueryHistoryService
    ) {
        this.panel = panel;

        // Set HTML content
        this.panel.webview.html = this.getHtml();
        this.setupMessageHandlers();
        this.loadHistory();

        // Handle panel disposal
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    public static show(
        context: vscode.ExtensionContext,
        logger: Logger,
        historyService: QueryHistoryService
    ): void {
        const column = vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;

        // If we already have a panel, show it
        if (QueryHistoryPanel.currentPanel) {
            QueryHistoryPanel.currentPanel.panel.reveal(column);
            QueryHistoryPanel.currentPanel.loadHistory();
            return;
        }

        // Create new panel
        const panel = vscode.window.createWebviewPanel(
            'mydbaQueryHistory',
            'Query History',
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

        QueryHistoryPanel.currentPanel = new QueryHistoryPanel(panel, context, logger, historyService);
    }

    private setupMessageHandlers(): void {
        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.type) {
                    case 'refresh':
                        await this.loadHistory();
                        break;
                    case 'search':
                        await this.handleSearch(message.searchText, message.connectionId);
                        break;
                    case 'toggleFavorite':
                        await this.handleToggleFavorite(message.id);
                        break;
                    case 'replay':
                        await this.handleReplay(message.id);
                        break;
                    case 'delete':
                        await this.handleDelete(message.id);
                        break;
                    case 'clearAll':
                        await this.handleClearAll();
                        break;
                    case 'export':
                        await this.handleExport(message.format);
                        break;
                    case 'import':
                        await this.handleImport();
                        break;
                    case 'updateNotes':
                        await this.handleUpdateNotes(message.id, message.notes);
                        break;
                    case 'updateTags':
                        await this.handleUpdateTags(message.id, message.tags);
                        break;
                    case 'filter':
                        await this.handleFilter(message.options);
                        break;
                    case 'getStats':
                        await this.handleGetStats();
                        break;
                }
            },
            null,
            this.disposables
        );
    }

    private async loadHistory(): Promise<void> {
        try {
            const history = this.historyService.getHistory({ limit: 100 });
            const stats = this.historyService.getStats();

            this.panel.webview.postMessage({
                type: 'historyLoaded',
                history: history,
                stats: stats,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            this.logger.error('Failed to load query history:', error as Error);
            this.panel.webview.postMessage({
                type: 'error',
                message: (error as Error).message
            });
        }
    }

    private async handleSearch(searchText: string, connectionId?: string): Promise<void> {
        try {
            const results = this.historyService.search(searchText, {
                connectionId,
                limit: 100
            });

            this.panel.webview.postMessage({
                type: 'searchResults',
                results: results
            });
        } catch (error) {
            this.logger.error('Search failed:', error as Error);
            this.panel.webview.postMessage({
                type: 'error',
                message: (error as Error).message
            });
        }
    }

    private async handleToggleFavorite(id: string): Promise<void> {
        try {
            const isFavorite = this.historyService.toggleFavorite(id);
            this.panel.webview.postMessage({
                type: 'favoriteToggled',
                id: id,
                isFavorite: isFavorite
            });
            await this.loadHistory();
        } catch (error) {
            this.logger.error('Toggle favorite failed:', error as Error);
        }
    }

    private async handleReplay(id: string): Promise<void> {
        try {
            const entry = this.historyService.getEntry(id);
            if (!entry) {
                vscode.window.showErrorMessage('Query not found in history');
                return;
            }

            // Create a new untitled document with the query
            const document = await vscode.workspace.openTextDocument({
                content: entry.query,
                language: 'sql'
            });

            await vscode.window.showTextDocument(document);
            
            vscode.window.showInformationMessage(
                `Replaying query from ${new Date(entry.timestamp).toLocaleString()}`
            );
        } catch (error) {
            this.logger.error('Replay failed:', error as Error);
            vscode.window.showErrorMessage(`Failed to replay query: ${(error as Error).message}`);
        }
    }

    private async handleDelete(id: string): Promise<void> {
        try {
            const confirm = await vscode.window.showWarningMessage(
                'Delete this query from history?',
                { modal: false },
                'Delete'
            );

            if (confirm === 'Delete') {
                this.historyService.deleteEntry(id);
                await this.loadHistory();
                vscode.window.showInformationMessage('Query deleted from history');
            }
        } catch (error) {
            this.logger.error('Delete failed:', error as Error);
        }
    }

    private async handleClearAll(): Promise<void> {
        try {
            const confirm = await vscode.window.showWarningMessage(
                'Clear ALL query history? This cannot be undone.',
                { modal: true },
                'Clear All'
            );

            if (confirm === 'Clear All') {
                this.historyService.clearHistory();
                await this.loadHistory();
                vscode.window.showInformationMessage('Query history cleared');
            }
        } catch (error) {
            this.logger.error('Clear all failed:', error as Error);
        }
    }

    private async handleExport(format: 'json' | 'csv'): Promise<void> {
        try {
            const data = format === 'json' 
                ? this.historyService.exportToJSON()
                : this.historyService.exportToCSV();

            const ext = format === 'json' ? 'json' : 'csv';
            const defaultUri = vscode.Uri.file(`query-history.${ext}`);

            const uri = await vscode.window.showSaveDialog({
                defaultUri,
                filters: {
                    [format.toUpperCase()]: [ext]
                }
            });

            if (uri) {
                await vscode.workspace.fs.writeFile(uri, Buffer.from(data, 'utf-8'));
                vscode.window.showInformationMessage(`Query history exported to ${uri.fsPath}`);
            }
        } catch (error) {
            this.logger.error('Export failed:', error as Error);
            vscode.window.showErrorMessage(`Failed to export: ${(error as Error).message}`);
        }
    }

    private async handleImport(): Promise<void> {
        try {
            const uri = await vscode.window.showOpenDialog({
                canSelectMany: false,
                filters: {
                    'JSON': ['json']
                }
            });

            if (uri && uri[0]) {
                const data = await vscode.workspace.fs.readFile(uri[0]);
                const json = Buffer.from(data).toString('utf-8');
                
                const count = this.historyService.importFromJSON(json);
                await this.loadHistory();
                
                vscode.window.showInformationMessage(`Imported ${count} query entries`);
            }
        } catch (error) {
            this.logger.error('Import failed:', error as Error);
            vscode.window.showErrorMessage(`Failed to import: ${(error as Error).message}`);
        }
    }

    private async handleUpdateNotes(id: string, notes: string): Promise<void> {
        try {
            this.historyService.updateNotes(id, notes);
            this.panel.webview.postMessage({
                type: 'notesUpdated',
                id: id
            });
        } catch (error) {
            this.logger.error('Update notes failed:', error as Error);
        }
    }

    private async handleUpdateTags(id: string, tags: string[]): Promise<void> {
        try {
            this.historyService.updateTags(id, tags);
            await this.loadHistory();
        } catch (error) {
            this.logger.error('Update tags failed:', error as Error);
        }
    }

    private async handleFilter(options: { limit?: number; connectionId?: string; onlyFavorites?: boolean; successOnly?: boolean }): Promise<void> {
        try {
            const results = this.historyService.getHistory(options);
            
            this.panel.webview.postMessage({
                type: 'filterResults',
                results: results
            });
        } catch (error) {
            this.logger.error('Filter failed:', error as Error);
        }
    }

    private async handleGetStats(): Promise<void> {
        try {
            const stats = this.historyService.getStats();
            
            this.panel.webview.postMessage({
                type: 'stats',
                stats: stats
            });
        } catch (error) {
            this.logger.error('Get stats failed:', error as Error);
        }
    }

    private getHtml(): string {
        const scriptUri = this.panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'queryHistoryView.js')
        );
        const styleUri = this.panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'queryHistoryView.css')
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
    <title>Query History</title>
</head>
<body>
    <div class="container">
        <div class="toolbar">
            <div class="toolbar-left">
                <h2>Query History</h2>
                <span id="last-updated" class="last-updated"></span>
            </div>
            <div class="toolbar-actions">
                <vscode-text-field id="search-input" placeholder="Search queries, tags, notes...">
                    <span slot="start" class="codicon codicon-search"></span>
                </vscode-text-field>
                <vscode-button id="stats-btn" appearance="secondary" title="View Statistics">
                    <span class="codicon codicon-graph"></span>
                    Stats
                </vscode-button>
                <vscode-button id="export-btn" appearance="secondary" title="Export History">
                    <span class="codicon codicon-export"></span>
                    Export
                </vscode-button>
                <vscode-button id="import-btn" appearance="secondary" title="Import History">
                    <span class="codicon codicon-cloud-upload"></span>
                    Import
                </vscode-button>
                <vscode-button id="refresh-btn" appearance="secondary" title="Refresh">
                    <span class="codicon codicon-refresh"></span>
                </vscode-button>
            </div>
        </div>

        <div class="filters">
            <vscode-checkbox id="filter-favorites">Show Favorites Only</vscode-checkbox>
            <vscode-checkbox id="filter-success">Success Only</vscode-checkbox>
            <vscode-button id="clear-all-btn" appearance="secondary">
                <span class="codicon codicon-trash"></span>
                Clear All
            </vscode-button>
        </div>

        <div id="loading" class="loading">
            <vscode-progress-ring></vscode-progress-ring>
            <span>Loading query history...</span>
        </div>

        <div id="error" class="error" style="display: none;">
            <span class="codicon codicon-error"></span>
            <span id="error-message"></span>
        </div>

        <div id="history-list" style="display: none;">
            <div id="history-count" class="history-count"></div>
            <div id="history-entries" class="history-entries">
                <!-- Populated by JavaScript -->
            </div>
        </div>

        <!-- Stats Modal -->
        <div id="stats-modal" class="modal" style="display: none;">
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Query Statistics</h3>
                    <button id="stats-close" class="close-btn">
                        <span class="codicon codicon-close"></span>
                    </button>
                </div>
                <div class="modal-body" id="stats-content">
                    <!-- Populated by JavaScript -->
                </div>
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
        QueryHistoryPanel.currentPanel = undefined;
        this.panel.dispose();

        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}

