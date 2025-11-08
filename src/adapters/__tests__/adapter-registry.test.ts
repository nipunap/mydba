import { AdapterRegistry } from '../adapter-registry';
import { MySQLAdapter } from '../mysql-adapter';
import { Logger } from '../../utils/logger';
import { ConnectionConfig } from '../../types';
import { EventBus } from '../../services/event-bus';
import { AuditLogger } from '../../services/audit-logger';

// Mock dependencies
jest.mock('../../utils/logger');
jest.mock('../../services/event-bus');
jest.mock('../../services/audit-logger');
jest.mock('../mysql-adapter');

describe('AdapterRegistry', () => {
    let registry: AdapterRegistry;
    let mockLogger: jest.Mocked<Logger>;
    let mockEventBus: jest.Mocked<EventBus>;
    let mockAuditLogger: jest.Mocked<AuditLogger>;
    let mockConfig: ConnectionConfig;

    beforeEach(() => {
        // Create mock logger
        mockLogger = {
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        } as unknown as jest.Mocked<Logger>;

        // Create mock EventBus
        mockEventBus = {} as jest.Mocked<EventBus>;

        // Create mock AuditLogger
        mockAuditLogger = {} as jest.Mocked<AuditLogger>;

        // Create test connection config
        mockConfig = {
            id: 'test-conn-1',
            name: 'Test Connection',
            type: 'mysql',
            host: 'localhost',
            port: 3306,
            user: 'root',
            password: 'password',
            environment: 'dev'
        };

        // Reset mocks
        jest.clearAllMocks();
    });

    describe('Initialization & Defaults', () => {
        it('should register mysql adapter by default', () => {
            registry = new AdapterRegistry(mockLogger);

            expect(registry.isSupported('mysql')).toBe(true);
            expect(mockLogger.info).toHaveBeenCalledWith('Registered default database adapters');
        });

        it('should register mariadb adapter by default', () => {
            registry = new AdapterRegistry(mockLogger);

            expect(registry.isSupported('mariadb')).toBe(true);
        });

        it('should log initialization', () => {
            registry = new AdapterRegistry(mockLogger);

            expect(mockLogger.info).toHaveBeenCalledWith('Registered default database adapters');
        });

        it('should accept optional EventBus', () => {
            registry = new AdapterRegistry(mockLogger, mockEventBus);

            expect(registry).toBeDefined();
        });

        it('should accept optional AuditLogger', () => {
            registry = new AdapterRegistry(mockLogger, mockEventBus, mockAuditLogger);

            expect(registry).toBeDefined();
        });
    });

    describe('Adapter Registration', () => {
        beforeEach(() => {
            registry = new AdapterRegistry(mockLogger);
            jest.clearAllMocks(); // Clear initialization logs
        });

        it('should register new adapter type', () => {
            const customFactory = jest.fn((config, logger) => new MySQLAdapter(config, logger));

            registry.register('postgresql', customFactory);

            expect(registry.isSupported('postgresql')).toBe(true);
            expect(mockLogger.debug).toHaveBeenCalledWith('Registered adapter factory: postgresql');
        });

        it('should warn when overwriting existing adapter', () => {
            const newFactory = jest.fn((config, logger) => new MySQLAdapter(config, logger));

            registry.register('mysql', newFactory);

            expect(mockLogger.warn).toHaveBeenCalledWith('Overwriting existing adapter factory for mysql');
            expect(mockLogger.debug).toHaveBeenCalledWith('Registered adapter factory: mysql');
        });

        it('should support custom adapter factories', () => {
            const customFactory = jest.fn((config, logger, eventBus, auditLogger) => {
                return new MySQLAdapter(config, logger, eventBus, auditLogger);
            });

            registry.register('custom', customFactory);

            expect(registry.isSupported('custom')).toBe(true);
        });
    });

    describe('Adapter Creation', () => {
        beforeEach(() => {
            registry = new AdapterRegistry(mockLogger, mockEventBus, mockAuditLogger);
            jest.clearAllMocks();
        });

        it('should create mysql adapter with config', () => {
            const adapter = registry.create('mysql', mockConfig);

            expect(adapter).toBeInstanceOf(MySQLAdapter);
            expect(mockLogger.debug).toHaveBeenCalledWith('Creating adapter: mysql');
        });

        it('should create mariadb adapter with config', () => {
            const mariadbConfig: ConnectionConfig = { ...mockConfig, type: 'mariadb' };

            const adapter = registry.create('mariadb', mariadbConfig);

            expect(adapter).toBeInstanceOf(MySQLAdapter);
            expect(mockLogger.debug).toHaveBeenCalledWith('Creating adapter: mariadb');
        });

        it('should throw error for unsupported type', () => {
            expect(() => {
                registry.create('postgresql', mockConfig);
            }).toThrow('Adapter not found for database type: postgresql');
        });

        it('should pass config and logger to factory', () => {
            const customFactory = jest.fn((config, logger) => {
                expect(config).toBe(mockConfig);
                expect(logger).toBe(mockLogger);
                return new MySQLAdapter(config, logger);
            });

            registry.register('test', customFactory);
            registry.create('test', mockConfig);

            expect(customFactory).toHaveBeenCalledWith(mockConfig, mockLogger, mockEventBus, mockAuditLogger);
        });

        it('should pass EventBus to factory', () => {
            const customFactory = jest.fn((config, logger, eventBus) => {
                expect(eventBus).toBe(mockEventBus);
                return new MySQLAdapter(config, logger, eventBus);
            });

            registry.register('test-eventbus', customFactory);
            registry.create('test-eventbus', mockConfig);

            expect(customFactory).toHaveBeenCalled();
        });

        it('should pass AuditLogger to factory', () => {
            const customFactory = jest.fn((config, logger, eventBus, auditLogger) => {
                expect(auditLogger).toBe(mockAuditLogger);
                return new MySQLAdapter(config, logger, eventBus, auditLogger);
            });

            registry.register('test-audit', customFactory);
            registry.create('test-audit', mockConfig);

            expect(customFactory).toHaveBeenCalled();
        });

        it('should log adapter creation', () => {
            registry.create('mysql', mockConfig);

            expect(mockLogger.debug).toHaveBeenCalledWith('Creating adapter: mysql');
        });
    });

    describe('Type Support Queries', () => {
        beforeEach(() => {
            registry = new AdapterRegistry(mockLogger);
        });

        it('should return supported types list', () => {
            const types = registry.getSupportedTypes();

            expect(types).toContain('mysql');
            expect(types).toContain('mariadb');
            expect(types.length).toBeGreaterThanOrEqual(2);
        });

        it('should correctly identify supported types', () => {
            expect(registry.isSupported('mysql')).toBe(true);
            expect(registry.isSupported('mariadb')).toBe(true);
        });

        it('should correctly identify unsupported types', () => {
            expect(registry.isSupported('postgresql')).toBe(false);
            expect(registry.isSupported('mongodb')).toBe(false);
            expect(registry.isSupported('sqlite')).toBe(false);
        });

        it('should update supported types after registration', () => {
            const customFactory = jest.fn((config, logger) => new MySQLAdapter(config, logger));

            registry.register('custom-db', customFactory);

            expect(registry.isSupported('custom-db')).toBe(true);
            expect(registry.getSupportedTypes()).toContain('custom-db');
        });
    });

    describe('Error Handling', () => {
        beforeEach(() => {
            registry = new AdapterRegistry(mockLogger);
        });

        it('should handle factory errors gracefully', () => {
            const errorFactory = jest.fn(() => {
                throw new Error('Factory initialization failed');
            });

            registry.register('error-db', errorFactory);

            expect(() => {
                registry.create('error-db', mockConfig);
            }).toThrow('Factory initialization failed');
        });

        it('should provide clear error messages for missing adapters', () => {
            expect(() => {
                registry.create('nonexistent', mockConfig);
            }).toThrow('Adapter not found for database type: nonexistent');
        });

        it('should not crash when getting supported types with no registrations', () => {
            // Create registry without calling registerDefaults (not possible with current implementation)
            // But we can test that getSupportedTypes always returns an array
            const types = registry.getSupportedTypes();

            expect(Array.isArray(types)).toBe(true);
        });
    });

    describe('Factory Dependencies', () => {
        beforeEach(() => {
            registry = new AdapterRegistry(mockLogger, mockEventBus, mockAuditLogger);
        });

        it('should work without EventBus', () => {
            const registryWithoutEventBus = new AdapterRegistry(mockLogger);
            const adapter = registryWithoutEventBus.create('mysql', mockConfig);

            expect(adapter).toBeInstanceOf(MySQLAdapter);
        });

        it('should work without AuditLogger', () => {
            const registryWithoutAudit = new AdapterRegistry(mockLogger, mockEventBus);
            const adapter = registryWithoutAudit.create('mysql', mockConfig);

            expect(adapter).toBeInstanceOf(MySQLAdapter);
        });

        it('should work with all dependencies', () => {
            const adapter = registry.create('mysql', mockConfig);

            expect(adapter).toBeInstanceOf(MySQLAdapter);
        });
    });
});
