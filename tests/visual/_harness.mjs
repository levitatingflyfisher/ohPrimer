// Shared plumbing for ohPrimer's visual tests.
//
// Both the screenshot sweep (screenshots.mjs) and the large-text overflow
// check (reflow.mjs) need the same two things: a Chromium that may live either
// in a local devDependency OR only in the shared ~/.cache/oh-visual-loop
// harness, and an in-process static server for the repo root (so neither test
// needs `npm run dev`). Keeping that here means one place to fix when the
// resolution or serving logic changes.

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';

// Resolve playwright whether it's a local devDependency OR only present in the
// shared visual-loop harness. ESM `import` ignores NODE_PATH, so resolve the
// package file and import it by URL.
export async function loadChromium() {
  const candidates = [
    'playwright',
    `${homedir()}/.cache/oh-visual-loop/node_modules/playwright`,
  ];
  const req = createRequire(import.meta.url);
  for (const spec of candidates) {
    try {
      const resolved = req.resolve(spec);
      const mod = await import(pathToFileURL(resolved).href);
      const chromium = mod.chromium ?? mod.default?.chromium;
      if (chromium) return chromium;
    } catch {
      /* try next */
    }
  }
  console.error(
    "Could not find 'playwright'. Install it with one of:\n" +
      '  npx playwright install chromium   (after `npm i -D playwright`)\n' +
      '  bash <visual-loop>/scripts/web-setup.sh   (shared harness in ~/.cache/oh-visual-loop)',
  );
  process.exit(2);
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

// Serve `root` (a directory) from an ephemeral localhost port. Returns the base
// URL and a close() to shut the server down. Path traversal outside root is
// refused.
export async function startStaticServer(root) {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const file = join(root, normalize(p));
      if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  return { base, close: () => server.close() };
}
