/**
 * The copy-paste snippets in the docs must be valid.
 *
 * The "send your first span" curl in the docs site had an extra brace and
 * failed to parse — the very first command a new user runs. The READMEs had
 * the correct version, so the two copies had silently drifted. This asserts
 * what a reader would actually paste.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function markdownFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.astro') return [];
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? markdownFiles(full) : /\.mdx?$/.test(entry) ? [full] : [];
  });
}

const files = [
  ...markdownFiles(join(root, 'docs-site/src/content/docs')),
  ...markdownFiles(join(root, 'docs')),
  join(root, 'README.md'),
  join(root, 'README.es.md'),
];

const label = (f) => relative(root, f).replace(/\\/g, '/');

describe('documentation snippets', () => {
  it('finds the docs it is meant to be checking', () => {
    // Guards against a refactor silently emptying the corpus and turning every
    // assertion below into a no-op.
    expect(files.length).toBeGreaterThan(15);
  });

  const jsonBlocks = files.flatMap((f) =>
    [...readFileSync(f, 'utf8').matchAll(/```json\n([\s\S]*?)```/g)].map((m, i) => ({
      where: `${label(f)} · bloque json #${i + 1}`,
      body: m[1],
    })),
  );

  const curlBodies = files.flatMap((f) =>
    [...readFileSync(f, 'utf8').matchAll(/-d '(\{[\s\S]*?\})'/g)].map((m, i) => ({
      where: `${label(f)} · curl #${i + 1}`,
      body: m[1],
    })),
  );

  it('has curl bodies to check', () => {
    expect(curlBodies.length).toBeGreaterThan(4);
  });

  for (const { where, body } of [...jsonBlocks, ...curlBodies]) {
    it(`${where} is valid JSON`, () => {
      expect(() => JSON.parse(body)).not.toThrow();
    });
  }
});

/**
 * The Postgres driver runs an embedded engine: it never contacts the host in
 * the connection string and its data is gone when the process exits. Every
 * place that advertised it claimed "same features" instead, and the claim had
 * to be corrected three separate times in three separate files — README,
 * docs/CONFIGURATION.md, then the docs-site reference and the roadmap.
 *
 * So: if a document tells the reader they can point `--db` at Postgres, it has
 * to tell them what that is not.
 */
describe('the Postgres driver is described honestly', () => {
  const CAVEAT =
    /in-process|embedded|not persisted|does not survive|no persiste|no sobreviven|empotrado|embebido/i;

  const advertising = files.filter((f) => {
    const src = readFileSync(f, 'utf8');
    // Only files that actually tell you to use it, not passing mentions.
    return /postgres:\/\//.test(src) && /--db|LOOKSPAN_DB/.test(src);
  });

  it('finds the files that advertise it', () => {
    expect(advertising.length).toBeGreaterThan(2);
  });

  for (const f of advertising) {
    it(`${label(f)} says what it is not`, () => {
      expect(readFileSync(f, 'utf8')).toMatch(CAVEAT);
    });
  }
});
