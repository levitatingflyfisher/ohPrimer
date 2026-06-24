# Visual tests

ohPrimer ships hand-written HTML with no UI-logic tests, so the things most
worth guarding are **how each page looks and lays out** — across breakpoints
and when a reader enlarges text. Both tests here are part of the [visual-loop]
Playwright pillar, are self-contained (each serves the repo root from an
in-process static server — no `npm run dev`), import no project source, and
have no effect on the site or the `rebuild/` harness.

They live alongside `npm test` (the `rebuild/` unit tests) but are run on
demand rather than from it, because they need a browser.

## `screenshots.mjs` — responsive screenshot sweep

Renders every shipped page at mobile / tablet / desktop, writes one PNG per
(page × size), and stitches a per-page contact-sheet montage so you read **one
image** and judge responsiveness at a glance.

```bash
node tests/visual/screenshots.mjs
# open the montages under /tmp/ohprimer-visual/<page>/montage.png
```

Env: `OHPRIMER_OUT_DIR` (output dir), `OHPRIMER_FULL_PAGE=1` (full scrollable page).
Pages: `index.html` and `404.html` (tracked), plus the gitignored local-only
prototypes `speed-reader.html` / `openHearthPrimerv0*.html` — those are marked
optional and **auto-skipped when absent** (e.g. a fresh clone), so both tests
stay green on CI while still covering the prototypes on a dev machine.

## `reflow.mjs` — large-text / reflow overflow check

The portfolio's Flutter apps get an accessibility sweep at large text scale
(e.g. textScale 3.0 on a 320dp screen) to catch content that clips or runs off
the edge. This is the web equivalent: it **fails (exit 1)** if any page clips
content when a reader zooms in.

```bash
node tests/visual/reflow.mjs              # sweep; exit 1 on a WCAG-band clip
node tests/visual/reflow.mjs --self-test  # prove the detector works, then exit
node tests/visual/reflow.mjs --shots      # also write per-page screenshots
```

Env: `OHPRIMER_OUT_DIR` (default `/tmp/ohprimer-reflow`; writes `report.json`).

### Why a narrow viewport *is* the large-text test

Every ohPrimer page sizes fonts in **`px`**, so the only way a real user
enlarges text is **page zoom** (Ctrl+ / pinch). Page zoom is, by construction,
equivalent to a **narrower effective viewport**: at 200% zoom each CSS px of
content maps to 2 device px, so a 375px phone renders the same layout as a
187px viewport at 100%. So the test sweeps a set of **effective widths**, each
labelled with the (device, zoom) it emulates:

| Effective width | Emulates | Band |
|---|---|---|
| 375 / 320 px | phone / small phone @100% | WCAG — 320 is the **1.4.10 Reflow** target |
| 187 / 160 px | 375 / 320 px **@200% zoom** | WCAG — **1.4.4 Resize-text** |
| 125 / 107 px | 375 / 320 px **@300% zoom** | stress (≈ Flutter textScale 3.0), beyond WCAG |

The test **gates only on the WCAG band (≥160px)**. Stress-band findings are
reported for awareness but never fail the build — they're beyond what WCAG
requires and their fixes tend to carry layout/tap-target trade-offs.

> **Load-bearing assumption:** the narrow-viewport ≡ zoom equivalence holds
> *only because* fonts are px. If a `rem`/`em` font-size is ever introduced,
> text would also grow with the browser's default-font setting — a text-only-zoom
> axis this sweep does not model. `reflow.mjs` scans for that and **warns**, so a
> maintainer is forced to add the axis rather than silently under-test.

### How it detects overflow

`index.html` and `speed-reader.html` set `overflow-x:hidden`, so when content
is too wide the page does **not** grow a scrollbar — it **clips silently**.
That makes `document.scrollWidth` useless as a signal. Instead the detector
walks every visible element (`getBoundingClientRect` keeps an element's true
geometry even when an ancestor clips it) and classifies each:

- **geometry** — box is *partially* clipped at a viewport edge → the real
  signal; **gated** in the WCAG band.
- **offcanvas** — box is *entirely* outside the viewport → an intentional
  slide-in drawer / hidden panel, **not** a bug (distinguishing this is what
  stops drawers from reading as overflow at every width). A *focusable* control
  parked off-canvas is warned about — that's lost UI, not a panel.
- **content** — element's own content is wider than its box and it's not a
  scroll container → softer signal (often an intentional RSVP word display);
  reported, not gated.

A `--self-test` proves the detector catches a synthetic 9999px overflow, stays
silent on clean fluid markup, and tags an off-canvas drawer correctly — so a
clean run on the real pages actually means something. The runner also fails
loudly if a page doesn't load (a non-loading page must not pass as "clean").

### `index.html` and `.screen` switching

`index.html` shows one `.screen` at a time (`display:none` on the rest), so the
sweep injects `.screen{display:flex !important}` to lay out the home, library,
and reader screens together — horizontal overflow is independent of the
vertical stacking that causes.

### Known gaps / next coverage

The sweep measures each page's **default load state**. A harness self-audit
flagged these as the highest-value additions (not yet implemented):

- Seed realistic library data (long book titles / authors / chapter names) — the
  empty-state placeholder is all that renders today, so the `ellipsis` CSS on
  cards is unverified.
- Measure **open** modals and drawers (`.modal-backdrop.open`, `.toc-drawer.open`,
  `.page-panel.open` — the 340/420px panels are only ever measured closed).
- Load a real document so long unbreakable words in the RSVP / Scroll readers are
  exercised at WCAG widths, not just the placeholder sample.
- An RTL (`dir="rtl"`) pass for mirrored-edge overflow.

## Prereqs

- **Playwright + Chromium** — a local `npm i -D playwright` + `npx playwright
  install chromium`, or the shared `~/.cache/oh-visual-loop` harness. Resolved
  by `_harness.mjs` (shared by both tests).
- **ImageMagick** (`magick`) for the montages (optional; per-size PNGs are still
  written without it).

[visual-loop]: ../../../iss-skills/skills/visual-loop
