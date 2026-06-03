/** Shared LLM-as-judge prompt building + verdict parsing (used by replay & datasets). */

export const JUDGE_SYSTEM =
  'You are a strict evaluation judge. Read the user request and the assistant response, ' +
  'then return ONLY a JSON object: {"score": <number between 0 and 1>, "rationale": "<one or two sentences>"}. ' +
  'Higher is better. Do not include any text outside the JSON.';

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
    JSON.stringify(opts.input).slice(0, 12_000),
  ];
  if (opts.expected) {
    lines.push('', '=== REFERENCE ANSWER ===', opts.expected.slice(0, 6_000));
  }
  lines.push('', '=== ASSISTANT RESPONSE ===', opts.output.slice(0, 12_000));
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
