// Module tests for the ported SM-2 scheduler + review stats (50-learning.js).
//   node rebuild/test/learning.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const code = readFileSync(join(here, "..", "src", "scripts", "50-learning.js"), "utf8");
const sandbox = { console, Date };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
new vm.Script(code + `\n;globalThis.__x={sm2,computeReviewStats};`).runInContext(sandbox);
const X = sandbox.__x;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  ✗ " + m); } };
const near = (a, b, m, e = 1) => ok(Math.abs(a - b) <= e, m + ` (got ${a})`);

console.log("learning: SM-2 intervals");
let r = X.sm2({ EF: 2.5, reps: 0, interval: 0 }, 5);
ok(r.interval === 1 && r.reps === 1, "first pass → 1 day");
r = X.sm2({ EF: 2.5, reps: 1, interval: 1 }, 5);
ok(r.interval === 6 && r.reps === 2, "second pass → 6 days");
r = X.sm2({ EF: 2.5, reps: 2, interval: 6 }, 5);
ok(r.interval === 15 && r.reps === 3, "third pass → round(6*2.5)=15");
ok(r.EF > 2.5, "perfect grade raises EF");

console.log("learning: SM-2 lapse + EF floor");
r = X.sm2({ EF: 2.5, reps: 5, interval: 100 }, 1);
ok(r.reps === 0 && r.interval === 1, "failure resets reps and interval");
ok(r.EF < 2.5, "failure lowers EF");
let ef = 1.3;
for (let i = 0; i < 10; i++) ef = X.sm2({ EF: ef, reps: 0, interval: 0 }, 0).EF;
ok(ef >= 1.3, "EF never drops below 1.3 floor");

console.log("learning: nextReview horizon");
const before = Date.now();
r = X.sm2({ EF: 2.5, reps: 1, interval: 1 }, 5); // interval 6 days
near(r.nextReview, before + 6 * 86400000, "nextReview ~ now + interval days", 2000);

console.log("learning: computeReviewStats");
let s = X.computeReviewStats([]);
ok(s.total === 0 && s.retention === null && s.streak === 0, "empty → zeros, null retention");
s = X.computeReviewStats([{ history: [{ g: 5, t: Date.now() }, { g: 2, t: Date.now() }] }]);
ok(s.total === 1, "counts cards");
ok(s.retention === 50, "retention = good/total% (1 of 2 >=3)");

console.log("learning: streak (today + yesterday)");
const now = Date.now();
s = X.computeReviewStats([{ history: [{ g: 4, t: now }, { g: 4, t: now - 86400000 }] }]);
ok(s.streak === 2, "two consecutive days → streak 2");
s = X.computeReviewStats([{ history: [{ g: 4, t: now - 3 * 86400000 }] }]);
ok(s.streak === 0, "stale-only history → streak 0");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
