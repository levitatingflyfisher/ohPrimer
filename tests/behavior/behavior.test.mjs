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

// ───────── Bug 1: passage/vocab review cards are two-sided ─────────
// A flashcard needs a front (the prompt, answer hidden) and a back (the answer
// revealed). The focus word is a rare token so "is it hidden?" is unambiguous.
const FOCUS_DOC = 'alpha beta gamma delta zonktastic epsilon zeta eta theta iota kappa lambda.';
const FOCUS_IDX = 4; // whitespace position of "zonktastic" (plain prose ⇒ token idx)

// Save one extract of the given kind on the focus word, then open Review and
// wait for the card to render. Returns the rendered card's initial text + whether
// a reveal control is present.
async function reviewCard(page, kind) {
  return page.evaluate(
    async ([k, i]) => {
      window.seekTo(i);
      const rec = await window.saveExtractRecord(k);
      await window.enterReview();
      // wait a tick for renderReview's async stats paint
      await new Promise((r) => setTimeout(r, 50));
      const body = document.getElementById('reviewBody');
      const reveal = body.querySelector('[data-reveal]');
      return {
        focusWord: rec && rec.focusWord,
        frontText: body.textContent,
        hasReveal: !!reveal,
      };
    },
    [kind, FOCUS_IDX],
  );
}

test('a passage card hides its focus word until revealed', async () => {
  const page = await freshPage(FOCUS_DOC, 'Focus Doc');
  try {
    const card = await reviewCard(page, 'passage');
    assert.equal(card.focusWord, 'zonktastic', 'extract should focus the rare word');
    assert.ok(card.hasReveal, 'passage card must have a reveal control (two-sided)');
    assert.ok(
      !card.frontText.includes('zonktastic'),
      'the focus word must be HIDDEN on the front of the card',
    );

    // reveal, then the answer appears
    const revealedText = await page.evaluate(() => {
      document.querySelector('#reviewBody [data-reveal]').click();
      return document.getElementById('reviewBody').textContent;
    });
    assert.ok(revealedText.includes('zonktastic'), 'the focus word appears after revealing');
  } finally {
    await page.close();
  }
});

test('a vocab card hides the flagged word until revealed', async () => {
  const page = await freshPage(FOCUS_DOC, 'Focus Doc');
  try {
    const card = await reviewCard(page, 'word');
    assert.equal(card.focusWord, 'zonktastic');
    assert.ok(card.hasReveal, 'vocab card must have a reveal control (two-sided)');
    assert.ok(
      !card.frontText.includes('zonktastic'),
      'the flagged vocab word must be HIDDEN on the front',
    );
    const revealedText = await page.evaluate(() => {
      document.querySelector('#reviewBody [data-reveal]').click();
      return document.getElementById('reviewBody').textContent;
    });
    assert.ok(revealedText.includes('zonktastic'), 'the vocab word appears after revealing');
  } finally {
    await page.close();
  }
});

// ───────── Bug 2: adjust the highlight before creating the card ─────────
const savedFocusWords = (page) =>
  page.evaluate(async () =>
    (await window.dbListExtracts(window.activeProfile().pid)).map((e) => e.focusWord));

test('extracting opens a preview (no auto-save) defaulting to the reading word', async () => {
  const page = await freshPage(FOCUS_DOC, 'Focus Doc');
  try {
    await page.evaluate(() => window.seekTo(4)); // reading word = "zonktastic"
    await page.evaluate(() => window.extractCurrent());
    assert.ok(
      await page.evaluate(() => document.getElementById('extractPreview').classList.contains('open')),
      'pressing extract must open a preview rather than saving immediately',
    );
    const defSel = await page.evaluate(() =>
      [...document.querySelectorAll('#epTokens .ep-token.sel')].map((t) => t.textContent.trim()));
    assert.deepEqual(defSel, ['zonktastic'], 'preview defaults the focus to the reading word');
  } finally {
    await page.close();
  }
});

test('adjusting the focus to a different word saves that word', async () => {
  const page = await freshPage(FOCUS_DOC, 'Focus Doc');
  try {
    await page.evaluate(() => window.seekTo(4));
    await page.evaluate(() => window.extractCurrent());
    const gamma = await page.evaluateHandle(() =>
      [...document.querySelectorAll('#epTokens .ep-token')].find((t) => t.textContent.trim() === 'gamma'));
    await gamma.asElement().click();
    await page.click('#epConfirm');
    const words = await savedFocusWords(page);
    assert.ok(words.includes('gamma'), `saved card should focus "gamma"; got ${JSON.stringify(words)}`);
  } finally {
    await page.close();
  }
});

// ───────── Absorb Trellis .ohcourse drilling ─────────
const SAMPLE_OHCOURSE = JSON.stringify({
  schemaVersion: '1.0',
  id: 'test-course',
  title: 'Test Course',
  nodes: [
    {
      id: 'n1', title: 'Node One', intake: 'Teaching prose about node one.',
      items: [
        { type: 'cloze', id: 'c1', rung: 1, text: 'The capital of France is {{c1::Paris}}.', answers: { c1: 'Paris' } },
        { type: 'qa', id: 'q1', rung: 1, prompt: 'What is 2+2?', answer: '4' },
      ],
    },
    {
      id: 'n2', title: 'Node Two', intake: 'Prose about node two.', prereqs: ['n1'],
      items: [
        { type: 'discrimination', id: 'd1', rung: 2, prompt: 'Pick the prime', choices: ['4', '6', '7'], correctIndex: 2, explanation: '7 is prime.' },
        { type: 'procedure', id: 'p1', rung: 2, prompt: 'Boil an egg', steps: ['Boil water', 'Add egg', 'Wait 7 min'] },
      ],
    },
  ],
});

test('importing an .ohcourse turns every item into a reviewable card', async () => {
  const page = await freshPage();
  try {
    const out = await page.evaluate(async (txt) => {
      const res = await window.importOhcourse(txt);
      const all = await window.dbListExtracts(window.activeProfile().pid);
      const mine = all.filter((e) => e.bookId === res.bookId);
      return {
        res,
        recs: mine.map((e) => ({ kind: e.kind, p: e.clozePrompt, a: e.clozeAnswer, ch: e.chapterTitle })),
        bookTitle: document.getElementById('bookTitle').textContent,
      };
    }, SAMPLE_OHCOURSE);

    assert.equal(out.res.cards, 4, 'four items → four cards');
    assert.equal(out.res.title, 'Test Course');
    assert.equal(out.recs.length, 4, 'cards are linked to the imported book');
    assert.ok(out.recs.every((e) => e.kind === 'cloze'), 'all map onto the two-sided card');

    const cloze = out.recs.find((e) => (e.p || '').includes('capital of France'));
    assert.ok(cloze && cloze.p.includes('____'), 'cloze blank is rendered as a gap');
    assert.ok(cloze.a.includes('Paris'), 'cloze answer is Paris');

    assert.ok(out.recs.some((e) => e.p === 'What is 2+2?' && e.a === '4'), 'qa front/back preserved');

    const disc = out.recs.find((e) => (e.p || '').includes('Pick the prime'));
    assert.ok(disc && disc.p.includes('7') && disc.a.includes('7'), 'discrimination choices + correct answer');

    const proc = out.recs.find((e) => (e.p || '').includes('Boil an egg'));
    assert.ok(proc && proc.a.includes('Boil water'), 'procedure steps land in the answer');

    assert.ok(out.recs.some((e) => e.ch === 'Node One'), 'cards carry their node as the chapter');
    assert.equal(out.bookTitle, 'Test Course', 'the prose loads as a readable book');
  } finally {
    await page.close();
  }
});

test('dragging across tokens saves a multi-word focus span', async () => {
  const page = await freshPage(FOCUS_DOC, 'Focus Doc');
  try {
    await page.evaluate(() => window.seekTo(4));
    await page.evaluate(() => window.extractCurrent());
    const center = (word) =>
      page.evaluate((w) => {
        const t = [...document.querySelectorAll('#epTokens .ep-token')].find((e) => e.textContent.trim() === w);
        const r = t.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }, word);
    const a = await center('epsilon');
    const b = await center('zeta');
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 6 });
    await page.mouse.up();
    await page.click('#epConfirm');
    const words = await savedFocusWords(page);
    assert.ok(
      words.includes('epsilon zeta'),
      `expected a multi-word focus "epsilon zeta"; got ${JSON.stringify(words)}`,
    );
  } finally {
    await page.close();
  }
});
