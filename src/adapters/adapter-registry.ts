import { MySQLAdapter } from './mysql-adapter';
import { Logger } from '../utils/logger';
import { ConnectionConfig } from '../types';
import { EventBus } from '../services/event-bus';
import { AuditLogger } from '../services/audit-logger';

type AdapterFactory = (config: ConnectionConfig, logger: Logger, eventBus?: EventBus, auditLogger?: AuditLogger) => MySQLAdapter;

export class AdapterRegistry {
    private factories = new Map<string, AdapterFactory>();

    constructor(
        private logger: Logger,
        private eventBus?: EventBus,
        private auditLogger?: AuditLogger
    ) {
        this.registerDefaults();
    }

    private registerDefaults(): void {
        // Register MySQL adapter for MySQL and MariaDB (including AWS RDS variants)
        const mysqlFactory = (config: ConnectionConfig, logger: Logger, eventBus?: EventBus, auditLogger?: AuditLogger) =>
            new MySQLAdapter(config, logger, eventBus, auditLogger);

        this.register('mysql', mysqlFactory);
        this.register('mariadb', mysqlFactory);
        this.register('aws-rds-mysql', mysqlFactory);
        this.register('aws-rds-mariadb', mysqlFactory);

        this.logger.info('Registered default database adapters');
    }

    register(type: string, factory: AdapterFactory): void {
        if (this.factories.has(type)) {
            this.logger.warn(`Overwriting existing adapter factory for ${type}`);
        }
        this.factories.set(type, factory);
        this.logger.debug(`Registered adapter factory: ${type}`);
    }

    create(type: string, config: ConnectionConfig): MySQLAdapter {
        const factory = this.factories.get(type);
        if (!factory) {
            throw new Error(`Adapter not found for database type: ${type}`);
        }

        this.logger.debug(`Creating adapter: ${type}`);
        return factory(config, this.logger, this.eventBus, this.auditLogger);
    }

    getSupportedTypes(): string[] {
        return Array.from(this.factories.keys());
    }

    isSupported(type: string): boolean {
        return this.factories.has(type);
    }
}