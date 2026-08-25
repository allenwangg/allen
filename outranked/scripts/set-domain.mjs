// Point the static link-preview tags at the real deployed domain.
//
//   node scripts/set-domain.mjs https://outranked-abc123.vercel.app
//
// Everything the page does at runtime (share links, badge embeds, brag cards)
// already derives its own address from the browser, so this only rewrites the
// og:/twitter:/canonical tags that social crawlers read out of the raw HTML.

import { readFileSync, writeFileSync } from "node:fs";

const raw = process.argv[2];
if (!raw) {
  console.error("usage: node scripts/set-domain.mjs https://your-domain.example");
  process.exit(1);
}
let origin;
try {
  origin = new URL(raw).origin;
} catch {
  console.error(`not a valid URL: ${raw}`);
  process.exit(1);
}

const files = ["index.html", "outbid-lol-alternative.html"];
let changed = 0;
for (const file of files) {
  const before = readFileSync(file, "utf8");
  // Rewrite only absolute URLs that live inside meta/link tags.
  const after = before.replace(
    /(<(?:meta|link)\b[^>]*?(?:content|href)=")https?:\/\/[^"/]+(\/[^"]*)?"/g,
    (m, head, path) => `${head}${origin}${path || "/"}"`
  );
  if (after !== before) { writeFileSync(file, after); changed++; }
  console.log(`${after !== before ? "updated" : "unchanged"}  ${file}`);
}
console.log(`\nLink previews now point at ${origin}`);
if (!changed) console.log("(nothing matched — already set?)");
