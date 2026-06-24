#!/usr/bin/env node
/* Modular-rebuild build harness.
 *
 * Concatenates the CSS + JS fragments listed in manifest.json into a single
 * self-contained dist/index.html — preserving the project's single-file
 * deliverable while letting source live as small, reviewable modules.
 *
 * Zero dependencies. Run: `node rebuild/build.mjs` (or `npm run build:rebuild`).
 *
 * This is intentionally dumb (concatenation, not bundling) because the app is one
 * global script with no inter-module imports; ordering is the only contract. As
 * modules are ported from ../index.html, add them to manifest.json in order.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const read = async (p) => readFile(join(root, p), "utf8");

const manifest = JSON.parse(await read("manifest.json"));
const styles = manifest.styles ?? [];
const scripts = manifest.scripts ?? [];

const css = (await Promise.all(styles.map(read))).join("\n");
const js = (await Promise.all(scripts.map(read))).join("\n;\n");

const html = `<!DOCTYPE html>
<html lang="${manifest.lang ?? "en"}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${manifest.title ?? "App"}</title>
<style>
${css}
</style>
</head>
<body>
<!-- Body markup is ported per SPEC §4 (screens) — see manifest.scriptsTodo. -->
<script>
${js || "/* No script modules ported yet — see manifest.scriptsTodo. */"}
</script>
</body>
</html>
`;

await mkdir(join(root, "dist"), { recursive: true });
await writeFile(join(root, "dist", "index.html"), html);

const kb = (html.length / 1024).toFixed(1);
console.log(
  `Built dist/index.html — ${kb} KB (${styles.length} style + ${scripts.length} script fragment(s)).`
);
if ((manifest.stylesTodo?.length ?? 0) + (manifest.scriptsTodo?.length ?? 0) > 0) {
  console.log(
    `Remaining to port: ${manifest.stylesTodo?.length ?? 0} style + ${manifest.scriptsTodo?.length ?? 0} script module(s). See manifest.json.`
  );
}
