import { RDSClient, DescribeDBInstancesCommand, DBInstance, DescribeDBClustersCommand, DBCluster } from '@aws-sdk/client-rds';
import { fromEnv, fromIni, fromInstanceMetadata } from '@aws-sdk/credential-providers';
import { Logger } from '../utils/logger';
import { RDSInstanceInfo } from '../types';

/**
 * AWS RDS Discovery Service
 *
 * Discovers RDS MySQL/MariaDB instances in AWS regions.
 * Supports instance caching to reduce API calls.
 */
export class AWSRDSDiscoveryService {
    private logger: Logger;
    private instanceCache = new Map<string, CachedInstances>();
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    // Common AWS regions
    public static readonly AWS_REGIONS = [
        { id: 'us-east-1', name: 'US East (N. Virginia)' },
        { id: 'us-east-2', name: 'US East (Ohio)' },
        { id: 'us-west-1', name: 'US West (N. California)' },
        { id: 'us-west-2', name: 'US West (Oregon)' },
        { id: 'ca-central-1', name: 'Canada (Central)' },
        { id: 'eu-west-1', name: 'Europe (Ireland)' },
        { id: 'eu-west-2', name: 'Europe (London)' },
        { id: 'eu-west-3', name: 'Europe (Paris)' },
        { id: 'eu-central-1', name: 'Europe (Frankfurt)' },
        { id: 'eu-north-1', name: 'Europe (Stockholm)' },
        { id: 'ap-south-1', name: 'Asia Pacific (Mumbai)' },
        { id: 'ap-northeast-1', name: 'Asia Pacific (Tokyo)' },
        { id: 'ap-northeast-2', name: 'Asia Pacific (Seoul)' },
        { id: 'ap-northeast-3', name: 'Asia Pacific (Osaka)' },
        { id: 'ap-southeast-1', name: 'Asia Pacific (Singapore)' },
        { id: 'ap-southeast-2', name: 'Asia Pacific (Sydney)' },
        { id: 'sa-east-1', name: 'South America (São Paulo)' }
    ];

    constructor(logger: Logger) {
        this.logger = logger;
    }

    /**
     * Discover RDS MySQL/MariaDB instances in a region
     *
     * @param region AWS region
     * @param profile AWS profile name (optional)
     * @returns List of RDS instances
     */
    async discoverInstances(region: string, profile?: string): Promise<RDSInstanceInfo[]> {
        // Check cache first
        const cacheKey = this.getCacheKey(region, profile);
        const cached = this.instanceCache.get(cacheKey);
        if (cached && Date.now() < cached.expiresAt) {
            this.logger.debug(`Using cached RDS instances for region ${region}`);
            return cached.instances;
        }

        this.logger.info(`Discovering RDS instances in region ${region}`);

        try {
            // Create credential provider
            const credentials = profile
                ? fromIni({ profile })
                : this.createCredentialProviderChain();

            // Create RDS client
            const client = new RDSClient({
                region,
                credentials
            });

            // Fetch both instances and clusters
            const [instances, clusters] = await Promise.all([
                this.fetchDBInstances(client),
                this.fetchDBClusters(client)
            ]);

            // Filter for MySQL/MariaDB and available status
            const mysqlInstances = instances
                .filter(instance => this.isMySQLOrMariaDB(instance.Engine))
                .filter(instance => instance.DBInstanceStatus === 'available')
                .map(instance => this.mapInstanceToInfo(instance));

            const mysqlClusters = clusters
                .filter(cluster => this.isMySQLOrMariaDB(cluster.Engine))
                .filter(cluster => cluster.Status === 'available')
                .map(cluster => this.mapClusterToInfo(cluster));

            // Combine and deduplicate
            const allInstances = [...mysqlInstances, ...mysqlClusters];

            // Cache results
            this.instanceCache.set(cacheKey, {
                instances: allInstances,
                expiresAt: Date.now() + this.CACHE_TTL
            });

            this.logger.info(`Found ${allInstances.length} MySQL/MariaDB instances in ${region}`);
            return allInstances;

        } catch (error) {
            this.logger.error(`Failed to discover RDS instances: ${(error as Error).message}`);

            // Provide helpful error messages
            if ((error as Error).message.includes('Could not load credentials')) {
                throw new Error(
                    'AWS credentials not found. Please configure credentials using one of:\n' +
                    '1. AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables\n' +
                    '2. ~/.aws/credentials file\n' +
                    '3. EC2 instance metadata (if running on EC2)'
                );
            }

            if ((error as Error).message.includes('UnauthorizedOperation') ||
                (error as Error).message.includes('AccessDenied')) {
                throw new Error(
                    'Access denied. Please ensure your AWS credentials have ' +
                    'rds:DescribeDBInstances and rds:DescribeDBClusters permissions.'
                );
            }

            throw error;
        }
    }

    /**
     * Fetch DB instances with pagination
     *
     * @param client RDS client
     * @returns List of DB instances
     */
    private async fetchDBInstances(client: RDSClient): Promise<DBInstance[]> {
        const instances: DBInstance[] = [];
        let marker: string | undefined;

        do {
            const command = new DescribeDBInstancesCommand({
                Marker: marker,
                MaxRecords: 100
            });

            const response = await client.send(command);

            if (response.DBInstances) {
                instances.push(...response.DBInstances);
            }

            marker = response.Marker;
        } while (marker);

        return instances;
    }

    /**
     * Fetch DB clusters with pagination
     *
     * @param client RDS client
     * @returns List of DB clusters
     */
    private async fetchDBClusters(client: RDSClient): Promise<DBCluster[]> {
        const clusters: DBCluster[] = [];
        let marker: string | undefined;

        do {
            const command = new DescribeDBClustersCommand({
                Marker: marker,
                MaxRecords: 100
            });

            const response = await client.send(command);

            if (response.DBClusters) {
                clusters.push(...response.DBClusters);
            }

            marker = response.Marker;
        } while (marker);

        return clusters;
    }

    /**
     * Check if engine is MySQL or MariaDB
     *
     * @param engine Engine type
     * @returns True if MySQL or MariaDB
     */
    private isMySQLOrMariaDB(engine?: string): boolean {
        if (!engine) return false;
        const lowerEngine = engine.toLowerCase();
        return lowerEngine.includes('mysql') || lowerEngine.includes('mariadb') || lowerEngine.includes('aurora-mysql');
    }

    /**
     * Map DB instance to RDSInstanceInfo
     *
     * @param instance DB instance
     * @returns RDSInstanceInfo
     */
    private mapInstanceToInfo(instance: DBInstance): RDSInstanceInfo {
        return {
            identifier: instance.DBInstanceIdentifier || 'Unknown',
            endpoint: instance.Endpoint?.Address || '',
            port: instance.Endpoint?.Port || 3306,
            engine: instance.Engine || 'Unknown',
            engineVersion: instance.EngineVersion || 'Unknown',
            status: instance.DBInstanceStatus || 'Unknown'
        };
    }

    /**
     * Map DB cluster to RDSInstanceInfo
     *
     * @param cluster DB cluster
     * @returns RDSInstanceInfo
     */
    private mapClusterToInfo(cluster: DBCluster): RDSInstanceInfo {
        return {
            identifier: cluster.DBClusterIdentifier || 'Unknown',
            endpoint: cluster.Endpoint || '',
            port: cluster.Port || 3306,
            engine: cluster.Engine || 'Unknown',
            engineVersion: cluster.EngineVersion || 'Unknown',
            status: cluster.Status || 'Unknown'
        };
    }

    /**
     * Create AWS credential provider chain
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
     * Generate cache key
     *
     * @param region AWS region
     * @param profile AWS profile
     * @returns Cache key
     */
    private getCacheKey(region: string, profile?: string): string {
        return `${region}:${profile || 'default'}`;
    }

    /**
     * Clear cache
     */
    clearCache(): void {
        this.instanceCache.clear();
        this.logger.debug('RDS instance cache cleared');
    }

    /**
     * Clear expired cache entries
     */
    clearExpiredCache(): void {
        const now = Date.now();
        for (const [key, cached] of this.instanceCache.entries()) {
            if (now >= cached.expiresAt) {
                this.instanceCache.delete(key);
            }
        }
    }

    /**
     * Dispose and clean up resources
     */
    dispose(): void {
        this.clearCache();
    }
}

/**
 * Cached RDS instances
 */
interface CachedInstances {
    instances: RDSInstanceInfo[];
    expiresAt: number;
}
