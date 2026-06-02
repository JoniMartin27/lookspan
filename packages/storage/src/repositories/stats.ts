import type { LatencyPercentiles, StatsSummary } from '@lookspan/types';
import type { LookspanDatabase } from '../database.js';

export interface StatsQueryOptions {
  since?: string;
  framework?: string;
}

export class StatsRepository {
  constructor(private readonly db: LookspanDatabase) {}

  summary(options: StatsQueryOptions = {}): StatsSummary {
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (options.since) {
      where.push('started_at >= @since');
      params.since = options.since;
    }
    if (options.framework) {
      where.push('framework = @framework');
      params.framework = options.framework;
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const totals = this.db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0) AS errors,
           COALESCE(SUM(cost_usd), 0) AS cost
         FROM traces ${whereSql}`,
      )
      .get(params) as { total: number; errors: number; cost: number };

    const byDay = this.db
      .prepare(
        `SELECT substr(started_at, 1, 10) AS day, COUNT(*) AS traces, COALESCE(SUM(cost_usd), 0) AS cost
         FROM traces ${whereSql}
         GROUP BY day
         ORDER BY day`,
      )
      .all(params) as { day: string; traces: number; cost: number }[];

    return {
      totalTraces: totals.total,
      errorTraces: totals.errors,
      errorRate: totals.total > 0 ? totals.errors / totals.total : 0,
      latencyMs: this.latencyPercentiles(whereSql, params),
      totalCostUsd: totals.cost,
      byDay: byDay.map((d) => ({ day: d.day, traces: d.traces, costUsd: d.cost })),
    };
  }

  private latencyPercentiles(
    whereSql: string,
    params: Record<string, unknown>,
  ): LatencyPercentiles | null {
    const durWhere = whereSql
      ? `${whereSql} AND duration_ms IS NOT NULL`
      : 'WHERE duration_ms IS NOT NULL';
    const { n } = this.db.prepare(`SELECT COUNT(*) AS n FROM traces ${durWhere}`).get(params) as {
      n: number;
    };
    if (n === 0) return null;

    const at = (p: number): number => {
      const offset = Math.min(n - 1, Math.floor(p * (n - 1)));
      const row = this.db
        .prepare(
          `SELECT duration_ms AS d FROM traces ${durWhere} ORDER BY duration_ms LIMIT 1 OFFSET @offset`,
        )
        .get({ ...params, offset }) as { d: number };
      return row.d;
    };

    return { p50: at(0.5), p95: at(0.95), p99: at(0.99) };
  }
}
