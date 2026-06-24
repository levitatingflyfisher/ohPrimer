# OpenHearth Primer — Issue Catalog (hidden problems, ranked)

> Derived from a section-by-section audit of `index.html` + `sw.js`. Every item was verified
> against the actual code and cites line number(s). This is the regression checklist for a
> modular rebuild: each fix should be portable and individually testable. Companion:
> `SPEC.md` (behavior-derived spec).
>
> **Totals:** ~91 findings — **8 Critical, 22 High, 28 Medium, 33 Low.** Line numbers are
> against the original single-file `index.html` unless prefixed `sw.js:`. Some line numbers
> have since shifted as fixes landed; the titles and areas remain accurate anchors.

## ✅ Resolved so far (see git history on this branch)

| ID | Resolution |
|---|---|
| **C1** | Cloud sync relay removed → broken AES-GCM nonce handling no longer reachable. See PRIVACY.md §3. |
| **C2** | Cloud sync relay removed (UI + wiring deleted, network entry points throw). |
| **C3** | Cloud AI egress now behind sticky `confirmEgress` consent naming the host; on-device endpoints exempt. |
| **C4** | Can't be fully fixed client-side (no browser secure store); misleading hint replaced with honest disclosure. Residual risk documented in PRIVACY.md. |
| **C5** | CORS-proxy use now consent-gated and never silent; background refresh/auto-download proxy only if already consented. |
| **C6** | Parent PIN now a salted SHA-256 digest, not plaintext; legacy plaintext migrated on unlock. |
| **C7** | All seeks routed through `seekTo()`, which cancels the in-flight RSVP timer before moving. |
| **C8** | Same centralization enforces a single-pending-timer invariant; chapter-card double-chain eliminated. |
| **H2** | PID migration saves the re-keyed book before deleting the old key (crash-safe); a mid-flight failure leaves at worst a transient duplicate. |
| **H3** | Migration tracks failures and only sets `_pidMigrated` on full success, so a partial run retries next boot instead of stranding records. Extracts are now an in-place update. |
| **H4** | Backup import sanitizes untrusted JSON (`__proto__`/`constructor`/`prototype` stripped), caps record counts, and dedupes extracts by id (no re-import inflation). |
| **H6** | `findZipImage` tries resolved/decoded/slash-stripped paths then a basename match, so EPUB figures no longer silently fall back to `[figure]`. |
| **H7** | PDF gutter line-number strip is now adaptive (requires gap to dwarf median word spacing + ≥3 items), preserving years/verse/list numbers. |
| **H9** | Speak mode gets a session token; the async loop + per-frame tick bail on session change, and seeking restarts TTS from the new position instead of being overwritten. |
| **H11** | `saveCurrentPosition` captures bookId+position at call time; `stop()`/`loadDocument` cancel the debounced timer and flush the outgoing book before swapping docs. |
| **H12** | Switching profile tears down the open reader (flushing position) and clears in-memory doc/currentBookId, ending cross-profile bleed. |
| **H13** | Unawaited `renderStoragePanel()` calls now swallow rejections. |
| **H14** | Centralized `modalA11y`: role/aria-modal/labelledby, focus-into-on-open + restore, Tab trap (open-order topmost), Settings Escape. |
| **H15** | `assertSafeFetchUrl` at all fetch chokepoints blocks non-http(s) schemes + loopback/link-local/metadata/private-LAN hosts. DNS-rebinding residual noted below. |
| **H16** | Size caps on fetched payloads (25 MB text, 300 MB audio) prevent storage-bombing; full integrity verification has no browser trust anchor (residual). |
| **H17** | Default Anthropic model id updated `claude-sonnet-4-5` → `claude-sonnet-4-6`; UI example ids refreshed. |
| **H18** | Whisper (~40 MB) & Kokoro (~86 MB) downloads now gated by the sticky `confirmModelDownload`, like NLLB/SpeechT5. |
| **H19** | *Accepted, not code-fixed:* a serverless single-file app can't proxy the key server-side. Mitigated by the C3 egress consent + C4 honest disclosure (key leaves the browser, named host). A server proxy is out of scope for the single-file deliverable. |
| **H20** | App shell now network-first (cache fallback): online users always get the latest code, no stale-behind release. |
| **H21** | Versioned shell+runtime caches purge on activate; network-first delivery means a missed bump no longer strands users. |
| **H22** | SW runtime cache (stale-while-revalidate) now caches fonts + pinned CDN libs so they survive offline after first load; README claim corrected. |
| **M5** | `saveStore` returns success/failure and shows a one-time toast on persistent localStorage failure (no more silent loss of prefs/stats/migration flag). |
| **M9** | Divider/ASCII-art lines now flush the prose buffer, so adjacent paragraphs aren't glued together. |
| **M10** | `loadDocument` revokes the figure object URLs it created when the doc has no words (early return). |
| **M11** | Chapter-card hide timer is cancelled and the card hidden on every `loadDocument`. |
| **M13** | `updateScrollHighlight` collapsed from two full O(n) sweeps per word to one stateless pass (less setTimeout drift). |
| **M18** | Profile avatar initial no longer throws on an empty/whitespace name. |
| **M19** | Feed/OPML XML capped at 8 MB before DOMParser (entity-expansion guard). |
| **M20** | Auto-download skips on saveData/cellular/2g-3g; manual download unaffected. |
| **M21** | Feed descriptions decode entities before stripping tags (no markup resurrection). |
| **M22** | Timeouts added to Gutendex/iTunes/Gutenberg/voice-preset fetches (no permanent hang). |
| **M24** | Sibling-pipeline eviction calls `dispose()` (via `disposePipeline`) instead of bare null, reclaiming ONNX memory. |
| **M25** | Egress consent dialog discloses the actual destination host, surfacing baseUrl-override key leaks. |
| **M27** | Resolved by the H20 SW rewrite: a navigation miss falls back to the cached shell / `./` instead of the browser error page. |
| **M28** | Pinch-zoom re-enabled (dropped `user-scalable=no`); `prefers-reduced-motion` honored. |

*Also reviewed and judged not to need a code change:* **M3** (pids are non-numeric strings — no
numeric/string IDB key overlap), **M14** (both modal resolvers already resolve the prior prompt
with a cancel value, so concurrent prompts don't hang). **M23** (cors.eu.org raw-URL encoding)
left as-is deliberately — changing the primary proxy's format is unverifiable without live
testing and risks breaking the working path.

**Deferred (need real EPUB/PDF fixtures + a browser to verify, so they're slated for the
rebuild rather than patched blind):** **H1** (EPUB TOC off-by-one after fallback-chapter
dedupe), **H5** (figure blobs dropped + text truncated on quota), **H8** (cross-page paragraph
carry splicing a chapter tail). All other items below remain open and stay on the list. The
modular rebuild (`rebuild/`) is set up to retire them module-by-module — see `rebuild/README.md`.

## Severity legend
- **Critical** — security/crypto break, silent data loss, or runaway runtime bug that can corrupt
  state in normal use. Fix before any wider distribution.
- **High** — exploitable privacy/accessibility/correctness defect, or a bug that fires in common
  flows.
- **Medium** — robustness/UX/perf defect, narrow security exposure, or maintainability landmine.
- **Low** — polish, edge case, or latent risk.

---

## CRITICAL (8) — fix before distributing

| # | Title | Area | Lines |
|---|---|---|---|
| C1 | **AES-GCM nonce reuse under one seed-derived key** — single static key (zero salt, fixed info) + random 96-bit IV per push; repeated syncs eventually collide IVs → catastrophic GCM break (plaintext XOR leak + tag forgery). | Sync crypto | 6014–6022 |
| C2 | **Unauthenticated sync relay; channel id fully derived from seed** — PUT blindly overwrites a single slot; anyone with the seed (shown in plaintext UI) or the channel can silently destroy/replace the synced library. No writer auth, no integrity check on pulled blobs. | Sync | 6076, 6086–6092 |
| C3 | **Cloud egress of children's reading content with only an enable-flag** — once a key/baseUrl is set, review-card text, the recent passage, book/chapter titles, and generation topics are POSTed to Anthropic/OpenAI; comprehension banner auto-offers after 100 words. No per-use "this leaves your device" consent. Violates PRD §2.4. | AI privacy | 4099–4120, 4144–4196, 4210–4241, 3720–3762 |
| C4 | **API key stored in plaintext localStorage** — `p.prefs.ai.key` persisted in clear; `type="password"` only masks display. Any XSS/extension/shared-device read takes the key. | AI secrets | 3921, 3702, 1145 |
| C5 | **Full reading history leaked to third-party CORS proxies** — every article, feed, discovery probe, OPML import, and podcast MP3 routes through `cors.eu.org`/`allorigins.win`/`codetabs.com` on direct-fetch failure, with no consent or notice. Proxy operators see target URL + body. | Content privacy | 3218–3222, 3257–3268, 6798–6826 |
| C6 | **Plaintext parent PIN, string-compare gate** — `parentPin` saved verbatim, gate is `entered!==pin`. Trivially read/bypassed via devtools; no real access control over another profile's data. | Parent controls | 6140–6143, 6173 |
| C7 | **Seek during playback never cancels the in-flight RSVP timer** — every seek handler mutates `idx` + `render()` but never `clearTimeout(timer)`/checks `playing`; the pending `step()` fires from the new idx, double-advances, and chains can coexist → runaway acceleration. | Reader runtime | 2693–2710, 4303–4304, 4548–4550, 4566–4571, 4666–4667 |
| C8 | **Chapter-card branch spawns a second concurrent timer chain** — `step()` reassigns the single `timer` after the outer callback already overwrote it; the 1800 ms pause timer and a fresh `step()` chain can run concurrently with one untracked/leaked. | Reader runtime | 2705–2708 |

---

## HIGH (22)

| # | Title | Area | Lines |
|---|---|---|---|
| H1 | **EPUB TOC off-by-one after fallback-chapter dedupe** — `splice` removes a block but never decrements the stored `spineAnchors.blockIdx`; every TOC jump for a deduped spine item (the common heading case) lands on the wrong word. | Parsers | 1675, 1709–1712, 2847 |
| H2 | **PID migration is non-atomic (delete-then-resave across txns)** — a crash/close/quota-throw between the two loses the record; `_pidMigrated=true` is set anyway, so it never retries. Permanent data loss. | Data | 1417–1438, 1440 |
| H3 | **`_pidMigrated` set even on partial failure** — records that threw mid-migration become permanently invisible (old numeric `profileIdx` never matches the new pid). | Data | 1426, 1437, 1440 |
| H4 | **Unvalidated imports → prototype pollution / arbitrary record injection** — backup & sync spread untrusted objects straight into IDB with no whitelist/`__proto__` filter; extracts `put` with no dedupe (unbounded inflation on re-import). | Data | 5945–5966, 6053–6067, 5980–5984 |
| H5 | **Figure blobs silently dropped + book text silently truncated on quota** — illustrations never roundtrip backup/sync; on quota a book is re-saved with `figureBlobs:{}` behind a one-time (suppressible) toast. | Data | 5917–5919, 6046–6047, 1290–1304 |
| H6 | **EPUB image src used directly as zip key → figures silently lost** — resolved path not re-decoded/normalized before `zip.file`; absolute or percent-encoded names yield `null` blob + `[figure]` placeholder, no error. | Parsers | 1719–1725, 2238 |
| H7 | **`renderLines` gutter-number strip deletes legitimate leading numbers** — any line starting with a 1–4 digit run + >6px gap is dropped unconditionally; corrupts years ("1984 was…"), verse/list numbers. | Parsers | 1862–1864 |
| H8 | **Cross-page paragraph carry can splice one chapter's tail into the next** — a chapter marker on a page whose body filters to empty is emitted before the `continue`, leaving the prior carry to merge into the next real page. | Parsers | 1972–1998 |
| H9 | **Stale-closure / seek-overwrite in speak mode** — TTS `tick()` writes `idx` from a `blockStart` captured before the user's seek; a seek during TTS is overwritten every rAF frame, fighting the user. | Reader/TTS | 2706, 6655–6657 |
| H10 | **Sentinel/chapter dismissal advances idx without resuming or resetting `lastChapterShown`** — leaves playback stopped, can suppress the next chapter card, and parks the user on the sentinel at end. | Reader | 2808–2817 |
| H11 | **`positionSaveTimer` survives stop()/loadDocument → stale idx written to wrong book** — fire-once guard never cleared; a pending save firing after a new book loads writes a mismatched `idx`/`currentBookId`. | Reader/Data | 3027–3029, 2740–2748, 2825 |
| H12 | **Profile switch leaves reader/book state from the previous profile** — `currentBookId`, in-memory `doc`/`idx`, and the open reader are untouched; position-save and storage panel now read a different profile → cross-profile bleed. | Profiles | 4717–4719 |
| H13 | **`renderStoragePanel()` called unawaited from `openSettings`** — async IDB read resolves after the modal is shown; rejections unhandled. | UI | 3864 |
| H14 | **No `role="dialog"`/`aria-modal`/focus trap on any modal** — keyboard users Tab into the obscured background; screen readers aren't told a dialog opened; settings modal also lacks Escape-to-close. | A11y | 893–956, 3764–3826 |
| H15 | **SSRF-style fetch of arbitrary pasted URLs, no scheme/host validation** — `loadUrl`/`subscribeFeedUrl`/`discoverFeedUrl`/OPML can hit `localhost`, `169.254.169.254`, LAN, `file:`/`blob:`; proxy chain may reach internal endpoints. | Content | 3317–3323, 5772–5781, 5716–5770, 6890–6895 |
| H16 | **Proxy/remote responses trusted verbatim and persisted** — a malicious proxy can substitute article/feed/MP3 bytes that get written to IDB; no signature/hash/content-type check. | Content | 3259–3266, 5781–5783, 6810–6821 |
| H17 | **Outdated Anthropic model id hardcoded as default** — default `claude-sonnet-4-5` (current Sonnet is `claude-sonnet-4-6`; current Opus `claude-opus-4-8`); UI hints also cite stale `claude-opus-4-6`. Un-overridden users hit a superseded model. | AI | 3697, 3892, 3898 |
| H18 | **No consent/metered gate before Whisper (~40 MB) & Kokoro (~86 MB)** — both download on first use with no `confirmModelDownload`, inconsistent with the gate built for NLLB/SpeechT5. | AI | 6588–6613, 6712–6743 |
| H19 | **Anthropic key sent directly from browser via `anthropic-dangerous-direct-browser-access`** — raw key travels client→`api.anthropic.com`, visible in devtools/network; correct pattern is a server proxy. | AI | 3729–3731 |
| H20 | **SW: stale shell can persist a full release behind** — navigations are stale-while-revalidate; new code only lands for the *next* navigation, with no `skipWaiting` reload/version banner. | PWA | sw.js:26–48 |
| H21 | **SW: `CACHE='ohprimer-v1'` never bumped** — literal constant, no build step/hash; activate-time purge never triggers for a new version. | PWA | sw.js:4 |
| H22 | **README "fully offline-capable" is false** — SW caches only `./`; fonts, transformers.js, JSZip, Tesseract, OpenDyslexic, HF models all fetched at runtime and **not** cached. Cold offline launch loses fonts + every model feature. | PWA | sw.js:5,50–52 |

---

## MEDIUM (28)

| # | Title | Area | Lines |
|---|---|---|---|
| M1 | Last-write-wins merge by `lastReadAt` clobbers newer reading positions; no field-level merge. | Data | 5955, 6059 |
| M2 | Sync seed stored plaintext in localStorage; long-term library-decrypting secret at rest unprotected. | Data | 6096–6099, 1388 |
| M3 | `migrateProfilePids` numeric-vs-string `profileIdx` overlap unguarded (pid collision could mis-migrate). | Data | 1412–1416 |
| M4 | OPML/reading-list fetch every URL in a loop — no concurrency limit, timeout, or outline cap. | Data/Content | 5988–5990, 6889–6905 |
| M5 | `saveStore`/several `dbSaveBook` callers swallow errors → silent persistence loss (incl. seed, `_pidMigrated`). | Data | 1216, 2956, 2974 |
| M6 | Regex backtracking risk in `isTocLine` / per-line scans on pathological PDF lines (quadratic stalls). | Parsers | 1976, 1907 |
| M7 | Unbounded PDF memory — all pages' items + lines + blocks buffered simultaneously (3 full copies; OOM on big textbooks). | Parsers | 1780–1800, 1882–1888 |
| M8 | `MAX_TOKEN_CHARS=30` skip corrupts CJK/Thai (space-only split → whole sentences become "…"). | Tokenizer | 1470–1471, 1484–1489 |
| M9 | Text-parser divider heuristic drops short `[=\-_*~]` lines without flushing → glues adjacent paragraphs. | Parsers | 1572 |
| M10 | Figure blob URLs leaked when `loadDocument` returns early after creating object URLs. | Reader | 2836–2837, 2827 |
| M11 | `chapterCardTimer` leaks across loads/seeks (cleared only inside `maybeShowChapterCard`). | Reader | 4251–4262, 2825 |
| M12 | TTS rAF/audio-element churn on rapid stop/start (`_ttsAudioEl` from prior block survives). | Reader/TTS | 6653–6672 |
| M13 | `updateScrollHighlight` does two O(n) `querySelectorAll` sweeps every word → setTimeout drift at high WPM in scroll mode. | Reader | 2634–2641 |
| M14 | Singleton modal resolvers silently drop concurrent prompts (a rename aborts if another prompt opens). | UI | 3766–3770, 3800–3803 |
| M15 | Eviction `keepN`/purge bucket all feed-less episodes under `(orphaned)` → can delete audio the user meant to keep. | UI/Storage | 4047–4057, 3981, 4021 |
| M16 | Fire-and-forget unawaited renders after mutations → interleaved renders paint stale rows. | UI | 4014, 4073, 4980, 4994, 5005, 5021, 5033, 5055 |
| M17 | Per-row listeners re-bound on every render; search box re-binds hundreds per keystroke (no delegation). | UI | 4707–4745, 4961–5057, 5059 |
| M18 | `esc(p.name[0].toUpperCase())` throws on an empty profile name → breaks the whole profile list. | UI | 4697 |
| M19 | XML feed/OPML parsing has no size cap → entity-expansion ("billion laughs") DoS surface. | Content | 5188, 6879 |
| M20 | Auto-download decoupled from any connection check (`navigator.connection`/`saveData` unused) → burns metered data. | Content | 5369–5428 |
| M21 | `decodeHtmlEntities` re-encoding order is fragile — entity decode after tag-strip can resurrect markup (neutered only by render-time `esc()`). | Content | 5181–5186, 5191 |
| M22 | No timeout on Gutendex/iTunes/Gutenberg direct fetches → permanent "Searching…/Downloading…" hang on a stalled connection. | Content | 3073, 3127, 3188 |
| M23 | `cors.eu.org` receives the raw un-encoded URL → query params misparsed, many real URLs break. | Content | 3219, 6799 |
| M24 | transformers.js sibling-eviction is a bare null assignment, not `dispose()` — two large pipelines can transiently coexist, defeating OOM avoidance. | AI | 6278, 6444 |
| M25 | `baseUrl` override sends the key to an attacker-controlled origin (no allowlist on baseUrl). | AI | 3724, 3741–3751 |
| M26 | No pipeline `dispose()` / no abort of in-flight model download or transcription on navigation/profile switch. | AI | 6269, 6405, 6584, 6733 |
| M27 | No offline navigation fallback — a navigate miss does bare `fetch` with no `.catch` → browser error page offline. | PWA | sw.js:28–45 |
| M28 | `user-scalable=no` blocks pinch-zoom (WCAG 1.4.4) on a reading app; no `prefers-reduced-motion` anywhere. | A11y | index.html:5; CSS 32–643 |

---

## LOW (33)

| # | Title | Area | Lines |
|---|---|---|---|
| L1 | IDB v1→v3 migration relies on store-existence not `oldVersion`; v3 `kind` backfill is fire-and-forget. | Data | 1228–1258 |
| L2 | `_quotaWarned` global never resets → no further storage warnings after the first all session. | Data | 1277–1284 |
| L3 | `reidBookForProfile` parses `id.split("::")` — breaks if a filename contains `::`. | Data | 5940–5943 |
| L4 | Per-page footnote/column thresholds use one global median → mis-handle mixed-size pages. | Parsers | 1830–1835, 1806 |
| L5 | NCX/nav iteration misses non-standard nesting → silently truncated TOC; leading-slash href won't match anchors. | Parsers | 2100–2129, 2138–2150 |
| L6 | `parsePdfWithOcrFallback` reaches into UI globals (`confirmAction`/`showToast`) — breaks headless/testing. | Parsers | 2071–2081 |
| L7 | Minimap canvas reallocated every render with panel open → repaint each word (perf). | Reader | 2492–2497, 4640 |
| L8 | Tap-zone vs swipe overlap — a slow/short drag falls through to neither branch → ambiguous seek/toggle. | Reader | 4545–4575 |
| L9 | Layout reads (`getBoundingClientRect`) on hidden/detached nodes → no-op scrolls (harmless). | Reader | 2319–2326 |
| L10 | Rename allows whitespace-only / no length cap; silent rejection feedback. | UI | 4989–4991 |
| L11 | `navigator.storage.estimate` percentage can show "0%" of "0 B" when quota unreported. | UI | 3965–3967 |
| L12 | AI key-hint strings use `innerHTML` (static today, fragile pattern next to user fields). | UI | 3889–3898 |
| L13 | Pervasive error swallowing hides direct→proxy privacy downgrade and refresh/render failures. | Content | 3259, 3265, 5542, 5645, 6824 |
| L14 | `episodeIdFor` is a 32-bit djb2 hash → cache-key collisions can serve the wrong audio blob. | Content | 4312–4316 |
| L15 | Failed review cards can't relearn in-session (interval floor = 1 day; no sub-day steps). | Learning | 1382, 1385 |
| L16 | Due dates are rolling-24h timestamps, not calendar-day → interval drift; inconsistent with streak logic. | Learning | 1385 |
| L17 | `reviewTotal` not decremented on skip/delete → "X of N" and "Reviewed N" overcount. | Learning | 3481, 3638, 3643, 3564, 3541 |
| L18 | Comprehension result never persisted — discarded on modal close, never informs scheduling. | Learning | 4171–4191 |
| L19 | Cloze `focusIdx:r.focusIdx||0` fallback can silently mis-default. | Learning | 3612 |
| L20 | Grade-2 path unreachable (UI only emits 1/3/4/5) — near-miss EF penalty never applied. | Learning | 3567–3570 |
| L21 | Voice-preset embeddings cached in `_voicePresetCache` with no eviction (steady memory growth). | AI | 6438, 6466–6476 |
| L22 | `testAiConnection` mutates the live profile object during the probe (narrow race window). | AI | 3934–3944 |
| L23 | Kokoro per-block blob URLs revoked only on `ended`/`error`, not on abort → leak per stop. | AI | 6646–6672 |
| L24 | Whisper re-imports transformers.js inline instead of reusing the shared loader (dup config). | AI | 6721–6724 |
| L25 | No `prefers-reduced-motion` for spinners / ticker per-word transition / theme transitions. | A11y/CSS | CSS 197, 313, 335 |
| L26 | `--oh-text-tertiary` (#8C7B65) fails AA contrast on small labels in both themes. | A11y/CSS | 67–68, 79–80, 261, 492 |
| L27 | Numerous hardcoded hex/rgba literals bypass the token system (won't re-theme). | CSS | 59, 75, 190, 429, 517 |
| L28 | Undefined tokens (`--oh-copper`, `--oh-surface2`) survive only on fallbacks → renamed/dropped without cleanup. | CSS | 343, 285 |
| L29 | `theme-color` meta static in markup; bootstrap doesn't update it → brief light status bar in dark mode. | CSS | index.html:8, 2899 |
| L30 | Primary buttons reimplemented via inline `style` on `.modal-close` in 5 modals → specificity/maintenance landmine. | CSS | 906, 938, 953, 1164 |
| L31 | `:focus-visible` ring uses `--oh-interactive` → invisible on primary buttons sharing that fill. | A11y/CSS | 589 |
| L32 | `404.html` instant meta-refresh traps the back button and isn't SW-aware offline. | PWA | 404.html:4 |
| L33 | `skipWaiting()`+`clients.claim()` with no `controllerchange` reload → new SW controls a page running old shell JS. | PWA | sw.js:9, 18 |

---

## How to use this for the rebuild

1. **Treat C1–C8 as release-blockers** regardless of architecture — several (C1–C6) are design
   flaws that a naive rewrite would faithfully reproduce if it starts from the PRD instead of
   this list.
2. **Port behavior against `SPEC.md`, regression against this file.** Each row is a discrete,
   testable assertion ("seek during playback must cancel the pending timer", "TOC jump lands on
   the exact word", "Whisper download is consent-gated").
3. **The privacy cluster (C3, C4, C5, C6, H15, H16, H19, M25)** is the single biggest theme and
   directly contradicts PRD §2.4 — decide the privacy model *first*, because it dictates whether
   cloud AI, CORS proxies, and the sync relay survive at all.
4. **The crypto (C1, C2, M2)** should be redesigned, not patched: per-message nonces (or XChaCha20
   random nonces), an authenticated relay, and writer authentication.
