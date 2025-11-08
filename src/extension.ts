import * as vscode from 'vscode';
import { ServiceContainer, SERVICE_TOKENS } from './core/service-container';
import { ConnectionManager } from './services/connection-manager';
import { TreeViewProvider } from './providers/tree-view-provider';
import { CommandRegistry } from './commands/command-registry';
import { WebviewManager } from './webviews/webview-manager';
import { Logger } from './utils/logger';
import { MyDBAChatParticipant } from './chat/chat-participant';

let serviceContainer: ServiceContainer;

// Track activation retry attempts to prevent infinite recursion
let activationRetryCount = 0;
const MAX_ACTIVATION_RETRIES = 3;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const startTime = Date.now();

    // Initialize logger first (outside try-catch so we can log errors)
    const logger = new Logger('MyDBA');
    logger.info('Activating MyDBA extension...');

    try {
        // Initialize service container
        serviceContainer = new ServiceContainer(context, logger);
        await serviceContainer.initialize();

        // Get performance monitor from service container
        const perfMon = serviceContainer.get(SERVICE_TOKENS.PerformanceMonitor);
        const activationSpan = perfMon.startSpan('extension.activate');

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

        // Register chat participant (if enabled and supported)
        const config = vscode.workspace.getConfiguration('mydba');
        const chatEnabled = config.get<boolean>('ai.chatEnabled', true);

        if (chatEnabled && vscode.chat) {
            try {
                const chatParticipant = new MyDBAChatParticipant(context, logger, serviceContainer);
                context.subscriptions.push(chatParticipant);
                logger.info('Chat participant registered successfully');
            } catch (error) {
                logger.warn('Chat participant registration failed (may not be supported in this environment):', error as Error);
            }
        } else {
            logger.info('Chat participant disabled or not supported');
        }

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

        // End performance span
        perfMon.endSpan(activationSpan, { activationTime });

        // Show welcome message for first-time users
        await showWelcomeMessage(context, logger);

        // Reset retry counter on successful activation
        activationRetryCount = 0;

    } catch (error) {
        logger.error('Failed to activate MyDBA:', error as Error);

        // Show detailed error message with recovery options
        await handleActivationError(context, logger, error as Error);
    }
}

/**
 * Handle activation errors with user-friendly recovery options
 */
async function handleActivationError(
    context: vscode.ExtensionContext,
    logger: Logger,
    error: Error
): Promise<void> {
    // Determine error type and provide specific guidance
    const errorMessage = error.message || 'Unknown error';
    let userMessage = 'MyDBA failed to initialize';
    let detailedMessage = errorMessage;

    // Categorize errors
    if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('connection')) {
        userMessage = 'MyDBA: Connection Service Error';
        detailedMessage = 'Failed to initialize connection services. Your database connections may not work until this is resolved.';
    } else if (errorMessage.includes('AI') || errorMessage.includes('provider')) {
        userMessage = 'MyDBA: AI Service Error';
        detailedMessage = 'Failed to initialize AI services. Query analysis features will be unavailable, but core database features will work.';
    } else if (errorMessage.includes('SecretStorage') || errorMessage.includes('credentials')) {
        userMessage = 'MyDBA: Credential Storage Error';
        detailedMessage = 'Failed to access secure credential storage. You may need to re-enter your database passwords.';
    }

    // Show error with recovery options
    const action = await vscode.window.showErrorMessage(
        `${userMessage}: ${detailedMessage}`,
        { modal: false },
        'Retry Activation',
        'Reset Settings',
        'View Logs',
        'Continue (Limited Mode)',
        'Disable Extension'
    );

    logger.info(`User selected error recovery action: ${action || 'dismissed'}`);

    switch (action) {
        case 'Retry Activation':
            await retryActivation(context, logger);
            break;

        case 'Reset Settings':
            await resetSettings(context, logger);
            break;

        case 'View Logs':
            await viewLogs(logger);
            break;

        case 'Continue (Limited Mode)':
            await continueInLimitedMode(context, logger);
            break;

        case 'Disable Extension':
            await disableExtension(context, logger);
            break;

        default:
            // User dismissed - try limited mode automatically
            logger.info('User dismissed error dialog, attempting limited mode');
            await continueInLimitedMode(context, logger);
            break;
    }
}

/**
 * Retry activation after a short delay with exponential backoff
 * Prevents infinite recursion by limiting retry attempts
 */
async function retryActivation(context: vscode.ExtensionContext, logger: Logger): Promise<void> {
    // Check if we've exceeded max retries
    if (activationRetryCount >= MAX_ACTIVATION_RETRIES) {
        logger.error(`Maximum activation retry attempts (${MAX_ACTIVATION_RETRIES}) reached`);
        vscode.window.showErrorMessage(
            `MyDBA: Failed to activate after ${MAX_ACTIVATION_RETRIES} attempts. Please check logs and try reloading the window.`,
            'View Logs',
            'Reload Window',
            'Continue (Limited Mode)'
        ).then(async selection => {
            if (selection === 'View Logs') {
                await viewLogs(logger);
            } else if (selection === 'Reload Window') {
                // Reset counter before reload
                activationRetryCount = 0;
                await vscode.commands.executeCommand('workbench.action.reloadWindow');
            } else if (selection === 'Continue (Limited Mode)') {
                await continueInLimitedMode(context, logger);
            }
        });
        return;
    }

    // Increment retry counter
    activationRetryCount++;
    const retryDelay = Math.min(1000 * Math.pow(2, activationRetryCount - 1), 5000); // Exponential backoff, max 5s

    logger.info(`Retrying activation (attempt ${activationRetryCount}/${MAX_ACTIVATION_RETRIES}) with ${retryDelay}ms delay...`);

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `MyDBA: Retrying activation (${activationRetryCount}/${MAX_ACTIVATION_RETRIES})...`,
            cancellable: false
        },
        async () => {
            // Wait with exponential backoff
            await new Promise(resolve => setTimeout(resolve, retryDelay));

            try {
                // Dispose existing container if it exists
                if (serviceContainer) {
                    logger.debug('Disposing existing service container before retry');
                    await serviceContainer.dispose();
                }

                // Re-run activation (which will reset counter on success)
                await activate(context);
                vscode.window.showInformationMessage('✅ MyDBA: Activation successful!');
            } catch (retryError) {
                logger.error(`Retry activation failed (attempt ${activationRetryCount}/${MAX_ACTIVATION_RETRIES}):`, retryError as Error);

                // If we haven't hit max retries, show error with option to retry again
                if (activationRetryCount < MAX_ACTIVATION_RETRIES) {
                    const remainingAttempts = MAX_ACTIVATION_RETRIES - activationRetryCount;
                    vscode.window.showErrorMessage(
                        `MyDBA: Retry failed. ${remainingAttempts} attempt(s) remaining. ${(retryError as Error).message}`,
                        'Retry Again',
                        'View Logs',
                        'Give Up'
                    ).then(async selection => {
                        if (selection === 'Retry Again') {
                            await retryActivation(context, logger);
                        } else if (selection === 'View Logs') {
                            await viewLogs(logger);
                        } else if (selection === 'Give Up') {
                            await continueInLimitedMode(context, logger);
                        }
                    });
                } else {
                    // Max retries reached, handled by the check at the top on next call
                    vscode.window.showErrorMessage(
                        `MyDBA: All retry attempts exhausted. ${(retryError as Error).message}`,
                        'View Logs',
                        'Reload Window'
                    ).then(async selection => {
                        if (selection === 'View Logs') {
                            await viewLogs(logger);
                        } else if (selection === 'Reload Window') {
                            activationRetryCount = 0; // Reset before reload
                            await vscode.commands.executeCommand('workbench.action.reloadWindow');
                        }
                    });
                }
            }
        }
    );
}

/**
 * Reset MyDBA settings to defaults
 */
async function resetSettings(context: vscode.ExtensionContext, logger: Logger): Promise<void> {
    logger.info('Resetting MyDBA settings...');

    const confirm = await vscode.window.showWarningMessage(
        'Reset all MyDBA settings to default? This will clear connections, AI configuration, and preferences.',
        { modal: true },
        'Reset Settings',
        'Cancel'
    );

    if (confirm !== 'Reset Settings') {
        return;
    }

    try {
        // Clear workspace state
        const keys = context.workspaceState.keys();
        for (const key of keys) {
            if (key.startsWith('mydba.')) {
                await context.workspaceState.update(key, undefined);
            }
        }

        // Clear global state
        const globalKeys = context.globalState.keys();
        for (const key of globalKeys) {
            if (key.startsWith('mydba.')) {
                await context.globalState.update(key, undefined);
            }
        }

        // Note: We cannot clear secrets programmatically for security reasons
        // User will need to reconnect to clear stored credentials

        // Reset activation retry counter
        activationRetryCount = 0;

        vscode.window.showInformationMessage(
            'MyDBA settings reset. Reloading window...',
            'Reload Now'
        ).then(selection => {
            if (selection === 'Reload Now') {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        });

        logger.info('Settings reset complete');
    } catch (error) {
        logger.error('Failed to reset settings:', error as Error);
        vscode.window.showErrorMessage(`Failed to reset settings: ${(error as Error).message}`);
    }
}

/**
 * Show logs in output panel
 */
async function viewLogs(_logger: Logger): Promise<void> {
    // The logger should have a method to show the output channel
    // For now, we'll open the output panel
    vscode.commands.executeCommand('workbench.action.output.toggleOutput');
}

/**
 * Continue with limited functionality (graceful degradation)
 */
async function continueInLimitedMode(context: vscode.ExtensionContext, logger: Logger): Promise<void> {
    logger.info('Continuing in limited mode...');

    try {
        // Try to register only basic commands
        const basicCommands = [
            vscode.commands.registerCommand('mydba.newConnection', () => {
                vscode.window.showWarningMessage('MyDBA is running in limited mode. Full activation failed.');
            }),
            vscode.commands.registerCommand('mydba.configureAIProvider', async () => {
                try {
                    // Check if service container is available
                    if (!serviceContainer) {
                        logger.warn('AI configuration attempted without service container in limited mode');
                        vscode.window.showWarningMessage(
                            'AI configuration is unavailable in limited mode. Please retry full activation first.',
                            'Retry Activation'
                        ).then(async (selection) => {
                            if (selection === 'Retry Activation') {
                                await retryActivation(context, logger);
                            }
                        });
                        return;
                    }

                    const { configureAIProvider } = await import('./commands/configure-ai-provider');
                    await configureAIProvider(context, logger, serviceContainer);
                } catch (error) {
                    logger.error('AI configuration failed:', error as Error);
                    vscode.window.showErrorMessage('AI configuration unavailable in limited mode');
                }
            })
        ];

        basicCommands.forEach(cmd => context.subscriptions.push(cmd));

        vscode.window.showWarningMessage(
            'MyDBA is running in limited mode. Some features may be unavailable.',
            'View Logs',
            'Retry Activation'
        ).then(async selection => {
            if (selection === 'View Logs') {
                await viewLogs(logger);
            } else if (selection === 'Retry Activation') {
                await retryActivation(context, logger);
            }
        });

        logger.info('Limited mode activated');
    } catch (error) {
        logger.error('Failed to activate limited mode:', error as Error);
        vscode.window.showErrorMessage('MyDBA could not start even in limited mode. Please check logs.');
    }
}

/**
 * Disable the extension
 */
async function disableExtension(context: vscode.ExtensionContext, logger: Logger): Promise<void> {
    logger.info('User requested to disable extension');

    const confirm = await vscode.window.showWarningMessage(
        'Disable MyDBA extension? You can re-enable it from the Extensions panel.',
        { modal: true },
        'Disable',
        'Cancel'
    );

    if (confirm === 'Disable') {
        // Note: Extensions cannot disable themselves programmatically
        // We'll guide the user to do it manually
        vscode.window.showInformationMessage(
            'To disable MyDBA, go to Extensions panel, find MyDBA, and click Disable.',
            'Open Extensions'
        ).then(selection => {
            if (selection === 'Open Extensions') {
                vscode.commands.executeCommand('workbench.view.extensions', { query: '@installed MyDBA' });
            }
        });
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
                logger.info('MyDBA configuration changed, reloading affected services...');
                await reloadConfiguration(e, logger);
            }
        })
    );

    // Window focus events for performance optimization
    context.subscriptions.push(
        vscode.window.onDidChangeWindowState((state) => {
            if (state.focused) {
                logger.debug('VSCode window focused');
                // Metrics collection handled by individual services
            } else {
                logger.debug('VSCode window unfocused');
                // Metrics collection handled by individual services
            }
        })
    );
}

/**
 * Reload configuration-dependent services without restarting
 */
async function reloadConfiguration(
    event: vscode.ConfigurationChangeEvent,
    logger: Logger
): Promise<void> {
    try {
        const treeViewProvider = serviceContainer.get(SERVICE_TOKENS.TreeViewProvider) as TreeViewProvider;

        // AI configuration changes
        if (event.affectsConfiguration('mydba.ai')) {
            logger.info('AI configuration changed, reloading AI services...');

            const aiServiceCoordinator = serviceContainer.get(SERVICE_TOKENS.AIServiceCoordinator);
            if (aiServiceCoordinator && 'reinitialize' in aiServiceCoordinator &&
                typeof aiServiceCoordinator.reinitialize === 'function') {
                await aiServiceCoordinator.reinitialize();
                logger.info('AI services reloaded successfully');
            }

            // Update status bar (handled by existing listener)
            vscode.window.showInformationMessage('AI configuration updated');
        }

        // Connection configuration changes
        if (event.affectsConfiguration('mydba.connection')) {
            logger.info('Connection configuration changed, refreshing tree view...');
            treeViewProvider.refresh();
            vscode.window.showInformationMessage('Connection settings updated');
        }

        // Query configuration changes
        if (event.affectsConfiguration('mydba.query')) {
            logger.info('Query configuration changed');
            vscode.window.showInformationMessage('Query settings updated');
        }

        // Security configuration changes
        if (event.affectsConfiguration('mydba.security')) {
            logger.info('Security configuration changed');
            vscode.window.showInformationMessage('Security settings updated - please review your connections');
        }

        // Cache configuration changes
        if (event.affectsConfiguration('mydba.cache')) {
            logger.info('Cache configuration changed, clearing caches...');

            const cacheManager = serviceContainer.get(SERVICE_TOKENS.CacheManager);
            if (cacheManager && 'clear' in cacheManager &&
                typeof cacheManager.clear === 'function') {
                cacheManager.clear();
                logger.info('Caches cleared successfully');
            }

            vscode.window.showInformationMessage('Cache settings updated');
        }

        // Metrics configuration changes
        if (event.affectsConfiguration('mydba.metrics')) {
            logger.info('Metrics configuration changed');
            vscode.window.showInformationMessage('Metrics collection settings updated');
        }

        // Logging level changes
        if (event.affectsConfiguration('mydba.logging')) {
            logger.info('Logging configuration changed - restart extension to apply');
            vscode.window.showInformationMessage(
                'Logging settings updated. Reload window to apply changes.',
                'Reload Window'
            ).then(selection => {
                if (selection === 'Reload Window') {
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            });
        }

    } catch (error) {
        logger.error('Failed to reload configuration:', error as Error);
        vscode.window.showWarningMessage(
            `Failed to reload some settings: ${(error as Error).message}. You may need to reload the window.`,
            'Reload Window'
        ).then(selection => {
            if (selection === 'Reload Window') {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        });
    }
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

async function showWelcomeMessage(context: vscode.ExtensionContext, _logger: Logger): Promise<void> {
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
            await vscode.env.openExternal(vscode.Uri.parse('https://github.com/nipunap/mydba#readme'));
        }

        await context.globalState.update('mydba.hasShownWelcome', true);
    }
}
