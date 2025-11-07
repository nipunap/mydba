import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import * as crypto from 'crypto';

export interface QueryHistoryEntry {
    id: string;
    query: string;
    queryHash: string; // For deduplication
    connectionId: string;
    connectionName: string;
    database: string | null;
    timestamp: string; // ISO 8601
    duration: number; // milliseconds
    rowsAffected: number;
    success: boolean;
    error: string | null;
    isFavorite: boolean;
    tags: string[];
    notes: string;
}

export interface QueryStats {
    totalQueries: number;
    successRate: number;
    avgDuration: number;
    mostFrequent: Array<{ query: string; count: number }>;
    recentErrors: QueryHistoryEntry[];
}

export class QueryHistoryService {
    private static readonly MAX_HISTORY_SIZE = 1000;
    private static readonly STORAGE_KEY = 'mydba.queryHistory';
    
    private history: QueryHistoryEntry[] = [];

    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger
    ) {
        this.loadHistory();
    }

    /**
     * Add a query to history
     */
    addQuery(entry: Omit<QueryHistoryEntry, 'id' | 'timestamp' | 'queryHash' | 'isFavorite' | 'tags' | 'notes'>): QueryHistoryEntry {
        const id = crypto.randomBytes(8).toString('hex');
        const queryHash = this.hashQuery(entry.query);
        const timestamp = new Date().toISOString();

        const historyEntry: QueryHistoryEntry = {
            id,
            queryHash,
            timestamp,
            isFavorite: false,
            tags: [],
            notes: '',
            ...entry
        };

        this.history.unshift(historyEntry);

        // Trim history if too large
        if (this.history.length > QueryHistoryService.MAX_HISTORY_SIZE) {
            this.history = this.history.slice(0, QueryHistoryService.MAX_HISTORY_SIZE);
        }

        this.saveHistory();
        this.logger.debug(`Added query to history: ${id}`);

        return historyEntry;
    }

    /**
     * Get all history entries
     */
    getHistory(options?: {
        limit?: number;
        connectionId?: string;
        onlyFavorites?: boolean;
        successOnly?: boolean;
    }): QueryHistoryEntry[] {
        let filtered = [...this.history];

        if (options?.connectionId) {
            filtered = filtered.filter(e => e.connectionId === options.connectionId);
        }

        if (options?.onlyFavorites) {
            filtered = filtered.filter(e => e.isFavorite);
        }

        if (options?.successOnly) {
            filtered = filtered.filter(e => e.success);
        }

        if (options?.limit) {
            filtered = filtered.slice(0, options.limit);
        }

        return filtered;
    }

    /**
     * Search history by query text
     */
    search(searchText: string, options?: { connectionId?: string; limit?: number }): QueryHistoryEntry[] {
        const searchLower = searchText.toLowerCase();
        let filtered = this.history.filter(e =>
            e.query.toLowerCase().includes(searchLower) ||
            e.notes.toLowerCase().includes(searchLower) ||
            e.tags.some(t => t.toLowerCase().includes(searchLower))
        );

        if (options?.connectionId) {
            filtered = filtered.filter(e => e.connectionId === options.connectionId);
        }

        if (options?.limit) {
            filtered = filtered.slice(0, options.limit);
        }

        return filtered;
    }

    /**
     * Get entry by ID
     */
    getEntry(id: string): QueryHistoryEntry | undefined {
        return this.history.find(e => e.id === id);
    }

    /**
     * Toggle favorite status
     */
    toggleFavorite(id: string): boolean {
        const entry = this.history.find(e => e.id === id);
        if (entry) {
            entry.isFavorite = !entry.isFavorite;
            this.saveHistory();
            return entry.isFavorite;
        }
        return false;
    }

    /**
     * Add/update notes for an entry
     */
    updateNotes(id: string, notes: string): void {
        const entry = this.history.find(e => e.id === id);
        if (entry) {
            entry.notes = notes;
            this.saveHistory();
        }
    }

    /**
     * Add/remove tags
     */
    updateTags(id: string, tags: string[]): void {
        const entry = this.history.find(e => e.id === id);
        if (entry) {
            entry.tags = tags;
            this.saveHistory();
        }
    }

    /**
     * Delete an entry
     */
    deleteEntry(id: string): boolean {
        const index = this.history.findIndex(e => e.id === id);
        if (index !== -1) {
            this.history.splice(index, 1);
            this.saveHistory();
            return true;
        }
        return false;
    }

    /**
     * Clear all history
     */
    clearHistory(): void {
        this.history = [];
        this.saveHistory();
        this.logger.info('Query history cleared');
    }

    /**
     * Get statistics
     */
    getStats(): QueryStats {
        const successful = this.history.filter(e => e.success);
        const failed = this.history.filter(e => !e.success);

        // Calculate frequency
        const queryFrequency = new Map<string, number>();
        this.history.forEach(e => {
            const count = queryFrequency.get(e.queryHash) || 0;
            queryFrequency.set(e.queryHash, count + 1);
        });

        const mostFrequent = Array.from(queryFrequency.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([hash, count]) => {
                const entry = this.history.find(e => e.queryHash === hash);
                return {
                    query: entry?.query || '',
                    count
                };
            });

        const avgDuration = successful.length > 0
            ? successful.reduce((sum, e) => sum + e.duration, 0) / successful.length
            : 0;

        return {
            totalQueries: this.history.length,
            successRate: this.history.length > 0 ? (successful.length / this.history.length) * 100 : 0,
            avgDuration,
            mostFrequent,
            recentErrors: failed.slice(0, 10)
        };
    }

    /**
     * Export history to JSON
     */
    exportToJSON(): string {
        return JSON.stringify(this.history, null, 2);
    }

    /**
     * Export history to CSV
     */
    exportToCSV(): string {
        const headers = ['Timestamp', 'Connection', 'Database', 'Query', 'Duration (ms)', 'Rows Affected', 'Success', 'Error', 'Tags', 'Notes'];
        const rows = this.history.map(e => [
            e.timestamp,
            e.connectionName,
            e.database || '-',
            this.escapeCSV(e.query),
            e.duration.toString(),
            e.rowsAffected.toString(),
            e.success ? 'Yes' : 'No',
            e.error ? this.escapeCSV(e.error) : '-',
            e.tags.join('; '),
            e.notes ? this.escapeCSV(e.notes) : '-'
        ]);

        return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    }

    /**
     * Import history from JSON
     */
    importFromJSON(json: string): number {
        try {
            const imported = JSON.parse(json) as QueryHistoryEntry[];
            if (!Array.isArray(imported)) {
                throw new Error('Invalid format: expected array');
            }

            // Validate entries
            imported.forEach(e => {
                if (!e.id || !e.query || !e.timestamp) {
                    throw new Error('Invalid entry: missing required fields');
                }
            });

            // Merge with existing history (avoid duplicates by ID)
            const existingIds = new Set(this.history.map(e => e.id));
            const newEntries = imported.filter(e => !existingIds.has(e.id));

            this.history = [...this.history, ...newEntries];
            this.saveHistory();

            this.logger.info(`Imported ${newEntries.length} history entries`);
            return newEntries.length;
        } catch (error) {
            this.logger.error('Failed to import history:', error as Error);
            throw error;
        }
    }

    private hashQuery(query: string): string {
        // Normalize query for hashing (remove extra whitespace, lowercase)
        const normalized = query.replace(/\s+/g, ' ').trim().toLowerCase();
        return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
    }

    private escapeCSV(text: string): string {
        // Escape double quotes and wrap in quotes if contains comma, quote, or newline
        if (text.includes(',') || text.includes('"') || text.includes('\n')) {
            return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
    }

    private loadHistory(): void {
        try {
            const stored = this.context.globalState.get<QueryHistoryEntry[]>(QueryHistoryService.STORAGE_KEY);
            if (stored && Array.isArray(stored)) {
                this.history = stored;
                this.logger.info(`Loaded ${this.history.length} query history entries`);
            }
        } catch (error) {
            this.logger.error('Failed to load query history:', error as Error);
            this.history = [];
        }
    }

    private saveHistory(): void {
        try {
            this.context.globalState.update(QueryHistoryService.STORAGE_KEY, this.history);
        } catch (error) {
            this.logger.error('Failed to save query history:', error as Error);
        }
    }
}

