# The OpenHearth Primer
## Product Requirements Document v1.0
### "A reading engine for the whole family"

*Est. MMXXVI · MIT License · FLOSS*

---

## 1. Vision

The OpenHearth Primer is a family reading and learning system that combines speed-reading technology (RSVP with parafoveal preview), a content pipeline for surfacing high-quality reading material from diverse sources, and Woźniak-style incremental reading with spaced repetition — all wrapped in a warm, beautiful interface that respects families, their values, their privacy, and their time.

It is not an app that replaces reading. It is a tool that makes reading more effective, more accessible, and more shared across a household — from the 7-year-old learning chapter books to the parent staying current on technical blogs.

**Core metaphor**: A primer (first reading book) + a hearth (where the family gathers). The technology is advanced but the purpose is timeless.

**Design DNA**: Old aristocracy meets quiet sci-fi. Stephenson's Young Lady's Illustrated Primer — an AI-adaptive book that teaches a child to read, think, and navigate the world, calibrated to her level. We're building a version of that.

---

## 2. Principles

### 2.1 Family-First
- Every feature asks: "Does this serve the family as a unit?"
- Parent visibility into children's reading without surveillance
- Shared library, individual progress
- Age-appropriate content filtering is non-negotiable — this is the product's immune system

### 2.2 Honest Pedagogy
- No gamification-for-engagement tricks
- Speed claims are grounded in research (300-400 WPM for comprehension, not marketing 1000 WPM)
- Comprehension > speed. Always.
- Woźniak's incremental reading is the pedagogical backbone: import → skim → extract → review → retain

### 2.3 Modularity
- Every feature works independently. Use RSVP without the queue. Use the queue without spaced rep. Use Gutenberg search without the reader. Use Yoto integration without anything else.
- Data is modular too: bring your own books, use just the search, export everything
- No feature should require another feature

### 2.4 Privacy & Sovereignty
- All data stays on-device by default (localStorage / IndexedDB)
- No accounts required for core functionality
- API keys (Anthropic, Yoto) are user-provided and stored locally
- Whisper transcription runs client-side via WASM — audio never leaves the device
- Optional sync is opt-in and encrypted (future phase)

### 2.5 Simplicity & Durability
- Two-file architecture: `index.html` (all app logic) + `sw.js` (offline cache). No build step.
- Hosted as a static, installable PWA (GitHub Pages / Cloudflare Pages) via service worker
- Browser storage (IndexedDB + localStorage) gives each visitor their own sandboxed state — no accounts needed
- When a backend becomes necessary, keep it minimal (one serverless function, one DB)
- MIT license. Anyone can fork, host, modify
- The most durable software doesn't need maintenance

---

## 3. Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                   THE OPENHEARTH PRIMER                  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   CONTENT    │  │   READING   │  │  RETENTION  │     │
│  │   PIPELINE   │→→│   ENGINE    │→→│   ENGINE    │     │
│  │             │  │             │  │             │     │
│  │ · Gutenberg │  │ · RSVP      │  │ · Extracts  │     │
│  │ · Podcasts  │  │ · Parafoveal│  │ · SM-2 SRS  │     │
│  │ · RSS/Blogs │  │ · Classic   │  │ · Vocab     │     │
│  │ · AI Gen    │  │ · Scroll    │  │ · Cloze     │     │
│  │ · Paste/    │  │             │  │             │     │
│  │   Upload    │  │             │  │             │     │
│  │ · Whisper   │  │             │  │             │     │
│  │   (audio→   │  │             │  │             │     │
│  │    text)    │  │             │  │             │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
│         │                │                │             │
│  ┌──────┴────────────────┴────────────────┴──────┐     │
│  │              FAMILY DATA LAYER                 │     │
│  │  Profiles · Queue · Bookmarks · Stats · Prefs  │     │
│  │         localStorage / IndexedDB               │     │
│  └────────────────────┬──────────────────────────┘     │
│                       │                                 │
│  ┌────────────────────┴──────────────────────────┐     │
│  │           INTEGRATIONS (optional)              │     │
│  │  · Yoto Player (audio cards for kids)          │     │
│  │  · Anthropic API (content gen, comprehension)  │     │
│  │  · TTS (ElevenLabs via Yoto, or Web Speech)    │     │
│  │  · Translation (Anthropic API)                 │     │
│  └────────────────────────────────────────────────┘     │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  SCREENS: Home → Library → Reader → Review → Settings    │
└──────────────────────────────────────────────────────────┘
```

---

## 4. Content Pipeline (Core Innovation)

The #1 job of the Primer is **surfacing great things to read**. The reading engine is the delivery mechanism. The content pipeline is the product.

### 4.1 Source: Project Gutenberg (Free Classics)
- **API**: Gutendex (gutendex.com) — free, no auth, JSON REST
- **Search**: By title, author, topic, language, bookshelf
- **Text fetch**: `https://www.gutenberg.org/cache/epub/{id}/pg{id}.txt`
- **Age filtering**: Use bookshelf metadata. "Children's Literature", "Children's Fiction" for child profiles. Flag "Horror", "Erotica" subjects.
- **Strip Gutenberg headers/footers** (delimited by `*** START OF` / `*** END OF`)
- **Storage**: Truncate to ~100K words per book for localStorage; IndexedDB for full texts later
- **Curated lists**: Pre-built lists by age/interest ("Great Books for 8-year-olds", "CS Classics", "Stoic Philosophy Starter Pack"). These are just Gutenberg ID arrays, tiny to ship.

### 4.2 Source: Podcast Transcription (Whisper)
- **Runtime**: whisper.cpp compiled to WebAssembly, runs entirely in browser
- **Models**: tiny-en-q5_1 (31 MB) for fast/mobile, base-en-q5_1 (57 MB) for accuracy
- **Workflow**: User provides audio file (mp3/wav/m4a) → Whisper transcribes → text enters queue
- **Use case**: Dad listens to a great podcast episode. Wants to speed-read the transcript and extract key ideas. Or: convert podcast into reading material for the whole family.
- **Limitation**: WASM Whisper is CPU-heavy. Desktop-class hardware recommended. Show progress bar and "this may take a few minutes" messaging. For mobile, offer server-side transcription option (future, requires backend).
- **Alternative path**: Many podcasts publish transcripts. Include a "paste transcript URL" option that fetches and cleans web transcripts before falling back to local Whisper.
- **Privacy**: Audio never leaves device. This is a feature, not a limitation.

### 4.3 Source: RSS / Blogs / Substacks
- **Challenge**: CORS blocks most RSS feeds from browser-side fetch
- **Solutions** (in preference order):
  1. Use a CORS proxy (allorigins.win, cors-anywhere, or self-hosted)
  2. User pastes article text directly (always works, zero dependencies)
  3. Browser extension that extracts article text (future)
  4. Server-side RSS fetcher (future, when backend exists)
- **RSS parsing**: Simple XML parsing of RSS/Atom feeds for title, link, content
- **Article extraction**: Strip HTML to clean text. Use Readability-style algorithm or simple `textContent` extraction.
- **Subscription management**: User adds RSS URLs. Primer checks periodically (when app is open) for new items. New items appear in "Inbox" section of Library.
- **No automated fetching without user action** — respect bandwidth and privacy

### 4.4 Source: AI-Generated Content (Anthropic API)
- **Requires**: User-provided Anthropic API key (stored locally, never transmitted elsewhere)
- **Use cases**:
  - Generate age-appropriate educational content on any topic ("Write a 500-word passage about volcanoes for a 9-year-old at a 4th grade reading level")
  - Generate challenge vocabulary passages for readers training up
  - Generate comprehension questions for any passage in the queue
  - Summarize long texts for preview before committing to full read
  - Translation (see §4.6)
- **Age calibration**: Prompt includes reader's age level. Content is generated to match.
- **Cost**: ~$0.002 per generation using Haiku. A heavy day of 20 generations = $0.04. Negligible.
- **Prompt templates**: Ship pre-built prompt templates for common use cases. User can also freeform.
- **Model**: claude-sonnet-4-20250514 for generation, claude-haiku-4-5-20251001 for comprehension checks
- **Safety**: System prompt includes hard constraints on age-appropriate content. No violence beyond age-appropriate narrative conflict. No sexual content. No profanity in children's content. These constraints are NOT the same as sanitizing reality — historical texts about wars, moral complexity, and hard questions are appropriate for teen+ readers.

### 4.5 Source: Manual Input
- **Paste text**: Always available, always works, zero dependencies
- **Upload files**: .epub, .txt, .md, .html
- **Epub parsing**: JSZip (loaded on demand) → parse OPF → read spine → extract text from XHTML content docs
- **This is the escape valve**: No matter what else breaks, users can always paste or upload

### 4.6 Translation Layer (Anthropic API)
- **Use case**: Family learning a second language. Read a French article with inline translation help. Or: translate a classic text for a younger reader's comprehension level.
- **Modes**:
  1. **Full translation**: Translate entire text into target language, add to queue as separate item
  2. **Parallel text**: Side-by-side original + translation (reading mode variant, not RSVP)
  3. **Vocabulary gloss**: During RSVP reading, long-press a word to get translation + definition
  4. **Simplification**: "Translate" a text into simpler English for younger readers (not a different language, just a lower reading level)
- **Implementation**: All via Anthropic API calls. Translation is one of Claude's strongest capabilities.
- **Offline**: Cache translations locally. Once translated, no API needed to re-read.

---

## 5. Reading Engine

### 5.1 Modes

**Classic RSVP**: Single word at a time, ORP (Optimal Recognition Point) highlighted, anchored to center guide. The proven baseline.

**Parafoveal Ticker**: Words displayed in a horizontal strip with Gaussian opacity falloff simulating retinal acuity. Center word full brightness with ORP highlight. Neighboring words fade by `exp(-d²/2σ²)`. Peripheral words get subtle blur. σ and window size are adjustable.
- σ controls "spotlight width" — low σ = tight focus, high σ = wide context
- Open research question: should σ auto-adjust inversely with WPM?

**Scroll Mode** (new): For content that doesn't suit word-at-a-time presentation (tables, code, poetry). Simple auto-scroll at controlled pace. Useful as a "normal reading with pace control" mode.

### 5.2 Pacing
- WPM range: 100-800, adjustable in steps of 25
- Punctuation-aware delays: period (2.8x), semicolon/colon (2.0x), comma (1.5x), dash (1.3x), long words (1.3x)
- Paragraph breaks: configurable pause (default 3x)
- Chapter detection: pause and show chapter title before continuing

### 5.3 Extract Feature
- During reading, user presses "Extract" button (or keyboard shortcut 'e')
- Saves current word ±15 words of context
- Extract is tagged with source title and position
- Extract enters the Retention Engine for SM-2 scheduling
- This is the bridge between reading and retention — the Woźniak pipeline

### 5.4 Position Bookmarking
- Auto-save position in queue item on every pause/stop
- Resume from exact word when returning to item
- Show "last read" timestamp and progress percentage in queue

---

## 6. Retention Engine (Incremental Reading)

### 6.1 Woźniak's Pipeline, Adapted
Woźniak's incremental reading in SuperMemo follows: Import → Prioritize → Read in portions → Extract key passages → Convert extracts to cloze deletions → Review via spaced repetition.

Our adaptation:
1. **Import**: Content enters queue from any source (§4)
2. **Prioritize**: User sets priority (1-5 stars or drag to reorder). System surfaces highest-priority unread material first.
3. **Read in portions**: User reads for N minutes or N words per session. Position saved. Remaining text rescheduled.
4. **Extract**: User marks key passages during reading (§5.3)
5. **Review**: Extracts resurface on SM-2 schedule. User rates recall quality.
6. **Optional — Cloze deletion**: AI generates fill-in-the-blank questions from extracts (requires Anthropic API key). These become their own review items.
7. **Optional — Vocabulary**: Words the reader doesn't know get flagged, defined (via API or built-in dictionary), and enter SRS review.

### 6.2 SM-2 Algorithm
Standard Woźniak SM-2 implementation:

```
function sm2(item, grade):
    // grade: 0=blackout, 1=wrong but familiar, 2=wrong but easy,
    //        3=correct with effort, 4=correct, 5=perfect
    if grade >= 3:  // correct
        if reps == 0: interval = 1 day
        elif reps == 1: interval = 6 days
        else: interval = round(interval * EF)
        reps += 1
    else:  // incorrect
        reps = 0
        interval = 1 day

    EF = EF + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))
    EF = max(1.3, EF)

    nextReview = today + interval
    return {interval, reps, EF, nextReview}
```

Initial EF = 2.5 for all new items.

### 6.3 Review Interface
- Show extract text
- User tries to recall context/meaning/significance
- Rate: Again (grade 1) / Hard (grade 3) / Good (grade 4) / Easy (grade 5)
- Show source and position for context
- Badge on home screen showing due review count
- "5 minutes of review" is a natural session length

### 6.4 Queue Scheduling
The reading queue resurfaces items using a simplified priority system:
- Items are sorted by: (priority * recency_boost * progress_boost)
- `recency_boost`: items untouched for longer get a gentle boost (prevent stagnation)
- `progress_boost`: items >50% read get a small boost (momentum/completion incentive)
- User can always override and pick any item manually
- System suggestions are *suggestions*, not mandates. User agency is sacred.

---

## 7. Device Integrations

### 7.1 Yoto Player Integration
Yoto is a screen-free audio player for kids that uses physical NFC cards. Families in the homeschool community use them heavily. The Primer can push content to Yoto as audio cards.

**API access**: Yoto has an official developer API (yoto.dev). Requires client ID via OAuth device flow.

**Pipeline**:
1. User selects a reading queue item (or AI-generated content)
2. "Send to Yoto" action
3. Text is converted to audio:
   - Option A: Yoto's ElevenLabs TTS endpoint (type: "elevenlabs" in track, text in trackUrl) — Yoto handles synthesis
   - Option B: Web Speech API for local TTS → upload MP3 via Yoto upload endpoint
   - Option C: User records themselves reading it (for parent-read stories) → upload
4. Content becomes a Yoto playlist, linkable to a Make Your Own card
5. Kid inserts card → hears the content

**Yoto constraints**:
- 100 tracks per card, 500 MB / 5 hours max per card
- Content must be appropriate for under-13 (Yoto's policy)
- No copyrighted content without permission
- Developer guidelines require warm, family-friendly UX language

**Use cases**:
- AI generates a bedtime story about trains for the 5-year-old → push to Yoto card
- Dad transcribes a podcast, extracts the best segment → push to Yoto for the 12-year-old
- Mom records herself reading a chapter of a Gutenberg classic → push to Yoto
- Weekly "Primer picks" — curated content auto-pushed to Yoto each week

**Authentication**: OAuth device code flow. User initiates in Primer, confirms on Yoto app. Token stored locally, refreshed automatically.

### 7.2 Future Device Integrations (Research Phase)
- **Tonie Box**: Similar NFC audio player. No public API yet, but community reverse-engineering exists. Monitor.
- **Kindle / e-readers**: Export reading queue items as .epub for sideloading. Simple, no API needed.
- **Home Assistant**: Expose reading stats as sensors. Trigger automations (e.g., "when bedtime reading starts, dim lights"). The Yoto HA integration already exists as a model.

---

## 8. Age & Safety Framework

### 8.1 Profile Age Levels
Each profile has an age level: **Child** (under 10), **Teen** (10-16), **Adult** (17+). This is set by whoever creates the profile (presumably a parent for children).

### 8.2 Content Filtering by Source

| Source | Child | Teen | Adult |
|--------|-------|------|-------|
| Gutenberg | Children's bookshelves only. Flag non-children's content. | All except flagged subjects (Erotica, etc.) | Everything |
| AI Generated | Hard constraints in system prompt: no violence beyond fairy-tale level, no sexual content, simple vocabulary, positive themes | Allow moral complexity, historical violence, age-appropriate themes | Full range |
| Podcasts | Parent must approve transcripts before they enter child's queue | User discretion | User discretion |
| RSS/Blogs | Parent must approve | User discretion | User discretion |
| Paste/Upload | No filtering (user-provided content is trusted) | No filtering | No filtering |

### 8.3 Parent Controls
- Parent profiles can see children's reading queues and stats
- Parent can approve/reject items in children's queues
- Parent can set per-child WPM limits (prevent kids from cranking to 800 and "reading" without comprehension)
- No content enters a child's queue from external sources without parent approval (configurable: can be relaxed for Gutenberg children's books)

### 8.4 What We Don't Do
- We don't track or report family data to anyone. Ever.
- We don't use content filtering as a substitute for parental involvement
- We don't sanitize classic literature of difficult themes — we surface them at age-appropriate times
- We don't algorithmically recommend content to children without parent visibility
- We don't prevent adults from reading anything they choose

---

## 9. Data Model

```
OpenHearthState = {
  version: number,            // schema version for migrations
  profiles: Profile[],
  activeProfile: number,      // index
  settings: {
    anthropicKey?: string,    // encrypted or at least not plaintext
    yotoClientId?: string,
    yotoToken?: string,
    whisperModel: "tiny-en-q5_1" | "base-en-q5_1",
    corsProxy?: string,       // user-provided CORS proxy URL
  }
}

Profile = {
  id: string,                 // uuid
  name: string,
  age: "child" | "teen" | "adult",
  avatar?: string,            // initial letter + color, or emoji
  parentOf?: string[],        // profile IDs this person can manage
  stats: {
    wordsRead: number,
    minutesRead: number,
    sessions: number,
    extractsMade: number,
    reviewsCompleted: number,
    streakDays: number,       // consecutive days with reading activity
    history: DayStat[],       // last 90 days of {date, words, minutes}
  },
  prefs: {
    wpm: number,              // 100-800
    mode: "classic" | "ticker" | "scroll",
    fSize: number,            // font size in px
    sigma: number,            // Gaussian spread for ticker mode
    winSize: number,          // ticker window size
    theme: "dark" | "warm" | "light",
    dailyGoalMinutes?: number,
    maxWpm?: number,          // parent-set ceiling for child profiles
  },
  queue: QueueItem[],
  extracts: Extract[],
  vocab: VocabItem[],
  rssFeeds?: RSSFeed[],
}

QueueItem = {
  id: string,                 // uuid
  title: string,
  author?: string,
  source: "gutenberg" | "paste" | "upload" | "ai" | "rss" | "whisper",
  sourceId?: string,          // Gutenberg ID, RSS URL, etc.
  text: string,               // the actual content
  wordCount: number,
  position: number,           // word index of reading progress
  priority: number,           // 1-5
  addedAt: string,            // ISO date
  lastReadAt?: string,        // ISO date
  language?: string,          // ISO 639-1
  approved: boolean,          // for child profiles: parent-approved?
  tags?: string[],            // user-defined tags
}

Extract = {
  id: string,
  text: string,               // the extracted passage
  sourceTitle: string,
  sourcePosition: number,     // word index in source
  // SM-2 fields
  ef: number,                 // easiness factor, starts at 2.5
  interval: number,           // days until next review
  reps: number,               // consecutive correct recalls
  nextReview: string,         // ISO date
  createdAt: string,
  lastReviewAt?: string,
}

VocabItem = {
  id: string,
  word: string,
  definition?: string,
  context: string,            // sentence where encountered
  sourceTitle: string,
  // SM-2 fields (same as Extract)
  ef: number,
  interval: number,
  reps: number,
  nextReview: string,
}

RSSFeed = {
  url: string,
  title: string,
  lastChecked?: string,
  autoApprove: boolean,       // for adult profiles; always false for children
}

DayStat = {
  date: string,               // YYYY-MM-DD
  wordsRead: number,
  minutesRead: number,
}
```

### 9.1 Storage Strategy
- **Current**: localStorage for profiles/prefs/state. IndexedDB (DB_VERSION=2) for books and extracts with `byProfile`, `byBook`, `byNextReview`, `byLastRead` indexes. IDB has effectively unlimited storage with user permission.
- **Hosting model**: Static files on a static host (GitHub Pages / Cloudflare Pages). Each visitor's browser is the database — zero server-side state.
- **Connectivity model**: Content pipeline (RSS, Gutenberg, AI, URL fetch) needs network. Reading and spaced repetition review work fully offline. Service worker caches the app shell for instant offline launch.
- **Future**: Optional cloud sync (encrypted, user-controlled). Supabase or Turso. Only needed when family members use different devices.

### 9.2 Export / Backup
- "Export All Data" button produces a JSON file
- "Import Data" restores from JSON
- Extracts can be exported as Anki-compatible CSV
- Queue items can be exported as plain text or epub
- Your data is your data. Always.

---

## 10. Screens & UX Flow

### 10.1 Home Screen
```
        The OpenHearth Primer
   "A reading engine for the whole family"
              ◆ Est. MMXXVI ◆

        ─── WHO READS TONIGHT ───

   ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐
   │  D   │  │  M   │  │  E   │  │  +   │
   │ Dad  │  │ Mom  │  │ Emma │  │ Add  │
   │312wpm│  │280wpm│  │new   │  │      │
   └──────┘  └──────┘  └──────┘  └──────┘

   [ 📖 Read ]  [ 📚 Library ]  [ 🧠 Review (3) ]

                 ─── TODAY ───
          Words read: 2,340 · 12 min
```

### 10.2 Library Screen
```
  ◂ Hearth                        Emma (child)

  ─────────── LIBRARY ───────────

  [ My Queue ] [ Classics ] [ Discover ] [ Add ]

  ── My Queue ──────────────────────
  ┌─────────────────────────────────┐
  │ ★★★★☆  Alice in Wonderland      │
  │ ████████░░ 78% · Last: Today    │
  │ [Read] [→Yoto]                  │
  ├─────────────────────────────────┤
  │ ★★★☆☆  Volcanoes (AI generated) │
  │ ░░░░░░░░░░ 0% · New             │
  │ [Read] [→Yoto]                  │
  └─────────────────────────────────┘

  ── Classics ──────────────────────
  Search: [fairy tales        ] [🔍]
  Filter: [Children's ▾]

  ── Discover ──────────────────────
  [Generate on topic...]
  [Transcribe podcast audio...]
  [Add RSS feed...]

  ── Add ───────────────────────────
  [Paste Text] [Upload EPUB/TXT]
```

### 10.3 Reader Screen
(Enhanced version of existing v1 artifact — same RSVP engine, same modes, plus:)
- Header shows queue item title + progress
- "Extract" button (📌) saves current ±15 words
- Auto-save position on pause/stop
- "Back to Queue" saves and returns to library
- Comprehension check prompt after completing a passage (if API key configured)

### 10.4 Review Screen
```
  ◂ Hearth                        Dad

  ─────────── REVIEW ───────────
  3 extracts due · 2 vocab due

  ┌─────────────────────────────────┐
  │                                 │
  │  "the spacing effect —          │
  │   the phenomenon whereby        │
  │   learning is greater when      │
  │   studying is spread out        │
  │   over time"                    │
  │                                 │
  │  from: Incremental Reading      │
  │        (Wikipedia)              │
  │                                 │
  │ [Again] [Hard]  [Good] [Easy]   │
  └─────────────────────────────────┘

  Today: 1 of 5 reviewed
  Streak: 14 days 🔥
```

### 10.5 Settings Screen
- Anthropic API key (for AI content gen, comprehension, translation)
- Yoto connection (OAuth device flow)
- Whisper model selection
- CORS proxy URL (for RSS feeds)
- Data export / import / reset
- About / license / links

---

## 11. Technical Stack

### 11.1 Current (Two-File PWA)
- **Runtime**: Vanilla HTML/CSS/JS, no framework, no build step
- **Files**: `index.html` (all app logic, ~3700 lines) + `sw.js` (offline cache, ~25 lines)
- **Storage**: localStorage (profiles/prefs) + IndexedDB (books, extracts, review cards)
- **External loads** (on demand, not bundled):
  - JSZip (CDN) — only when opening .epub files
  - Google Fonts — Lora, Nunito, JetBrains Mono
- **APIs consumed** (user-configured):
  - Gutendex (gutendex.com) — free, no auth
  - Gutenberg text files (gutenberg.org)
  - Anthropic Messages API (user's key, direct browser access header)
  - OpenAI-compatible endpoints (local Ollama, etc.)
  - allorigins.win CORS proxy (fallback for RSS feeds and article fetch)
- **PWA**: Inline manifest (data URI), service worker for cache-first offline shell
- **Hosting**: GitHub Pages / Cloudflare Pages (free tier, static)

### 11.2 Future (With Backend)
- One Cloudflare Worker or Vercel serverless function for:
  - API key proxying (so Anthropic key isn't in client)
  - RSS feed fetching (bypasses CORS without third-party proxy)
  - Optional: Whisper API for mobile users (server-side transcription)
- D1 / Turso / Supabase for cross-device sync
- Still a static frontend + thin backend. No monolith.

---

## 12. Phased Roadmap

### Phase 0: Foundation (DONE)
- [x] RSVP reader with ORP highlighting
- [x] Parafoveal ticker mode with Gaussian opacity
- [x] Epub and text file loading
- [x] Paste text input
- [x] Multiple profiles with per-person settings
- [x] Stable profile PIDs (word-combo format: adjective-noun-NN)
- [x] Per-profile reading stats (words, minutes, avg WPM, sessions)
- [x] Keyboard + touch controls
- [x] Diamond Age aesthetic (warm, copper, elegant)
- [x] Single HTML file, zero build step

### Phase 1: Content Pipeline (DONE)
- [x] Reading queue with priority, bookmarks, position tracking (IndexedDB)
- [x] Gutenberg search + text fetch + auto-strip headers
- [x] Scroll reading mode (for content that doesn't suit RSVP)
- [x] Paste/upload moves items into library with persistence
- [x] RSS/Atom feed subscriptions with CORS proxy fallback
- [x] URL article loading (fetch + extract readable text)
- [ ] Age-filtered content (children's bookshelves for child profiles)
- [ ] Curated starter lists (by age/interest)
- [ ] "Send to Yoto" action (basic: ElevenLabs TTS via Yoto API)

### Phase 2: Retention Engine (DONE)
- [x] Extract feature during reading (keyboard shortcut 'e')
- [x] SM-2 spaced repetition for extracts
- [x] Review screen with Again/Hard/Good/Easy ratings
- [x] Due item count badge on home screen
- [x] Vocabulary flagging during reading ('v' shortcut)
- [x] Export extracts as Anki CSV (passage, word, and cloze types)
- [ ] Basic stats: review streak, items due, retention rate

### Phase 3: AI Integration (DONE)
- [x] AI provider configuration (Anthropic + OpenAI-compatible endpoints)
- [x] AI content generation (topic + reading level + length → reading material)
- [x] Comprehension check after reading passages (generate question → evaluate answer)
- [x] Cloze deletion generation from extracts (AI-powered fill-in-blank)
- [ ] Translation: full text, parallel text, vocabulary gloss
- [ ] Simplification ("translate" to lower reading level)
- [ ] Adaptive WPM (auto-adjust speed based on comprehension scores)

### Phase 3.5: Mobile UX & PWA (IN PROGRESS)
- [x] Custom modal system (confirmAction, askText — iOS PWA compatible)
- [ ] Touch gestures (swipe left/right for navigation, swipe up to extract)
- [ ] Mobile-optimized touch targets (44px minimum)
- [ ] Safe area insets for notch/Dynamic Island devices
- [ ] Responsive source row / modal layout for narrow screens
- [ ] PWA manifest (inline data URI, SVG icon)
- [ ] Service worker for offline app shell caching (sw.js — the only second file)
- [ ] Offline-aware UI (graceful degradation for network features)

### Phase 4: Audio & Transcription
- [ ] Whisper WASM integration for podcast transcription
- [ ] Audio file upload → transcribe → add to queue
- [ ] Podcast RSS support (fetch episodes, transcribe on demand)
- [ ] Enhanced Yoto integration: custom card playlists, chapter splits
- [ ] Web Speech API TTS for read-aloud mode
- [ ] Parent recording upload → Yoto card (record yourself reading)

### Phase 5: Polish & Scale
- [ ] Cross-device sync (optional, encrypted)
- [ ] Parent dashboard (children's progress, approval queue)
- [ ] Theming expansion (high contrast, dyslexia font option)
- [ ] Accessibility (screen reader compat)
- [ ] Data import from JSON backup
- [ ] Community curated reading lists (shared JSON files)
- [ ] Wake lock API (prevent screen dimming during reading)

---

## 13. Open Questions

### Design
- **σ auto-adjustment**: Should the Gaussian spread in ticker mode automatically narrow as WPM increases? Theoretically sound (less parafoveal processing time at higher speeds), but might be disorienting. Needs user testing.
- **Queue scheduling algorithm**: How aggressive should the system be about resurfacing partially-read items? SuperMemo is aggressive (it interrupts you). We might want to be gentler — suggest but don't insist.
- **Comprehension checks**: Should they be opt-in or default-on? For kids, probably default-on. For adults, probably opt-in. Make it a per-profile setting.

### Technical
- **CORS for RSS**: The CORS proxy situation is ugly. Best long-term answer is a thin backend. Short-term, user-provided proxy URL or paste-only workflow.
- **localStorage limits**: 5-10 MB varies by browser. Need graceful handling when full. IndexedDB migration (Phase 2) is important.
- **Whisper model size**: Even the tiny model is 31 MB. First load will be slow. Need good caching (IndexedDB) and progress indication. Consider offering a "download model" step in settings rather than surprising the user.
- **Yoto ElevenLabs endpoint**: Currently described as experimental ("we'll probably discontinue this at the end [of the developer challenge]"). Need a fallback plan. Web Speech API → MP3 encoding → Yoto upload endpoint is the robust alternative.

### Business
- **Monetization**: Free forever for core features. If we add server-side sync or transcription, $3-5/month per family. Homeschool families (target market) will pay this without blinking if the product is good.
- **Community**: Curated reading lists could be community-contributed (JSON files on GitHub). "OpenHearth Book Clubs" — families sharing their reading queues.
- **Name/domain**: Secure openhearth.org or openhearthprimer.com. GitHub org: openhearth.

---

## 14. Success Metrics

For a family using this tool successfully:
- Each family member has a profile and reads ≥3x/week
- Reading queue has ≥5 items at any time (content pipeline is working)
- Average reading speed has increased 15-30% over 3 months while comprehension holds
- Extracts are being made and reviewed (retention engine is used)
- At least one child is getting content pushed to a Yoto card weekly
- Parent can describe what their children are reading this month

None of these are telemetry targets — we don't collect data. They're "what does success look like" descriptions for the family using the product.

---

*The hearth is lit. The book is open. Begin.*

---

## Addendum — April 2026: Supabase Removed from Architecture

Supabase has been dropped from the OpenHearth architecture. References to "Supabase or Turso" and "D1 / Turso / Supabase" in the Phase 3 sync and tech stack sections reflect a design that is no longer the plan.

**What this means for Primer:**
- **Phases 1-2 (local storage, IndexedDB):** Completely unaffected. Ship as designed.
- **Phase 3 (optional cloud sync):** Will use a vendor-agnostic encrypted blob relay (Cloudflare R2 + Workers is the default candidate) rather than Supabase or Turso. The server stores and returns ciphertext — it never interprets the payload. Family members sharing across devices will use a seed-phrase-based shared-key scheme.

See `SPEC.md` for the current architecture.
