/**
 * Chart chrome colours.
 *
 * recharts and react-flow take plain colour strings, not CSS classes, so the
 * charts cannot inherit the Fervon theme the way the rest of the dashboard
 * does. That seam is where the theme drifts: when the neutral ramp was raised
 * to clear WCAG AA, the axis labels kept the old `#857567` and sat at 4.31:1
 * for months — invisible to axe, which does not measure contrast inside an
 * `<svg>`.
 *
 * Keeping the values here, named after the token they mirror, lets
 * `palette.test.ts` assert they still match `index.css`.
 */
export const CHART = {
  /** Axis line *and* tick labels. Real text, so it must clear AA. */
  axis: '#9a8a7e', // --color-neutral-500
  /** Grid lines. Decorative. */
  grid: '#2c211b', // --color-neutral-800
  /** Tooltip surface. */
  tooltipBg: '#1a1310', // --color-neutral-900
  /** Tooltip border. */
  tooltipBorder: '#3d2f26', // --color-neutral-700
  /** Bars. */
  bar: '#ff6a00', // --color-brand-500
} as const;

/** The token each `CHART` entry mirrors, so the test can check the pairing. */
export const CHART_TOKENS: Record<keyof typeof CHART, string> = {
  axis: 'neutral-500',
  grid: 'neutral-800',
  tooltipBg: 'neutral-900',
  tooltipBorder: 'neutral-700',
  bar: 'brand-500',
};
