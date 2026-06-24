# The OpenHearth Primer — v0.1 Reader Robustness Spec
*Supplement to openHearthPrimerPRD.md · 2026-04-14*

---

## 1. Context

v0 ships a working RSVP + parafoveal reader with profiles, persistence, and stats. Real-world use (opening an actual EPUB in a bright room) surfaced four issues that make it unusable for daily reading:

1. Long tokens overflow the reading frame, pushing the word sideways and breaking ORP alignment.
2. No explicit light-mode toggle — ohStyle version respects OS preference only, Diamond Age version is dark-only.
3. EPUB parser dumps raw markup, embedded CSS, and script content into the word stream.
4. Non-linear content (tables, code blocks, equations, ASCII art) is mangled into meaningless word sequences.

v0.1 is the "make real books readable" release. It precedes Phase 1 content-pipeline work (queue, Gutenberg, Yoto) so that everything built on top of the reader stands on solid ground.

**Not in scope for v0.1:** reading queue, Gutenberg integration, Yoto, spaced repetition, AI features. Those remain Phase 1+.

---

## 2. Goals

- Open any reasonable EPUB or .txt file and read it end-to-end without encountering layout breakage or markup pollution.
- Respect the reader's environment: explicit light/dark toggle that persists per profile.
- Gracefully degrade on content that RSVP cannot meaningfully present, without corrupting the reading experience around it.

## 3. Non-Goals

- Pixel-perfect typography for every EPUB edge case (malformed EPUBs, DRM, obscure namespaces).
- Rendering math, diagrams, or images. We extract text only.
- Preserving author formatting (italics, bold, footnotes) in the RSVP stream. v0.1 treats text as plain prose; formatting fidelity is a later concern.
- Building a proper reflowable scroll reader. Scroll Mode is Phase 1 per the PRD; v0.1 ships a *stub* (see §4.4).

---

## 4. Requirements

### 4.1 Long-Token Handling

**Problem.** Words exceeding ~12 characters (German compounds, URLs, hyphenated phrases, chemical names, "antidisestablishmentarianism") overflow the 700px display frame. In classic mode, the `min-width` on the "before" span keeps ORP centered but lets "after" extend off the right edge. In parafoveal mode, a long center word squeezes or occludes neighbors, and long neighbor words distort the Gaussian spacing.

**Requirements.**

- **R-LT-1** Classic mode MUST keep the entire token visible within the display frame at all font sizes. When the token would exceed the frame, font size scales down proportionally until it fits (with a floor equal to the smallest size button, currently 28px).
- **R-LT-2** Parafoveal mode MUST keep at least ±2 neighbors visible when the center token is long. Same scaling rule as classic. Neighbor tokens exceeding available horizontal budget are truncated with a trailing ellipsis (visual only; underlying token unchanged).
- **R-LT-3** Tokenizer MUST split hyphenated compounds at hyphen boundaries (`"mother-in-law"` → 3 tokens) so each piece reads naturally. Em-dashes and en-dashes are NOT split.
- **R-LT-4** Tokenizer MUST abbreviate long URLs for display (`https://example.com/a/b/c/d/file.html` → `example.com/…/file.html`) while preserving the original in the underlying word list. Pacing uses the abbreviated form's length.
- **R-LT-5** Very long tokens (>30 chars, e.g., base64 fragments) MUST be skipped with a visible "…" placeholder at a 1x delay. Skipped tokens are counted in a session-level "difficult words" tally.

**Acceptance.** Open an EPUB of *War and Peace* (Russian name transliterations), Heidegger's *Being and Time* (German compounds), and any technical blog (URLs and code snippets inline). No token overflows the frame. No layout shift. ORP stays centered at all times.

---

### 4.2 Light / Dark Theme

**Problem.** ohStyle port uses `prefers-color-scheme` which ignores the reader's actual environment (OS dark + sunny porch = unreadable). Diamond Age version has no light mode at all.

**Requirements.**

- **R-TH-1** Settings panel MUST offer three theme choices: **Light**, **Dark**, **Auto** (follows OS). Default is Auto.
- **R-TH-2** Theme preference MUST persist per profile (Dad reads in dark, daughter reads in light, no collision).
- **R-TH-3** Theme toggle MUST be accessible from the reader screen, not buried in settings. Proposed: small sun/moon icon in `reader-top` next to the "who" label.
- **R-TH-4** Both Diamond Age and ohStyle versions MUST support both modes. Diamond Age light mode uses a parchment palette (cream bg, warm brown ink, copper accents preserved). ohStyle already has both.
- **R-TH-5** Theme switch MUST NOT flash during transition. Pre-render colors before first paint via `localStorage` bootstrap script in `<head>`.

**Acceptance.** On a phone with OS set to dark, open Primer on a sunny porch, tap the sun icon, theme flips to light and persists on next open. Switch profiles — each profile's preferred theme restores. No white flash on page load.

---

### 4.3 EPUB Parsing

**Problem.** Current parser does `div.innerHTML = xhtml_text; return div.textContent`. This works for clean prose but fails on real EPUBs where spine items contain:
- `<style>` blocks (CSS source ends up as words)
- `<script>` blocks (rare in EPUB but legal — JS source as words)
- Embedded SVG / MathML / image captions
- Footnote markers, page numbers, navigation links ("Next chapter →" inline)
- Author-defined `<div class="drop-cap">` with nested spans the naive parser concatenates without spaces

**Requirements.**

- **R-EP-1** Parser MUST use `DOMParser` with `"application/xhtml+xml"` (fallback to `"text/html"` on parse error), not `innerHTML`.
- **R-EP-2** Parser MUST remove the following nodes before text extraction: `<head>`, `<style>`, `<script>`, `<link>`, `<meta>`, `<svg>`, `<img>`, `<nav epub:type="toc">`, `<nav epub:type="landmarks">`, elements with `role="doc-footnote"` / `role="doc-pagebreak"`, elements with `epub:type` matching `footnote|noteref|pagebreak`.
- **R-EP-3** Parser MUST walk the remaining DOM and emit text with explicit block-level boundaries: `<p>`, `<h1>`–`<h6>`, `<li>`, `<blockquote>`, `<br>`, `<div>` (when it has block-level display semantics), `<pre>`, `<figure>`. Boundary marker = single `\n\n` in the output text, which the existing pacing logic can treat as a paragraph pause.
- **R-EP-4** Parser MUST preserve reading order across spine items exactly as declared in the OPF spine.
- **R-EP-5** Parser MUST extract and display title metadata correctly, including falling back from `<dc:title>` → `<title>` → filename if any are missing.
- **R-EP-6** Parser MUST log a warning (not fail) if a spine item is missing, corrupt, or non-XHTML. Missing items are skipped.
- **R-EP-7** Chapter detection: parser MUST emit a lightweight marker (`§§CHAPTER§§` or similar sentinel) at each new spine item boundary and at every `<h1>` / `<h2>`. Reader consumes this to pause briefly and show chapter title (PRD §5.2 "Chapter detection" is a Phase 1 feature — v0.1 just emits the marker, rendering the pause is optional).

**Acceptance.** Open a Standard Ebooks-formatted EPUB (Austen's *Pride and Prejudice* is the reference), a Project Gutenberg EPUB (inconsistent formatting), and a calibre-exported EPUB. In all three: no HTML tags in the word stream, no CSS source, no script content, chapter boundaries visible in the progress stream, paragraph pauses occur naturally at prose breaks.

---

### 4.4 Non-Linear Content Detection (Scroll Mode Stub)

**Problem.** RSVP is fundamentally wrong for tables, code blocks, equations, ASCII art. Current parser flattens these into word streams that are gibberish.

**Requirements.**

- **R-NL-1** Parser MUST tag the following DOM nodes as "non-linear segments" during EPUB parsing: `<table>`, `<pre>`, `<code>` when display:block, MathML `<math>` blocks, elements with `role="math"`, elements with `class` matching `/code|math|equation|table/` as a heuristic fallback.
- **R-NL-2** Non-linear segments MUST be replaced in the RSVP stream with a single sentinel token: `[table]`, `[code]`, `[math]`, `[figure]` (bracketed, spoken-word-like). Underlying segment content is preserved in a parallel `segments[]` array indexed by position.
- **R-NL-3** For plain .txt files, heuristic detection MUST flag probable non-linear content: runs of 3+ lines each containing `|` in grid-like positions (table), runs of 3+ lines starting with 4+ spaces or a tab (code), lines with high ratio of `=`/`-`/`_` characters (divider/ASCII art).
- **R-NL-4** When the reader reaches a sentinel token, it MUST pause playback and show a banner: *"Table ahead — view it? [Show] [Skip]"*. "Show" opens a modal with the raw segment rendered as preformatted text (for tables/code) or raw source (for MathML, since we're not rendering math in v0.1). "Skip" resumes playback past the sentinel.
- **R-NL-5** Modal MUST be dismissible with Esc / tap-outside / "Done" button. Resume plays the next word after the segment.
- **R-NL-6** Per-profile setting: "Always skip non-linear content" toggle. Default off. When on, sentinels auto-skip without banner.

**Acceptance.** Open a technical EPUB containing code examples (any O'Reilly book converted to EPUB works). Reading hits a code block → banner appears → "Show" displays formatted code in a modal → "Done" resumes reading. Open a Markdown-converted .txt with ASCII tables — same flow triggered by heuristic detection.

**Deferred to Phase 1.** Actual Scroll Mode (auto-scrolling prose reader for poetry, long code listings) per PRD §5.1. v0.1's modal is a stopgap — it shows the segment but doesn't scroll through it.

---

## 5. Design Notes

### 5.1 Tokenizer as a Pre-Pass

Current code splits on whitespace at load time into a flat `words[]` array. v0.1 needs a richer tokenizer that runs once at load and produces:

```js
{
  words: string[],              // display tokens (may be abbreviated)
  originals: string[],          // original forms for accessibility / search
  pacingHints: number[],        // per-token delay multiplier (hyphen parts get 0.8x, sentinels get 1.0x)
  segments: Segment[],          // non-linear segments indexed by word position
  chapters: ChapterMark[],      // { wordIndex, title }
}
```

This is a one-time up-front cost; no runtime regression.

### 5.2 Long-Token Font Scaling

Measure via `canvas.measureText()` at load time for each token longer than N chars, cache the required scale factor. At render time, apply:

```js
const baseFontSize = fSize;
const maxWidth = display.clientWidth * 0.9;  // 10% padding
const wordWidth = cache.get(word) * baseFontSize;
const scale = wordWidth > maxWidth ? maxWidth / wordWidth : 1;
wordArea.style.fontSize = (baseFontSize * scale) + 'px';
```

Monospace font means we could also compute character count directly, skipping canvas. Simpler but less accurate with kerning — acceptable tradeoff for v0.1.

### 5.3 Theme Bootstrap

To prevent flash-of-wrong-theme, inline script at top of `<head>`:

```html
<script>
  (function() {
    const saved = localStorage.getItem('openhearth_primer_theme') || 'auto';
    const dark = saved === 'dark' || (saved === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  })();
</script>
```

CSS then keys on `[data-theme="dark"]` instead of `@media (prefers-color-scheme: dark)`. Auto mode listens to media query changes and updates `data-theme` live.

### 5.4 EPUB Parser Skeleton

```js
async function parseEpub(file) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const opf = await findAndParseOpf(zip);
  const spine = getSpineHrefs(opf);
  const metadata = extractMetadata(opf);

  const segments = [];
  const chapters = [];
  const tokens = [];

  for (const href of spine) {
    const xhtml = await zip.file(resolve(opf.rootDir, href))?.async('text');
    if (!xhtml) continue;

    const doc = parseXhtml(xhtml);
    stripNonContent(doc);   // removes head/style/script/svg/nav/footnotes
    const extracted = walkAndExtract(doc, tokens.length);
    chapters.push({ wordIndex: tokens.length, title: extractChapterTitle(doc) });
    tokens.push(...extracted.words);
    segments.push(...extracted.segments);
  }

  return { metadata, tokens, segments, chapters };
}
```

Concrete helper implementations left to the work plan.

---

## 6. Open Questions

- **Q1** Should long-token scaling apply to the fixed size-button selection (28/36/44/52/60) or override it dynamically? Proposal: user's selection is the *ceiling*; actual render scales down only. Size buttons represent "preferred size for normal words."
- **Q2** Should the non-linear content modal render code with syntax highlighting? Adds 30-60KB for highlight.js. Proposal: no in v0.1 — plain monospace is readable; syntax highlighting is a Phase 2 polish item.
- **Q3** Does ohStyle need a "parchment" light variant that honors Primer's literary DNA, or does default linen-50 suffice? Proposal: stick with linen-50 for ohStyle port, reserve parchment treatment for Diamond Age version. Two coherent options > one muddled hybrid.
- **Q4** For .txt files, should we attempt *any* structure detection beyond non-linear-content heuristics? E.g., detect "Chapter 1" / "CHAPTER I" as chapter boundaries? Proposal: yes, minimal regex pass (`/^\s*(chapter|part|book)\s+[ivxlc\d]+/i`) — cheap and helpful.

---

## 7. Milestones (Suggested Execution Order)

1. **Tokenizer + long-token scaling** (R-LT-*) — fixes the most-visible problem, no EPUB dependency.
2. **Theme toggle** (R-TH-*) — one afternoon, independent, immediate reader-comfort win.
3. **EPUB parser rewrite** (R-EP-*) — biggest lift, but unblocks real book reading.
4. **Non-linear detection + modal** (R-NL-*) — depends on parser rewrite producing segment data; ships together with or right after milestone 3.

Ship as v0.1 after milestone 3 (with a naive "skip sentinel tokens silently" behavior for non-linear content). Add the modal UX as v0.1.1.

---

## 8. Success Criteria

A user with zero familiarity with the Primer can:
- Download any Standard Ebooks EPUB and read it cover-to-cover in the Primer without encountering a broken layout, tag pollution, or a nonsense stretch of non-prose content.
- Switch profiles and have their theme preference persist independently.
- Read in a bright room without eye strain regardless of OS settings.

If those three hold, v0.1 has shipped.
