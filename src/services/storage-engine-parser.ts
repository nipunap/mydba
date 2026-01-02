/**
 * Storage Engine Parser
 * Parses SHOW ENGINE INNODB STATUS and SHOW ENGINE ARIA STATUS output
 */

import {
    InnoDBStatus,
    TransactionSection,
    DeadlockSection,
    BufferPoolSection,
    IOSection,
    LogSection,
    RowOperationsSection,
    SemaphoreSection,
    DeadlockInfo,
    DeadlockTransaction,
    AriaStatus
} from '../types/storage-engine-types';

export class StorageEngineParser {
    /**
     * Parse SHOW ENGINE INNODB STATUS output
     */
    parseInnoDBStatus(rawOutput: string, version: string): InnoDBStatus {
        const sections = this.splitIntoSections(rawOutput);

        return {
            timestamp: new Date(),
            version,
            uptime: this.parseUptime(rawOutput),
            transactions: this.parseTransactions(sections.transactions || ''),
            deadlocks: this.parseDeadlocks(sections.deadlocks || ''),
            bufferPool: this.parseBufferPool(sections.bufferPool || ''),
            io: this.parseIO(sections.io || ''),
            log: this.parseLog(sections.log || ''),
            rowOps: this.parseRowOperations(sections.rowOps || ''),
            semaphores: this.parseSemaphores(sections.semaphores || ''),
            healthScore: 0 // Will be calculated by service
        };
    }

    /**
     * Split raw output into named sections
     */
    private splitIntoSections(rawOutput: string): Record<string, string> {
        const sections: Record<string, string> = {};

        // Match section headers and content
        // Look for section headers followed by dashes, capture until next section header
        const transactionsMatch = rawOutput.match(/TRANSACTIONS\s*\n-+\s*\n([\s\S]*?)(?=\n[A-Z]{2,}.*\n-|$)/i);
        if (transactionsMatch) {
            sections.transactions = transactionsMatch[1];
        }

        const deadlocksMatch = rawOutput.match(/LATEST DETECTED DEADLOCK\s*\n-+\s*\n([\s\S]*?)(?=\n[A-Z]{2,}.*\n-|$)/i);
        if (deadlocksMatch) {
            sections.deadlocks = deadlocksMatch[1];
        }

        const bufferPoolMatch = rawOutput.match(/BUFFER POOL AND MEMORY\s*\n-+\s*\n([\s\S]*?)(?=\n[A-Z]{2,}.*\n-|$)/i);
        if (bufferPoolMatch) {
            sections.bufferPool = bufferPoolMatch[1];
        }

        const ioMatch = rawOutput.match(/FILE I\/O\s*\n-+\s*\n([\s\S]*?)(?=\n[A-Z]{2,}.*\n-|$)/i);
        if (ioMatch) {
            sections.io = ioMatch[1];
        }

        const logMatch = rawOutput.match(/LOG\s*\n-+\s*\n([\s\S]*?)(?=\n[A-Z]{2,}.*\n-|$)/i);
        if (logMatch) {
            sections.log = logMatch[1];
        }

        const rowOpsMatch = rawOutput.match(/ROW OPERATIONS\s*\n-+\s*\n([\s\S]*?)(?=\n[A-Z]{2,}.*\n-|$)/i);
        if (rowOpsMatch) {
            sections.rowOps = rowOpsMatch[1];
        }

        const semaphoresMatch = rawOutput.match(/SEMAPHORES\s*\n-+\s*\n([\s\S]*?)(?=\n[A-Z]{2,}.*\n-|$)/i);
        if (semaphoresMatch) {
            sections.semaphores = semaphoresMatch[1];
        }

        return sections;
    }

    /**
     * Parse uptime from header
     */
    private parseUptime(rawOutput: string): number {
        const match = rawOutput.match(/Per second averages calculated from the last (\d+) seconds/);
        return match ? parseInt(match[1], 10) : 0;
    }

    /**
     * Parse TRANSACTIONS section
     */
    private parseTransactions(section: string): TransactionSection {
        const historyListMatch = section.match(/History list length (\d+)/);
        const historyListLength = historyListMatch ? parseInt(historyListMatch[1], 10) : 0;

        // Count active transactions by looking for "ACTIVE" keyword
        const activeMatches = section.match(/ACTIVE/g);
        const activeTransactions = activeMatches ? activeMatches.length : 0;

        // Parse purge lag (undo records not yet purged)
        const purgeLagMatch = section.match(/Purge done for trx's n:o < (\d+) undo n:o < (\d+)/);
        const purgeLag = purgeLagMatch ? parseInt(purgeLagMatch[2], 10) : 0;

        return {
            historyListLength,
            activeTransactions,
            purgeLag,
            transactionStates: {
                active: activeTransactions,
                prepared: 0, // Would need more parsing
                committed: 0
            }
        };
    }

    /**
     * Parse LATEST DETECTED DEADLOCK section
     */
    private parseDeadlocks(section: string): DeadlockSection {
        if (!section || section.trim().length === 0) {
            return {
                latestDeadlock: null,
                deadlockCount: 0
            };
        }

        // Parse timestamp
        const timestampMatch = section.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
        const timestamp = timestampMatch ? new Date(timestampMatch[1]) : new Date();

        // Parse transactions involved
        const transactions: DeadlockTransaction[] = [];
        const transactionMatches = section.matchAll(/\*\*\* \((\d+)\) (.+?):/g);

        for (const match of transactionMatches) {
            const txId = match[1];

            // Extract query (simplified)
            const queryMatch = section.match(new RegExp(`\\(${txId}\\)[\\s\\S]*?([A-Z]+[^;]+;?)`, 'i'));
            const query = queryMatch ? queryMatch[1].trim() : '';

            transactions.push({
                id: txId,
                query,
                locksHeld: [], // Would need more detailed parsing
                locksWaiting: []
            });
        }

        // Find victim transaction
        const victimMatch = section.match(/WE ROLL BACK TRANSACTION \((\d+)\)/);
        const victim = victimMatch ? victimMatch[1] : '';

        const latestDeadlock: DeadlockInfo = {
            timestamp,
            transactions,
            victim
        };

        return {
            latestDeadlock,
            deadlockCount: 1 // This would need to be tracked separately
        };
    }

    /**
     * Parse BUFFER POOL AND MEMORY section
     */
    private parseBufferPool(section: string): BufferPoolSection {
        // Try to match "Buffer pool size" first (in pages), fallback to "Total memory allocated" (in bytes)
        let totalSize = 0;
        const poolSizeMatch = section.match(/Buffer pool size\s+(\d+)/);
        if (poolSizeMatch) {
            totalSize = parseInt(poolSizeMatch[1], 10);
        } else {
            const totalMemMatch = section.match(/Total (?:large )?memory allocated\s+(\d+)/);
            if (totalMemMatch) {
                totalSize = Math.floor(parseInt(totalMemMatch[1], 10) / 16384); // Convert bytes to pages
            }
        }

        const freeMatch = section.match(/Free buffers\s+(\d+)/);
        const freePages = freeMatch ? parseInt(freeMatch[1], 10) : 0;

        const databaseMatch = section.match(/Database pages\s+(\d+)/);
        const databasePages = databaseMatch ? parseInt(databaseMatch[1], 10) : 0;

        const dirtyMatch = section.match(/Modified db pages\s+(\d+)/);
        const dirtyPages = dirtyMatch ? parseInt(dirtyMatch[1], 10) : 0;

        // Parse buffer pool hit rate
        const readsMatch = section.match(/Buffer pool hit rate (\d+) \/ (\d+)/);
        let hitRate = 0;
        if (readsMatch) {
            const hits = parseInt(readsMatch[1], 10);
            const total = parseInt(readsMatch[2], 10);
            hitRate = total > 0 ? (hits / total) * 100 : 0;
        }

        const readsFromDiskMatch = section.match(/Reads\/s: (\d+(?:\.\d+)?)/);
        const readsFromDisk = readsFromDiskMatch ? parseFloat(readsFromDiskMatch[1]) : 0;

        return {
            totalSize,
            freePages,
            databasePages,
            dirtyPages,
            modifiedDbPages: dirtyPages,
            hitRate,
            readsFromDisk,
            readsFromCache: 0, // Would be calculated
            pendingReads: 0,
            pendingWrites: 0,
            lruListLength: databasePages,
            flushListLength: dirtyPages
        };
    }

    /**
     * Parse FILE I/O section
     */
    private parseIO(section: string): IOSection {
        const pendingReadsMatch = section.match(/Pending normal aio reads:\s*(\d+)/);
        const pendingReads = pendingReadsMatch ? parseInt(pendingReadsMatch[1], 10) : 0;

        const pendingWritesMatch = section.match(/Pending normal aio writes:\s*(\d+)/);
        const pendingWrites = pendingWritesMatch ? parseInt(pendingWritesMatch[1], 10) : 0;

        const pendingFsyncsMatch = section.match(/Pending fsyncs:\s*(\d+)/);
        const pendingFsyncs = pendingFsyncsMatch ? parseInt(pendingFsyncsMatch[1], 10) : 0;

        return {
            pendingReads,
            pendingWrites,
            pendingFsyncs,
            readsPerSecond: 0,
            writesPerSecond: 0,
            fsyncsPerSecond: 0,
            avgIOWaitTime: 0,
            ioThreads: []
        };
    }

    /**
     * Parse LOG section
     */
    private parseLog(section: string): LogSection {
        const lsnMatch = section.match(/Log sequence number\s+(\d+)/);
        const logSequenceNumber = lsnMatch ? parseInt(lsnMatch[1], 10) : 0;

        const checkpointMatch = section.match(/Last checkpoint at\s+(\d+)/);
        const lastCheckpointLSN = checkpointMatch ? parseInt(checkpointMatch[1], 10) : 0;

        const checkpointAge = logSequenceNumber - lastCheckpointLSN;

        return {
            logSequenceNumber,
            lastCheckpointLSN,
            checkpointAge,
            checkpointAgePercent: 0, // Would need log file size
            logBufferSize: 0,
            logBufferUsed: 0,
            logWritesPerSecond: 0,
            logFsyncsPerSecond: 0,
            pendingLogWrites: 0
        };
    }

    /**
     * Parse ROW OPERATIONS section
     */
    private parseRowOperations(section: string): RowOperationsSection {
        const insertsMatch = section.match(/(\d+(?:\.\d+)?)\s+inserts\/s/);
        const insertsPerSecond = insertsMatch ? parseFloat(insertsMatch[1]) : 0;

        const updatesMatch = section.match(/(\d+(?:\.\d+)?)\s+updates\/s/);
        const updatesPerSecond = updatesMatch ? parseFloat(updatesMatch[1]) : 0;

        const deletesMatch = section.match(/(\d+(?:\.\d+)?)\s+deletes\/s/);
        const deletesPerSecond = deletesMatch ? parseFloat(deletesMatch[1]) : 0;

        const readsMatch = section.match(/(\d+(?:\.\d+)?)\s+reads\/s/);
        const readsPerSecond = readsMatch ? parseFloat(readsMatch[1]) : 0;

        return {
            insertsPerSecond,
            updatesPerSecond,
            deletesPerSecond,
            readsPerSecond,
            queriesInside: 0,
            queriesQueued: 0
        };
    }

    /**
     * Parse SEMAPHORES section
     */
    private parseSemaphores(section: string): SemaphoreSection {
        const mutexWaitsMatch = section.match(/Mutex spin waits (\d+)/);
        const mutexWaits = mutexWaitsMatch ? parseInt(mutexWaitsMatch[1], 10) : 0;

        const mutexSpinRoundsMatch = section.match(/spin rounds (\d+)/);
        const mutexSpinRounds = mutexSpinRoundsMatch ? parseInt(mutexSpinRoundsMatch[1], 10) : 0;

        const mutexOSWaitsMatch = section.match(/OS waits (\d+)/);
        const mutexOSWaits = mutexOSWaitsMatch ? parseInt(mutexOSWaitsMatch[1], 10) : 0;

        return {
            mutexWaits,
            mutexSpinRounds,
            mutexOSWaits,
            rwLockWaits: 0,
            rwLockSpinRounds: 0,
            rwLockOSWaits: 0,
            longSemaphoreWaits: []
        };
    }

    /**
     * Parse SHOW ENGINE ARIA STATUS output (MariaDB)
     */
    parseAriaStatus(rawOutput: string, version: string): AriaStatus {
        // Aria status parsing
        const pageCacheSizeMatch = rawOutput.match(/Pagecache blocks used:\s*(\d+)/);
        const pageCacheSize = pageCacheSizeMatch ? parseInt(pageCacheSizeMatch[1], 10) : 0;

        const pageCacheHitRateMatch = rawOutput.match(/Pagecache read hits:\s*(\d+)/);
        const hitRate = pageCacheHitRateMatch ? parseFloat(pageCacheHitRateMatch[1]) : 0;

        return {
            timestamp: new Date(),
            version,
            pageCache: {
                size: pageCacheSize,
                used: 0,
                hitRate,
                readsFromDisk: 0,
                readsFromCache: 0
            },
            recoveryLog: {
                size: 0,
                used: 0,
                checkpointInterval: 0
            },
            readBufferSize: 0,
            writeBufferSize: 0,
            crashRecoveryStatus: 'clean',
            healthScore: 0
        };
    }
}
