import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { ConnectionManager } from '../services/connection-manager';

interface ExplainNode {
    id: string;
    type: string;
    table?: string;
    accessType?: string;
    possibleKeys?: string[];
    key?: string;
    rows?: number;
    filtered?: number;
    cost?: number;
    children?: ExplainNode[];
    issues?: string[];
    severity?: 'good' | 'warning' | 'critical';
}

interface TableColumn {
    name: string;
    type: string;
    nullable: boolean;
    key: string;
    default: string | null;
    extra: string;
}

interface IndexStatistics {
    name: string;
    columns: string[];
    unique: boolean;
    type: string;
    cardinality: number;
    columnCardinalities: Map<string, number>;
}

interface TableMetadata {
    schema: TableColumn[];
    indexes: IndexStatistics[];
}

export class ExplainViewerPanel {
    private static panelRegistry: Map<string, ExplainViewerPanel> = new Map();
    private readonly panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];
    private tableMetadataCache: Map<string, TableMetadata> = new Map();

    private constructor(
        panel: vscode.WebviewPanel,
        private context: vscode.ExtensionContext,
        private logger: Logger,
        private connectionManager: ConnectionManager,
        private connectionId: string,
        private query: string,
        private explainData: any
    ) {
        this.panel = panel;
        this.panel.webview.html = this.getHtml();
        this.setupMessageHandlers();
        this.processAndSendExplainData();
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    }

    public static show(
        context: vscode.ExtensionContext,
        logger: Logger,
        connectionManager: ConnectionManager,
        connectionId: string,
        query: string,
        explainData: any
    ): void {
        const panelKey = `explainViewer-${connectionId}-${Date.now()}`;
        const connection = connectionManager.getConnection(connectionId);

        if (!connection) {
            vscode.window.showErrorMessage('Connection not found');
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'mydbaExplainViewer',
            `EXPLAIN - ${connection.name}`,
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'media'),
                    vscode.Uri.joinPath(context.extensionUri, 'node_modules', 'd3'),
                    vscode.Uri.joinPath(context.extensionUri, 'node_modules', '@vscode/webview-ui-toolkit')
                ]
            }
        );

        const explainViewerPanel = new ExplainViewerPanel(
            panel,
            context,
            logger,
            connectionManager,
            connectionId,
            query,
            explainData
        );
        ExplainViewerPanel.panelRegistry.set(panelKey, explainViewerPanel);
    }

    private async processAndSendExplainData(): Promise<void> {
        try {
            // Parse the EXPLAIN JSON
            let explainJson = this.explainData;

            // Handle case where EXPLAIN is wrapped in an object
            if (explainJson.EXPLAIN) {
                explainJson = JSON.parse(explainJson.EXPLAIN);
            }

            // Check if this is a Performance Schema or system table query (no EXPLAIN available)
            if (!explainJson || !explainJson.query_block) {
                this.panel.webview.postMessage({
                    type: 'error',
                    message: 'EXPLAIN is not available for Performance Schema or system tables. Please try with a regular user table query.'
                });
                return;
            }

            // Extract table names and fetch metadata
            const tableNames = this.extractTableNames(explainJson);
            await this.fetchTableMetadata(tableNames);

            // Convert to tree structure with enhanced analysis
            const treeData = this.convertToTree(explainJson);

            // Send to webview
            this.panel.webview.postMessage({
                type: 'explainData',
                data: treeData,
                query: this.query,
                rawJson: explainJson
            });
        } catch (error) {
            this.logger.error('Failed to process EXPLAIN data:', error as Error);
            this.panel.webview.postMessage({
                type: 'error',
                message: `Failed to process EXPLAIN data: ${(error as Error).message}`
            });
        }
    }

    private convertToTree(explainJson: any): ExplainNode {
        const queryBlock = explainJson.query_block || explainJson;
        return this.processQueryBlock(queryBlock, 'root');
    }

    private processQueryBlock(block: any, id: string): ExplainNode {
        const node: ExplainNode = {
            id,
            type: block.select_id ? `SELECT #${block.select_id}` : 'Query',
            cost: block.cost_info?.query_cost ? parseFloat(block.cost_info.query_cost) : undefined,
            children: []
        };

        // Analyze cost
        if (node.cost && typeof node.cost === 'number' && !isNaN(node.cost)) {
            if (node.cost > 10000) {
                node.severity = 'critical';
                node.issues = node.issues || [];
                node.issues.push(`Very high query cost: ${node.cost.toFixed(2)}`);
            } else if (node.cost > 1000) {
                node.severity = 'warning';
                node.issues = node.issues || [];
                node.issues.push(`High query cost: ${node.cost.toFixed(2)}`);
            } else {
                node.severity = 'good';
            }
        }

        // Process table
        if (block.table) {
            const tableNode = this.processTable(block.table, `${id}-table`);
            node.children!.push(tableNode);
        }

        // Process nested tables
        if (block.nested_loop && Array.isArray(block.nested_loop)) {
            block.nested_loop.forEach((nestedTable: any, index: number) => {
                if (nestedTable.table) {
                    const nestedNode = this.processTable(nestedTable.table, `${id}-nested-${index}`);
                    node.children!.push(nestedNode);
                }
            });
        }

        // Process grouping_operation
        if (block.grouping_operation) {
            const groupNode: ExplainNode = {
                id: `${id}-grouping`,
                type: 'GROUP BY',
                children: []
            };
            if (block.grouping_operation.table) {
                groupNode.children!.push(this.processTable(block.grouping_operation.table, `${id}-grouping-table`));
            }
            node.children!.push(groupNode);
        }

        // Process ordering_operation
        if (block.ordering_operation) {
            const orderNode: ExplainNode = {
                id: `${id}-ordering`,
                type: 'ORDER BY',
                children: []
            };
            if (block.ordering_operation.table) {
                orderNode.children!.push(this.processTable(block.ordering_operation.table, `${id}-ordering-table`));
            }
            node.children!.push(orderNode);
        }

        return node;
    }

    private processTable(table: any, id: string): ExplainNode {
        const node: ExplainNode = {
            id,
            type: 'Table Access',
            table: table.table_name,
            accessType: table.access_type,
            possibleKeys: table.possible_keys,
            key: table.key,
            rows: table.rows_examined_per_scan,
            filtered: table.filtered,
            cost: table.cost_info?.read_cost ? parseFloat(table.cost_info.read_cost) : undefined,
            issues: []
        };

        // Analyze access type and identify issues
        this.analyzeTableAccess(node, table);

        return node;
    }

    private extractTableNames(explainJson: any): Set<string> {
        const tables = new Set<string>();

        const extractFromBlock = (block: any) => {
            if (block.table?.table_name) {
                tables.add(block.table.table_name);
            }

            if (block.nested_loop && Array.isArray(block.nested_loop)) {
                block.nested_loop.forEach((nested: any) => {
                    if (nested.table?.table_name) {
                        tables.add(nested.table.table_name);
                    }
                });
            }

            if (block.grouping_operation?.table?.table_name) {
                tables.add(block.grouping_operation.table.table_name);
            }

            if (block.ordering_operation?.table?.table_name) {
                tables.add(block.ordering_operation.table.table_name);
            }
        };

        const queryBlock = explainJson.query_block || explainJson;
        extractFromBlock(queryBlock);

        return tables;
    }

    private async fetchTableMetadata(tableNames: Set<string>): Promise<void> {
        const adapter = this.connectionManager.getAdapter(this.connectionId);
        if (!adapter) {
            this.logger.warn('Adapter not found, skipping metadata fetch');
            return;
        }

        // Extract database name from the query if present
        const dbMatch = this.query.match(/FROM\s+`?(\w+)`?\.`?(\w+)`?/i);
        const database = dbMatch ? dbMatch[1] : null;

        for (const tableName of tableNames) {
            try {
                // Fetch table schema - qualify with database if available
                const schemaQuery = database
                    ? `DESCRIBE \`${database}\`.\`${tableName}\``
                    : `DESCRIBE \`${tableName}\``;
                const schemaResult = await adapter.query<any>(schemaQuery);

                const schema: TableColumn[] = (schemaResult.rows || []).map((row: any) => ({
                    name: row.Field,
                    type: row.Type,
                    nullable: row.Null === 'YES',
                    key: row.Key,
                    default: row.Default,
                    extra: row.Extra
                }));

                // Fetch index statistics - qualify with database if available
                const indexQuery = database
                    ? `SHOW INDEX FROM \`${database}\`.\`${tableName}\``
                    : `SHOW INDEX FROM \`${tableName}\``;
                const indexResult = await adapter.query<any>(indexQuery);

                const indexMap = new Map<string, {
                    columns: string[];
                    unique: boolean;
                    type: string;
                    cardinality: number;
                    columnCardinalities: Map<string, number>;
                }>();

                (indexResult.rows || []).forEach((row: any) => {
                    const indexName = row.Key_name;
                    if (!indexMap.has(indexName)) {
                        indexMap.set(indexName, {
                            columns: [],
                            unique: row.Non_unique === 0,
                            type: row.Index_type,
                            cardinality: row.Cardinality || 0,
                            columnCardinalities: new Map()
                        });
                    }
                    const index = indexMap.get(indexName)!;
                    index.columns.push(row.Column_name);
                    index.columnCardinalities.set(row.Column_name, row.Cardinality || 0);
                });

                const indexes: IndexStatistics[] = Array.from(indexMap.entries()).map(([name, data]) => ({
                    name,
                    ...data
                }));

                this.tableMetadataCache.set(tableName, { schema, indexes });
                this.logger.info(`Fetched metadata for table: ${tableName}`);
            } catch (error) {
                this.logger.error(`Failed to fetch metadata for table ${tableName}:`, error as Error);
            }
        }
    }

    private analyzeTableAccess(node: ExplainNode, table: any): void {
        const accessType = node.accessType?.toLowerCase();
        const tableName = node.table;
        const metadata = tableName ? this.tableMetadataCache.get(tableName) : undefined;

        // Critical issues
        if (accessType === 'all') {
            node.severity = 'critical';
            node.issues!.push('⚠️ FULL TABLE SCAN - No index used');

            // Enhanced suggestion using table metadata
            if (metadata) {
                const suggestedColumns = this.suggestIndexColumns(table, metadata);
                if (suggestedColumns.length > 0) {
                    node.issues!.push(`💡 Consider creating an index: CREATE INDEX idx_${tableName}_${suggestedColumns.join('_')} ON \`${tableName}\` (${suggestedColumns.map(c => `\`${c}\``).join(', ')})`);
                } else {
                    node.issues!.push(`💡 Consider adding an index on the WHERE clause columns`);
                }
            } else {
                node.issues!.push(`💡 Consider adding an index on the WHERE clause columns`);
            }
        } else if (accessType === 'index') {
            node.severity = 'warning';
            node.issues!.push('⚠️ FULL INDEX SCAN - All rows in index examined');

            if (metadata && node.key) {
                const indexInfo = metadata.indexes.find(idx => idx.name === node.key);
                if (indexInfo) {
                    node.issues!.push(`💡 Index '${node.key}' covers columns: ${indexInfo.columns.join(', ')} (cardinality: ${indexInfo.cardinality.toLocaleString()})`);

                    // Check if index selectivity is poor
                    const selectivity = indexInfo.cardinality / (node.rows || 1);
                    if (selectivity < 0.1) {
                        node.issues!.push(`⚠️ Low index selectivity (${(selectivity * 100).toFixed(1)}%) - consider adding more columns to the index`);
                    }
                }
            }
        } else if (accessType === 'range') {
            node.severity = node.rows && node.rows > 1000 ? 'warning' : 'good';
            if (node.rows && node.rows > 1000) {
                node.issues!.push(`⚠️ Range scan examining ${node.rows} rows`);

                if (metadata && node.key) {
                    const indexInfo = metadata.indexes.find(idx => idx.name === node.key);
                    if (indexInfo) {
                        node.issues!.push(`💡 Using index '${node.key}' on ${indexInfo.columns.join(', ')}`);
                        node.issues!.push(`💡 Consider adding more selective columns or refining the WHERE conditions`);
                    }
                }
            }
        } else if (accessType === 'ref' || accessType === 'eq_ref' || accessType === 'const') {
            node.severity = 'good';

            if (metadata && node.key) {
                const indexInfo = metadata.indexes.find(idx => idx.name === node.key);
                if (indexInfo) {
                    node.issues!.push(`✅ Efficient ${accessType} lookup using index '${node.key}' (${indexInfo.columns.join(', ')})`);
                }
            }
        }

        // Check for possible keys but no key used
        if (node.possibleKeys && node.possibleKeys.length > 0 && !node.key) {
            node.severity = node.severity === 'critical' ? 'critical' : 'warning';
            node.issues!.push(`⚠️ Possible indexes available but not used: ${node.possibleKeys.join(', ')}`);

            if (metadata) {
                // Analyze why indexes weren't used
                node.possibleKeys.forEach(keyName => {
                    const indexInfo = metadata.indexes.find(idx => idx.name === keyName);
                    if (indexInfo) {
                        const selectivity = indexInfo.cardinality / (node.rows || 1);
                        if (selectivity < 0.3) {
                            node.issues!.push(`💡 Index '${keyName}' has low selectivity (${(selectivity * 100).toFixed(1)}%) - optimizer chose table scan instead`);
                        } else {
                            node.issues!.push(`💡 Index '${keyName}' covers: ${indexInfo.columns.join(', ')} - consider forcing it with USE INDEX`);
                        }
                    }
                });
            }
        }

        // Check filtered percentage
        if (node.filtered !== undefined && node.filtered < 10) {
            node.severity = node.severity === 'critical' ? 'critical' : 'warning';
            node.issues!.push(`⚠️ Only ${node.filtered}% of rows match the condition`);

            if (metadata && node.rows) {
                const estimatedMatches = Math.floor((node.rows * node.filtered) / 100);
                node.issues!.push(`💡 Estimated ${estimatedMatches.toLocaleString()} rows will match after filtering`);

                // Suggest covering index if possible
                const suggestedColumns = this.suggestIndexColumns(table, metadata);
                if (suggestedColumns.length > 0 && !node.key) {
                    node.issues!.push(`💡 A composite index on (${suggestedColumns.join(', ')}) might improve filtering`);
                }
            }
        }

        // Check high row count
        if (node.rows && node.rows > 10000) {
            node.severity = node.severity === 'critical' ? 'critical' : 'warning';
            node.issues!.push(`⚠️ Examining ${node.rows.toLocaleString()} rows`);

            if (metadata) {
                // Calculate table size impact
                const totalTableSize = metadata.schema.length * node.rows;
                node.issues!.push(`💡 Table has ${metadata.schema.length} columns - consider selecting only needed columns`);

                // Suggest partitioning for very large tables
                if (node.rows > 1000000) {
                    node.issues!.push(`💡 Consider table partitioning for tables with ${(node.rows / 1000000).toFixed(1)}M+ rows`);
                }
            }
        }

        // Good patterns
        if (node.key && node.rows && node.rows < 100) {
            if (!node.issues || node.issues.length === 0) {
                node.issues = node.issues || [];
                if (metadata) {
                    const indexInfo = metadata.indexes.find(idx => idx.name === node.key);
                    if (indexInfo) {
                        node.issues.push(`✅ Highly efficient: Using index '${node.key}' to access only ${node.rows} rows`);
                    } else {
                        node.issues.push(`✅ Efficient index usage: ${node.key}`);
                    }
                } else {
                    node.issues.push(`✅ Efficient index usage: ${node.key}`);
                }
            }
        }

        // Check for missing indexes on foreign key columns
        if (metadata && accessType === 'all') {
            const fkColumns = metadata.schema.filter(col => col.key === 'MUL');
            if (fkColumns.length > 0) {
                const unindexedFKs = fkColumns.filter(col => {
                    return !metadata.indexes.some(idx => idx.columns[0] === col.name);
                });
                if (unindexedFKs.length > 0) {
                    node.issues!.push(`⚠️ Foreign key columns without indexes: ${unindexedFKs.map(c => c.name).join(', ')}`);
                }
            }
        }
    }

    private suggestIndexColumns(table: any, metadata: TableMetadata): string[] {
        const suggestions: string[] = [];

        // Look for conditions in attached_condition or used_columns
        if (table.attached_condition) {
            // Parse condition to extract column names (basic heuristic)
            const condition = String(table.attached_condition);
            metadata.schema.forEach(col => {
                if (condition.includes(col.name) && !suggestions.includes(col.name)) {
                    suggestions.push(col.name);
                }
            });
        }

        // Limit to 3 columns for composite index suggestion
        return suggestions.slice(0, 3);
    }

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
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

        const d3Uri = this.panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', 'd3', 'dist', 'd3.min.js')
        );

        const scriptUri = this.panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'explainViewerView.js')
        );

        const styleUri = this.panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'explainViewerView.css')
        );

        const nonce = this.getNonce();
        const cacheBuster = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${this.panel.webview.cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUri}?v=${cacheBuster}" rel="stylesheet">
    <title>EXPLAIN Visualization</title>
</head>
<body>
    <div class="container">
        <div class="toolbar">
            <div class="toolbar-left">
                <h2>Query Execution Plan</h2>
            </div>
            <div class="toolbar-actions">
                <vscode-text-field id="search-input" placeholder="Search in plan..." style="width: 200px;">
                    <span slot="start" class="codicon codicon-search"></span>
                </vscode-text-field>
                <vscode-button id="toggle-view" appearance="secondary">
                    <span class="codicon codicon-layout"></span>
                    Toggle View
                </vscode-button>
                <vscode-button id="expand-all" appearance="secondary">
                    <span class="codicon codicon-expand-all"></span>
                    Expand All
                </vscode-button>
                <vscode-button id="collapse-all" appearance="secondary">
                    <span class="codicon codicon-collapse-all"></span>
                    Collapse All
                </vscode-button>
                <vscode-dropdown id="export-dropdown">
                    <span slot="indicator">Export</span>
                    <vscode-option value="png">Export as PNG</vscode-option>
                    <vscode-option value="svg">Export as SVG</vscode-option>
                    <vscode-option value="json">Export as JSON</vscode-option>
                </vscode-dropdown>
            </div>
        </div>

        <div id="loading" class="loading">
            <vscode-progress-ring></vscode-progress-ring>
            <span>Processing query execution plan...</span>
        </div>

        <div id="error" class="error" style="display: none;">
            <span class="codicon codicon-error"></span>
            <div>
                <h3>Error</h3>
                <p id="error-message"></p>
            </div>
        </div>

        <div id="content" style="display: none;">
            <div class="query-section">
                <h3>Query</h3>
                <pre id="query-text"></pre>
            </div>

            <div class="visualization-container">
                <div id="tree-view" class="view-panel">
                    <h3>Visual Execution Plan</h3>
                    <div id="tree-diagram"></div>
                </div>

                <div id="table-view" class="view-panel" style="display: none;">
                    <h3>Detailed Analysis</h3>
                    <div id="table-content"></div>
                </div>
            </div>

            <details class="raw-json-section">
                <summary>Raw EXPLAIN JSON</summary>
                <pre id="raw-json"></pre>
            </details>
        </div>
    </div>

    <script type="module" nonce="${nonce}" src="${toolkitUri}"></script>
    <script nonce="${nonce}" src="${d3Uri}"></script>
    <script nonce="${nonce}" src="${scriptUri}?v=${cacheBuster}"></script>
</body>
</html>`;
    }

    private setupMessageHandlers(): void {
        this.panel.webview.onDidReceiveMessage(
            async (message: any) => {
                switch (message.type) {
                    case 'export':
                        await this.handleExport(message.format, message.data as ExplainNode, message.rawJson as unknown);
                        break;
                    case 'log':
                        this.logger.debug(message.message as string);
                        break;
                }
            },
            null,
            this.disposables
        );
    }

    private async handleExport(format: 'png' | 'svg' | 'json', data?: ExplainNode, rawJson?: unknown): Promise<void> {
        this.logger.info(`Exporting EXPLAIN plan as ${format}`);

        try {
            const fileName = `explain-plan-${Date.now()}.${format}`;

            if (format === 'json') {
                // Security: Validate data exists before export
                const jsonData = rawJson || this.explainData;
                if (!jsonData) {
                    vscode.window.showErrorMessage('No data available for export');
                    return;
                }

                const content = JSON.stringify(jsonData, null, 2);

                // Security: Limit export size to prevent DOS
                const MAX_EXPORT_SIZE = 10 * 1024 * 1024; // 10MB
                if (content.length > MAX_EXPORT_SIZE) {
                    vscode.window.showErrorMessage(
                        `Export data too large (${(content.length / 1024 / 1024).toFixed(2)}MB). Maximum allowed: ${MAX_EXPORT_SIZE / 1024 / 1024}MB`
                    );
                    return;
                }

                const uri = await vscode.window.showSaveDialog({
                    defaultUri: vscode.Uri.file(fileName),
                    filters: {
                        'JSON': ['json']
                    }
                });

                if (uri) {
                    const encoder = new TextEncoder();
                    await vscode.workspace.fs.writeFile(uri, encoder.encode(content));
                    vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`);
                }
            } else if (format === 'png' || format === 'svg') {
                // For PNG/SVG export, we'll need to capture the SVG from the webview
                // This would require html2canvas for PNG
                this.panel.webview.postMessage({
                    type: 'exportRequest',
                    format: format
                });
                vscode.window.showInformationMessage(`Export to ${format.toUpperCase()} initiated.`);
            }
        } catch (error) {
            this.logger.error('Failed to export:', error as Error);
            vscode.window.showErrorMessage(`Failed to export: ${(error as Error).message}`);
        }
    }

    dispose(): void {
        this.panel.dispose();
        const key = Array.from(ExplainViewerPanel.panelRegistry.entries())
            .find(([, panel]) => panel === this)?.[0];
        if (key) {
            ExplainViewerPanel.panelRegistry.delete(key);
        }
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
