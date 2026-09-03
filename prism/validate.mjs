// Prism content validator — structural checks on js/data/courses.js.
// Usage: node validate.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(root, 'js/data/courses.js'), 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const courses = sandbox.window.COURSES_FULL || sandbox.window.COURSES;

const ART = new Set(['anchor','atom','balance','bell','book','brain','bridge','camera','cell','clock','coin','column','compass','crown','crystal','dialog','dna','door','eye','feather','flame','flask','fork','funnel','gavel','gear','globe','graph','grid','heart','hourglass','key','ladder','layers','leaf','lens','lightbulb','lock','loop','magnet','map','mask','microscope','mirror','mountain','network','note','orbit','palette','path','pen','pill','puzzle','pyramid','seed','shield','ship','spectrum','target','telescope','tree','wave']);
const TYPES = new Set(['intro','concept','example','quote','mcq','truefalse','reveal','recap']);
const INTERACTIVE = new Set(['mcq','truefalse','reveal']);

const errs = [], warns = [];
const e = (m) => errs.push(m);
const w = (m) => warns.push(m);

if (!Array.isArray(courses) || courses.length === 0) e('COURSES missing or empty');

const cids = new Set();
for (const c of courses || []) {
  const cp = `[${c.id}]`;
  if (!c.id || cids.has(c.id)) e(`${cp} missing/duplicate course id`);
  cids.add(c.id);
  for (const k of ['title','tagline','category','description']) if (!c[k]) e(`${cp} missing ${k}`);
  if (!Array.isArray(c.lessons) || c.lessons.length === 0) { e(`${cp} no lessons`); continue; }
  const lids = new Set();
  for (const l of c.lessons) {
    const lp = `[${c.id}/${l.id}]`;
    if (!l.id || lids.has(l.id)) e(`${lp} missing/duplicate lesson id`);
    lids.add(l.id);
    if (!l.title || !l.summary) e(`${lp} missing title/summary`);
    if (!Array.isArray(l.cards) || l.cards.length < 7) { e(`${lp} too few cards`); continue; }
    if (l.cards[0].type !== 'intro') e(`${lp} first card must be intro`);
    if (l.cards[l.cards.length - 1].type !== 'recap') e(`${lp} last card must be recap`);
    let interactive = 0, prevInteractiveType = null;
    const artUsed = new Set();
    l.cards.forEach((card, i) => {
      const kp = `${lp} card ${i} (${card.type})`;
      if (!TYPES.has(card.type)) return e(`${kp} unknown type`);
      if (INTERACTIVE.has(card.type)) {
        interactive++;
        if (prevInteractiveType === card.type) w(`${kp} same interactive type twice in a row`);
        prevInteractiveType = card.type;
      } else prevInteractiveType = null;
      if (['intro','concept','example'].includes(card.type)) {
        if (!card.title) e(`${kp} missing title`);
        if (!card.body || card.body.length < 40) e(`${kp} body missing/too short`);
        if (card.body && card.body.length > 460) w(`${kp} body long (${card.body.length})`);
        if (!card.art || !ART.has(card.art)) e(`${kp} bad art key "${card.art}"`);
        else if (artUsed.has(card.art)) w(`${kp} art "${card.art}" reused in lesson`);
        artUsed.add(card.art);
        // Underscores appear legitimately in fill-in-the-blank cues ("hot: c___"),
        // so only flag runs of markdown emphasis that sit against word characters.
        if (/\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[.+\]\(.+\)/.test(card.body || '')) w(`${kp} markdown syntax in body`);
      }
      if (card.type === 'quote' && (!card.text || !card.by)) e(`${kp} quote needs text+by`);
      if (card.type === 'mcq') {
        if (!card.prompt || !Array.isArray(card.choices) || card.choices.length < 3 || card.choices.length > 4) e(`${kp} bad prompt/choices`);
        if (!Number.isInteger(card.answer) || card.answer < 0 || card.answer >= (card.choices || []).length) e(`${kp} answer index out of range`);
        if (!card.explain) e(`${kp} missing explain`);
      }
      if (card.type === 'truefalse') {
        if (!card.statement || typeof card.answer !== 'boolean' || !card.explain) e(`${kp} bad statement/answer/explain`);
      }
      if (card.type === 'reveal' && (!card.prompt || !card.answer)) e(`${kp} reveal needs prompt+answer`);
      if (card.type === 'recap' && (!Array.isArray(card.points) || card.points.length < 3)) e(`${kp} recap needs 3+ points`);
    });
    if (interactive < 3) e(`${lp} only ${interactive} interactive cards`);
    if (!Array.isArray(l.review) || l.review.length < 3) e(`${lp} needs 3+ review flashcards`);
    for (const r of l.review || []) {
      if (!r.front || !r.back) e(`${lp} review card missing front/back`);
      if (r.back && r.back.length > 200) w(`${lp} review back long (${r.back.length})`);
    }
  }
}

/* Every course category must belong to exactly one browse filter. A category in
   no theme leaves its courses reachable only under "All"; a category in two is
   dead weight, since themeOf() returns the first match. Both are silent in the
   UI, so they are caught here. */
const appSrc = readFileSync(join(root, 'js/app.js'), 'utf8');
const themeSrc = appSrc.match(/var THEMES = \[[\s\S]*?\n  \];/);
if (!themeSrc) e('could not read THEMES from js/app.js');
else {
  const themes = vm.runInNewContext('(' + themeSrc[0].replace('var THEMES = ', '').replace(/;$/, '') + ')');
  const seen = new Map();
  for (const t of themes) for (const cat of t.cats) {
    if (seen.has(cat)) e(`category "${cat}" is in two filters (${seen.get(cat)} and ${t.id}); only the first ever matches`);
    else seen.set(cat, t.id);
  }
  const used = new Set((courses || []).map(c => c.category));
  for (const cat of used) if (!seen.has(cat)) e(`category "${cat}" is in no browse filter — its courses show only under All`);
  for (const cat of seen.keys()) if (!used.has(cat)) w(`filter category "${cat}" has no courses`);
}

const nl = courses ? courses.reduce((n, c) => n + (c.lessons || []).length, 0) : 0;
const nc = courses ? courses.reduce((n, c) => n + (c.lessons || []).reduce((m, l) => m + (l.cards || []).length, 0), 0) : 0;
console.log(`${(courses || []).length} courses · ${nl} lessons · ${nc} cards`);
for (const m of warns) console.log('WARN ' + m);
for (const m of errs) console.log('ERR  ' + m);
if (errs.length) { console.log(`${errs.length} error(s)`); process.exit(1); }
console.log('content OK' + (warns.length ? ` (${warns.length} warnings)` : ''));
