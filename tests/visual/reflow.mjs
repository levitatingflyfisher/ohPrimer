// Large-text / reflow overflow check for ohPrimer's pages.
//
// WHAT IT GUARDS
// The Flutter apps in this portfolio get an accessibility sweep at large text
// scale (e.g. textScale 3.0 on a 320dp screen) to catch content that clips or
// runs off the edge. This is the web equivalent.
//
// WHY NARROW VIEWPORTS == "LARGE TEXT"
// Every ohPrimer page sizes fonts in `px`, so bumping the browser's default
// font-size does nothing — the only lever a real user has is PAGE ZOOM (Ctrl+
// / pinch). And page zoom is, by construction, equivalent to a narrower
// viewport: at 200% zoom each CSS px of content maps to 2 device px, so a
// 375px phone shows the same layout as a 187px viewport at 100%. So we sweep a
// set of EFFECTIVE widths — each labelled with the (device, zoom) it emulates —
// and that single, cleanly-measurable axis covers both WCAG 1.4.10 Reflow
// (320 CSS px) and 1.4.4 Resize-text (200%), plus a deeper stress band that
// mirrors the Flutter textScale-3.0 sweep.
//
// WHY WE WALK ELEMENTS INSTEAD OF READING scrollWidth
// index.html and speed-reader.html set `overflow-x:hidden` on <html>/<body>,
// so when content is too wide the page does NOT grow a scrollbar — it silently
// CLIPS. That makes document.scrollWidth useless as a signal. Instead we walk
// every visible element and flag any whose box extends past the viewport edge
// (getBoundingClientRect keeps an element's true geometry even when an ancestor
// clips it) — that catches the clipped content the page-level metric hides.
//
// Usage:
//   node tests/visual/reflow.mjs              # sweep real pages, exit 1 on a
//                                             #   WCAG-band geometry overflow
//   node tests/visual/reflow.mjs --self-test  # prove the detector works, exit
//   node tests/visual/reflow.mjs --shots      # also write per-page screenshots
//
//   Env: OHPRIMER_OUT_DIR (default /tmp/ohprimer-reflow)

import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { loadChromium, startStaticServer } from './_harness.mjs';

const OUT = process.env.OHPRIMER_OUT_DIR || '/tmp/ohprimer-reflow';
const SELF_TEST = process.argv.includes('--self-test');
const SHOTS = process.argv.includes('--shots');
const TOL = 1.5; // px — absorb sub-pixel rounding / anti-aliasing

// Effective CSS widths. `wcag` flags the widths a real layout must survive
// (320px reflow + 200% zoom on phones); the narrower ones are a robustness
// stress band (≈ Flutter textScale 3.0) reported but not gated on.
const WIDTHS = [
  { w: 375, label: 'phone 375 @100%', wcag: true },
  { w: 320, label: 'small phone 320 @100% — WCAG 1.4.10 reflow', wcag: true },
  { w: 187, label: 'phone 375 @200% zoom — WCAG 1.4.4 resize-text', wcag: true },
  { w: 160, label: 'small phone 320 @200% zoom', wcag: true },
  { w: 125, label: 'phone 375 @300% zoom — ≈ Flutter ts3.0 (stress)', wcag: false },
  { w: 107, label: 'small phone 320 @300% zoom — ≈ Flutter ts3.0 (stress)', wcag: false },
];

// 404.html is a 0-second meta-refresh to "/" with no layout of its own, so it
// would just re-measure index — omit it. index.html is the shipped app; the
// v0 prototypes + speed-reader are gitignored "legacy, kept local" files (see
// .gitignore), so they're `optional` and skipped when absent (fresh clone / CI)
// rather than failing the run.
const PAGES = [
  { name: 'home', path: '/index.html', allScreens: true },
  { name: 'speed-reader', path: '/speed-reader.html', optional: true },
  { name: 'primer-v0', path: '/openHearthPrimerv0.html', optional: true },
  { name: 'primer-v0-ohstyle', path: '/openHearthPrimerv0-ohStyle.html', optional: true },
];

// Runs IN the page. Returns every visible element that overflows, deduped so a
// too-wide container is reported instead of all its children.
//   - geometry:  the box is PARTIALLY clipped — it sits within the viewport but
//     spills past an edge (real content the user loses, even under
//     overflow-x:hidden). This is what we gate on.
//   - offcanvas: the box is ENTIRELY outside the viewport (parked off the left
//     or right edge). That is the signature of an intentional slide-in drawer /
//     hidden panel, not clipped content, so we record it separately and never
//     gate on it. (Distinguishing this is what stops off-canvas drawers from
//     reading as false-positive overflow at EVERY width.)
//   - content:   the element's own content is wider than its box and it is NOT
//     a scroll container, so the excess is clipped. Softer signal (often an
//     intentional RSVP word display) — reported, not gated.
const DETECT = (tol) => {
  const W = Math.min(document.documentElement.clientWidth, window.innerWidth);
  const sel = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += `#${el.id}`;
    const c = (el.className && el.className.toString) ? el.className.toString().trim() : '';
    if (c) s += `.${c.split(/\s+/)[0]}`;
    return s;
  };
  const raw = [];
  for (const el of document.body.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const straddleR = (r.right - W) > tol && r.left < (W - tol);
    const straddleL = (-r.left) > tol && r.right > tol;
    const offCanvas = r.left >= (W - tol) || r.right <= tol;
    const scroller = cs.overflowX === 'auto' || cs.overflowX === 'scroll';
    const content = !scroller && (el.scrollWidth - el.clientWidth) > tol;
    let kind = null;
    if (straddleR || straddleL) kind = 'geometry';
    else if (offCanvas) kind = 'offcanvas';
    else if (content) kind = 'content';
    if (!kind) continue;
    raw.push({
      el, kind, selector: sel(el),
      // A focusable control parked off-canvas is lost UI, not an intentional
      // slide-in panel — flagged so it can be warned about separately.
      focusable: /^(?:a|button|input|select|textarea)$/.test(el.tagName.toLowerCase())
        || (el.hasAttribute('tabindex') && el.tabIndex >= 0),
      left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width),
      scrollW: el.scrollWidth, clientW: el.clientWidth,
      overflowX: cs.overflowX, whiteSpace: cs.whiteSpace,
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48),
    });
  }
  // Within each kind, keep the outermost offender and drop its descendants — a
  // too-wide container explains its children, an off-canvas panel explains its
  // contents.
  const kept = raw.filter((o) =>
    !raw.some((a) => a.kind === o.kind && a.el !== o.el && a.el.contains(o.el)));
  return {
    viewport: W,
    pageScrollW: document.documentElement.scrollWidth,
    offenders: kept.map(({ el, ...rest }) => rest),
  };
};

// LOAD-BEARING ASSUMPTION GUARD. The "narrow effective viewport == page zoom"
// equivalence this whole test rests on holds because the pages size fonts in
// px (so the only way a user enlarges text is page zoom). If a future edit
// introduces a rem/em font-size, text would ALSO grow with the user's default
// font setting — a text-only-zoom axis this sweep does not model — and a real
// overflow could slip through. So scan same-origin rules and warn if any
// font-size uses rem/em, forcing a maintainer to add that axis. Runs in-page.
const SCAN_REM_EM_FONTS = () => {
  const hits = [];
  const walk = (rules) => {
    for (const r of rules || []) {
      if (r.cssRules) walk(r.cssRules); // @media / @supports etc.
      const t = r.style && r.style.fontSize;
      if (t && /\d\s*r?em\b/i.test(t)) hits.push(`${r.selectorText || '@'} { font-size:${t} }`);
    }
  };
  for (const ss of document.styleSheets) {
    try { walk(ss.cssRules); } catch { /* cross-origin (e.g. google fonts) — skip */ }
  }
  return hits;
};

// ── Self-test: the detector must catch a real overflow and stay silent on
// clean fluid markup. This is the "watch it fail" gate — if it can't flag a
// 9999px div, a clean run on the real pages would prove nothing.
async function selfTest(browser) {
  const page = await browser.newPage({ viewport: { width: 320, height: 600 }, deviceScaleFactor: 1 });
  let ok = true;

  await page.setContent('<body style="margin:0"><div style="width:9999px;height:20px">x</div></body>');
  const bad = await page.evaluate(DETECT, TOL);
  const caught = bad.offenders.some((o) => o.kind === 'geometry' && o.right > 9000);
  console.log(`  [self-test] overflowing 9999px div  -> ${caught ? 'FLAGGED ✓' : 'MISSED ✗'}`);
  ok &&= caught;

  await page.setContent('<body style="margin:0"><div style="max-width:100%;height:20px">ok</div>' +
    '<p style="margin:0">a normal paragraph that wraps fine</p></body>');
  const good = await page.evaluate(DETECT, TOL);
  const clean = good.offenders.filter((o) => o.kind !== 'offcanvas').length === 0;
  console.log(`  [self-test] clean fluid page         -> ${clean ? 'SILENT ✓' : `FALSE-POSITIVE ✗ (${JSON.stringify(good.offenders)})`}`);
  ok &&= clean;

  // An off-canvas drawer (parked entirely off the right edge) is intentional —
  // it must NOT read as a geometry overflow, only as 'offcanvas'.
  await page.setContent('<body style="margin:0;overflow-x:hidden">' +
    '<aside style="position:fixed;top:0;left:100%;width:280px;height:50px">drawer</aside>' +
    '<div style="max-width:100%">visible</div></body>');
  const drawer = await page.evaluate(DETECT, TOL);
  const noGeom = !drawer.offenders.some((o) => o.kind === 'geometry');
  const sawOff = drawer.offenders.some((o) => o.kind === 'offcanvas');
  console.log(`  [self-test] off-canvas drawer        -> ${noGeom && sawOff ? 'NOT a bug, tagged offcanvas ✓' : 'MISCLASSIFIED ✗'}`);
  ok &&= noGeom && sawOff;

  await page.close();
  return ok;
}

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const { base: BASE, close: closeServer } = await startStaticServer(ROOT);
const chromium = await loadChromium();
const browser = await chromium.launch();

if (SELF_TEST) {
  const ok = await selfTest(browser);
  await browser.close();
  closeServer();
  console.log(ok ? '\nself-test PASSED' : '\nself-test FAILED');
  process.exit(ok ? 0 : 1);
}

mkdirSync(OUT, { recursive: true });
const report = [];
let hardFails = 0;
let navFailures = 0;
const focusableOffWarns = []; // focusable control parked off-canvas at a WCAG width
const remEmWarns = []; // pages whose font-sizes use rem/em (assumption tripwire)

for (const pg of PAGES) {
  // Skip optional pages (gitignored prototypes) when not present in this checkout.
  const preflight = await fetch(`${BASE}${pg.path}`).then((r) => r.status).catch(() => 0);
  if (preflight === 404 && pg.optional) {
    console.log(`${pg.name.padEnd(18)}  —  skipped (optional page not present in this checkout)`);
    continue;
  }
  let scannedFonts = false;
  for (const { w, label, wcag } of WIDTHS) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
    // Don't swallow navigation failures — a page that never loaded would
    // otherwise measure as "clean" and masquerade as passing.
    let navErr = null;
    const resp = await page.goto(`${BASE}${pg.path}`, { waitUntil: 'networkidle', timeout: 30000 })
      .catch((e) => { navErr = e.message; return null; });
    if (navErr || !resp || !resp.ok()) {
      navFailures++;
      console.error(`${pg.name.padEnd(18)} ${String(w).padStart(4)}px  NAV-FAIL  ` +
        `${navErr || (resp ? `HTTP ${resp.status()}` : 'no response')}`);
      await page.close();
      continue;
    }
    // index.html only renders the active .screen; force every screen visible so
    // the reader/library screens get measured too (horizontal overflow is
    // independent of the vertical stacking this causes).
    if (pg.allScreens) {
      await page.addStyleTag({ content: '.screen{display:flex !important}' });
    }
    await page.waitForTimeout(150);

    if (!scannedFonts) {
      scannedFonts = true;
      const hits = await page.evaluate(SCAN_REM_EM_FONTS);
      if (hits.length) remEmWarns.push({ page: pg.name, hits });
    }

    const res = await page.evaluate(DETECT, TOL);
    const geom = res.offenders.filter((o) => o.kind === 'geometry');
    const content = res.offenders.filter((o) => o.kind === 'content');
    const offcanvas = res.offenders.filter((o) => o.kind === 'offcanvas');
    if (wcag && geom.length) hardFails += geom.length;
    if (wcag) {
      for (const o of offcanvas.filter((x) => x.focusable)) {
        focusableOffWarns.push({ page: pg.name, width: w, selector: o.selector, text: o.text });
      }
    }
    report.push({ page: pg.name, width: w, label, wcag, ...res,
      geomCount: geom.length, contentCount: content.length, offcanvasCount: offcanvas.length });

    const tag = geom.length ? (wcag ? 'FAIL' : 'stress') : 'ok';
    console.log(`${pg.name.padEnd(18)} ${String(w).padStart(4)}px  ${tag.padEnd(6)} ` +
      `geom=${geom.length} content=${content.length} offcanvas=${offcanvas.length}  (${label})`);
    for (const o of geom) {
      console.log(`     ⤷ ${o.selector}  right=${o.right}>vw${res.viewport}  w=${o.width}  "${o.text}"`);
    }

    if (SHOTS && (w === 320 || w === 160)) {
      const dir = `${OUT}/${pg.name}`;
      mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: `${dir}/w${w}.png`, fullPage: true });
    }
    await page.close();
  }
}

await browser.close();
closeServer();

writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));

// Montage the worst-case shots per page so they can be read at a glance.
if (SHOTS) {
  for (const pg of PAGES) {
    const dir = `${OUT}/${pg.name}`;
    try {
      execFileSync('magick', ['montage', `${dir}/w320.png`, `${dir}/w160.png`,
        '-tile', '2x1', '-geometry', '300x+8+8', '-background', '#ddd',
        '-bordercolor', '#888', '-border', '1', '-label', '%f', '-gravity', 'North',
        '-pointsize', '12', `${dir}/montage.png`], { stdio: 'ignore' });
    } catch { /* magick optional */ }
  }
}

console.log(`\nReport: ${OUT}/report.json`);

if (remEmWarns.length) {
  console.warn('\n⚠ rem/em font-size detected — the narrow-viewport==zoom assumption no longer fully holds; ' +
    'add a text-only-zoom axis (see header comment):');
  for (const r of remEmWarns) console.warn(`   ${r.page}: ${r.hits.slice(0, 3).join('  |  ')}`);
}
if (focusableOffWarns.length) {
  console.warn('\n⚠ focusable controls parked off-canvas at WCAG widths (unreachable UI, not an intentional panel):');
  for (const f of focusableOffWarns) console.warn(`   ${f.page} @${f.width}px: ${f.selector} "${f.text}"`);
}

if (hardFails > 0) {
  console.error(`\n${hardFails} geometry overflow(s) at WCAG-band widths (>=160px effective). ` +
    `These clip content at 200% zoom / 320px and must be fixed.`);
}
if (navFailures > 0) {
  console.error(`\n${navFailures} page load(s) failed — those pages were NOT measured (a non-loading page must not pass silently).`);
}
if (hardFails > 0 || navFailures > 0) process.exit(1);

console.log('\nNo geometry overflow at WCAG-band widths. (Narrower "stress" widths, if any above, are beyond WCAG and informational.)');
