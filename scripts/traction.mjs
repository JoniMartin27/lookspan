#!/usr/bin/env node
// Organic traction tracker for Lookspan.
//
// Measures *real* day-by-day signals — no vanity inflation:
//   - GitHub: stars, watchers (subscribers), forks
//   - GitHub Traffic Insights: unique views + unique clones (14-day window,
//     we only keep the row for the requested date)
//   - npm downloads for the day, BIASED to the `lookspan` CLI (the unscoped
//     package users actually `npx`/install to run the dashboard) and kept
//     SEPARATE from the `@lookspan/*` SDK packages, which are mostly pulled in
//     transitively and don't represent a human choosing Lookspan.
//
// Snapshots are written to scripts/traction-data/<YYYY-MM-DD>.json and the run
// prints a summary plus a delta vs the previous snapshot on disk.
//
// The date is provided explicitly (arg `--date=YYYY-MM-DD` or env TRACTION_DATE)
// so the testable parse/delta logic never reads the system clock. Network calls
// use `gh api` (inherits the user's auth) and the public npm downloads API.
//
// Usage:
//   node scripts/traction.mjs                 # date defaults to UTC today
//   node scripts/traction.mjs --date=2026-06-08
//   TRACTION_DATE=2026-06-08 node scripts/traction.mjs
//   node scripts/traction.mjs --json          # print the snapshot as JSON
//
// Exits non-zero only on a hard failure (e.g. gh not authenticated). Missing
// traffic rows for the date degrade gracefully to null.

import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const REPO = process.env.TRACTION_REPO || 'JoniMartin27/lookspan';
// The CLI package a human installs to run Lookspan. Downloads here are the
// headline organic signal.
const CLI_PACKAGE = 'lookspan';
// SDK / library packages, tracked separately as context (not headline).
const SDK_PACKAGES = [
  '@lookspan/anthropic',
  '@lookspan/openai',
  '@lookspan/mcp',
  '@lookspan/collector',
  '@lookspan/events',
  '@lookspan/types',
  '@lookspan/storage',
  '@lookspan/api',
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'traction-data');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ----------------------------------------------------------------------------
// Pure logic (no I/O, no clock) — covered by tests.
// ----------------------------------------------------------------------------

/** Validate / normalize a YYYY-MM-DD date string, throwing on bad input. */
export function normalizeDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) {
    throw new Error(`invalid date (expected YYYY-MM-DD): ${JSON.stringify(value)}`);
  }
  // Reject impossible calendar dates (e.g. 2026-13-40).
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw new Error(`invalid calendar date: ${value}`);
  }
  return value;
}

/** Resolve the target date from explicit arg/env, falling back to UTC today. */
export function resolveDate({ argDate, envDate, now } = {}) {
  if (argDate) return normalizeDate(argDate);
  if (envDate) return normalizeDate(envDate);
  // Only here do we touch the clock; tests pass `now` to keep it deterministic.
  const d = now instanceof Date ? now : new Date();
  return d.toISOString().slice(0, 10);
}

/** Parse the `repos/:repo` payload into the repo signals we care about. */
export function parseRepo(json) {
  const r = typeof json === 'string' ? JSON.parse(json) : json;
  return {
    stars: Number(r?.stargazers_count ?? 0),
    // `subscribers_count` is the real "watchers"; `watchers_count` is a stars alias.
    watchers: Number(r?.subscribers_count ?? 0),
    forks: Number(r?.forks_count ?? 0),
  };
}

/**
 * Pull the per-day row for `date` out of a GitHub traffic payload
 * (views or clones). Returns { count, uniques } or null if the date isn't in
 * the 14-day window the API returns.
 */
export function pickTrafficForDate(json, date) {
  const t = typeof json === 'string' ? JSON.parse(json) : json;
  const rows = t?.views ?? t?.clones ?? [];
  const stamp = `${date}T00:00:00Z`;
  const row = rows.find((x) => x?.timestamp === stamp);
  if (!row) return null;
  return { count: Number(row.count ?? 0), uniques: Number(row.uniques ?? 0) };
}

/**
 * Pull the downloads count for `date` out of an npm range payload.
 * Returns a number (0 if the day isn't present).
 */
export function pickNpmForDate(json, date) {
  const n = typeof json === 'string' ? JSON.parse(json) : json;
  const rows = Array.isArray(n?.downloads) ? n.downloads : [];
  const row = rows.find((x) => x?.day === date);
  return row ? Number(row.downloads ?? 0) : 0;
}

/** Build the canonical snapshot object from already-fetched pieces. */
export function buildSnapshot({ date, repo, views, clones, cliDownloads, sdkDownloads }) {
  const sdkTotal = Object.values(sdkDownloads || {}).reduce((a, b) => a + Number(b || 0), 0);
  return {
    date,
    repo,
    traffic: {
      // Unique humans, the honest organic numbers (count is bot-inflated).
      uniqueViews: views ? views.uniques : null,
      uniqueClones: clones ? clones.uniques : null,
      views: views ? views.count : null,
      clones: clones ? clones.count : null,
    },
    npm: {
      // Headline: the CLI package a person installs to run Lookspan.
      cli: Number(cliDownloads || 0),
      // Context: SDK libs, mostly transitive — kept apart so they don't
      // flatter the CLI signal.
      sdkTotal,
      sdk: sdkDownloads || {},
    },
  };
}

const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Compute prev -> curr deltas for every numeric leaf we report. */
export function computeDelta(prev, curr) {
  const diff = (p, c) => {
    const cn = numOrNull(c);
    const pn = numOrNull(p);
    if (cn === null || pn === null) return null;
    return cn - pn;
  };
  const p = prev || {};
  return {
    stars: diff(p.repo?.stars, curr.repo?.stars),
    watchers: diff(p.repo?.watchers, curr.repo?.watchers),
    forks: diff(p.repo?.forks, curr.repo?.forks),
    uniqueViews: diff(p.traffic?.uniqueViews, curr.traffic?.uniqueViews),
    uniqueClones: diff(p.traffic?.uniqueClones, curr.traffic?.uniqueClones),
    cliDownloads: diff(p.npm?.cli, curr.npm?.cli),
    sdkDownloads: diff(p.npm?.sdkTotal, curr.npm?.sdkTotal),
  };
}

const sign = (n) => (n === null ? '·' : n > 0 ? `+${n}` : `${n}`);

/** Render a human summary + delta block. Pure: returns a string. */
export function formatReport(snap, delta, prevDate) {
  const t = snap.traffic;
  const L = [];
  L.push(`Lookspan traction — ${snap.date}`);
  L.push('────────────────────────────');
  L.push(`  stars         ${snap.repo.stars}   (${sign(delta.stars)})`);
  L.push(`  watchers      ${snap.repo.watchers}   (${sign(delta.watchers)})`);
  L.push(`  forks         ${snap.repo.forks}   (${sign(delta.forks)})`);
  L.push(`  unique views  ${t.uniqueViews ?? '·'}   (${sign(delta.uniqueViews)})`);
  L.push(`  unique clones ${t.uniqueClones ?? '·'}   (${sign(delta.uniqueClones)})`);
  L.push(`  npm CLI dls   ${snap.npm.cli}   (${sign(delta.cliDownloads)})`);
  L.push(`  npm SDK dls   ${snap.npm.sdkTotal}   (${sign(delta.sdkDownloads)})`);
  L.push('────────────────────────────');
  L.push(prevDate ? `delta vs ${prevDate}` : 'no previous snapshot — delta is baseline');
  return L.join('\n');
}

/**
 * Given the filenames in the data dir and the current date, return the most
 * recent prior snapshot filename (strictly before `date`), or null.
 */
export function findPreviousSnapshotName(filenames, date) {
  const dates = filenames
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .filter((d) => DATE_RE.test(d) && d < date)
    .sort();
  return dates.length ? `${dates[dates.length - 1]}.json` : null;
}

// ----------------------------------------------------------------------------
// I/O layer.
// ----------------------------------------------------------------------------

async function gh(endpoint) {
  try {
    const { stdout } = await execFileAsync('gh', ['api', endpoint], {
      maxBuffer: 8 * 1024 * 1024,
    });
    return stdout;
  } catch (err) {
    const msg = err?.stderr || err?.message || String(err);
    throw new Error(`gh api ${endpoint} failed: ${msg.trim()}`);
  }
}

async function npmRange(pkg, date) {
  // The "point" endpoint for a single past day can lag; the range endpoint with
  // an explicit window is the reliable way to read one day's downloads.
  const url = `https://api.npmjs.org/downloads/range/${date}:${date}/${encodeURIComponent(pkg)}`;
  const res = await fetch(url);
  if (!res.ok) {
    // npm returns 404 for a package with no stats yet — treat as zero.
    if (res.status === 404) return 0;
    throw new Error(`npm downloads for ${pkg} -> ${res.status}`);
  }
  const json = await res.json();
  return pickNpmForDate(json, date);
}

async function readPreviousSnapshot(date) {
  let files = [];
  try {
    files = await readdir(DATA_DIR);
  } catch {
    return { prev: null, prevDate: null };
  }
  const name = findPreviousSnapshotName(files, date);
  if (!name) return { prev: null, prevDate: null };
  try {
    const prev = JSON.parse(await readFile(join(DATA_DIR, name), 'utf8'));
    return { prev, prevDate: name.replace(/\.json$/, '') };
  } catch {
    return { prev: null, prevDate: null };
  }
}

async function collectSnapshot(date) {
  const [repoRaw, viewsRaw, clonesRaw] = await Promise.all([
    gh(`repos/${REPO}`),
    gh(`repos/${REPO}/traffic/views`).catch(() => null),
    gh(`repos/${REPO}/traffic/clones`).catch(() => null),
  ]);

  const repo = parseRepo(repoRaw);
  const views = viewsRaw ? pickTrafficForDate(viewsRaw, date) : null;
  const clones = clonesRaw ? pickTrafficForDate(clonesRaw, date) : null;

  const cliDownloads = await npmRange(CLI_PACKAGE, date);
  const sdkDownloads = {};
  for (const pkg of SDK_PACKAGES) {
    sdkDownloads[pkg] = await npmRange(pkg, date);
  }

  return buildSnapshot({ date, repo, views, clones, cliDownloads, sdkDownloads });
}

async function main() {
  const args = process.argv.slice(2);
  const argDate = args.find((a) => a.startsWith('--date='))?.slice('--date='.length);
  const asJson = args.includes('--json');
  const date = resolveDate({ argDate, envDate: process.env.TRACTION_DATE });

  const snap = await collectSnapshot(date);

  await mkdir(DATA_DIR, { recursive: true });
  const outPath = join(DATA_DIR, `${date}.json`);
  await writeFile(outPath, `${JSON.stringify(snap, null, 2)}\n`, 'utf8');

  const { prev, prevDate } = await readPreviousSnapshot(date);
  const delta = computeDelta(prev, snap);

  if (asJson) {
    process.stdout.write(`${JSON.stringify({ snapshot: snap, delta, prevDate }, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatReport(snap, delta, prevDate)}\n`);
    process.stderr.write(`\nsnapshot written: ${outPath}\n`);
  }
}

// Only run when executed directly, not when imported by tests.
const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`traction: ${err?.message || err}\n`);
    process.exit(1);
  });
}
