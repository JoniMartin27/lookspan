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
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHART, CHART_TOKENS } from './chartTheme.ts';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(SRC, 'index.css'), 'utf8');

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

/**
 * Charts are drawn by recharts, which takes colour strings rather than CSS
 * classes — so they sit outside the theme and drift silently. When the neutral
 * ramp was raised to clear AA, `index.css` moved and the hardcoded axis colour
 * did not: 39 tick labels stayed at 4.31:1, and axe never saw it because it
 * does not measure contrast inside an `<svg>`.
 */
describe('chart chrome follows the theme', () => {
  for (const key of Object.keys(CHART) as (keyof typeof CHART)[]) {
    const token = CHART_TOKENS[key];
    it(`${key} still equals --color-${token}`, () => {
      expect(T[token], `${token} missing from index.css`).toBeDefined();
      expect(CHART[key]).toBe(T[token]);
    });
  }

  it('axis tick labels clear AA on the card', () => {
    // The axis colour is the only chart value that carries text.
    expect(contrast(CHART.axis, T[CARD] as string)).toBeGreaterThanOrEqual(4.5);
  });
});

/**
 * The checks above measure text against the page and the card. Inline `<code>`
 * chips sit on `bg-neutral-800`, which is lighter than both — so a token that
 * clears AA on the page can still fail inside a chip.
 *
 * That is exactly what happened on `/costs`: the chip declared no colour of its
 * own and inherited `neutral-600` from the surrounding hint, landing at 4.05:1.
 * Four of the five chips in the dashboard were inheriting like that, one edit
 * to a parent paragraph away from the same defect.
 *
 * So the rule is not "the current colours happen to work" but "a chip states
 * its own colour, and that colour clears AA on the chip's own background".
 */
describe('inline code chips', () => {
  const CHIP = 'neutral-800';

  /** Every `<code className="…">` in the dashboard's views and components. */
  function chips(): { file: string; classes: string }[] {
    const out: { file: string; classes: string }[] = [];
    for (const dir of ['views', 'components', 'pages']) {
      let entries: string[];
      try {
        entries = readdirSync(join(SRC, dir));
      } catch {
        continue; // the layout may not have all three
      }
      for (const name of entries.filter((n) => n.endsWith('.tsx'))) {
        const source = readFileSync(join(SRC, dir, name), 'utf8');
        for (const m of source.matchAll(/<code\s+className="([^"]*)"/g)) {
          out.push({ file: `${dir}/${name}`, classes: m[1] as string });
        }
      }
    }
    return out;
  }

  const CHIPS = chips();

  it('finds the chips to check', () => {
    // A refactor that renames the directories must fail loudly rather than
    // quietly checking nothing.
    expect(CHIPS.length).toBeGreaterThan(3);
  });

  for (const { file, classes } of CHIPS) {
    const onChip = classes.includes(`bg-${CHIP}`);
    if (!onChip) continue;
    const label = classes.replace(/\s+/g, ' ').slice(0, 48);

    it(`${file} — "${label}" states its own text colour`, () => {
      expect(classes, 'a chip on a darker background must not inherit its colour').toMatch(
        /\btext-neutral-\d+\b/,
      );
    });

    it(`${file} — "${label}" clears AA against the chip background`, () => {
      const token = classes.match(/\btext-(neutral-\d+)\b/)?.[1];
      expect(token).toBeDefined();
      const fg = T[token as string];
      expect(fg, `${token} missing from index.css`).toBeDefined();
      expect(contrast(fg as string, T[CHIP] as string)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
