# On-device verification checklist

The automated suite (`npm test`) covers the pure logic (SSRF guard, import sanitizer, PIN
hashing, EPUB path resolution, charset decode). The items below are **browser/DOM/SW/audio
behavior that can't be tested headlessly** — please run them in a real browser (ideally one
desktop Chrome + one iOS Safari, since several fixes target iOS specifically).

Serve locally first: `python3 -m http.server` in the repo root, open `http://localhost:8000`.

## Reader playback & seeking (C7, C8, H9, H10)
- [ ] Play in classic mode; tap **back/forward**, the **tap zones**, **swipe**, and **arrow keys** while playing — cursor jumps and playback continues smoothly from the new spot, never double-advancing or "running away."
- [ ] Seek repeatedly and fast — no acceleration / ghost timers (C7/C8).
- [ ] Switch to **Speak** mode, start, then seek mid-sentence — speech restarts from the new position instead of snapping back (H9).
- [ ] Hit a **figure/quote sentinel**, open and close it — you advance one step past it; closing the **comprehension check** or **parent dashboard** does **not** move your position (H10).

## Position saving & profiles (H11, H12)
- [ ] Read into book A, go home, open book B, return to A — A resumes where you left off (not at 0) (H11).
- [ ] With a book open, switch to another **profile** — reader closes to home; the new profile doesn't show the old book; stats/storage reflect the new profile (H12).

## Consent gates (C3, C5, H18)
- [ ] Configure a **cloud** AI provider, trigger explain/comprehension — a consent dialog names the host before anything is sent; it doesn't ask again after you accept (C3).
- [ ] Configure a **local** Ollama/LM Studio URL — **no** egress prompt (on-device exempt).
- [ ] Subscribe to a feed/article that needs a proxy — proxy-consent prompt appears once; background refresh never prompts (C5).
- [ ] First **Speak** (Kokoro) and first **audio transcribe** (Whisper) — size/consent prompt appears (H18).

## Accessibility (H14, M28)
- [ ] Open Settings — focus lands inside; **Tab** stays trapped in the dialog; **Esc** closes it even from an input (H14).
- [ ] Screen reader announces dialogs as dialogs.
- [ ] **Pinch-zoom** works on mobile (M28). With OS "reduce motion" on, transitions are near-instant.

## Sync removal (C1, C2)
- [ ] Settings shows **local-only** backup (Export/Import JSON); no relay URL / seed / push-pull UI.
- [ ] Export, then Import on another browser/profile — library transfers; re-importing the same file doesn't duplicate cards (H4).

## PWA / offline (H20, H21, H22, M27)
- [ ] Load online once, go offline, reload — app shell loads (cached); fonts render (H22).
- [ ] Push a change, reload online — latest code loads immediately, not one navigation behind (H20).
- [ ] Offline cold launch shows the app, not the browser error page (M27).

## Content ingestion (H6, H7, H15, M9, M22)
- [ ] Open an **EPUB with images** — figures render (not `[figure]` placeholders) (H6).
- [ ] Open a **PDF** with a sentence starting in a year ("1984 was…") or a numbered/verse list — leading numbers are preserved (H7).
- [ ] Paste `http://localhost` or `http://169.254.169.254` as a URL — refused (H15).
- [ ] A text file with `----` dividers between paragraphs — paragraphs stay separate (M9).
- [ ] Search Gutenberg/podcasts on a flaky connection — it times out with a message instead of hanging (M22).
