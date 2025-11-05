/**
 * Error boundary for webviews
 * Catches and handles errors gracefully without crashing the entire webview
 */

class ErrorBoundary {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            fallback: options.fallback || this.defaultFallback.bind(this),
            onError: options.onError || console.error,
            resetOnError: options.resetOnError !== false,
            showStack: options.showStack !== false
        };

        this.hasError = false;
        this.error = null;
        this.errorInfo = null;

        // Set up global error handler
        this.setupGlobalErrorHandler();
    }

    /**
     * Set up global error handler
     */
    setupGlobalErrorHandler() {
        // Handle uncaught errors
        window.addEventListener('error', (event) => {
            this.handleError(event.error, { type: 'uncaught' });
            event.preventDefault();
        });

        // Handle unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            this.handleError(event.reason, { type: 'unhandled-rejection' });
            event.preventDefault();
        });
    }

    /**
     * Wrap a function with error handling
     */
    wrap(fn) {
        return (...args) => {
            try {
                const result = fn(...args);

                // Handle async functions
                if (result && typeof result.then === 'function') {
                    return result.catch((error) => {
                        this.handleError(error, { type: 'async-function' });
                        throw error;
                    });
                }

                return result;
            } catch (error) {
                this.handleError(error, { type: 'sync-function' });
                throw error;
            }
        };
    }

    /**
     * Wrap an async function with error handling
     */
    wrapAsync(fn) {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                this.handleError(error, { type: 'async-function' });
                throw error;
            }
        };
    }

    /**
     * Handle an error
     */
    handleError(error, info = {}) {
        this.hasError = true;
        this.error = error;
        this.errorInfo = {
            ...info,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent
        };

        // Call error callback
        try {
            this.options.onError(error, this.errorInfo);
        } catch (callbackError) {
            console.error('Error in error callback:', callbackError);
        }

        // Show fallback UI
        this.showFallback();
    }

    /**
     * Show fallback UI
     */
    showFallback() {
        if (!this.container) {
            return;
        }

        const fallbackContent = this.options.fallback(this.error, this.errorInfo);
        this.container.innerHTML = fallbackContent;

        // Add reset handler if reset button exists
        if (this.options.resetOnError) {
            const resetButton = this.container.querySelector('[data-reset]');
            if (resetButton) {
                resetButton.addEventListener('click', () => {
                    this.reset();
                });
            }
        }
    }

    /**
     * Default fallback UI
     */
    defaultFallback(error, info) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error && this.options.showStack
            ? error.stack
            : null;

        return `
            <div class="error-boundary">
                <div class="error-boundary-content">
                    <h2>⚠️ Something went wrong</h2>
                    <p class="error-message">${this.escapeHTML(errorMessage)}</p>

                    ${info.type ? `<p class="error-type">Error Type: ${info.type}</p>` : ''}

                    ${errorStack ? `
                        <details class="error-stack">
                            <summary>Stack Trace</summary>
                            <pre>${this.escapeHTML(errorStack)}</pre>
                        </details>
                    ` : ''}

                    <div class="error-actions">
                        <button data-reset class="error-reset-button">
                            🔄 Reload View
                        </button>
                        <button onclick="window.location.reload()" class="error-reload-button">
                            🔃 Reload Page
                        </button>
                    </div>

                    <p class="error-help">
                        If this problem persists, please check the developer console for more details.
                    </p>
                </div>
            </div>

            <style>
                .error-boundary {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 400px;
                    padding: 20px;
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                }

                .error-boundary-content {
                    max-width: 600px;
                    text-align: center;
                }

                .error-boundary h2 {
                    color: var(--vscode-errorForeground);
                    margin-bottom: 16px;
                }

                .error-message {
                    font-family: var(--vscode-editor-font-family);
                    background: var(--vscode-textBlockQuote-background);
                    border-left: 4px solid var(--vscode-errorForeground);
                    padding: 12px;
                    margin: 16px 0;
                    text-align: left;
                }

                .error-type {
                    color: var(--vscode-descriptionForeground);
                    font-size: 0.9em;
                    margin: 8px 0;
                }

                .error-stack {
                    margin: 16px 0;
                    text-align: left;
                }

                .error-stack summary {
                    cursor: pointer;
                    color: var(--vscode-textLink-foreground);
                    margin-bottom: 8px;
                }

                .error-stack pre {
                    font-family: var(--vscode-editor-font-family);
                    font-size: 0.85em;
                    background: var(--vscode-textBlockQuote-background);
                    padding: 12px;
                    overflow-x: auto;
                    border-radius: 4px;
                }

                .error-actions {
                    display: flex;
                    gap: 12px;
                    justify-content: center;
                    margin: 24px 0;
                }

                .error-reset-button,
                .error-reload-button {
                    padding: 8px 16px;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-family: var(--vscode-font-family);
                }

                .error-reset-button:hover,
                .error-reload-button:hover {
                    background: var(--vscode-button-hoverBackground);
                }

                .error-help {
                    color: var(--vscode-descriptionForeground);
                    font-size: 0.9em;
                    margin-top: 24px;
                }
            </style>
        `;
    }

    /**
     * Reset error state
     */
    reset() {
        this.hasError = false;
        this.error = null;
        this.errorInfo = null;

        if (this.container) {
            this.container.innerHTML = '';
        }

        // Emit reset event
        window.dispatchEvent(new CustomEvent('error-boundary-reset'));
    }

    /**
     * Check if error boundary has caught an error
     */
    hasErrorState() {
        return this.hasError;
    }

    /**
     * Get error information
     */
    getErrorInfo() {
        return {
            error: this.error,
            info: this.errorInfo
        };
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHTML(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Dispose of the error boundary
     */
    dispose() {
        // Note: Can't remove global error listeners as they might be used by other code
        this.reset();
    }
}

/**
 * Create an error boundary
 */
function createErrorBoundary(container, options) {
    return new ErrorBoundary(container, options);
}

/**
 * Try-catch wrapper with error boundary
 */
function withErrorBoundary(fn, errorBoundary) {
    return errorBoundary.wrap(fn);
}

/**
 * Async try-catch wrapper with error boundary
 */
function withAsyncErrorBoundary(fn, errorBoundary) {
    return errorBoundary.wrapAsync(fn);
}

// Export for use in webviews
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ErrorBoundary,
        createErrorBoundary,
        withErrorBoundary,
        withAsyncErrorBoundary
    };
}
