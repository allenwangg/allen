import { readFileSync, writeFileSync } from "node:fs";

const r = JSON.parse(readFileSync("test/results.json", "utf8"));
const n = r.tests.length, passed = r.tests.filter(t => t.pass).length;
if (passed !== n) { console.error(`refusing: ${n - passed} failing`); process.exit(1); }

const kb = b => `${(b / 1024).toFixed(1)} KB`;
const ms = v => `${Math.round(v)} ms`;
const subs = [
  [/(\| Automated test suite \| none public \| ✅ )\d+( tests, run on CI \|)/, `$1${n}$2`],
  [/(## 2\. Functional correctness — )\d+\/\d+( passing)/, `$1${n}/${n}$2`],
  [/(\| First Contentful Paint \| \*\*)[^*]+(\*\* \|)/, `$1${ms(r.perf.medianFCPms)}$2`],
  [/(\| DOMContentLoaded \| \*\*)[^*]+(\*\* \|)/, `$1${ms(r.perf.medianDOMContentLoadedms)}$2`],
  [/(\| HTTP requests \| \*\*)\d+(\*\*)/, `$1${r.perf.totalRequests}$2`],
  [/(\| Page weight \| \*\*)[^*]+(\*\*)/, `$1${kb(r.weight.htmlBytes)} raw / ${kb(r.weight.gzipBytes)} gzipped$2`],
];

let md = readFileSync("RESULTS.md", "utf8");
for (const [re, to] of subs) {
  if (!re.test(md)) { console.error(`no match: ${re}`); process.exit(1); }
  md = md.replace(re, to);
}
const block = r.tests.map(t => `${t.pass ? "PASS" : "FAIL"}  ${t.name}`).join("\n") + `\n\n${passed}/${n} tests passed`;
const blockRe = /(## 2[\s\S]*?```\n)[\s\S]*?(\n```)/;
if (!blockRe.test(md)) { console.error("PASS block not matched"); process.exit(1); }
md = md.replace(blockRe, (_, a, b) => a + block + b);

if (/NaN|undefined/.test(md)) { console.error("refusing: NaN/undefined in output"); process.exit(1); }
writeFileSync("RESULTS.md", md);
console.log(`✓ ${passed}/${n}, FCP ${ms(r.perf.medianFCPms)}, DCL ${ms(r.perf.medianDOMContentLoadedms)}, ${kb(r.weight.htmlBytes)} raw`);
