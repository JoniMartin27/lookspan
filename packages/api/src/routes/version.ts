import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolve the running `@lookspan/api` package version. Read once at module load
 * from the package.json that ships next to the built sources, walking up from
 * this file (works both from `src/` under ts and from `dist/` after build).
 * Falls back to `'0.0.0'` if the file can't be located.
 */
function readVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/routes -> src -> package root, or dist/routes -> dist -> package root.
  for (const up of ['..', '../..', '../../..']) {
    try {
      const pkg = JSON.parse(readFileSync(join(here, up, 'package.json'), 'utf8'));
      if (typeof pkg.version === 'string') return pkg.version;
    } catch {
      // try next level up
    }
  }
  return '0.0.0';
}

export const LOOKSPAN_VERSION = readVersion();
