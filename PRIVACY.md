# OpenHearth Primer — Privacy & Data-Egress Policy

> Decision record. This is the contract every feature (current single-file app and the
> modular rebuild) must honor. It resolves the privacy cluster in `ISSUES.md`
> (C3, C4, C5, C6, H15, H16, H19, M25) and operationalizes **PRD §2.4 — "Privacy &
> Sovereignty: nothing leaves your device."**

## Principle

**On-device by default. Nothing leaves the device without explicit, informed, remembered
consent.** "The device" means this browser. Egress = any network request that sends user
content, identifiers, or browsing targets to a server the user didn't themselves run.

## The three egress surfaces and their rules

### 1. Cloud AI (LLM providers) — **opt-in, consent-gated**
- Cloud LLM use stays entirely optional (no provider configured = no calls).
- Before the *first* call to a given cloud host, the app shows a clear consent dialog naming
  the host and stating that reading/review text and the API key leave the device. The choice is
  remembered per profile (`prefs.egressConsent["ai:<provider>:<host>"]`).
- **On-device endpoints are exempt.** Ollama / LM Studio / LAN addresses (`localhost`,
  `127.0.0.1`, `*.local`, RFC-1918 ranges — see `isLocalEndpoint`) never leave the device, so
  they run without a consent prompt. This keeps the recommended private setup frictionless.
- The API key is sent only to the configured host; the consent dialog discloses the actual
  destination, closing the baseUrl-override leak (M25).
- **Status:** implemented (`confirmEgress`, gates in `callLLM`).

### 2. CORS proxies (content fetching) — **needed for content, consent-gated, never silent**
- Public proxies (`cors.eu.org`, `allorigins.win`, `codetabs.com`) exist because many feed /
  article / podcast hosts send no CORS headers, so the browser cannot read them directly. They
  are **load-bearing for the content pipeline**, not optional plumbing — so we keep them.
- But they expose the URL and its contents to a third party. Rules:
  - Always try a **direct fetch first.**
  - Only fall back to a proxy with **sticky per-profile consent**
    (`prefs.egressConsent["proxy"]`), prompted on first interactive use.
  - **Background work never prompts and never silently downgrades:** feed refresh and podcast
    auto-download use proxies *only if already consented*, otherwise they stay direct-only and
    fail closed.
- **Status:** implemented (`ensureProxyConsent`, gates in `fetchWithProxies`,
  `fetchFeedConditional`, `fetchBinaryWithProxies`).

### 3. Sync between devices — **local only, no cloud relay**
- The cloud sync relay is **removed.** It used unsafe AES-GCM nonce handling against an
  unauthenticated, seed-derived-channel relay (C1/C2) — and the product decision is that sync
  should not be cloud-based.
- Device-to-device transfer is **local file Backup → Export / Import JSON** only. The file never
  touches a server.
- **Status:** implemented (relay UI + wiring removed; network entry points throw).

## Secrets at rest

- **API keys and the (now-unused) sync seed live in `localStorage` in plaintext.** Browsers
  provide no secure key store reachable from page JS, so this cannot be fully fixed client-side.
  We therefore:
  - **Disclose it honestly** in the Settings hint (no more "stored locally only" reassurance).
  - Recommend an **app-scoped key** and clearing it on shared devices.
  - Keep the surface minimal (key sent only to the disclosed host).
- **Parent PIN** is stored as a **salted SHA-256 digest**, never plaintext (C6). This is a "keep
  honest kids out" gate, not real access control — anyone with devtools can bypass client-side
  logic. We do not claim otherwise.

## Open items (tracked in ISSUES.md, not yet implemented)

- **SSRF surface (H15):** pasted URLs are fetched with no scheme/host validation
  (`localhost`, `169.254.169.254`, `file:`). Add a scheme allowlist (`http`/`https` only) and
  block link-local / metadata addresses before fetch.
- **Response integrity (H16):** proxy/remote bytes are trusted and persisted verbatim. Consent
  mitigates the privacy angle; content-type/size sanity checks remain to be added.
- **Per-use vs. sticky:** consent is currently per-destination sticky. If a stricter posture is
  wanted (re-confirm each session, or per-document for children's profiles), it layers on top of
  `confirmEgress` cleanly.

## How to extend

All egress goes through one helper:

```js
if (!(await confirmEgress(key, humanMessage))) throw new Error("Cancelled — nothing was sent.");
```

Any new feature that touches the network with user data **must** route through `confirmEgress`
(or be proven on-device via `isLocalEndpoint`). Reviewers: a network call with user content and
no `confirmEgress`/`isLocalEndpoint` on the path is a policy violation.
