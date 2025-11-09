/**
 * Mock VS Code API for Jest unit tests
 * This mock provides minimal implementations of VS Code APIs
 * to allow unit testing of modules that import 'vscode'
 */

export enum ConfigurationTarget {
    Global = 1,
    Workspace = 2,
    WorkspaceFolder = 3
}

export class EventEmitter<T> {
    private listeners: ((e: T) => unknown)[] = [];

    get event() {
        return (listener: (e: T) => unknown) => {
            this.listeners.push(listener);
            return {
                dispose: () => {
                    const index = this.listeners.indexOf(listener);
                    if (index > -1) {
                        this.listeners.splice(index, 1);
                    }
                }
            };
        };
    }

    fire(data: T): void {
        this.listeners.forEach(listener => listener(data));
    }

    dispose(): void {
        this.listeners = [];
    }
}

export class Uri {
    static file(path: string): Uri {
        return { fsPath: path } as Uri;
    }

    static parse(value: string): Uri {
        return { fsPath: value } as Uri;
    }

    static joinPath(base: Uri, ...paths: string[]): Uri {
        const basePath = base.fsPath || '';
        const joined = [basePath, ...paths].join('/').replace(/\/+/g, '/');
        return { fsPath: joined } as Uri;
    }

    fsPath: string = '';
}

export const window = {
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showQuickPick: jest.fn(),
    showInputBox: jest.fn(),
    createOutputChannel: jest.fn(() => ({
        appendLine: jest.fn(),
        append: jest.fn(),
        show: jest.fn(),
        hide: jest.fn(),
        dispose: jest.fn()
    })),
    createWebviewPanel: jest.fn(() => ({
        webview: {
            html: '',
            onDidReceiveMessage: jest.fn(),
            postMessage: jest.fn(),
            asWebviewUri: jest.fn((uri) => uri)
        },
        onDidDispose: jest.fn(),
        dispose: jest.fn(),
        reveal: jest.fn()
    })),
    createTreeView: jest.fn(),
    registerTreeDataProvider: jest.fn(),
    withProgress: jest.fn((_, task) => task()),
};

export const workspace = {
    getConfiguration: jest.fn(() => ({
        get: jest.fn(),
        update: jest.fn(),
        has: jest.fn(() => true),
        inspect: jest.fn()
    })),
    workspaceFolders: [],
    onDidChangeConfiguration: jest.fn(),
    onDidChangeWorkspaceFolders: jest.fn(),
    fs: {
        readFile: jest.fn(),
        writeFile: jest.fn(),
        delete: jest.fn(),
        createDirectory: jest.fn()
    }
};

export const commands = {
    registerCommand: jest.fn(() => ({
        dispose: jest.fn()
    })),
    executeCommand: jest.fn(),
};

export const env = {
    openExternal: jest.fn(),
    clipboard: {
        writeText: jest.fn(),
        readText: jest.fn()
    }
};

export enum ViewColumn {
    Active = -1,
    Beside = -2,
    One = 1,
    Two = 2,
    Three = 3
}

export enum TreeItemCollapsibleState {
    None = 0,
    Collapsed = 1,
    Expanded = 2
}

export class TreeItem {
    constructor(
        public label: string,
        public collapsibleState?: TreeItemCollapsibleState
    ) {}

    iconPath?: string | Uri | { light: string | Uri; dark: string | Uri };
    command?: {
        command: string;
        title: string;
        arguments?: unknown[];
    };
    contextValue?: string;
}

export enum ProgressLocation {
    SourceControl = 1,
    Window = 10,
    Notification = 15
}

export class CancellationTokenSource {
    token = {
        isCancellationRequested: false,
        onCancellationRequested: jest.fn()
    };

    cancel(): void {
        this.token.isCancellationRequested = true;
    }

    dispose(): void {
        // Mock dispose
    }
}

export const languages = {
    createDiagnosticCollection: jest.fn(() => ({
        set: jest.fn(),
        delete: jest.fn(),
        clear: jest.fn(),
        dispose: jest.fn()
    }))
};

export const extensions = {
    getExtension: jest.fn(),
    all: []
};

// Mock types
export interface ExtensionContext {
    subscriptions: { dispose(): unknown }[];
    workspaceState: {
        get: <T>(key: string) => T | undefined;
        update: (key: string, value: unknown) => Thenable<void>;
    };
    globalState: {
        get: <T>(key: string) => T | undefined;
        update: (key: string, value: unknown) => Thenable<void>;
    };
    extensionPath: string;
    asAbsolutePath: (relativePath: string) => string;
    storagePath?: string;
    globalStoragePath: string;
    logPath: string;
}

export interface Disposable {
    dispose(): unknown;
}

export interface QuickPickItem {
    label: string;
    description?: string;
    detail?: string;
}

export interface InputBoxOptions {
    value?: string;
    prompt?: string;
    placeHolder?: string;
    password?: boolean;
    validateInput?: (value: string) => string | undefined | null | Thenable<string | undefined | null>;
}

export interface OpenDialogOptions {
    canSelectFiles?: boolean;
    canSelectFolders?: boolean;
    canSelectMany?: boolean;
    filters?: { [name: string]: string[] };
    openLabel?: string;
}

export interface MessageOptions {
    modal?: boolean;
}

export interface MessageItem {
    title: string;
    isCloseAffordance?: boolean;
}

export interface ProgressOptions {
    location: ProgressLocation;
    title?: string;
    cancellable?: boolean;
}

export interface Progress<T> {
    report(value: T): void;
}

export interface CancellationToken {
    isCancellationRequested: boolean;
    onCancellationRequested: (listener: () => unknown) => Disposable;
}

export class ThemeColor {
    constructor(public id: string) {}
}
