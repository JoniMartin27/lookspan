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
 * The same snippets, but the copy the product itself hands out.
 *
 * `/connect` is where a new user goes to wire up an agent, and its eight
 * snippets are maintained by hand in a `.tsx` file that no check ever looked
 * at — while the identical curl in the docs site was already covered here,
 * because it had been broken once. Running them proved they are correct today;
 * this keeps them that way.
 */
describe('the Connect page hands out working snippets', () => {
  const source = readFileSync(join(root, 'apps/dashboard/src/views/ConnectView.tsx'), 'utf8');
  const ORIGIN = 'http://127.0.0.1:3100';

  /**
   * Pull out every `code={`…`}` template literal. Written by hand rather than
   * with a regex because the snippets contain `${ORIGIN}` and JSON braces, and
   * a lazy match stops at the first one of those.
   */
  function codeBlocks(src) {
    const out = [];
    const open = 'code={`';
    let i = src.indexOf(open);
    while (i !== -1) {
      let j = i + open.length;
      let depth = 0;
      let text = '';
      while (j < src.length) {
        const c = src[j];
        if (c === '\\') {
          text += src[j] + src[j + 1];
          j += 2;
          continue;
        }
        if (c === '$' && src[j + 1] === '{') {
          depth++;
          text += '${';
          j += 2;
          continue;
        }
        if (c === '}' && depth > 0) {
          depth--;
          text += '}';
          j++;
          continue;
        }
        if (c === '`' && depth === 0) break;
        text += c;
        j++;
      }
      const before = src.slice(Math.max(0, i - 400), i);
      const title = [...before.matchAll(/title="([^"]+)"/g)].pop()?.[1] ?? `#${out.length + 1}`;
      out.push({ title, text: text.replace(/\$\{ORIGIN\}/g, ORIGIN) });
      i = src.indexOf(open, j);
    }
    return out;
  }

  const snippets = codeBlocks(source);

  it('finds the snippets it is meant to be checking', () => {
    expect(snippets.length).toBeGreaterThanOrEqual(8);
  });

  it('leaves no unresolved interpolation in what the user copies', () => {
    // `${ORIGIN}` is the only one the view has. A second variable added later
    // would otherwise be pasted literally into somebody's terminal.
    const leftover = snippets.filter((s) => s.text.includes('${'));
    expect(leftover.map((s) => s.title)).toEqual([]);
  });

  const curl = snippets.find((s) => s.text.startsWith('curl'));

  it('ships a curl snippet', () => {
    expect(curl).toBeDefined();
  });

  it('the curl body is valid JSON', () => {
    const body = curl.text.slice(curl.text.indexOf("-d '") + 4, curl.text.lastIndexOf("'"));
    expect(() => JSON.parse(body)).not.toThrow();
  });

  it('the curl posts to the ingest endpoint', () => {
    expect(curl.text).toMatch(new RegExp(`curl -X POST ${ORIGIN}/api/ingest`));
  });

  /** Package name → the directory that actually declares it. */
  const npmPackages = new Map();
  for (const dir of readdirSync(join(root, 'packages'))) {
    try {
      const { name } = JSON.parse(
        readFileSync(join(root, 'packages', dir, 'package.json'), 'utf8'),
      );
      npmPackages.set(name, dir);
    } catch {
      /* not a package */
    }
  }

  const pyPackages = new Set();
  for (const dir of readdirSync(join(root, 'python'))) {
    try {
      const toml = readFileSync(join(root, 'python', dir, 'pyproject.toml'), 'utf8');
      const name = toml.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
      if (name) pyPackages.add(name);
    } catch {
      /* not a package */
    }
  }

  const npmNamed = [
    ...new Set([...source.matchAll(/npm install (@?[\w/@-]+)/g)].map((m) => m[1])),
  ].filter((p) => p === 'lookspan' || p.startsWith('@lookspan/'));

  it('names npm packages that exist', () => {
    expect(npmNamed.length).toBeGreaterThan(2);
    for (const p of npmNamed) {
      expect(npmPackages.has(p), `${p} is not declared by any packages/*/package.json`).toBe(true);
    }
  });

  const pyNamed = [
    ...new Set([
      ...[...source.matchAll(/pip install ([\w-]+)/g)].map((m) => m[1]),
      ...[...source.matchAll(/from (lookspan[\w_]*) import/g)].map((m) => m[1].replace(/_/g, '-')),
    ]),
  ].filter((p) => p.startsWith('lookspan'));

  it('names Python packages that exist', () => {
    expect(pyNamed.length).toBeGreaterThan(1);
    for (const p of pyNamed) {
      expect(pyPackages.has(p), `${p} has no pyproject.toml under python/`).toBe(true);
    }
  });

  /** Follow the `export * from './x.js'` barrel one level down. */
  function declaredTypes(dir) {
    const read = (rel) => {
      try {
        return readFileSync(join(root, 'packages', dir, 'dist', rel), 'utf8');
      } catch {
        return '';
      }
    };
    let out = read('index.d.ts');
    for (const m of out.matchAll(/export \* from '\.\/([\w.-]+)\.js'/g))
      out += read(`${m[1]}.d.ts`);
    return out;
  }

  const imports = [...source.matchAll(/import \{ ([^}]+) \} from '(@lookspan\/[\w-]+)'/g)];

  it('imports symbols the packages actually export', () => {
    expect(imports.length).toBeGreaterThan(2);
    for (const [, names, pkg] of imports) {
      const dir = npmPackages.get(pkg);
      expect(dir, `${pkg} is not a package in this repo`).toBeDefined();
      const types = declaredTypes(dir);
      // Skipped rather than failed when the package has not been built: `npm
      // run ci` builds first, but running this file alone should not fail for
      // a reason that has nothing to do with the snippets.
      if (!types) continue;
      for (const name of names.split(',').map((n) => n.trim())) {
        expect(new RegExp(`\\b${name}\\b`).test(types), `${pkg} does not export ${name}`).toBe(
          true,
        );
      }
    }
  });
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
