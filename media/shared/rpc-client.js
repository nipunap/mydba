/**
 * JSON-RPC 2.0 client for extension-webview communication
 * Provides standardized request/response protocol
 */

class RPCClient {
    constructor(vscodeAPI) {
        this.vscode = vscodeAPI;
        this.pendingRequests = new Map();
        this.requestId = 0;
        this.messageHandlers = new Map();
        this.timeout = 30000; // 30 seconds default timeout

        // Listen for messages from extension
        window.addEventListener('message', (event) => {
            this.handleMessage(event.data);
        });
    }

    /**
     * Send a request to the extension
     */
    async request(method, params = {}, options = {}) {
        const id = ++this.requestId;
        const timeout = options.timeout || this.timeout;

        const message = {
            jsonrpc: '2.0',
            id,
            method,
            params
        };

        return new Promise((resolve, reject) => {
            // Set timeout
            const timeoutId = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(new Error(`Request timeout: ${method}`));
            }, timeout);

            // Store pending request
            this.pendingRequests.set(id, {
                resolve: (result) => {
                    clearTimeout(timeoutId);
                    resolve(result);
                },
                reject: (error) => {
                    clearTimeout(timeoutId);
                    reject(error);
                },
                method,
                timestamp: Date.now()
            });

            // Send message
            this.vscode.postMessage(message);
        });
    }

    /**
     * Send a notification (no response expected)
     */
    notify(method, params = {}) {
        const message = {
            jsonrpc: '2.0',
            method,
            params
        };

        this.vscode.postMessage(message);
    }

    /**
     * Register a handler for method calls from extension
     */
    on(method, handler) {
        if (!this.messageHandlers.has(method)) {
            this.messageHandlers.set(method, []);
        }

        this.messageHandlers.get(method).push(handler);

        // Return unsubscribe function
        return () => {
            const handlers = this.messageHandlers.get(method);
            if (handlers) {
                const index = handlers.indexOf(handler);
                if (index > -1) {
                    handlers.splice(index, 1);
                }
            }
        };
    }

    /**
     * Handle incoming messages
     */
    async handleMessage(message) {
        if (!message || message.jsonrpc !== '2.0') {
            console.warn('Invalid JSON-RPC message:', message);
            return;
        }

        // Handle response
        if ('result' in message || 'error' in message) {
            this.handleResponse(message);
            return;
        }

        // Handle request/notification
        if ('method' in message) {
            await this.handleRequest(message);
        }
    }

    /**
     * Handle response from extension
     */
    handleResponse(message) {
        const { id, result, error } = message;

        const pending = this.pendingRequests.get(id);
        if (!pending) {
            console.warn('Received response for unknown request:', id);
            return;
        }

        this.pendingRequests.delete(id);

        if (error) {
            pending.reject(new RPCError(error.code, error.message, error.data));
        } else {
            pending.resolve(result);
        }
    }

    /**
     * Handle request from extension
     */
    async handleRequest(message) {
        const { id, method, params } = message;

        const handlers = this.messageHandlers.get(method);
        if (!handlers || handlers.length === 0) {
            if (id) {
                // Send error response
                this.sendErrorResponse(id, -32601, `Method not found: ${method}`);
            }
            return;
        }

        try {
            // Call all handlers
            const results = await Promise.all(
                handlers.map(handler => handler(params))
            );

            // Send response (if it's a request, not a notification)
            if (id) {
                this.sendSuccessResponse(id, results[0]); // Return first result
            }
        } catch (error) {
            console.error(`Error handling ${method}:`, error);

            if (id) {
                this.sendErrorResponse(
                    id,
                    -32603,
                    error.message || 'Internal error',
                    { stack: error.stack }
                );
            }
        }
    }

    /**
     * Send success response
     */
    sendSuccessResponse(id, result) {
        this.vscode.postMessage({
            jsonrpc: '2.0',
            id,
            result
        });
    }

    /**
     * Send error response
     */
    sendErrorResponse(id, code, message, data = undefined) {
        this.vscode.postMessage({
            jsonrpc: '2.0',
            id,
            error: {
                code,
                message,
                data
            }
        });
    }

    /**
     * Get pending requests count
     */
    getPendingRequestsCount() {
        return this.pendingRequests.size;
    }

    /**
     * Cancel a pending request
     */
    cancelRequest(id) {
        const pending = this.pendingRequests.get(id);
        if (pending) {
            pending.reject(new Error('Request cancelled'));
            this.pendingRequests.delete(id);
        }
    }

    /**
     * Cancel all pending requests
     */
    cancelAllRequests() {
        for (const [id, pending] of this.pendingRequests) {
            pending.reject(new Error('All requests cancelled'));
        }
        this.pendingRequests.clear();
    }

    /**
     * Set default timeout
     */
    setTimeout(timeout) {
        this.timeout = timeout;
    }

    /**
     * Dispose of the RPC client
     */
    dispose() {
        this.cancelAllRequests();
        this.messageHandlers.clear();
    }
}

/**
 * RPC Error class
 */
class RPCError extends Error {
    constructor(code, message, data) {
        super(message);
        this.name = 'RPCError';
        this.code = code;
        this.data = data;
    }
}

/**
 * Standard JSON-RPC error codes
 */
const RPCErrorCodes = {
    PARSE_ERROR: -32700,
    INVALID_REQUEST: -32600,
    METHOD_NOT_FOUND: -32601,
    INVALID_PARAMS: -32602,
    INTERNAL_ERROR: -32603,
    SERVER_ERROR: -32000, // -32000 to -32099
    APPLICATION_ERROR: -1
};

/**
 * Create an RPC client instance
 */
function createRPCClient(vscodeAPI) {
    return new RPCClient(vscodeAPI);
}

// Export for use in webviews
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { RPCClient, RPCError, RPCErrorCodes, createRPCClient };
}
