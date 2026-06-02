import type { Alert, AlertCondition } from '@lookspan/types';
import type { LookspanDatabase } from '../database.js';
import type { AlertRow } from '../schema.js';

function rowToAlert(row: AlertRow): Alert {
  return {
    id: row.id,
    ruleId: row.rule_id,
    traceId: row.trace_id,
    condition: row.condition as AlertCondition,
    message: row.message,
    value: row.value,
    threshold: row.threshold,
    createdAt: row.created_at,
  };
}

export interface ListAlertsOptions {
  limit?: number;
}

export class AlertsRepository {
  constructor(private readonly db: LookspanDatabase) {}

  insert(alert: Alert): Alert {
    const info = this.db
      .prepare(
        `INSERT INTO alerts (rule_id, trace_id, condition, message, value, threshold, created_at)
         VALUES (@ruleId, @traceId, @condition, @message, @value, @threshold, @createdAt)`,
      )
      .run({
        ruleId: alert.ruleId,
        traceId: alert.traceId,
        condition: alert.condition,
        message: alert.message,
        value: alert.value,
        threshold: alert.threshold,
        createdAt: alert.createdAt,
      });
    return { ...alert, id: Number(info.lastInsertRowid) };
  }

  list(options: ListAlertsOptions = {}): Alert[] {
    const limit = Math.min(options.limit ?? 100, 500);
    const rows = this.db
      .prepare('SELECT * FROM alerts ORDER BY created_at DESC, id DESC LIMIT ?')
      .all(limit) as AlertRow[];
    return rows.map(rowToAlert);
  }

  listByTrace(traceId: string): Alert[] {
    const rows = this.db
      .prepare('SELECT * FROM alerts WHERE trace_id = ? ORDER BY created_at DESC')
      .all(traceId) as AlertRow[];
    return rows.map(rowToAlert);
  }
}
