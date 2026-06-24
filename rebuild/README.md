# Rebuild (work in progress)

Modular source for the OpenHearth Primer, alongside a build step that re-emits the
**single-file** `index.html` the project ships. This exists so the app can be developed as
small, reviewable modules instead of one 6900-line file, **without** losing the
"send-someone-a-URL, one HTML file" superpower.

> **`../index.html` is still canonical.** It is the live app and it is where the fixed Critical
> bugs landed. This directory is the parallel rebuild track; it does not replace `index.html`
> until the port is complete and behavior is verified. Nothing here is wired into deployment yet.

## How the build works

`build.mjs` concatenates the CSS and JS fragments listed in `manifest.json`, in order, into
`dist/index.html`. It's deliberately concatenation, not bundling: the app is one global script
with no inter-module imports, so **ordering is the only contract**. Zero dependencies.

```bash
node rebuild/build.mjs        # or: npm run build:rebuild
# → writes rebuild/dist/index.html
```

## Porting method (the important part)

1. **Spec is the rubric, ISSUES is the regression list.** Port one module at a time from
   `../index.html` into `src/`, against the matching section of `../SPEC.md`. Each fix you make
   while porting should retire a row in `../ISSUES.md` (cite it in the commit).
2. **Preserve the embedded scar tissue.** The hard-won behavior (iOS storage handling, CORS
   proxy fallback, charset sniffing, cross-page paragraph carry, consent gates) lives only in the
   code. Port behavior, don't reinvent from the PRD — that's how a clean-room rewrite silently
   loses a hundred fixes.
3. **Diff, don't trust.** After porting a module, build and compare against the live app's
   behavior for that surface before deleting the original section.

## Suggested module order

Driven by risk and dependency, not by file order:

| Order | Module | SPEC | Issues to retire while porting |
|---|---|---|---|
| 1 | `05-privacy.js` | PRIVACY.md | (already implemented in index.html — port as-is) |
| 2 | `00-state.js` | §1 | H2, H3, M1, M5, L1, L2 (atomic migration, error surfacing) |
| 3 | `10-tokenizer.js` + `15-parsers.js` | §2 | H1, H6, H7, H8, M7, M8 (TOC anchors, gutter strip, memory) |
| 4 | `20-reader.js` | §3 | (seekTo already fixed C7/C8; port + add H9 speak-seek fix) |
| 5 | `30-ui.js` | §4 | H12, H14, M14, M15 (focus trap, profile bleed, orphan eviction) |
| 6 | `40-content.js` | §5 | H15, H16, M19–M23 (SSRF allowlist, integrity, timeouts) |
| 7 | `50-learning.js` | §6 | L15–L20 (relearning steps, calendar-day scheduling) |
| 8 | `60-ai.js` | §7 | M24, M26 (pipeline disposal, abort on navigation) |
| 9 | styles + `90-init.js` | §8 | H20–H22 (SW versioning/offline), L25/L26/L31 (a11y) |

## Current state

Ported and under test (assembly order):
- `src/styles/00-tokens.css` — design tokens (verbatim).
- `src/scripts/00-utils.js` — pure utilities (byte/hex, `esc`, `isLocalEndpoint`,
  `assertSafeFetchUrl`, `sanitizeImported`, `decodeResponseBytes`, `resolveHref`,
  `findZipImage`, `pinDigest`). Verified by `test/logic.test.mjs`.
- `src/scripts/05-state.js` — localStorage profile/prefs store (`getState`, `activeProfile`,
  `saveStore`, `persist`, `bookId`, `defaultPrefs`, `genPid`). Verified by `test/state.test.mjs`
  (defaults, merge/sanitize, M5 failure surfacing). Calls `showToast` (UI) on failure.
- `src/scripts/06-privacy.js` — `confirmEgress` sticky egress consent. Verified by
  `test/privacy.test.mjs` (pre-granted, accept+record, sticky, decline). Calls `confirmAction` (UI).
- `src/scripts/15-tokenizer.js` — `tokenizeDocument` (blocks → words/originals/pacing/segments/
  chapters/blockStartWordIdx) + helpers. Pure. Verified by `test/tokenizer.test.mjs` (text/chapter/
  segment/URL/long-token/hyphen/punctuation), including an M8 regression marker for space-less CJK.
- `src/scripts/20-parsers.js` — **partial**: `parseTextFile` (text → `{blocks}`) ported and pure;
  EPUB/PDF parsers still in index.html (DOMParser/pdf.js, carry deferred H1/H8). Verified by
  `test/parsers.test.mjs` (paragraphs, chapter, M9 divider, code/table segments, parse→tokenize pipeline).
- `src/scripts/40-comms.js` — networking/fetch layer (CORS proxies, `fetchWithProxies`,
  `fetchFeedConditional`, `fetchBinaryWithProxies`, proxy-consent gating, size caps). Verified
  by `test/comms.test.mjs` (SSRF blocking, consent gating, caps).
- `src/scripts/50-learning.js` — **partial**: `sm2` (SM-2 scheduler) + `computeReviewStats`
  (retention/streak) ported and pure; the review UI stays in index.html. Verified by
  `test/learning.test.mjs` (interval ladder, EF floor, lapse reset, retention %, day streak).

`utils → state → privacy → comms` now form a consistent slice: the only deps still pointing at
unported code are the UI helpers `showToast` and `confirmAction` (from `35-ui`, next).
`node rebuild/build.mjs` assembles them into `dist/index.html` — still intentionally incomplete,
so **`../index.html` remains the canonical, runnable app** until the port reaches parity.

## Tests

`npm test` runs the suites in `test/`. They load the **real module source** under lightweight
stubs (node 22's WebCrypto/URL/TextDecoder — no browser needed) and assert behavior, so a
port that drifts from index.html's semantics fails fast. Each newly ported module should land
with its own `test/<module>.test.mjs`. Browser-only behavior is tracked in
`test/MANUAL-CHECKLIST.md`.

### Porting recipe (followed for utils + comms)
1. Extract the functions verbatim from `../index.html` into `src/scripts/<n>-<name>.js`
   (brace-matched, not retyped — see the extractor approach in git history).
2. Add the file to `manifest.json` `scripts` (in dependency order) and drop it from the TODO.
3. Write `test/<name>.test.mjs` loading the module under stubs; assert the issues it should
   preserve/retire (cite IDs). Run `npm test` green.
4. Only delete the original span from `index.html` at cutover, once the dependency graph
   above it is also ported and the assembled `dist` runs.
