// Logic tests for the live index.html — loads the REAL script under DOM stubs and
// asserts behavior on the pure, high-risk functions touched by the fix work. No
// browser/jsdom needed; node 22 provides WebCrypto/URL/TextDecoder/AbortSignal.
//
// This tests the shipping code (not copies), so it catches regressions in the
// monolith now, and is the seed of the rebuild's test harness.
//
//   node rebuild/test/logic.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const html = readFileSync(join(root, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);

// ---- Minimal DOM/host stubs: just enough that top-level wiring doesn't throw ----
function stubNode() {
  const n = new Proxy(function () {}, {
    get(_t, p) {
      if (p === "classList") return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
      if (p === "style" || p === "dataset") return {};
      if (p === "value" || p === "textContent" || p === "innerHTML") return "";
      if (p === "checked") return false;
      if (p === "offsetParent") return null;
      if (p === "tagName") return "DIV";
      if (p === "querySelectorAll") return () => [];
      if (p === "querySelector") return () => null;
      if (p === "appendChild" || p === "removeChild") return (x) => x;
      if (p === Symbol.toPrimitive) return () => "";
      return (..._a) => n;
    },
    set() { return true; },
    apply() { return n; },
  });
  return n;
}
const documentStub = {
  getElementById: () => stubNode(),
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => stubNode(),
  addEventListener() {},
  removeEventListener() {},
  documentElement: stubNode(),
  body: stubNode(),
  head: stubNode(),
  visibilityState: "visible",
};
const store = new Map();
const sandbox = {
  document: documentStub,
  navigator: { serviceWorker: { register: async () => {} }, storage: {}, connection: {}, onLine: true },
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  indexedDB: { open: () => ({ addEventListener() {}, set onsuccess(_v) {}, set onerror(_v) {}, set onupgradeneeded(_v) {} }) },
  MutationObserver: class { observe() {} disconnect() {} },
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
  setTimeout: () => 0, // top-level deferred work (eviction etc.) is a no-op in tests
  clearTimeout: () => {},
  setInterval: () => 0,
  clearInterval: () => {},
  console,
  crypto: globalThis.crypto,
  TextDecoder, TextEncoder, URL, URLSearchParams, AbortSignal, Blob,
  btoa: (s) => Buffer.from(s, "binary").toString("base64"),
  atob: (s) => Buffer.from(s, "base64").toString("binary"),
  fetch: async () => { throw new Error("no network in tests"); },
  addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
  location: { origin: "http://localhost", href: "http://localhost/" },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

// Expose the functions under test (they're top-level declarations in the joined script).
const EXPORTS = [
  "assertSafeFetchUrl", "isLocalEndpoint", "sanitizeImported", "pinDigest",
  "decodeResponseBytes", "resolveHref", "findZipImage", "bytesToHex", "hexToBytes", "bookId",
];
const epilogue = `\n;globalThis.__exports={${EXPORTS.join(",")}};`;
vm.createContext(sandbox);
new vm.Script(scripts.join("\n;\n") + epilogue).runInContext(sandbox);
const X = sandbox.__exports;

// ---- tiny assert harness ----
let pass = 0, fail = 0;
const eq = (got, want, msg) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; } else { fail++; console.log(`  ✗ ${msg}\n      got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`); }
};
const throws = (fn, msg) => { try { fn(); fail++; console.log(`  ✗ ${msg} (expected throw)`); } catch { pass++; } };
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log(`  ✗ ${msg}`); } };

// ---- H15 assertSafeFetchUrl / isLocalEndpoint ----
console.log("assertSafeFetchUrl (H15)");
ok(X.assertSafeFetchUrl("https://example.com/a"), "allows https public");
ok(X.assertSafeFetchUrl("http://www.gutenberg.org/x"), "allows http public");
throws(() => X.assertSafeFetchUrl("file:///etc/passwd"), "blocks file:");
throws(() => X.assertSafeFetchUrl("data:text/html,x"), "blocks data:");
throws(() => X.assertSafeFetchUrl("http://localhost:8080"), "blocks localhost");
throws(() => X.assertSafeFetchUrl("http://127.0.0.1/"), "blocks loopback");
throws(() => X.assertSafeFetchUrl("http://169.254.169.254/latest"), "blocks cloud metadata");
throws(() => X.assertSafeFetchUrl("http://192.168.1.10/feed"), "blocks RFC-1918");
throws(() => X.assertSafeFetchUrl("not a url"), "blocks garbage");
eq(X.isLocalEndpoint("http://localhost:11434/v1"), true, "isLocalEndpoint localhost");
eq(X.isLocalEndpoint("https://api.anthropic.com"), false, "isLocalEndpoint public");

// ---- H4 sanitizeImported ----
console.log("sanitizeImported (H4)");
const polluted = JSON.parse('{"a":1,"__proto__":{"x":9},"b":{"constructor":2,"c":3}}');
const clean = X.sanitizeImported(polluted);
ok(!("__proto__" in clean) || !Object.getOwnPropertyNames(clean).includes("__proto__"), "drops __proto__");
ok(!Object.getOwnPropertyNames(clean.b).includes("constructor"), "drops nested constructor");
eq(clean.a, 1, "keeps a"); eq(clean.b.c, 3, "keeps nested c");
eq({}.x, undefined, "Object.prototype not polluted");
eq(X.sanitizeImported([1, { "__proto__": 5, k: 2 }])[1].k, 2, "arrays preserved");

// ---- C6 pinDigest ----
console.log("pinDigest (C6)");
const d1 = await X.pinDigest("1234", "aa");
const d2 = await X.pinDigest("1234", "aa");
const d3 = await X.pinDigest("1234", "bb");
eq(d1, d2, "deterministic for same salt");
ok(d1 !== d3, "salt changes digest");
ok(/^[0-9a-f]{64}$/.test(d1), "sha-256 hex output");

// ---- resolveHref (EPUB path normalization) ----
console.log("resolveHref");
eq(X.resolveHref("../images/x.png", "OEBPS/text/"), "OEBPS/images/x.png", "resolves ../");
eq(X.resolveHref("ch1.xhtml#frag", "OEBPS/"), "OEBPS/ch1.xhtml#frag", "keeps fragment");

// ---- H6 findZipImage ----
console.log("findZipImage (H6)");
const fakeZip = { files: { "OEBPS/images/pic.png": { dir: false, name: "OEBPS/images/pic.png" } }, file(k) { return this.files[k] || null; } };
ok(X.findZipImage(fakeZip, "OEBPS/images/pic.png"), "exact match");
ok(X.findZipImage(fakeZip, "/OEBPS/images/pic.png"), "leading-slash variant");
ok(X.findZipImage(fakeZip, "images/pic.png"), "basename fallback");
eq(X.findZipImage(fakeZip, "nope.png"), null, "no false match");

// ---- decodeResponseBytes (charset sniff) ----
console.log("decodeResponseBytes (charset)");
eq(X.decodeResponseBytes(new TextEncoder().encode("hello"), "text/plain; charset=utf-8"), "hello", "utf-8 roundtrip");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
