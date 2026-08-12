#!/usr/bin/env node
// Rasterize the landing's Open Graph cover to PNG.
//
// `website/og-cover.svg` is the editable master, but **no social platform
// renders an SVG in a link preview** — X, LinkedIn, Slack, Discord and
// Facebook all want PNG or JPEG. The card came out blank everywhere.
//
// Rendering goes through the Chromium that Playwright already installs for the
// demo recorder, so there is no new dependency and no committed binary that
// nobody can regenerate.
//
// Usage: node scripts/make-og.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(root, 'website/og-cover.svg');
const OUT = resolve(root, 'website/og-cover.png');
const W = 1200;
const H = 630;

const svg = readFileSync(SRC, 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.setContent(
  `<html><body style="margin:0">${svg.replace('<svg', `<svg width="${W}" height="${H}"`)}</body></html>`,
);
// Let gradients and filters settle before capturing.
await page.waitForTimeout(500);
const png = await page.screenshot({ type: 'png' });
await browser.close();

writeFileSync(OUT, png);
console.log(`[og] website/og-cover.png  ${W}×${H}  ${(png.length / 1024).toFixed(0)} kB`);
