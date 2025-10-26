import * as vscode from 'vscode';
import { BaseWebviewProvider } from './base-webview-provider';
import { Logger } from '../utils/logger';
import { ExplainResult } from '../adapters/database-adapter';

export interface ExplainNode {
    id: string;
    operation: string;
    cost: number;
    rows: number;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    children: ExplainNode[];
    suggestion?: IndexSuggestion;
}

export interface IndexSuggestion {
    type: 'ADD_INDEX' | 'MODIFY_INDEX' | 'REMOVE_INDEX';
    sql: string;
    description: string;
    impact: string;
}

export class ExplainViewerProvider extends BaseWebviewProvider {
    private currentExplain?: ExplainResult;

    constructor(context: vscode.ExtensionContext, logger: Logger) {
        super(context, logger);
    }

    updateExplain(explainResult: ExplainResult): void {
        this.currentExplain = explainResult;
        this.postMessage({
            type: 'updateExplain',
            data: this.convertToExplainNode(explainResult)
        });
    }

    protected getHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: https:;">
    <title>EXPLAIN Plan Viewer</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            margin: 0;
            padding: 16px;
            overflow-x: auto;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .title {
            font-size: 18px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }

        .controls {
            display: flex;
            gap: 8px;
        }

        .btn {
            padding: 6px 12px;
            border: 1px solid var(--vscode-button-border);
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
        }

        .btn:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .explain-tree {
            font-family: 'Courier New', monospace;
            font-size: 13px;
            line-height: 1.4;
        }

        .node {
            margin: 4px 0;
            padding: 8px;
            border-radius: 4px;
            border-left: 4px solid;
            background-color: var(--vscode-editor-background);
        }

        .node.severity-LOW {
            border-left-color: #4CAF50;
            background-color: rgba(76, 175, 80, 0.1);
        }

        .node.severity-MEDIUM {
            border-left-color: #FF9800;
            background-color: rgba(255, 152, 0, 0.1);
        }

        .node.severity-HIGH {
            border-left-color: #F44336;
            background-color: rgba(244, 67, 54, 0.1);
        }

        .node.severity-CRITICAL {
            border-left-color: #9C27B0;
            background-color: rgba(156, 39, 176, 0.1);
        }

        .node-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4px;
        }

        .operation {
            font-weight: 600;
            color: var(--vscode-foreground);
        }

        .metrics {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }

        .details {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }

        .suggestion {
            margin-top: 8px;
            padding: 8px;
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 3px solid var(--vscode-textBlockQuote-border);
            border-radius: 3px;
        }

        .suggestion-title {
            font-weight: 600;
            color: var(--vscode-foreground);
            margin-bottom: 4px;
        }

        .suggestion-sql {
            font-family: 'Courier New', monospace;
            background-color: var(--vscode-textCodeBlock-background);
            padding: 4px 8px;
            border-radius: 3px;
            margin: 4px 0;
        }

        .suggestion-impact {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }

        .children {
            margin-left: 20px;
            border-left: 1px solid var(--vscode-panel-border);
            padding-left: 16px;
        }

        .empty-state {
            text-align: center;
            padding: 40px 20px;
            color: var(--vscode-descriptionForeground);
        }

        .empty-state-icon {
            font-size: 48px;
            margin-bottom: 16px;
            opacity: 0.5;
        }

        .loading {
            text-align: center;
            padding: 20px;
            color: var(--vscode-descriptionForeground);
        }

        .spinner {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 2px solid var(--vscode-panel-border);
            border-radius: 50%;
            border-top-color: var(--vscode-foreground);
            animation: spin 1s ease-in-out infinite;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="title">Query Execution Plan</div>
        <div class="controls">
            <button class="btn" id="refreshBtn" onclick="refreshExplain()">Refresh</button>
            <button class="btn" id="exportBtn" onclick="exportExplain()" disabled>Export</button>
        </div>
    </div>

    <div id="content">
        <div class="empty-state">
            <div class="empty-state-icon">📊</div>
            <div>No EXPLAIN plan available</div>
            <div style="font-size: 12px; margin-top: 8px;">
                Select a query and run "MyDBA: Explain Query" to see the execution plan
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function renderExplainNode(node) {
            const severityClass = \`severity-\${node.severity}\`;
            const suggestionHtml = node.suggestion ? \`
                <div class="suggestion">
                    <div class="suggestion-title">💡 Optimization Suggestion</div>
                    <div class="suggestion-sql">\${node.suggestion.sql}</div>
                    <div class="suggestion-impact">\${node.suggestion.impact}</div>
                </div>
            \` : '';

            const childrenHtml = node.children && node.children.length > 0
                ? \`<div class="children">\${node.children.map(renderExplainNode).join('')}</div>\`
                : '';

            return \`
                <div class="node \${severityClass}">
                    <div class="node-header">
                        <div class="operation">\${node.operation}</div>
                        <div class="metrics">Rows: \${node.rows.toLocaleString()} | Cost: \${node.cost}</div>
                    </div>
                    <div class="details">
                        \${node.operation} operation affecting \${node.rows.toLocaleString()} rows
                    </div>
                    \${suggestionHtml}
                    \${childrenHtml}
                </div>
            \`;
        }

        function renderExplain(explainData) {
            const content = document.getElementById('content');
            if (!explainData) {
                content.innerHTML = \`
                    <div class="empty-state">
                        <div class="empty-state-icon">📊</div>
                        <div>No EXPLAIN plan available</div>
                        <div style="font-size: 12px; margin-top: 8px;">
                            Select a query and run "MyDBA: Explain Query" to see the execution plan
                        </div>
                    </div>
                \`;
                return;
            }

            content.innerHTML = \`
                <div class="explain-tree">
                    \${renderExplainNode(explainData)}
                </div>
            \`;

            document.getElementById('exportBtn').disabled = false;
        }

        function refreshExplain() {
            vscode.postMessage({ type: 'refreshExplain' });
        }

        function exportExplain() {
            vscode.postMessage({ type: 'exportExplain' });
        }

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'updateExplain':
                    renderExplain(message.data);
                    break;
                case 'showLoading':
                    document.getElementById('content').innerHTML = \`
                        <div class="loading">
                            <div class="spinner"></div>
                            <div>Analyzing query...</div>
                        </div>
                    \`;
                    break;
                case 'showError':
                    document.getElementById('content').innerHTML = \`
                        <div class="empty-state">
                            <div class="empty-state-icon">❌</div>
                            <div>Error loading EXPLAIN plan</div>
                            <div style="font-size: 12px; margin-top: 8px;">\${message.error}</div>
                        </div>
                    \`;
                    break;
            }
        });

        // Initialize
        renderExplain(null);
    </script>
</body>
</html>`;
    }

    protected setupMessageHandlers(): void {
        if (!this._view) {
            return;
        }

        this._disposables.push(
            this._view.webview.onDidReceiveMessage(message => {
                switch (message.type) {
                    case 'refreshExplain':
                        this.handleRefreshExplain();
                        break;
                    case 'exportExplain':
                        this.handleExportExplain();
                        break;
                }
            })
        );
    }

    private convertToExplainNode(explainResult: ExplainResult): ExplainNode {
        // Convert MySQL EXPLAIN result to our internal format
        return {
            id: explainResult.id.toString(),
            operation: explainResult.type,
            cost: explainResult.rows, // Use rows as cost proxy
            rows: explainResult.rows,
            severity: this.calculateSeverity(explainResult),
            children: explainResult.children ? explainResult.children.map(child => this.convertToExplainNode(child)) : [],
            suggestion: this.generateSuggestion(explainResult)
        };
    }

    private calculateSeverity(explainResult: ExplainResult): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
        // Determine severity based on operation type and row count
        if (explainResult.type === 'ALL' && explainResult.rows > 1000000) {
            return 'CRITICAL';
        }
        if (explainResult.type === 'ALL' && explainResult.rows > 100000) {
            return 'HIGH';
        }
        if (explainResult.type === 'ALL' || explainResult.extra?.includes('Using filesort')) {
            return 'MEDIUM';
        }
        return 'LOW';
    }

    private generateSuggestion(explainResult: ExplainResult): IndexSuggestion | undefined {
        // Generate optimization suggestions based on EXPLAIN result
        if (explainResult.type === 'ALL' && explainResult.table !== 'unknown') {
            return {
                type: 'ADD_INDEX',
                sql: `CREATE INDEX idx_${explainResult.table}_optimized ON ${explainResult.table} (column_name)`,
                description: 'Add index to avoid full table scan',
                impact: 'Expected 10-100x performance improvement'
            };
        }

        if (explainResult.extra?.includes('Using filesort')) {
            return {
                type: 'ADD_INDEX',
                sql: `CREATE INDEX idx_${explainResult.table}_sort ON ${explainResult.table} (sort_column)`,
                description: 'Add index to eliminate filesort',
                impact: 'Expected 2-5x performance improvement'
            };
        }

        return undefined;
    }

    private handleRefreshExplain(): void {
        this.logger.debug('EXPLAIN refresh requested');
        // TODO: Trigger EXPLAIN refresh from active connection
    }

    private handleExportExplain(): void {
        this.logger.debug('EXPLAIN export requested');
        // TODO: Export EXPLAIN plan as JSON or image
    }
}
