/**
 * ui.js — View rendering. Pure functions from state to HTML strings.
 *
 * Deliberately no framework. The whole app is six views over one state object;
 * a virtual DOM would be more code than it saves, and the diff churn here is
 * low enough that innerHTML swaps are imperceptible. Event handling is done by
 * delegation in app.js, so re-rendering never orphans a listener.
 */

import { FIELDS, GROUPS, LOWER_IS_BETTER, dateKey, parseDateKey } from './model.js';
import { PILLAR_LABELS, PILLAR_WEIGHTS } from './engine.js';
import { lineChart, radarChart, scoreRing, barChart, scatterChart, sparkline, esc } from './charts.js';

/* ---------------- shared bits ---------------- */

const fmtDelta = (v, unit = '') => {
  if (v == null) return '<span class="delta-flat">--</span>';
  const cls = v > 0.05 ? 'delta-good' : v < -0.05 ? 'delta-bad' : 'delta-flat';
  const sign = v > 0 ? '+' : '';
  return `<span class="${cls}">${sign}${v}${unit}</span>`;
};

const fmtP = (p) => (p == null ? '--' : p < 0.0001 ? '&lt;0.0001' : String(p));

/* ================================================================== *
 * TODAY
 * ================================================================== */

export function todayView(state) {
  const { report, entries } = state;
  if (!report || !report.today) {
    return `<div class="card empty-state">
      <h3>Welcome to VitalArc</h3>
      <p>Log your first day and you'll get a Healthspan Score immediately.<br>
      It takes about forty seconds.</p>
      <div style="display:flex;gap:9px;justify-content:center;flex-wrap:wrap">
        <div style="display:flex;gap:9px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-primary" data-action="goto" data-view="log">Log today</button>
        <button class="btn" data-action="load-sample">Look around with example data first</button>
      </div>
      </div>
    </div>`;
  }

  const t = report.today;
  const bio = report.bioAge;
  const trend = report.trendPerWeek;
  const smooth = state.smoothed || null;

  // Name the window that was actually used, which is however many days exist
  // up to 28 — claiming a longer window than the data covers is a small lie
  // that undermines everything else on the page.
  const trendWindow = Math.min(28, report.scored.length);
  const trendLine = trend == null
    ? '<span class="delta-flat">Not enough data yet</span>'
    : `${fmtDelta(trend)} points per week over ${trendWindow} days`;

  const pillarRadar = radarChart(
    Object.fromEntries(Object.entries(PILLAR_LABELS).map(([k, label]) => [k, { label, value: report.pillarAverages[k] }])),
    { size: state.narrow ? 320 : 300, label: 'Pillar balance (28-day average)' }
  );

  const scorePoints = report.scored.map((s) => ({ date: s.date, value: s.score }));

  return `
  <div class="card">
    <div class="hero">
      <div>${scoreRing(t.score, { sublabel: 'today' })}</div>
      <div>
        <h1 style="margin-bottom:6px">${headline(t.score)}</h1>
        <p class="muted" style="margin-bottom:14px">${trendLine}</p>
        ${bio ? `<div class="bioage">
            <span>Healthspan age</span>
            <strong>${bio.effectiveAge}</strong>
            <span>vs ${bio.chronologicalAge} actual</span>
          </div>
          <span class="confidence-tag" title="How much data backs this estimate">${esc(bio.confidence)} confidence</span>` : ''}
        <div class="grid grid-4" style="margin-top:16px">
          ${stat('7-day avg', report.avg7 ?? '--')}
          ${stat('28-day avg', report.avg28 ?? '--')}
          ${stat('Streak', report.streak + (report.streak === 1 ? ' day' : ' days'))}
          ${stat('Days logged', report.loggedDays)}
        </div>
      </div>
    </div>
    ${bio ? `<p class="disclaimer">
      <strong>Healthspan age is an illustrative estimate, not a medical measurement.</strong>
      It is derived from the habits you log using published dose-response relationships, and it is
      shown with a confidence level reflecting how much data supports it. It is not a diagnosis,
      not a biological-age clock, and not a substitute for advice from a clinician.
    </p>` : ''}
  </div>

  <div class="grid grid-2">
    <div class="card">
      <div class="card-head"><h2>Score history</h2><div class="spacer"></div>
        <span class="subtle">All ${entries.length} days</span></div>
      ${lineChart(scorePoints, {
        smooth, bands: [{ from: 70, to: 100 }], label: 'Healthspan Score over time',
        width: state.narrow ? 380 : 720,
        height: state.narrow ? 260 : 300,
      })}
      <p class="subtle" style="margin-top:8px">Solid line is your daily score. Dashed line is a 7-day smoothed average — that is the one to watch.</p>
    </div>
    <div class="card">
      <div class="card-head"><h2>Pillar balance</h2></div>
      ${pillarRadar}
      <p class="subtle">28-day averages. The shape matters more than any single point: a lopsided hexagon is where your easiest gains are.</p>
    </div>
  </div>

  <div class="card">
    <div class="card-head"><h2>Today's breakdown</h2><div class="spacer"></div>
      <button class="btn btn-sm" data-action="goto" data-view="log">Edit today</button></div>
    ${pillarTable(t)}
  </div>

  ${leverageCard(state)}
  `;
}

function headline(score) {
  if (score == null) return 'No score yet';
  if (score >= 85) return 'Excellent day';
  if (score >= 72) return 'Strong day';
  if (score >= 58) return 'Decent day';
  if (score >= 42) return 'Mixed day';
  return 'Rough day';
}

function stat(label, value, note = '') {
  return `<div class="stat"><div class="stat-label">${esc(label)}</div>
    <div class="stat-value">${esc(String(value))}</div>
    ${note ? `<div class="stat-note">${esc(note)}</div>` : ''}</div>`;
}

function pillarTable(scored) {
  const rows = Object.entries(scored.pillars).map(([key, p]) => {
    const contribution = p.score == null ? null : Math.round(p.score * p.weight * 10) / 10;
    return `<tr>
      <td><strong>${esc(PILLAR_LABELS[key])}</strong>
        <div class="subtle">${p.parts.filter((x) => x.score != null).map((x) => `${esc(x.key)} ${x.score}`).join(' · ') || 'not logged'}</div></td>
      <td class="num">${p.score == null ? '--' : p.score}</td>
      <td class="num col-optional">${Math.round(p.weight * 100)}%</td>
      <td class="num col-optional">${contribution == null ? '--' : contribution}</td>
    </tr>`;
  }).join('');
  return `<div class="table-wrap"><table class="table">
    <thead><tr><th>Pillar</th><th class="num">Score</th><th class="num col-optional">Weight</th><th class="num col-optional">Contribution</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    <p class="subtle" style="margin-top:8px">Unlogged pillars are excluded from the weighted average rather than counted as zero, so partial logging never unfairly drags your score down.</p>`;
}

function leverageCard(state) {
  const inner = !state.leverage || !state.leverage.length
    ? '<p class="muted">Log a few more days and we\'ll rank the changes that would move your score most.</p>'
    : barChart(state.leverage.map((l) => ({
        label: l.label, value: l.scoreDelta,
        display: `+${l.scoreDelta} pts${l.yearsDelta ? ` · ${l.yearsDelta} yrs` : ''}`,
      })), {
        label: 'Highest-leverage changes',
        width: state.narrow ? 380 : 720,
        barHeight: state.narrow ? 22 : 26,
        pad: state.narrow ? { t: 8, r: 74, b: 8, l: 150 } : { t: 8, r: 96, b: 8, l: 210 },
      });

  return `<div class="card">
    <div class="card-head"><h2>Your highest-leverage changes</h2></div>
    <p class="muted">Not generic advice. Each of these was simulated against <em>your own</em> 28-day average day, and ranked by the actual score change it produced.</p>
    ${inner}
  </div>`;
}

/* ================================================================== *
 * LOG
 * ================================================================== */

export function logView(state) {
  const entry = state.draft;
  const groups = Object.entries(GROUPS).map(([gid, g]) => {
    const fields = Object.entries(FIELDS).filter(([, f]) => f.group === gid);
    if (!fields.length) return '';
    const inner = fields.map(([name, f]) => fieldControl(name, f, entry[name])).join('');
    return `<div class="card">
      <div class="card-head"><h3>${esc(g.label)}</h3></div>
      ${inner}
    </div>`;
  }).join('');

  const d = parseDateKey(entry.date);
  const isToday = entry.date === dateKey();
  const dayName = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return `
  <div class="card">
    <div class="card-head">
      <h1 style="margin:0">${isToday ? 'Today' : esc(dayName)}</h1>
      <div class="spacer"></div>
      <button class="btn btn-sm" data-action="shift-day" data-delta="-1" aria-label="Previous day">&larr;</button>
      <input type="date" id="log-date" aria-label="Go to date" value="${esc(entry.date)}" max="${esc(dateKey())}" style="width:auto">
      <button class="btn btn-sm" data-action="shift-day" data-delta="1" aria-label="Next day" ${isToday ? 'disabled' : ''}>&rarr;</button>
    </div>
    <div class="grid grid-4">
      ${stat('Live score', state.draftScore?.score ?? '--')}
      ${stat('Sleep', state.draftScore?.pillars.sleep.score ?? '--')}
      ${stat('Movement', state.draftScore?.pillars.movement.score ?? '--')}
      ${stat('Nutrition', state.draftScore?.pillars.nutrition.score ?? '--')}
    </div>
    <p class="subtle" style="margin-top:10px">The score updates as you type. Everything saves locally on this device — nothing is uploaded.</p>
  </div>
  ${groups}
  <div class="card">
    <div class="field"><div class="field-head"><label for="notes">Notes</label></div>
      <textarea id="notes" data-field="notes" placeholder="Anything worth remembering about today…">${esc(entry.notes || '')}</textarea></div>
    <div style="display:flex;gap:9px;flex-wrap:wrap">
      <button class="btn btn-primary" data-action="save-entry">Save day</button>
      <button class="btn btn-ghost" data-action="goto" data-view="today">Cancel</button>
      <div class="spacer" style="flex:1"></div>
      <button class="btn btn-danger btn-sm" data-action="delete-entry">Delete this day</button>
    </div>
  </div>`;
}

function fieldControl(name, f, value) {
  const id = `f-${name}`;
  if (f.unit === 'bool') {
    return `<div class="field"><div class="field-head">
      <label id="${id}">${esc(f.label)}</label><div class="spacer"></div></div>
      <div class="seg" role="group" aria-labelledby="${id}">
        <button type="button" id="${id}-0" data-field="${name}" data-value="0" aria-pressed="${!value}">No</button>
        <button type="button" id="${id}-1" data-field="${name}" data-value="1" aria-pressed="${!!value}">Yes</button>
      </div></div>`;
  }
  if (f.unit === '/5' || f.unit === '/3') {
    const opts = [];
    for (let v = f.min; v <= f.max; v += f.step) opts.push(v);
    return `<div class="field"><div class="field-head">
      <label id="${id}">${esc(f.label)}</label><div class="spacer"></div>
      <span class="field-value">${value ?? '--'}${esc(f.unit)}</span></div>
      <div class="seg" role="group" aria-labelledby="${id}">
        ${opts.map((v) => `<button type="button" id="${id}-${v}" data-field="${name}" data-value="${v}" aria-pressed="${Number(value) === v}">${v}</button>`).join('')}
      </div></div>`;
  }
  if (f.unit === 'clock') {
    const v = value ?? f.default;
    const hh = String(Math.floor(v / 60) % 24).padStart(2, '0');
    const mm = String(v % 60).padStart(2, '0');
    return `<div class="field"><div class="field-head">
      <label for="${id}">${esc(f.label)}</label><div class="spacer"></div>
      <span class="field-value">${hh}:${mm}</span></div>
      <input type="range" id="${id}" data-field="${name}" min="${f.min}" max="${f.max}" step="${f.step}" value="${v}"
        aria-valuetext="${hh}:${mm}"></div>`;
  }
  const shown = value == null ? '--' : (Math.round(value * 100) / 100);
  return `<div class="field"><div class="field-head">
    <label for="${id}">${esc(f.label)}</label><div class="spacer"></div>
    <span class="field-value">${shown}${f.unit ? ' ' + esc(f.unit) : ''}</span></div>
    <input type="range" id="${id}" data-field="${name}" min="${f.min}" max="${f.max}" step="${f.step}" value="${value ?? f.default ?? f.min}"></div>`;
}

/* ================================================================== *
 * INSIGHTS
 * ================================================================== */

export function insightsView(state) {
  const res = state.insights;
  const wp = state.weekday;

  const weekdayCard = wp ? `<div class="card">
    <div class="card-head"><h2>Your week</h2></div>
    ${barChart(wp.stats.filter((s) => s.mean != null).map((s) => ({
      label: s.day, value: Math.round((s.mean - wp.overall) * 10) / 10,
      display: `${s.mean.toFixed(1)} (${s.mean >= wp.overall ? '+' : ''}${(s.mean - wp.overall).toFixed(1)})`,
    })), {
      signed: true, label: 'Score by weekday, relative to your average',
      width: state.narrow ? 380 : 720,
      pad: state.narrow ? { t: 8, r: 14, b: 8, l: 78 } : { t: 8, r: 14, b: 8, l: 118 },
    })}
    <p class="muted" style="margin-top:10px">Your best day is <strong>${esc(wp.best.day)}</strong> (${wp.best.mean}) and your worst is
    <strong>${esc(wp.worst.day)}</strong> (${wp.worst.mean}) — a spread of ${wp.spread} points.
    Most people find one specific day is quietly costing them; fixing that one day is usually easier than changing every day.</p>
  </div>` : '';

  // A user without enough data yet gets the explanation unblurred, whatever
  // their plan. Putting a paywall over the words "you need more data" tells
  // someone nothing useful and makes the product feel grabby at exactly the
  // moment they are deciding whether to keep going.
  if (!res || res.status === 'insufficient-data') {
    return `
    <div class="card">
      <div class="card-head"><h1 style="margin:0">Personal insights</h1></div>
      <div class="empty-state">
        <h3>Keep logging</h3>
        <p>${esc(res?.message || 'Log at least 21 days before this can say anything worth trusting.')}</p>
        <p class="subtle" style="max-width:520px;margin:12px auto 0">We don't show correlations early. With too few days,
        anything we found would be noise — and a health app that confidently reports noise is worse than one that says nothing.</p>
      </div>
    </div>
    ${weekdayCard}`;
  }

  let body;
  if (!res.findings.length) {
    body = `<div class="empty-state">
      <h3>Nothing statistically solid yet</h3>
      <p>${esc(res.message)}</p>
    </div>`;
  } else {
    body = res.findings.map((f) => insightCard(f, state)).join('');
  }

  return `
  <div class="card">
    <div class="card-head"><h1 style="margin:0">Personal insights</h1></div>
    <p class="muted">These are correlations found in <strong>your</strong> data — not population averages, and not advice
    copied from an article. Every one shown here survived a permutation test and a false-discovery-rate correction across
    ${res?.tested ? `${esc(String(res.tested))} relationship${res.tested === 1 ? '' : 's'}` : 'every relationship'} we tested.</p>
    <p class="disclaimer">Correlation is not causation. These patterns show what moves together in your log; they cannot
    prove one thing caused another, and a third factor may drive both. Treat them as hypotheses worth testing, not conclusions.</p>
  </div>
  ${body}
  ${weekdayCard}`;
}

function insightCard(f, state) {
  const driverLabel = FIELDS[f.driver]?.label || f.driver;
  const outcomeLabel = FIELDS[f.outcome]?.label || f.outcome;
  const good = (!LOWER_IS_BETTER.has(f.outcome)) === (f.r > 0);
  // Beneficial-looking correlations from harmful drivers (alcohol lowering
  // stress) are most likely confounds; the pill must not endorse the habit.
  const caution = good && LOWER_IS_BETTER.has(f.driver);
  const pairs = (state.pairCache?.[`${f.driver}|${f.outcome}|${f.lag}`]) || [];

  return `<div class="insight">
    <div class="insight-head">
      <span class="pill ${caution ? 'pill-info' : good ? 'pill-good' : 'pill-bad'}">${caution ? 'Likely a context effect' : good ? 'Working for you' : 'Costing you'}</span>
      <span class="pill pill-info">${esc(f.effect)} effect</span>
      ${f.deseasonalized ? '<span class="pill pill-info" title="This correlation was measured after removing your day-of-week rhythm from both series, so it is not just your weekend pattern.">weekday-adjusted</span>' : ''}
      ${f.detrended ? '<span class="pill pill-info" title="This correlation was measured after removing the slow trend from both series, so it is not just two habits drifting together over months.">trend-adjusted</span>' : ''}
      <span class="subtle">${f.lag === 0 ? 'same day' : `${f.lag}-day lag`} · n=${f.n}</span>
    </div>
    <div class="insight-body">
      <div>
        <div class="insight-text">${esc(f.text)}</div>
        <div class="insight-stats">
          <span title="Spearman rank correlation">r = ${f.r}</span>
          <span title="95% confidence interval">CI [${f.ci ? f.ci.join(', ') : '--'}]</span>
          <span title="Permutation p-value">p = ${fmtP(f.p)}</span>
          <span title="After false-discovery-rate correction">p<sub>adj</sub> = ${fmtP(f.pAdjusted)}</span>
        </div>
      </div>
      <div>${scatterChart(pairs, { xLabel: driverLabel, yLabel: outcomeLabel })}</div>
    </div>
  </div>`;
}

/* ================================================================== *
 * SIMULATOR
 * ================================================================== */

export function simulatorView(state) {
  const sim = state.simulation;
  const sliders = Object.entries(state.simChanges).map(([field, delta]) => {
    const f = FIELDS[field];
    if (!f) return '';
    const range = simRange(field, f);
    return `<div class="field">
      <div class="field-head"><label for="sim-${field}">${esc(f.label)}</label><div class="spacer"></div>
        <span class="field-value">${delta > 0 ? '+' : ''}${Math.round(delta * 100) / 100}${f.unit && f.unit !== 'bool' && f.unit !== 'clock' ? ' ' + esc(f.unit) : ''}</span></div>
      <input type="range" id="sim-${field}" data-sim="${field}" min="${range.min}" max="${range.max}" step="${range.step}" value="${delta}">
    </div>`;
  }).join('');

  const inner = `
    <div class="grid grid-2">
      <div>
        <h3>Adjust your average day</h3>
        <p class="subtle">Each slider is a change relative to your 28-day average, not an absolute value.</p>
        ${sliders}
        <button class="btn btn-ghost btn-sm" data-action="reset-sim">Reset all</button>
      </div>
      <div>
        <div class="grid grid-2" style="grid-template-columns:1fr 1fr">
          ${stat('Current', sim?.baseline?.score ?? '--')}
          ${stat('Projected', sim?.projected?.score ?? '--')}
        </div>
        <div class="card" style="margin-top:14px;background:var(--surface-2)">
          <div class="stat-label">Score change</div>
          <div class="stat-value">${fmtDelta(sim?.scoreDelta)} points</div>
          <div class="stat-label" style="margin-top:12px">Healthspan age change</div>
          <div class="stat-value">${sim?.yearsDelta == null ? '--' :
            `<span class="${sim.yearsDelta < 0 ? 'delta-good' : sim.yearsDelta > 0 ? 'delta-bad' : 'delta-flat'}">${sim.yearsDelta > 0 ? '+' : ''}${sim.yearsDelta} years</span>`}</div>
        </div>
        ${sim ? barChart(Object.entries(sim.pillarDeltas)
            .filter(([, v]) => Math.abs(v) > 0.05)
            .map(([k, v]) => ({ label: PILLAR_LABELS[k], value: v, display: (v > 0 ? '+' : '') + v })),
            { signed: true, label: 'Pillar impact', width: 460, pad: { t: 8, r: 50, b: 8, l: 96 } }) : ''}
      </div>
    </div>`;

  return `
  <div class="card">
    <div class="card-head"><h1 style="margin:0">What-if simulator</h1></div>
    <p class="muted">Test a change before you commit to it. This runs the same scoring engine against your own
    28-day average day, so the answer is specific to you — someone who already sleeps eight hours gets almost nothing
    from sleeping more, and the simulator will tell them so.</p>
    ${inner}
  </div>`;
}

function simRange(field, f) {
  const span = f.max - f.min;
  const bound = Math.min(span, field === 'steps' ? 8000 : field === 'caffeineAfter2pm' ? 400 : field === 'bedtimeMinutes' ? 180 : span / 2);
  return { min: -Math.round(bound), max: Math.round(bound), step: f.step };
}

/* ================================================================== *
 * HISTORY
 * ================================================================== */

export function historyView(state) {
  const rows = [...state.visible].reverse().map((e) => {
    const s = state.report.scored.find((x) => x.date === e.date);
    return `<tr>
      <td><button class="btn btn-ghost btn-sm" data-action="edit-day" data-date="${esc(e.date)}">${esc(e.date)}</button></td>
      <td class="num"><strong>${s?.score ?? '--'}</strong></td>
      ${Object.keys(PILLAR_WEIGHTS).map((k) => `<td class="num">${s?.pillars[k]?.score ?? '--'}</td>`).join('')}
      <td class="subtle">${esc((e.notes || '').slice(0, 60))}</td>
    </tr>`;
  }).join('');


  return `
  <div class="card">
    <div class="card-head"><h1 style="margin:0">History</h1><div class="spacer"></div>
      <button class="btn btn-sm" data-action="export">Export JSON</button>
      <button class="btn btn-sm" data-action="export-csv">Export CSV</button>
      <button class="btn btn-sm" data-action="import">Import</button>
    </div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Date</th><th class="num">Score</th>
      ${Object.values(PILLAR_LABELS).map((l) => `<th class="num">${esc(l.slice(0, 4))}</th>`).join('')}
      <th>Notes</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="9" class="center muted">No entries yet.</td></tr>'}</tbody>
    </table></div>
  </div>`;
}

/* ================================================================== *
 * REPORT — print-friendly summary to take to a clinician
 * ================================================================== */

export function reportView(state) {
  const r = state.report;
  if (!r || !r.today) {
    return `<div class="card empty-state"><h3>Nothing to report yet</h3>
      <p>Log some days first — the report summarises whatever you have.</p></div>`;
  }
  const p = state.profile;
  const bio = r.bioAge;
  const findings = state.insights?.findings || [];
  const today = dateKey();

  const pillarRows = Object.entries(PILLAR_LABELS).map(([k, label]) => `
    <tr><td>${esc(label)}</td>
      <td class="num">${r.pillarAverages[k] ?? '--'}</td>
      <td class="num">${Math.round(PILLAR_WEIGHTS[k] * 100)}%</td></tr>`).join('');

  const findingRows = findings.length
    ? findings.map((f) => `<tr>
        <td>${esc(FIELDS[f.driver]?.label || f.driver)} &rarr; ${esc(FIELDS[f.outcome]?.label || f.outcome)}</td>
        <td class="num">${f.lag}d</td>
        <td class="num">${f.r}</td>
        <td class="num">${f.ci ? `[${f.ci[0]}, ${f.ci[1]}]` : '--'}</td>
        <td class="num">${f.pAdjusted < 0.0001 ? '&lt;0.0001' : f.pAdjusted}</td>
        <td class="num">${f.n}</td>
      </tr>`).join('')
    : `<tr><td colspan="6" class="muted">No relationships survived significance testing yet
       (${state.insights?.tested || 0} tested at FDR q=0.10). That is a real result, not missing data.</td></tr>`;

  const inner = `
  <div id="print-report">
    <div class="card">
      <div class="card-head"><h2 style="margin:0">VitalArc summary</h2><div class="spacer"></div>
        <span class="subtle">Generated ${esc(today)} &middot; ${r.loggedDays} days logged &middot; self-reported data</span></div>
      <div class="grid grid-4">
        ${`<div class="stat"><div class="stat-label">28-day score</div><div class="stat-value">${r.avg28 ?? '--'}</div></div>`}
        ${`<div class="stat"><div class="stat-label">Trend / week</div><div class="stat-value">${r.trendPerWeek == null ? '--' : (r.trendPerWeek > 0 ? '+' : '') + r.trendPerWeek}</div></div>`}
        ${`<div class="stat"><div class="stat-label">Adherence</div><div class="stat-value">${r.adherence ? Math.round(r.adherence.ratio * 100) + '%' : '--'}</div></div>`}
        ${`<div class="stat"><div class="stat-label">Sleep regularity</div><div class="stat-value">${r.regularity ? '&plusmn;' + r.regularity.sdMinutes + 'm' : '--'}</div></div>`}
      </div>
      ${bio ? `<p style="margin-top:12px">Healthspan age estimate: <strong>${bio.effectiveAge}</strong> against a
        chronological ${bio.chronologicalAge} (${esc(bio.confidence)} confidence). This is an illustrative habit-derived
        estimate, not a clinical measurement.</p>` : ''}
      <p class="subtle">Profile: age ${esc(String(p.age ?? '--'))}, bodyweight ${esc(String(p.weightKg ?? '--'))} kg.
        All data below is self-reported by the user through daily logging.</p>
    </div>

    <div class="card">
      <h3>Pillars — 28-day averages</h3>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Pillar</th><th class="num">Avg score</th><th class="num">Weight</th></tr></thead>
        <tbody>${pillarRows}</tbody></table></div>
    </div>

    <div class="card">
      <h3>Statistically significant relationships</h3>
      <p class="subtle">Spearman rank correlations at 0-2 day lags, permutation-tested, Benjamini-Hochberg corrected.
      Correlation does not establish causation; a shared third factor may drive both sides.</p>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Relationship</th><th class="num">Lag</th><th class="num">r</th><th class="num">95% CI</th><th class="num">p (adj)</th><th class="num">n</th></tr></thead>
        <tbody>${findingRows}</tbody></table></div>
    </div>

    <div class="card">
      <p class="disclaimer">This report was generated by VitalArc, a consumer wellness and habit-tracking application.
      It is not a medical record, not a diagnostic instrument, and all underlying data is self-reported. The Healthspan
      Score is a habit-quality index built from published population-level dose-response relationships; methodology at
      the project repository. Clinical decisions should not be based on this document.</p>
    </div>
  </div>`;

  return `
  <div class="card no-print">
    <div class="card-head"><h1 style="margin:0">Report</h1>
      <div class="spacer"></div>
      <button class="btn btn-primary" data-action="print-report">Print / save as PDF</button>
    </div>
    <p class="muted">A clean, printable summary of your data — the thing to hand a doctor instead of
    your phone. Uses your browser's print dialog, so "Save as PDF" works everywhere with nothing uploaded.</p>
  </div>
  ${inner}`;
}

/* ================================================================== *
 * SETTINGS
 * ================================================================== */

export function settingsView(state) {
  const p = state.profile;
  return `
  <div class="card">
    <h1>Settings</h1>
    <div class="grid grid-2">
      <div class="field"><div class="field-head"><label for="p-age">Age</label></div>
        <input type="number" id="p-age" data-profile="age" min="13" max="110" value="${esc(String(p.age ?? 35))}"></div>
      <div class="field"><div class="field-head"><label for="p-weight">Bodyweight (kg)</label></div>
        <input type="number" id="p-weight" data-profile="weightKg" min="25" max="300" step="0.5" value="${esc(String(p.weightKg ?? 75))}"></div>
      <div class="field"><div class="field-head"><label for="p-height">Height (cm)</label></div>
        <input type="number" id="p-height" data-profile="heightCm" min="120" max="230" step="1" value="${esc(String(p.heightCm ?? ''))}" placeholder="optional"></div>
    </div>
    <p class="subtle">Age calibrates the resting-heart-rate and HRV reference ranges. Bodyweight scales the protein target.
    Height turns a logged waist measurement into a waist-to-height ratio — without it, waist is recorded but not scored.</p>
  </div>

  <div class="card">
    <h3>Appearance</h3>
    <div class="seg" style="max-width:340px">
      ${['system', 'light', 'dark'].map((t) => `<button type="button" data-theme-set="${t}" aria-pressed="${state.theme === t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
    </div>
  </div>

  <div class="card">
    <h3>Your data</h3>
    <p class="muted">Everything you log is stored on this device only. There is no account, no server copy, and
    no analytics on your health data. That's why export matters — it's your only backup.</p>
    <div style="display:flex;gap:9px;flex-wrap:wrap">
      <button class="btn" data-action="export">Export JSON</button>
      <button class="btn" data-action="export-csv">Export CSV</button>
      <button class="btn" data-action="import">Import</button>
      <div class="spacer" style="flex:1"></div>
      <button class="btn btn-danger" data-action="wipe">Delete everything</button>
    </div>
    <p class="subtle" style="margin-top:10px">Storage backend in use: <span class="mono">${esc(state.storageMode || 'detecting…')}</span> ·
    ${state.entries.length} ${state.entries.length === 1 ? 'day' : 'days'} stored.</p>
  </div>

  <div class="card">
    <h3>About the science</h3>
    <p class="muted">The scoring curves, their sources, and the statistical method behind insights are documented
    in full rather than hidden. You should be able to argue with your own score.</p>
    <p class="disclaimer">VitalArc is a wellness tool, not a medical device. It does not diagnose, treat, cure or
    prevent disease. The Healthspan Age figure is an illustrative estimate derived from self-reported habits, not a
    clinical measurement of biological age. Always consult a qualified clinician about your health.</p>
  </div>`;
}
