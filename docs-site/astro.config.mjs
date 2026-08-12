// @ts-check
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

// When deploying to GitHub Pages at https://<user>.github.io/lookspan/ the site
// is served from a sub-path. `BASE` lets the Actions workflow inject `/lookspan`
// while local `astro dev` / `astro preview` stay at the root.
// Served from a sub-path on GitHub Pages (https://<user>.github.io/lookspan/).
// We keep the same base in dev so that the `/lookspan/...` links written in the
// markdown and sidebar resolve identically locally and in production.
const SITE = process.env.SITE_URL ?? 'https://jonimartin27.github.io';
const BASE = process.env.BASE_PATH ?? '/lookspan';

const GITHUB = 'https://github.com/JoniMartin27/lookspan';

// Starlight emits og:title/description and `twitter:card=summary_large_image`
// but no image, so every shared link rendered an empty card that had promised a
// big one. Open Graph needs an absolute url, hence the site+base prefix.
// The file is `npm run og` output, copied into public/.
const OG_IMAGE = `${SITE}${BASE}/og-cover.png`;
const socialCard = [
  { property: 'og:image', content: OG_IMAGE },
  { property: 'og:image:type', content: 'image/png' },
  { property: 'og:image:width', content: '1200' },
  { property: 'og:image:height', content: '630' },
  {
    property: 'og:image:alt',
    content: 'Lookspan — local-first observability for AI agents',
  },
  { name: 'twitter:image', content: OG_IMAGE },
].map((attrs) => ({ tag: /** @type {const} */ ('meta'), attrs }));

export default defineConfig({
  site: SITE,
  base: BASE,
  trailingSlash: 'ignore',
  integrations: [
    starlight({
      title: 'Lookspan',
      description:
        'Local-first observability dashboard for AI agents. MCP-native. See every span your agents emit.',
      logo: { src: './src/assets/logo.svg', replacesTitle: false },
      favicon: '/favicon.svg',
      head: socialCard,
      social: { github: GITHUB },
      editLink: {
        baseUrl: `${GITHUB}/edit/main/docs-site/`,
      },
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'Introduction', link: '/' },
            { label: 'Getting started', link: '/guides/getting-started/' },
            { label: 'Installation', link: '/guides/installation/' },
            { label: 'Lookspan vs alternatives', link: '/compare/' },
          ],
        },
        {
          label: 'Instrument your agents',
          items: [
            { label: 'Overview', link: '/sdks/' },
            { label: 'OpenAI SDK (@lookspan/openai)', link: '/sdks/openai/' },
            { label: 'Anthropic SDK (@lookspan/anthropic)', link: '/sdks/anthropic/' },
            { label: 'MCP SDK (@lookspan/mcp)', link: '/sdks/mcp/' },
            { label: 'Python (LangGraph / CrewAI)', link: '/sdks/python/' },
            { label: 'OpenTelemetry (OTLP)', link: '/sdks/opentelemetry/' },
          ],
        },
        {
          label: 'Evaluate & improve',
          items: [
            { label: 'Replay & diff', link: '/guides/replay-and-diff/' },
            { label: 'LLM-as-judge', link: '/guides/llm-as-judge/' },
            { label: 'Datasets & experiments', link: '/guides/datasets-and-experiments/' },
          ],
        },
        {
          label: 'Operate',
          items: [
            { label: 'Alerts', link: '/guides/alerts/' },
            { label: 'Pricing & cost tracking', link: '/guides/pricing-and-cost/' },
            { label: 'Sessions & agent causality', link: '/guides/sessions-and-causality/' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Configuration', link: '/reference/configuration/' },
            { label: 'HTTP API', link: '/reference/http-api/' },
            { label: 'CLI options', link: '/reference/cli/' },
          ],
        },
      ],
    }),
  ],
});
