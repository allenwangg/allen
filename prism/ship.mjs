// Prism — merge any newly-authored courses, validate, rebuild and report.
// Usage: node ship.mjs [stagedDir]   (default: the session scratchpad staging dir)
import { readFileSync, writeFileSync, readdirSync, existsSync, copyFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const staged = process.argv[2] ||
  '/tmp/claude-0/-home-user-allen/8d3529e6-69ef-5e60-bc56-972491d924e6/scratchpad/staged';
const COURSES = join(root, 'js/data/courses.js');

const parse = (src) => JSON.parse(src.slice(src.indexOf('['), src.lastIndexOf(';')).replace(/<\\\//g, '</'));
const courses = parse(readFileSync(COURSES, 'utf8'));
const byId = new Map(courses.map((c, i) => [c.id, i]));

// A course only ships if it is structurally complete — a half-written file must
// never reach the library, so the same gate runs here as in validate.mjs.
function complete(c) {
  if (!c || !Array.isArray(c.lessons) || c.lessons.length !== 4) return false;
  let cards = 0, review = 0;
  for (const l of c.lessons) {
    if (!Array.isArray(l.cards) || !Array.isArray(l.review)) return false;
    if (l.cards[0]?.type !== 'intro' || l.cards[l.cards.length - 1]?.type !== 'recap') return false;
    cards += l.cards.length; review += l.review.length;
  }
  return cards >= 44 && review === 16;
}

const added = [], updated = [], rejected = [];
if (existsSync(staged)) {
  for (const f of readdirSync(staged).filter(f => /^course-.*\.json$/.test(f)).sort()) {
    let c;
    try { c = JSON.parse(readFileSync(join(staged, f), 'utf8')); }
    catch { rejected.push(f + ' (unparseable)'); continue; }
    if (!complete(c)) { rejected.push(c.id || f); continue; }
    if (byId.has(c.id)) { courses[byId.get(c.id)] = c; updated.push(c.id); }
    else { courses.push(c); byId.set(c.id, courses.length - 1); added.push(c.id); }
  }
}

const banner = '/* Prism — course content.\n   Authored and fact-checked content; structure validated by validate.mjs. */\n';
writeFileSync(COURSES, banner + 'window.COURSES = ' +
  JSON.stringify(courses, null, 2).replace(/<\//g, '<\\/') + ';\n');

let nl = 0, nc = 0, nr = 0;
for (const c of courses) for (const l of c.lessons) { nl++; nc += l.cards.length; nr += l.review.length; }

// keep the README's headline figures and course list honest automatically
let readme = readFileSync(join(root, 'README.md'), 'utf8');
readme = readme.replace(/- \*\*\d+ courses, \d+ lessons, [\d,]+ cards\*\*[^\n]*\n  [^\n]*/,
  `- **${courses.length} courses, ${nl} lessons, ${nc.toLocaleString()} cards** of original, fact-checked content spanning psychology, philosophy, science, history, economics, health, technology, business, world cultures and the arts:\n  ${courses.map(c => c.title).join(', ')}.`);
writeFileSync(join(root, 'README.md'), readme);

console.log(`added ${added.length}${added.length ? ': ' + added.join(', ') : ''}`);
if (updated.length) console.log(`updated ${updated.length}: ${updated.join(', ')}`);
if (rejected.length) console.log(`REJECTED (incomplete, left staged): ${rejected.join(', ')}`);
console.log(`library: ${courses.length} courses · ${nl} lessons · ${nc} cards · ${nr} flashcards`);

execSync('node ' + join(root, 'validate.mjs'), { stdio: 'inherit' });
execSync('node ' + join(root, 'build.mjs'), { stdio: 'inherit' });
copyFileSync(join(root, 'dist/prism.html'), join(root, 'release/prism.html'));
console.log('release/prism.html refreshed');
