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
}

export class SlowQueriesService {
    constructor(private logger: Logger) {}

    /**
     * Detect slow queries using Performance Schema digests.
     * Requires events_statements_summary_by_digest to be enabled.
     */
    async detectSlowQueries(adapter: IDatabaseAdapter, limit: number = 100): Promise<SlowQueryDigestInfo[]> {
        // Use AVG_TIMER_WAIT (picoseconds) and COUNT_STAR to find heavy digests
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
            ORDER BY avg_timer_wait DESC
            LIMIT ${limit}
        `;

        this.logger.info('Detecting slow queries...');
        const result = await adapter.query<any>(sql);
        const rows: any[] = Array.isArray(result) ? result : (result as any).rows || [];

        return rows.map((r: any) => {
            const avgMs = this.psToMs(r.avg_timer_wait || r.AVG_TIMER_WAIT || 0);
            const totalMs = this.psToMs(r.sum_timer_wait || r.SUM_TIMER_WAIT || 0);
            return {
                digest: r.digest || r.DIGEST,
                digestText: r.digest_text || r.DIGEST_TEXT,
                schema: r.schema_name || r.SCHEMA_NAME,
                count: Number(r.count_star || r.COUNT_STAR || 0),
                avgMs,
                totalMs,
                rowsExamined: Number(r.sum_rows_examined || r.SUM_ROWS_EXAMINED || 0),
                rowsSent: Number(r.sum_rows_sent || r.SUM_ROWS_SENT || 0),
                firstSeen: r.first_seen ? new Date(r.first_seen) : (r.FIRST_SEEN ? new Date(r.FIRST_SEEN) : undefined),
                lastSeen: r.last_seen ? new Date(r.last_seen) : (r.LAST_SEEN ? new Date(r.LAST_SEEN) : undefined)
            } as SlowQueryDigestInfo;
        });
    }

    private psToMs(ps: number): number {
        // picoseconds to milliseconds
        const n = Number(ps) || 0;
        return Math.round((n / 1_000_000_000) * 100) / 100; // 1e12 ps = 1s
    }
}
