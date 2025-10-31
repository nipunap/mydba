/* eslint-disable @typescript-eslint/no-explicit-any */

import { IDatabaseAdapter } from '../adapters/database-adapter';
import { Logger } from '../utils/logger';

export interface SlowQueryDigestInfo {
    digest: string;
    digestText: string;
    schema: string;
    count: number;
    avgMs: number;
    totalMs: number;
    rowsExamined: number;
    rowsSent: number;
    firstSeen?: Date;
    lastSeen?: Date;
    impactScore?: number; // Calculated impact score for sorting
}

export type SlowQuerySortBy = 'impact' | 'totalTime' | 'avgTime' | 'count' | 'rowsExamined';

export class SlowQueriesService {
    constructor(private logger: Logger) {}

    /**
     * Detect slow queries using Performance Schema digests.
     * Requires events_statements_summary_by_digest to be enabled.
     */
    async detectSlowQueries(adapter: IDatabaseAdapter, limit: number = 100, sortBy: SlowQuerySortBy = 'impact'): Promise<SlowQueryDigestInfo[]> {
        // Get all queries first, then sort in memory for more flexibility
        const sql = `
            SELECT
                DIGEST AS digest,
                DIGEST_TEXT AS digest_text,
                SCHEMA_NAME AS schema_name,
                COUNT_STAR AS count_star,
                SUM_TIMER_WAIT AS sum_timer_wait,
                AVG_TIMER_WAIT AS avg_timer_wait,
                SUM_ROWS_EXAMINED AS sum_rows_examined,
                SUM_ROWS_SENT AS sum_rows_sent,
                FIRST_SEEN AS first_seen,
                LAST_SEEN AS last_seen
            FROM performance_schema.events_statements_summary_by_digest
            WHERE SCHEMA_NAME IS NOT NULL
            LIMIT ${limit * 2}
        `;

        this.logger.info(`Detecting slow queries (sort by: ${sortBy})...`);
        const result = await adapter.query<unknown>(sql);
        const rows: any[] = Array.isArray(result) ? result : (result as any).rows || [];

        const queries = rows.map((r: any) => {
            const avgMs = this.psToMs(r.avg_timer_wait || r.AVG_TIMER_WAIT || 0);
            const totalMs = this.psToMs(r.sum_timer_wait || r.SUM_TIMER_WAIT || 0);
            const count = Number(r.count_star || r.COUNT_STAR || 0);
            const rowsExamined = Number(r.sum_rows_examined || r.SUM_ROWS_EXAMINED || 0);

            // Calculate impact score: combination of total time, frequency, and efficiency
            const impactScore = this.calculateImpactScore(totalMs, count, avgMs, rowsExamined);

            return {
                digest: r.digest || r.DIGEST,
                digestText: r.digest_text || r.DIGEST_TEXT,
                schema: r.schema_name || r.SCHEMA_NAME,
                count,
                avgMs,
                totalMs,
                rowsExamined,
                rowsSent: Number(r.sum_rows_sent || r.SUM_ROWS_SENT || 0),
                firstSeen: r.first_seen ? new Date(r.first_seen) : (r.FIRST_SEEN ? new Date(r.FIRST_SEEN) : undefined),
                lastSeen: r.last_seen ? new Date(r.last_seen) : (r.LAST_SEEN ? new Date(r.LAST_SEEN) : undefined),
                impactScore
            } as SlowQueryDigestInfo;
        });

        // Sort based on selected criteria
        return this.sortQueries(queries, sortBy).slice(0, limit);
    }

    /**
     * Calculate impact score based on multiple factors
     * Higher score = higher impact on database performance
     */
    private calculateImpactScore(totalMs: number, count: number, avgMs: number, rowsExamined: number): number {
        // Weighted formula:
        // - Total time (40%): Total database time consumed
        // - Frequency (30%): How often it runs
        // - Average time (20%): Individual query cost
        // - Rows examined (10%): Inefficiency indicator

        const totalWeight = totalMs * 0.4;
        const frequencyWeight = count * 0.3;
        const avgWeight = avgMs * 0.2;
        const rowsWeight = (rowsExamined / 1000) * 0.1; // Normalize rows

        return Math.round(totalWeight + frequencyWeight + avgWeight + rowsWeight);
    }

    /**
     * Sort queries by specified criteria
     */
    private sortQueries(queries: SlowQueryDigestInfo[], sortBy: SlowQuerySortBy): SlowQueryDigestInfo[] {
        return queries.sort((a, b) => {
            switch (sortBy) {
                case 'impact':
                    return (b.impactScore || 0) - (a.impactScore || 0);
                case 'totalTime':
                    return b.totalMs - a.totalMs;
                case 'avgTime':
                    return b.avgMs - a.avgMs;
                case 'count':
                    return b.count - a.count;
                case 'rowsExamined':
                    return b.rowsExamined - a.rowsExamined;
                default:
                    return (b.impactScore || 0) - (a.impactScore || 0);
            }
        });
    }

    private psToMs(ps: number): number {
        // picoseconds to milliseconds
        const n = Number(ps) || 0;
        return Math.round((n / 1_000_000_000) * 100) / 100; // 1e12 ps = 1s
    }
}
