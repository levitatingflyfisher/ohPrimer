// Module tests for the ported text parser (rebuild/src/scripts/20-parsers.js).
// Also runs its output through the tokenizer to confirm the ingestion pipeline.
//   node rebuild/test/parsers.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(join(here, "..", "src", "scripts", p), "utf8");

const sandbox = { console, URL };
sandbox.globalThis = sandbox;
const EXPORTS = ["parseTextFile", "tokenizeDocument"];
vm.createContext(sandbox);
new vm.Script(src("15-tokenizer.js") + "\n;\n" + src("20-parsers.js") + `\n;globalThis.__x={${EXPORTS.join(",")}};`).runInContext(sandbox);
const X = sandbox.__x;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  ✗ " + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ` (got ${JSON.stringify(a)})`);
const types = (d) => d.blocks.map((b) => b.type);

console.log("parsers: paragraphs");
let d = X.parseTextFile("Para one line A\nPara one line B\n\nPara two.", "T");
eq(types(d), ["text", "text"], "blank line splits paragraphs");
eq(d.blocks[0].text, "Para one line A Para one line B", "consecutive lines joined");
eq(d.title, "T", "title carried");

console.log("parsers: chapter heading");
d = X.parseTextFile("Chapter 1\n\nIt begins.", "T");
eq(types(d), ["chapter", "text"], "chapter heading detected");
eq(d.blocks[0].title, "Chapter 1", "chapter title");

console.log("parsers: divider does not glue paragraphs (M9)");
d = X.parseTextFile("First para.\n----------\nSecond para.", "T");
eq(types(d), ["text", "text"], "divider yields two separate text blocks");
eq(d.blocks[0].text, "First para.", "first stays intact");
eq(d.blocks[1].text, "Second para.", "second not glued onto first");

console.log("parsers: indented code block");
d = X.parseTextFile("Intro\n\n    line1()\n    line2()\n    line3()\n", "T");
ok(d.blocks.some((b) => b.type === "segment" && b.kind === "code"), "code segment detected");

console.log("parsers: table");
d = X.parseTextFile("a | b | c\nd | e | f\ng | h | i", "T");
ok(d.blocks.some((b) => b.type === "segment" && b.kind === "table"), "table segment detected");

console.log("parsers: pipeline into tokenizer");
d = X.parseTextFile("Chapter 1\n\nThe quick brown fox.", "T");
const st = X.tokenizeDocument(d);
eq(st.chapters, [{ idx: 0, title: "Chapter 1" }], "chapter survives into token stream");
eq(st.words, ["The", "quick", "brown", "fox."], "prose tokenized");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
