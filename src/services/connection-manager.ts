
import * as vscode from 'vscode';
import { SecretStorageService } from './secret-storage-service';
import { EventBus, EVENTS, Connection, ConnectionStateChange } from './event-bus';
import { Logger } from '../utils/logger';
import { AdapterRegistry } from '../adapters/adapter-registry';
import { MySQLAdapter } from '../adapters/mysql-adapter';
import { ConnectionConfig, ConnectionTestResult } from '../types';
import type { SSLConfig as _SSLConfig, SSHConfig as _SSHConfig, AWSIAMConfig as _AWSIAMConfig } from '../types';
import { CacheManager, CacheKeyBuilder } from '../core/cache-manager';
import { AuditLogger } from './audit-logger';
import { SSHTunnelService } from './ssh-tunnel-service';
import { AWSIAMAuthService } from './aws-iam-auth-service';
import { AWSRDSDiscoveryService } from './aws-rds-discovery-service';

// Re-export types for backward compatibility
export { ConnectionConfig, ConnectionTestResult };

export class ConnectionManager {
    private connections = new Map<string, Connection>();
    private connectionConfigs = new Map<string, ConnectionConfig>();
    private adapters = new Map<string, MySQLAdapter>();
    private readonly CONNECTIONS_KEY = 'mydba.connections';
    private adapterRegistry: AdapterRegistry;
    private sshTunnelService: SSHTunnelService;
    private awsIamAuthService: AWSIAMAuthService;
    private awsRdsDiscoveryService: AWSRDSDiscoveryService;

    constructor(
        private context: vscode.ExtensionContext,
        private secretStorage: SecretStorageService,
        private eventBus: EventBus,
        private logger: Logger,
        private cache?: CacheManager,
        private auditLogger?: AuditLogger
    ) {
        // Initialize adapter registry with EventBus and AuditLogger
        this.adapterRegistry = new AdapterRegistry(this.logger, this.eventBus, this.auditLogger);

        // Initialize SSH tunnel service
        this.sshTunnelService = new SSHTunnelService(this.logger);

        // Initialize AWS IAM auth service
        this.awsIamAuthService = new AWSIAMAuthService(this.logger);

        // Initialize AWS RDS discovery service
        this.awsRdsDiscoveryService = new AWSRDSDiscoveryService(this.logger);

        // Set up cache invalidation listener if cache is provided
        if (this.cache) {
            this.eventBus.on(EVENTS.CONNECTION_STATE_CHANGED, async (data: ConnectionStateChange) => {
                // Invalidate cache when connection state changes
                if (data.newState === 'disconnected' || data.newState === 'error') {
                    this.cache?.onConnectionRemoved(data.connectionId);
                }
            });
        }
    }

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

        // Store connection config (without password and SSH keys)
        await this.saveConnectionConfig(config);

        // Store sensitive credentials securely
        interface CredentialData {
            password?: string;
            sshKey?: string;
            sshPassphrase?: string;
        }
        const credentials: CredentialData = {};
        if (config.password !== undefined) {
            credentials.password = config.password;
        }
        if (config.ssh?.privateKey) {
            credentials.sshKey = config.ssh.privateKey;
        }
        if (config.ssh?.passphrase) {
            credentials.sshPassphrase = config.ssh.passphrase;
        }

        if (Object.keys(credentials).length > 0) {
            await this.secretStorage.storeCredentials(config.id, credentials);
        }

        // Add to connections map
        this.connections.set(config.id, connection);

        // Emit event
        await this.eventBus.emit(EVENTS.CONNECTION_ADDED, connection);

        // Log authentication event to audit log
        if (this.auditLogger) {
            await this.auditLogger.logConnectionEvent(
                config.id,
                'CONNECT',
                config.user,
                true
            );
        }

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

        // Update sensitive credentials
        interface CredentialData {
            password?: string;
            sshKey?: string;
            sshPassphrase?: string;
        }
        const credentials: CredentialData = {};
        if (config.password !== undefined) {
            credentials.password = config.password;
        }
        if (config.ssh?.privateKey) {
            credentials.sshKey = config.ssh.privateKey;
        }
        if (config.ssh?.passphrase) {
            credentials.sshPassphrase = config.ssh.passphrase;
        }

        if (Object.keys(credentials).length > 0) {
            await this.secretStorage.storeCredentials(config.id, credentials);
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

        let tunnelLocalPort: number | undefined;
        let iamToken: string | undefined;

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

            // Retrieve credentials from secure storage
            const credentials = await this.secretStorage.getCredentials(connectionId);
            if (credentials.password !== undefined) {
                config.password = credentials.password;
            }

            // Restore SSH key if configured
            if (config.ssh && credentials.sshKey) {
                config.ssh.privateKey = credentials.sshKey;
            }
            if (config.ssh && credentials.sshPassphrase) {
                config.ssh.passphrase = credentials.sshPassphrase;
            }

            // Set up SSH tunnel if configured
            if (config.ssh) {
                this.logger.info(`Setting up SSH tunnel for ${connection.name}`);
                tunnelLocalPort = await this.sshTunnelService.createTunnel(
                    connectionId,
                    {
                        host: config.ssh.host,
                        port: config.ssh.port,
                        user: config.ssh.user,
                        keyPath: config.ssh.keyPath,
                        privateKey: config.ssh.privateKey,
                        passphrase: config.ssh.passphrase
                    },
                    config.host,
                    config.port
                );
                this.logger.info(`SSH tunnel established on localhost:${tunnelLocalPort}`);
            }

            // Generate AWS IAM auth token if configured
            if (config.awsIamAuth) {
                this.logger.info(`Generating AWS IAM auth token for ${connection.name}`);
                iamToken = await this.awsIamAuthService.generateAuthToken(
                    config.host,
                    config.port,
                    config.user,
                    config.awsIamAuth.region,
                    config.awsIamAuth.profile,
                    config.awsIamAuth.assumeRole
                );
                this.logger.info(`AWS IAM auth token generated for ${connection.name}`);
            }

            // Create adapter
            const adapter = this.adapterRegistry.create(config.type, config);

            // Connect with optional tunnel port and IAM token
            await adapter.connect(config, tunnelLocalPort, iamToken);

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

            // Clean up tunnel if it was created
            if (tunnelLocalPort) {
                try {
                    await this.sshTunnelService.closeTunnel(connectionId);
                } catch (tunnelError) {
                    this.logger.error('Failed to clean up SSH tunnel:', tunnelError as Error);
                }
            }

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

            // Close SSH tunnel if exists
            if (this.sshTunnelService.isConnected(connectionId)) {
                await this.sshTunnelService.closeTunnel(connectionId);
                this.logger.info(`SSH tunnel closed for ${connection.name}`);
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

        // Get config before deleting it (needed for audit log)
        const config = this.connectionConfigs.get(connectionId);

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

        // Log authentication event to audit log
        if (this.auditLogger && config) {
            await this.auditLogger.logConnectionEvent(
                connectionId,
                'DISCONNECT',
                config.user,
                true
            );
        }

        this.logger.info(`Connection deleted: ${connection.name}`);
    }

    async testConnection(config: ConnectionConfig): Promise<ConnectionTestResult> {
        let tunnelLocalPort: number | undefined;
        const tempConnectionId = 'test-' + Date.now();

        try {
            this.logger.info(`Testing connection to ${config.host}:${config.port}`);

            // Set up SSH tunnel if configured
            if (config.ssh) {
                this.logger.info(`Setting up SSH tunnel for connection test`);
                tunnelLocalPort = await this.sshTunnelService.createTunnel(
                    tempConnectionId,
                    {
                        host: config.ssh.host,
                        port: config.ssh.port,
                        user: config.ssh.user,
                        keyPath: config.ssh.keyPath,
                        privateKey: config.ssh.privateKey,
                        passphrase: config.ssh.passphrase
                    },
                    config.host,
                    config.port
                );
                this.logger.info(`SSH tunnel established on localhost:${tunnelLocalPort}`);
            }

            // Generate AWS IAM auth token if configured
            let iamToken: string | undefined;
            if (config.awsIamAuth) {
                this.logger.info(`Generating AWS IAM auth token for connection test`);
                iamToken = await this.awsIamAuthService.generateAuthToken(
                    config.host,
                    config.port,
                    config.user,
                    config.awsIamAuth.region,
                    config.awsIamAuth.profile,
                    config.awsIamAuth.assumeRole
                );
            }

            // Create adapter
            const adapter = this.adapterRegistry.create(config.type, config);

            // Actually test the connection with optional tunnel port and IAM token
            await adapter.connect(config, tunnelLocalPort, iamToken);

            // Get version info if possible
            let version: string | undefined;
            try {
                const versionResult = await adapter.query('SELECT VERSION() as version');
                if (versionResult?.rows && versionResult.rows.length > 0) {
                    const row = versionResult.rows[0] as Record<string, unknown>;
                    version = row.version as string;
                }
            } catch (versionError) {
                // Version query failed, but connection was successful
                this.logger.warn('Could not get database version:', versionError as Error);
            }

            // Disconnect immediately - this was just a test
            await adapter.disconnect();

            // Close tunnel if we created one
            if (tunnelLocalPort) {
                await this.sshTunnelService.closeTunnel(tempConnectionId);
            }

            // Log successful connection test to audit log
            if (this.auditLogger) {
                await this.auditLogger.logConnectionEvent(
                    config.id,
                    'CONNECT',
                    config.user,
                    true
                );
            }

            this.logger.info(`Connection test successful: ${config.host}:${config.port}`);
            return {
                success: true,
                version
            };

        } catch (error) {
            this.logger.error(`Connection test error:`, error as Error);

            // Clean up tunnel if we created one
            if (tunnelLocalPort) {
                try {
                    await this.sshTunnelService.closeTunnel(tempConnectionId);
                } catch (tunnelError) {
                    this.logger.error('Failed to clean up SSH tunnel:', tunnelError as Error);
                }
            }

            // Log failed connection test to audit log
            if (this.auditLogger) {
                await this.auditLogger.logConnectionEvent(
                    config.id,
                    'CONNECT',
                    config.user,
                    false,
                    (error as Error).message
                );
            }

            return {
                success: false,
                error: (error as Error).message
            };
        }
    }

    /**
     * Get RDS discovery service
     * @returns AWS RDS discovery service
     */
    getRDSDiscoveryService() {
        return this.awsRdsDiscoveryService;
    }

    /**
     * Get AWS IAM auth service
     * @returns AWS IAM auth service
     */
    getAWSIAMAuthService() {
        return this.awsIamAuthService;
    }

    /**
     * Get SSH tunnel service
     * @returns SSH tunnel service
     */
    getSSHTunnelService() {
        return this.sshTunnelService;
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
            // Store in memory (sanitized - remove any sensitive credentials)
            const sanitized = this.sanitizeConfigForStorage(config);
            this.connectionConfigs.set(config.id, sanitized);

            // Persist to workspace state
            await this.saveAllConnections();

            this.logger.debug(`Saved connection config: ${config.id}`);
        } catch (error) {
            this.logger.error('Failed to save connection config:', error as Error);
        }
    }

    private async saveAllConnections(): Promise<void> {
        const connectionsJson = Array.from(this.connectionConfigs.values()).map(config => {
            // Extra defense: ensure sensitive fields are stripped before persisting
            const { password: _password, ...rest } = config as ConnectionConfig & { password?: string };
            const sanitizedSsh = rest.ssh
                ? {
                    host: rest.ssh.host,
                    port: rest.ssh.port,
                    user: rest.ssh.user,
                    keyPath: rest.ssh.keyPath
                }
                : undefined;
            const configForSave: ConnectionConfig = {
                ...rest,
                ssh: sanitizedSsh
            };
            return JSON.stringify(configForSave);
        });

        await this.context.workspaceState.update(this.CONNECTIONS_KEY, connectionsJson);
    }

    /**
     * Create a sanitized copy of the connection config that excludes sensitive data.
     * This is used for both in-memory storage and persistence to workspace state.
     */
    private sanitizeConfigForStorage(config: ConnectionConfig): ConnectionConfig {
        const { password: _password, ...base } = config as ConnectionConfig & { password?: string };
        const ssh = config.ssh
            ? {
                host: config.ssh.host,
                port: config.ssh.port,
                user: config.ssh.user,
                keyPath: config.ssh.keyPath
            }
            : undefined;

        return {
            ...base,
            ssh
        };
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

    /**
     * Get databases with caching support
     */
    async getDatabases(connectionId: string): Promise<Array<{ name: string }>> {
        const adapter = this.adapters.get(connectionId);
        if (!adapter) {
            throw new Error(`No adapter found for connection: ${connectionId}`);
        }

        // Try cache first - use a special key for database list
        const cacheKey = `schema:${connectionId}:__databases__`;
        if (this.cache) {
            const cached = this.cache.get<Array<{ name: string }>>(cacheKey);
            if (cached) {
                this.logger.debug(`Cache hit for databases: ${connectionId}`);
                return cached;
            }
        }

        // Fetch from database
        this.logger.debug(`Cache miss for databases: ${connectionId}, fetching from DB`);
        const databases = await adapter.getDatabases();

        // Store in cache with 1-hour TTL
        if (this.cache) {
            this.cache.set(cacheKey, databases, 3600000); // 1 hour
        }

        return databases;
    }

    /**
     * Get table schema with caching support
     */
    async getTableSchema(connectionId: string, database: string, table: string): Promise<unknown> {
        const adapter = this.adapters.get(connectionId);
        if (!adapter) {
            throw new Error(`No adapter found for connection: ${connectionId}`);
        }

        // Try cache first
        const cacheKey = CacheKeyBuilder.schema(connectionId, database, table);
        if (this.cache) {
            const cached = this.cache.get<unknown>(cacheKey);
            if (cached) {
                this.logger.debug(`Cache hit for table schema: ${database}.${table}`);
                return cached;
            }
        }

        // Fetch from database
        this.logger.debug(`Cache miss for table schema: ${database}.${table}, fetching from DB`);
        const schema = await adapter.getTableSchema(database, table);

        // Store in cache with 1-hour TTL
        if (this.cache) {
            this.cache.set(cacheKey, schema, 3600000); // 1 hour
        }

        return schema;
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
