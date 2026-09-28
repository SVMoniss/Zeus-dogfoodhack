// One-off demo recorder: walks the new Devpost-style UI and saves output-new.mp4
// Run: node record-demo.mjs   (requires `docker compose up -d` already running)
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function scrollTo(page, selector) {
  await page.locator(selector).first().scrollIntoViewIfNeeded();
  await sleep(2200);
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: 'demo-video-tmp', size: { width: 1280, height: 720 } },
});
const page = await context.newPage();

// 1. Landing hero (light)
await page.goto(BASE, { waitUntil: 'networkidle' });
await sleep(3000);

// 2. Tour the sections
for (const sel of ['#formats', '#platforms', '#guides', '#faq']) {
  await scrollTo(page, sel);
}

// 3. Back to top, flip to dark mode
await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
await sleep(1800);
await page.getByRole('button', { name: /switch to (light|dark) mode/i }).first().click();
await sleep(2500);
await scrollTo(page, '#formats');

// 4. Back to light, visit gallery + events
await page.getByRole('button', { name: /switch to (light|dark) mode/i }).first().click();
await sleep(1200);
await page.goto(`${BASE}/projects`, { waitUntil: 'networkidle' });
await sleep(3500);
await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'smooth' }));
await sleep(2000);
await page.goto(`${BASE}/events`, { waitUntil: 'networkidle' });
await sleep(3000);

await context.close();
await browser.close();

// Move the recorded file to output-new.mp4
import { readdirSync, renameSync, rmSync } from 'fs';
const files = readdirSync('demo-video-tmp').filter((f) => f.endsWith('.webm'));
if (!files.length) throw new Error('no video recorded');
renameSync(`demo-video-tmp/${files[0]}`, 'output-new.webm');
rmSync('demo-video-tmp', { recursive: true, force: true });
console.log('saved output-new.webm');
