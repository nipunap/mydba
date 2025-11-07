import * as vscode from 'vscode';
import { Logger } from './logger';

/**
 * Disposable Manager
 *
 * Centralized manager for tracking and disposing of all extension resources.
 * Helps prevent memory leaks and ensures clean shutdown.
 */
export class DisposableManager {
    private disposables: vscode.Disposable[] = [];
    private namedDisposables: Map<string, vscode.Disposable> = new Map();
    private disposed = false;

    constructor(private logger: Logger) {}

    /**
     * Add a disposable resource
     */
    add(disposable: vscode.Disposable, name?: string): void {
        if (this.disposed) {
            this.logger.warn('Attempted to add disposable after manager was disposed');
            disposable.dispose();
            return;
        }

        this.disposables.push(disposable);

        if (name) {
            if (this.namedDisposables.has(name)) {
                this.logger.warn(`Disposable with name "${name}" already exists. Disposing old one.`);
                this.namedDisposables.get(name)?.dispose();
            }
            this.namedDisposables.set(name, disposable);
        }

        this.logger.debug(`Added disposable${name ? ` "${name}"` : ''} (total: ${this.disposables.length})`);
    }

    /**
     * Add multiple disposables
     */
    addMany(disposables: vscode.Disposable[], prefix?: string): void {
        disposables.forEach((disposable, index) => {
            const name = prefix ? `${prefix}-${index}` : undefined;
            this.add(disposable, name);
        });
    }

    /**
     * Remove and dispose a specific disposable by name
     */
    remove(name: string): boolean {
        const disposable = this.namedDisposables.get(name);
        if (!disposable) {
            return false;
        }

        disposable.dispose();
        this.namedDisposables.delete(name);

        // Remove from main array
        const index = this.disposables.indexOf(disposable);
        if (index > -1) {
            this.disposables.splice(index, 1);
        }

        this.logger.debug(`Removed disposable "${name}" (remaining: ${this.disposables.length})`);
        return true;
    }

    /**
     * Get a disposable by name
     */
    get(name: string): vscode.Disposable | undefined {
        return this.namedDisposables.get(name);
    }

    /**
     * Check if a disposable exists by name
     */
    has(name: string): boolean {
        return this.namedDisposables.has(name);
    }

    /**
     * Get the number of tracked disposables
     */
    count(): number {
        return this.disposables.length;
    }

    /**
     * Get all disposable names
     */
    getNames(): string[] {
        return Array.from(this.namedDisposables.keys());
    }

    /**
     * Dispose all resources
     */
    dispose(): void {
        if (this.disposed) {
            this.logger.warn('DisposableManager already disposed');
            return;
        }

        this.logger.info(`Disposing ${this.disposables.length} resources...`);

        const errors: Error[] = [];

        // Dispose in reverse order (LIFO - Last In, First Out)
        while (this.disposables.length > 0) {
            const disposable = this.disposables.pop();
            try {
                disposable?.dispose();
            } catch (error) {
                errors.push(error as Error);
                this.logger.error('Error disposing resource:', error as Error);
            }
        }

        this.namedDisposables.clear();
        this.disposed = true;

        if (errors.length > 0) {
            this.logger.warn(`${errors.length} error(s) occurred during disposal`);
        } else {
            this.logger.info('All resources disposed successfully');
        }
    }

    /**
     * Check if the manager has been disposed
     */
    isDisposed(): boolean {
        return this.disposed;
    }

    /**
     * Create a child disposable manager
     * Useful for managing disposables in subsystems
     */
    createChild(name: string): DisposableManager {
        const child = new DisposableManager(this.logger);

        // When parent disposes, dispose child
        this.add({
            dispose: () => child.dispose()
        }, `child-manager-${name}`);

        return child;
    }

    /**
     * Create a scoped disposable that will be automatically cleaned up
     */
    async withScope<T>(
        name: string,
        fn: (scope: DisposableScope) => Promise<T>
    ): Promise<T> {
        const scope = new DisposableScope(this, name);

        try {
            return await fn(scope);
        } finally {
            scope.dispose();
        }
    }

    /**
     * Get diagnostic information about tracked disposables
     */
    getDiagnostics(): DisposableDiagnostics {
        return {
            totalCount: this.disposables.length,
            namedCount: this.namedDisposables.size,
            names: this.getNames(),
            disposed: this.disposed
        };
    }
}

/**
 * Scoped disposable container
 * All disposables added to this scope will be disposed when the scope ends
 */
export class DisposableScope implements vscode.Disposable {
    private scopeDisposables: vscode.Disposable[] = [];

    constructor(
        private manager: DisposableManager,
        private name: string
    ) {}

    /**
     * Add a disposable to this scope
     */
    add(disposable: vscode.Disposable): void {
        this.scopeDisposables.push(disposable);
    }

    /**
     * Dispose all disposables in this scope
     */
    dispose(): void {
        while (this.scopeDisposables.length > 0) {
            const disposable = this.scopeDisposables.pop();
            try {
                disposable?.dispose();
            } catch (error) {
                console.error(`Error disposing resource in scope "${this.name}":`, error);
            }
        }
    }
}

// Types

export interface DisposableDiagnostics {
    totalCount: number;
    namedCount: number;
    names: string[];
    disposed: boolean;
}
