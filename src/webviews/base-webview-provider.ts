import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../utils/logger';

export abstract class BaseWebviewProvider {
    protected _view?: vscode.WebviewView;
    protected _disposables: vscode.Disposable[] = [];

    constructor(
        protected context: vscode.ExtensionContext,
        protected logger: Logger
    ) {}

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.getResourceRoot()]
        };

        webviewView.webview.html = this.getHtml();
        this.setupMessageHandlers();

        this.logger.debug(`${this.constructor.name} webview resolved`);
    }

    protected abstract getHtml(): string;
    protected abstract setupMessageHandlers(): void;

    protected getResourceRoot(): vscode.Uri {
        return vscode.Uri.file(path.join(this.context.extensionPath, 'resources'));
    }

    protected getWebviewUri(...pathSegments: string[]): vscode.Uri {
        return this._view!.webview.asWebviewUri(
            vscode.Uri.file(path.join(this.context.extensionPath, ...pathSegments))
        );
    }

    protected postMessage(message: any): void {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    dispose(): void {
        this._disposables.forEach(d => d.dispose());
        this._disposables = [];
    }
}
