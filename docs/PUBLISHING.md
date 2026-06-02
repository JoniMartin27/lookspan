# Publishing

Lookspan ships **three npm packages** and **three PyPI packages**. Internal
packages (`@lookspan/api`, `collector`, `storage`, `events`) are *not* published
— they are bundled into the `lookspan` CLI by `scripts/bundle.mjs`.

All packages are at version **0.1.0**. Bump versions together before a release.

## npm (run from the repo root)

Build everything first, then publish in dependency order:

```bash
npm run build

# 1. types — depended on by the MCP SDK
npm publish -w @lookspan/types        # public scoped pkg (publishConfig set)

# 2. MCP SDK — depends on @lookspan/types@^0.1.0
npm publish -w @lookspan/mcp

# 3. OpenAI drop-in SDK — depends on @lookspan/mcp + @lookspan/types
npm publish -w @lookspan/openai

# 4. CLI — self-contained bundle (no @lookspan/* runtime deps).
#    `prepack` runs scripts/bundle.mjs (esbuild + copies the dashboard to public/).
npm publish -w lookspan               # unscoped → `npx lookspan`
```

Verify before publishing: `npm run release:cli` produces `lookspan-0.1.0.tgz`;
`npm pack -w @lookspan/mcp` / `-w @lookspan/types` produce clean tarballs.
A clean-install smoke test:

```bash
mkdir /tmp/ls-test && cd /tmp/ls-test && npm init -y
npm install /path/to/lookspan-0.1.0.tgz
npx lookspan            # → http://127.0.0.1:3100 serves the dashboard
```

> First publish of a scoped package needs `--access public` (already set via
> `publishConfig.access`). Requires `npm login` + 2FA.

## PyPI (run from each package dir)

Publish `lookspan` (core) first — the adapters depend on it.

```bash
cd python/lookspan-core     && uv build && uvx twine upload dist/*
cd python/lookspan-langgraph && uv build && uvx twine upload dist/*
cd python/lookspan-crewai    && uv build && uvx twine upload dist/*
```

Requires a PyPI account + API token (`~/.pypirc` or `TWINE_*` env vars).

## After publishing

- Tag the release: `git tag v0.1.0 && git push --tags`.
- Update the README install snippets if the package names/versions changed.
- Record the demo GIF and drop it at the top of the README.
