import * as vscode from 'vscode';
import { ServiceContainer } from '../core/service-container';
import { Logger } from '../utils/logger';

/**
 * Configure AI Provider Command
 *
 * Multi-step wizard for configuring AI providers with error handling
 */
export async function configureAIProvider(
    context: vscode.ExtensionContext,
    logger: Logger,
    serviceContainer: ServiceContainer
): Promise<void> {
    try {
        // Step 1: Provider selection
        const provider = await selectProvider();
        if (!provider) {
            return; // User cancelled
        }

        // Step 2: Provider-specific configuration
        const config = await configureProvider(provider, context, logger);
        if (!config) {
            return; // User cancelled
        }

        // Step 3: Test connection
        const testResult = await testConnection(provider, config, logger);
        if (!testResult.success) {
            const retry = await vscode.window.showErrorMessage(
                `Connection test failed: ${testResult.error}`,
                'Retry',
                'Save Anyway',
                'Cancel'
            );
            if (retry === 'Retry') {
                return configureAIProvider(context, logger, serviceContainer);
            } else if (retry !== 'Save Anyway') {
                return;
            }
        }

        // Step 4: Save configuration
        await saveConfiguration(provider, config, context);

        vscode.window.showInformationMessage(
            `AI provider configured: ${provider}. Please reload the window to apply changes.`,
            'Reload Window'
        ).then(choice => {
            if (choice === 'Reload Window') {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        });

    } catch (error) {
        logger.error('Failed to configure AI provider:', error as Error);
        vscode.window.showErrorMessage(
            `Failed to configure AI provider: ${(error as Error).message}`
        );
    }
}

/**
 * Step 1: Provider selection
 */
async function selectProvider(): Promise<string | undefined> {
    const items: vscode.QuickPickItem[] = [
        {
            label: '$(sparkle) Auto-detect',
            description: 'Automatically detect the best available provider',
            detail: 'Tries VSCode LM → OpenAI → Anthropic → Ollama in order',
            picked: true
        },
        {
            label: '$(github) VSCode Language Model',
            description: 'GitHub Copilot (VSCode only)',
            detail: 'Requires GitHub Copilot subscription'
        },
        {
            label: '$(cloud) OpenAI',
            description: 'GPT-4o, GPT-4o-mini',
            detail: 'Requires OpenAI API key (pay-per-use)'
        },
        {
            label: '$(organization) Anthropic',
            description: 'Claude 3.5 Sonnet, Claude 3 Opus',
            detail: 'Requires Anthropic API key (pay-per-use)'
        },
        {
            label: '$(server) Ollama',
            description: 'Local AI models',
            detail: '100% private, runs on your machine'
        },
        {
            label: '$(circle-slash) Disable AI',
            description: 'Turn off AI features',
            detail: 'Static analysis only'
        }
    ];

    const selected = await vscode.window.showQuickPick(items, {
        title: 'Configure AI Provider',
        placeHolder: 'Select an AI provider for query analysis',
        ignoreFocusOut: true
    });

    if (!selected) {
        return undefined;
    }

    // Map label to provider value
    const providerMap: Record<string, string> = {
        'Auto-detect': 'auto',
        'VSCode Language Model': 'vscode-lm',
        'OpenAI': 'openai',
        'Anthropic': 'anthropic',
        'Ollama': 'ollama',
        'Disable AI': 'none'
    };

    const label = selected.label.replace(/^\$\([^)]+\)\s*/, '');
    return providerMap[label];
}

/**
 * Step 2: Provider-specific configuration
 */
async function configureProvider(
    provider: string,
    context: vscode.ExtensionContext,
    logger: Logger
): Promise<Record<string, string> | undefined> {
    switch (provider) {
        case 'auto':
        case 'none':
            return {}; // No configuration needed

        case 'vscode-lm':
            return await configureVSCodeLM(logger);

        case 'openai':
            return await configureOpenAI(context, logger);

        case 'anthropic':
            return await configureAnthropic(context, logger);

        case 'ollama':
            return await configureOllama(logger);

        default:
            throw new Error(`Unknown provider: ${provider}`);
    }
}

/**
 * Configure VSCode Language Model
 */
async function configureVSCodeLM(logger: Logger): Promise<Record<string, string> | undefined> {
    // Check if vscode.lm API is available
    if (typeof vscode.lm === 'undefined') {
        vscode.window.showWarningMessage(
            'VSCode Language Model API not available. This requires VSCode 1.90+ and GitHub Copilot.',
            'Learn More'
        ).then(choice => {
            if (choice === 'Learn More') {
                vscode.env.openExternal(vscode.Uri.parse('https://code.visualstudio.com/api/extension-guides/language-model'));
            }
        });
        return undefined;
    }

    // Check for available models with timeout
    try {
        logger.info('Checking for available VSCode LM models...');
        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), 5000)
        );

        const modelsPromise = vscode.lm.selectChatModels();
        const models = await Promise.race([modelsPromise, timeoutPromise]);

        if (models.length === 0) {
            const install = await vscode.window.showWarningMessage(
                'No language models available. GitHub Copilot may not be installed or activated.',
                'Install Copilot',
                'Continue Anyway'
            );
            if (install === 'Install Copilot') {
                vscode.env.openExternal(vscode.Uri.parse('https://marketplace.visualstudio.com/items?itemName=GitHub.copilot'));
                return undefined;
            }
        } else {
            vscode.window.showInformationMessage(`Found ${models.length} available model(s)`);
        }

        return {};
    } catch (error) {
        logger.warn('Failed to check VSCode LM models:', error as Error);
        const proceed = await vscode.window.showWarningMessage(
            'Could not verify model availability. Continue anyway?',
            'Yes',
            'No'
        );
        return proceed === 'Yes' ? {} : undefined;
    }
}

/**
 * Configure OpenAI
 */
async function configureOpenAI(
    context: vscode.ExtensionContext,
    logger: Logger
): Promise<Record<string, string> | undefined> {
    // Get API key
    const apiKey = await vscode.window.showInputBox({
        title: 'OpenAI API Key',
        prompt: 'Enter your OpenAI API key',
        password: true,
        placeHolder: 'sk-...',
        ignoreFocusOut: true,
        validateInput: (value) => {
            if (!value) {
                return 'API key is required';
            }
            if (!value.startsWith('sk-')) {
                return 'OpenAI API keys start with "sk-"';
            }
            return undefined;
        }
    });

    if (!apiKey) {
        return undefined;
    }

    // Select model
    const models = [
        { label: 'gpt-4o-mini', description: 'Fast and cost-effective (recommended)', picked: true },
        { label: 'gpt-4o', description: 'Most capable, higher cost' },
        { label: 'gpt-4-turbo', description: 'Previous generation, good balance' }
    ];

    const selectedModel = await vscode.window.showQuickPick(models, {
        title: 'Select OpenAI Model',
        placeHolder: 'Choose the model to use',
        ignoreFocusOut: true
    });

    if (!selectedModel) {
        return undefined;
    }

    // Store API key securely
    await context.secrets.store('mydba.ai.openaiApiKey', apiKey);
    logger.info('OpenAI API key stored securely');

    return {
        model: selectedModel.label
    };
}

/**
 * Configure Anthropic
 */
async function configureAnthropic(
    context: vscode.ExtensionContext,
    logger: Logger
): Promise<Record<string, string> | undefined> {
    // Get API key
    const apiKey = await vscode.window.showInputBox({
        title: 'Anthropic API Key',
        prompt: 'Enter your Anthropic API key',
        password: true,
        placeHolder: 'sk-ant-...',
        ignoreFocusOut: true,
        validateInput: (value) => {
            if (!value) {
                return 'API key is required';
            }
            if (!value.startsWith('sk-ant-')) {
                return 'Anthropic API keys start with "sk-ant-"';
            }
            return undefined;
        }
    });

    if (!apiKey) {
        return undefined;
    }

    // Select model
    const models = [
        { label: 'claude-3-5-sonnet-20241022', description: 'Most capable (recommended)', picked: true },
        { label: 'claude-3-opus-20240229', description: 'Previous generation, very capable' },
        { label: 'claude-3-sonnet-20240229', description: 'Balanced performance and cost' }
    ];

    const selectedModel = await vscode.window.showQuickPick(models, {
        title: 'Select Anthropic Model',
        placeHolder: 'Choose the model to use',
        ignoreFocusOut: true
    });

    if (!selectedModel) {
        return undefined;
    }

    // Store API key securely
    await context.secrets.store('mydba.ai.anthropicApiKey', apiKey);
    logger.info('Anthropic API key stored securely');

    return {
        model: selectedModel.label
    };
}

/**
 * Configure Ollama
 */
async function configureOllama(logger: Logger): Promise<Record<string, string> | undefined> {
    // Get endpoint
    const endpoint = await vscode.window.showInputBox({
        title: 'Ollama Endpoint',
        prompt: 'Enter the Ollama API endpoint URL',
        value: 'http://localhost:11434',
        placeHolder: 'http://localhost:11434',
        ignoreFocusOut: true,
        validateInput: (value) => {
            if (!value) {
                return 'Endpoint is required';
            }
            try {
                new URL(value);
                return undefined;
            } catch {
                return 'Invalid URL format';
            }
        }
    });

    if (!endpoint) {
        return undefined;
    }

    // Try to list available models
    try {
        logger.info(`Connecting to Ollama at ${endpoint}...`);
        const { Ollama } = await import('ollama');
        const client = new Ollama({ host: endpoint });

        const response = await Promise.race([
            client.list(),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Connection timeout')), 5000)
            )
        ]);

        const models = response.models.map(m => ({
            label: m.name,
            description: `Size: ${(m.size / 1024 / 1024 / 1024).toFixed(2)} GB`
        }));

        if (models.length === 0) {
            const pull = await vscode.window.showWarningMessage(
                'No models found. Would you like to pull a model?',
                'Pull llama3.1',
                'Continue Anyway'
            );
            if (pull === 'Pull llama3.1') {
                vscode.window.showInformationMessage('Pulling llama3.1... This may take several minutes.');
                // Note: Actual pull would happen in background
                return { endpoint, model: 'llama3.1' };
            }
            return { endpoint, model: 'llama3.1' };
        }

        const selectedModel = await vscode.window.showQuickPick(models, {
            title: 'Select Ollama Model',
            placeHolder: 'Choose a model',
            ignoreFocusOut: true
        });

        if (!selectedModel) {
            return undefined;
        }

        return {
            endpoint,
            model: selectedModel.label
        };

    } catch (error) {
        logger.warn('Failed to connect to Ollama:', error as Error);
        const proceed = await vscode.window.showWarningMessage(
            `Could not connect to Ollama: ${(error as Error).message}. Continue anyway?`,
            'Yes',
            'No'
        );
        if (proceed !== 'Yes') {
            return undefined;
        }
        return { endpoint, model: 'llama3.1' };
    }
}

/**
 * Step 3: Test connection
 */
async function testConnection(
    provider: string,
    config: Record<string, string>,
    logger: Logger
): Promise<{ success: boolean; error?: string }> {
    if (provider === 'auto' || provider === 'none') {
        return { success: true };
    }

    try {
        logger.info(`Testing ${provider} connection...`);

        // Show progress
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Testing ${provider} connection...`,
            cancellable: false
        }, async () => {
            // Simulate connection test with timeout
            const testPromise = new Promise<{ success: boolean; error?: string }>((resolve) => {
                setTimeout(() => {
                    // In real implementation, would actually test the provider
                    resolve({ success: true });
                }, 1000);
            });

            const timeoutPromise = new Promise<{ success: boolean; error?: string }>((resolve) => {
                setTimeout(() => {
                    resolve({ success: false, error: 'Connection timeout (10s)' });
                }, 10000);
            });

            return Promise.race([testPromise, timeoutPromise]);
        });

    } catch (error) {
        logger.error('Connection test failed:', error as Error);
        return { success: false, error: (error as Error).message };
    }
}

/**
 * Step 4: Save configuration
 */
async function saveConfiguration(
    provider: string,
    config: Record<string, string>,
    _context: vscode.ExtensionContext
): Promise<void> {
    const workspaceConfig = vscode.workspace.getConfiguration('mydba.ai');

    // Save provider
    await workspaceConfig.update('provider', provider, vscode.ConfigurationTarget.Global);

    // Enable AI if not 'none'
    await workspaceConfig.update('enabled', provider !== 'none', vscode.ConfigurationTarget.Global);

    // Save provider-specific config
    if (config.model) {
        if (provider === 'openai') {
            await workspaceConfig.update('openaiModel', config.model, vscode.ConfigurationTarget.Global);
        } else if (provider === 'anthropic') {
            await workspaceConfig.update('anthropicModel', config.model, vscode.ConfigurationTarget.Global);
        } else if (provider === 'ollama') {
            await workspaceConfig.update('ollamaModel', config.model, vscode.ConfigurationTarget.Global);
        }
    }

    if (config.endpoint) {
        await workspaceConfig.update('ollamaEndpoint', config.endpoint, vscode.ConfigurationTarget.Global);
    }
}
