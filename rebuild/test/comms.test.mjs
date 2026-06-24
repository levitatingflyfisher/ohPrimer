// Module-level tests for the ported comms layer (rebuild/src/scripts/40-comms.js)
// plus its 00-utils foundation. Loads only those two files (not index.html),
// stubbing the deps they expect from not-yet-ported modules (confirmEgress,
// activeProfile) and the network. Proves the port preserves the SSRF guard,
// proxy-consent gating, and size caps.
//
//   node rebuild/test/comms.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = (p) => readFileSync(join(here, "..", "src", "scripts", p), "utf8");

// ---- controllable stubs ----
const enc = new TextEncoder();
let consent = { proxy: false };      // activeProfile().prefs.egressConsent
let confirmEgressReturn = false;     // what the (stubbed) consent dialog returns
let calls = [];                      // every fetch() URL
function makeResp(text, ok = true) {
  return {
    ok,
    async arrayBuffer() { return enc.encode(text).buffer; },
    headers: { get: (k) => (k === "content-type" ? "text/plain; charset=utf-8" : null) },
  };
}
let directOk = true;
const sandbox = {
  console, TextDecoder, TextEncoder, URL, AbortSignal, AbortController, Blob,
  crypto: globalThis.crypto,
  activeProfile: () => ({ prefs: { egressConsent: consent } }),
  confirmEgress: async () => confirmEgressReturn,
  fetch: async (u) => {
    calls.push(String(u));
    if (/cors\.eu\.org|allorigins|codetabs/.test(String(u))) return makeResp("PROXIED");
    return makeResp("DIRECT", directOk);
  },
};
sandbox.globalThis = sandbox; sandbox.window = sandbox;

const EXPORTS = ["assertSafeFetchUrl", "fetchWithProxies", "fetchAndDecode", "proxyConsented", "ensureProxyConsent"];
const code = src("00-utils.js") + "\n;\n" + src("40-comms.js") +
  `\n;globalThis.__x={${EXPORTS.join(",")}};`;
vm.createContext(sandbox);
new vm.Script(code).runInContext(sandbox);
const X = sandbox.__x;

let pass = 0, fail = 0;
const reset = () => { calls = []; consent = { proxy: false }; confirmEgressReturn = false; directOk = true; };
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  ✗ " + m); } };
async function rejects(fn, m) { try { await fn(); fail++; console.log("  ✗ " + m + " (expected reject)"); } catch { pass++; } }

console.log("comms: SSRF guard (H15)");
reset(); await rejects(() => X.fetchWithProxies("http://localhost:9/x"), "blocks localhost");
reset(); await rejects(() => X.fetchWithProxies("http://169.254.169.254/"), "blocks metadata IP");
reset(); ok(!calls.length, "no fetch attempted for blocked URL");

console.log("comms: direct success path");
reset();
ok((await X.fetchWithProxies("https://example.com/a")) === "DIRECT", "returns direct body");
ok(calls.length === 1 && !/cors|allorigins|codetabs/.test(calls[0]), "no proxy used when direct works");

console.log("comms: proxy gating (C5)");
reset(); directOk = false; // force direct to fail → proxy fallback considered
await rejects(() => X.fetchWithProxies("https://example.com/a", { interactive: false }),
  "no consent + non-interactive → refuses");
ok(!calls.some((u) => /cors|allorigins|codetabs/.test(u)), "no proxy host hit without consent");

reset(); directOk = false; consent = { proxy: Date.now() }; // prior consent
ok((await X.fetchWithProxies("https://example.com/a", { interactive: false })) === "PROXIED",
  "consented → falls back to proxy");
ok(calls.some((u) => /cors|allorigins|codetabs/.test(u)), "proxy host hit with consent");

reset(); directOk = false; confirmEgressReturn = true; // interactive grant
ok((await X.fetchWithProxies("https://example.com/a")) === "PROXIED", "interactive consent grant → proxy");

console.log("comms: size cap (H16)");
reset();
await rejects(() => X.fetchAndDecode({
  arrayBuffer: async () => ({ byteLength: 26 * 1024 * 1024 }),
  headers: { get: () => "text/plain" },
}), "rejects >25MB payload");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
