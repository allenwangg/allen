// Prism build — inlines CSS and JS into a single self-contained dist/prism.html.
// Usage: node build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
let html = readFileSync(join(root, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) =>
  `<style>\n${readFileSync(join(root, href), 'utf8')}\n</style>`);

html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) =>
  `<script>\n${readFileSync(join(root, src), 'utf8')}\n</script>`);

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'prism.html'), html);
console.log(`dist/prism.html written (${(html.length / 1024).toFixed(0)} KB)`);
