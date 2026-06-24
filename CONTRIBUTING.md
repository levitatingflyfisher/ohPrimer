# Contributing to OpenHearth Primer

Thank you for taking the time to contribute! This document explains how to report issues, suggest features, and submit code changes.

---

## Reporting Bugs

Before opening a new issue, search existing issues to avoid duplicates.

When filing a bug report, please include:
- Browser and version (Safari 17.4, Chrome 122, etc.)
- Operating system and version
- Steps to reproduce
- Expected behaviour vs. actual behaviour
- Console errors (open DevTools → Console)
- For model-loading issues: which model (Kokoro, Whisper, NLLB, SpeechT5), connection type, and how much had downloaded when it stalled

---

## Suggesting Features

Open an issue with the `enhancement` label. Describe the problem you are trying to solve rather than jumping straight to a solution — this keeps the conversation grounded in user value.

---

## Development Setup

Primer is intentionally toolchain-free: a single `index.html`, a service worker, and a few static files. No build step, no bundler, no `npm install`.

```bash
git clone <repo-url>
cd ohPrimer
# Serve over HTTP — service workers and IndexedDB won't work from a file:// URL
python3 -m http.server 8000
# or: npx serve .
```

Then open `http://localhost:8000` in any modern browser.

To test PWA install / service-worker offline behaviour, serve over HTTPS (e.g. `ngrok http 8000`) and install via your browser's PWA prompt.

---

## Code Style

The project ships as a single `index.html` containing inline HTML, CSS, and ES module JavaScript. Conventions:

- **Vanilla everything.** No frameworks, no transpilers. Modern browser features only (the audience is current Safari / Chrome / Edge).
- **One file, one app.** Resist the urge to split into modules — the single-file model is the product. Service worker (`sw.js`) is the one exception.
- **Comments explain *why*, not *what*.** Identifier names handle *what*.
- **No tracking, no analytics, no telemetry.** Ever. Architecturally enforced.
- **Pure-client.** No build-time secrets, no required server. Sync to a relay is opt-in and uses encrypted blobs only.
- **Models load lazily and consent-gated.** Anything over ~50 MB shows a confirmation prompt with a size estimate before download begins.

---

## Testing

Manual smoke tests before submitting a PR:

1. Load `index.html` over HTTP, open DevTools, confirm zero console errors.
2. Paste a paragraph, run all four reading modes (RSVP, paragraph, scroll, speak).
3. Subscribe to an RSS feed, confirm auto-download works.
4. If you touched translation/voice paths: verify the consent gate appears, then confirm download completes (or the 90-second stall watchdog fires).
5. Toggle airplane mode after first load — the app shell must still open and any previously-cached content must still read.
6. Bump `CACHE` in `sw.js` if you changed `index.html` so returning users pick up the new code.

---

## Pull Request Workflow

1. Fork the repository and create a feature branch from `master`:
   ```bash
   git checkout -b feat/my-feature
   ```
2. Make your changes, following the code style rules above.
3. Open a PR against the `master` branch with a clear description of what changed and why.
4. Link any related issues (`Closes #123`).

Commit message style follows the rest of the OpenHearth org: `feat(scope): summary`, `fix(scope): summary`, `refactor(scope): summary`, etc.

---

## Architecture Notes

Primer is a single-file Progressive Web App. The high-level shape:

- **`index.html`** — the entire app. HTML shell + inline CSS + ES module JavaScript. Models load lazily from Hugging Face's CDN via `@xenova/transformers` and cache in the browser forever after first download.
- **`sw.js`** — service worker. Cache-first for the navigation shell (so the app opens offline), network-first for everything else (RSS feeds, model files, fonts).
- **`404.html`** — single-page-app redirect fallback for GitHub Pages.
- **`.nojekyll`** — disables Jekyll preprocessing on GitHub Pages.

State lives in IndexedDB across three stores: `books`, `extracts`, `episodes`. Profiles are isolated by a `pid` prefix on every record.

The auth model follows the OpenHearth Ghost / Sync / Named tier convention. Ghost (zero-server) is the default; Sync (encrypted blob relay) is opt-in.

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

Questions? Open an issue on GitHub.
