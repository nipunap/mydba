import * as vscode from 'vscode';
import { Logger } from './logger';

/**
 * Error Recovery Service
 *
 * Handles graceful degradation and recovery from initialization errors.
 * Allows partial activation when some components fail.
 */
export class ErrorRecovery {
    private errors: Map<string, ActivationError> = new Map();
    private recoveryAttempts: Map<string, number> = new Map();
    private maxRetries = 3;

    constructor(private logger: Logger) {}

    /**
     * Record an activation error
     */
    recordError(component: string, error: Error, critical: boolean = false): void {
        const activationError: ActivationError = {
            component,
            error,
            timestamp: new Date(),
            critical,
            retries: this.recoveryAttempts.get(component) || 0
        };

        this.errors.set(component, activationError);
        this.logger.error(`Activation error in ${component}:`, error);

        if (critical) {
            this.logger.error(`CRITICAL ERROR in ${component} - extension may not function properly`);
        }
    }

    /**
     * Attempt to recover from an error
     */
    async attemptRecovery(
        component: string,
        recoveryFn: () => Promise<void>
    ): Promise<boolean> {
        const currentRetries = this.recoveryAttempts.get(component) || 0;

        if (currentRetries >= this.maxRetries) {
            this.logger.warn(`Max recovery attempts (${this.maxRetries}) reached for ${component}`);
            return false;
        }

        try {
            this.logger.info(`Attempting recovery for ${component} (attempt ${currentRetries + 1}/${this.maxRetries})`);
            await recoveryFn();

            // Success - clear error
            this.errors.delete(component);
            this.recoveryAttempts.delete(component);
            this.logger.info(`Successfully recovered ${component}`);
            return true;

        } catch (error) {
            this.recoveryAttempts.set(component, currentRetries + 1);
            this.logger.error(`Recovery attempt failed for ${component}:`, error as Error);
            return false;
        }
    }

    /**
     * Show error dialog with recovery options
     */
    async showErrorDialog(component: string, error: Error): Promise<ErrorAction> {
        const activationError = this.errors.get(component);
        const isCritical = activationError?.critical || false;
        const canRetry = (activationError?.retries || 0) < this.maxRetries;

        const message = isCritical
            ? `MyDBA failed to initialize ${component}. Extension may not function properly.`
            : `MyDBA encountered an error in ${component}. Some features may be unavailable.`;

        const actions: string[] = ['Show Details'];

        if (canRetry) {
            actions.unshift('Retry');
        }

        if (!isCritical) {
            actions.unshift('Continue');
        }

        const choice = await vscode.window.showErrorMessage(
            message,
            ...actions
        );

        switch (choice) {
            case 'Retry':
                return 'RETRY';
            case 'Continue':
                return 'CONTINUE';
            case 'Show Details':
                this.showErrorDetails(component, error);
                return 'DETAILS';
            default:
                return 'DISMISS';
        }
    }

    /**
     * Show detailed error information
     */
    private showErrorDetails(component: string, error: Error): void {
        const activationError = this.errors.get(component);

        const details = [
            `Component: ${component}`,
            `Error: ${error.message}`,
            `Timestamp: ${activationError?.timestamp.toLocaleString()}`,
            `Retries: ${activationError?.retries}/${this.maxRetries}`,
            `Critical: ${activationError?.critical ? 'Yes' : 'No'}`,
            '',
            'Stack Trace:',
            error.stack || 'No stack trace available'
        ].join('\n');

        const doc = vscode.workspace.openTextDocument({
            content: details,
            language: 'plaintext'
        });

        doc.then(document => {
            vscode.window.showTextDocument(document);
        });
    }

    /**
     * Check if there are any critical errors
     */
    hasCriticalErrors(): boolean {
        return Array.from(this.errors.values()).some(e => e.critical);
    }

    /**
     * Get all recorded errors
     */
    getErrors(): ActivationError[] {
        return Array.from(this.errors.values());
    }

    /**
     * Get errors for a specific component
     */
    getComponentError(component: string): ActivationError | undefined {
        return this.errors.get(component);
    }

    /**
     * Check if a component has errors
     */
    hasError(component: string): boolean {
        return this.errors.has(component);
    }

    /**
     * Clear all errors
     */
    clearErrors(): void {
        this.errors.clear();
        this.recoveryAttempts.clear();
        this.logger.info('All activation errors cleared');
    }

    /**
     * Clear error for a specific component
     */
    clearComponentError(component: string): boolean {
        const hadError = this.errors.delete(component);
        this.recoveryAttempts.delete(component);

        if (hadError) {
            this.logger.info(`Cleared error for ${component}`);
        }

        return hadError;
    }

    /**
     * Get recovery status summary
     */
    getStatus(): ErrorRecoveryStatus {
        const errors = this.getErrors();
        const criticalCount = errors.filter(e => e.critical).length;
        const nonCriticalCount = errors.length - criticalCount;

        return {
            totalErrors: errors.length,
            criticalErrors: criticalCount,
            nonCriticalErrors: nonCriticalCount,
            components: errors.map(e => ({
                name: e.component,
                critical: e.critical,
                retries: e.retries,
                canRetry: e.retries < this.maxRetries
            }))
        };
    }

    /**
     * Export errors for reporting/debugging
     */
    exportErrors(): string {
        const errors = this.getErrors();

        if (errors.length === 0) {
            return 'No errors recorded.';
        }

        return errors.map(e => {
            return [
                `Component: ${e.component}`,
                `Critical: ${e.critical}`,
                `Timestamp: ${e.timestamp.toISOString()}`,
                `Retries: ${e.retries}/${this.maxRetries}`,
                `Error: ${e.error.message}`,
                `Stack: ${e.error.stack}`,
                '---'
            ].join('\n');
        }).join('\n\n');
    }
}

// Types

export interface ActivationError {
    component: string;
    error: Error;
    timestamp: Date;
    critical: boolean;
    retries: number;
}

export type ErrorAction = 'RETRY' | 'CONTINUE' | 'DETAILS' | 'DISMISS';

export interface ErrorRecoveryStatus {
    totalErrors: number;
    criticalErrors: number;
    nonCriticalErrors: number;
    components: Array<{
        name: string;
        critical: boolean;
        retries: number;
        canRetry: boolean;
    }>;
}

/**
 * Helper function to safely initialize a component with error recovery
 */
export async function safeInitialize<T>(
    component: string,
    initFn: () => Promise<T>,
    errorRecovery: ErrorRecovery,
    critical: boolean = false
): Promise<T | null> {
    try {
        return await initFn();
    } catch (error) {
        errorRecovery.recordError(component, error as Error, critical);

        // Show error dialog
        const action = await errorRecovery.showErrorDialog(component, error as Error);

        if (action === 'RETRY') {
            const recovered = await errorRecovery.attemptRecovery(component, async () => { await initFn(); });
            if (recovered) {
                // Try one more time after successful recovery
                try {
                    return await initFn();
                } catch (retryError) {
                    errorRecovery.recordError(component, retryError as Error, critical);
                }
            }
        }

        // If critical and couldn't recover, throw
        if (critical && !errorRecovery.hasError(component)) {
            throw error;
        }

        return null;
    }
}
