import * as vscode from 'vscode';

export class ConfigurationService {
    constructor(private context: vscode.ExtensionContext) {}

    get<T>(key: string, defaultValue?: T): T {
        const config = vscode.workspace.getConfiguration('mydba');
        return config.get(key, defaultValue as T);
    }

    update(key: string, value: unknown, target?: vscode.ConfigurationTarget): Thenable<void> {
        const config = vscode.workspace.getConfiguration('mydba');
        return config.update(key, value, target);
    }

    onDidChangeConfiguration(listener: (e: vscode.ConfigurationChangeEvent) => void): vscode.Disposable {
        return vscode.workspace.onDidChangeConfiguration(listener);
    }
}
