/**
 * The judge prompt had no tests, and it was quietly cutting what it graded.
 *
 * A 15,200-character answer reached the judge as 12,000 characters ending
 * mid-word ("…el sig"), with nothing to say the text had been cut. The judge is
 * instructed to grade the response it is given, so an answer that stops
 * abruptly invites a low score — one that describes our truncation rather than
 * the agent, and that is indistinguishable from a genuinely bad answer.
 *
 * A score nobody produced is a worse outcome than a score that is missing.
 */
import { describe, expect, it } from 'vitest';
import { buildJudgeUser, clip, JUDGE_LIMITS, parseVerdict } from './judge.js';

describe('clip', () => {
  it('leaves text that fits completely alone', () => {
    expect(clip('corto', 100, 'response')).toBe('corto');
    // Exactly at the limit is not truncation — an off-by-one here would stamp
    // the marker onto untouched text and teach the judge to distrust it.
    expect(clip('abcde', 5, 'response')).toBe('abcde');
  });

  it('keeps the first `max` characters verbatim', () => {
    const out = clip('a'.repeat(50), 10, 'response');
    expect(out.startsWith('a'.repeat(10))).toBe(true);
    expect(out.startsWith('a'.repeat(11))).toBe(false);
  });

  it('says the cut is ours, not the assistant’s', () => {
    const out = clip('x'.repeat(50), 10, 'assistant response');
    expect(out).toMatch(/Truncated by Lookspan/);
    expect(out).toMatch(/do not lower the score/i);
  });

  it('reports how much was withheld', () => {
    const out = clip('x'.repeat(15_200), 12_000, 'assistant response');
    expect(out).toContain('first 12000 of 15200 characters');
    expect(out).toContain('assistant response');
  });
});

describe('buildJudgeUser', () => {
  const base = { rubric: 'quality', input: { messages: [{ role: 'user', content: 'hola' }] } };

  it('passes short content through untouched', () => {
    const prompt = buildJudgeUser({ ...base, output: 'cuatro' });
    expect(prompt).toContain('Rubric: quality');
    expect(prompt).toContain('cuatro');
    expect(prompt).not.toMatch(/Truncated by Lookspan/);
  });

  it('marks a long answer as cut by us', () => {
    const long = 'El informe detallado es el siguiente. '.repeat(400);
    expect(long.length).toBeGreaterThan(JUDGE_LIMITS.output);
    const prompt = buildJudgeUser({ ...base, output: long });
    expect(prompt).toMatch(/Truncated by Lookspan/);
    expect(prompt).toContain(`first ${JUDGE_LIMITS.output} of ${long.length} characters`);
  });

  it('marks a cut request too — truncated JSON is unparseable', () => {
    // Cutting a serialised object mid-string leaves the judge holding a broken
    // fragment it cannot distinguish from a malformed request.
    const huge = { messages: [{ role: 'user', content: 'x'.repeat(20_000) }] };
    const prompt = buildJudgeUser({ ...base, input: huge, output: 'ok' });
    expect(prompt).toMatch(/Truncated by Lookspan[^\]]*of the request/);
  });

  it('marks a cut reference answer', () => {
    const prompt = buildJudgeUser({
      ...base,
      output: 'ok',
      expected: 'y'.repeat(JUDGE_LIMITS.expected + 1),
    });
    expect(prompt).toMatch(/Truncated by Lookspan[^\]]*of the reference answer/);
  });

  it('omits the reference section when there is none', () => {
    expect(buildJudgeUser({ ...base, output: 'ok' })).not.toContain('REFERENCE ANSWER');
    expect(buildJudgeUser({ ...base, output: 'ok', expected: null })).not.toContain(
      'REFERENCE ANSWER',
    );
  });

  it('keeps every section in the order the judge is told to read them', () => {
    const prompt = buildJudgeUser({ ...base, output: 'ok', expected: 'ref' });
    const request = prompt.indexOf('USER REQUEST');
    const reference = prompt.indexOf('REFERENCE ANSWER');
    const response = prompt.indexOf('ASSISTANT RESPONSE');
    expect(request).toBeGreaterThan(-1);
    expect(reference).toBeGreaterThan(request);
    expect(response).toBeGreaterThan(reference);
  });
});

describe('parseVerdict', () => {
  // Not touched by this change, but it had no tests either and it is what turns
  // the judge's reply into the number shown on screen.
  it('reads a bare JSON verdict', () => {
    expect(parseVerdict('{"score":0.8,"rationale":"bien"}')).toEqual({
      score: 0.8,
      rationale: 'bien',
    });
  });

  it('tolerates fences and surrounding prose', () => {
    const raw = 'Sure!\n```json\n{"score": 0.5, "rationale": "regular"}\n```\nHope that helps.';
    expect(parseVerdict(raw)?.score).toBe(0.5);
  });

  it('accepts `reason` as well as `rationale`', () => {
    expect(parseVerdict('{"score":1,"reason":"perfecto"}')?.rationale).toBe('perfecto');
  });

  it('clamps a score outside 0–1', () => {
    expect(parseVerdict('{"score":7}')?.score).toBe(1);
    expect(parseVerdict('{"score":-3}')?.score).toBe(0);
  });

  it('returns null rather than inventing a score', () => {
    expect(parseVerdict('no json here')).toBeNull();
    expect(parseVerdict('{"rationale":"sin nota"}')).toBeNull();
    expect(parseVerdict('{"score":"muy bueno"}')).toBeNull();
  });
});
