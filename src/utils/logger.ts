import * as vscode from 'vscode';

export class Logger {
    private outputChannel: vscode.OutputChannel;

    constructor(private name: string) {
        this.outputChannel = vscode.window.createOutputChannel(name);
    }

    error(message: string, error?: Error, context?: object): void {
        const logMessage = this.formatMessage('ERROR', message, context);
        this.outputChannel.appendLine(logMessage);

        if (error) {
            this.outputChannel.appendLine(`Error: ${error.message}`);
            if (error.stack) {
                this.outputChannel.appendLine(error.stack);
            }
        }
        // Avoid util.format placeholder interpretation by passing a single string only
        let consoleMsg = `[${this.name}] ${logMessage}`;
        if (error?.stack) {
            consoleMsg += `\n${error.stack}`;
        } else if (error?.message) {
            consoleMsg += `\nError: ${error.message}`;
        }
        if (context) {
            consoleMsg += `\nContext: ${JSON.stringify(context)}`;
        }
        console.error(consoleMsg);
    }

    warn(message: string, context?: object): void {
        const logMessage = this.formatMessage('WARN', message, context);
        this.outputChannel.appendLine(logMessage);
        const consoleMsg = context
            ? `[${this.name}] ${logMessage}\nContext: ${JSON.stringify(context)}`
            : `[${this.name}] ${logMessage}`;
        console.warn(consoleMsg);
    }

    info(message: string, context?: object): void {
        const logMessage = this.formatMessage('INFO', message, context);
        this.outputChannel.appendLine(logMessage);
        const consoleMsg = context
            ? `[${this.name}] ${logMessage}\nContext: ${JSON.stringify(context)}`
            : `[${this.name}] ${logMessage}`;
        console.log(consoleMsg);
    }

    debug(message: string, context?: object): void {
        const logMessage = this.formatMessage('DEBUG', message, context);
        this.outputChannel.appendLine(logMessage);
        const consoleMsg = context
            ? `[${this.name}] ${logMessage}\nContext: ${JSON.stringify(context)}`
            : `[${this.name}] ${logMessage}`;
        console.debug(consoleMsg);
    }

    network(message: string, context?: object): void {
        const logMessage = this.formatMessage('NETWORK', message, context);
        this.outputChannel.appendLine(logMessage);
        const consoleMsg = context
            ? `[${this.name}] ${logMessage}\nContext: ${JSON.stringify(context)}`
            : `[${this.name}] ${logMessage}`;
        console.log(consoleMsg);
    }

    private formatMessage(level: string, message: string, context?: object): string {
        const timestamp = new Date().toISOString();
        const contextStr = context ? ` ${JSON.stringify(context)}` : '';
        return `[${timestamp}] [${level}] ${message}${contextStr}`;
    }

    show(): void {
        this.outputChannel.show();
    }

    dispose(): void {
        this.outputChannel.dispose();
    }
}
