# Lookspan docs site

The documentation site for Lookspan, built with [Astro Starlight](https://starlight.astro.build/).

This directory is **fully isolated** from the monorepo:

- It is **not** an npm workspace (the root `workspaces` globs are `packages/*`
  and `apps/*` only), so `npm install` / `npm ci` and `npm run ci` at the repo
  root never touch it.
- It has its own `package.json` and `package-lock.json`.
- It is excluded from Biome (`biome.json` → `!docs-site`) and is not referenced
  by the root TypeScript project (`tsconfig.json`), so `npm run ci` stays green
  and unaffected.

## Local development

```bash
cd docs-site
npm install
npm run dev        # → http://localhost:4321
npm run build      # static output in ./dist
npm run preview    # serve the built site
```

## Deployment

The site deploys to GitHub Pages via `.github/workflows/docs.yml`, which only
runs on pushes to `main` that touch `docs-site/**` (and can be triggered
manually). It is independent of the repo's `CI` workflow.

The build is served from the `/lookspan` base path on GitHub Pages. The same
base is used in `astro dev` so that the `/lookspan/...` links in the content
resolve identically locally and in production — visit
`http://localhost:4321/lookspan/`. Override `BASE_PATH` / `SITE_URL` if you need
a different base.
