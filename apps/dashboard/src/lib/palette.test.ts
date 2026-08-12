/**
 * The Fervon ramp has to stay readable.
 *
 * The first warm remap left `neutral-500` at 4.42:1 and `neutral-600` at
 * 2.54:1 against the page, and both carry real text — table headers, tile
 * labels, hints, the live indicator. axe flagged 89 nodes across every view.
 *
 * Reading the tokens straight out of `index.css` means the check follows the
 * theme instead of a copy of it.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '..', 'index.css'),
  'utf8',
);

/** Every `--color-x: #hex` declared in the theme block. */
function tokens(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    out[m[1] as string] = (m[2] as string).toLowerCase();
  }
  return out;
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const T = tokens();
const PAGE = 'neutral-950'; // the page background
const CARD = 'neutral-900'; // cards and panels sit on top of it

/** Tokens used for body-sized text somewhere in the dashboard. */
const TEXT_TOKENS = [
  'neutral-100',
  'neutral-200',
  'neutral-300',
  'neutral-400',
  'neutral-500',
  'neutral-600',
  'brand-500',
];

describe('Fervon palette contrast', () => {
  it('reads the tokens out of index.css', () => {
    // If the theme block is renamed or restructured, fail loudly instead of
    // silently checking an empty set.
    expect(Object.keys(T).length).toBeGreaterThan(10);
    expect(T[PAGE]).toBeDefined();
    expect(T[CARD]).toBeDefined();
  });

  for (const token of TEXT_TOKENS) {
    for (const [surfaceName, surface] of [
      ['page', PAGE],
      ['card', CARD],
    ] as const) {
      it(`${token} on the ${surfaceName} clears AA (4.5:1)`, () => {
        const fg = T[token];
        const bg = T[surface];
        expect(fg, `${token} missing from index.css`).toBeDefined();
        expect(bg).toBeDefined();
        expect(contrast(fg as string, bg as string)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it('ink on the solid ember button clears AA', () => {
    // White would only reach 2.9:1 — the reason `--color-ink` exists.
    expect(contrast(T.ink as string, T['brand-500'] as string)).toBeGreaterThanOrEqual(4.5);
  });
});
