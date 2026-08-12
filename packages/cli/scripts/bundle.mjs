// Produces the self-contained, publishable CLI artifact:
//  - bundles src/index.ts + all internal @lookspan/* packages into dist/index.js
//    (so the published `lookspan` package has no @lookspan/* runtime deps)
//  - keeps native/runtime deps external (declared in package.json)
//  - copies the built dashboard into public/ so `npx lookspan` serves the UI
//
// Assumes the workspace packages and the dashboard are already built
// (run `npm run build` at the repo root first; `prepack` and release do this).

import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const cliDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(cliDir, '..', '..');
const dashboardDist = resolve(repoRoot, 'apps', 'dashboard', 'dist');
const publicDir = resolve(cliDir, 'public');

if (!existsSync(resolve(dashboardDist, 'index.html'))) {
  console.error(
    `[bundle] dashboard build not found at ${dashboardDist}\n` +
      '         run `npm run build` at the repo root first.',
  );
  process.exit(1);
}

await build({
  entryPoints: [resolve(cliDir, 'src', 'index.ts')],
  outfile: resolve(cliDir, 'dist', 'index.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  // The entry (src/index.ts) already starts with a `#!/usr/bin/env node`
  // shebang, which esbuild preserves — no banner needed (a banner would add a
  // second shebang on line 2 and break Node's ESM loader).
  // Native or heavy runtime deps stay external — declared as real npm deps.
  // The provider SDKs are lazy-imported by the replay/judge feature; keeping
  // them external means they're installed alongside the CLI but never loaded
  // unless those endpoints are used.
  //
  // `pg-mem` (the Postgres driver's engine) MUST stay external too: it ships a
  // webpack CJS bundle that calls `require('crypto')` at load time, and esbuild
  // cannot make a dynamic require work inside ESM output. Inlining it makes the
  // published CLI throw `Dynamic require of "crypto" is not supported` before
  // it prints a single line. `npm run smoke:cli` guards this.
  external: ['better-sqlite3', 'express', 'cors', 'openai', '@anthropic-ai/sdk', 'pg-mem'],
  logLevel: 'info',
});

// Ship the dashboard inside the package so `npx lookspan` serves it.
rmSync(publicDir, { recursive: true, force: true });
cpSync(dashboardDist, publicDir, { recursive: true });

console.log('[bundle] CLI bundled and dashboard copied to public/');
