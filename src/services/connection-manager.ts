/* eslint-disable @typescript-eslint/no-explicit-any */

import * as vscode from 'vscode';
import { SecretStorageService } from './secret-storage-service';
import { EventBus, EVENTS, Connection, ConnectionStateChange } from './event-bus';
import { Logger } from '../utils/logger';
import { AdapterRegistry } from '../adapters/adapter-registry';
import { MySQLAdapter } from '../adapters/mysql-adapter';
import { ConnectionConfig, ConnectionTestResult } from '../types';
import type { SSLConfig as _SSLConfig, SSHConfig as _SSHConfig, AWSIAMConfig as _AWSIAMConfig } from '../types';

// Re-export types for backward compatibility
export { ConnectionConfig, ConnectionTestResult };

export class ConnectionManager {
    private connections = new Map<string, Connection>();
    private connectionConfigs = new Map<string, ConnectionConfig>();
    private adapters = new Map<string, MySQLAdapter>();
    private readonly CONNECTIONS_KEY = 'mydba.connections';

    constructor(
        private context: vscode.ExtensionContext,
        private secretStorage: SecretStorageService,
        private eventBus: EventBus,
        private logger: Logger
    ) {}

    async addConnection(config: ConnectionConfig): Promise<Connection> {
        this.logger.info(`Adding connection: ${config.name}`);

        // Create connection object (without testing yet)
        const connection: Connection = {
            id: config.id,
            name: config.name,
            type: config.type,
            host: config.host,
            port: config.port,
            database: config.database,
            environment: config.environment,
            isConnected: false
        };

        // Store connection config (without password)
        await this.saveConnectionConfig(config);

        // Store password securely if provided (including empty string)
        if (config.password !== undefined) {
            await this.secretStorage.storeCredentials(config.id, {
                password: config.password
            });
        }

        // Add to connections map
        this.connections.set(config.id, connection);

        // Emit event
        await this.eventBus.emit(EVENTS.CONNECTION_ADDED, connection);

        this.logger.info(`Connection added: ${config.name}`);
        return connection;
    }

    async updateConnection(config: ConnectionConfig): Promise<Connection> {
        this.logger.info(`Updating connection: ${config.name}`);

        const connection = this.connections.get(config.id);
        if (!connection) {
            throw new Error(`Connection not found: ${config.id}`);
        }

        // Update connection object
        connection.name = config.name;
        connection.host = config.host;
        connection.port = config.port;
        connection.database = config.database;
        connection.environment = config.environment;

        // Update config
        await this.saveConnectionConfig(config);

        // Update password if provided (including empty string)
        if (config.password !== undefined) {
            await this.secretStorage.storeCredentials(config.id, {
                password: config.password
            });
        }

        // Emit event
        await this.eventBus.emit(EVENTS.CONNECTION_ADDED, connection);

        this.logger.info(`Connection updated: ${config.name}`);
        return connection;
    }

    async connect(connectionId: string): Promise<void> {
        const connection = this.connections.get(connectionId);
        if (!connection) {
            throw new Error(`Connection not found: ${connectionId}`);
        }

        this.logger.info(`Connecting to: ${connection.name}`);

        try {
            // Emit state change
            await this.eventBus.emit(EVENTS.CONNECTION_STATE_CHANGED, {
                connectionId,
                oldState: 'disconnected',
                newState: 'connecting'
            } as ConnectionStateChange);

            // Get connection config
            const config = this.getConnectionConfig(connectionId);
            if (!config) {
                throw new Error(`Connection config not found: ${connectionId}`);
            }

            // Retrieve password from secure storage (can be empty string)
            const credentials = await this.secretStorage.getCredentials(connectionId);
            if (credentials.password !== undefined) {
                config.password = credentials.password;
            }

            // Create adapter
            const adapterRegistry = new AdapterRegistry(this.logger);
            const adapter = adapterRegistry.create(config.type, config);

            // Connect
            await adapter.connect(config);

            // Store adapter
            this.adapters.set(connectionId, adapter);

            // Update connection state
            connection.isConnected = true;
            this.connections.set(connectionId, connection);

            // Emit state change
            await this.eventBus.emit(EVENTS.CONNECTION_STATE_CHANGED, {
                connectionId,
                oldState: 'connecting',
                newState: 'connected'
            } as ConnectionStateChange);

            this.logger.info(`Connected to: ${connection.name}`);

        } catch (error) {
            this.logger.error(`Failed to connect to ${connection.name}:`, error as Error);

            // Emit error state
            await this.eventBus.emit(EVENTS.CONNECTION_STATE_CHANGED, {
                connectionId,
                oldState: 'connecting',
                newState: 'error',
                error: error as Error
            } as ConnectionStateChange);

            throw error;
        }
    }

    async disconnect(connectionId: string): Promise<void> {
        const connection = this.connections.get(connectionId);
        if (!connection) {
            return;
        }

        this.logger.info(`Disconnecting from: ${connection.name}`);

        try {
            // Disconnect adapter
            const adapter = this.adapters.get(connectionId);
            if (adapter) {
                await adapter.disconnect();
                this.adapters.delete(connectionId);
            }

            // Update connection state
            connection.isConnected = false;
            this.connections.set(connectionId, connection);

            // Emit state change
            await this.eventBus.emit(EVENTS.CONNECTION_STATE_CHANGED, {
                connectionId,
                oldState: 'connected',
                newState: 'disconnected'
            } as ConnectionStateChange);

            this.logger.info(`Disconnected from: ${connection.name}`);

        } catch (error) {
            this.logger.error(`Error disconnecting from ${connection.name}:`, error as Error);
            throw error;
        }
    }

    async deleteConnection(connectionId: string): Promise<void> {
        const connection = this.connections.get(connectionId);
        if (!connection) {
            return;
        }

        this.logger.info(`Deleting connection: ${connection.name}`);

        // Disconnect if connected
        if (connection.isConnected) {
            await this.disconnect(connectionId);
        }

        // Remove from maps
        this.connections.delete(connectionId);
        this.adapters.delete(connectionId);

        // Delete credentials
        await this.secretStorage.deleteCredentials(connectionId);

        // Delete connection config
        await this.deleteConnectionConfig(connectionId);

        // Emit event
        await this.eventBus.emit(EVENTS.CONNECTION_REMOVED, connectionId);

        this.logger.info(`Connection deleted: ${connection.name}`);
    }

    async testConnection(config: ConnectionConfig): Promise<ConnectionTestResult> {
        try {
            this.logger.info(`Testing connection to ${config.host}:${config.port}`);

            // Create adapter
            const adapterRegistry = new AdapterRegistry(this.logger);
            const adapter = adapterRegistry.create(config.type, config);

            // Actually test the connection (don't save it)
            await adapter.connect(config);

            // Get version info if possible
            let version: string | undefined;
            try {
                const versionResult = await adapter.query('SELECT VERSION() as version');
                if (versionResult?.rows && versionResult.rows.length > 0) {
                    version = (versionResult.rows[0] as any).version;
                }
            } catch (versionError) {
                // Version query failed, but connection was successful
                this.logger.warn('Could not get database version:', versionError as Error);
            }

            // Disconnect immediately - this was just a test
            await adapter.disconnect();

            this.logger.info(`Connection test successful: ${config.host}:${config.port}`);
            return {
                success: true,
                version
            };

        } catch (error) {
            this.logger.error(`Connection test error:`, error as Error);
            return {
                success: false,
                error: (error as Error).message
            };
        }
    }

    getConnection(id: string): Connection | undefined {
        return this.connections.get(id);
    }

    getConnectionConfig(id: string): ConnectionConfig | undefined {
        return this.connectionConfigs.get(id);
    }

    listConnections(): Connection[] {
        return Array.from(this.connections.values());
    }

    getAdapter(connectionId: string): MySQLAdapter | undefined {
        return this.adapters.get(connectionId);
    }

    async loadConnections(): Promise<void> {
        try {
            this.logger.info('Loading saved connections...');

            const savedConnectionsJson = this.context.workspaceState.get<string[]>(this.CONNECTIONS_KEY);
            if (!savedConnectionsJson || savedConnectionsJson.length === 0) {
                this.logger.info('No saved connections found');
                return;
            }

            for (const connJson of savedConnectionsJson) {
                try {
                    const config: ConnectionConfig = JSON.parse(connJson);

                    // Create connection object (without connecting)
                    const connection: Connection = {
                        id: config.id,
                        name: config.name,
                        type: config.type,
                        host: config.host,
                        port: config.port,
                        database: config.database,
                        environment: config.environment,
                        isConnected: false
                    };

                    this.connections.set(connection.id, connection);
                    this.connectionConfigs.set(config.id, config);

                    await this.eventBus.emit(EVENTS.CONNECTION_ADDED, connection);

                    this.logger.debug(`Loaded connection: ${config.name}`);
                } catch (error) {
                    this.logger.error('Failed to load connection:', error as Error);
                }
            }

            this.logger.info(`Loaded ${this.connections.size} connections`);
        } catch (error) {
            this.logger.error('Failed to load connections:', error as Error);
        }
    }

    private async saveConnectionConfig(config: ConnectionConfig): Promise<void> {
        try {
            // Store in memory
            this.connectionConfigs.set(config.id, config);

            // Persist to workspace state
            await this.saveAllConnections();

            this.logger.debug(`Saved connection config: ${config.id}`);
        } catch (error) {
            this.logger.error('Failed to save connection config:', error as Error);
        }
    }

    private async saveAllConnections(): Promise<void> {
        const connectionsJson = Array.from(this.connectionConfigs.values()).map(config => {
            // Remove password before saving (stored separately in secret storage)
            const { password: _password, ...configWithoutPassword } = config as any;
            return JSON.stringify(configWithoutPassword);
        });

        await this.context.workspaceState.update(this.CONNECTIONS_KEY, connectionsJson);
    }

    private async deleteConnectionConfig(connectionId: string): Promise<void> {
        try {
            // Delete from memory
            this.connectionConfigs.delete(connectionId);

            // Update workspace state
            await this.saveAllConnections();

            this.logger.debug(`Deleted connection config: ${connectionId}`);
        } catch (error) {
            this.logger.error('Failed to delete connection config:', error as Error);
        }
    }

    async dispose(): Promise<void> {
        this.logger.info('Disposing connection manager...');

        // Disconnect all connections
        const connectionIds = Array.from(this.connections.keys());
        for (const connectionId of connectionIds) {
            try {
                await this.disconnect(connectionId);
            } catch (error) {
                this.logger.error(`Error disconnecting ${connectionId}:`, error as Error);
            }
        }

        this.connections.clear();
        this.adapters.clear();

        this.logger.info('Connection manager disposed');
    }
}
