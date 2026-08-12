/** Shared LLM-as-judge prompt building + verdict parsing (used by replay & datasets). */

export const JUDGE_SYSTEM =
  'You are a strict evaluation judge. Read the user request and the assistant response, ' +
  'then return ONLY a JSON object: {"score": <number between 0 and 1>, "rationale": "<one or two sentences>"}. ' +
  'Higher is better. Do not include any text outside the JSON.';

/** How much of each section the judge is shown. */
export const JUDGE_LIMITS = {
  input: 12_000,
  expected: 6_000,
  output: 12_000,
} as const;

/**
 * Cut a section down to size, saying so where the cut happens.
 *
 * An unmarked cut is worse than a missing one. A 15,000-character answer used
 * to reach the judge as 12,000 characters ending mid-word, and the judge — told
 * to grade the response it was given — has every reason to mark it down for
 * stopping abruptly. That produces a low score that describes our truncation,
 * not the agent, and it is indistinguishable from a genuinely bad answer.
 *
 * So the marker does two jobs: it tells the judge the cut is ours, and it says
 * how much was withheld.
 */
export function clip(text: string, max: number, what: string): string {
  if (text.length <= max) return text;
  return (
    `${text.slice(0, max)}\n` +
    `[Truncated by Lookspan: this is the first ${max} of ${text.length} characters of the ${what}. ` +
    'The cut is ours, not the assistant’s — do not lower the score because the text ends abruptly.]'
  );
}

export function buildJudgeUser(opts: {
  rubric: string;
  input: unknown;
  output: string;
  expected?: string | null;
}): string {
  const lines = [
    `Rubric: ${opts.rubric}`,
    '',
    '=== USER REQUEST (captured prompt) ===',
    // Cutting serialised JSON leaves it unparseable, so the marker matters
    // more here than anywhere: without it the judge sees a broken object and
    // cannot tell a malformed request from a long one.
    clip(JSON.stringify(opts.input), JUDGE_LIMITS.input, 'request'),
  ];
  if (opts.expected) {
    lines.push(
      '',
      '=== REFERENCE ANSWER ===',
      clip(opts.expected, JUDGE_LIMITS.expected, 'reference answer'),
    );
  }
  lines.push(
    '',
    '=== ASSISTANT RESPONSE ===',
    clip(opts.output, JUDGE_LIMITS.output, 'assistant response'),
  );
  return lines.join('\n');
}

/** Parse a JSON verdict from a judge reply, tolerating ```json fences and prose. */
export function parseVerdict(raw: string): { score: number; rationale: string } | null {
  const fenced = raw.replace(/```(?:json)?/gi, '').trim();
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const obj = JSON.parse(fenced.slice(start, end + 1)) as Record<string, unknown>;
    const score = Number(obj.score);
    if (!Number.isFinite(score)) return null;
    const rationale =
      typeof obj.rationale === 'string'
        ? obj.rationale
        : typeof obj.reason === 'string'
          ? obj.reason
          : '';
    return { score: Math.max(0, Math.min(1, score)), rationale };
  } catch {
    return null;
  }
}

export function defaultJudgeModel(provider: 'openai' | 'anthropic'): string {
  return provider === 'openai' ? 'gpt-4o-mini' : 'claude-3-5-haiku-latest';
}
