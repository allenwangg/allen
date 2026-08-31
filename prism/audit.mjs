// Prism quiz-design audit — structural validation says a quiz is well-formed;
// this says whether it is actually a test of knowledge.
//
// A quiz leaks its answer when position, length or polarity correlates with
// correctness: a learner who always picks B, or always picks the longest
// option, or always answers "false", scores well while knowing nothing.
//
// Usage: node audit.mjs [--strict]
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = dirname(fileURLToPath(import.meta.url));
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(root, 'js/data/courses.js'), 'utf8'), sandbox);
const courses = sandbox.window.COURSES;
const strict = process.argv.includes('--strict');

const mcq = [], tf = [];
const perCourse = new Map();
for (const c of courses) {
  perCourse.set(c.id, { longest: 0, mcq: 0, true: 0, tf: 0 });
  const p = perCourse.get(c.id);
  for (const l of c.lessons) for (const k of l.cards) {
    if (k.type === 'mcq') {
      const lens = k.choices.map(s => s.length);
      const isLongest = lens[k.answer] === Math.max(...lens);
      mcq.push({ answer: k.answer, n: k.choices.length, isLongest });
      p.mcq++; if (isLongest) p.longest++;
    }
    if (k.type === 'truefalse') { tf.push(k.answer); p.tf++; if (k.answer) p.true++; }
  }
}

const fails = [];
const pct = (a, b) => b ? (100 * a / b) : 0;
const check = (name, value, lo, hi, note) => {
  const ok = value >= lo && value <= hi;
  console.log(`${ok ? 'OK  ' : 'FLAG'} ${name}: ${value.toFixed(1)}%  (target ${lo}–${hi}%)${note ? '  — ' + note : ''}`);
  if (!ok) fails.push(name);
};

console.log(`${mcq.length} multiple-choice · ${tf.length} true/false\n`);

// 1. position — a correct answer must not favour a slot
const pos = [0, 0, 0, 0];
for (const m of mcq) pos[m.answer]++;
console.log('correct-answer position: ' + pos.map((v, i) => `${'ABCD'[i]} ${pct(v, mcq.length).toFixed(1)}%`).join('  '));
check('worst position share', Math.max(...pos.map(v => pct(v, mcq.length))), 0, 40,
  'guessing one letter should not beat chance');

// 2. length — the elaborated option must not be the answer
const chance = pct(mcq.reduce((a, m) => a + 1 / m.n, 0), mcq.length);
check('correct option is longest', pct(mcq.filter(m => m.isLongest).length, mcq.length), 0, Math.round(chance) + 18,
  `chance is ~${chance.toFixed(0)}%`);

// 3. polarity — true/false must not lean one way
check('true/false answered true', pct(tf.filter(Boolean).length, tf.length), 35, 65,
  'always answering one way should not work');

const worst = [...perCourse.entries()]
  .filter(([, p]) => p.mcq >= 6)
  .map(([id, p]) => ({ id, longest: pct(p.longest, p.mcq), trueRate: pct(p.true, p.tf), mcq: p.mcq }))
  .sort((a, b) => b.longest - a.longest);
if (worst.length) {
  console.log('\nworst courses by length cue:');
  for (const w of worst.slice(0, 8)) console.log(`  ${w.longest.toFixed(0).padStart(3)}%  ${w.id} (${w.mcq} questions)`);
}

console.log();
if (fails.length) {
  console.log(`${fails.length} metric(s) outside target: ${fails.join(', ')}`);
  if (strict) process.exit(1);
} else console.log('quiz design OK');
