# Publishing

Lookspan ships **five npm packages** and **three PyPI packages**. Internal
packages (`@lookspan/api`, `collector`, `storage`, `events`) are *not* published
— they are bundled into the `lookspan` CLI by `scripts/bundle.mjs`.

Every package moves in lockstep; the npm packages are at **0.5.3**. Bump them
together (including the `@lookspan/*` ranges the SDKs depend on and
`package-lock.json`) before a release.

## npm (run from the repo root)

Build everything first, then publish in dependency order:

```bash
npm run ci

# 1. types — depended on by the MCP SDK
npm publish -w @lookspan/types        # public scoped pkg (publishConfig set)

# 2. MCP SDK — depends on @lookspan/types
npm publish -w @lookspan/mcp

# 3. Drop-in SDKs — depend on @lookspan/mcp + @lookspan/types
npm publish -w @lookspan/openai
npm publish -w @lookspan/anthropic

# 4. CLI — self-contained bundle (no @lookspan/* runtime deps).
#    `prepack` runs scripts/bundle.mjs (esbuild + copies the dashboard to public/).
npm publish -w lookspan               # unscoped → `npx lookspan`
```

With 2FA on the account every one of those needs a fresh code: append
`--otp=123456`. The five publishes take under a minute, but a code lasts 30
seconds — read a new one for each.

Verify before publishing: `npm run release:cli` produces `lookspan-<version>.tgz`;
`npm pack -w @lookspan/mcp` / `-w @lookspan/types` produce clean tarballs.
A clean-install smoke test:

```bash
mkdir /tmp/ls-test && cd /tmp/ls-test && npm init -y
npm install /path/to/lookspan-<version>.tgz
npx lookspan            # → http://127.0.0.1:3100 serves the dashboard
```

> First publish of a scoped package needs `--access public` (already set via
> `publishConfig.access`). Requires `npm login` + 2FA.

## Gotchas paid for

- **`packages/cli/public/` shadows the dashboard.** `bundle.mjs` copies
  `apps/dashboard/dist` there; while it exists the CLI serves that copy, so a
  rebuilt dashboard appears not to change. `rm -rf packages/cli/public` when
  developing.
- **`packages/cli/dist/index.js` is left as the esbuild bundle** after a
  publish, and `tsc --build` will not rewrite it if the CLI sources did not
  change — a stale bundle serves old routes. Force it:
  `rm -rf packages/cli/dist packages/cli/*.tsbuildinfo && npx tsc --build --force packages/cli`.

## PyPI (run from each package dir)

Publish `lookspan` (core) first — the adapters depend on it.

```bash
cd python/lookspan-core     && uv build && uvx twine upload dist/*
cd python/lookspan-langgraph && uv build && uvx twine upload dist/*
cd python/lookspan-crewai    && uv build && uvx twine upload dist/*
```

Requires a PyPI account + API token (`~/.pypirc` or `TWINE_*` env vars).

## After publishing

- Tag the release with the version being published, for example:
  `git tag v0.5.3 && git push --tags`.
- Update the README install snippets if the package names/versions changed.
- Record the demo GIF and drop it at the top of the README.
