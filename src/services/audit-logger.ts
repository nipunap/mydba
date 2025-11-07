import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../utils/logger';
import { LIMITS, FILE_PATHS } from '../constants';

/**
 * Audit Logger Service
 *
 * Logs destructive operations and critical actions for compliance and debugging.
 * Logs are stored in workspace storage and rotated when size limit is reached.
 */
export class AuditLogger {
    private auditLogPath: string;
    private writeQueue: Promise<void> = Promise.resolve();

    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger
    ) {
        const storagePath = context.storageUri?.fsPath || context.globalStorageUri.fsPath;
        this.auditLogPath = path.join(storagePath, FILE_PATHS.AUDIT_LOG);
        this.initializeAuditLog();
    }

    /**
     * Initialize audit log file
     */
    private async initializeAuditLog(): Promise<void> {
        try {
            const dir = path.dirname(this.auditLogPath);
            await fs.mkdir(dir, { recursive: true });

            // Check if file exists, create if not
            try {
                await fs.access(this.auditLogPath);
            } catch {
                await fs.writeFile(this.auditLogPath, '');
                this.logger.info(`Audit log initialized at: ${this.auditLogPath}`);
            }
        } catch (error) {
            this.logger.error('Failed to initialize audit log:', error as Error);
        }
    }

    /**
     * Log a destructive operation
     */
    async logDestructiveOperation(
        connectionId: string,
        query: string,
        user: string,
        result: { success: boolean; affectedRows?: number; error?: string }
    ): Promise<void> {
        const entry: AuditLogEntry = {
            timestamp: new Date().toISOString(),
            type: 'DESTRUCTIVE_OPERATION',
            connectionId,
            user,
            query,
            success: result.success,
            affectedRows: result.affectedRows,
            error: result.error
        };

        await this.writeEntry(entry);
    }

    /**
     * Log a connection event
     */
    async logConnectionEvent(
        connectionId: string,
        action: 'CONNECT' | 'DISCONNECT',
        user: string,
        success: boolean,
        error?: string
    ): Promise<void> {
        const entry: AuditLogEntry = {
            timestamp: new Date().toISOString(),
            type: 'CONNECTION',
            connectionId,
            user,
            action,
            success,
            error
        };

        await this.writeEntry(entry);
    }

    /**
     * Log an AI request
     */
    async logAIRequest(
        provider: string,
        operation: string,
        success: boolean,
        tokensUsed?: number,
        error?: string
    ): Promise<void> {
        const entry: AuditLogEntry = {
            timestamp: new Date().toISOString(),
            type: 'AI_REQUEST',
            provider,
            operation,
            success,
            tokensUsed,
            error
        };

        await this.writeEntry(entry);
    }

    /**
     * Log configuration changes
     */
    async logConfigChange(
        key: string,
        oldValue: unknown,
        newValue: unknown,
        user: string
    ): Promise<void> {
        const entry: AuditLogEntry = {
            timestamp: new Date().toISOString(),
            type: 'CONFIG_CHANGE',
            key,
            oldValue: JSON.stringify(oldValue),
            newValue: JSON.stringify(newValue),
            user,
            success: true
        };

        await this.writeEntry(entry);
    }

    /**
     * Write an entry to the audit log
     */
    private async writeEntry(entry: AuditLogEntry): Promise<void> {
        // Queue writes to prevent concurrent writes
        // Store the promise locally to ensure proper serialization
        const writePromise = this.writeQueue.then(async () => {
            try {
                // Check file size and rotate if necessary
                await this.rotateIfNeeded();

                // Append entry as JSON line
                const line = JSON.stringify(entry) + '\n';
                await fs.appendFile(this.auditLogPath, line, 'utf8');

            } catch (error) {
                this.logger.error('Failed to write audit log entry:', error as Error);
            }
        });

        // Update queue reference for next write
        this.writeQueue = writePromise;

        // Wait for this write to complete
        await writePromise;
    }

    /**
     * Rotate audit log if it exceeds size limit
     */
    private async rotateIfNeeded(): Promise<void> {
        try {
            const stats = await fs.stat(this.auditLogPath);

            if (stats.size > LIMITS.MAX_AUDIT_LOG_SIZE) {
                const backupPath = `${this.auditLogPath}.${Date.now()}.bak`;
                await fs.rename(this.auditLogPath, backupPath);
                await fs.writeFile(this.auditLogPath, '');

                this.logger.info(`Audit log rotated. Backup saved to: ${backupPath}`);

                // Clean up old backups (keep last 3)
                await this.cleanupOldBackups();
            }
        } catch (error) {
            // File might not exist yet, that's okay
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                this.logger.warn('Error checking audit log size:', error as Error);
            }
        }
    }

    /**
     * Clean up old backup files
     */
    private async cleanupOldBackups(): Promise<void> {
        try {
            const dir = path.dirname(this.auditLogPath);
            const files = await fs.readdir(dir);
            const backupFiles = files
                .filter(f => f.startsWith(path.basename(this.auditLogPath)) && f.endsWith('.bak'))
                .map(f => path.join(dir, f));

            // Sort by modification time (newest first)
            const filesWithStats = await Promise.all(
                backupFiles.map(async file => ({
                    file,
                    mtime: (await fs.stat(file)).mtime
                }))
            );
            filesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

            // Keep only the last 3, delete the rest
            const filesToDelete = filesWithStats.slice(3).map(f => f.file);
            await Promise.all(filesToDelete.map(f => fs.unlink(f)));

            if (filesToDelete.length > 0) {
                this.logger.info(`Cleaned up ${filesToDelete.length} old audit log backups`);
            }
        } catch (error) {
            this.logger.warn('Error cleaning up old audit log backups:', error as Error);
        }
    }

    /**
     * Get audit log entries (last N entries)
     */
    async getEntries(limit: number = 100): Promise<AuditLogEntry[]> {
        try {
            const content = await fs.readFile(this.auditLogPath, 'utf8');
            const lines = content.trim().split('\n').filter(line => line.length > 0);

            // Get last N lines
            const recentLines = lines.slice(-limit);

            return recentLines.map(line => {
                try {
                    return JSON.parse(line) as AuditLogEntry;
                } catch {
                    // Malformed line, skip
                    return null;
                }
            }).filter((entry): entry is AuditLogEntry => entry !== null);

        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return []; // File doesn't exist yet
            }
            this.logger.error('Failed to read audit log:', error as Error);
            throw error;
        }
    }

    /**
     * Search audit log entries
     */
    async searchEntries(filter: AuditLogFilter): Promise<AuditLogEntry[]> {
        const entries = await this.getEntries(1000); // Get more entries for searching

        return entries.filter(entry => {
            if (filter.type && entry.type !== filter.type) {
                return false;
            }
            if (filter.connectionId && entry.connectionId !== filter.connectionId) {
                return false;
            }
            if (filter.user && entry.user !== filter.user) {
                return false;
            }
            if (filter.startDate && new Date(entry.timestamp) < filter.startDate) {
                return false;
            }
            if (filter.endDate && new Date(entry.timestamp) > filter.endDate) {
                return false;
            }
            if (filter.success !== undefined && entry.success !== filter.success) {
                return false;
            }
            return true;
        });
    }

    /**
     * Clear audit log (for testing or maintenance)
     */
    async clearLog(): Promise<void> {
        try {
            await fs.writeFile(this.auditLogPath, '');
            this.logger.info('Audit log cleared');
        } catch (error) {
            this.logger.error('Failed to clear audit log:', error as Error);
            throw error;
        }
    }

    /**
     * Get audit log file path
     */
    getLogPath(): string {
        return this.auditLogPath;
    }
}

// Types

export interface AuditLogEntry {
    timestamp: string;
    type: 'DESTRUCTIVE_OPERATION' | 'CONNECTION' | 'AI_REQUEST' | 'CONFIG_CHANGE';
    connectionId?: string;
    user?: string;
    query?: string;
    action?: string;
    provider?: string;
    operation?: string;
    key?: string;
    oldValue?: string;
    newValue?: string;
    success: boolean;
    affectedRows?: number;
    tokensUsed?: number;
    error?: string;
}

export interface AuditLogFilter {
    type?: AuditLogEntry['type'];
    connectionId?: string;
    user?: string;
    startDate?: Date;
    endDate?: Date;
    success?: boolean;
}
