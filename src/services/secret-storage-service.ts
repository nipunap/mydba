import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

export interface Credentials {
    password?: string;
    sshKey?: string;
    sshPassphrase?: string;
}

export class SecretStorageService {
    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger
    ) {}

    async store(key: string, value: string): Promise<void> {
        try {
            await this.context.secrets.store(key, value);
            this.logger.debug(`Stored secret: ${key}`);
        } catch {
            this.logger.error(`Failed to store secret ${key}:`, error as Error);
            throw error;
        }
    }

    async get(key: string): Promise<string | undefined> {
        try {
            const value = await this.context.secrets.get(key);
            this.logger.debug(`Retrieved secret: ${key}`);
            return value;
        } catch {
            this.logger.error(`Failed to get secret ${key}:`, error as Error);
            throw error;
        }
    }

    async delete(key: string): Promise<void> {
        try {
            await this.context.secrets.delete(key);
            this.logger.debug(`Deleted secret: ${key}`);
        } catch {
            this.logger.error(`Failed to delete secret ${key}:`, error as Error);
            throw error;
        }
    }

    async storeCredentials(connectionId: string, credentials: Credentials): Promise<void> {
        const promises: Promise<void>[] = [];

        if (credentials.password) {
            promises.push(this.store(`mydba.connection.${connectionId}.password`, credentials.password));
        }

        if (credentials.sshKey) {
            promises.push(this.store(`mydba.connection.${connectionId}.sshKey`, credentials.sshKey));
        }

        if (credentials.sshPassphrase) {
            promises.push(this.store(`mydba.connection.${connectionId}.sshPassphrase`, credentials.sshPassphrase));
        }

        await Promise.all(promises);
    }

    async getCredentials(connectionId: string): Promise<Credentials> {
        const [password, sshKey, sshPassphrase] = await Promise.all([
            this.get(`mydba.connection.${connectionId}.password`),
            this.get(`mydba.connection.${connectionId}.sshKey`),
            this.get(`mydba.connection.${connectionId}.sshPassphrase`)
        ]);

        return { password, sshKey, sshPassphrase };
    }

    async deleteCredentials(connectionId: string): Promise<void> {
        const promises = [
            this.delete(`mydba.connection.${connectionId}.password`),
            this.delete(`mydba.connection.${connectionId}.sshKey`),
            this.delete(`mydba.connection.${connectionId}.sshPassphrase`)
        ];

        await Promise.all(promises);
    }
}
