import { type CostBreakdown, UNATTRIBUTED } from '@lookspan/types';
import type { LookspanDatabase } from '../database.js';

/**
 * Turn grouped rows into the breakdown map, dropping an unattributed bucket
 * that costs nothing.
 *
 * Spans with no provider are common and usually free — a tool call, a chain
 * step — and a zero bar labelled "(unattributed)" on every chart is noise that
 * teaches people to ignore the label. It appears when there is money in it.
 */
function toBreakdown(rows: Record<string, string | number>[], key: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const name = String(row[key]);
    const cost = Number(row.cost);
    if (name === UNATTRIBUTED && cost === 0) continue;
    out[name] = cost;
  }
  return out;
}

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

    // The three breakdowns used to drop rows where the dimension was NULL, so
    // they quietly failed to add up to the `total` sitting right next to them.
    // A CrewAI span carries no `provider` at all — measured: 36% of a bill
    // vanished from "By provider" with nothing to say so. Unattributable spend
    // is still spend, so it gets a bucket instead of the floor.
    const byProvider = this.db
      .prepare(
        `SELECT COALESCE(provider, '${UNATTRIBUTED}') as provider, COALESCE(SUM(cost_usd), 0) as cost
         FROM spans ${where.sql}
         GROUP BY COALESCE(provider, '${UNATTRIBUTED}')`,
      )
      .all(where.params) as { provider: string; cost: number }[];

    const byModel = this.db
      .prepare(
        `SELECT COALESCE(model, '${UNATTRIBUTED}') as model, COALESCE(SUM(cost_usd), 0) as cost
         FROM spans ${where.sql}
         GROUP BY COALESCE(model, '${UNATTRIBUTED}')`,
      )
      .all(where.params) as { model: string; cost: number }[];

    const byAgent = this.db
      .prepare(
        `SELECT COALESCE(agent_id, '${UNATTRIBUTED}') as agent_id, COALESCE(SUM(cost_usd), 0) as cost
         FROM spans ${where.sql}
         GROUP BY COALESCE(agent_id, '${UNATTRIBUTED}')`,
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
        `SELECT COALESCE(model, '${UNATTRIBUTED}') as model, COALESCE(SUM(reasoning_cost_usd), 0) as cost
         FROM spans ${where.sql}
         GROUP BY COALESCE(model, '${UNATTRIBUTED}')`,
      )
      .all(where.params) as { model: string; cost: number }[];

    return {
      total: total.total,
      byProvider: toBreakdown(byProvider, 'provider'),
      byModel: toBreakdown(byModel, 'model'),
      byAgent: toBreakdown(byAgent, 'agent_id'),
      reasoning: reasoning.total,
      reasoningByModel: toBreakdown(reasoningByModel, 'model'),
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
