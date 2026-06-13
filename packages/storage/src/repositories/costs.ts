import type { CostBreakdown } from '@lookspan/types';
import type { LookspanDatabase } from '../database.js';

export interface CostQueryOptions {
  since?: string;
  until?: string;
  framework?: string;
}

export class CostsRepository {
  constructor(private readonly db: LookspanDatabase) {}

  summary(options: CostQueryOptions = {}): CostBreakdown {
    const where = this.buildWhere(options);
    const total = this.db
      .prepare(`SELECT COALESCE(SUM(cost_usd), 0) as total FROM spans ${where.sql}`)
      .get(where.params) as { total: number };

    const byProvider = this.db
      .prepare(
        `SELECT provider, COALESCE(SUM(cost_usd), 0) as cost
         FROM spans ${where.sql} ${where.sql ? 'AND' : 'WHERE'} provider IS NOT NULL
         GROUP BY provider`,
      )
      .all(where.params) as { provider: string; cost: number }[];

    const byModel = this.db
      .prepare(
        `SELECT model, COALESCE(SUM(cost_usd), 0) as cost
         FROM spans ${where.sql} ${where.sql ? 'AND' : 'WHERE'} model IS NOT NULL
         GROUP BY model`,
      )
      .all(where.params) as { model: string; cost: number }[];

    const byAgent = this.db
      .prepare(
        `SELECT agent_id, COALESCE(SUM(cost_usd), 0) as cost
         FROM spans ${where.sql} ${where.sql ? 'AND' : 'WHERE'} agent_id IS NOT NULL
         GROUP BY agent_id`,
      )
      .all(where.params) as { agent_id: string; cost: number }[];

    // Reasoning cost is a precomputed sub-component of cost_usd (set at ingest
    // by enrichSpanCost), so it sums the same way — total and per model, the
    // dimension that makes a model-routing strategy's reasoning premium legible.
    const reasoning = this.db
      .prepare(`SELECT COALESCE(SUM(reasoning_cost_usd), 0) as total FROM spans ${where.sql}`)
      .get(where.params) as { total: number };

    const reasoningByModel = this.db
      .prepare(
        `SELECT model, COALESCE(SUM(reasoning_cost_usd), 0) as cost
         FROM spans ${where.sql} ${where.sql ? 'AND' : 'WHERE'} model IS NOT NULL
         GROUP BY model`,
      )
      .all(where.params) as { model: string; cost: number }[];

    return {
      total: total.total,
      byProvider: Object.fromEntries(byProvider.map((r) => [r.provider, r.cost])),
      byModel: Object.fromEntries(byModel.map((r) => [r.model, r.cost])),
      byAgent: Object.fromEntries(byAgent.map((r) => [r.agent_id, r.cost])),
      reasoning: reasoning.total,
      reasoningByModel: Object.fromEntries(reasoningByModel.map((r) => [r.model, r.cost])),
    };
  }

  private buildWhere(options: CostQueryOptions): {
    sql: string;
    params: Record<string, unknown>;
  } {
    const clauses: string[] = [];
    const params: Record<string, unknown> = {};
    if (options.since) {
      clauses.push('started_at >= @since');
      params.since = options.since;
    }
    if (options.until) {
      clauses.push('started_at < @until');
      params.until = options.until;
    }
    if (options.framework) {
      clauses.push('framework = @framework');
      params.framework = options.framework;
    }
    return {
      sql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
      params,
    };
  }
}
