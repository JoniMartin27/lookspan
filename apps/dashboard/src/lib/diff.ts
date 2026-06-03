export type DiffOp = 'same' | 'add' | 'del';
export interface DiffLine {
  type: DiffOp;
  text: string;
}

/**
 * Line-level diff via a longest-common-subsequence table. Outputs here are short
 * (chat replies), so the O(n·m) cost is irrelevant. Returns the lines of `b`
 * aligned against `a`: `del` = only in a (removed), `add` = only in b (added),
 * `same` = unchanged.
 */
export function diffLines(aStr: string, bStr: string): DiffLine[] {
  const a = aStr.split('\n');
  const b = bStr.split('\n');
  const n = a.length;
  const m = b.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const row = dp[i] as number[];
      const next = dp[i + 1] as number[];
      row[j] = a[i] === b[j] ? (next[j + 1] ?? 0) + 1 : Math.max(next[j] ?? 0, row[j + 1] ?? 0);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i] ?? '' });
      i++;
      j++;
    } else if ((dp[i + 1]?.[j] ?? 0) >= (dp[i]?.[j + 1] ?? 0)) {
      out.push({ type: 'del', text: a[i] ?? '' });
      i++;
    } else {
      out.push({ type: 'add', text: b[j] ?? '' });
      j++;
    }
  }
  while (i < n) out.push({ type: 'del', text: a[i++] ?? '' });
  while (j < m) out.push({ type: 'add', text: b[j++] ?? '' });
  return out;
}
