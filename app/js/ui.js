/**
 * ui.js — View rendering. Pure functions from state to HTML strings.
 *
 * Deliberately no framework. The whole app is six views over one state object;
 * a virtual DOM would be more code than it saves, and the diff churn here is
 * low enough that innerHTML swaps are imperceptible. Event handling is done by
 * delegation in app.js, so re-rendering never orphans a listener.
 */

import { FIELDS, GROUPS, dateKey, parseDateKey, daysBetween, SEVERITY, AMOUNT, SEVERITY_MAX } from './model.js';
import { PILLAR_LABELS, PILLAR_WEIGHTS } from './engine.js';
import { leversFor, getLever, leverForDriver, trialDays, trialEndDate, daysRemaining, isComplete, schedule, floorP, MIN_PAIRS as TRIAL_MIN_PAIRS, DEFAULT_PAIRS } from './experiments.js';
import { sensitivityNote, labelFor, isLowerBetter } from './insights.js';
import { lineChart, radarChart, barChart, scatterChart, esc } from './charts.js';

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

/**
 * Today.
 *
 * This used to open with a big score ring and a "healthspan age" — both of
 * which this codebase's own comments admit were chosen because they are
 * shareable and retention-driving. Neither helps anybody feel better, and a
 * confident composite number at the top teaches you to watch the number
 * instead of the thing that is actually wrong.
 *
 * So the order is now: how the thing you came here about has been, then the
 * one change most worth making today, and only then the habit summary. The
 * score survives because "how have my habits been" is a fair question; it just
 * is not the first one.
 */
export function todayView(state) {
  const { report, entries } = state;
  if (!report || !report.today) {
    return `<div class="card empty-state">
      <h3>Nothing logged yet</h3>
      <p>Log a day and this fills in. If something specific brought you here, add it as a
      symptom first — that is the thing everything else will try to explain.</p>
      <div style="display:flex;gap:9px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-primary" data-action="goto" data-view="log">Log today</button>
        <button class="btn" data-action="goto" data-view="settings">Add a symptom</button>
        <button class="btn btn-ghost" data-action="load-sample">Look around with example data</button>
      </div>
    </div>`;
  }

  const t = report.today;
  const trend = report.trendPerWeek;
  const trendWindow = Math.min(28, report.scored.length);
  const symptoms = (state.symptoms || []).filter((x) => !x.archivedAt);
  const running = (state.trials || []).find((x) => x.status === 'running');

  return `
  ${symptomCard(state, symptoms)}
  ${todayFocus(state, running)}

  <div class="grid grid-2">
    <div class="card">
      <div class="card-head"><h2>How your habits have been</h2><div class="spacer"></div>
        <span class="subtle">${t.score ?? '--'} on ${t.date === dateKey() ? 'today' : esc(t.date)}</span></div>
      ${lineChart(report.scored.map((x) => ({ date: x.date, value: x.score })), {
        smooth: state.smoothed, bands: [{ from: 70, to: 100 }],
        label: 'Habit score over time',
        width: state.narrow ? 380 : 720, height: state.narrow ? 220 : 240,
      })}
      <p class="subtle" style="margin-top:8px">
        ${trend == null ? 'Not enough days yet to call a direction.'
          : `${fmtDelta(trend)} points per week over ${trendWindow} days.`}
        This is a summary of what you did, not of how you are.</p>
    </div>
    <div class="card">
      <div class="card-head"><h2>Where the gaps are</h2></div>
      ${radarChart(
        Object.fromEntries(Object.entries(PILLAR_LABELS).map(([k, label]) => [k, { label, value: report.pillarAverages[k] }])),
        { size: state.narrow ? 320 : 300, label: 'Pillar balance (28-day average)' }
      )}
      <p class="subtle">28-day averages. A lopsided shape is where the easiest changes are.</p>
    </div>
  </div>

  <div class="card">
    <div class="card-head"><h2>Today in detail</h2><div class="spacer"></div>
      <button class="btn btn-sm" data-action="goto" data-view="log">Edit today</button></div>
    ${pillarTable(t)}
  </div>`;
}

/** The thing you came here about, first. */
function symptomCard(state, symptoms) {
  if (!symptoms.length) {
    return `<div class="card">
      <div class="card-head"><h2>What's bothering you?</h2></div>
      <p class="muted">Right now this is tracking habits in the abstract. If there is something
      specific — headaches, gut trouble, joint pain, low mood, anything — name it and every
      other number here starts working on that question instead.</p>
      <button class="btn btn-primary" data-action="goto" data-view="settings">Add a symptom</button>
    </div>`;
  }
  const entries = state.entries || [];
  const recent = entries.slice(-28);
  const cards = symptoms.map((sym) => {
    const vals = recent.map((e) => e.symptoms?.[sym.id]).filter((v) => v != null);
    const all = entries.map((e) => ({ date: e.date, value: e.symptoms?.[sym.id] ?? null }));
    const anyDays = vals.filter((v) => v > 0).length;
    const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const half = Math.floor(vals.length / 2);
    const shift = vals.length >= 8 ? mean(vals.slice(half)) - mean(vals.slice(0, half)) : null;
    const dir = shift == null ? null : shift < -0.3 ? 'better' : shift > 0.3 ? 'worse' : 'steady';
    return `<div class="card" style="margin:0">
      <div class="card-head"><h3 style="margin:0">${esc(sym.label)}</h3><div class="spacer"></div>
        ${dir ? `<span class="pill ${dir === 'better' ? 'pill-good' : dir === 'worse' ? 'pill-bad' : 'pill-info'}">${dir}</span>` : ''}</div>
      <p class="muted" style="margin-bottom:8px">
        ${vals.length ? `Some of it on <strong>${anyDays}</strong> of your last ${vals.length} logged days.`
                      : 'Not logged yet.'}</p>
      ${lineChart(all.slice(-60), { min: 0, max: 4, yTicks: [0, 2, 4], label: `${sym.label} over time`,
        width: state.narrow ? 360 : 460, height: 130, showDots: 0 })}
    </div>`;
  }).join('');
  return `<div class="grid ${symptoms.length > 1 ? 'grid-2' : ''}" style="margin-bottom:16px">${cards}</div>`;
}

/** One thing worth doing today — or the trial's instruction, which outranks it. */
function todayFocus(state, running) {
  if (running) {
    const lever = getLever(running.leverId, state.factors);
    const arm = schedule(running).find((d) => d.date === dateKey())?.arm;
    if (lever && arm) {
      return `<div class="card">
        <div class="card-head"><h2>Today's job</h2><div class="spacer"></div>
          <span class="pill pill-info">trial day</span></div>
        <p style="font-size:1.1rem;margin-bottom:6px"><strong>${arm === 'on' ? esc(lever.onText) : esc(lever.offText)}</strong>.</p>
        <p class="muted">You are ${daysRemaining(running, dateKey())} ${daysRemaining(running, dateKey()) === 1 ? 'day' : 'days'} from the end of your
        ${esc(lever.label.toLowerCase())} trial. Doing the OFF days properly matters as much as the
        ON days — without the contrast there is nothing to compare.</p>
        <button class="btn btn-sm" data-action="goto" data-view="trials">See the trial</button>
      </div>`;
    }
  }
  const top = (state.leverage || [])[0];
  if (!top) return '';
  return `<div class="card">
    <div class="card-head"><h2>If you change one thing today</h2></div>
    <p style="font-size:1.1rem;margin-bottom:6px"><strong>${esc(top.label)}.</strong></p>
    <p class="muted">Of everything the app can simulate against your own average day, this one
    moves your habit score most (${top.scoreDelta > 0 ? '+' : ''}${top.scoreDelta} points). That is a
    statement about your habits, not a promise about how you will feel — if you want to know
    whether it actually helps <em>you</em>, run it as a trial.</p>
    <button class="btn btn-sm" data-action="goto" data-view="trials">Test it properly</button>
  </div>`;
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
        display: `+${l.scoreDelta} pts`,
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

  const symptomCard = symptomLogCard(state);
  const factorCard = factorLogCard(state);

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
  ${symptomCard}
  ${factorCard}
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

/**
 * The daily symptom card.
 *
 * Deliberately not sliders. Someone tracking five symptoms should not face
 * five more sliders every morning — on most days the honest answer to all of
 * them is "none", so the row defaults there and a normal day costs zero taps.
 * Five discrete targets per symptom means one tap when the answer is not none.
 */
function symptomLogCard(state) {
  const active = (state.symptoms || []).filter((s) => !s.archivedAt);
  if (!active.length) {
    return `<div class="card">
      <div class="card-head"><h3>Symptoms</h3></div>
      <p class="muted">Nothing tracked yet. If something specific brought you here — headaches,
      gut trouble, joint pain, low mood, whatever it is — name it and this will try to work out
      what moves with it.</p>
      <button class="btn btn-sm" data-action="goto" data-view="settings">Add a symptom</button>
    </div>`;
  }
  const rows = active.map((sym) => {
    const v = state.draft.symptoms?.[sym.id] ?? 0;
    return `<div class="sym-row">
      <div class="sym-label" id="sym-${esc(sym.id)}">${esc(sym.label)}${sym.primary ? ' <span class="subtle">· main</span>' : ''}</div>
      <div class="seg sym-seg" role="group" aria-labelledby="sym-${esc(sym.id)}">
        ${SEVERITY.map((sv) => `<button type="button" id="sym-${esc(sym.id)}-${sv.value}"
          data-symptom="${esc(sym.id)}" data-value="${sv.value}"
          aria-pressed="${Number(v) === sv.value}" title="${esc(sv.label)}">${esc(sv.short)}</button>`).join('')}
      </div>
    </div>`;
  }).join('');
  return `<div class="card">
    <div class="card-head"><h3>Symptoms</h3><div class="spacer"></div>
      <span class="subtle">Left alone means you didn't have it</span></div>
    ${rows}
  </div>`;
}

/**
 * The daily factor card.
 *
 * Same shape as the symptom card, and for the same reason: someone tracking
 * three suspicions should not face three more sliders. Amounts are coarse on
 * purpose — "some dairy" is the honest resolution for this kind of thing, and
 * a 0-10 scale would invite precision the observation cannot carry.
 */
function factorLogCard(state) {
  const active = (state.factors || []).filter((f) => !f.archivedAt);
  if (!active.length) {
    return `<div class="card">
      <div class="card-head"><h3>Things you suspect</h3></div>
      <p class="muted">If you have a hunch — dairy, a warm bedroom, screen time late, a long
      commute — track it here and the app will check whether your log agrees with you. The
      built-in habits below are a guess at what matters for most people; this is for what
      matters to you.</p>
      <button class="btn btn-sm" data-action="goto" data-view="settings">Add something</button>
    </div>`;
  }
  const rows = active.map((fac) => {
    const v = state.draft.factors?.[fac.id] ?? 0;
    return `<div class="sym-row">
      <div class="sym-label" id="fac-${esc(fac.id)}">${esc(fac.label)}</div>
      <div class="seg sym-seg fac-seg" role="group" aria-labelledby="fac-${esc(fac.id)}">
        ${AMOUNT.map((a) => `<button type="button" id="fac-${esc(fac.id)}-${a.value}"
          data-factor="${esc(fac.id)}" data-value="${a.value}"
          aria-pressed="${Number(v) === a.value}" title="${esc(a.label)}">${esc(a.short)}</button>`).join('')}
      </div>
    </div>`;
  }).join('');
  return `<div class="card">
    <div class="card-head"><h3>Things you suspect</h3><div class="spacer"></div>
      <span class="subtle">Left alone means none of it</span></div>
    ${rows}
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

  const weekdayCard = wp && wp.length ? `<div class="card">
    <div class="card-head"><h2>When it lands in the week</h2></div>
    ${wp.map((w) => `
      ${barChart(w.byDay.filter((b) => b.mean != null).map((b) => ({
        // Charted from zero, not from the best day: severity is an absolute
        // 0-4 scale, and anchoring at the minimum made a 1.9-vs-0.7 gap look
        // like a fourfold one.
        label: b.day, value: b.mean, display: `${b.mean.toFixed(1)}`,
      })), { max: SEVERITY_MAX,
        label: `${w.label} by day of the week, averaged over ${w.n} logged days`,
        width: state.narrow ? 380 : 720,
        pad: state.narrow ? { t: 8, r: 14, b: 8, l: 78 } : { t: 8, r: 14, b: 8, l: 118 },
      })}
      <p class="muted" style="margin-top:10px"><strong>${esc(w.label)}</strong> is worst on
      <strong>${esc(w.worst.day)}</strong> (${w.worst.mean.toFixed(1)} on a 0&ndash;4 scale) and
      best on <strong>${esc(w.best.day)}</strong> (${w.best.mean.toFixed(1)}) &mdash; a spread of
      ${w.spread.toFixed(1)} points. The day of the week accounts for
      ${Math.round(w.eta2 * 100)}% of how much it varies.</p>
      <div class="insight-stats"><span>&eta;&sup2; = ${w.eta2}</span><span>p<sub>adj</sub> = ${fmtP(w.pAdjusted)}</span><span>n = ${w.n}</span></div>
    `).join('<hr class="sep">')}
    <p class="subtle">This says when it happens, not why. A day of the week cannot cause anything
    on its own &mdash; it stands in for whatever is different about that day, which is worth
    thinking about and worth mentioning at an appointment.</p>
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
      <h3>Nothing held up</h3>
      <p>${esc(res.message)}</p>
      <p class="subtle" style="max-width:560px;margin:12px auto 0">${esc(sensitivityNote((state.entries || []).length))}</p>
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
    ${res?.families?.length ? `<div class="table-wrap" style="margin-top:12px"><table class="table">
      <thead><tr><th>Question</th><th class="num">Relationships tested</th><th class="num">Held up</th></tr></thead>
      <tbody>${res.families.map((f) => `<tr><td>${esc(f.label)}</td><td class="num">${f.tested}</td><td class="num">${f.found}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="subtle" style="margin-top:8px">The breakdown is just to show where the testing went —
    one correction covers all of it, so a finding has to clear the same bar whichever row it came from.
    A zero in the last column is a real answer, but read it as "nothing strong enough to see" rather
    than "nothing wrong". ${esc(sensitivityNote((state.entries || []).length))}</p>` : ''}
    <p class="disclaimer">Correlation is not causation. These patterns show what moves together in your log; they cannot
    prove one thing caused another, and a third factor may drive both. Treat them as hypotheses worth testing, not conclusions.</p>
  </div>
  ${body}
  ${weekdayCard}`;
}

function insightCard(f, state) {
  // labelFor/isLowerBetter, not FIELDS/LOWER_IS_BETTER — a user-defined
  // symptom is in neither, so the axis read "s_pdyd4jt8" and the verdict came
  // out inverted (more alcohol, more migraine, labelled "working for you").
  const driverLabel = labelFor(f.driver, state.symptoms, state.factors);
  const outcomeLabel = labelFor(f.outcome, state.symptoms, state.factors);
  const good = (!isLowerBetter(f.outcome)) === (f.r > 0);
  // Beneficial-looking correlations from harmful drivers (alcohol lowering
  // stress) are most likely confounds; the pill must not endorse the habit.
  const caution = good && isLowerBetter(f.driver);
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
        ${(() => {
          // A correlation is a hypothesis. Offer the experiment that would
          // settle it, pre-filled, rather than making the user rebuild it.
          const lever = leverForDriver(f.driver, state.factors);
          if (!lever) return '';
          return `<p style="margin:10px 0 0">
            <button class="btn btn-sm" data-action="test-finding"
              data-lever="${esc(lever.id)}" data-outcome="${esc(f.outcome)}">
              Test this properly
            </button>
            <span class="subtle" style="margin-left:8px">${esc(lever.label.toLowerCase())}, decided by coin toss</span>
          </p>`;
        })()}
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

/**
 * The doctor handoff.
 *
 * Ordered by what is useful in a ten-minute appointment, which is not the same
 * as what is impressive. The chief complaint and its timeline go first, then
 * the objective numbers, then what has already been ruled out — that last one
 * is the part that saves the most appointment time and it is the part only a
 * self-tracker can bring. Correlations go last, clearly labelled, because they
 * are the weakest evidence here and leading with them invites them to be taken
 * for more than they are.
 *
 * The scores and the healthspan-age figure are deliberately absent. They were
 * built to be shareable, they mean nothing to a clinician, and putting a
 * confident-looking composite number in front of someone is a good way to have
 * the rest of the page ignored.
 */
export function reportView(state) {
  const entries = state.entries || [];
  if (!entries.length) {
    return `<div class="card empty-state"><h3>Nothing to summarise yet</h3>
      <p>Log some days first — this page turns whatever you have into one page you can print
      and take with you.</p></div>`;
  }

  const p = state.profile;
  const today = dateKey();
  const first = entries[0].date, last = entries[entries.length - 1].date;
  const span = daysBetween(first, last) + 1;
  const symptoms = (state.symptoms || []).filter((x) => !x.archivedAt);
  const primary = symptoms.find((x) => x.primary) || symptoms[0];
  const findings = state.insights?.findings || [];
  const trials = (state.trials || []).filter((t) => t.status === 'complete' && t.result);
  // The unfiltered rule output, not the throttled banner list.
  const flags = state.reportFlags || [];

  const symptomSummary = (sym) => {
    const vals = entries.map((e) => e.symptoms?.[sym.id]).filter((v) => v != null);
    if (!vals.length) return null;
    const anyDays = vals.filter((v) => v > 0).length;
    const badDays = vals.filter((v) => v >= 3).length;
    const half = Math.floor(vals.length / 2);
    const firstHalf = vals.slice(0, half), secondHalf = vals.slice(half);
    const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const shift = mean(secondHalf) - mean(firstHalf);
    // Below a fortnight there are not two halves worth comparing, and the
    // report was telling clinicians a symptom had "got worse" on the strength
    // of a single rated day.
    const enoughForTrend = vals.length >= 14;
    return {
      sym, logged: vals.length, anyDays, badDays,
      pctAny: Math.round((anyDays / vals.length) * 100),
      pctBad: Math.round((badDays / vals.length) * 100),
      enoughForTrend,
      trend: !enoughForTrend ? 'too early to say'
        : shift > 0.3 ? 'worse' : shift < -0.3 ? 'better' : 'about the same',
      shift: Math.round(shift * 10) / 10,
      series: entries.map((e) => ({ date: e.date, value: e.symptoms?.[sym.id] ?? null })),
    };
  };

  const summaries = symptoms.map(symptomSummary).filter(Boolean);
  // The chosen main symptom may have no logged days yet — someone adds a new
  // one and marks it as the main concern before recording a single day. Falling
  // through to `null` there removed the main section AND, because the
  // "everything else" table required more than one summary, silently dropped
  // every other symptom from the report as well. Fall back to whichever
  // symptom actually has data.
  const main = (primary && summaries.find((x) => x.sym.id === primary.id)) || summaries[0] || null;
  const others = summaries.filter((x) => !main || x.sym.id !== main.sym.id);

  const objective = [
    { label: 'Weight', field: 'bodyweightKg', unit: 'kg' },
    { label: 'Resting heart rate', field: 'restingHR', unit: 'bpm' },
    { label: 'HRV (RMSSD)', field: 'hrv', unit: 'ms' },
    { label: 'Sleep', field: 'sleepHours', unit: 'h' },
    { label: 'Alcohol', field: 'alcoholUnits', unit: 'units/day' },
  ].map((m) => {
    const vals = entries.map((e) => e[m.field]).filter((v) => v != null);
    if (vals.length < 5) return null;
    const half = Math.floor(vals.length / 2);
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const early = mean(vals.slice(0, half)), late = mean(vals.slice(half));
    return { ...m, n: vals.length, latest: Math.round(late * 10) / 10,
             change: Math.round((late - early) * 10) / 10 };
  }).filter(Boolean);

  return `
  <div id="print-report">
    <div class="card">
      <h1 style="margin:0 0 .3em">Summary for an appointment</h1>
      <p class="muted" style="margin:0">
        ${esc(String(p.age ?? '—'))}-year-old${p.heightCm ? `, ${esc(String(p.heightCm))} cm` : ''}.
        Self-tracked ${entries.length} days out of ${span} between ${esc(first)} and ${esc(last)}.
        Printed ${esc(today)}.
      </p>
    </div>

    ${flags.length ? `<div class="card">
      <h2>Things I wanted to mention</h2>
      ${flags.map((f) => `<p><strong>${esc(f.title)}.</strong> ${esc(f.detail)}</p>`).join('')}
    </div>` : ''}

    ${main ? `<div class="card">
      <h2>Main problem: ${esc(main.sym.label)}</h2>
      <p class="muted">Present on <strong>${main.anyDays} of ${main.logged}</strong> logged days
      (${main.pctAny}%), and severe or worse on <strong>${main.badDays}</strong> of them
      (${main.pctBad}%). ${main.enoughForTrend
        ? `Over the period it has got <strong>${esc(main.trend)}</strong>${
            main.shift ? ` (${main.shift > 0 ? '+' : ''}${main.shift} on a 0–4 scale, second half vs first)` : ''}.`
        : `That is too few days to say anything about a direction yet.`}</p>
      ${lineChart(main.series, {
        min: 0, max: 4, yTicks: [0, 1, 2, 3, 4], label: `${main.sym.label} severity over time`,
        width: state.narrow ? 380 : 720, height: state.narrow ? 200 : 220,
      })}
    </div>` : ''}

    ${others.length ? `<div class="card">
      <h2>Everything else I track</h2>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Symptom</th><th class="num">Days present</th><th class="num">Days severe+</th><th>Direction</th></tr></thead>
        <tbody>${others.map((x) => `<tr>
          <td>${esc(x.sym.label)}</td>
          <td class="num">${x.anyDays}/${x.logged} (${x.pctAny}%)</td>
          <td class="num">${x.badDays}</td>
          <td>${esc(x.trend)}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>` : ''}

    ${(state.weekday || []).length ? `<div class="card">
      <h2>When it lands in the week</h2>
      <p class="muted">Day-of-week differences that held up against a permutation test, corrected
      for testing every symptom I track. A weekday is not a cause &mdash; it stands in for whatever
      is different about those days.</p>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Symptom</th><th>Worst day</th><th>Best day</th><th class="num">Spread</th><th class="num">Share of variation</th><th class="num">p (corrected)</th></tr></thead>
        <tbody>${(state.weekday || []).map((w) => `<tr>
          <td>${esc(w.label)}</td>
          <td>${esc(w.worst.day)} (${w.worst.mean.toFixed(1)})</td>
          <td>${esc(w.best.day)} (${w.best.mean.toFixed(1)})</td>
          <td class="num">${w.spread.toFixed(1)}</td>
          <td class="num">${Math.round(w.eta2 * 100)}%</td>
          <td class="num">${w.pAdjusted < 0.0001 ? '&lt;0.0001' : w.pAdjusted}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>` : ''}

    ${objective.length ? `<div class="card">
      <h2>Measurements</h2>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>What</th><th class="num">Recent average</th><th class="num">Change over the period</th><th class="num">Days</th></tr></thead>
        <tbody>${objective.map((m) => `<tr>
          <td>${esc(m.label)}</td>
          <td class="num">${m.latest} ${esc(m.unit)}</td>
          <td class="num">${m.change > 0 ? '+' : ''}${m.change}</td>
          <td class="num">${m.n}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="subtle">Self-measured at home, not clinic measurements.</p>
    </div>` : ''}

    ${(state.factors || []).filter((f) => !f.archivedAt).length ? `<div class="card">
      <h2>What I've been watching for</h2>
      <p class="muted">Things I suspected and tracked daily alongside everything else. A blank
      result is not proof it does nothing, but it means my own log does not show a day-to-day
      link — so it is probably not worth spending an appointment on.</p>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Suspected</th><th class="num">Days tracked</th><th class="num">Days present</th><th>What the data showed</th></tr></thead>
        <tbody>${(state.factors || []).filter((f) => !f.archivedAt).map((fac) => {
          const vals = entries.map((e) => e.factors?.[fac.id]).filter((v) => v != null);
          const present = vals.filter((v) => v > 0).length;
          // Match windowed drivers too: a factor whose effect builds over a
          // week is found as "w7_<id>", and matching only the bare id made the
          // report say "nothing found" about a factor the engine HAD explained.
          const hits = findings.filter((f) => f.driver === fac.id || f.driver === `w7_${fac.id}`);
          return `<tr>
            <td>${esc(fac.label)}</td>
            <td class="num">${vals.length}</td>
            <td class="num">${present}</td>
            <td>${hits.length
              ? hits.map((h) => `linked to ${esc(fieldLabel(h.outcome, state))}${
                  h.driver.startsWith('w7_') ? ' (builds over a week)' : h.lag ? ` (${h.lag}-day lag)` : ''
                }, r = ${h.r}`).join('; ')
              : vals.length >= 21 ? 'nothing found' : 'not enough days yet'}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    </div>` : ''}

    ${trials.length ? `<div class="card">
      <h2>What I've already tried</h2>
      <p class="muted">Each of these was a randomised block trial on myself — the same change
      done on randomly chosen blocks of days and not others, with the thing being measured
      chosen before the trial started.</p>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Change</th><th>Measured</th><th>Result</th><th class="num">p</th></tr></thead>
        <tbody>${trials.map((t) => {
          const lever = getLever(t.leverId, state.factors);
          return `<tr>
            <td>${esc(lever?.label || t.leverId)}</td>
            <td>${esc(t.outcomeLabel || t.outcome)}</td>
            <td>${esc(t.result.headline)}</td>
            <td class="num">${t.result.analysis?.p ?? '—'}</td></tr>`;
        }).join('')}</tbody>
      </table></div>
    </div>` : ''}

    <div class="card">
      <h2>Patterns in the data</h2>
      <p class="muted">These are correlations found across my own log — things that moved
      together. They are not evidence that one caused the other.</p>
      ${findings.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Pattern</th><th class="num">Lag</th><th class="num">r</th><th class="num">95% CI</th><th class="num">p (corrected)</th><th class="num">n</th></tr></thead>
        <tbody>${findings.map((f) => `<tr>
          <td>${esc(fieldLabel(f.driver, state))} &rarr; ${esc(fieldLabel(f.outcome, state))}</td>
          <td class="num">${f.lag}d</td>
          <td class="num">${f.r}</td>
          <td class="num">${f.ci ? `[${f.ci[0]}, ${f.ci[1]}]` : '—'}</td>
          <td class="num">${f.pAdjusted < 0.0001 ? '&lt;0.0001' : f.pAdjusted}</td>
          <td class="num">${f.n}</td></tr>`).join('')}</tbody>
      </table></div>` : `<p class="muted">Nothing held up (${state.insights?.tested || 0} relationships
        tested, Benjamini–Hochberg at q=0.10). ${esc(sensitivityNote(entries.length))}</p>`}
    </div>

    <div class="card">
      <h3>How this was put together</h3>
      <p class="subtle">Symptoms and habits are self-reported once a day on a 0–4 scale and are
      not blinded. Correlations use Spearman rank correlation on days paired at 0, 1 and 2-day
      lags, after removing any linear time trend and any day-of-week pattern from both series;
      p-values come from a permutation null (circular shifts plus a moving-block bootstrap) and
      are corrected for multiple comparisons across every relationship tested, by
      Benjamini-Hochberg at a 10% false-discovery rate. Confidence intervals
      use an effective sample size adjusted for autocorrelation. Day-of-week differences are tested by
      shuffling the day labels within each symptom and are corrected across symptoms the same way.
      Trials are block-randomised with
      the outcome fixed in advance and analysed by exact randomisation test.</p>
      <p class="subtle">This was produced by a self-tracking app with no clinical input. It is a
      record of what I noticed and measured, not an assessment of what is wrong.</p>
    </div>
  </div>

  <div class="card no-print">
    <div style="display:flex;gap:9px;flex-wrap:wrap">
      <button class="btn btn-primary" data-action="print-report">Print / save as PDF</button>
      <button class="btn" data-action="export">Export raw data</button>
    </div>
    <p class="subtle" style="margin-top:8px">Prints to about one page. Take it with you — walking
    in with dates and numbers is worth a great deal more than trying to remember how the last
    three months went.</p>
  </div>`;
}

/** Human label for a field or symptom id. */
const fieldLabel = (id, state) => labelFor(id, state.symptoms, state.factors);
/* ================================================================== *
 * SETTINGS
 * ================================================================== */

export function settingsView(state) {
  const p = state.profile;
  const active = (state.symptoms || []).filter((s) => !s.archivedAt);
  const symptomRows = active.length
    ? active.map((sym) => `<div class="sym-row">
        <div class="sym-label">${esc(sym.label)}</div>
        <div style="display:flex;gap:6px;align-items:center;justify-content:flex-end;flex-wrap:wrap">
          ${sym.primary
            ? '<span class="pill pill-good">main concern</span>'
            : `<button class="btn btn-ghost btn-sm" data-action="set-primary-symptom" data-id="${esc(sym.id)}">Make this the main one</button>`}
          <button class="btn btn-ghost btn-sm" data-action="remove-symptom" data-id="${esc(sym.id)}">Remove</button>
        </div>
      </div>`).join('')
    : '<p class="muted">Nothing tracked yet.</p>';

  return `
  <div class="card">
    <h1>Settings</h1>
  </div>

  <div class="card">
    <div class="card-head"><h3>Things you suspect</h3></div>
    <p class="muted">The twenty habits this app tracks by default are a guess at what matters for
    most people. If your hunch is dairy, a stuffy bedroom, or the days you drive to work, add it
    here — it goes into the analysis exactly like the built-in ones, and can be tested properly
    as a trial.</p>
    ${(state.factors || []).filter((f) => !f.archivedAt).length
      ? (state.factors || []).filter((f) => !f.archivedAt).map((fac) => `<div class="sym-row">
          <div class="sym-label">${esc(fac.label)}</div>
          <div style="text-align:right">
            <button class="btn btn-ghost btn-sm" data-action="remove-factor" data-id="${esc(fac.id)}">Remove</button>
          </div>
        </div>`).join('')
      : '<p class="muted">Nothing yet.</p>'}
    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
      <input type="text" id="new-factor" maxlength="60" placeholder="e.g. dairy, late screens, driving"
        style="flex:1;min-width:200px" aria-label="Something you suspect">
      <button class="btn" data-action="add-factor">Add</button>
    </div>
  </div>

  <div class="card">
    <div class="card-head"><h3>What you're tracking</h3></div>
    <p class="muted">Name the things that actually bother you, in your own words. They get rated
    on the log screen each day, and the analysis goes looking for whatever moves with them.</p>
    ${symptomRows}
    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
      <input type="text" id="new-symptom" maxlength="60" placeholder="e.g. migraine, bloating, joint pain"
        style="flex:1;min-width:200px" aria-label="New symptom to track">
      <button class="btn" data-action="add-symptom">Add</button>
    </div>
    <p class="subtle" style="margin-top:8px">Up to 12. Removing one keeps the days you already
    logged. This app has no idea what any of these mean medically — it only looks for what moves
    with them.</p>
  </div>

  <div class="card">
    <h3>About you</h3>
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
    prevent disease, and nothing in it is medical advice. The habit score summarises what you
    logged; it says nothing about whether you are well. Patterns it finds show what moves
    together in your log and cannot prove that one thing caused another. If something about your
    health worries you, or a symptom is severe, new, or getting worse, talk to a doctor.</p>
  </div>`;
}


/* ================================================================== *
 * TRIALS — the only part of the app that can support "this helped"
 * ================================================================== */

export function trialsView(state) {
  const active = state.trials?.find((t) => t.status === 'running');
  const past = (state.trials || []).filter((t) => t.status !== 'running');

  return `
  <div class="card">
    <h1 style="margin:0 0 .4em">Try one thing</h1>
    <p class="muted">Everything else here can only tell you what moves together in your log,
    which is never proof. If you actually want to know whether something helps <em>you</em>,
    the way to find out is to change it on purpose and see.</p>
    <p class="muted">You pick one change and one thing to measure. The app splits the next few
    weeks into blocks and tosses a coin for each pair, so you do the change on some blocks and
    not others. Because the coin decided — not you, and not the calendar — a difference at the
    end is hard to explain away.</p>
  </div>

  ${active ? activeTrialCard(state, active) : newTrialCard(state)}

  ${past.length ? `<div class="card">
    <div class="card-head"><h2>What you've already tried</h2></div>
    ${past.map((t) => pastTrialRow(state, t)).join('')}
  </div>` : ''}

  <div class="card">
    <p class="disclaimer">These are experiments on everyday habits — sleep, walking, coffee,
    daylight. Never run one on a medicine you have been prescribed, and never change a
    prescription to test something here. If a symptom is severe, new, or getting worse, that is
    a reason to see a doctor rather than to start a four-week experiment.</p>
  </div>`;
}

function newTrialCard(state) {
  const outcomes = trialOutcomeOptions(state);
  if (!outcomes.length) {
    return `<div class="card empty-state">
      <h3>Nothing to measure yet</h3>
      <p>Add a symptom in Settings first, or log a few days — a trial needs something specific
      to watch.</p>
      <button class="btn btn-primary" data-action="goto" data-view="settings">Add a symptom</button>
    </div>`;
  }
  const pairs = state.trialDraft?.pairs || DEFAULT_PAIRS;
  const levers = leversFor(state.factors);
  const leverId = state.trialDraft?.leverId || levers[0].id;
  const lever = getLever(leverId, state.factors);
  const blockDays = lever.blockDays || 2;
  const days = pairs * 2 * blockDays;

  return `<div class="card">
    <div class="card-head"><h2>Start a trial</h2></div>
    <div class="grid grid-2">
      <div class="field">
        <div class="field-head"><label for="trial-lever">Change one thing</label></div>
        <select id="trial-lever" data-trial="leverId">
          ${levers.map((l) => `<option value="${esc(l.id)}" ${l.id === leverId ? 'selected' : ''}>${esc(l.label)}${l.userDefined ? ' (yours)' : ''}</option>`).join('')}
        </select>
        ${lever.note ? `<p class="subtle" style="margin-top:6px">${esc(lever.note)}</p>` : ''}
      </div>
      <div class="field">
        <div class="field-head"><label for="trial-outcome">And watch what it does to</label></div>
        <select id="trial-outcome" data-trial="outcome">
          ${outcomes.map((o) => `<option value="${esc(o.value)}" ${o.value === state.trialDraft?.outcome ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
        </select>
        <p class="subtle" style="margin-top:6px">Chosen now and locked. Picking what to measure
        after seeing the data is how people find effects in anything.</p>
      </div>
    </div>

    <div class="field">
      <div class="field-head"><label for="trial-pairs">How long</label><div class="spacer"></div>
        <span class="field-value">${days} days</span></div>
      <input type="range" id="trial-pairs" data-trial="pairs" min="${TRIAL_MIN_PAIRS}" max="10" step="1" value="${pairs}">
      <p class="subtle" style="margin-top:6px">
        ${pairs} pairs of ${blockDays}-day blocks. The best this length could ever show is
        <strong>p = ${floorP(pairs).toFixed(3)}</strong> — that is the arithmetic of ${Math.pow(2, pairs)} possible
        coin tosses, not a guess. Shorter than ${TRIAL_MIN_PAIRS} pairs and a trial cannot come back
        significant at all, however well it goes, so the app will not offer it.
      </p>
    </div>

    <button class="btn btn-primary" data-action="start-trial">Start on ${esc(dateKey())}</button>
  </div>`;
}

function trialOutcomeOptions(state) {
  const out = (state.symptoms || []).filter((s) => !s.archivedAt)
    .map((s) => ({ value: s.id, label: s.label }));
  for (const f of ['energy', 'mood', 'sleepQuality', 'stress']) {
    if (FIELDS[f]) out.push({ value: f, label: FIELDS[f].label });
  }
  return out;
}

function activeTrialCard(state, t) {
  const lever = getLever(t.leverId, state.factors);
  if (!lever) {
    return `<div class="card">
      <div class="card-head"><h2>An unfinished trial</h2><div class="spacer"></div>
        <span class="pill pill-info">can't continue</span></div>
      <p class="muted">This trial was changing something you have since stopped tracking, so it
      cannot be finished or judged. Your logged days are untouched.</p>
      <button class="btn btn-danger btn-sm" data-action="abandon-trial" data-id="${esc(t.id)}">Close it</button>
    </div>`;
  }
  const left = daysRemaining(t, dateKey());
  const done = isComplete(t, dateKey());
  const todayArm = schedule(t).find((d) => d.date === dateKey())?.arm;
  const v = done ? state.trialVerdict : null;

  return `<div class="card">
    <div class="card-head"><h2>${esc(lever.label)} &rarr; ${esc(t.outcomeLabel || t.outcome)}</h2>
      <div class="spacer"></div>
      <span class="pill ${done ? 'pill-good' : 'pill-info'}">${done ? 'finished' : `${left} ${left === 1 ? 'day' : 'days'} to go`}</span></div>

    ${!done && todayArm ? `<div class="banner ${todayArm === 'on' ? 'banner-pro' : 'banner-info'}">
      <strong>Today:</strong>
      <span>${todayArm === 'on' ? esc(lever.onText) : esc(lever.offText)}</span>
      <div class="spacer"></div>
      <button class="btn btn-sm" data-action="goto" data-view="log">Log today</button>
    </div>` : ''}
    ${!done && !todayArm ? '<p class="muted">Today is outside the trial window.</p>' : ''}

    ${done && v ? verdictBlock(v) : ''}
    ${!done ? `<p class="muted">No results until it finishes. Checking a half-run experiment and
    stopping when it looks good is the single easiest way to fool yourself, so the app does not
    show you.</p>` : ''}

    ${trialCalendar(t)}

    <div style="display:flex;gap:9px;margin-top:14px;flex-wrap:wrap">
      ${done ? `<button class="btn btn-primary" data-action="finish-trial" data-id="${esc(t.id)}">Save this result</button>` : ''}
      <button class="btn btn-danger btn-sm" data-action="abandon-trial" data-id="${esc(t.id)}" data-done="${done}">${done ? 'Discard this result' : 'Stop this trial'}</button>
    </div>
  </div>`;
}

function trialCalendar(t) {
  const today = dateKey();
  const cells = schedule(t).map((d) => {
    const state = d.date < today ? 'past' : d.date === today ? 'today' : 'future';
    return `<div class="trial-cell trial-${d.arm} trial-${state}" title="${esc(d.date)}: ${d.arm === 'on' ? 'do it' : 'normal'}"></div>`;
  }).join('');
  return `<div class="trial-cal" role="img" aria-label="Trial schedule: ${trialDays(t)} days, alternating blocks">
    ${cells}
  </div>
  <p class="subtle" style="margin-top:6px">
    <span class="trial-key trial-on"></span> do the change &nbsp;
    <span class="trial-key trial-off"></span> carry on as normal &nbsp; · ends ${esc(trialEndDate(t))}</p>`;
}

function verdictBlock(v) {
  const tone = v.kind === 'helped' ? 'pill-good' : v.kind === 'hurt' ? 'pill-bad' : 'pill-info';
  return `<div class="insight" style="margin-top:12px">
    <div class="insight-head"><span class="pill ${tone}">${esc(v.kind.replace('-', ' '))}</span></div>
    <h3 style="margin:.2em 0 .4em">${esc(v.headline)}</h3>
    <p class="muted">${esc(v.body)}</p>
    ${v.caveat ? `<p class="disclaimer">${esc(v.caveat)}</p>` : ''}
    ${v.analysis?.status === 'analysed' && ['helped', 'hurt', 'no-effect'].includes(v.kind) ? `<div class="insight-stats">
      <span>on: ${v.analysis.meanOn}</span>
      <span>off: ${v.analysis.meanOff}</span>
      <span>difference: ${v.analysis.observedDiff}</span>
      <span>p = ${v.analysis.p}</span>
      <span>${v.analysis.usablePairs} usable pairs</span>
    </div>` : ''}
  </div>`;
}

function pastTrialRow(state, t) {
  const lever = getLever(t.leverId, state.factors);
  const v = t.result;
  const tone = v?.kind === 'helped' ? 'pill-good' : v?.kind === 'hurt' ? 'pill-bad' : 'pill-info';
  return `<div class="sym-row">
    <div>
      <div class="sym-label">${esc(lever?.label || t.leverId)} &rarr; ${esc(t.outcomeLabel || t.outcome)}</div>
      <div class="subtle">${esc(t.startDate)} · ${v ? esc(v.headline) : 'stopped early'}</div>
    </div>
    <div style="text-align:right"><span class="pill ${tone}">${esc(v ? v.kind.replace('-', ' ') : 'abandoned')}</span></div>
  </div>`;
}
