// Module tests for the ported state/persistence layer (rebuild/src/scripts/05-state.js).
//   node rebuild/test/state.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(join(here, "..", "src", "scripts", p), "utf8");

let throwOnSet = false;
let lastToast = null;
const backing = new Map();
const sandbox = {
  console, crypto: globalThis.crypto,
  localStorage: {
    getItem: (k) => (backing.has(k) ? backing.get(k) : null),
    setItem: (k, v) => { if (throwOnSet) { const e = new Error("quota"); e.name = "QuotaExceededError"; throw e; } backing.set(k, String(v)); },
    removeItem: (k) => backing.delete(k),
  },
  showToast: (m) => { lastToast = m; },
};
sandbox.globalThis = sandbox; sandbox.window = sandbox;

const EXPORTS = ["getState", "activeProfile", "saveStore", "persist", "bookId", "defaultPrefs", "genPid"];
vm.createContext(sandbox);
new vm.Script(src("05-state.js") + `\n;globalThis.__x={${EXPORTS.join(",")}};`).runInContext(sandbox);
const X = sandbox.__x;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  ✗ " + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ` (got ${JSON.stringify(a)})`);

console.log("state: getState defaults");
backing.clear();
const fresh = X.getState();
ok(Array.isArray(fresh.profiles) && fresh.profiles.length === 1, "one default profile when empty");
eq(fresh.activeProfile, 0, "activeProfile index 0");
ok(typeof fresh.profiles[0].pid === "string" && fresh.profiles[0].pid.length, "default profile has a pid");
ok(fresh.profiles[0].prefs && fresh.profiles[0].prefs.wpm === 300, "default prefs merged");

console.log("state: getState merge + sanitize");
backing.set("openhearth_primer_v01", JSON.stringify({ profiles: [{ name: "Ada" }], activeProfile: 7 }));
const merged = X.getState();
eq(merged.profiles[0].name, "Ada", "keeps stored name");
ok(merged.profiles[0].pid === "p0", "missing pid backfilled to p0");
ok(merged.profiles[0].prefs.mode === "classic", "missing prefs filled from defaults");
eq(merged.activeProfile, 0, "out-of-range activeProfile clamped to 0");

console.log("state: saveStore failure surfaced (M5)");
throwOnSet = true; lastToast = null;
eq(X.saveStore({ profiles: [] }), false, "returns false on quota throw");
ok(/storage/i.test(lastToast || ""), "toasts once on persistent failure");
throwOnSet = false;
eq(X.saveStore({ profiles: [] }), true, "returns true on success");

console.log("state: bookId determinism");
eq(X.bookId("p0", "a.txt", 10), X.bookId("p0", "a.txt", 10), "same inputs → same id");
ok(X.bookId("p0", "a.txt", 10) !== X.bookId("p1", "a.txt", 10), "profile changes id");

console.log("state: genPid shape");
ok(/^[a-z]+-[a-z]+-\d{2}$/.test(X.genPid()), "pid is adj-noun-NN");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
