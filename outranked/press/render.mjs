// Renders every press/*.html template to a matching .png at X's 1200×675.
// Usage: node press/render.mjs            (all templates)
//        node press/render.mjs wall       (one template)
// For a real coronation card, edit the {PLACEHOLDERS} in coronation.html first.
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire("/opt/node22/lib/node_modules/");
const { chromium } = require("playwright");
const dir = dirname(fileURLToPath(import.meta.url));
const only = process.argv[2];
const files = readdirSync(dir).filter(f => f.endsWith(".html") && (!only || f.startsWith(only)));
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1200, height: 675 } });
for (const f of files) {
  await page.goto("file://" + join(dir, f), { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const out = join(dir, basename(f, ".html") + ".png");
  await page.screenshot({ path: out });
  console.log("rendered", basename(out));
}
await browser.close();
