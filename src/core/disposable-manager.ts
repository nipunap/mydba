import * as vscode from 'vscode';

/**
 * DisposableManager
 *
 * Simple helper to collect and dispose VS Code disposables in one place.
 */
export class DisposableManager {
    // Consumers that need a bare array (e.g., VSCode APIs) can use this bag.
    public readonly bag: vscode.Disposable[] = [];

    track<T extends vscode.Disposable>(disposable: T): T {
        this.bag.push(disposable);
        return disposable;
    }

    disposeAll(): void {
        while (this.bag.length) {
            const d = this.bag.pop();
            try {
                d?.dispose();
            } catch {
                // Best-effort dispose
            }
        }
    }
}
