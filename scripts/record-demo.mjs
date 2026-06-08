#!/usr/bin/env node
// Record a single continuous "take" of the Lookspan dashboard with Playwright
// (chromium, recordVideo → webm). The webm is post-processed into docs/demo.gif
// by scripts/make-gif.sh. Assumes a seeded server is already running on :3100.
//
// Usage: node scripts/record-demo.mjs [--base http://127.0.0.1:3100] [--out .demo-rec]
import { mkdirSync, rmSync } from 'node:fs';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const BASE = flag('base', 'http://127.0.0.1:3100').replace(/\/$/, '');
const OUT = flag('out', '.demo-rec');

const W = 1440;
const H = 900;

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Smoothly drift the cursor so hovers read as intentional, not teleported.
async function glide(page, x, y, steps = 18) {
  await page.mouse.move(x, y, { steps });
}

async function run() {
  const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
    recordVideo: { dir: OUT, size: { width: W, height: H } },
  });
  const page = await context.newPage();

  // ---- Scene 1: trace list / health strip --------------------------------
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('table tbody tr', { timeout: 15000 });
  await glide(page, 720, 110); // over the health strip
  await sleep(1400);
  // run the eye down the table
  await glide(page, 300, 300);
  await sleep(400);
  await glide(page, 760, 420); // hover a latency mini-bar
  await sleep(900);

  // framework filter → langgraph → back to all
  const fwSelect = page.locator('select').first();
  await fwSelect.selectOption('langgraph');
  await sleep(1500);
  await fwSelect.selectOption('');
  await sleep(1100);

  // ---- Scene 2: star trace detail / waterfall -----------------------------
  await page.getByText('support.handle_ticket', { exact: true }).first().click();
  await page.waitForSelector('text=Replay & judge', { timeout: 15000 });
  await sleep(1200);

  // hover then click the compose_answer bar to open the span drawer
  const composeBar = page.getByRole('button', { name: /compose_answer/ }).first();
  await composeBar.scrollIntoViewIfNeeded();
  const box = await composeBar.boundingBox();
  if (box) await glide(page, box.x + box.width * 0.7, box.y + box.height / 2);
  await sleep(700);
  await composeBar.click();
  await page.waitForSelector('text=Conversation', { timeout: 8000 }).catch(() => {});
  await sleep(900);
  // let the conversation bubbles breathe; drift down the drawer
  await glide(page, 1240, 480);
  await sleep(2000);
  // close the drawer
  await page
    .getByRole('button', { name: 'Close' })
    .first()
    .click()
    .catch(() => {});
  await sleep(500);

  // toggle Tree then back to Timeline
  await page.getByRole('button', { name: 'Tree' }).click();
  await sleep(1700);
  await page.getByRole('button', { name: 'Timeline' }).click();
  await sleep(800);

  // ---- Scene 3: multi-agent delegation session ---------------------------
  // Brief beat on the star trace's own "view session" link for continuity, then
  // jump to the multi-agent onboarding session (4 agents, one error → red node).
  await page.getByRole('link', { name: 'view session' }).first().click();
  await page.waitForSelector('text=Timeline by agent', { timeout: 15000 });
  await sleep(700);
  await page.goto(`${BASE}/sessions/sess-onboard-demo`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Timeline by agent', { timeout: 15000 });
  await sleep(1400);
  // drift over the delegation graph
  await glide(page, 720, 360);
  await sleep(1600);
  // hover a timeline-by-agent bar to surface the TracePreview
  const lanes = page.locator('.relative.h-6.flex-1');
  const laneCount = await lanes.count();
  if (laneCount > 0) {
    const lb = await lanes.nth(Math.min(1, laneCount - 1)).boundingBox();
    if (lb) await glide(page, lb.x + lb.width * 0.4, lb.y + lb.height / 2);
  }
  await sleep(2000);

  // ---- Scene 4: replay & judge -------------------------------------------
  await page.goto(`${BASE}/traces/tr_star_ticket`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Replay & judge', { timeout: 15000 });
  await sleep(700);
  await page.getByRole('button', { name: /Replay/ }).click();
  await page.waitForSelector('text=Replay the prompt', { timeout: 8000 });
  await sleep(1200);
  // the seeded replay card is already present; drift over it / the diff
  await glide(page, 1240, 520);
  await sleep(2200);
  // expand the llm-judge score chip in the header
  const judgeChip = page.getByRole('button', { name: /correctness/ }).first();
  if (await judgeChip.count()) {
    const jb = await judgeChip.boundingBox();
    if (jb) await glide(page, jb.x + jb.width / 2, jb.y + jb.height / 2);
    await judgeChip.click().catch(() => {});
    await sleep(1800);
  }
  // choose the regressions dataset in the lab drawer (bridge to datasets)
  const dsSelect = page.locator('aside select').first();
  if (await dsSelect.count()) {
    await dsSelect.selectOption({ label: 'regressions' }).catch(() => {});
    await sleep(900);
  }

  // ---- Closing beat: aggregated costs ------------------------------------
  await page.goto(`${BASE}/costs`, { waitUntil: 'domcontentloaded' });
  await sleep(2200);

  await context.close(); // flush video
  await browser.close();

  // print the recorded video path for the caller
  const video = page.video();
  const path = video ? await video.path().catch(() => null) : null;
  console.log(`VIDEO=${path ?? '(unknown)'}`);
}

run().catch((e) => {
  console.error('record failed:', e);
  process.exit(1);
});
