// Prism build — inlines CSS and JS into a single self-contained dist/prism.html.
// Usage: node build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
let html = readFileSync(join(root, 'index.html'), 'utf8');

// the single-file build travels alone: manifest, icons and service worker are
// all sibling files it will not have, so drop the links rather than ship 404s
html = html.replace(/^ *<link rel="(?:manifest|apple-touch-icon|mask-icon)"[^>]*>\n/gm, '');

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) =>
  `<style>\n${readFileSync(join(root, href), 'utf8')}\n</style>`);

html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) =>
  `<script>\n${readFileSync(join(root, src), 'utf8')}\n</script>`);

// The standalone file has no sibling to lazy-load, so the card text is inlined
// straight after the metadata. app.js sees window.COURSES_FULL already present
// and merges on first use instead of fetching.
html = html.replace('<script src="js/data/index.js"></script>', '');
html = html.replace(/(<script>\s*\/\* Prism — course metadata[\s\S]*?<\/script>)/, (m) =>
  m + `\n<script>\n${readFileSync(join(root, 'js/data/courses.js'), 'utf8')}\n</script>`);

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'prism.html'), html);
console.log(`dist/prism.html written (${(html.length / 1024).toFixed(0)} KB)`);
