import * as vscode from 'vscode';
import { AIProvider, AIProviderConfig } from '../../types/ai-types';
import { Logger } from '../../utils/logger';
import { VSCodeLMProvider } from './providers/vscode-lm-provider';
import { OpenAIProvider } from './providers/openai-provider';
import { AnthropicProvider } from './providers/anthropic-provider';
import { OllamaProvider } from './providers/ollama-provider';

/**
 * AI Provider Factory
 *
 * Creates and manages AI provider instances based on configuration
 */
export class AIProviderFactory {
    constructor(
        private logger: Logger,
        private context: vscode.ExtensionContext
    ) {}

    /**
     * Create AI provider based on configuration
     */
    async createProvider(config: AIProviderConfig): Promise<AIProvider | null> {
        const provider = config.provider;

        if (provider === 'none' || !config.enabled) {
            this.logger.info('AI features disabled');
            return null;
        }

        if (provider === 'auto') {
            return await this.autoDetectProvider(config);
        }

        switch (provider) {
            case 'vscode-lm':
                return await this.createVSCodeLMProvider();
            case 'openai':
                return await this.createOpenAIProvider(config);
            case 'anthropic':
                return await this.createAnthropicProvider(config);
            case 'ollama':
                return await this.createOllamaProvider(config);
            default:
                throw new Error(`Unknown AI provider: ${provider}`);
        }
    }

    /**
     * Auto-detect the best available provider
     */
    private async autoDetectProvider(config: AIProviderConfig): Promise<AIProvider> {
        this.logger.info('Auto-detecting best AI provider...');

        // 1. Try VSCode Language Model (if available and user has Copilot)
        try {
            const vscodeLM = await this.createVSCodeLMProvider();
            if (vscodeLM && await vscodeLM.isAvailable()) {
                this.logger.info('Using VSCode Language Model (GitHub Copilot)');
                return vscodeLM;
            }
        } catch (e) {
            this.logger.debug('VSCode LM not available:', e as Error);
        }

        // 2. Try OpenAI (if API key configured)
        try {
            const openaiKey = await this.context.secrets.get('mydba.ai.openaiApiKey');
            if (openaiKey) {
                this.logger.info('Using OpenAI API');
                return await this.createOpenAIProvider(config);
            }
        } catch (e) {
            this.logger.debug('OpenAI not available:', e as Error);
        }

        // 3. Try Anthropic (if API key configured)
        try {
            const anthropicKey = await this.context.secrets.get('mydba.ai.anthropicApiKey');
            if (anthropicKey) {
                this.logger.info('Using Anthropic Claude API');
                return await this.createAnthropicProvider(config);
            }
        } catch (e) {
            this.logger.debug('Anthropic not available:', e as Error);
        }

        // 4. Try Ollama (local model)
        try {
            const ollama = await this.createOllamaProvider(config);
            if (ollama && await ollama.isAvailable()) {
                this.logger.info('Using Ollama (local model)');
                return ollama;
            }
        } catch (e) {
            this.logger.debug('Ollama not available:', e as Error);
        }

        // 5. No provider available - show setup prompt
        const choice = await vscode.window.showInformationMessage(
            'No AI provider configured. Configure one to enable AI-powered query analysis.',
            'Configure AI Provider',
            'Dismiss'
        );

        if (choice === 'Configure AI Provider') {
            await vscode.commands.executeCommand('mydba.configureAIProvider');
        }

        throw new Error('No AI provider available. Please configure one in settings.');
    }

    /**
     * Create VSCode Language Model provider
     */
    private async createVSCodeLMProvider(): Promise<AIProvider | null> {
        try {
            // Check if vscode.lm API is available
            if (typeof vscode.lm === 'undefined') {
                this.logger.debug('vscode.lm API not available (requires VSCode 1.90+)');
                return null;
            }

            return new VSCodeLMProvider(this.logger);
        } catch (error) {
            this.logger.warn('Failed to create VSCode LM provider:', error as Error);
            return null;
        }
    }

    /**
     * Create OpenAI provider
     */
    private async createOpenAIProvider(config: AIProviderConfig): Promise<AIProvider> {
        const apiKey = await this.context.secrets.get('mydba.ai.openaiApiKey');

        if (!apiKey) {
            throw new Error('OpenAI API key not configured. Run "MyDBA: Configure AI Provider" to set it up.');
        }

        return new OpenAIProvider(apiKey, config, this.logger);
    }

    /**
     * Create Anthropic provider
     */
    private async createAnthropicProvider(config: AIProviderConfig): Promise<AIProvider> {
        const apiKey = await this.context.secrets.get('mydba.ai.anthropicApiKey');

        if (!apiKey) {
            throw new Error('Anthropic API key not configured. Run "MyDBA: Configure AI Provider" to set it up.');
        }

        return new AnthropicProvider(apiKey, config, this.logger);
    }

    /**
     * Create Ollama provider
     */
    private async createOllamaProvider(config: AIProviderConfig): Promise<AIProvider> {
        return new OllamaProvider(config, this.logger);
    }
}
