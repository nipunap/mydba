import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

export interface ServiceToken<T> {
    readonly name: string;
}

export interface ServiceFactory<T> {
    (container: ServiceContainer): T;
}

export class ServiceContainer {
    private services = new Map<string, any>();
    private factories = new Map<string, ServiceFactory<any>>();
    private singletons = new Map<string, any>();

    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger
    ) {}

    async initialize(): Promise<void> {
        this.logger.info('Initializing service container...');

        // Register core services
        this.registerCoreServices();

        // Register business services
        this.registerBusinessServices();

        // Register providers
        this.registerProviders();

        this.logger.info('Service container initialized');
    }

    register<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void {
        this.factories.set(token.name, factory);
    }

    registerSingleton<T>(token: ServiceToken<T>, instance: T): void {
        this.singletons.set(token.name, instance);
    }

    get<T>(token: ServiceToken<T>): T {
        // Check singletons first
        if (this.singletons.has(token.name)) {
            return this.singletons.get(token.name);
        }

        // Check existing instances
        if (this.services.has(token.name)) {
            return this.services.get(token.name);
        }

        // Create new instance
        const factory = this.factories.get(token.name);
        if (!factory) {
            throw new Error(`Service not registered: ${token.name}`);
        }

        const instance = factory(this);
        this.services.set(token.name, instance);

        this.logger.debug(`Created service instance: ${token.name}`);
        return instance;
    }

    private registerCoreServices(): void {
        // Logger is already available as singleton
        this.registerSingleton(SERVICE_TOKENS.Logger, this.logger);

        // Configuration service
        this.register(SERVICE_TOKENS.ConfigurationService, (c) =>
            new ConfigurationService(c.context)
        );

        // Secret storage service
        this.register(SERVICE_TOKENS.SecretStorageService, (c) =>
            new SecretStorageService(c.context, c.get(SERVICE_TOKENS.Logger))
        );

        // Event bus
        this.register(SERVICE_TOKENS.EventBus, (c) =>
            new EventBus(c.get(SERVICE_TOKENS.Logger))
        );
    }

    private registerBusinessServices(): void {
        // Connection manager
        this.register(SERVICE_TOKENS.ConnectionManager, (c) =>
            new ConnectionManager(
                c.context,
                c.get(SERVICE_TOKENS.SecretStorageService),
                c.get(SERVICE_TOKENS.EventBus),
                c.get(SERVICE_TOKENS.Logger)
            )
        );

        // Adapter registry
        this.register(SERVICE_TOKENS.AdapterRegistry, (c) =>
            new AdapterRegistry(c.get(SERVICE_TOKENS.Logger))
        );

        // Query service
        this.register(SERVICE_TOKENS.QueryService, (c) =>
            new QueryService(c.get(SERVICE_TOKENS.Logger))
        );

        // AI service coordinator
        this.register(SERVICE_TOKENS.AIServiceCoordinator, (c) =>
            new AIServiceCoordinator(
                c.get(SERVICE_TOKENS.Logger),
                c.get(SERVICE_TOKENS.ConfigurationService)
            )
        );

        // Metrics collector
        this.register(SERVICE_TOKENS.MetricsCollector, (c) =>
            new MetricsCollector(
                c.get(SERVICE_TOKENS.ConnectionManager),
                c.get(SERVICE_TOKENS.EventBus),
                c.get(SERVICE_TOKENS.Logger)
            )
        );
    }

    private registerProviders(): void {
        // Tree view provider
        this.register(SERVICE_TOKENS.TreeViewProvider, (c) =>
            new TreeViewProvider(
                c.get(SERVICE_TOKENS.ConnectionManager),
                c.get(SERVICE_TOKENS.EventBus),
                c.get(SERVICE_TOKENS.Logger)
            )
        );

        // Webview manager
        this.register(SERVICE_TOKENS.WebviewManager, (c) =>
            new WebviewManager(
                c.context,
                c.get(SERVICE_TOKENS.Logger),
                c.get(SERVICE_TOKENS.ConnectionManager)
            )
        );

        // Command registry
        this.register(SERVICE_TOKENS.CommandRegistry, (c) =>
            new CommandRegistry(
                c.get(SERVICE_TOKENS.ConnectionManager),
                c.get(SERVICE_TOKENS.AIServiceCoordinator),
                c.get(SERVICE_TOKENS.WebviewManager),
                c.get(SERVICE_TOKENS.Logger)
            )
        );
    }

    async dispose(): Promise<void> {
        this.logger.info('Disposing service container...');

        // Dispose services in reverse order
        const serviceNames = Array.from(this.services.keys()).reverse();

        for (const serviceName of serviceNames) {
            try {
                const service = this.services.get(serviceName);
                if (service && typeof service.dispose === 'function') {
                    await service.dispose();
                    this.logger.debug(`Disposed service: ${serviceName}`);
                }
            } catch (error) {
                this.logger.error(`Error disposing service ${serviceName}:`, error instanceof Error ? error : new Error(String(error)));
            }
        }

        this.services.clear();
        this.factories.clear();
        this.singletons.clear();

        this.logger.info('Service container disposed');
    }
}

// Service tokens
export const SERVICE_TOKENS = {
    Logger: { name: 'Logger' } as ServiceToken<Logger>,
    ConfigurationService: { name: 'ConfigurationService' } as ServiceToken<ConfigurationService>,
    SecretStorageService: { name: 'SecretStorageService' } as ServiceToken<SecretStorageService>,
    EventBus: { name: 'EventBus' } as ServiceToken<EventBus>,
    ConnectionManager: { name: 'ConnectionManager' } as ServiceToken<ConnectionManager>,
    AdapterRegistry: { name: 'AdapterRegistry' } as ServiceToken<AdapterRegistry>,
    QueryService: { name: 'QueryService' } as ServiceToken<QueryService>,
    AIServiceCoordinator: { name: 'AIServiceCoordinator' } as ServiceToken<AIServiceCoordinator>,
    MetricsCollector: { name: 'MetricsCollector' } as ServiceToken<MetricsCollector>,
    TreeViewProvider: { name: 'TreeViewProvider' } as ServiceToken<TreeViewProvider>,
    CommandRegistry: { name: 'CommandRegistry' } as ServiceToken<CommandRegistry>,
    WebviewManager: { name: 'WebviewManager' } as ServiceToken<WebviewManager>
};

// Import service classes (will be implemented)
import { ConfigurationService } from '../services/configuration-service';
import { SecretStorageService } from '../services/secret-storage-service';
import { EventBus } from '../services/event-bus';
import { ConnectionManager } from '../services/connection-manager';
import { AdapterRegistry } from '../adapters/adapter-registry';
import { QueryService } from '../services/query-service';
import { AIServiceCoordinator } from '../services/ai-service-coordinator';
import { MetricsCollector } from '../services/metrics-collector';
import { TreeViewProvider } from '../providers/tree-view-provider';
import { CommandRegistry } from '../commands/command-registry';
import { WebviewManager } from '../webviews/webview-manager';
