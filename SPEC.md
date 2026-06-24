# OpenHearth Primer — Behavior-Derived Specification

> **Status:** Reverse-engineered from `index.html` (6946 lines) + `sw.js`. This is the
> *actual* contract the code
> implements, mined section-by-section, and reconciled against `openHearthPrimerPRD.md`
> (cited as **PRD §x**) and `openHearthPrimerv0.1-spec.md`. Where the code diverges from the
> PRD, the divergence is called out inline as **⚠ Divergence**. Companion document:
> `ISSUES.md` (ranked defect catalog with line numbers).
>
> The intent of this doc is to be the grading rubric for a modular rebuild: anyone should be
> able to reimplement a subsystem from its section here and diff behavior against the old file.

---

## 0. Product frame (from PRD)

A single-file, offline-first PWA — "a reading engine for the whole family" (PRD §1). Five
principles: family-first (multi-profile), honest pedagogy (spaced repetition, comprehension),
modularity, privacy & sovereignty (on-device, nothing leaves the device), and
simplicity/durability (one HTML file, deps from CDN). Everything below is how the shipped code
actually realizes (or fails to realize) that frame.

---

## 1. Persistence & data layer

### 1.1 localStorage state
- Single key `STORE_KEY = "openhearth_primer_v01"`; value is `JSON.stringify(state)`.
- `loadStore()` swallows parse errors → returns `null`. `saveStore()` swallows **all** write
  errors (empty `catch{}`).
- State shape:
  ```
  {
    profiles: [{
      name, pid,                       // pid = stable "<adj>-<noun>-<NN>" slug (genPid)
      feeds: [{url, title}],
      stats: {wordsRead, minutes, sessions},
      prefs: {
        wpm:300, mode:"classic", fSize:44, theme:"auto",
        autoSkipSegments:false, pagePanelOpen:true, contextStrip:true,
        highContrast:false, dyslexiaFont:false, parentPin:"",
        sync:{relayUrl, seed},
        ai:{provider:"none", key, baseUrl, model},
        feeds?:{eviction:{policy, count}, translationEnabled, translationTarget,
                wordTimestamps, voiceCloneEnabled, voicePreset},
        ttsVoice?, modelConsent?:{<modelKey>:<ts>}
      }
    }],
    activeProfile: 0,
    _pidMigrated?: true
  }
  ```
- `getState()` is defensive: spreads defaults over each stored profile, forces a valid
  `activeProfile`, falls back to a single default profile when missing.

### 1.2 IndexedDB
- `DB_NAME="openhearth_primer_db"`, `DB_VERSION=3`. Three stores, all `keyPath:"id"`:
  - **books** — indexes `byProfile(profileIdx)`, `byLastRead(lastReadAt)`. Key
    `` `${profileIdx}::${filename}::${size||0}` ``. Record carries `parsed` (blocks/toc/
    spineAnchors/figureBlobs), `wordTimings?`, `translations?`, `position`, `priority`,
    `addedAt`, `lastReadAt`, `source:{kind,label,url?}`. `dbListBooks` returns a lightweight
    projection (no `parsed`) sorted by `lastReadAt` desc.
  - **extracts** — indexes `byProfile`, `byBook`, `byNextReview`. See §6.
  - **episodes** (added v3) — indexes `byFeed`, `byGuid`, `byPublished`, `byProfile`. Holds
    podcast blobs and cloned-voice WAVs.
- `dbRun(mode,fn,store)` wraps a single-store transaction, resolves on `tx.oncomplete`.
- **Profile scoping:** every record tagged with the profile's stable `pid`; all reads go
  through `byProfile` with `IDBKeyRange.only(pid)`. Same file under two profiles = two records.

### 1.3 Migrations
- **IDB `onupgradeneeded`:** creates missing stores; for `oldVersion<3` cursors books and
  stamps `kind="book"` if absent (fire-and-forget inside the upgrade txn).
- **PID migration** (`migrateProfilePids`, one-time, guarded by `state._pidMigrated`): for each
  numeric profile index, lists books/extracts under the *numeric* `profileIdx`, deletes each,
  rewrites `profileIdx`/`id` to the string `pid`, re-saves. Sets `_pidMigrated=true` and
  persists **regardless of success**. ⚠ Non-atomic (delete then save across separate txns) — see
  ISSUES C-grade / High items.

### 1.4 Backup (JSON) — export/import
- Export: `{version:1, exportedAt, profile:{name,pid,prefs,stats,feeds}, books:[…figureBlobs
  emptied], extracts:[…]}`. Figure blobs do not roundtrip JSON (silently dropped).
- Import: rejects `version!==1`; re-scopes each book to local pid via `reidBookForProfile`
  (parses `id.split("::")`); **skips** a book if a local copy has `lastReadAt >= incoming`
  (last-write-wins by timestamp); extracts re-scoped and always `put` (no dedupe); feeds merged
  by `url`. No field whitelist on imported objects.

### 1.5 Encrypted sync
- **Seed:** 32 random bytes as 64-hex, stored in `prefs.sync.seed`; entry validated
  `^[0-9a-f]{64}$`.
- **KDF:** HKDF-SHA256, **fixed all-zero salt**, fixed `info` strings → 32-byte keys. Two
  derivations: encryption key (`SYNC_KEY_INFO`) and channel id (`SYNC_CHANNEL_INFO`, hex).
- **Cipher:** AES-GCM, 12-byte random nonce per encrypt; output `base64(nonce ‖ ct+tag)`.
- **Relay protocol:** channel id = `hex(HKDF(seed, channel-info))`. Push = `PUT
  {relayUrl}/{channelId}` (body = base64 blob, `text/plain`). Pull = `GET {relayUrl}/{channelId}`
  (404 ⇒ empty). Relay is a dumb single-slot key→blob store; PUT overwrites. **No auth.**
- **Payload:** `{v:1, t:Date.now(), profile:{prefs,stats,feeds}, books:[…figureBlobs cleared],
  extracts:[…]}`. Merge = same last-write-wins as import.
  ⚠ See ISSUES — nonce reuse + unauthenticated relay are the two Critical findings here.

### 1.6 OPML
- Export OPML 2.0, one `<outline type="rss" text= title= xmlUrl=/>` per feed.
- Import: DOMParser `text/xml`, checks `parsererror`, selects `outline[xmlUrl]`, dedupes against
  existing `f.url`, **fetches+parses each feed to validate** before adding `{url,title}`. No cap
  on outline count, no concurrency limit.

---

## 2. Tokenizer & document model

### 2.1 Parser output (the universal document interchange)
`{title, blocks, skipped, toc, spineAnchors, figureBlobs}`. `blocks` is ordered; four shapes:
- **text** `{type:"text", text}` — single-line prose, whitespace pre-collapsed.
- **chapter** `{type:"chapter", title}` — hard structural break, no body.
- **segment** `{type:"segment", kind, content}` — `kind ∈ {code, table, math, figure}`. For
  figure, `content = {src, alt}` where `src` is a resolved zip-relative path (blob lookup key,
  not a URL). For code/table/math, `content` is a string.
- `skipped` = front-matter labels. `toc` = `[{title,depth,href}]` (unresolved). `spineAnchors` =
  `href→{blockIdx}`. `figureBlobs` = `src→Blob|null`.

### 2.2 Token model (`tokenizeDocument`)
Output `{words[], originals[], pacing[], segments:Map<wordIdx,seg>, chapters:[{idx,title}],
skipped, blockStartWordIdx[]}` — index-parallel arrays. `words[i]` = display token,
`originals[i]` = source token, `pacing[i]` = per-word dwell multiplier.
- **chapter block** → pushes `{idx, title}` to `chapters`, emits **no** word.
- **segment block** → `segments.set(wordIdx, {kind,content})` + one sentinel word
  `"["+kind+"]"`, pacing 1.5.
- **text block** → `tokenizeText`; last word's pacing bumped to ≥1.5 (paragraph ghost-pause).
- `blockStartWordIdx[bi]` records the word index where block `bi` began (TOC anchor mapping).

`emitToken` rules in order: (1) URL → `abbreviateUrl` display, full URL kept as original;
(2) token > `MAX_TOKEN_CHARS=30` → display `"…"`, `skipped++`; (3) hyphen split if `len>6 &&
has "-" && no en/em dash` → parts share one `original`, non-final parts pacing 0.8;
(4) else raw with `getPunctuationDelay`.

`getPunctuationDelay`: `.!?`→1.7, `;:`→1.2, `,`→1.0, dashes→1.0, len>10→1.1, else 1.0.
⚠ No abbreviation handling ("Dr.", "U.S." get full sentence pause). ⚠ Space-only splitting
mangles CJK/Thai (see ISSUES).

### 2.3 Parsers (input→output contracts)
- **Plain text** (`parseTextFile`): line loop with a prose buffer; heuristics in order —
  chapter (`/^\s*(chapter|part|book)\s+[ivxlcdm\d]+/i` & `<80` chars), divider (≥80% of
  `[=\-_*~]` → **dropped, no flush**), code (≥3 indented lines), table (≥3 lines with ≥2 `|`),
  blank → flush. Else append to buffer.
- **EPUB** (`parseEpubFile`): JSZip from CDN → container.xml → OPF → spine. Per spine item:
  parse XHTML (fallback HTML), `stripNonContent`, `detectFrontMatter` (skip boilerplate; **word
  count <80 → dropped as "short section"**), push fallback chapter, `walkContent`, dedupe
  fallback if walk emitted its own chapter. Then extract figure blobs, parse TOC (EPUB3 nav
  preferred, else EPUB2 NCX). `walkContent` reads only `textContent`/`nodeValue` — **never
  innerHTML** (so no script execution / XSS via EPUB).
- **PDF** (`parsePdfFile`): pdf.js with `isEvalSupported:false`. Per page pipeline
  `stripFootnotes → detectColumns → groupIntoLines → renderLines`, with thresholds:
  - footnote = `height < median*0.75 && y < pageHeight*0.3` (needs ≥20 items).
  - columns = largest x-gap `> pageWidth*0.08` between 0.3–0.7 width, each column ≥20% of items
    (needs ≥40 items); reads left fully then right.
  - line break when `|Δy| > max(2, h*0.5)`.
  - gutter line-number strip = leading `/^\d{1,4}$/` with gap `>6px` (⚠ corrupts years/verse
    numbers — see ISSUES).
  - header/footer = first/last line appearing on `≥max(3, 40%)` of pages.
  - TOC skip = first page with `^(Contents|Table of Contents)$` + following pages where ≥50% of
    lines look like TOC entries.
  - chapter markers from top-level PDF outline → page index.
  - flatten: de-hyphenate `-\n[a-z]`, soft paragraph breaks on short sentence-ending lines,
    cross-page paragraph carry. Throws `code="PDF_NO_TEXT"` if total <40 chars.
- **OCR fallback** (`ocrPdfFile`): pdf.js + Tesseract; render each page to canvas at scale 2,
  OCR eng, de-hyphenate, fold newlines. `parsePdfWithOcrFallback` runs text first, prompts user
  on `PDF_NO_TEXT`, then OCR.

---

## 3. Reader core, rendering, playback

### 3.1 Reader state
`doc` (tokenizer output + `pacingCum:Float32Array`, `_blocks[]`, `figures`, `wordTimings?`),
`idx`, `playing`, `timer` (single setTimeout handle), `pageRange`, `scrollRange`,
`currentBookId`, `positionSaveTimer`, `chapterCardTimer`, `lastChapterShown=-1`,
`_swipeGuardUntil`. Mode prefs: `wpm` (100–1500 step 25), `mode ∈ {classic, ticker, scroll,
speak}`, `fSize ∈ {28,36,44,52,60}`, `sigma`, `winSize`.

### 3.2 RSVP timing & playback loop
- Per-word delay `ms = (60000/wpm) * (pacing[idx]||1)`.
- `step()`: bail if not playing; read `curIdx=idx`; `timer=setTimeout(…, ms)`. On fire: if at
  end → `stop()`; else `idx++`, `schedulePositionSave()`, then — segment & not autoSkip →
  `render()` + `pauseForSentinel()`; chapter boundary → `timer=setTimeout(step, 1800)`
  (chapter-card pause); else recurse `step()`.
- `play()` sets playing, acquires wake lock, dispatches to `ttsPlay()` (speak) or `step()`.
  `stop()` clears timer, releases wake lock, records session, saves position, offers
  comprehension check. `toggle()` resets to 0 if at end.
- ⚠ **Seek handlers do not clear `timer` or check `playing`** — the two Critical reader bugs
  (runaway double-advance, overlapping timer chains). See ISSUES.

### 3.3 Rendering modes
- **classic** — ORP split (`getORP`: ≤1→0, ≤5→1, ≤9→2, else 3) with before/pivot/after spans.
- **ticker** — gaussian-weighted carousel, ±`winSize` neighbors, opacity/scale/blur from
  `gauss(dist,sigma)`.
- **scroll** — windowed `.sw` spans (`idx±800`), rebuild when idx leaves range or within 100
  words of an edge; `updateScrollHighlight` marks `.past`/`.cw` and centers the current word.
- **speak** — renders whole block text, highlight interpolated from audio time.
- Page strip range = chapter containing idx → next chapter (cap 5000 words, re-center if
  oversized) or `idx±1500` (cap 3000) if no chapters. Minimap = canvas column grid; figure
  markers as accent lines; caret at `(idx-start)/n`.

### 3.4 loadDocument flow
Revoke previous figure object URLs → `tokenizeDocument` → keep `_blocks` → materialize figure
object URLs → bail if no words → build `pacingCum` → resolve TOC via spineAnchors→
blockStartWordIdx (or synthesize from chapters) → `idx=0; stop()` → reset scroll/chapter/
translation state → set title/meta → render TOC → conditionally open page panel on wide screens
→ `render()`.

### 3.5 Gesture map
- Tap zones: left 30% → −10, right 30% → +10, center → toggle (guarded 400 ms post-swipe).
- Swipe: horizontal → ±20, swipe-up → `extractCurrent()` (needs `dt≤400ms` & `>50px`).
- Buttons tBack/tFwd → ∓20. Keys: ←/→ ∓20, ↑/↓ wpm ∓25, Space toggle, `e` extract, `v` flag.
- Page-body / page-map / TOC / scroll-word clicks all seek to a clamped idx.

---

## 4. UI shell, screens, modals

### 4.1 Navigation
Manual `.screen.active` class-toggling (no router, no back-stack). Screens: `homeScreen`,
`libraryScreen`, `readerScreen`, `reviewScreen`. Transitions hard-code source+destination
(`enterLibrary`, `exitLibrary`, `libToReader`, continue-reading card → reader).

### 4.2 Modal system
`.modal-backdrop.open` overlays. Promise-based replacements for native dialogs:
- `askText({title,label,placeholder,initial,hint,okLabel,type}) → Promise<string|null>` —
  single-instance via module-global `_askTextResolve` (opening a second resolves the first with
  `null`). OK/Cancel/Close/backdrop/Enter/Escape resolve.
- `confirmAction({title,message,okLabel,danger}) → Promise<boolean>` — same singleton pattern via
  `_confirmResolve`; `danger` recolors OK red.
- Settings modal reads/writes `activeProfile().prefs`. ⚠ No `role="dialog"`/`aria-modal`, no
  focus trap, no focus restore; settings modal lacks Escape-to-close.

### 4.3 Settings
All on `activeProfile().prefs`: accessibility (highContrast, dyslexiaFont), feeds/eviction
(`{policy ∈ manual|keepN|days|favorites, count 1–500}`), translation, TTS voice, sync relay URL,
AI provider config. `testAiConnection()` temporarily swaps live config, calls `callLLM`, restores
in `finally`.

### 4.4 Storage panel & eviction
`renderStoragePanel()` shows `navigator.storage.estimate()` (red ≥80%), enumerates episode
blobs per `feedUrl` (orphans keyed `(orphaned)` — ⚠ collision, see ISSUES), per-feed Purge.
`runEviction()`: `manual`/`favorites` no-op; `days` deletes blobs older than `count` days;
`keepN` keeps N most-recent per feed. "Delete" = strip `blob`/`size`/`cachedAt`, preserve
metadata/transcripts.

### 4.5 Profiles & library
Profile = `{name, pid, feeds, stats, prefs}`; switching sets `activeProfile`, persists,
re-renders, re-applies theme — ⚠ does **not** clear `currentBookId`/loaded `doc` (cross-profile
bleed). Remove refuses below 1 profile, confirms, deletes profile's books+extracts. Library:
`libState={search,sort,filter,feedFilter,view,riverFilter}`; filter chips
(all/inprog/unstarted/finished/pinned), sorts (recent/title/progress/words/added), pinned
partitioned first. Source buttons: File / Folder (desktop ≥900px) / Paste / Gutenberg /
Podcasts / URL / Generate.

### 4.6 Parent dashboard
`openParentDashboard()`: if `prefs.parentPin` set, prompts (`askText type:password`) and
compares as **plaintext** (⚠ Critical — no real access control). Renders per-profile stat rows.
Set PIN requires length ≥4, stores raw.

---

## 5. External content sources & feeds

### 5.1 Fetch plumbing
- **Text proxy chain** (`CORS_PROXIES`, tried in order): `cors.eu.org/<RAW_URL>` (⚠ not encoded),
  `allorigins.win/raw?url=`, `codetabs.com/v1/proxy?quest=`.
- **Binary proxy chain** (podcast MP3): `cors.eu.org/<RAW>`, `allorigins.win/raw?url=`.
- `fetchT(url, ms=8000)` = fetch + `AbortSignal.timeout`. `fetchWithProxies(url)` tries direct
  (5 s) then each proxy (8 s); throws if all fail (errors swallowed per-attempt).
- `decodeResponseBytes` sniffs charset (meta/xml/HTTP), maps ISO-8859-1→windows-1252, retries
  windows-1252 if >3 replacement chars.
- `fetchFeedConditional` = polite conditional GET (ETag/Last-Modified), maps 304/429+503/404+410/
  2xx/4xx; falls through to proxy chain on error (loses caching headers).
- `fetchBinaryWithProxies` = direct (15 s) streaming-progress, then binary proxies (120 s each).

### 5.2 Sources
- **Gutenberg:** `gutendex.com/books/?…&mime_type=text/plain` (no proxy, **no timeout**). Download
  picks `text/plain*`, direct fetch then allorigins fallback, strips boilerplate, unwraps
  72-col, requires ≥500 chars. id `gutenberg-<id>.txt`.
- **Podcasts (iTunes):** `itunes.apple.com/search?media=podcast&limit=30&term=` (no proxy, no
  timeout); filters to `feedUrl`; click → `subscribeFeedUrl`.
- **Article by URL** (`loadUrl`): `fetchWithProxies`; if body starts `<?xml`/`<rss`/`<feed`
  offer to subscribe instead; else `extractArticle` (DOMParser `text/html`, score nodes,
  collect `textContent` of `p,h1-6,li,blockquote,pre` >20 chars, require ≥200 chars). **Raw HTML
  never inserted into live DOM.** id `url-<ts>.txt`.
- **RSS/Atom** (`parseRssFeed`): DOMParser `text/xml`, throws on parsererror. Extracts title/
  link/date/desc/audio/chapters with namespace fallbacks. `cleanDesc` strips tags via regex then
  decodes entities via detached textarea, truncates 300 (⚠ fragile sanitization order — neutered
  only by `esc()` at render). `findAudio` from enclosure / media:content / atom link. `find
  Chapters` from psc/podcast chapters (inline or remote JSON, **direct fetch, no proxy**).
- **Refresh** (`refreshFeeds`): `Promise.allSettled` all feeds, honors throttle/broken,
  conditional GET, marks `broken` at ≥5 failures or on 404/410, caches `_feedCache`, kicks
  `autoDownloadQueue`.
- **Discovery** (`discoverFeedUrl`): try URL as-is, else fetch+scan for `<link rss>`, else guess
  Substack/Medium/YouTube + generic `/feed`,`/rss`,`/atom.xml` etc.
- **Auto-download** (`autoDownloadQueue`): ⚠ **no Wi-Fi/metered detection**; only brake is 80%
  quota. Per feed, first `keep` (default 5) audio items, skip if cached, else fetch+store blob.
  `episodeIdFor` = non-crypto djb2 hash (⚠ collision risk).

---

## 6. Learning loop (extracts, SM-2, comprehension)

### 6.1 Extract capture
`saveExtractRecord(kind)`: passage (kind `passage`, ±15 words, **E**/swipe-up) or vocab (kind
`word`, ±6 words, **V**). Window skips segment indices; records `focusRelIdx`, `context`,
`focusWord`. Record:
```
{id:"ext::"+pid+"::"+ts+"::"+rand, profileIdx:pid, kind, bookId, bookTitle, wordIdx,
 focusIdx:focusRelIdx, focusWord, context, chapterTitle, createdAt,
 EF:2.5, reps:0, interval:0, nextReview:Date.now(), history:[]}
```
A third kind `cloze` is generated only in the review screen via LLM (`clozePrompt`/`clozeAnswer`).

### 6.2 SM-2 (`sm2(rec, grade)`) — faithful to PRD §6.2
```
EF=rec.EF||2.5; reps=rec.reps||0; interval=rec.interval||0
if grade>=3:  reps==0→interval=1; reps==1→interval=6; else interval=round(interval*EF) [OLD EF]; reps++
else:         reps=0; interval=1
EF = max(1.3, EF + (0.1 - (5-grade)*(0.08 + (5-grade)*0.02)))
nextReview = Date.now() + interval*86400000      // ⚠ rolling-24h, not calendar-day (PRD wants today+interval)
```
Pure function; caller does `Object.assign(rec,next)` + persist. Grading scale exposed:
**Again=1, Hard=3, Good=4, Easy=5** (grades 0 and 2 never produced). EF/interval ladder match
the canonical Woźniak algorithm — **the SM-2 math is correct.** ⚠ Failed cards get interval=1 →
disappear for 24h (no sub-day relearning steps).

### 6.3 Queue & review screen
`dbListDueExtracts` = profile extracts with `nextReview <= now`, sorted ascending (oldest-due
first); drives the queue and the home badge. `enterReview` snapshots queue, `reviewPos=0`,
`reviewTotal=len`. Card body by kind (cloze reveal / word / passage). Grade buttons show live
preview intervals via `sm2(r,g)`. Grading advances `reviewPos`; Skip/Delete also advance
(⚠ `reviewTotal` not decremented → "X of N" overcounts). Stats: retention = % grades ≥3,
streak = consecutive calendar days. Anki CSV export.

### 6.4 Comprehension check
After `stop()`, if `aiEnabled()` and ≥100 words read this session, offers a banner (auto-hides
8 s). On click: build passage from last ≤200 words, one LLM call to generate a question, second
LLM call to evaluate (`PASS:`/`REVIEW:`). ⚠ **Result is never persisted** — informational only,
not fed into scheduling.

---

## 7. AI providers & on-device ML

### 7.1 Cloud LLM abstraction
- Config `p.prefs.ai = {provider, key, baseUrl, model}` in **plaintext localStorage**.
- Two code paths: `anthropic` (default `claude-sonnet-4-5` — ⚠ stale; current is
  `claude-sonnet-4-6` / Opus `claude-opus-4-8`) and `openai` (covers Ollama/LM Studio/OpenRouter,
  default `llama3.1` @ `localhost:11434/v1`).
- `aiEnabled()`: anthropic ⇒ truthy key; openai ⇒ truthy baseUrl.
- `callLLM({system,user,maxTokens=400})`:
  - Anthropic → `POST {baseUrl}/v1/messages`, headers `x-api-key`, `anthropic-version:
    2023-06-01`, **`anthropic-dangerous-direct-browser-access: true`** (⚠ raw key sent from
    browser). Concatenates `content[].type==="text"`.
  - OpenAI → `POST {baseUrl}/chat/completions`, optional `Authorization: Bearer`.
- Callers (all egress user/document text): `aiExplain` (review card define/paraphrase),
  comprehension check (2 calls), `generateContent` (topic → whole book).

### 7.2 transformers.js shared loader
`loadTransformersMod()` — memoized singleton, dynamic-imports
`@xenova/transformers@2.17.2` (30 s timeout), sets `allowLocalModels=false`,
`useBrowserCache=true`, `wasm.numThreads=1`. **WASM-only, no WebGPU anywhere.**
`confirmModelDownload(key,label)` — per-profile sticky consent in `prefs.modelConsent`,
metered-aware (reads `navigator.connection`), shows size from `MODEL_SIZES_MB`. ⚠ **Only NLLB &
SpeechT5 are gated**; Whisper (~40 MB) and Kokoro (~86 MB) download with no consent.
`makeModelProgressTracker` — per-file progress + stall watchdog (rejects if no progress for N ms).

### 7.3 Models
| Feature | Task | Model id | Size | Consent? |
|---|---|---|---|---|
| Translation | `translation` | `Xenova/nllb-200-distilled-600M` | ~612 MB | ✅ |
| Voice clone | `text-to-speech` | `Xenova/speecht5_tts` (+CMU ARCTIC x-vectors) | ~200 MB | ✅ |
| Read-aloud | kokoro-js | `onnx-community/Kokoro-82M-v1.0-ONNX` | ~86 MB | ❌ |
| Transcription | `automatic-speech-recognition` | `Xenova/whisper-tiny.en` | ~40 MB | ❌ |

- NLLB and SpeechT5 **null each other's pipeline** before loading (iOS ~1 GB tab budget). ⚠ No
  actual `dispose()` — bare reference drop only.
- `translateText(text,src,tgt)` → `pipe(text,{src_lang,tgt_lang,max_length:512})`, cached in
  `doc.translations[tgt][bi]` + mirrored to book record.
- `synthesizeSpeech` → sentence-chunk ≤180 chars, concat Float32 + 0.25 s silence → 16-bit PCM
  WAV. Cloned WAV cached `clone:${bookId}:${preset}`.
- Kokoro `speakBlocksFromIdx` → per-block `tts.generate`, fresh `Audio`, word highlight
  interpolated over duration via rAF.
- Whisper `transcribeAudioFile` → `transcriber(audio,{chunk_length_s:30,stride_length_s:5,
  return_timestamps})`; `addAudioFile` parses transcript as a book, builds `wordTimings` if word
  chunks present. ⚠ Whisper re-imports transformers inline instead of reusing the shared loader.

### 7.4 Audio bar + sync
`showAudioBar(url,title,feedUrl)` — plays cached blob (offline) or streams (http→https upgrade
on secure pages). On `timeupdate`, if `doc.wordTimings`, `idxForTime` (binary search) locks the
reading cursor to audio. `buildTimingList` flattens Whisper chunks evenly across words → maps to
non-sentinel doc indices.

---

## 8. PWA shell, design system, service worker

### 8.1 Design tokens
`:root` holds a primitive palette (Hearth terracotta ramp, Linen neutral ramp, sage/red accents,
dark-mode primitives) + a semantic layer (`--oh-bg/surface/text-*/interactive/border/shadow`)
defined twice: light (`:root,[data-theme=light]`) and dark (`[data-theme=dark]`, shadows flipped
to inset). Third override `[data-contrast=high]` hard-codes black/white + loud focus ring.
Spacing xs/sm/md/lg/xl = 4/8/16/24/40; radii sm/md/lg/full. Fonts: Lora (heading/reading),
Nunito (UI), JetBrains Mono, OpenDyslexic (opt-in) — all CDN.

### 8.2 Theming
Per-profile `prefs.theme ∈ auto|light|dark`. Pre-paint bootstrap IIFE reads localStorage, sets
`data-theme` before paint (⚠ but does **not** update `theme-color` meta → brief light status bar
in dark mode). `applyTheme()` re-derives at runtime + sets `data-contrast`/`data-dyslexia` +
`theme-color`. OS-theme listener live-updates only in `auto`.

### 8.3 Responsive
Desktop-first, max-width containers (`.screen` 780px), centered body. Breakpoints
`max-width:560px` (library rows) and `max-width:480px` (phone layer: ≥44px touch targets, 2-col
src grid, full-width modals, 16px inputs). Safe-area via `@supports(env(safe-area-inset-*))`.
⚠ `user-scalable=no` blocks pinch-zoom; no `prefers-reduced-motion`.

### 8.4 Manifest & icons
Inline data-URI manifest: `{name, short_name:"Primer", start_url:".", display:"standalone",
background/theme_color:"#FBF8F4", icons:[single SVG, sizes:"any"]}`. All icons inline data-URI
SVG (no raster). Apple meta capable/title set.

### 8.5 Service worker (`sw.js`)
- `CACHE='ohprimer-v1'` (⚠ literal, **never bumped** despite the comment), `SHELL=['./']`.
- install → `addAll(['./'])` + `skipWaiting`. activate → purge non-matching caches +
  `clients.claim`.
- fetch → intercepts **only same-origin `navigate`** as stale-while-revalidate (serve cached
  `./`, refresh in background). **Everything else falls through uncached** — fonts, CDN scripts,
  HF model weights, RSS/Gutenberg/AI all go to default network.
- ⚠ **Consequence:** "fully offline-capable" (README) is false — only the HTML shell + already-
  downloaded IndexedDB content work offline; fonts and every model-backed feature need network on
  a cold launch. Returning users can run a release-old shell with no update path. No offline
  navigation fallback (`fetch` has no `.catch`).
- `online`/`offline` events fire toasts. `404.html` = meta-refresh to `./` (SPA catch-all);
  `.nojekyll` disables Jekyll on Pages.

---

## 9. Reconciliation with PRD — notable gaps

- **Privacy principle (PRD §2.4 "nothing leaves your device")** is contradicted by: cloud LLM
  egress of children's reading content with only an enable-flag; third-party CORS-proxy routing
  of every article/feed/podcast URL; plaintext API key + direct browser key transmission.
- **Offline durability (PRD §2.5)** is overstated — see §8.5.
- **Parent controls (PRD §8.3)** are present in shape but the PIN is plaintext + string-compared,
  providing no real gating.
- **SM-2 (PRD §6.2)** is implemented faithfully, but scheduling is rolling-24h rather than the
  calendar-day model the PRD and the streak logic assume, and there are no relearning steps.
- **Yoto / device integrations (PRD §7)** are not present in the audited code (roadmap-future).

See `ISSUES.md` for the ranked, line-cited defect catalog that a rebuild should treat as its
regression checklist.
