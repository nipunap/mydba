/**
 * Lightweight state manager for webviews (Zustand-like)
 * Provides centralized state management with subscription support
 */

class StateManager {
    constructor(initialState = {}) {
        this.state = initialState;
        this.listeners = new Set();
        this.history = [];
        this.maxHistorySize = 50;
        this.devTools = window.__REDUX_DEVTOOLS_EXTENSION__;

        // Initialize DevTools if available
        if (this.devTools) {
            this.devToolsConnection = this.devTools.connect({
                name: 'MyDBA Webview'
            });

            this.devToolsConnection.init(this.state);
        }
    }

    /**
     * Get current state
     */
    getState() {
        return this.state;
    }

    /**
     * Set state (merge with existing state)
     */
    setState(updater) {
        const prevState = this.state;

        // Support function updater
        const newState = typeof updater === 'function'
            ? updater(prevState)
            : updater;

        // Merge with existing state
        this.state = { ...prevState, ...newState };

        // Add to history
        this.addToHistory(prevState, this.state);

        // Notify DevTools
        if (this.devToolsConnection) {
            this.devToolsConnection.send('setState', this.state);
        }

        // Notify all listeners
        this.notify();
    }

    /**
     * Subscribe to state changes
     */
    subscribe(listener) {
        this.listeners.add(listener);

        // Return unsubscribe function
        return () => {
            this.listeners.delete(listener);
        };
    }

    /**
     * Notify all listeners
     */
    notify() {
        this.listeners.forEach(listener => {
            try {
                listener(this.state);
            } catch (error) {
                console.error('Error in state listener:', error);
            }
        });
    }

    /**
     * Add state change to history
     */
    addToHistory(prevState, newState) {
        this.history.push({
            timestamp: Date.now(),
            prevState,
            newState
        });

        // Limit history size
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
        }
    }

    /**
     * Get state history
     */
    getHistory() {
        return this.history;
    }

    /**
     * Time travel to a specific state (for debugging)
     */
    timeTravel(index) {
        if (index >= 0 && index < this.history.length) {
            const entry = this.history[index];
            this.state = entry.newState;

            if (this.devToolsConnection) {
                this.devToolsConnection.send('timeTravel', this.state);
            }

            this.notify();
        }
    }

    /**
     * Reset state to initial
     */
    reset(initialState = {}) {
        this.state = initialState;
        this.history = [];

        if (this.devToolsConnection) {
            this.devToolsConnection.send('reset', this.state);
        }

        this.notify();
    }

    /**
     * Create a selector (memoized state getter)
     */
    createSelector(selector) {
        let lastState = null;
        let lastResult = null;

        return () => {
            const currentState = this.getState();

            if (currentState === lastState) {
                return lastResult;
            }

            lastState = currentState;
            lastResult = selector(currentState);
            return lastResult;
        };
    }

    /**
     * Dispose of the state manager
     */
    dispose() {
        this.listeners.clear();
        this.history = [];

        if (this.devToolsConnection) {
            this.devToolsConnection.unsubscribe();
        }
    }
}

/**
 * Create a state manager with actions
 */
function createStore(initialState = {}, actions = {}) {
    const manager = new StateManager(initialState);

    // Bind actions to state manager
    const boundActions = {};
    for (const [name, action] of Object.entries(actions)) {
        boundActions[name] = (...args) => {
            return action(manager.getState.bind(manager), manager.setState.bind(manager), ...args);
        };
    }

    return {
        getState: () => manager.getState(),
        setState: (updater) => manager.setState(updater),
        subscribe: (listener) => manager.subscribe(listener),
        actions: boundActions,
        history: () => manager.getHistory(),
        reset: () => manager.reset(initialState),
        dispose: () => manager.dispose()
    };
}

// Export for use in webviews
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StateManager, createStore };
}
