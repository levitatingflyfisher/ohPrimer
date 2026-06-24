// Behavioral (DOM-state) tests for ohPrimer, driven through a real headless
// Chromium so they exercise the same code path a reader hits. The app's main
// <script> is a plain (non-module) script, so its top-level `function`
// declarations are global (window.play, window.openToc, window.loadDocument,
// window.parseTextFile …). State held in `let` (e.g. `playing`) is NOT on
// window, so we observe it through the DOM the user sees — the play button
// shows "❚❚" while playing and "▶" while paused.
//
// Run: node --test tests/behavior/   (from the ohPrimer repo root)

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadChromium, startStaticServer } from '../visual/_harness.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// A two-chapter plain-text doc. parseTextFile() turns "Chapter N" lines into
// chapter blocks, and loadDocument() synthesizes a TOC when chapters.length>1 —
// so the ☰ TOC button is live and openToc() actually opens.
const TWO_CHAPTERS = `Chapter 1
This is the first chapter with several words to read along the way here today.
Chapter 2
This is the second chapter with even more words to read here as well right now.`;

let chromium, server, browser;

before(async () => {
  chromium = await loadChromium();
  server = await startStaticServer(ROOT);
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  server?.close();
});

// Fresh page per test: load the app, wait for init, load a known doc.
async function freshPage(docText = TWO_CHAPTERS, title = 'Test Book') {
  const page = await browser.newPage();
  await page.goto(server.base + '/index.html', { waitUntil: 'load' });
  await page.waitForFunction(
    () => typeof window.loadDocument === 'function' && typeof window.parseTextFile === 'function',
  );
  await page.evaluate(
    ([txt, t]) => window.loadDocument(window.parseTextFile(txt, t)),
    [docText, title],
  );
  return page;
}

const playBtnText = (page) => page.evaluate(() => document.getElementById('tPlay').textContent);
const tocOpen = (page) =>
  page.evaluate(() => document.getElementById('tocDrawer').classList.contains('open'));

test('opening the TOC pauses playback', async () => {
  const page = await freshPage();
  try {
    await page.evaluate(() => window.play());
    assert.equal(await playBtnText(page), '❚❚', 'reader should be playing before opening the TOC');

    await page.evaluate(() => window.openToc());
    assert.ok(await tocOpen(page), 'TOC drawer should be open');
    assert.equal(await playBtnText(page), '▶', 'reader must be PAUSED after opening the TOC');
  } finally {
    await page.close();
  }
});

test('closing the TOC resumes playback if it was playing on open', async () => {
  const page = await freshPage();
  try {
    await page.evaluate(() => window.play());
    await page.evaluate(() => window.openToc());
    assert.equal(await playBtnText(page), '▶', 'paused while TOC open');

    await page.evaluate(() => window.closeToc());
    assert.equal(await playBtnText(page), '❚❚', 'should resume after closing the TOC');
  } finally {
    await page.close();
  }
});

test('closing the TOC does NOT auto-start playback if it was paused on open', async () => {
  const page = await freshPage();
  try {
    // never played; open then close the TOC
    await page.evaluate(() => window.openToc());
    await page.evaluate(() => window.closeToc());
    assert.equal(await playBtnText(page), '▶', 'should stay paused — we never started reading');
  } finally {
    await page.close();
  }
});
