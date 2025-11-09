import { Signer } from '@aws-sdk/rds-signer';
import { fromEnv, fromIni, fromInstanceMetadata, fromTemporaryCredentials } from '@aws-sdk/credential-providers';
import { Logger } from '../utils/logger';

/**
 * AWS IAM Authentication Service
 *
 * Generates IAM authentication tokens for RDS connections.
 * Supports token caching and automatic refresh.
 */
export class AWSIAMAuthService {
    private logger: Logger;
    private tokenCache = new Map<string, CachedToken>();
    private readonly TOKEN_TTL = 13 * 60 * 1000; // 13 minutes (tokens expire after 15 minutes)

    constructor(logger: Logger) {
        this.logger = logger;
    }

    /**
     * Generate an IAM authentication token for RDS
     *
     * @param hostname RDS endpoint hostname
     * @param port RDS port
     * @param username Database username
     * @param region AWS region (optional, will be extracted from hostname)
     * @param profile AWS profile name (optional)
     * @param roleArn IAM role ARN to assume (optional)
     * @returns IAM authentication token
     */
    async generateAuthToken(
        hostname: string,
        port: number,
        username: string,
        region?: string,
        profile?: string,
        roleArn?: string
    ): Promise<string> {
        // Check cache first
        const cacheKey = this.getCacheKey(hostname, port, username, region, roleArn);
        const cached = this.tokenCache.get(cacheKey);
        if (cached && Date.now() < cached.expiresAt) {
            this.logger.debug(`Using cached IAM token for ${hostname}`);
            return cached.token;
        }

        // Validate that this is an RDS endpoint
        if (!this.isRDSEndpoint(hostname)) {
            throw new Error(`Not a valid RDS endpoint: ${hostname}. Expected *.rds.amazonaws.com or *.cluster-*.rds.amazonaws.com`);
        }

        // Extract region from hostname if not provided
        const effectiveRegion = region || this.extractRegionFromEndpoint(hostname);
        if (!effectiveRegion) {
            throw new Error(`Could not determine AWS region from endpoint: ${hostname}. Please specify region explicitly.`);
        }

        this.logger.info(`Generating IAM auth token for ${hostname} in region ${effectiveRegion}${roleArn ? ` with role ${roleArn}` : ''}`);

        try {
            // Create credential provider chain
            let credentials;

            if (roleArn) {
                // Assume role using base credentials
                this.logger.info(`Assuming role: ${roleArn}`);
                const baseCredentials = profile
                    ? fromIni({ profile })
                    : this.createCredentialProviderChain();

                credentials = fromTemporaryCredentials({
                    params: {
                        RoleArn: roleArn,
                        RoleSessionName: `mydba-rds-${Date.now()}`
                    },
                    clientConfig: {
                        region: effectiveRegion
                    },
                    masterCredentials: baseCredentials
                });
            } else {
                // Use base credentials directly
                credentials = profile
                    ? fromIni({ profile })
                    : this.createCredentialProviderChain();
            }

            // Create RDS Signer
            const signer = new Signer({
                hostname,
                port,
                region: effectiveRegion,
                username,
                credentials
            });

            // Generate auth token
            const token = await signer.getAuthToken();

            // Cache the token
            this.tokenCache.set(cacheKey, {
                token,
                expiresAt: Date.now() + this.TOKEN_TTL
            });

            this.logger.info(`Successfully generated IAM auth token for ${hostname}`);
            return token;

        } catch (error) {
            this.logger.error(`Failed to generate IAM auth token: ${(error as Error).message}`);

            // Provide helpful error messages
            if ((error as Error).message.includes('Could not load credentials')) {
                throw new Error(
                    'AWS credentials not found. Please configure credentials using one of:\n' +
                    '1. AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables\n' +
                    '2. ~/.aws/credentials file\n' +
                    '3. EC2 instance metadata (if running on EC2)'
                );
            }

            throw error;
        }
    }

    /**
     * Check if hostname is an RDS endpoint
     *
     * @param hostname Hostname to check
     * @returns True if RDS endpoint
     */
    isRDSEndpoint(hostname: string): boolean {
        return (
            hostname.endsWith('.rds.amazonaws.com') ||
            hostname.includes('.cluster-') && hostname.endsWith('.rds.amazonaws.com')
        );
    }

    /**
     * Extract AWS region from RDS endpoint
     *
     * @param hostname RDS endpoint hostname
     * @returns AWS region or undefined
     */
    extractRegionFromEndpoint(hostname: string): string | undefined {
        // RDS endpoint format: <instance-id>.<region>.rds.amazonaws.com
        // Cluster endpoint format: <cluster-id>.cluster-<cluster-id>.<region>.rds.amazonaws.com

        const parts = hostname.split('.');

        // For cluster endpoints: <cluster-id>.cluster-<id>.<region>.rds.amazonaws.com
        if (parts.includes('cluster')) {
            const clusterIndex = parts.indexOf('cluster');
            if (clusterIndex >= 0 && clusterIndex + 2 < parts.length) {
                return parts[clusterIndex + 2];
            }
        }

        // For regular endpoints: <instance-id>.<region>.rds.amazonaws.com
        if (parts.length >= 4) {
            return parts[1];
        }

        return undefined;
    }

    /**
     * Clear token cache
     */
    clearCache(): void {
        this.tokenCache.clear();
        this.logger.debug('IAM token cache cleared');
    }

    /**
     * Clear expired tokens from cache
     */
    clearExpiredTokens(): void {
        const now = Date.now();
        for (const [key, cached] of this.tokenCache.entries()) {
            if (now >= cached.expiresAt) {
                this.tokenCache.delete(key);
            }
        }
    }

    /**
     * Create AWS credential provider chain
     * Tries environment variables, shared credentials file, then instance metadata
     *
     * @returns Credential provider
     */
    private createCredentialProviderChain() {
        return async () => {
            // Try environment variables first
            try {
                const envCreds = await fromEnv()();
                return envCreds;
            } catch {
                this.logger.debug('Environment credentials not available');
            }

            // Try shared credentials file (~/.aws/credentials)
            try {
                const fileCreds = await fromIni()();
                return fileCreds;
            } catch {
                this.logger.debug('Shared credentials file not available');
            }

            // Try instance metadata (EC2/ECS)
            try {
                const metadataCreds = await fromInstanceMetadata()();
                return metadataCreds;
            } catch {
                this.logger.debug('Instance metadata not available');
            }

            throw new Error('Could not load credentials from any provider');
        };
    }

    /**
     * Generate cache key for token
     *
     * @param hostname RDS hostname
     * @param port RDS port
     * @param username Database username
     * @param region AWS region
     * @param roleArn IAM role ARN
     * @returns Cache key
     */
    private getCacheKey(hostname: string, port: number, username: string, region?: string, roleArn?: string): string {
        return `${hostname}:${port}:${username}:${region || 'auto'}:${roleArn || 'direct'}`;
    }

    /**
     * Dispose and clean up resources
     */
    dispose(): void {
        this.clearCache();
    }
}

/**
 * Cached IAM token
 */
interface CachedToken {
    token: string;
    expiresAt: number;
}
