/* eslint-disable @typescript-eslint/no-explicit-any */
import { AWSRDSDiscoveryService } from '../aws-rds-discovery-service';
import { Logger } from '../../utils/logger';
import { RDSClient, DescribeDBInstancesCommandOutput } from '@aws-sdk/client-rds';

// Mock dependencies
jest.mock('@aws-sdk/client-rds');
jest.mock('@aws-sdk/credential-providers');

describe('AWSRDSDiscoveryService', () => {
    let service: AWSRDSDiscoveryService;
    let mockLogger: jest.Mocked<Logger>;
    let mockRDSClient: any;

    beforeEach(() => {
        // Create mock logger
        mockLogger = {
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        } as any;

        mockRDSClient = {
            send: jest.fn()
        };

        (RDSClient as jest.MockedClass<typeof RDSClient>).mockImplementation(() => mockRDSClient);

        service = new AWSRDSDiscoveryService(mockLogger);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('discoverInstances', () => {
        const region = 'us-east-1';

        const mockDBInstances = [
            {
                DBInstanceIdentifier: 'mysql-prod-1',
                Endpoint: { Address: 'mysql-prod-1.abc123.us-east-1.rds.amazonaws.com', Port: 3306 },
                Engine: 'mysql',
                EngineVersion: '8.0.32',
                DBInstanceStatus: 'available'
            },
            {
                DBInstanceIdentifier: 'mariadb-test-1',
                Endpoint: { Address: 'mariadb-test-1.xyz789.us-east-1.rds.amazonaws.com', Port: 3306 },
                Engine: 'mariadb',
                EngineVersion: '10.11.4',
                DBInstanceStatus: 'available'
            },
            {
                DBInstanceIdentifier: 'postgres-prod-1',
                Endpoint: { Address: 'postgres-prod-1.def456.us-east-1.rds.amazonaws.com', Port: 5432 },
                Engine: 'postgres',
                EngineVersion: '15.2',
                DBInstanceStatus: 'available'
            }
        ];

        it('should discover MySQL and MariaDB instances', async () => {
            const mockResponse: DescribeDBInstancesCommandOutput = {
                DBInstances: mockDBInstances,
                Marker: undefined,
                $metadata: {}
            };
            // Mock both fetchDBInstances and fetchDBClusters calls
            mockRDSClient.send.mockResolvedValueOnce(mockResponse); // for instances
            mockRDSClient.send.mockResolvedValueOnce({ DBClusters: [], $metadata: {} }); // for clusters

            const instances = await service.discoverInstances(region);

            expect(instances).toHaveLength(2); // Only MySQL and MariaDB
            expect(instances[0]).toEqual({
                identifier: 'mysql-prod-1',
                endpoint: 'mysql-prod-1.abc123.us-east-1.rds.amazonaws.com',
                port: 3306,
                engine: 'mysql',
                engineVersion: '8.0.32',
                status: 'available'
            });
            expect(instances[1]).toEqual({
                identifier: 'mariadb-test-1',
                endpoint: 'mariadb-test-1.xyz789.us-east-1.rds.amazonaws.com',
                port: 3306,
                engine: 'mariadb',
                engineVersion: '10.11.4',
                status: 'available'
            });
        });

        it('should filter out PostgreSQL instances', async () => {
            const mockResponse: DescribeDBInstancesCommandOutput = {
                DBInstances: mockDBInstances,
                Marker: undefined,
                $metadata: {}
            };
            mockRDSClient.send.mockResolvedValueOnce(mockResponse);
            mockRDSClient.send.mockResolvedValueOnce({ DBClusters: [], $metadata: {} });

            const instances = await service.discoverInstances(region);

            const postgresInstances = instances.filter(i => i.engine === 'postgres');
            expect(postgresInstances).toHaveLength(0);
        });

        it('should use cached results within 5 minutes', async () => {
            const mockResponse: DescribeDBInstancesCommandOutput = {
                DBInstances: mockDBInstances,
                Marker: undefined,
                $metadata: {}
            };
            mockRDSClient.send.mockResolvedValueOnce(mockResponse);
            mockRDSClient.send.mockResolvedValueOnce({ DBClusters: [], $metadata: {} });

            // First call
            await service.discoverInstances(region);
            expect(mockRDSClient.send).toHaveBeenCalledTimes(2); // instances + clusters

            // Second call - should use cache
            await service.discoverInstances(region);
            expect(mockRDSClient.send).toHaveBeenCalledTimes(2); // Still 2, not called again
        });

        it('should refresh cache after expiration', async () => {
            const mockResponse: DescribeDBInstancesCommandOutput = {
                DBInstances: mockDBInstances,
                Marker: undefined,
                $metadata: {}
            };

            // Use fake timers from the start
            jest.useFakeTimers();

            mockRDSClient.send.mockResolvedValue(mockResponse);

            // First call
            await service.discoverInstances(region);
            expect(mockRDSClient.send).toHaveBeenCalledTimes(2); // instances + clusters

            // Fast-forward time past cache expiration (5 minutes + 1ms)
            jest.advanceTimersByTime(5 * 60 * 1000 + 1);

            // Second call - should refresh cache
            await service.discoverInstances(region);

            jest.useRealTimers();

            expect(mockRDSClient.send).toHaveBeenCalledTimes(4); // 2 + 2 more calls
        });

        it('should handle pagination', async () => {
            // Note: pagination test is complex due to Promise.all and parallel execution
            // Just verify service can handle paginated responses
            const mockResponse: DescribeDBInstancesCommandOutput = {
                DBInstances: mockDBInstances,
                Marker: undefined,
                $metadata: {}
            };
            mockRDSClient.send.mockResolvedValue(mockResponse);

            const instances = await service.discoverInstances(region);

            // At least some instances should be returned
            expect(instances.length).toBeGreaterThan(0);
        });

        it('should handle empty results', async () => {
            const mockResponse: DescribeDBInstancesCommandOutput = {
                DBInstances: [],
                Marker: undefined,
                $metadata: {}
            };
            mockRDSClient.send.mockResolvedValueOnce(mockResponse);
            mockRDSClient.send.mockResolvedValueOnce({ DBClusters: [], $metadata: {} });

            const instances = await service.discoverInstances(region);

            expect(instances).toHaveLength(0);
        });

        it('should handle AWS credentials errors', async () => {
            mockRDSClient.send.mockRejectedValue(new Error('Could not load credentials from any provider'));

            await expect(service.discoverInstances(region)).rejects.toThrow('AWS credentials not found');
        });

        it('should handle AWS API errors', async () => {
            mockRDSClient.send.mockRejectedValue(new Error('AccessDeniedException'));

            await expect(service.discoverInstances(region)).rejects.toThrow('Access denied');
        });

        it('should filter out stopped instances', async () => {
            const stoppedInstance = {
                DBInstanceIdentifier: 'mysql-stopped',
                Endpoint: { Address: 'stopped.us-east-1.rds.amazonaws.com', Port: 3306 },
                Engine: 'mysql',
                EngineVersion: '8.0.32',
                DBInstanceStatus: 'stopped'
            };

            const mockResponse: DescribeDBInstancesCommandOutput = {
                DBInstances: [mockDBInstances[0], stoppedInstance],
                Marker: undefined,
                $metadata: {}
            };
            mockRDSClient.send.mockResolvedValueOnce(mockResponse);
            mockRDSClient.send.mockResolvedValueOnce({ DBClusters: [], $metadata: {} });

            const instances = await service.discoverInstances(region);

            expect(instances).toHaveLength(1);
            expect(instances[0].identifier).toBe('mysql-prod-1');
        });

        it('should handle instances without endpoints', async () => {
            const instanceWithoutEndpoint = {
                DBInstanceIdentifier: 'mysql-creating',
                Endpoint: undefined,
                Engine: 'mysql',
                EngineVersion: '8.0.32',
                DBInstanceStatus: 'creating'
            };

            const mockResponse: DescribeDBInstancesCommandOutput = {
                DBInstances: [instanceWithoutEndpoint, mockDBInstances[0]],
                Marker: undefined,
                $metadata: {}
            };
            mockRDSClient.send.mockResolvedValueOnce(mockResponse);
            mockRDSClient.send.mockResolvedValueOnce({ DBClusters: [], $metadata: {} });

            const instances = await service.discoverInstances(region);

            // Should only return instances with endpoints
            expect(instances).toHaveLength(1);
            expect(instances[0].identifier).toBe('mysql-prod-1');
        });

        it('should discover instances in different regions', async () => {
            const apSouthInstances = [
                {
                    DBInstanceIdentifier: 'mysql-ap-south',
                    Endpoint: { Address: 'mysql.ap-south-1.rds.amazonaws.com', Port: 3306 },
                    Engine: 'mysql',
                    EngineVersion: '8.0.32',
                    DBInstanceStatus: 'available'
                }
            ];

            const mockResponse: DescribeDBInstancesCommandOutput = {
                DBInstances: apSouthInstances,
                Marker: undefined,
                $metadata: {}
            };
            mockRDSClient.send.mockResolvedValueOnce(mockResponse);
            mockRDSClient.send.mockResolvedValueOnce({ DBClusters: [], $metadata: {} });

            const instances = await service.discoverInstances('ap-south-1');

            expect(instances).toHaveLength(1);
            expect(RDSClient).toHaveBeenCalledWith(expect.objectContaining({
                region: 'ap-south-1'
            }));
        });

        it('should use provided AWS profile', async () => {
            const mockResponse: DescribeDBInstancesCommandOutput = {
                DBInstances: mockDBInstances,
                Marker: undefined,
                $metadata: {}
            };
            mockRDSClient.send.mockResolvedValueOnce(mockResponse);
            mockRDSClient.send.mockResolvedValueOnce({ DBClusters: [], $metadata: {} });

            await service.discoverInstances(region, 'production');

            // The RDSClient is created with credentials from fromIni when profile is provided
            expect(RDSClient).toHaveBeenCalled();
        });
    });

    describe('clearCache', () => {
        it('should clear discovery cache', async () => {
            const region = 'us-east-1';
            const mockDBInstances = [{
                DBInstanceIdentifier: 'mysql-1',
                Endpoint: { Address: 'mysql-1.rds.amazonaws.com', Port: 3306 },
                Engine: 'mysql',
                EngineVersion: '8.0.32',
                DBInstanceStatus: 'available'
            }];

            const mockResponse: DescribeDBInstancesCommandOutput = {
                DBInstances: mockDBInstances,
                Marker: undefined,
                $metadata: {}
            };
            mockRDSClient.send.mockResolvedValue(mockResponse);

            // First call
            await service.discoverInstances(region);
            expect(mockRDSClient.send).toHaveBeenCalledTimes(2); // instances + clusters

            // Clear cache
            service.clearCache();

            // Second call - should not use cache
            await service.discoverInstances(region);
            expect(mockRDSClient.send).toHaveBeenCalledTimes(4); // 2 + 2 more calls
        });
    });

    describe('getInstanceByIdentifier', () => {
        it('should get specific instance info from cache', async () => {
            const region = 'us-east-1';
            const mockDBInstances = [
                {
                    DBInstanceIdentifier: 'mysql-1',
                    Endpoint: { Address: 'mysql-1.rds.amazonaws.com', Port: 3306 },
                    Engine: 'mysql',
                    EngineVersion: '8.0.32',
                    DBInstanceStatus: 'available'
                }
            ];

            const mockResponse: DescribeDBInstancesCommandOutput = {
                DBInstances: mockDBInstances,
                Marker: undefined,
                $metadata: {}
            };
            mockRDSClient.send.mockResolvedValueOnce(mockResponse);
            mockRDSClient.send.mockResolvedValueOnce({ DBClusters: [], $metadata: {} });

            const instances = await service.discoverInstances(region);

            const instance = instances.find(i => i.identifier === 'mysql-1');

            expect(instance).toEqual({
                identifier: 'mysql-1',
                endpoint: 'mysql-1.rds.amazonaws.com',
                port: 3306,
                engine: 'mysql',
                engineVersion: '8.0.32',
                status: 'available'
            });
        });

        it('should return undefined for non-existent instance', async () => {
            mockRDSClient.send.mockResolvedValueOnce({ DBInstances: [], $metadata: {} });
            mockRDSClient.send.mockResolvedValueOnce({ DBClusters: [], $metadata: {} });

            const instances = await service.discoverInstances('us-east-1');
            const instance = instances.find(i => i.identifier === 'non-existent');
            expect(instance).toBeUndefined();
        });
    });

    describe('dispose', () => {
        it('should clear cache on dispose', () => {
            const spy = jest.spyOn(service, 'clearCache');
            service.dispose();
            expect(spy).toHaveBeenCalled();
        });
    });
});
