// Module tests for the ported egress-consent gate (rebuild/src/scripts/06-privacy.js),
// loaded on top of 05-state. confirmAction (UI) is stubbed.
//   node rebuild/test/privacy.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(join(here, "..", "src", "scripts", p), "utf8");

let confirmReturn = false;
let confirmCalls = 0;
const backing = new Map();
const sandbox = {
  console, crypto: globalThis.crypto,
  localStorage: {
    getItem: (k) => (backing.has(k) ? backing.get(k) : null),
    setItem: (k, v) => backing.set(k, String(v)),
    removeItem: (k) => backing.delete(k),
  },
  showToast: () => {},
  confirmAction: async () => { confirmCalls++; return confirmReturn; },
};
sandbox.globalThis = sandbox; sandbox.window = sandbox;

const EXPORTS = ["confirmEgress", "activeProfile"];
vm.createContext(sandbox);
new vm.Script(src("05-state.js") + "\n;\n" + src("06-privacy.js") + `\n;globalThis.__x={${EXPORTS.join(",")}};`).runInContext(sandbox);
const X = sandbox.__x;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  ✗ " + m); } };

console.log("privacy: confirmEgress (C3/C5)");

// Pre-granted consent → no dialog.
X.activeProfile().prefs.egressConsent = { "ai:host": Date.now() };
confirmCalls = 0;
ok((await X.confirmEgress("ai:host", "msg")) === true, "returns true when already consented");
ok(confirmCalls === 0, "does not prompt when already consented");

// No consent + user accepts → true and records.
X.activeProfile().prefs.egressConsent = {};
confirmReturn = true; confirmCalls = 0;
ok((await X.confirmEgress("proxy", "msg")) === true, "returns true on accept");
ok(confirmCalls === 1, "prompted exactly once");
ok(!!X.activeProfile().prefs.egressConsent.proxy, "records consent on accept");

// Subsequent call for same key → sticky, no prompt.
confirmCalls = 0;
ok((await X.confirmEgress("proxy", "msg")) === true, "sticky after accept");
ok(confirmCalls === 0, "no re-prompt after accept");

// No consent + user declines → false, not recorded.
X.activeProfile().prefs.egressConsent = {};
confirmReturn = false; confirmCalls = 0;
ok((await X.confirmEgress("cloud", "msg")) === false, "returns false on decline");
ok(!X.activeProfile().prefs.egressConsent.cloud, "does not record on decline");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
