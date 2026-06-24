// Visual coverage — responsive screenshot sweep for ohPrimer.
//
// First layer of VISUAL test coverage (visual-loop, Pillar A / Playwright).
// ohPrimer ships hand-written static HTML pages with no UI logic tests; the
// thing most worth verifying is that each page LAYS OUT correctly across
// breakpoints. This script renders every shipped page at mobile / tablet /
// desktop, writes one PNG per (page x size), and stitches a per-page
// contact-sheet montage so a human (or agent) can read ONE image and judge
// responsiveness at a glance.
//
// Self-contained: it serves the repo root from an in-process static server
// (no `npm run dev` needed), imports no project source, and has no effect on
// the site or the rebuild/ harness.
//
// Prereqs:
//   - `playwright` + chromium available (local devDependency OR the shared
//     visual-loop harness in ~/.cache/oh-visual-loop, or `npx playwright install chromium`).
//   - ImageMagick (`magick`) on PATH for the montage (optional — per-size PNGs
//     are still written without it).
//
// Usage:   node tests/visual/screenshots.mjs
//   Env overrides:
//     OHPRIMER_OUT_DIR    output dir for PNGs     (default /tmp/ohprimer-visual)
//     OHPRIMER_FULL_PAGE  "1" for full scrollable page instead of viewport

import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { loadChromium, startStaticServer } from './_harness.mjs';

const OUT = process.env.OHPRIMER_OUT_DIR || '/tmp/ohprimer-visual';
const FULL = process.env.OHPRIMER_FULL_PAGE === '1';

const SIZES = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
];

// Pages to shoot. The v0 prototypes + speed-reader are gitignored "legacy,
// kept local for reference" files (see .gitignore), so they're marked optional
// and skipped when absent (e.g. a fresh clone / CI) rather than failing.
const PAGES = [
  { name: 'home', path: '/index.html' },
  { name: 'speed-reader', path: '/speed-reader.html', optional: true },
  { name: 'primer-v0', path: '/openHearthPrimerv0.html', optional: true },
  { name: 'primer-v0-ohstyle', path: '/openHearthPrimerv0-ohStyle.html', optional: true },
  { name: '404', path: '/404.html' },
];

// Repo root = two levels up from this file (tests/visual/).
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const { base: BASE, close: closeServer } = await startStaticServer(ROOT);

const chromium = await loadChromium();
const browser = await chromium.launch();
let failures = 0;

for (const pg of PAGES) {
  // Skip optional pages (gitignored prototypes) when not present in this checkout.
  const status = await fetch(`${BASE}${pg.path}`).then((r) => r.status).catch(() => 0);
  if (status === 404 && pg.optional) {
    console.log(`skip ${pg.name} (optional page not present in this checkout)`);
    continue;
  }
  const dir = `${OUT}/${pg.name}`;
  mkdirSync(dir, { recursive: true });
  const shots = [];
  for (const vp of SIZES) {
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
    });
    const url = `${BASE}${pg.path}`;
    const resp = await page
      .goto(url, { waitUntil: 'networkidle', timeout: 30000 })
      .catch((e) => {
        console.error(`  ! navigation failed: ${url} (${e.message})`);
        return null;
      });
    if (!resp || !resp.ok()) {
      failures++;
      console.error(`  ! ${url} -> ${resp ? resp.status() : 'no response'}`);
    }
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let y = 0;
        const step = () => {
          window.scrollBy(0, window.innerHeight);
          y += window.innerHeight;
          if (y < document.body.scrollHeight) setTimeout(step, 50);
          else resolve();
        };
        step();
      });
    });
    await page.waitForTimeout(400);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    const out = `${dir}/shot-${vp.name}.png`;
    await page.screenshot({ path: out, fullPage: FULL });
    shots.push(out);
    console.log(`captured ${pg.name} ${vp.name} (${vp.width}x${vp.height}) full=${FULL} -> ${out}`);
    await page.close();
  }
  const montage = `${dir}/montage.png`;
  try {
    execFileSync('magick', ['montage', ...shots, '-tile', `${shots.length}x1`,
      '-geometry', '360x+8+8', '-background', '#dddddd', '-bordercolor', '#888',
      '-border', '1', '-label', '%f', '-gravity', 'North', '-pointsize', '12', montage],
      { stdio: 'inherit' });
    console.log(`montage -> ${montage}   (Read this image)`);
  } catch {
    console.log(`(montage skipped — install ImageMagick; per-size PNGs are in ${dir}/)`);
  }
}

await browser.close();
closeServer();

if (failures > 0) {
  console.error(`\n${failures} page(s) failed to load — see errors above.`);
  process.exit(1);
}
console.log(`\nDone. Output under ${OUT}/<page>/ — read each montage.png.`);
