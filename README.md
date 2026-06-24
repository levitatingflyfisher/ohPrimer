# OpenHearth Primer (beta)

A reading engine for the whole family.

Primer is a single-file Progressive Web App. RSVP speed-reading, an audio podcast player with on-device Whisper transcription, NLLB translation, and a Kokoro/SpeechT5 voice layer — everything runs in your browser, nothing leaves your device.

**Live beta:** open the deploy URL in any modern browser. No account, no install, no tracking.

---

## Install (optional — runs fine in a browser tab)

### iPhone / iPad
1. Open the URL in **Safari** (Chrome on iOS won't offer Add to Home Screen).
2. Tap **Share → Add to Home Screen**.
3. Launches full-screen, offline-capable, with its own home-screen icon.

### Android
1. Open the URL in **Chrome**.
2. Tap **⋮ → Install app** (or "Add to Home Screen" depending on Android version).

### Desktop (Chrome / Edge / Brave)
1. Click the install icon in the address bar (looks like a monitor with a down arrow), or
2. **⋮ → Install Primer…**

Firefox doesn't currently support PWA install but the site works fine in a tab.

---

## First-run notes

**Offline-after-first-use.** The service worker caches the app shell (network-first, so you always get the latest version when online), plus the web fonts and CDN libraries (stale-while-revalidate) after your first online visit. Each on-device model downloads from Hugging Face's CDN the first time you open that feature and caches in your browser — so a feature works offline only once you've used it online at least once:

| Feature | Model | First download |
|---|---|---|
| Speak mode (TTS) | Kokoro-82M | ~86 MB |
| Audio transcription | Whisper-tiny.en | ~40 MB |
| Translation | NLLB-200-distilled | ~600 MB ⚠ |
| Voice cloning | SpeechT5 | ~200 MB |

**Heads up:** Translation and voice cloning trigger a consent prompt before downloading. We detect cellular / Data-Saver and warn appropriately. Don't enable these on a metered connection unless you mean it.

---

## What works

- ✅ Paste text / load EPUB / fetch URL → RSVP, paragraph, scroll, or speak modes
- ✅ RSS + podcast feed subscriptions with auto-download (Wi-Fi recommended)
- ✅ Whisper transcription of podcast episodes with per-word timing sync
- ✅ NLLB translation strip (22 languages)
- ✅ SpeechT5 voice cloning (4 CMU ARCTIC preset voices)
- ✅ Per-block extracts → spaced repetition review queue
- ✅ Multi-profile (each family member has their own library + settings)
- ✅ Local AI integration (Ollama / LM Studio / Anthropic / OpenAI) for comprehension checks

## Known beta limitations

- **iOS Safari storage budget is ~1 GB per tab.** Heavy use (multiple translated books + voice clones + cached podcast episodes) can fill it. Settings → Storage shows current usage and lets you clear caches.
- **RSS imports use public CORS proxies** (`cors.eu.org`, `allorigins.win`, `codetabs.com`) as fallbacks when a feed's host doesn't allow direct fetch. These occasionally rate-limit or fail. We're working on alternatives.
- **First model download is large and unresumable across hard refresh** — if your network drops mid-download, partial bytes stay cached (browser handles range resumes) and tapping the feature button again continues from where it left off.
- **Voice cloning quality** is preset-only in this beta. The episode-extracted voice cloning pipeline (Phase 13b) is not yet wired up.

## Privacy

- No accounts, no tracking, no telemetry.
- Everything (extracts, libraries, translations, cloned audio) lives in your browser's IndexedDB.
- Model files come from Hugging Face's CDN; once cached, you're fully offline.
- Optional sync to a self-hosted blob relay (Settings → Sync). The relay sees only encrypted blobs.

## Running a downloaded copy

The whole app is one `index.html` file. Every dependency (transformers.js, JSZip, pdf.js, Tesseract, OpenDyslexic) is fetched on demand from public CDNs, so the HTML is genuinely self-contained at runtime. There are a few wrinkles around how browsers treat local files.

### Desktop

**Option A — clone or download ZIP (recommended).** `git clone` or **Code → Download ZIP** on the GitHub page. Then:

```bash
cd ohPrimer            # or wherever you extracted
python3 -m http.server 8000
# open http://localhost:8000 in any modern browser
```

Full functionality including the service-worker offline shell.

**Option B — single-file copy.** `curl -O https://raw.githubusercontent.com/<owner>/ohPrimer/master/index.html`, then run the same `python3 -m http.server` in that folder. Everything works *except* the SW offline shell (`sw.js` isn't there to register, app silently skips it).

**Option C — `file://` double-click.** Mostly broken in Chrome (ES module CORS and IndexedDB are restricted on `file://`); mostly works in Firefox. Not recommended; use Option A or B instead.

### Mobile

**Mobile has no easy local HTTP server**, so a downloaded copy can't be served the way a desktop can. Two paths:

1. **Use the live URL.** Open it in Safari (iOS) or Chrome (Android) and Add to Home Screen — see the Install section above. The PWA is fully offline-capable after first load, so this is functionally equivalent to a "downloaded" copy.
2. **Power-user Android only.** Install [Termux](https://termux.dev), `pkg install python`, `cd` to a folder with `index.html` + `sw.js`, run `python -m http.server 8000`, then open `http://localhost:8000` in Chrome.

If you want the cleanest tester flow on mobile: just send the live URL.

---

## Bug reports

File issues at the project repo. Useful info: browser + version, OS, what you were doing, console errors if any.

---

*Built with on-device ML — [@xenova/transformers](https://github.com/xenova/transformers.js) and [kokoro-js](https://www.npmjs.com/package/kokoro-js). No servers, no tracking. © OpenHearth, MIT licensed.*
