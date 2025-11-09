import { Client, ConnectConfig } from 'ssh2';
import { Logger } from '../utils/logger';
import { SSHTunnelInfo } from '../types';
import * as net from 'net';
import * as fs from 'fs';

/**
 * SSH Tunnel Service
 *
 * Manages SSH tunnels for secure database connections.
 * Supports connection pooling and automatic reconnection.
 */
export class SSHTunnelService {
    private tunnels = new Map<string, SSHTunnelConnection>();
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    /**
     * Create an SSH tunnel
     *
     * @param connectionId Unique connection identifier
     * @param sshConfig SSH connection configuration
     * @param remoteHost Remote database host
     * @param remotePort Remote database port
     * @returns Local port for the tunnel
     */
    async createTunnel(
        connectionId: string,
        sshConfig: {
            host: string;
            port: number;
            user: string;
            keyPath?: string;
            privateKey?: string;
            passphrase?: string;
        },
        remoteHost: string,
        remotePort: number
    ): Promise<number> {
        this.logger.info(`Creating SSH tunnel for connection ${connectionId}`);

        // Check if tunnel already exists for this connection
        const existing = this.tunnels.get(connectionId);
        if (existing && existing.isConnected) {
            this.logger.info(`Reusing existing SSH tunnel for ${connectionId}`);
            return existing.localPort;
        }

        // Read SSH private key from file if keyPath is provided
        let privateKey = sshConfig.privateKey;
        if (sshConfig.keyPath && !privateKey) {
            try {
                privateKey = fs.readFileSync(sshConfig.keyPath, 'utf8');
                this.logger.debug(`Loaded SSH key from ${sshConfig.keyPath}`);
            } catch (error) {
                throw new Error(`Failed to read SSH key file: ${(error as Error).message}`);
            }
        }

        if (!privateKey) {
            throw new Error('SSH private key is required (either keyPath or privateKey)');
        }

        // Create SSH client
        const sshClient = new Client();
        const localPort = await this.findAvailablePort();

        return new Promise((resolve, reject) => {
            let server: net.Server | undefined;
            let connected = false;
            const timeout = setTimeout(() => {
                if (!connected) {
                    sshClient.end();
                    reject(new Error('SSH connection timeout (30s)'));
                }
            }, 30000); // 30 second timeout

            sshClient.on('ready', () => {
                connected = true;
                clearTimeout(timeout);
                this.logger.info(`SSH connection established to ${sshConfig.host}:${sshConfig.port}`);

                // Create local TCP server for port forwarding
                server = net.createServer((localSocket) => {
                    this.logger.debug(`Local connection established on port ${localPort}`);

                    sshClient.forwardOut(
                        '127.0.0.1',
                        localPort,
                        remoteHost,
                        remotePort,
                        (err, remoteSocket) => {
                            if (err) {
                                this.logger.error(`SSH port forwarding error: ${err.message}`);
                                localSocket.end();
                                return;
                            }

                            // Pipe data between local and remote sockets
                            localSocket.pipe(remoteSocket);
                            remoteSocket.pipe(localSocket);

                            localSocket.on('error', (error: Error) => {
                                this.logger.error(`Local socket error: ${error.message}`);
                            });

                            remoteSocket.on('error', (error: Error) => {
                                this.logger.error(`Remote socket error: ${error.message}`);
                            });
                        }
                    );
                });

                server.listen(localPort, '127.0.0.1', () => {
                    this.logger.info(`SSH tunnel listening on localhost:${localPort} -> ${remoteHost}:${remotePort}`);

                    const tunnelInfo: SSHTunnelConnection = {
                        connectionId,
                        sshClient,
                        server: server as net.Server,
                        localPort,
                        remoteHost,
                        remotePort,
                        sshHost: sshConfig.host,
                        sshPort: sshConfig.port,
                        isConnected: true,
                        reconnectAttempts: 0
                    };

                    this.tunnels.set(connectionId, tunnelInfo);
                    resolve(localPort);
                });

                server.on('error', (error) => {
                    this.logger.error(`Server error: ${error.message}`);
                    reject(error);
                });
            });

            sshClient.on('error', (error) => {
                connected = true; // Prevent timeout from firing
                clearTimeout(timeout);
                this.logger.error(`SSH connection error: ${error.message}`);
                reject(error);
            });

            sshClient.on('end', () => {
                this.logger.info(`SSH connection ended for ${connectionId}`);
                const tunnel = this.tunnels.get(connectionId);
                if (tunnel) {
                    tunnel.isConnected = false;
                }
            });

            sshClient.on('close', () => {
                this.logger.info(`SSH connection closed for ${connectionId}`);
            });

            // Connect to SSH server
            const connectConfig: ConnectConfig = {
                host: sshConfig.host,
                port: sshConfig.port,
                username: sshConfig.user,
                privateKey: privateKey,
                passphrase: sshConfig.passphrase,
                readyTimeout: 30000,
                keepaliveInterval: 10000,
                keepaliveCountMax: 3
            };

            try {
                sshClient.connect(connectConfig);
            } catch (error) {
                clearTimeout(timeout);
                reject(error);
            }
        });
    }

    /**
     * Close an SSH tunnel
     *
     * @param connectionId Connection identifier
     */
    async closeTunnel(connectionId: string): Promise<void> {
        const tunnel = this.tunnels.get(connectionId);
        if (!tunnel) {
            this.logger.debug(`No tunnel found for connection ${connectionId}`);
            return;
        }

        this.logger.info(`Closing SSH tunnel for connection ${connectionId}`);

        // Close local server
        if (tunnel.server) {
            await new Promise<void>((resolve) => {
                const server = tunnel.server;
                if (server) {
                    server.close(() => {
                        this.logger.debug(`Local server closed for port ${tunnel.localPort}`);
                        resolve();
                    });
                } else {
                    resolve();
                }
            });
        }

        // Close SSH connection
        tunnel.sshClient.end();
        tunnel.isConnected = false;

        // Remove from map
        this.tunnels.delete(connectionId);

        this.logger.info(`SSH tunnel closed for connection ${connectionId}`);
    }

    /**
     * Get tunnel information
     *
     * @param connectionId Connection identifier
     * @returns Tunnel information or undefined
     */
    getTunnelInfo(connectionId: string): SSHTunnelInfo | undefined {
        const tunnel = this.tunnels.get(connectionId);
        if (!tunnel) {
            return undefined;
        }

        return {
            connectionId: tunnel.connectionId,
            sshHost: tunnel.sshHost,
            sshPort: tunnel.sshPort,
            localPort: tunnel.localPort,
            remoteHost: tunnel.remoteHost,
            remotePort: tunnel.remotePort,
            isConnected: tunnel.isConnected
        };
    }

    /**
     * Check if a tunnel exists and is connected
     *
     * @param connectionId Connection identifier
     * @returns True if tunnel is connected
     */
    isConnected(connectionId: string): boolean {
        const tunnel = this.tunnels.get(connectionId);
        return tunnel ? tunnel.isConnected : false;
    }

    /**
     * Close all tunnels (cleanup)
     */
    async closeAll(): Promise<void> {
        this.logger.info('Closing all SSH tunnels');
        const connectionIds = Array.from(this.tunnels.keys());
        await Promise.all(connectionIds.map(id => this.closeTunnel(id)));
    }

    /**
     * Find an available local port
     *
     * @returns Available port number
     */
    private async findAvailablePort(): Promise<number> {
        return new Promise((resolve, reject) => {
            const server = net.createServer();
            server.unref();
            server.on('error', reject);
            server.listen(0, '127.0.0.1', () => {
                const address = server.address();
                if (!address || typeof address === 'string') {
                    reject(new Error('Failed to get server address'));
                    return;
                }
                const port = address.port;
                server.close(() => {
                    resolve(port);
                });
            });
        });
    }

    /**
     * Dispose of all resources
     */
    async dispose(): Promise<void> {
        await this.closeAll();
    }
}

/**
 * Internal tunnel connection tracking
 */
interface SSHTunnelConnection {
    connectionId: string;
    sshClient: Client;
    server: net.Server;
    localPort: number;
    remoteHost: string;
    remotePort: number;
    sshHost: string;
    sshPort: number;
    isConnected: boolean;
    reconnectAttempts: number;
}
