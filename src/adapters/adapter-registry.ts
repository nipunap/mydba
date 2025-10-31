import { MySQLAdapter } from './mysql-adapter';
import { Logger } from '../utils/logger';
import { ConnectionConfig } from '../types';

type AdapterFactory = (config: ConnectionConfig, logger: Logger) => MySQLAdapter;

export class AdapterRegistry {
    private factories = new Map<string, AdapterFactory>();

    constructor(private logger: Logger) {
        this.registerDefaults();
    }

    private registerDefaults(): void {
        // Register MySQL adapter
        this.register('mysql', (config, logger) => new MySQLAdapter(config, logger));
        this.register('mariadb', (config, logger) => new MySQLAdapter(config, logger));

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
        return factory(config, this.logger);
    }

    getSupportedTypes(): string[] {
        return Array.from(this.factories.keys());
    }

    isSupported(type: string): boolean {
        return this.factories.has(type);
    }
}