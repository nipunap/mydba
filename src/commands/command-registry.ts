import * as vscode from 'vscode';
import { ConnectionManager } from '../services/connection-manager';
import { AIServiceCoordinator } from '../services/ai-service-coordinator';
import { WebviewManager } from '../webviews/webview-manager';
import { Logger } from '../utils/logger';
import { ServiceContainer, SERVICE_TOKENS } from '../core/service-container';

export class CommandRegistry {
    constructor(
        private connectionManager: ConnectionManager,
        private aiServiceCoordinator: AIServiceCoordinator,
        private webviewManager: WebviewManager,
        private logger: Logger,
        private serviceContainer: ServiceContainer
    ) {}

    registerCommands(context: vscode.ExtensionContext, _treeViewProvider?: unknown): void {
        this.logger.info('Registering MyDBA commands...');

        // Connection commands
        context.subscriptions.push(
            vscode.commands.registerCommand('mydba.newConnection', () => this.newConnection()),
            vscode.commands.registerCommand('mydba.connect', (connectionId: string) => this.connect(connectionId)),
            vscode.commands.registerCommand('mydba.disconnect', (connectionId: string) => this.disconnect(connectionId)),
            vscode.commands.registerCommand('mydba.deleteConnection', (connectionId: string) => this.deleteConnection(connectionId)),
            vscode.commands.registerCommand('mydba.refresh', () => this.refresh())
        );

        // Query commands
        context.subscriptions.push(
            vscode.commands.registerCommand('mydba.analyzeQuery', () => this.analyzeQuery()),
            vscode.commands.registerCommand('mydba.explainQuery', () => this.explainQuery()),
            vscode.commands.registerCommand('mydba.profileQuery', () => this.profileQuery()),
            vscode.commands.registerCommand('mydba.executeQuery', (args: { query: string; connectionId: string }) => 
                this.executeQuery(args)),
            vscode.commands.registerCommand('mydba.copyToEditor', (sql: string) => this.copyToEditor(sql))
        );

        // AI commands
        context.subscriptions.push(
            vscode.commands.registerCommand('mydba.toggleAI', () => this.toggleAI())
        );

        // Tree view commands
        context.subscriptions.push(
            vscode.commands.registerCommand('mydba.showProcessList', (connectionId: string) => this.showProcessList(connectionId)),
            vscode.commands.registerCommand('mydba.showVariables', (connectionId: string) => this.showVariables(connectionId)),
            vscode.commands.registerCommand('mydba.showMetricsDashboard', (connectionId: string) => this.showMetricsDashboard(connectionId)),
            vscode.commands.registerCommand('mydba.showQueryEditor', (connectionId: string) => this.showQueryEditor(connectionId)),
            vscode.commands.registerCommand('mydba.showQueryHistory', () => this.showQueryHistory()),
            vscode.commands.registerCommand('mydba.showQueriesWithoutIndexes', (connectionId: string) => this.showQueriesWithoutIndexes(connectionId)),
            vscode.commands.registerCommand('mydba.showSlowQueries', (connectionId: string) => this.showSlowQueries(connectionId)),
            vscode.commands.registerCommand('mydba.previewTableData', (treeItem: { metadata?: { connectionId?: string; database?: string; table?: string } }) => {
                // Extract metadata from tree item
                const { connectionId, database, table } = treeItem.metadata || {};
                if (connectionId && database && table) {
                    this.previewTableData(connectionId, database, table);
                } else {
                    vscode.window.showErrorMessage('Unable to preview table data: missing metadata');
                }
            }),
            vscode.commands.registerCommand('mydba.showTableSchema', (connectionId: string, database: string, table: string) =>
                this.showTableSchema(connectionId, database, table)),
            vscode.commands.registerCommand('mydba.showIndexes', (connectionId: string, database: string, table: string) =>
                this.showIndexes(connectionId, database, table)),
            vscode.commands.registerCommand('mydba.generateSampleWorkload', () => this.generateSampleWorkload())
        );

        this.logger.info('MyDBA commands registered');
    }

    private async newConnection(): Promise<void> {
        try {
            this.logger.info('Opening connection dialog...');
            await this.webviewManager.showConnectionDialog();
        } catch (error) {
            this.logger.error('Failed to open connection dialog:', error as Error);
            vscode.window.showErrorMessage(`Failed to open connection dialog: ${(error as Error).message}`);
        }
    }

    private async connect(treeItemOrId: string | { id?: string }): Promise<void> {
        try {
            // Extract connection ID from tree item or use directly if string
            const connectionId = typeof treeItemOrId === 'string'
                ? treeItemOrId
                : treeItemOrId?.id?.replace('connection-', '') || String(treeItemOrId);

            this.logger.info(`Connecting to connection ID: ${connectionId}...`);
            await this.connectionManager.connect(connectionId);
            vscode.window.showInformationMessage('Connected successfully');
        } catch (error) {
            this.logger.error(`Failed to connect:`, error as Error);
            vscode.window.showErrorMessage(`Failed to connect: ${(error as Error).message}`);
        }
    }

    private async disconnect(treeItemOrId: string | { id?: string }): Promise<void> {
        try {
            // Extract connection ID from tree item or use directly if string
            const connectionId = typeof treeItemOrId === 'string'
                ? treeItemOrId
                : treeItemOrId?.id?.replace('connection-', '') || String(treeItemOrId);

            this.logger.info(`Disconnecting from connection ID: ${connectionId}...`);
            await this.connectionManager.disconnect(connectionId);
            vscode.window.showInformationMessage('Disconnected successfully');
        } catch (error) {
            this.logger.error(`Failed to disconnect:`, error as Error);
            vscode.window.showErrorMessage(`Failed to disconnect: ${(error as Error).message}`);
        }
    }

    private async deleteConnection(treeItemOrId: string | { id?: string }): Promise<void> {
        // Extract connection ID from tree item or use directly if string
        const connectionId = typeof treeItemOrId === 'string'
            ? treeItemOrId
            : treeItemOrId?.id?.replace('connection-', '') || String(treeItemOrId);

        const connection = this.connectionManager.getConnection(connectionId);
        if (!connection) {
            return;
        }

        const confirm = await vscode.window.showWarningMessage(
            `Are you sure you want to delete connection '${connection.name}'?`,
            'Delete',
            'Cancel'
        );

        if (confirm === 'Delete') {
            try {
                await this.connectionManager.deleteConnection(connectionId);
                vscode.window.showInformationMessage(`Connection '${connection.name}' deleted`);
            } catch (error) {
                this.logger.error(`Failed to delete connection:`, error as Error);
                vscode.window.showErrorMessage(`Failed to delete connection: ${(error as Error).message}`);
            }
        }
    }

    private refresh(): void {
        this.logger.info('Refreshing tree view...');
        vscode.commands.executeCommand('mydba.treeView.refresh');
    }

    private async analyzeQuery(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        const selection = editor.selection;
        const text = editor.document.getText(selection.isEmpty ? undefined : selection);

        if (!text.trim()) {
            vscode.window.showWarningMessage('No SQL query selected');
            return;
        }

        try {
            this.logger.info('Analyzing query with AI...');
            await this.aiServiceCoordinator.analyzeQuery({
                query: text,
                connectionId: 'current', // TODO: Get active connection
                context: {},
                options: { anonymize: true, includeSchema: true, includeDocs: true }
            });

            // TODO: Show analysis results in webview
            vscode.window.showInformationMessage('Query analysis completed');

        } catch (error) {
            this.logger.error('Failed to analyze query:', error as Error);
            vscode.window.showErrorMessage(`Failed to analyze query: ${(error as Error).message}`);
        }
    }

    private async explainQuery(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        const selection = editor.selection;
        const text = editor.document.getText(selection.isEmpty ? undefined : selection);

        if (!text.trim()) {
            vscode.window.showWarningMessage('No SQL query selected');
            return;
        }

        try {
            this.logger.info('Running EXPLAIN on query...');
            this.webviewManager.showExplainLoading();

            // TODO: Get active connection and run EXPLAIN
            // For now, show a mock EXPLAIN result
            const mockExplain = {
                id: 1,
                selectType: 'SIMPLE',
                table: 'users',
                type: 'ALL',
                rows: 1000000,
                extra: 'Using where'
            };

            this.webviewManager.updateExplain(mockExplain);
            vscode.window.showInformationMessage('EXPLAIN plan generated');

        } catch (error) {
            this.logger.error('Failed to explain query:', error as Error);
            this.webviewManager.showExplainError((error as Error).message);
            vscode.window.showErrorMessage(`Failed to explain query: ${(error as Error).message}`);
        }
    }

    private async profileQuery(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        const selection = editor.selection;
        const text = editor.document.getText(selection.isEmpty ? undefined : selection);

        if (!text.trim()) {
            vscode.window.showWarningMessage('No SQL query selected');
            return;
        }

        try {
            this.logger.info('Profiling query...');
            this.webviewManager.showProfileLoading();

            // TODO: Get active connection and run profiling
            // For now, show a mock profiling result
            const mockProfile = {
                totalDuration: 1250.5,
                stages: [
                    { Stage: 'starting', Duration: 0.1 },
                    { Stage: 'Opening tables', Duration: 0.2 },
                    { Stage: 'System lock', Duration: 0.1 },
                    { Stage: 'Table lock', Duration: 0.1 },
                    { Stage: 'init', Duration: 0.1 },
                    { Stage: 'optimizing', Duration: 0.1 },
                    { Stage: 'statistics', Duration: 0.1 },
                    { Stage: 'preparing', Duration: 0.1 },
                    { Stage: 'executing', Duration: 1249.0 },
                    { Stage: 'end', Duration: 0.1 },
                    { Stage: 'query end', Duration: 0.1 },
                    { Stage: 'closing tables', Duration: 0.1 },
                    { Stage: 'freeing items', Duration: 0.1 },
                    { Stage: 'logging slow query', Duration: 0.1 },
                    { Stage: 'cleaning up', Duration: 0.1 }
                ]
            };

            this.webviewManager.updateProfile(mockProfile);
            vscode.window.showInformationMessage('Query profiling completed');

        } catch (error) {
            this.logger.error('Failed to profile query:', error as Error);
            this.webviewManager.showProfileError((error as Error).message);
            vscode.window.showErrorMessage(`Failed to profile query: ${(error as Error).message}`);
        }
    }

    private async toggleAI(): Promise<void> {
        const isEnabled = this.aiServiceCoordinator.isEnabled();
        const newState = !isEnabled;

        // TODO: Update configuration
        vscode.window.showInformationMessage(`AI features ${newState ? 'enabled' : 'disabled'}`);
    }

    private async showProcessList(connectionId: string): Promise<void> {
        try {
            this.logger.info(`Opening process list for connection: ${connectionId}`);
            await this.webviewManager.showProcessList(connectionId);
        } catch (error) {
            this.logger.error('Failed to show process list:', error as Error);
            vscode.window.showErrorMessage(`Failed to show process list: ${(error as Error).message}`);
        }
    }

    private async showQueryHistory(): Promise<void> {
        try {
            this.logger.info('Opening query history...');
            const historyService = this.serviceContainer.get(SERVICE_TOKENS.QueryHistoryService);
            await this.webviewManager.showQueryHistory(historyService);
        } catch (error) {
            this.logger.error('Failed to show query history:', error as Error);
            vscode.window.showErrorMessage(`Failed to show query history: ${(error as Error).message}`);
        }
    }

    private async showVariables(connectionId: string): Promise<void> {
        try {
            this.logger.info(`Opening variables for connection: ${connectionId}`);
            await this.webviewManager.showVariables(connectionId);
        } catch (error) {
            this.logger.error('Failed to show variables:', error as Error);
            vscode.window.showErrorMessage(`Failed to show variables: ${(error as Error).message}`);
        }
    }

    private async showMetricsDashboard(connectionId: string): Promise<void> {
        try {
            this.logger.info(`Opening metrics dashboard for connection: ${connectionId}`);
            await this.webviewManager.showMetricsDashboard(connectionId);
        } catch (error) {
            this.logger.error('Failed to show metrics dashboard:', error as Error);
            vscode.window.showErrorMessage(`Failed to show metrics dashboard: ${(error as Error).message}`);
        }
    }

    private async showQueryEditor(connectionId: string): Promise<void> {
        try {
            this.logger.info(`Opening query editor for connection: ${connectionId}`);
            await this.webviewManager.showQueryEditor(connectionId);
        } catch (error) {
            this.logger.error('Failed to show query editor:', error as Error);
            vscode.window.showErrorMessage(`Failed to show query editor: ${(error as Error).message}`);
        }
    }

    private async previewTableData(connectionId: string, database: string, table: string): Promise<void> {
        try {
            this.logger.info(`Previewing data for table: ${database}.${table}`);
            const query = `SELECT * FROM \`${database}\`.\`${table}\` LIMIT 1000`;
            await this.webviewManager.showQueryEditor(connectionId, query);
        } catch (error) {
            this.logger.error('Failed to preview table data:', error as Error);
            vscode.window.showErrorMessage(`Failed to preview table data: ${(error as Error).message}`);
        }
    }

    private async showTableSchema(connectionId: string, database: string, table: string): Promise<void> {
        vscode.window.showInformationMessage(`Table schema for ${database}.${table} coming soon`);
    }

    private async showIndexes(connectionId: string, database: string, table: string): Promise<void> {
        vscode.window.showInformationMessage(`Indexes for ${database}.${table} coming soon`);
    }

    private async showQueriesWithoutIndexes(connectionId: string): Promise<void> {
        try {
            this.logger.info(`Opening queries without indexes for connection: ${connectionId}`);
            await this.webviewManager.showQueriesWithoutIndexes(connectionId);
        } catch (error) {
            this.logger.error('Failed to show queries without indexes:', error as Error);
            vscode.window.showErrorMessage(`Failed to show queries without indexes: ${(error as Error).message}`);
        }
    }

    private async showSlowQueries(connectionId: string): Promise<void> {
        try {
            this.logger.info(`Opening slow queries for connection: ${connectionId}`);
            await this.webviewManager.showSlowQueries(connectionId);
        } catch (error) {
            this.logger.error('Failed to show slow queries:', error as Error);
            vscode.window.showErrorMessage(`Failed to show slow queries: ${(error as Error).message}`);
        }
    }

    private async generateSampleWorkload(): Promise<void> {
        try {
            this.logger.info('Generating sample unindexed workload...');
            // Heuristic: use first connected connection
            interface ConnectionInfo { id: string; isConnected?: boolean }
            const connectionManager = this.connectionManager as { listConnections?: () => ConnectionInfo[] };
            const connections = connectionManager.listConnections?.() || [];
            const active = connections.find((c) => c.isConnected) || connections[0];
            if (!active) {
                vscode.window.showWarningMessage('No connection available');
                return;
            }
            const adapter = this.connectionManager.getAdapter(active.id);
            if (!adapter) {
                vscode.window.showWarningMessage('No active adapter found');
                return;
            }
            await adapter.query(`CREATE TEMPORARY TABLE IF NOT EXISTS tmp_workload (id INT PRIMARY KEY AUTO_INCREMENT, txt VARCHAR(255), n INT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
            const chunkSize = 500;
            for (let offset = 0; offset < 2000; offset += chunkSize) {
                const rows = Array.from({ length: Math.min(chunkSize, 2000 - offset) }, () => `('${Math.random().toString(36).substring(2, 12)}', ${Math.floor(Math.random()*1000)})`).join(',');
                await adapter.query(`INSERT INTO tmp_workload (txt, n) VALUES ${rows}`);
            }
            for (let i = 0; i < 20; i++) {
                await adapter.query(`SELECT * FROM tmp_workload WHERE txt='zzz-not-existing' OR n>${Math.floor(Math.random()*900)}`);
            }
            vscode.window.showInformationMessage('Sample workload generated using a temporary table.');
        } catch (error) {
            this.logger.error('Failed to generate sample workload:', error as Error);
            vscode.window.showErrorMessage(`Failed to generate workload: ${(error as Error).message}`);
        }
    }

    /**
     * Execute a SQL query from chat or other sources
     */
    private async executeQuery(args: { query: string; connectionId: string }): Promise<void> {
        try {
            const { query, connectionId } = args;

            this.logger.info(`Executing query from chat for connection: ${connectionId}`);

            // Get the adapter
            const adapter = this.connectionManager.getAdapter(connectionId);
            if (!adapter) {
                vscode.window.showErrorMessage('Database adapter not found for this connection');
                return;
            }

            // Execute the query
            const result = await adapter.query(query);

            // Show results
            if (Array.isArray(result) && result.length > 0) {
                // Has rows - show in a webview or output
                const rowCount = result.length;
                const message = `Query executed successfully. ${rowCount} row(s) returned.`;
                
                vscode.window.showInformationMessage(message, 'View Results').then(selection => {
                    if (selection === 'View Results') {
                        // TODO: Open results in a webview panel
                        this.logger.info('Opening query results in webview');
                    }
                });
            } else {
                // No rows (UPDATE, DELETE, etc.)
                vscode.window.showInformationMessage('Query executed successfully');
            }

        } catch (error) {
            this.logger.error('Failed to execute query:', error as Error);
            vscode.window.showErrorMessage(`Query execution failed: ${(error as Error).message}`);
        }
    }

    /**
     * Copy SQL to the editor
     */
    private async copyToEditor(sql: string): Promise<void> {
        try {
            this.logger.info('Copying SQL to editor');

            // Create a new untitled document with SQL language
            const document = await vscode.workspace.openTextDocument({
                language: 'sql',
                content: sql
            });

            // Show the document in the editor
            await vscode.window.showTextDocument(document);

            vscode.window.showInformationMessage('SQL copied to editor');

        } catch (error) {
            this.logger.error('Failed to copy SQL to editor:', error as Error);
            vscode.window.showErrorMessage(`Failed to copy to editor: ${(error as Error).message}`);
        }
    }
}
