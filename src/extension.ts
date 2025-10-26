import * as vscode from 'vscode';
import { ServiceContainer, SERVICE_TOKENS } from './core/service-container';
import { ConnectionManager } from './services/connection-manager';
import { TreeViewProvider } from './providers/tree-view-provider';
import { CommandRegistry } from './commands/command-registry';
import { WebviewManager } from './webviews/webview-manager';
import { Logger } from './utils/logger';

let serviceContainer: ServiceContainer;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const startTime = Date.now();

    try {
        // Initialize logger
        const logger = new Logger('MyDBA');
        logger.info('Activating MyDBA extension...');

        // Initialize service container
        serviceContainer = new ServiceContainer(context, logger);
        await serviceContainer.initialize();

        // Register providers
        const treeViewProvider = serviceContainer.get(SERVICE_TOKENS.TreeViewProvider) as TreeViewProvider;
        const treeView = vscode.window.createTreeView('mydba.treeView', {
            treeDataProvider: treeViewProvider,
            showCollapseAll: true
        });
        context.subscriptions.push(treeView);

        // Register tree view refresh command
        context.subscriptions.push(
            vscode.commands.registerCommand('mydba.treeView.refresh', () => treeViewProvider.refresh())
        );

        // Register commands
        const commandRegistry = serviceContainer.get(SERVICE_TOKENS.CommandRegistry) as CommandRegistry;
        commandRegistry.registerCommands(context, treeViewProvider);

        // Register AI configuration command
        context.subscriptions.push(
            vscode.commands.registerCommand('mydba.configureAIProvider', async () => {
                try {
                    const { configureAIProvider } = await import('./commands/configure-ai-provider');
                    await configureAIProvider(context, logger, serviceContainer);
                } catch (error) {
                    logger.error('AI configuration command failed:', error as Error);
                    vscode.window.showErrorMessage('Failed to open AI configuration wizard');
                }
            })
        );

        // Initialize webview manager
        const webviewManager = serviceContainer.get(SERVICE_TOKENS.WebviewManager) as WebviewManager;
        webviewManager.initialize();

        // Create AI provider status bar item
        const aiStatusBar = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right, 
            100
        );
        aiStatusBar.command = 'mydba.configureAIProvider';
        aiStatusBar.tooltip = 'Click to configure AI Provider';
        context.subscriptions.push(aiStatusBar);

        // Update status bar with current provider
        const updateAIStatus = async () => {
            try {
                const config = vscode.workspace.getConfiguration('mydba.ai');
                const provider = config.get<string>('provider', 'auto');
                const enabled = config.get<boolean>('enabled', true);
                
                if (!enabled || provider === 'none') {
                    aiStatusBar.text = '$(circle-slash) AI: Off';
                    aiStatusBar.backgroundColor = undefined;
                    aiStatusBar.tooltip = 'AI features disabled. Click to configure.';
                } else {
                    // Show provider name
                    const providerNames: Record<string, string> = {
                        'auto': 'Auto',
                        'vscode-lm': 'Copilot',
                        'openai': 'OpenAI',
                        'anthropic': 'Claude',
                        'ollama': 'Ollama'
                    };
                    const displayName = providerNames[provider] || provider;
                    aiStatusBar.text = `$(sparkle) AI: ${displayName}`;
                    aiStatusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
                    aiStatusBar.tooltip = `AI Provider: ${displayName} (Click to reconfigure)`;

                }
                aiStatusBar.show();
            } catch (error) {
                logger.error('Failed to update AI status:', error as Error);
                aiStatusBar.text = '$(error) AI: Error';
                aiStatusBar.tooltip = 'Error checking AI status';
                aiStatusBar.show();
            }
        };

        // Initial update with delay to allow service initialization
        setTimeout(updateAIStatus, 1000);

        // Listen for config changes
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('mydba.ai')) {
                    updateAIStatus();
                }
            })
        );


        // Set up event listeners
        setupEventListeners(context, logger);

        // Load saved state
        await loadSavedState(context, logger);

        const activationTime = Date.now() - startTime;
        logger.info(`MyDBA activated successfully in ${activationTime}ms`);

        // Show welcome message for first-time users
        await showWelcomeMessage(context, logger);

    } catch (error) {
        console.error('Failed to activate MyDBA:', error);
        vscode.window.showErrorMessage('Failed to activate MyDBA extension. Check the output panel for details.');
    }
}

export function deactivate(): Promise<void> {
    if (serviceContainer) {
        return serviceContainer.dispose();
    }
    return Promise.resolve();
}

function setupEventListeners(context: vscode.ExtensionContext, logger: Logger): void {
    // Extension lifecycle events
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async (e) => {
            if (e.affectsConfiguration('mydba')) {
                logger.info('MyDBA configuration changed, reloading...');
                // TODO: Reload configuration-dependent services
            }
        })
    );

    // Window focus events for performance optimization
    context.subscriptions.push(
        vscode.window.onDidChangeWindowState((state) => {
            if (state.focused) {
                logger.debug('VSCode window focused, resuming metrics collection');
                // TODO: Resume metrics collection
            } else {
                logger.debug('VSCode window unfocused, pausing metrics collection');
                // TODO: Pause metrics collection to save battery
            }
        })
    );
}

async function loadSavedState(context: vscode.ExtensionContext, logger: Logger): Promise<void> {
    try {
        const connectionManager = serviceContainer.get(SERVICE_TOKENS.ConnectionManager) as ConnectionManager;
        await connectionManager.loadConnections();
        logger.info('Loaded saved connections');
    } catch (error) {
        logger.error('Failed to load saved state:', error instanceof Error ? error : new Error(String(error)));
    }
}

async function showWelcomeMessage(context: vscode.ExtensionContext, logger: Logger): Promise<void> {
    const hasShownWelcome = context.globalState.get('mydba.hasShownWelcome', false);

    if (!hasShownWelcome) {
        const action = await vscode.window.showInformationMessage(
            'Welcome to MyDBA! 🎉\n\nConnect to your database and start optimizing queries with AI-powered insights.',
            'Get Started',
            'View Documentation',
            'Later'
        );

        if (action === 'Get Started') {
            await vscode.commands.executeCommand('mydba.newConnection');
        } else if (action === 'View Documentation') {
            await vscode.env.openExternal(vscode.Uri.parse('https://github.com/your-org/mydba#readme'));
        }

        await context.globalState.update('mydba.hasShownWelcome', true);
    }
}
