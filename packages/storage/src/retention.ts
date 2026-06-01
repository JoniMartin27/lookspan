import type { LookspanDatabase } from './database.js';

export interface PruneResult {
  deletedTraces: number;
  cutoff: string;
}

/**
 * Delete every trace started before `cutoffIso`. Spans cascade automatically
 * via the `ON DELETE CASCADE` foreign key, so this clears their rows too.
 */
export function pruneOlderThan(db: LookspanDatabase, cutoffIso: string): PruneResult {
  const res = db.prepare('DELETE FROM traces WHERE started_at < ?').run(cutoffIso);
  return { deletedTraces: res.changes, cutoff: cutoffIso };
}

/** Reclaim disk space after large deletes. Expensive — call sparingly. */
export function vacuum(db: LookspanDatabase): void {
  db.exec('VACUUM');
}

/** ISO timestamp `retentionMs` milliseconds before `nowMs`. */
export function cutoffFrom(retentionMs: number, nowMs: number): string {
  return new Date(nowMs - retentionMs).toISOString();
}

const DURATION_RE = /^(\d+)\s*(ms|s|m|h|d|w)$/i;
const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

/**
 * Parse a human duration like `7d`, `24h`, `30m`, `1w` into milliseconds.
 * Returns null for unparseable input.
 */
export function parseDuration(input: string): number | null {
  const match = DURATION_RE.exec(input.trim());
  if (!match?.[1] || !match[2]) return null;
  const unitMs = UNIT_MS[match[2].toLowerCase()];
  if (unitMs === undefined) return null;
  return Number(match[1]) * unitMs;
}
