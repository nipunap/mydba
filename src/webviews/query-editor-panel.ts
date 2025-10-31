/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { ConnectionManager } from '../services/connection-manager';
// import { QueryResult } from '../types';
import { ExplainViewerPanel } from './explain-viewer-panel';

/**
 * Query Editor Panel - Provides SQL editing and execution capabilities
 */
export class QueryEditorPanel {
    private static panels: Map<string, QueryEditorPanel> = new Map();
    private readonly panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];
    private currentQuery: string = '';

    private constructor(
        panel: vscode.WebviewPanel,
        private context: vscode.ExtensionContext,
        private logger: Logger,
        private connectionManager: ConnectionManager,
        private connectionId: string,
        private initialQuery?: string
    ) {
        this.panel = panel;
        this.currentQuery = initialQuery || '';
        this.panel.webview.html = this.getHtml();
        this.setupMessageHandlers();

        // Send initial query if provided
        if (this.initialQuery) {
            this.panel.webview.postMessage({
                type: 'setQuery',
                query: this.initialQuery
            });
        }

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    public static show(
        context: vscode.ExtensionContext,
        logger: Logger,
        connectionManager: ConnectionManager,
        connectionId: string,
        initialQuery?: string
    ): void {
        const connection = connectionManager.getConnection(connectionId);
        if (!connection) {
            vscode.window.showErrorMessage('Connection not found');
            return;
        }

        const column = vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;
        const panelKey = `${connectionId}-query`;

        // Reuse existing panel if available
        if (QueryEditorPanel.panels.has(panelKey)) {
            const existingPanel = QueryEditorPanel.panels.get(panelKey)!;
            existingPanel.panel.reveal(column);
            if (initialQuery) {
                existingPanel.panel.webview.postMessage({
                    type: 'setQuery',
                    query: initialQuery
                });
            }
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'mydbaQueryEditor',
            `Query Editor - ${connection.name}`,
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

        const queryEditorPanel = new QueryEditorPanel(
            panel,
            context,
            logger,
            connectionManager,
            connectionId,
            initialQuery
        );
        QueryEditorPanel.panels.set(panelKey, queryEditorPanel);
    }

    private setupMessageHandlers(): void {
        this.panel.webview.onDidReceiveMessage(
            async (message: any) => {
                switch (message.type) {
                    case 'executeQuery':
                        await this.executeQuery(message.query);
                        break;
                    case 'explainQuery':
                        await this.explainQuery(message.query);
                        break;
                    case 'formatQuery':
                        await this.formatQuery(message.query);
                        break;
                    case 'exportResults':
                        await this.exportResults(message.format, message.results);
                        break;
                }
            },
            null,
            this.disposables
        );
    }

    private async executeQuery(query: string): Promise<void> {
        this.logger.info(`Executing query: ${query.substring(0, 100)}`);

        try {
            const adapter = this.connectionManager.getAdapter(this.connectionId);
            if (!adapter) {
                throw new Error('Connection not found or not connected');
            }

            // Check for safety issues
            const safetyWarnings = this.checkQuerySafety(query);
            if (safetyWarnings.length > 0) {
                const proceed = await this.showSafetyWarnings(safetyWarnings, query);
                if (!proceed) {
                    this.panel.webview.postMessage({
                        type: 'queryExecutionCancelled',
                        message: 'Query execution cancelled by user'
                    });
                    return;
                }
            }

            // Add LIMIT if needed for SELECT queries
            const modifiedQuery = this.enforceRowLimit(query);
            if (modifiedQuery !== query) {
                this.logger.info('Added LIMIT clause to query');
            }

            const startTime = Date.now();
            const result = await adapter.query(modifiedQuery);
            const executionTime = Date.now() - startTime;

            this.logger.info(`Query executed in ${executionTime}ms, returned ${result.rows?.length || 0} rows`);

            this.panel.webview.postMessage({
                type: 'queryExecuted',
                result: {
                    columns: (result.fields || []).map(f => ({
                        name: f.name,
                        type: f.type
                    })),
                    rows: result.rows || [],
                    rowCount: result.rows?.length || 0,
                    executionTime,
                    affectedRows: result.affected || 0,
                    insertId: result.insertId
                },
                query: modifiedQuery,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            this.logger.error('Query execution failed:', error as Error);
            this.panel.webview.postMessage({
                type: 'queryError',
                error: (error as Error).message,
                query
            });
        }
    }

    private async explainQuery(query: string): Promise<void> {
        this.logger.info(`Explaining query: ${query.substring(0, 100)}`);

        try {
            const adapter = this.connectionManager.getAdapter(this.connectionId);
            if (!adapter) {
                throw new Error('Connection not found');
            }

            // Remove any existing EXPLAIN prefix to avoid double EXPLAIN
            let cleanQuery = query.trim();
            const explainPrefixRegex = /^EXPLAIN\s+(FORMAT\s*=\s*(JSON|TRADITIONAL|TREE)\s+)?/i;
            cleanQuery = cleanQuery.replace(explainPrefixRegex, '').trim();

            // Execute EXPLAIN
            const explainQuery = `EXPLAIN FORMAT=JSON ${cleanQuery}`;
            const result = await adapter.query<unknown>(explainQuery);

            // Create AI service for enhanced analysis
            const { AIService } = await import('../services/ai-service');
            const aiService = new AIService(this.logger, this.context);
            await aiService.initialize();

            // Open the enhanced EXPLAIN viewer panel with AI insights
            ExplainViewerPanel.show(
                this.context,
                this.logger,
                this.connectionManager,
                this.connectionId,
                cleanQuery,
                result.rows?.[0] || {},
                aiService
            );

        } catch (error) {
            this.logger.error('EXPLAIN failed:', error as Error);
            vscode.window.showErrorMessage(`EXPLAIN failed: ${(error as Error).message}`);
        }
    }

    private async formatQuery(query: string): Promise<void> {
        // Enhanced SQL formatter with proper indentation
        let formatted = query.trim();

        // Normalize whitespace
        formatted = formatted.replace(/\s+/g, ' ');

        // Add newlines before major keywords
        formatted = formatted.replace(/\b(SELECT|FROM|WHERE|GROUP BY|HAVING|ORDER BY|LIMIT|UNION|UNION ALL|INTERSECT|EXCEPT)\b/gi, '\n$1');

        // Add newlines before JOIN keywords
        formatted = formatted.replace(/\b(INNER JOIN|LEFT JOIN|RIGHT JOIN|FULL JOIN|CROSS JOIN|JOIN)\b/gi, '\n$1');

        // Add newlines before SET in UPDATE
        formatted = formatted.replace(/\b(SET)\b/gi, '\n$1');

        // Add newlines before INSERT/UPDATE/DELETE keywords
        formatted = formatted.replace(/\b(INSERT INTO|UPDATE|DELETE FROM|VALUES)\b/gi, '\n$1');

        // Indent AND/OR conditions
        formatted = formatted.replace(/\b(AND|OR)\b/gi, '\n  $1');

        // Indent WHEN in CASE statements
        formatted = formatted.replace(/\b(WHEN|THEN|ELSE|END)\b/gi, '\n  $1');

        // Format commas in SELECT (but not after SELECT keyword itself)
        formatted = formatted.replace(/,(?=\s*(?!FROM|WHERE|GROUP|HAVING|ORDER|LIMIT)\S)/g, ',\n  ');

        // Clean up multiple newlines
        formatted = formatted.replace(/\n{3,}/g, '\n\n');

        // Trim each line and remove leading/trailing whitespace
        const lines = formatted.split('\n').map(line => line.trim());

        // Apply proper indentation
        let indentLevel = 0;
        const indentedLines = lines.map(line => {
            const upperLine = line.toUpperCase();

            // Decrease indent for closing keywords
            if (upperLine.match(/^(END|ELSE)/)) {
                indentLevel = Math.max(0, indentLevel - 1);
            }

            const indentedLine = '  '.repeat(indentLevel) + line;

            // Increase indent after SELECT (for column list)
            if (upperLine.startsWith('SELECT')) {
                indentLevel++;
            }

            // Decrease indent when we hit FROM, WHERE, etc.
            if (upperLine.match(/^(FROM|WHERE|GROUP BY|ORDER BY|LIMIT|HAVING)/)) {
                indentLevel = Math.max(0, indentLevel - 1);
            }

            // Increase indent for CASE
            if (upperLine.match(/\bCASE\b/)) {
                indentLevel++;
            }

            // Decrease indent after END
            if (upperLine.match(/\bEND\b/)) {
                indentLevel = Math.max(0, indentLevel - 1);
            }

            return indentedLine;
        });

        formatted = indentedLines.join('\n').trim();

        // Capitalize keywords
        const keywords = [
            'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE',
            'GROUP BY', 'HAVING', 'ORDER BY', 'ASC', 'DESC', 'LIMIT', 'OFFSET',
            'INSERT INTO', 'UPDATE', 'DELETE FROM', 'SET', 'VALUES',
            'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN', 'JOIN', 'ON',
            'UNION', 'UNION ALL', 'INTERSECT', 'EXCEPT',
            'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
            'AS', 'DISTINCT', 'ALL', 'NULL', 'IS', 'IS NOT'
        ];

        keywords.forEach(keyword => {
            const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
            formatted = formatted.replace(regex, keyword);
        });

        this.panel.webview.postMessage({
            type: 'queryFormatted',
            query: formatted
        });
    }

    private async exportResults(format: 'csv' | 'json' | 'sql', results: any): Promise<void> {
        try {
            const uri = await vscode.window.showSaveDialog({
                filters: {
                    'CSV Files': ['csv'],
                    'JSON Files': ['json'],
                    'SQL Files': ['sql']
                },
                defaultUri: vscode.Uri.file(`query_results.${format}`)
            });

            if (!uri) {
                return;
            }

            let content = '';
            if (format === 'csv') {
                content = this.resultsToCSV(results);
            } else if (format === 'json') {
                content = JSON.stringify(results.rows, null, 2);
            } else if (format === 'sql') {
                content = this.resultsToSQL(results);
            }

            await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
            vscode.window.showInformationMessage(`Results exported to ${uri.fsPath}`);

        } catch (error) {
            this.logger.error('Export failed:', error as Error);
            vscode.window.showErrorMessage(`Export failed: ${(error as Error).message}`);
        }
    }

    private resultsToCSV(results: any): string {
        if (!results.rows || results.rows.length === 0) {
            return '';
        }

        const columns = results.columns.map((c: any) => c.name);
        const header = columns.join(',');
        const rows = results.rows.map((row: any) => {
            return columns.map((col: string) => {
                const value = row[col];
                if (value === null || value === undefined) {
                    return '';
                }
                // Escape quotes and wrap in quotes if contains comma
                const stringValue = String(value);
                if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
                    return `"${stringValue.replace(/"/g, '""')}"`;
                }
                return stringValue;
            }).join(',');
        });

        return [header, ...rows].join('\n');
    }

    private resultsToSQL(results: any): string {
        // Simple INSERT statement generation
        if (!results.rows || results.rows.length === 0) {
            return '';
        }

        const tableName = 'table_name'; // Placeholder
        const columns = results.columns.map((c: any) => c.name);
        const inserts = results.rows.map((row: any) => {
            const values = columns.map((col: string) => {
                const value = row[col];
                if (value === null || value === undefined) {
                    return 'NULL';
                }
                if (typeof value === 'string') {
                    return `'${value.replace(/'/g, "''")}'`;
                }
                return String(value);
            });
            return `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')});`;
        });

        return inserts.join('\n');
    }

    private checkQuerySafety(query: string): string[] {
        const warnings: string[] = [];
        const upperQuery = query.trim().toUpperCase();

        // Check for destructive operations
        if (upperQuery.startsWith('DROP ')) {
            warnings.push('⚠️ DROP statement detected - This will permanently delete database objects');
        }
        if (upperQuery.startsWith('TRUNCATE ')) {
            warnings.push('⚠️ TRUNCATE statement detected - This will delete all data from the table');
        }

        // Check for UPDATE/DELETE without WHERE
        if (upperQuery.startsWith('DELETE ') && !upperQuery.includes(' WHERE ')) {
            warnings.push('⚠️ DELETE without WHERE clause - This will delete ALL rows from the table');
        }
        if (upperQuery.startsWith('UPDATE ') && !upperQuery.includes(' WHERE ')) {
            warnings.push('⚠️ UPDATE without WHERE clause - This will update ALL rows in the table');
        }

        // Check for production environment
        const connection = this.connectionManager.getConnection(this.connectionId);
        if (connection?.environment === 'prod' && warnings.length > 0) {
            warnings.unshift('🔴 PRODUCTION ENVIRONMENT - Extra caution required!');
        }

        return warnings;
    }

    private async showSafetyWarnings(warnings: string[], query: string): Promise<boolean> {
        const message = [
            'Query Safety Warning',
            '',
            ...warnings,
            '',
            'Query:',
            query.substring(0, 200) + (query.length > 200 ? '...' : ''),
            '',
            'Do you want to proceed?'
        ].join('\n');

        const proceed = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            'Execute Anyway',
            'Cancel'
        );

        return proceed === 'Execute Anyway';
    }

    private enforceRowLimit(query: string): string {
        const trimmedQuery = query.trim();
        const upperQuery = trimmedQuery.toUpperCase();

        // Only add LIMIT for SELECT queries
        if (!upperQuery.startsWith('SELECT ')) {
            return query;
        }

        // Check if LIMIT already exists (case-insensitive, handles whitespace)
        // Match: LIMIT <number> at the end of query (may have semicolon after)
        const limitPattern = /\bLIMIT\s+\d+\s*(;)?$/i;
        if (limitPattern.test(trimmedQuery)) {
            return query; // Already has LIMIT, don't add another
        }

        // Remove trailing semicolon if present
        let queryWithoutSemicolon = trimmedQuery;
        if (queryWithoutSemicolon.endsWith(';')) {
            queryWithoutSemicolon = queryWithoutSemicolon.slice(0, -1).trim();
        }

        // Add LIMIT 1000
        return queryWithoutSemicolon + ' LIMIT 1000';
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
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'queryEditorView.js')
        );

        const styleUri = this.panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'queryEditorView.css')
        );

        const nonce = this.getNonce();
        // Add cache-busting timestamp
        const cacheBuster = Date.now();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${this.panel.webview.cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUri}?v=${cacheBuster}" rel="stylesheet">
    <style>
        /* Codicon font inline to avoid loading issues */
        .codicon {
            font-family: codicon;
            font-size: 16px;
            line-height: 1;
        }
    </style>
    <title>Query Editor</title>
</head>
<body>
    <div class="container">
        <div class="toolbar">
            <div class="toolbar-left">
                <h2>SQL Query Editor</h2>
            </div>
            <div class="toolbar-actions">
                <vscode-button id="execute-btn" appearance="primary">
                    <span class="codicon codicon-play"></span>
                    Execute (Ctrl+Enter)
                </vscode-button>
                <vscode-button id="explain-btn" appearance="secondary">
                    <span class="codicon codicon-graph"></span>
                    Explain
                </vscode-button>
                <vscode-button id="format-btn" appearance="secondary">
                    <span class="codicon codicon-code"></span>
                    Format
                </vscode-button>
            </div>
        </div>

        <div class="editor-container">
            <vscode-text-area
                id="query-editor"
                placeholder="Enter your SQL query here..."
                rows="10"
                resize="vertical"
            ></vscode-text-area>
        </div>

        <div id="loading" class="loading" style="display: none;">
            <vscode-progress-ring></vscode-progress-ring>
            <span>Executing query...</span>
        </div>

        <div id="error" class="error" style="display: none;">
            <span class="codicon codicon-error"></span>
            <div>
                <strong>Error:</strong>
                <p id="error-message"></p>
            </div>
        </div>

        <div id="results-container" style="display: none;">
            <div class="results-toolbar">
                <div class="results-info">
                    <span id="results-summary"></span>
                    <span id="execution-time"></span>
                </div>
                <div class="results-actions">
                    <vscode-button id="export-csv-btn" appearance="secondary">
                        <span class="codicon codicon-export"></span>
                        Export CSV
                    </vscode-button>
                    <vscode-button id="export-json-btn" appearance="secondary">
                        <span class="codicon codicon-json"></span>
                        Export JSON
                    </vscode-button>
                </div>
            </div>

            <div id="results-table-container" class="table-container">
                <table id="results-table">
                    <thead id="results-thead"></thead>
                    <tbody id="results-tbody"></tbody>
                </table>
            </div>
        </div>

        <div id="explain-container" style="display: none;">
            <h3>Query Execution Plan</h3>
            <div id="explain-content"></div>
        </div>
    </div>

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

    private dispose(): void {
        const panelKey = `${this.connectionId}-query`;
        QueryEditorPanel.panels.delete(panelKey);

        this.panel.dispose();
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
