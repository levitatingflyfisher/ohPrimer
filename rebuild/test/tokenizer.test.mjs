// Module tests for the ported tokenizer (rebuild/src/scripts/15-tokenizer.js).
// Pure — no stubs beyond JS globals.
//   node rebuild/test/tokenizer.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const code = readFileSync(join(here, "..", "src", "scripts", "15-tokenizer.js"), "utf8");

const sandbox = { console, URL };
sandbox.globalThis = sandbox;
const EXPORTS = ["tokenizeDocument", "getPunctuationDelay", "abbreviateUrl"];
vm.createContext(sandbox);
new vm.Script(code + `\n;globalThis.__x={${EXPORTS.join(",")}};`).runInContext(sandbox);
const X = sandbox.__x;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  ✗ " + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ` (got ${JSON.stringify(a)})`);

console.log("tokenizer: text block");
let st = X.tokenizeDocument({ blocks: [{ type: "text", text: "The quick brown fox." }] });
eq(st.words, ["The", "quick", "brown", "fox."], "splits words");
eq(st.words.length, st.originals.length, "originals parallel to words");
eq(st.words.length, st.pacing.length, "pacing parallel to words");
ok(st.pacing[3] >= 1.5, "paragraph-end word gets a longer pause");

console.log("tokenizer: chapters + blockStartWordIdx");
st = X.tokenizeDocument({ blocks: [
  { type: "chapter", title: "One" },
  { type: "text", text: "alpha beta" },
] });
eq(st.chapters, [{ idx: 0, title: "One" }], "chapter recorded at word index");
eq(st.blockStartWordIdx, [0, 0], "block start indices track word count");
eq(st.words, ["alpha", "beta"], "chapter emits no word");

console.log("tokenizer: segment sentinel");
st = X.tokenizeDocument({ blocks: [{ type: "segment", kind: "figure", content: { src: "x" } }] });
eq(st.words, ["[figure]"], "segment emits a sentinel token");
ok(st.segments.get(0)?.kind === "figure", "segment recorded in map");

console.log("tokenizer: URL abbreviation + long-token skip");
st = X.tokenizeDocument({ blocks: [{ type: "text", text: "see https://www.example.com/a/b/c now" }] });
eq(st.words[1], "example.com/…/c", "abbreviates URL");
eq(st.originals[1], "https://www.example.com/a/b/c", "keeps original URL");
st = X.tokenizeDocument({ blocks: [{ type: "text", text: "x" + "y".repeat(40) }] });
eq(st.words, ["…"], "over-long token becomes ellipsis");
eq(st.skipped, 1, "skipped counter increments");

console.log("tokenizer: hyphenated compound split");
st = X.tokenizeDocument({ blocks: [{ type: "text", text: "mother-in-law" }] });
eq(st.words, ["mother", "in", "law"], "splits hyphenated compound");
ok(st.pacing[0] === 0.8 && st.pacing[1] === 0.8, "inter-part pacing tightened");

console.log("tokenizer: punctuation delays");
ok(X.getPunctuationDelay("end.") === 1.7, "sentence end 1.7");
ok(X.getPunctuationDelay("clause,") === 1.0, "comma 1.0");
ok(X.getPunctuationDelay("semi;") === 1.2, "semicolon 1.2");

console.log("tokenizer: KNOWN LIMITATION M8 (space-less CJK)");
// Documents current (buggy) behavior: a long space-less run collapses to "…".
// When M8 is fixed (grapheme-aware splitting), update this assertion.
st = X.tokenizeDocument({ blocks: [{ type: "text", text: "想".repeat(40) }] });
eq(st.words, ["…"], "M8: long CJK run is currently skipped (regression marker)");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
