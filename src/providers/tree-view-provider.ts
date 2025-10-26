import * as vscode from 'vscode';
import { ConnectionManager } from '../services/connection-manager';
import { EventBus, EVENTS, Connection } from '../services/event-bus';
import { Logger } from '../utils/logger';

export interface TreeItem {
    id: string;
    label: string;
    iconPath?: vscode.ThemeIcon;
    contextValue?: string;
    collapsibleState?: vscode.TreeItemCollapsibleState;
    children?: TreeItem[];
    command?: vscode.Command;
}

export class TreeViewProvider implements vscode.TreeDataProvider<TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | null | void> = new vscode.EventEmitter<TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(
        private connectionManager: ConnectionManager,
        private eventBus: EventBus,
        private logger: Logger
    ) {
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        // Listen for connection events
        this.eventBus.on(EVENTS.CONNECTION_ADDED, () => {
            this.refresh();
        });

        this.eventBus.on(EVENTS.CONNECTION_REMOVED, () => {
            this.refresh();
        });

        this.eventBus.on(EVENTS.CONNECTION_STATE_CHANGED, () => {
            this.refresh();
        });
    }

    getTreeItem(element: TreeItem): vscode.TreeItem {
        const treeItem = new vscode.TreeItem(
            element.label,
            element.collapsibleState ?? vscode.TreeItemCollapsibleState.None
        );

        treeItem.id = element.id;
        treeItem.iconPath = element.iconPath;
        treeItem.contextValue = element.contextValue;
        treeItem.command = element.command;

        return treeItem;
    }

    getChildren(element?: TreeItem): Thenable<TreeItem[]> {
        if (!element) {
            return this.getRootItems();
        }

        return this.getChildItems(element);
    }

    private async getRootItems(): Promise<TreeItem[]> {
        const connections = this.connectionManager.listConnections();

        if (connections.length === 0) {
            return [{
                id: 'no-connections',
                label: 'No connections',
                iconPath: new vscode.ThemeIcon('info'),
                contextValue: 'no-connections',
                command: {
                    command: 'mydba.newConnection',
                    title: 'New Connection'
                }
            }];
        }

        return connections.map(connection => ({
            id: `connection-${connection.id}`,
            label: `${connection.name} (${connection.host}:${connection.port})`,
            iconPath: new vscode.ThemeIcon(
                connection.isConnected ? 'database' : 'database-disconnected',
                connection.isConnected ? undefined : new vscode.ThemeColor('disabledForeground')
            ),
            contextValue: connection.isConnected ? 'connected' : 'connection',
            collapsibleState: connection.isConnected ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
            children: connection.isConnected ? [] : undefined
        }));
    }

    private async getConnectionChildren(connection: Connection): Promise<TreeItem[]> {
        const adapter = this.connectionManager.getAdapter(connection.id);
        if (!adapter) {
            return [];
        }

        try {
            const databases = await adapter.getDatabases();

            const items: TreeItem[] = [];

            // Add Query Editor option
            items.push({
                id: `queryeditor-${connection.id}`,
                label: 'Query Editor',
                iconPath: new vscode.ThemeIcon('edit'),
                contextValue: 'queryeditor',
                command: {
                    command: 'mydba.showQueryEditor',
                    title: 'Open Query Editor',
                    arguments: [connection.id]
                }
            });

            // Add monitoring items (open as webview editors)
            items.push({
                id: `metrics-${connection.id}`,
                label: 'Metrics Dashboard',
                iconPath: new vscode.ThemeIcon('dashboard'),
                contextValue: 'metrics',
                command: {
                    command: 'mydba.showMetricsDashboard',
                    title: 'Show Metrics Dashboard',
                    arguments: [connection.id]
                }
            });

            items.push({
                id: `processlist-${connection.id}`,
                label: 'Process List',
                iconPath: new vscode.ThemeIcon('pulse'),
                contextValue: 'processlist',
                command: {
                    command: 'mydba.showProcessList',
                    title: 'Show Process List',
                    arguments: [connection.id]
                }
            });

            items.push({
                id: `variables-${connection.id}`,
                label: 'Variables',
                iconPath: new vscode.ThemeIcon('settings-gear'),
                contextValue: 'variables',
                command: {
                    command: 'mydba.showVariables',
                    title: 'Show Variables',
                    arguments: [connection.id]
                }
            });

            // Add performance monitoring items
            items.push({
                id: `queries-no-indexes-${connection.id}`,
                label: 'Queries Without Indexes',
                iconPath: new vscode.ThemeIcon('warning'),
                contextValue: 'queries-no-indexes',
                command: {
                    command: 'mydba.showQueriesWithoutIndexes',
                    title: 'Show Queries Without Indexes',
                    arguments: [connection.id]
                }
            });

            items.push({
                id: `slow-queries-${connection.id}`,
                label: 'Slow Queries',
                iconPath: new vscode.ThemeIcon('watch'),
                contextValue: 'slow-queries',
                command: {
                    command: 'mydba.showSlowQueries',
                    title: 'Show Slow Queries',
                    arguments: [connection.id]
                }
            });

            // Add database nodes
            databases.forEach((db: any) => {
                items.push({
                    id: `database-${connection.id}-${db.name}`,
                    label: db.name,
                    iconPath: new vscode.ThemeIcon('database'),
                    contextValue: 'database',
                    collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                    children: [] // Will be loaded on expand
                });
            });

            return items;
        } catch (error) {
            this.logger.error(`Failed to load connection children for ${connection.name}:`, error as Error);
            return [{
                id: `error-${connection.id}`,
                label: 'Error loading data',
                iconPath: new vscode.ThemeIcon('error'),
                contextValue: 'error'
            }];
        }
    }

    private async getChildItems(element: TreeItem): Promise<TreeItem[]> {
        // Handle connection expansion
        if (element.id.startsWith('connection-')) {
            const connectionId = element.id.replace('connection-', '');
            const connection = this.connectionManager.getConnection(connectionId);
            if (connection) {
                return this.getConnectionChildren(connection);
            }
        }

        // Handle database expansion
        if (element.id.startsWith('database-')) {
            return this.getDatabaseChildren(element);
        }

        // Return pre-loaded children or empty array
        return element.children || [];
    }

    private async getDatabaseChildren(element: TreeItem): Promise<TreeItem[]> {
        // Extract connection ID and database name from element ID
        const parts = element.id.split('-');
        const connectionId = parts[1];
        const databaseName = parts.slice(2).join('-');

        const adapter = this.connectionManager.getAdapter(connectionId);
        if (!adapter) {
            return [];
        }

        try {
            const tables = await adapter.getTables(databaseName);

            return tables.map((table: any) => ({
                id: `table-${connectionId}-${databaseName}-${table.name}`,
                label: `${table.name} (${table.rows || 0} rows)`,
                iconPath: new vscode.ThemeIcon('table'),
                contextValue: 'table',
                collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                // Store metadata for context menu commands
                metadata: {
                    connectionId,
                    database: databaseName,
                    table: table.name
                },
                children: [
                    {
                        id: `columns-${connectionId}-${databaseName}-${table.name}`,
                        label: 'Columns',
                        iconPath: new vscode.ThemeIcon('symbol-field'),
                        contextValue: 'columns',
                        command: {
                            command: 'mydba.showTableSchema',
                            title: 'Show Table Schema',
                            arguments: [connectionId, databaseName, table.name]
                        }
                    },
                    {
                        id: `indexes-${connectionId}-${databaseName}-${table.name}`,
                        label: 'Indexes',
                        iconPath: new vscode.ThemeIcon('symbol-key'),
                        contextValue: 'indexes',
                        command: {
                            command: 'mydba.showIndexes',
                            title: 'Show Indexes',
                            arguments: [connectionId, databaseName, table.name]
                        }
                    }
                ]
            }));
        } catch (error) {
            this.logger.error(`Failed to load database children for ${databaseName}:`, error as Error);
            return [{
                id: `error-${element.id}`,
                label: 'Error loading tables',
                iconPath: new vscode.ThemeIcon('error'),
                contextValue: 'error'
            }];
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}
