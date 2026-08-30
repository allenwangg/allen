/**
 * app.js — UI wiring.
 *
 * Rendering strategy: full re-render of each region from state on every
 * change. The documents involved are small (a big estimate is ~60 lines), so
 * a virtual DOM would cost more than it saves. The one exception is the item
 * grid, where re-rendering under an active cursor would eat keystrokes — so
 * focus and selection are preserved explicitly across renders.
 */

import {
  CATEGORIES, CATEGORY_LABELS, priceEstimate, formatMoney, formatPercent,
  marginToMarkup, markupToMargin, priceForTargetMargin, discountHeadroom,
  solveUniformMarkup, isPassThrough, summarizeContract, priceChangeOrder, compareActuals,
  buildSchedule, toCents,
} from './pricing.js';
import { Store, safeStorage, DEFAULT_TERMS } from './store.js';
import {
  ASSEMBLIES, UNITS, searchEffective, effectiveItem,
  effectiveTrades, expandAssemblyWith,
} from './pricebook.js';
import {
  renderProposal, proposalAsText, renderChangeOrder, renderContractStatement, esc,
} from './proposal.js';

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const storage = safeStorage();
const store = new Store({ storage });

/** Assigned by wireSignature; lets any view open the shared signature dialog. */
let openSignature = () => {};

const ui = {
  tab: 'estimate',
  groupByTrade: true,
  showLinePrices: false,
};

/* ============================================================== bootstrap = */

function boot() {
  if (!store.state.estimates.length) seedFirstRun();
  applyStoredTheme();
  wireChrome();
  wireEstimateForm();
  wireAdjustments();
  wireSettings();
  wirePriceBook();
  wireAssemblies();
  wireProposal();
  wireChangeOrders();
  wireCosts();
  wireJobs();
  wireShortcuts();

  store.subscribe((_s, detail) => {
    if (detail.type === 'storage-error') {
      toast('Could not save — browser storage may be full. Export a backup now.', { bad: true });
    }
    render();
  });

  // A debounced save can still be pending when the tab goes away.
  window.addEventListener('pagehide', () => store.save({ immediate: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') store.save({ immediate: true });
  });

  render();
}

/**
 * First run gets a real, populated example rather than an empty grid. An empty
 * estimating tool teaches nothing; a priced bathroom shows the margin gap
 * immediately, which is the whole point of the product.
 */
function seedFirstRun() {
  const est = store.createEstimate({
    title: 'Hall bath remodel — sample',
    scopeSummary:
      'Full demolition of the existing hall bath down to studs and subfloor. New tiled shower with '
      + 'waterproofing membrane and glass door, relocated vanity and lighting, new tile floor, and '
      + 'paint throughout.\n\nAll debris removed and the space left broom-clean at completion.',
    exclusions:
      'Vanity, toilet, shower valve trim, and light fixtures are supplied by the client. '
      + 'Structural repairs and any asbestos or mold abatement, if discovered, are excluded.',
  });
  store.patchEstimate({
    jobAddress: '112 Alder Street, Springfield',
    client: { name: 'Sample Client', email: '', phone: '', address: '' },
  });
  const asm = ASSEMBLIES[0];
  store.addItems(expandAssemblyWith(asm, asm.defaultDriver, store.state.priceBookOverrides));
  store.addItems([{
    description: 'Heated floor mat, installed',
    category: 'subcontractor', unit: 'sf', qty: 32, unitCost: 18.5,
    markup: null, optional: true,
  }]);
  store.undoStack.length = 0;
  return est;
}

/* ================================================================= render = */

function render() {
  const est = store.active();
  const priced = est ? priceEstimate(est, store.state.settings) : null;

  renderEstimateSelect();
  renderTabs();

  if (ui.tab === 'estimate') {
    renderEstimateForm(est);
    renderItems(est, priced);
    renderAdjustments(est, priced);
    renderProfit(est, priced);
    renderCategories(priced);
  } else if (ui.tab === 'proposal') {
    renderProposalPane(est, priced);
  } else if (ui.tab === 'changes') {
    renderChanges(est);
  } else if (ui.tab === 'costs') {
    renderCosts(est);
  } else if (ui.tab === 'jobs') {
    renderJobs();
  } else if (ui.tab === 'settings') {
    renderSettings();
  }

  renderChangeBadge(est);
  renderCostsBadge(est);
  $('#btnUndo').disabled = !store.canUndo();
  $('#btnRedo').disabled = !store.canRedo();
}

function renderTabs() {
  for (const tab of $$('.tab')) {
    const on = tab.dataset.tab === ui.tab;
    tab.setAttribute('aria-selected', String(on));
  }
  for (const name of ['estimate', 'proposal', 'changes', 'costs', 'jobs', 'settings']) {
    $(`#pane-${name}`).hidden = name !== ui.tab;
  }
}

function renderEstimateSelect() {
  const sel = $('#estSelect');
  const cur = store.state.activeId;
  sel.innerHTML = store.state.estimates.map((e) => `
    <option value="${esc(e.id)}"${e.id === cur ? ' selected' : ''}>
      ${esc(e.number)} — ${esc(e.title || 'Untitled')}
    </option>`).join('') || '<option>No estimates</option>';
}

/* ----------------------------------------------------------- job details -- */

function renderEstimateForm(est) {
  if (!est) return;
  for (const input of $$('[data-est]')) {
    if (document.activeElement === input) continue;
    input.value = est[input.dataset.est] ?? '';
  }
  for (const input of $$('[data-client]')) {
    if (document.activeElement === input) continue;
    input.value = est.client?.[input.dataset.client] ?? '';
  }
  $('#estMeta').textContent = `${est.number} · updated ${est.updatedAt}`;
}

function wireEstimateForm() {
  for (const input of $$('[data-est]')) {
    input.addEventListener('input', () => {
      store.patchEstimate({ [input.dataset.est]: input.value }, { coalesce: true, label: `est-${input.dataset.est}` });
    });
  }
  for (const input of $$('[data-client]')) {
    input.addEventListener('input', () => {
      const est = store.active();
      if (!est) return;
      store.patchEstimate(
        { client: { ...est.client, [input.dataset.client]: input.value } },
        { coalesce: true, label: `client-${input.dataset.client}` },
      );
    });
  }
}

/* ------------------------------------------------------------ item grid -- */

function renderItems(est, priced) {
  const wrap = $('#itemsWrap');
  if (!est) { wrap.innerHTML = ''; return; }

  if (!est.items.length) {
    wrap.innerHTML = `
      <div class="empty-state">
        <h3>No line items yet</h3>
        <p>Start from an assembly to lay in a whole scope at once, pull individual
           items from the price book, or add a blank line and type.</p>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
          <button class="btn primary" data-act="assembly">⚡ Start from an assembly</button>
          <button class="btn" data-act="pricebook">Browse price book</button>
          <button class="btn" data-act="blank">Add blank line</button>
        </div>
      </div>`;
    wrap.onclick = (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'assembly') $('#dlgAssembly').showModal();
      if (act === 'pricebook') openPriceBook();
      if (act === 'blank') focusNewLine(store.addItem());
    };
    return;
  }

  const focus = captureFocus();

  const rows = est.items.map((item) => {
    const l = priced.lines.find((x) => x.id === item.id);
    const marginClass = l.margin < 0 ? 'bad' : l.margin < 0.1 ? 'warn' : 'good';
    return `
<tr data-id="${esc(item.id)}"${item.optional ? ' class="optional"' : ''}>
  <td><input data-f="description" value="${esc(item.description)}" placeholder="Description"></td>
  <td style="width:132px">
    <select data-f="category">
      ${CATEGORIES.map((c) => `<option value="${c}"${c === item.category ? ' selected' : ''}>${CATEGORY_LABELS[c]}</option>`).join('')}
    </select>
  </td>
  <td style="width:86px"><input data-f="qty" class="num" type="number" step="0.01" value="${esc(item.qty)}"></td>
  <td style="width:72px">
    <select data-f="unit">
      ${UNITS.map((u) => `<option value="${u}"${u === item.unit ? ' selected' : ''}>${u}</option>`).join('')}
    </select>
  </td>
  <td style="width:92px"><input data-f="unitCost" class="num" type="number" step="0.01" value="${esc(item.unitCost)}"></td>
  <td style="width:74px">
    <input data-f="markup" class="num" type="number" step="1"
           value="${item.markup === null || item.markup === undefined ? '' : (item.markup * 100).toFixed(0)}"
           placeholder="${((store.state.settings.categoryMarkup[item.category] ?? store.state.settings.defaultMarkup) * 100).toFixed(0)}"
           title="Markup %. Blank uses your category default.">
  </td>
  <td class="computed">
    ${formatMoney(l.priceCents)}
    <div class="line-margin ${marginClass}" style="color:var(--${marginClass === 'good' ? 'good' : marginClass === 'warn' ? 'warn' : 'bad'})">
      ${formatPercent(l.margin, 0)} margin
    </div>
  </td>
  <td class="col-actions">
    <div class="row-tools">
      <button class="btn sm icon ghost" data-row="up"   title="Move up">↑</button>
      <button class="btn sm icon ghost" data-row="down" title="Move down">↓</button>
      <button class="btn sm icon ghost" data-row="opt"  title="Toggle optional upgrade" aria-pressed="${!!item.optional}">◇</button>
      <button class="btn sm icon ghost" data-row="del"  title="Delete line">✕</button>
    </div>
  </td>
</tr>`;
  }).join('');

  const totalLabel = priced.optionalLines.length
    ? `${priced.lines.length - priced.optionalLines.length} included · ${priced.optionalLines.length} optional`
    : `${priced.lines.length} lines`;

  wrap.innerHTML = `
<table class="items">
  <thead>
    <tr>
      <th>Description</th><th>Category</th><th class="right">Qty</th><th>Unit</th>
      <th class="right">Unit cost</th><th class="right">Markup %</th>
      <th class="right">Price</th><th></th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<div style="padding:8px 14px;border-top:1px solid var(--border);display:flex;gap:10px;align-items:center">
  <span class="tiny faint">${totalLabel}</span>
  <span style="flex:1"></span>
  <span class="tiny faint">Cost ${formatMoney(priced.baseCostCents)} · Price ${formatMoney(priced.subtotalCents)}</span>
</div>`;

  wireItemGrid(wrap);
  restoreFocus(focus);
}

function wireItemGrid(wrap) {
  wrap.oninput = (e) => {
    const tr = e.target.closest('tr[data-id]');
    const field = e.target.dataset.f;
    if (!tr || !field) return;
    const id = tr.dataset.id;
    let value = e.target.value;

    if (field === 'qty' || field === 'unitCost') {
      value = value === '' ? 0 : Number(value);
      if (!Number.isFinite(value)) return;
    } else if (field === 'markup') {
      value = value.trim() === '' ? null : Number(value) / 100;
      if (value !== null && !Number.isFinite(value)) return;
    }
    store.patchItem(id, { [field]: value }, { label: `item-${id}-${field}`, coalesce: true });
  };

  wrap.onclick = (e) => {
    const btn = e.target.closest('[data-row]');
    if (!btn) return;
    const id = btn.closest('tr[data-id]').dataset.id;
    const est = store.active();
    const item = est.items.find((i) => i.id === id);
    switch (btn.dataset.row) {
      case 'up':   store.moveItem(id, -1); break;
      case 'down': store.moveItem(id, +1); break;
      case 'opt':  store.patchItem(id, { optional: !item.optional }, { coalesce: false }); break;
      case 'del': {
        const label = item.description || 'this line';
        store.removeItem(id);
        toast(`Removed ${label}.`, { undo: true });
        break;
      }
    }
  };

  // Enter adds a line below; Cmd/Ctrl+Backspace deletes the current one.
  wrap.onkeydown = (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      focusNewLine(store.addItem({}, { after: tr.dataset.id }));
    } else if (e.key === 'Backspace' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      store.removeItem(tr.dataset.id);
      toast('Line removed.', { undo: true });
    }
  };
}

/**
 * Focus survives a full re-render of the grid: without this, typing in a
 * quantity field would lose the caret on every keystroke.
 */
function captureFocus() {
  const el = document.activeElement;
  const tr = el?.closest?.('tr[data-id]');
  if (!tr || !el.dataset.f) return null;
  return {
    id: tr.dataset.id,
    field: el.dataset.f,
    start: el.selectionStart,
    end: el.selectionEnd,
  };
}

function restoreFocus(focus) {
  if (!focus) return;
  const el = $(`tr[data-id="${CSS.escape(focus.id)}"] [data-f="${focus.field}"]`);
  if (!el) return;
  el.focus();
  if (focus.start !== null && el.setSelectionRange && el.type !== 'number') {
    try { el.setSelectionRange(focus.start, focus.end); } catch { /* not selectable */ }
  }
}

function focusNewLine(item) {
  requestAnimationFrame(() => {
    $(`tr[data-id="${CSS.escape(item.id)}"] [data-f="description"]`)?.focus();
  });
}

/* ---------------------------------------------------------- adjustments -- */

function renderAdjustments(est, priced) {
  if (!est) return;
  const d = est.discount;
  const type = $('#fDiscType');
  const val = $('#fDiscVal');
  if (document.activeElement !== type) type.value = d?.type || '';
  if (document.activeElement !== val) {
    val.value = d ? (d.type === 'percent' ? (Number(d.value) * 100).toFixed(2).replace(/\.?0+$/, '') : d.value) : '';
  }
  val.disabled = !d?.type && !type.value;
  val.placeholder = type.value === 'percent' ? '10' : '500.00';

  if (priced && priced.discountCents > 0) {
    $('#discHint').textContent =
      `${formatMoney(priced.discountCents)} off — margin drops to ${formatPercent(priced.margin)}.`;
  } else {
    $('#discHint').textContent = 'Comes straight out of your profit.';
  }
  if (document.activeElement !== $('#fOverride')) $('#fOverride').value = '';
}

function wireAdjustments() {
  const type = $('#fDiscType');
  const val = $('#fDiscVal');

  type.addEventListener('change', () => {
    if (!type.value) store.patchEstimate({ discount: null }, { coalesce: false });
    else store.patchEstimate({ discount: { type: type.value, value: 0 } }, { coalesce: false });
  });

  val.addEventListener('input', () => {
    const raw = Number(val.value) || 0;
    const value = type.value === 'percent' ? raw / 100 : raw;
    store.patchEstimate({ discount: { type: type.value || 'fixed', value } },
      { coalesce: true, label: 'discount' });
  });

  // Back-solve: "I want this job to come out at $18,000."
  $('#fOverride').addEventListener('change', () => {
    const target = toCents($('#fOverride').value);
    if (!target) return;
    const est = store.active();
    const priced = priceEstimate(est, store.state.settings);
    const current = priced.totalCents + priced.discountCents; // undiscounted total
    const needed = current - target;
    if (needed <= 0) {
      toast('That is above the current total — raise a line price instead.', { bad: true });
      $('#fOverride').value = '';
      return;
    }
    store.patchEstimate({ discount: { type: 'fixed', value: needed / 100 } }, { coalesce: false });
    const after = priceEstimate(store.active(), store.state.settings);
    toast(`Discounted ${formatMoney(needed)} to land at ${formatMoney(after.totalCents)} — margin now ${formatPercent(after.margin)}.`);
    $('#fOverride').value = '';
  });
}

/* --------------------------------------------------------- profit panel -- */

function renderProfit(est, priced) {
  const el = $('#profitPanel');
  if (!est || !priced) { el.innerHTML = ''; return; }

  const s = store.state.settings;
  const target = Number(s.targetMargin) || 0;
  const floor = Number(s.floorMargin) || 0;
  const margin = priced.margin;

  const state = margin < floor ? (margin < 0 ? 'loss' : 'thin') : 'good';
  const gaugeMax = Math.max(target * 1.6, margin * 1.15, 0.4);
  const pct = (v) => `${Math.max(0, Math.min(100, (v / gaugeMax) * 100))}%`;

  const head = discountHeadroom(priced, floor);

  el.innerHTML = `
<div class="gauge">
  <div class="gauge-track">
    <div class="gauge-fill ${state === 'good' ? '' : state}" style="width:${pct(Math.max(0, margin))}"></div>
    <div class="gauge-target" style="left:${pct(target)}" title="Target ${formatPercent(target)}"></div>
  </div>
  <div class="gauge-legend">
    <span>Margin <strong class="num">${formatPercent(margin)}</strong></span>
    <span>Target ${formatPercent(target)}</span>
  </div>
</div>

<div class="figure"><span class="label">Job cost</span><span class="value">${formatMoney(priced.baseCostCents)}</span></div>
<div class="figure"><span class="label">Overhead ${formatPercent(s.overhead, 0)}</span><span class="value">${formatMoney(priced.overheadCents)}</span></div>
${priced.contingencyCents ? `<div class="figure"><span class="label">Contingency ${formatPercent(s.contingency, 0)}</span><span class="value">${formatMoney(priced.contingencyCents)}</span></div>` : ''}
${priced.discountCents ? `<div class="figure"><span class="label">Discount</span><span class="value">−${formatMoney(priced.discountCents)}</span></div>` : ''}
${priced.taxCents ? `<div class="figure"><span class="label">Sales tax</span><span class="value">${formatMoney(priced.taxCents)}</span></div>` : ''}
<div class="figure profit ${state}">
  <span class="label">Your profit</span>
  <span class="value">${formatMoney(priced.grossProfitCents)}</span>
</div>
<div class="figure total"><span class="label">Client pays</span><span class="value">${formatMoney(priced.totalCents)}</span></div>

<div class="figure" style="margin-top:8px">
  <span class="label tiny">Break-even</span>
  <span class="value tiny">${formatMoney(priced.breakEvenCents)}</span>
</div>
<div class="figure">
  <span class="label tiny">Room to negotiate</span>
  <span class="value tiny">${head.underwater ? '—' : formatMoney(head.headroomCents)}</span>
</div>

${coachFor(priced, s, head)}`;

  el.onclick = (e) => {
    const act = e.target.closest('[data-fix]')?.dataset.fix;
    if (act === 'lift') liftToTarget();
    if (act === 'settings') { ui.tab = 'settings'; render(); }
  };
}

/**
 * The coach. This is the feature people would pay for on its own: a plain
 * sentence naming what is wrong with the number and what to do about it.
 */
function coachFor(priced, s, head) {
  const target = Number(s.targetMargin) || 0;
  const floor = Number(s.floorMargin) || 0;
  const margin = priced.margin;

  if (!priced.lines.length) {
    return `<div class="coach"><strong>Nothing priced yet.</strong>
      Add a line or start from an assembly to see where this job lands.</div>`;
  }

  if (margin < 0) {
    return `<div class="coach bad">
      <strong>This job loses money.</strong>
      You would pay ${formatMoney(-priced.grossProfitCents)} for the privilege of doing it.
      Costs total ${formatMoney(priced.burdenedCostCents)} against a price of ${formatMoney(priced.afterDiscountCents)}.
      <div class="fix"><button class="btn sm primary" data-fix="lift">Reprice to ${formatPercent(target)}</button></div>
    </div>`;
  }

  if (margin < floor) {
    const needed = priceForTargetMargin(priced.burdenedCostCents, target);
    return `<div class="coach bad">
      <strong>Below your walk-away margin.</strong>
      ${formatPercent(margin)} is under the ${formatPercent(floor)} floor you set.
      Hitting your ${formatPercent(target)} target needs ${formatMoney(needed)} —
      ${formatMoney(needed - priced.afterDiscountCents)} more than this quote.
      <div class="fix"><button class="btn sm primary" data-fix="lift">Reprice to ${formatPercent(target)}</button></div>
    </div>`;
  }

  if (margin < target - 0.005) {
    const needed = priceForTargetMargin(priced.burdenedCostCents, target);
    const gap = needed - priced.afterDiscountCents;
    return `<div class="coach warn">
      <strong>Under target by ${formatPercent(target - margin)}.</strong>
      You are marking up ${formatPercent(priced.markup, 0)}, which only keeps ${formatPercent(margin)} —
      markup and margin are not the same number. Add ${formatMoney(gap)} to hit ${formatPercent(target)}.
      <div class="fix"><button class="btn sm primary" data-fix="lift">Reprice to ${formatPercent(target)}</button></div>
    </div>`;
  }

  return `<div class="coach good">
    <strong>On target.</strong>
    ${formatPercent(margin)} margin clears your ${formatPercent(target)} goal.
    You can come down ${formatMoney(head.headroomCents)} and still hold the ${formatPercent(floor)} floor.
  </div>`;
}

/**
 * Reprice every non-optional line to the uniform markup that lands the whole
 * job on the target margin. Lines explicitly set to zero markup (permits,
 * pass-through fees) are left alone — marking those up is how you end up
 * explaining a $1,200 "permit" to an annoyed client.
 */
function liftToTarget() {
  const est = store.active();
  const target = Number(store.state.settings.targetMargin) || 0;

  // Solved against the real pricing pipeline rather than marginToMarkup(target),
  // which is only correct when there is no contingency and no pass-through
  // line. With either present it undershoots, and the user would trust a
  // number that quietly leaves money on the table.
  const markup = solveUniformMarkup(est, store.state.settings, target);
  if (markup === null) {
    toast(`Cannot reach ${formatPercent(target)} — every line is a pass-through, so there is nothing to mark up.`, { bad: true });
    return;
  }

  let touched = 0;
  store.update((state) => {
    const e = state.estimates.find((x) => x.id === state.activeId);
    for (const item of e.items) {
      if (isPassThrough(item)) continue;
      item.markup = markup;
      touched++;
    }
  }, { label: 'reprice to target' });

  const after = priceEstimate(store.active(), store.state.settings);
  const skipped = est.items.length - touched;
  toast(
    `Repriced ${touched} line${touched === 1 ? '' : 's'} to ${formatPercent(markup, 0)} markup — margin now ${formatPercent(after.margin)}.`
    + (skipped ? ` ${skipped} pass-through line${skipped === 1 ? '' : 's'} left at cost.` : ''),
    { undo: true },
  );
}

/* ------------------------------------------------------ category rollup -- */

function renderCategories(priced) {
  const el = $('#catPanel');
  if (!priced || !priced.lines.length) {
    el.innerHTML = '<p class="tiny faint" style="margin:0">Add lines to see the cost mix.</p>';
    return;
  }
  const entries = Object.entries(priced.byCategory);
  if (!entries.length) { el.innerHTML = '<p class="tiny faint" style="margin:0">No included lines.</p>'; return; }

  const maxCost = Math.max(...entries.map(([, v]) => v.costCents));
  const colors = {
    labor: 'var(--accent)', material: '#0891b2', subcontractor: '#7c3aed',
    equipment: '#65a30d', other: 'var(--text-3)',
  };

  el.innerHTML = `<div class="cat-bars">${entries.map(([cat, v]) => `
    <div class="cat-bar">
      <div class="cat-bar-head">
        <span>${CATEGORY_LABELS[cat]} <span class="faint tiny">${v.count}</span></span>
        <span class="num">${formatMoney(v.costCents)}</span>
      </div>
      <div class="cat-bar-track">
        <div class="cat-bar-fill" style="width:${(v.costCents / maxCost) * 100}%;background:${colors[cat]}"></div>
      </div>
      <div class="tiny faint" style="margin-top:2px">
        sells for ${formatMoney(v.priceCents)} · ${formatPercent(v.margin, 0)} margin
      </div>
    </div>`).join('')}</div>`;
}

/* ------------------------------------------------------------ price book -- */

function openPriceBook({ into = null } = {}) {
  ui.priceBookTarget = into;   // null = the estimate, otherwise a change order id
  $('#dlgPriceBook').showModal();
  const q = $('#pbQuery');
  q.value = '';
  renderTradeFilter();
  renderPriceBookList();
  requestAnimationFrame(() => q.focus());
}

function renderTradeFilter() {
  const sel = $('#pbTrade');
  const cur = sel.value;
  sel.innerHTML = '<option value="">All trades</option>'
    + effectiveTrades(store.state.priceBookOverrides)
      .map((t) => `<option value="${esc(t)}"${t === cur ? ' selected' : ''}>${esc(t)}</option>`).join('');
}

function wirePriceBook() {
  $('#btnPriceBook').onclick = openPriceBook;
  $('#btnPbCustom').onclick = () => {
    if (!$('#pbQuery').value.trim()) {
      $('#pbQuery').value = 'New item';
    }
    addCustomFromQuery();
  };
  $('#pbQuery').addEventListener('input', renderPriceBookList);
  $('#pbTrade').addEventListener('change', renderPriceBookList);

  // Enter on the search box takes the top hit — keeps two hands on the keyboard.
  $('#pbQuery').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      $('#pbList .pb-row')?.click();
    }
  });
}

function renderPriceBookList() {
  const overrides = store.state.priceBookOverrides;
  const rows = searchEffective($('#pbQuery').value, {
    overrides, trade: $('#pbTrade').value || null,
  });
  const list = $('#pbList');

  const edits = store.priceBookEditCount();
  $('#pbEditNote').textContent = edits
    ? `${edits} cost${edits === 1 ? '' : 's'} set to your own numbers.`
    : 'Costs are national averages — click one to set your own.';

  if (!rows.length) {
    list.innerHTML = `<p class="muted tiny">No matches.
      <button class="btn sm" data-newcustom>Create "${esc($('#pbQuery').value)}" as your own item</button></p>`;
  } else {
    list.innerHTML = rows.map((i) => `
      <div class="pb-row" data-sku="${esc(i.sku)}" tabindex="0" role="button">
        <span>
          <span class="desc">${esc(i.description)}</span>
          <span class="meta"> · ${esc(i.trade)}${i.custom ? ' · yours' : ''}${i.edited ? ' · edited' : ''}</span>
        </span>
        <span class="cat-chip">${CATEGORY_LABELS[i.category]}</span>
        <span class="pb-cost">
          <input class="num pb-cost-input" type="number" step="0.01" min="0"
                 value="${i.unitCost}" data-cost="${esc(i.sku)}"
                 title="Your cost per ${esc(i.unit)}">
          <span class="faint tiny">/${esc(i.unit)}</span>
          ${i.edited || i.custom
            ? `<button class="btn sm icon ghost" data-pbreset="${esc(i.sku)}" title="${i.custom ? 'Delete this item' : 'Restore the default cost'}">↺</button>`
            : `<button class="btn sm icon ghost" data-pbhide="${esc(i.sku)}" title="Hide — I do not sell this">−</button>`}
        </span>
      </div>`).join('');
  }

  // Editing a cost must not add the line; only the description area does that.
  // The row is patched in place rather than re-rendered, because re-rendering
  // the list under an active cursor would eat the keystroke — the same trap
  // the item grid has to work around.
  list.oninput = (e) => {
    const sku = e.target.dataset.cost;
    if (!sku) return;
    store.setPriceBookCost(sku, e.target.value);
    markRowEdited(e.target.closest('.pb-row'), sku);
  };

  list.onclick = (e) => {
    if (e.target.closest('[data-newcustom]')) { addCustomFromQuery(); return; }

    const reset = e.target.closest('[data-pbreset]')?.dataset.pbreset;
    if (reset) { store.resetPriceBookItem(reset); renderPriceBookList(); return; }

    const hide = e.target.closest('[data-pbhide]')?.dataset.pbhide;
    if (hide) {
      store.hidePriceBookItem(hide);
      renderPriceBookList();
      toast('Hidden from your price book.', { undo: true });
      return;
    }

    // A click inside the cost editor is an edit, not an add.
    if (e.target.closest('.pb-cost')) return;

    const sku = e.target.closest('[data-sku]')?.dataset.sku;
    if (sku) addFromPriceBook(sku);
  };

  list.onkeydown = (e) => {
    if (e.key !== 'Enter' || e.target.dataset.cost) return;
    const sku = e.target.closest('[data-sku]')?.dataset.sku;
    if (sku) { e.preventDefault(); addFromPriceBook(sku); }
  };
}

/**
 * Reflect an edit on the row without rebuilding the list: refresh the meta
 * label, swap the hide button for a restore button, and update the counter.
 */
function markRowEdited(row, sku) {
  if (!row) return;
  const item = effectiveItem(sku, store.state.priceBookOverrides);
  if (!item) return;

  const meta = row.querySelector('.meta');
  if (meta) {
    meta.textContent = ` · ${item.trade}${item.custom ? ' · yours' : ''}${item.edited ? ' · edited' : ''}`;
  }

  const btn = row.querySelector('[data-pbhide], [data-pbreset]');
  if (btn) {
    const shouldReset = item.edited || item.custom;
    const isReset = btn.hasAttribute('data-pbreset');
    if (shouldReset !== isReset) {
      btn.removeAttribute(isReset ? 'data-pbreset' : 'data-pbhide');
      btn.setAttribute(shouldReset ? 'data-pbreset' : 'data-pbhide', sku);
      btn.textContent = shouldReset ? '↺' : '−';
      btn.title = shouldReset
        ? (item.custom ? 'Delete this item' : 'Restore the default cost')
        : 'Hide — I do not sell this';
    }
  }

  const edits = store.priceBookEditCount();
  $('#pbEditNote').textContent = edits
    ? `${edits} cost${edits === 1 ? '' : 's'} set to your own numbers.`
    : 'Costs are national averages — click one to set your own.';
}

function addFromPriceBook(sku) {
  const book = effectiveItem(sku, store.state.priceBookOverrides);
  if (!book) return;
  const fields = {
    description: book.description,
    category: book.category,
    unit: book.unit,
    qty: 1,
    unitCost: book.unitCost,
    markup: book.category === 'other' ? 0 : null,
    sku: book.sku,
    trade: book.trade,
  };

  const coId = ui.priceBookTarget;
  const item = coId ? store.addChangeOrderItem(coId, fields) : store.addItem(fields);
  toast(`Added ${book.description}.`, { undo: true });
  $('#dlgPriceBook').close();
  requestAnimationFrame(() => {
    const sel = coId
      ? `[data-coitem="${CSS.escape(item.id)}"] [data-cif="qty"]`
      : `tr[data-id="${CSS.escape(item.id)}"] [data-f="qty"]`;
    $(sel)?.select();
  });
}

/** Turn whatever the user just searched for into an item of their own. */
function addCustomFromQuery() {
  const description = $('#pbQuery').value.trim();
  if (!description) return;
  const sku = store.addCustomPriceBookItem({ description, unitCost: 0 });
  renderTradeFilter();
  renderPriceBookList();
  requestAnimationFrame(() => {
    const el = $(`[data-cost="${CSS.escape(sku)}"]`);
    el?.focus();
    el?.select();
  });
  toast(`Added "${description}" to your price book — set its cost.`);
}

/* ------------------------------------------------------------ assemblies -- */

function wireAssemblies() {
  $('#btnAssembly').onclick = () => {
    renderAssemblies();
    $('#dlgAssembly').showModal();
  };
}

function renderAssemblies() {
  $('#asmGrid').innerHTML = ASSEMBLIES.map((a) => `
    <div class="assembly-card">
      <h4>${esc(a.name)}</h4>
      <p>${esc(a.note)}</p>
      <div class="field" style="margin-bottom:8px">
        <label for="asm-${esc(a.id)}">${esc(a.driver)} (${esc(a.driverUnit)})</label>
        <input id="asm-${esc(a.id)}" class="num" type="number" min="1" step="1" value="${a.defaultDriver}">
      </div>
      <button class="btn sm primary" data-asm="${esc(a.id)}" style="width:100%">Add ${a.items.length} lines</button>
    </div>`).join('');

  $('#asmGrid').onclick = (e) => {
    const id = e.target.closest('[data-asm]')?.dataset.asm;
    if (!id) return;
    const asm = ASSEMBLIES.find((a) => a.id === id);
    const qty = Number($(`#asm-${CSS.escape(asm.id)}`).value) || asm.defaultDriver;
    const items = expandAssemblyWith(asm, qty, store.state.priceBookOverrides);
    store.addItems(items);
    $('#dlgAssembly').close();
    const after = priceEstimate(store.active(), store.state.settings);
    toast(`Added ${items.length} lines — job now ${formatMoney(after.totalCents)} at ${formatPercent(after.margin)} margin.`, { undo: true });
  };
}

/* -------------------------------------------------------------- proposal -- */

function renderProposalPane(est, priced) {
  if (!est) { $('#proposal').innerHTML = ''; return; }
  $('#proposal').innerHTML = renderProposal({
    estimate: est,
    priced,
    company: store.state.company,
    groupByTrade: ui.groupByTrade,
    showLinePrices: ui.showLinePrices,
  });
}

function wireProposal() {
  $('#optGroup').onchange = (e) => { ui.groupByTrade = e.target.checked; render(); };
  $('#optPrices').onchange = (e) => { ui.showLinePrices = e.target.checked; render(); };
  $('#btnPrint').onclick = () => { ui.tab = 'proposal'; render(); requestAnimationFrame(() => window.print()); };
  $('#btnPrint2').onclick = () => window.print();

  $('#btnCopyText').onclick = async () => {
    const est = store.active();
    const text = proposalAsText({
      estimate: est,
      priced: priceEstimate(est, store.state.settings),
      company: store.state.company,
    });
    try {
      await navigator.clipboard.writeText(text);
      toast('Proposal copied — paste into an email or text.');
    } catch {
      // Clipboard access is blocked in some contexts; fall back to a download.
      download(`${est.number}-proposal.txt`, text, 'text/plain');
    }
  };

  $('#btnExportCsv').onclick = () => {
    const est = store.active();
    const csv = store.exportCSV(priceEstimate(est, store.state.settings));
    download(`${est.number}-lines.csv`, csv, 'text/csv');
  };

  wireSignature();
}

/* ------------------------------------------------------------- signature -- */

function wireSignature() {
  const dlg = $('#dlgSign');
  const canvas = $('#sigPad');
  let ctx = null;
  let drawing = false;
  let dirty = false;

  function setup() {
    // Size the backing store to the device pixel ratio, or the signature comes
    // out blurry on every phone.
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1c1917';
    dirty = false;
  }

  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  canvas.addEventListener('pointerdown', (e) => {
    drawing = true; dirty = true;
    canvas.setPointerCapture(e.pointerId);
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  });
  const stop = () => { drawing = false; };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
  canvas.addEventListener('pointerleave', stop);

  /**
   * Signatures are captured for either the proposal or a change order. Both
   * documents carry a signature line, so both need a way to fill it; the only
   * difference is where the result is stored.
   */
  openSignature = (target = { kind: 'estimate' }) => {
    ui.signTarget = target;
    dlg.showModal();
    requestAnimationFrame(setup);
    $('#sigName').value = store.active()?.client?.name || '';
  };
  $('#btnSign').onclick = () => openSignature({ kind: 'estimate' });
  $('#btnSigClear').onclick = () => setup();

  $('#btnSigSave').onclick = () => {
    if (!dirty) { toast('Nothing signed yet.', { bad: true }); return; }
    const signature = {
      dataUrl: canvas.toDataURL('image/png'),
      name: $('#sigName').value.trim(),
      signedAt: new Date().toISOString().slice(0, 10),
    };
    const target = ui.signTarget || { kind: 'estimate' };

    if (target.kind === 'co') {
      store.patchChangeOrder(target.id, { signature }, { coalesce: false });
      store.setChangeOrderStatus(target.id, 'approved');
      dlg.close();
      const c = summarizeContract(store.active(), store.state.settings);
      toast(`Change order signed — contract is now ${formatMoney(c.contractTotalCents)}.`);
      return;
    }

    store.patchEstimate({ signature, status: 'accepted' }, { coalesce: false });
    dlg.close();
    toast('Signed and marked accepted.');
  };
}

/* ------------------------------------------------------------------ jobs -- */

function renderJobs() {
  // Every figure here is the CONTRACT value, not the original estimate. Once a
  // change order is approved it is money the client owes; a dashboard that
  // still reports the day-one number understates the business by exactly the
  // amount the contractor worked hardest to capture.
  const all = store.state.estimates.map((e) => ({
    est: e,
    contract: summarizeContract(e, store.state.settings),
  }));
  const open = all.filter((r) => r.est.status !== 'declined');
  const won = all.filter((r) => r.est.status === 'accepted');

  const pipeline = open.reduce((a, r) => a + r.contract.contractTotalCents, 0);
  const wonValue = won.reduce((a, r) => a + r.contract.contractTotalCents, 0);
  const wonProfit = won.reduce((a, r) => a + r.contract.contractProfitCents, 0);
  const avgMargin = all.length
    ? all.reduce((a, r) => a + r.contract.contractMargin, 0) / all.length : 0;
  const belowTarget = all.filter(
    (r) => r.contract.contractMargin < store.state.settings.targetMargin).length;

  const atRisk = all.reduce((a, r) => a + r.contract.atRiskCents, 0);
  const atRiskJobs = all.filter((r) => r.contract.unapprovedCount > 0).length;
  const changeValue = all.reduce((a, r) => a + r.contract.approvedTotalCents, 0);

  $('#jobStats').innerHTML = `
    <div class="stat"><div class="k">Open pipeline</div><div class="v">${formatMoney(pipeline, { cents: false })}</div><div class="s">${open.length} job${open.length === 1 ? '' : 's'}</div></div>
    <div class="stat"><div class="k">Accepted</div><div class="v">${formatMoney(wonValue, { cents: false })}</div><div class="s">${formatMoney(wonProfit, { cents: false })} profit</div></div>
    <div class="stat"><div class="k">Average margin</div><div class="v">${formatPercent(avgMargin)}</div><div class="s">target ${formatPercent(store.state.settings.targetMargin)}</div></div>
    ${atRisk
      ? `<div class="stat" style="border-color:color-mix(in srgb,var(--warn) 45%,transparent)">
           <div class="k">Unsigned changes</div>
           <div class="v" style="color:var(--warn)">${formatMoney(atRisk, { cents: false })}</div>
           <div class="s">across ${atRiskJobs} job${atRiskJobs === 1 ? '' : 's'}</div></div>`
      : `<div class="stat"><div class="k">Under target</div><div class="v">${belowTarget}</div><div class="s">of ${all.length} job${all.length === 1 ? '' : 's'}</div></div>`}
    ${changeValue
      ? `<div class="stat"><div class="k">Approved changes</div><div class="v">${formatMoney(changeValue, { cents: false })}</div><div class="s">already in the totals above</div></div>`
      : ''}`;

  $('#estList').innerHTML = all.map(({ est, contract }) => `
    <div class="est-row${est.id === store.state.activeId ? ' active' : ''}" data-open="${esc(est.id)}">
      <span>
        <div class="t">${esc(est.title || 'Untitled')}</div>
        <div class="sub">${esc(est.number)} · ${esc(est.client?.name || 'no client')} · updated ${esc(est.updatedAt)}${
          contract.unapprovedCount
            ? ` · <span style="color:var(--warn);font-weight:600">${formatMoney(contract.atRiskCents, { cents: false })} unsigned</span>`
            : ''}</div>
      </span>
      <select class="status-select" data-status="${esc(est.id)}" onclick="event.stopPropagation()">
        ${['draft', 'sent', 'accepted', 'declined'].map((s) =>
          `<option value="${s}"${est.status === s ? ' selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}
      </select>
      <span class="num right">
        ${formatMoney(contract.contractTotalCents, { cents: false })}
        <div class="tiny" style="color:var(--${contract.contractMargin < store.state.settings.floorMargin ? 'bad' : contract.contractMargin < store.state.settings.targetMargin ? 'warn' : 'good'})">
          ${formatPercent(contract.contractMargin)} margin${contract.approvedCount ? ` · ${contract.approvedCount} change${contract.approvedCount === 1 ? '' : 's'}` : ''}
        </div>
      </span>
      <span style="display:flex;gap:4px">
        <button class="btn sm ghost" data-dup="${esc(est.id)}" title="Duplicate">⧉</button>
        <button class="btn sm ghost danger" data-del="${esc(est.id)}" title="Delete">✕</button>
      </span>
    </div>`).join('') || '<p class="muted">No estimates yet.</p>';
}

function wireJobs() {
  $('#estList').addEventListener('click', (e) => {
    const dup = e.target.closest('[data-dup]')?.dataset.dup;
    if (dup) { store.duplicateEstimate(dup); toast('Duplicated.'); return; }

    const del = e.target.closest('[data-del]')?.dataset.del;
    if (del) {
      const est = store.state.estimates.find((x) => x.id === del);
      store.deleteEstimate(del);
      toast(`Deleted ${est?.title || 'estimate'}.`, { undo: true });
      return;
    }

    const open = e.target.closest('[data-open]')?.dataset.open;
    if (open) { store.setActive(open); ui.tab = 'estimate'; render(); }
  });

  $('#estList').addEventListener('change', (e) => {
    const id = e.target.dataset.status;
    if (!id) return;
    store.update((s) => {
      const est = s.estimates.find((x) => x.id === id);
      if (est) est.status = e.target.value;
    }, { label: 'status' });
  });

  $('#btnExportAll').onclick = $('#btnExportAll2').onclick = () => {
    download(`quoteforge-backup-${new Date().toISOString().slice(0, 10)}.json`,
      store.exportAll(), 'application/json');
    toast('Backup downloaded.');
  };

  const picker = $('#fileImport');
  $('#btnImport').onclick = $('#btnImport2').onclick = () => picker.click();
  picker.onchange = async () => {
    const file = picker.files?.[0];
    if (!file) return;
    try {
      const res = store.importJSON(await file.text());
      toast(`Imported ${res.imported} estimate${res.imported === 1 ? '' : 's'}.`);
      ui.tab = 'jobs';
      render();
    } catch (err) {
      toast(err.message, { bad: true });
    }
    picker.value = '';
  };
}

/* -------------------------------------------------------------- settings -- */

function renderSettings() {
  const s = store.state.settings;
  const co = store.state.company;

  for (const input of $$('[data-pct]')) {
    if (document.activeElement === input) continue;
    input.value = ((Number(s[input.dataset.pct]) || 0) * 100).toFixed(2).replace(/\.?0+$/, '');
  }
  for (const input of $$('[data-set]')) {
    if (document.activeElement === input) continue;
    input.value = s[input.dataset.set] ?? '';
  }
  for (const input of $$('[data-co]')) {
    if (document.activeElement === input) continue;
    input.value = co[input.dataset.co] ?? '';
  }

  const target = Number(s.targetMargin) || 0;
  $('#targetHint').textContent =
    `Needs ${formatPercent(marginToMarkup(target), 0)} markup on cost.`;

  $('#catMarkups').innerHTML = CATEGORIES.map((c) => {
    const v = s.categoryMarkup[c] ?? s.defaultMarkup;
    return `
      <div class="field">
        <label for="cm-${c}">${CATEGORY_LABELS[c]}</label>
        <input id="cm-${c}" class="num" type="number" step="1" min="0" data-catmk="${c}"
               value="${(v * 100).toFixed(0)}">
        <span class="hint">= ${formatPercent(markupToMargin(v), 0)} margin</span>
      </div>`;
  }).join('');

  renderMilestoneEditor();
  renderTermsEditor();

  $('#storageNote').textContent = storage.__ephemeral
    ? 'Heads up: this browser is blocking storage, so nothing will persist after you close the tab.'
    : '';
  $('#logoHint').textContent = co.logoDataUrl
    ? 'Logo set. Stored in this browser only.'
    : 'Stored in this browser only.';
}

function wireSettings() {
  document.addEventListener('input', (e) => {
    const pct = e.target.dataset?.pct;
    if (pct) {
      store.patchSettings({ [pct]: (Number(e.target.value) || 0) / 100 });
      return;
    }
    const cat = e.target.dataset?.catmk;
    if (cat) {
      const next = { ...store.state.settings.categoryMarkup, [cat]: (Number(e.target.value) || 0) / 100 };
      store.patchSettings({ categoryMarkup: next });
      return;
    }
    const co = e.target.dataset?.co;
    if (co) store.patchCompany({ [co]: e.target.value });
  });

  document.addEventListener('change', (e) => {
    const set = e.target.dataset?.set;
    if (set) store.patchSettings({ [set]: e.target.value });
  });

  $('#cLogo').onchange = async () => {
    const file = $('#cLogo').files?.[0];
    if (!file) return;
    if (file.size > 400 * 1024) {
      toast('That logo is over 400 KB — browser storage is limited, so use a smaller one.', { bad: true });
      $('#cLogo').value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { store.patchCompany({ logoDataUrl: reader.result }); toast('Logo saved.'); };
    reader.readAsDataURL(file);
  };

  $('#btnAddTerm').onclick = () => {
    const est = store.active();
    store.patchEstimate({ terms: [...(est.terms || []), ''] }, { coalesce: false });
    requestAnimationFrame(() => $$('#termsEditor textarea').at(-1)?.focus());
  };
}

function renderMilestoneEditor() {
  const est = store.active();
  if (!est) return;
  const priced = priceEstimate(est, store.state.settings);
  const schedule = buildSchedule(priced.totalCents, est.milestones);
  const totalPct = est.milestones.reduce((a, m) => a + (Number(m.percent) || 0), 0);

  $('#milestoneEditor').innerHTML = `
    ${est.milestones.map((m, i) => `
      <div style="display:grid;grid-template-columns:1fr 62px 28px;gap:6px;align-items:center;margin-bottom:6px">
        <input value="${esc(m.label)}" data-ms="${i}" data-msf="label" placeholder="Milestone">
        <input class="num" type="number" step="1" min="0" max="100" data-ms="${i}" data-msf="percent"
               value="${((Number(m.percent) || 0) * 100).toFixed(0)}">
        <button class="btn sm ghost" data-msdel="${i}" title="Remove">✕</button>
      </div>
      <div class="tiny faint" style="margin:-3px 0 8px 2px">${formatMoney(schedule[i]?.amountCents || 0)}</div>
    `).join('')}
    <div style="display:flex;gap:8px;align-items:center;margin-top:8px">
      <button class="btn sm" data-msadd>+ Milestone</button>
      <span class="tiny ${Math.abs(totalPct - 1) > 0.005 ? '' : 'faint'}"
            style="${Math.abs(totalPct - 1) > 0.005 ? 'color:var(--warn)' : ''}">
        ${(totalPct * 100).toFixed(0)}% allocated${Math.abs(totalPct - 1) > 0.005 ? ' — the last milestone absorbs the difference' : ''}
      </span>
    </div>`;

  const el = $('#milestoneEditor');
  el.oninput = (e) => {
    const i = e.target.dataset.ms;
    if (i === undefined) return;
    const field = e.target.dataset.msf;
    const value = field === 'percent' ? (Number(e.target.value) || 0) / 100 : e.target.value;
    const next = est.milestones.map((m, idx) => (String(idx) === i ? { ...m, [field]: value } : m));
    store.patchEstimate({ milestones: next }, { coalesce: true, label: `ms-${i}-${field}` });
  };
  el.onclick = (e) => {
    if (e.target.closest('[data-msadd]')) {
      store.patchEstimate({ milestones: [...est.milestones, { label: 'Payment', percent: 0 }] }, { coalesce: false });
    }
    const del = e.target.closest('[data-msdel]')?.dataset.msdel;
    if (del !== undefined) {
      store.patchEstimate({ milestones: est.milestones.filter((_, i) => String(i) !== del) }, { coalesce: false });
    }
  };
}

function renderTermsEditor() {
  const est = store.active();
  if (!est) return;
  $('#termsEditor').innerHTML = `
    ${(est.terms || []).map((t, i) => `
      <div style="display:grid;grid-template-columns:1fr 28px;gap:6px;margin-bottom:6px">
        <textarea data-term="${i}" rows="2" style="font-size:12px">${esc(t)}</textarea>
        <button class="btn sm ghost" data-termdel="${i}" title="Remove">✕</button>
      </div>`).join('')}
    <button class="btn sm" data-termreset style="margin-top:4px">Restore default terms</button>`;

  const el = $('#termsEditor');
  el.oninput = (e) => {
    const i = e.target.dataset.term;
    if (i === undefined) return;
    const next = est.terms.map((t, idx) => (String(idx) === i ? e.target.value : t));
    store.patchEstimate({ terms: next }, { coalesce: true, label: `term-${i}` });
  };
  el.onclick = (e) => {
    const del = e.target.closest('[data-termdel]')?.dataset.termdel;
    if (del !== undefined) {
      store.patchEstimate({ terms: est.terms.filter((_, i) => String(i) !== del) }, { coalesce: false });
    }
    if (e.target.closest('[data-termreset]')) {
      store.patchEstimate({ terms: [...DEFAULT_TERMS] }, { coalesce: false });
      toast('Default terms restored.', { undo: true });
    }
  };
}

/* ---------------------------------------------------------------- chrome -- */

function wireChrome() {
  $('#estSelect').onchange = (e) => store.setActive(e.target.value);
  $('#btnNew').onclick = () => {
    store.createEstimate();
    ui.tab = 'estimate';
    render();
    $('#fTitle').focus();
  };
  $('#btnUndo').onclick = () => store.undo();
  $('#btnRedo').onclick = () => store.redo();
  $('#btnAddLine').onclick = () => focusNewLine(store.addItem());

  for (const tab of $$('.tab')) {
    tab.onclick = () => { ui.tab = tab.dataset.tab; render(); };
  }
  for (const btn of $$('dialog [data-close]')) {
    btn.onclick = () => btn.closest('dialog').close();
  }

  $('#btnTheme').onclick = () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : cur === 'light' ? '' : 'dark';
    if (next) document.documentElement.setAttribute('data-theme', next);
    else document.documentElement.removeAttribute('data-theme');
    try { storage.setItem('quoteforge.theme', next); } catch { /* ignore */ }
  };

  $('#btnHelp').onclick = () => {
    $('#helpRows').innerHTML = SHORTCUTS.map(([k, d]) =>
      `<tr><td style="width:120px"><kbd>${esc(k)}</kbd></td><td>${esc(d)}</td></tr>`).join('');
    $('#dlgHelp').showModal();
  };
}

function applyStoredTheme() {
  try {
    const t = storage.getItem('quoteforge.theme');
    if (t) document.documentElement.setAttribute('data-theme', t);
  } catch { /* ignore */ }
}

/* ------------------------------------------------------------- shortcuts -- */

const SHORTCUTS = [
  ['A', 'Add a blank line item'],
  ['K', 'Open the price book'],
  ['N', 'New estimate'],
  ['Enter', 'In the grid: add a line below'],
  ['⌘/Ctrl+⌫', 'In the grid: delete the line'],
  ['⌘/Ctrl+Z', 'Undo'],
  ['⌘/Ctrl+⇧+Z', 'Redo'],
  ['⌘/Ctrl+P', 'Print / save as PDF'],
  ['1 – 6', 'Switch tabs'],
  ['?', 'This list'],
];

function wireShortcuts() {
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    const mod = e.metaKey || e.ctrlKey;

    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.shiftKey ? store.redo() : store.undo();
      return;
    }
    if (mod && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      ui.tab = 'proposal'; render();
      requestAnimationFrame(() => window.print());
      return;
    }
    if (typing || mod) return;

    switch (e.key) {
      case 'a': e.preventDefault(); focusNewLine(store.addItem()); break;
      case 'k': e.preventDefault(); openPriceBook(); break;
      case 'n': e.preventDefault(); store.createEstimate(); ui.tab = 'estimate'; render(); break;
      case '?': e.preventDefault(); $('#btnHelp').click(); break;
      case '1': ui.tab = 'estimate'; render(); break;
      case '2': ui.tab = 'proposal'; render(); break;
      case '3': ui.tab = 'changes'; render(); break;
      case '4': ui.tab = 'costs'; render(); break;
      case '5': ui.tab = 'jobs'; render(); break;
      case '6': ui.tab = 'settings'; render(); break;
    }
  });
}

/* ---------------------------------------------------------------- toasts -- */

let toastTimer = null;

function toast(message, { bad = false, undo = false, ms = 4200 } = {}) {
  const host = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast${bad ? ' bad' : ''}`;
  el.innerHTML = `<span>${esc(message)}</span>`;
  if (undo) {
    const btn = document.createElement('button');
    btn.textContent = 'Undo';
    btn.onclick = () => { store.undo(); el.remove(); };
    el.append(btn);
  }
  host.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), ms);
  // Never let toasts stack past a readable few.
  while (host.children.length > 3) host.firstChild.remove();
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

boot();

/* ------------------------------------------------------- change orders --- */

/**
 * The tab badge counts UNAPPROVED change orders, not all of them. An approved
 * change order is finished business; an unapproved one is work that may
 * already be underway with nothing signed, which is the thing worth nagging
 * about from across the app.
 */
function renderChangeBadge(est) {
  const badge = $('#coBadge');
  if (!est || !est.changeOrders?.length) { badge.classList.add('hidden'); return; }
  const c = summarizeContract(est, store.state.settings);
  badge.classList.remove('hidden');
  badge.textContent = c.unapprovedCount || c.approvedCount;
  badge.classList.toggle('ok', c.unapprovedCount === 0);
  badge.title = c.unapprovedCount
    ? `${c.unapprovedCount} change order${c.unapprovedCount === 1 ? '' : 's'} awaiting approval`
    : `${c.approvedCount} approved change order${c.approvedCount === 1 ? '' : 's'}`;
}

function renderChanges(est) {
  if (!est) { $('#coList').innerHTML = ''; return; }
  const c = summarizeContract(est, store.state.settings);

  renderCOList(est, c);
  renderContractPanel(c);
  renderCOEditor(est, c);

  $('#stmtPrint').innerHTML = renderContractStatement({
    estimate: est, contract: c, company: store.state.company,
  });

  const order = store.activeChangeOrder();
  $('#coPrint').innerHTML = order
    ? renderChangeOrder({
        estimate: est,
        order,
        priced: c.orders.find((o) => o.order.id === order.id).priced,
        contract: c,
        company: store.state.company,
      })
    : '';
}

function renderCOList(est, contract) {
  const list = $('#coList');
  if (!est.changeOrders.length) {
    list.innerHTML = `
      <div class="empty-state" style="padding:28px 16px">
        <h3>No change orders yet</h3>
        <p>When the client asks for something that is not in the contract — or you open a wall
           and find rot — write it up here before the work starts. An unsigned change is the
           second most common way a job loses money.</p>
        <button class="btn primary" data-conew>+ Write the first one</button>
      </div>`;
    list.onclick = (e) => { if (e.target.closest('[data-conew]')) newChangeOrder(); };
    return;
  }

  const activeId = store.state.activeChangeOrderId;
  list.innerHTML = contract.orders.map(({ order, priced }) => {
    const credit = priced.totalCents < 0;
    const cls = order.status === 'approved' ? 'approved'
      : order.status === 'rejected' ? 'rejected' : 'unapproved';
    return `
      <div class="co-row ${cls}${order.id === activeId ? ' active' : ''}" data-co="${esc(order.id)}">
        <span>
          <div class="t">${esc(order.number)} — ${esc(order.title || 'Untitled change')}</div>
          <div class="sub">${order.items.length} line${order.items.length === 1 ? '' : 's'}
            · created ${esc(order.createdAt)}${order.decidedAt ? ` · decided ${esc(order.decidedAt)}` : ''}</div>
        </span>
        <span class="status-chip ${esc(order.status)}">${esc(order.status)}</span>
        <span class="amt${credit ? ' credit' : ''}">${credit ? '−' : '+'}${formatMoney(Math.abs(priced.totalCents))}</span>
        <button class="btn sm ghost danger" data-codel="${esc(order.id)}" title="Delete">✕</button>
      </div>`;
  }).join('');

  list.onclick = (e) => {
    const del = e.target.closest('[data-codel]')?.dataset.codel;
    if (del) {
      const order = est.changeOrders.find((o) => o.id === del);
      store.removeChangeOrder(del);
      toast(`Deleted ${order?.number || 'change order'}.`, { undo: true });
      return;
    }
    const open = e.target.closest('[data-co]')?.dataset.co;
    if (open) store.setActiveChangeOrder(open);
  };
}

function renderContractPanel(c) {
  const el = $('#contractPanel');
  const grew = c.contractTotalCents - c.originalTotalCents;

  el.innerHTML = `
<div class="figure"><span class="label">Original contract</span><span class="value">${formatMoney(c.originalTotalCents)}</span></div>
${c.approvedCount
  ? `<div class="figure"><span class="label">Approved changes (${c.approvedCount})</span><span class="value">${grew < 0 ? '−' : '+'}${formatMoney(Math.abs(c.approvedTotalCents))}</span></div>`
  : ''}
<div class="figure total"><span class="label">Contract now</span><span class="value">${formatMoney(c.contractTotalCents)}</span></div>

<div class="figure" style="margin-top:8px">
  <span class="label tiny">Profit on the whole job</span>
  <span class="value tiny">${formatMoney(c.contractProfitCents)}</span>
</div>
<div class="figure">
  <span class="label tiny">Margin including changes</span>
  <span class="value tiny">${formatPercent(c.contractMargin)}</span>
</div>

${c.unapprovedCount ? `
  <div class="risk">
    <strong>${formatMoney(c.atRiskCents)} not authorized.</strong>
    ${c.unapprovedCount} change order${c.unapprovedCount === 1 ? '' : 's'}
    ${c.unapprovedCount === 1 ? 'is' : 'are'} unsigned. If that work is already underway you are
    carrying ${formatMoney(c.atRiskCostCents)} of your own cost with nothing to invoice against.
    Get it signed before the crew starts.
  </div>`
  : c.approvedCount ? `
  <div class="risk clear">
    <strong>Everything is authorized.</strong>
    All ${c.approvedCount} change order${c.approvedCount === 1 ? '' : 's'} on this job
    ${c.approvedCount === 1 ? 'is' : 'are'} signed and in the contract total.
  </div>` : ''}`;
}

function renderCOEditor(est, contract) {
  const order = store.activeChangeOrder();
  const card = $('#coEditorCard');
  if (!order) { card.hidden = true; return; }
  card.hidden = false;

  const entry = contract.orders.find((o) => o.order.id === order.id);
  const priced = entry.priced;
  $('#coEditorTitle').textContent = `${order.number} — ${order.title || 'Untitled change'}`;

  const focus = captureCOFocus();

  const STATUSES = [
    ['draft', 'Draft'], ['sent', 'Sent to client'],
    ['approved', 'Approved'], ['rejected', 'Rejected'],
  ];

  $('#coEditor').innerHTML = `
<div class="co-status-row">
  ${STATUSES.map(([v, label]) =>
    `<button class="btn sm" data-costatus="${v}" aria-pressed="${order.status === v}">${label}</button>`).join('')}
</div>

<div class="grid-2">
  <div class="field">
    <label>What changed</label>
    <input data-cof="title" value="${esc(order.title)}" placeholder="Rotten subfloor at the tub wall">
  </div>
  <div class="field">
    <label>Working days added</label>
    <input class="num" type="number" step="1" data-cof="daysAdded" value="${esc(order.daysAdded || 0)}">
  </div>
</div>
<div class="field">
  <label>Why <span class="hint">— this is what the client will read months from now</span></label>
  <textarea data-cof="reason" placeholder="Demolition exposed water damage to the subfloor and two joists. Repair is required before tile can be set.">${esc(order.reason)}</textarea>
</div>

<table class="items">
  <thead>
    <tr><th>Description</th><th>Category</th><th class="right">Qty</th><th>Unit</th>
        <th class="right">Unit cost</th><th class="right">Price</th><th></th></tr>
  </thead>
  <tbody>
    ${order.items.map((item) => {
      const l = priced.lines.find((x) => x.id === item.id);
      return `
      <tr data-coitem="${esc(item.id)}">
        <td><input data-cif="description" value="${esc(item.description)}" placeholder="Description"></td>
        <td style="width:132px">
          <select data-cif="category">
            ${CATEGORIES.map((cat) => `<option value="${cat}"${cat === item.category ? ' selected' : ''}>${CATEGORY_LABELS[cat]}</option>`).join('')}
          </select>
        </td>
        <td style="width:86px"><input data-cif="qty" class="num" type="number" step="0.01" value="${esc(item.qty)}"></td>
        <td style="width:72px">
          <select data-cif="unit">
            ${UNITS.map((u) => `<option value="${u}"${u === item.unit ? ' selected' : ''}>${u}</option>`).join('')}
          </select>
        </td>
        <td style="width:92px"><input data-cif="unitCost" class="num" type="number" step="0.01" value="${esc(item.unitCost)}"></td>
        <td class="computed">${formatMoney(l?.priceCents || 0)}</td>
        <td class="col-actions" style="width:34px">
          <div class="row-tools"><button class="btn sm icon ghost" data-coidel title="Delete line">✕</button></div>
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="7" class="muted tiny" style="padding:12px">No lines yet.</td></tr>'}
  </tbody>
</table>

<div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap">
  <button class="btn sm primary" data-coadd>+ Line</button>
  <button class="btn sm" data-cobook>Price book</button>
  <button class="btn sm" data-cosign>${order.signature ? 'Re-sign' : 'Capture signature'}</button>
  <span style="flex:1"></span>
  <span class="tiny faint">Cost ${formatMoney(priced.burdenedCostCents)}</span>
  <span class="num" style="font-weight:650">${priced.totalCents < 0 ? '−' : '+'}${formatMoney(Math.abs(priced.totalCents))}</span>
  <span class="tiny ${priced.margin < store.state.settings.floorMargin ? '' : 'faint'}"
        style="${priced.margin < store.state.settings.floorMargin ? 'color:var(--warn)' : ''}">
    ${formatPercent(priced.margin)} margin
  </span>
</div>

${order.status !== 'approved' ? `
  <div class="coach warn" style="margin-top:12px">
    <strong>Not authorized yet.</strong>
    Print this, get a signature, then mark it approved. Until then it is not part of the
    contract and you cannot invoice for it.
  </div>`
  : `
  <div class="coach ${order.signature ? 'bad' : 'good'}" style="margin-top:12px">
    <strong>Approved${order.decidedAt ? ` on ${esc(order.decidedAt)}` : ''}${order.signature ? ' and signed' : ''}.</strong>
    ${order.signature
      ? `The client signed for ${formatMoney(priced.totalCents)}. Editing the lines below changes
         what they authorized — reissue this as a new change order instead, or clear the
         signature and get it re-signed.`
      : 'This is in the contract total. Anything you change here changes the contract.'}
    ${order.signature
      ? '<div class="fix"><button class="btn sm" data-coclearsig>Clear signature and reopen</button></div>'
      : ''}
  </div>`}`;

  wireCOEditor(order);
  restoreCOFocus(focus);
}

function wireCOEditor(order) {
  const el = $('#coEditor');

  el.oninput = (e) => {
    const cof = e.target.dataset.cof;
    if (cof) {
      const v = cof === 'daysAdded' ? (Number(e.target.value) || 0) : e.target.value;
      store.patchChangeOrder(order.id, { [cof]: v }, { label: `co-${order.id}-${cof}`, coalesce: true });
      return;
    }
    const tr = e.target.closest('[data-coitem]');
    const cif = e.target.dataset.cif;
    if (!tr || !cif) return;
    let value = e.target.value;
    if (cif === 'qty' || cif === 'unitCost') {
      value = value === '' ? 0 : Number(value);
      if (!Number.isFinite(value)) return;
    }
    store.patchChangeOrderItem(order.id, tr.dataset.coitem, { [cif]: value },
      { label: `coi-${tr.dataset.coitem}-${cif}`, coalesce: true });
  };

  el.onclick = (e) => {
    const status = e.target.closest('[data-costatus]')?.dataset.costatus;
    if (status) {
      store.setChangeOrderStatus(order.id, status);
      if (status === 'approved') {
        const c = summarizeContract(store.active(), store.state.settings);
        toast(`Approved — contract is now ${formatMoney(c.contractTotalCents)}.`, { undo: true });
      }
      return;
    }
    if (e.target.closest('[data-coadd]')) {
      const item = store.addChangeOrderItem(order.id, {});
      requestAnimationFrame(() => {
        $(`[data-coitem="${CSS.escape(item.id)}"] [data-cif="description"]`)?.focus();
      });
      return;
    }
    if (e.target.closest('[data-cobook]')) { openPriceBook({ into: order.id }); return; }
    if (e.target.closest('[data-cosign]')) { openSignature({ kind: 'co', id: order.id }); return; }
    if (e.target.closest('[data-coclearsig]')) {
      // Reopening drops the signature and the decision date together. Keeping
      // either one would leave a document claiming the client authorized an
      // amount that is no longer what the change order says.
      store.patchChangeOrder(order.id, { signature: null, status: 'sent', decidedAt: '' },
        { coalesce: false });
      toast('Signature cleared — get this re-signed before invoicing.', { undo: true });
      return;
    }
    const del = e.target.closest('[data-coidel]');
    if (del) {
      store.removeChangeOrderItem(order.id, del.closest('[data-coitem]').dataset.coitem);
    }
  };
}

/** Focus preservation, same reason as the main grid: typing must not be eaten. */
function captureCOFocus() {
  const el = document.activeElement;
  if (!el) return null;
  if (el.dataset?.cof) return { kind: 'field', key: el.dataset.cof, start: el.selectionStart, end: el.selectionEnd };
  const tr = el.closest?.('[data-coitem]');
  if (tr && el.dataset.cif) {
    return { kind: 'item', id: tr.dataset.coitem, key: el.dataset.cif, start: el.selectionStart, end: el.selectionEnd };
  }
  return null;
}

function restoreCOFocus(focus) {
  if (!focus) return;
  const el = focus.kind === 'field'
    ? $(`#coEditor [data-cof="${focus.key}"]`)
    : $(`[data-coitem="${CSS.escape(focus.id)}"] [data-cif="${focus.key}"]`);
  if (!el) return;
  el.focus();
  if (focus.start != null && el.setSelectionRange && el.type !== 'number') {
    try { el.setSelectionRange(focus.start, focus.end); } catch { /* not selectable */ }
  }
}

function newChangeOrder() {
  const order = store.addChangeOrder();
  ui.tab = 'changes';
  render();
  requestAnimationFrame(() => $('#coEditor [data-cof="title"]')?.focus());
  return order;
}

function wireChangeOrders() {
  $('#btnAddCO').onclick = newChangeOrder;

  $('#btnStatement').onclick = () => {
    document.body.dataset.print = 'stmt';
    requestAnimationFrame(() => {
      window.print();
      delete document.body.dataset.print;
    });
  };

  $('#btnCOPrint').onclick = () => {
    if (!store.activeChangeOrder()) return;
    document.body.dataset.print = 'co';
    requestAnimationFrame(() => {
      window.print();
      delete document.body.dataset.print;
    });
  };
}

/* ------------------------------------------------------------ job costs --- */

/**
 * The Costs badge appears only when a category is over budget. A count of
 * entries would be noise; an overrun is the one thing worth interrupting for,
 * because every day it runs it gets quietly bigger.
 */
function renderCostsBadge(est) {
  const badge = $('#acBadge');
  if (!est || !est.actuals?.length) { badge.classList.add('hidden'); return; }
  const c = compareActuals(est, store.state.settings);
  const overCats = Object.values(c.byCategory).filter((v) => v.overrunCents > 0).length;
  badge.classList.toggle('hidden', overCats === 0);
  if (overCats) {
    badge.textContent = overCats;
    badge.title = `${overCats} categor${overCats === 1 ? 'y is' : 'ies are'} over budget`;
  }
}

function renderCosts(est) {
  if (!est) { $('#actualsWrap').innerHTML = ''; return; }
  const c = compareActuals(est, store.state.settings);
  renderActualsGrid(est, c);
  renderBudgetPanel(c);
  renderFadePanel(c);
}

function renderActualsGrid(est, c) {
  const wrap = $('#actualsWrap');

  if (!est.actuals.length) {
    wrap.innerHTML = `
      <div class="empty-state" style="padding:32px 16px">
        <h3>Nothing logged yet</h3>
        <p>Every receipt, sub invoice, and week of payroll goes here — against the category it
           was estimated under. That is the whole system. At the end of the job you will know
           which trade made money and which one ate it.</p>
        <button class="btn primary" data-acnew>+ Log the first cost</button>
      </div>`;
    wrap.onclick = (e) => { if (e.target.closest('[data-acnew]')) addActualRow(); };
    return;
  }

  const focus = captureACFocus();

  wrap.innerHTML = `
<table class="items">
  <thead>
    <tr><th style="width:118px">Date</th><th style="width:132px">Category</th>
        <th>What it was</th><th class="right" style="width:110px">Amount</th><th style="width:34px"></th></tr>
  </thead>
  <tbody>
    ${c.entries.map((a) => `
      <tr data-ac="${esc(a.id)}">
        <td><input data-acf="date" type="date" value="${esc(a.date)}"></td>
        <td>
          <select data-acf="category">
            ${CATEGORIES.map((cat) => `<option value="${cat}"${cat === a.category ? ' selected' : ''}>${CATEGORY_LABELS[cat]}</option>`).join('')}
          </select>
        </td>
        <td><input data-acf="description" value="${esc(a.description)}" placeholder="Sub invoice, receipt, payroll…"></td>
        <td><input data-acf="amount" class="num" type="number" step="0.01" value="${esc(a.amount)}"></td>
        <td class="col-actions">
          <div class="row-tools"><button class="btn sm icon ghost" data-acdel title="Delete">✕</button></div>
        </td>
      </tr>`).join('')}
  </tbody>
</table>
<div style="padding:8px 14px;border-top:1px solid var(--border);display:flex;gap:10px;align-items:center">
  <span class="tiny faint">${c.entries.length} entr${c.entries.length === 1 ? 'y' : 'ies'}</span>
  <span style="flex:1"></span>
  <span class="tiny faint">Spent ${formatMoney(c.spentCents)} of ${formatMoney(c.budgetCents)} budgeted</span>
</div>`;

  wrap.oninput = (e) => {
    const tr = e.target.closest('tr[data-ac]');
    const field = e.target.dataset.acf;
    if (!tr || !field) return;
    let value = e.target.value;
    if (field === 'amount') {
      value = value === '' ? 0 : Number(value);
      if (!Number.isFinite(value)) return;
    }
    store.patchActual(tr.dataset.ac, { [field]: value },
      { label: `ac-${tr.dataset.ac}-${field}`, coalesce: true });
  };

  wrap.onclick = (e) => {
    const del = e.target.closest('[data-acdel]');
    if (!del) return;
    const id = del.closest('tr[data-ac]').dataset.ac;
    const entry = est.actuals.find((a) => a.id === id);
    store.removeActual(id);
    toast(`Removed ${entry?.description || 'entry'}.`, { undo: true });
  };

  restoreACFocus(focus);
}

function captureACFocus() {
  const el = document.activeElement;
  const tr = el?.closest?.('tr[data-ac]');
  if (!tr || !el.dataset.acf) return null;
  return { id: tr.dataset.ac, field: el.dataset.acf, start: el.selectionStart, end: el.selectionEnd };
}

function restoreACFocus(focus) {
  if (!focus) return;
  const el = $(`tr[data-ac="${CSS.escape(focus.id)}"] [data-acf="${focus.field}"]`);
  if (!el) return;
  el.focus();
  if (focus.start != null && el.setSelectionRange && el.type === 'text') {
    try { el.setSelectionRange(focus.start, focus.end); } catch { /* not selectable */ }
  }
}

function addActualRow() {
  const entry = store.addActual();
  requestAnimationFrame(() => {
    $(`tr[data-ac="${CSS.escape(entry.id)}"] [data-acf="description"]`)?.focus();
  });
}

function renderBudgetPanel(c) {
  const el = $('#budgetPanel');
  const cats = Object.entries(c.byCategory);
  if (!cats.length) {
    el.innerHTML = '<p class="tiny faint" style="margin:0">Price the estimate first — the budget comes from it.</p>';
    return;
  }
  el.innerHTML = cats.map(([cat, v]) => {
    const ratio = v.budgetCents === 0 ? (v.spentCents > 0 ? 1.01 : 0) : v.spentCents / v.budgetCents;
    const cls = ratio > 1 ? 'over' : ratio > 0.85 ? 'warm' : '';
    return `
      <div class="budget-bar">
        <div class="head">
          <span>${CATEGORY_LABELS[cat]}</span>
          <span class="num">${formatMoney(v.spentCents)} / ${formatMoney(v.budgetCents)}</span>
        </div>
        <div class="budget-track">
          <div class="budget-fill ${cls}" style="width:${Math.min(100, Math.max(0, ratio * 100))}%"></div>
        </div>
        <div class="foot ${v.overrunCents ? 'over' : ''}">
          ${v.overrunCents
            ? `${formatMoney(v.overrunCents)} over budget`
            : `${formatMoney(v.remainingCents)} left to spend`}
        </div>
      </div>`;
  }).join('');
}

function renderFadePanel(c) {
  const el = $('#fadePanel');
  const floor = Number(store.state.settings.floorMargin) || 0;

  el.innerHTML = `
<div class="figure"><span class="label">Margin at estimate</span><span class="value">${formatPercent(c.estimatedMargin)}</span></div>
<div class="figure"><span class="label">Margin after overruns</span>
  <span class="value" style="${c.overrunCents ? 'color:var(--bad);font-weight:650' : ''}">${formatPercent(c.adjustedMargin)}</span></div>
<div class="figure"><span class="label">Profit at estimate</span><span class="value">${formatMoney(c.estimatedProfitCents)}</span></div>
<div class="figure total"><span class="label">Profit as it stands</span><span class="value">${formatMoney(c.adjustedProfitCents)}</span></div>

${c.overrunCents ? `
  <div class="coach ${c.adjustedMargin < floor ? 'bad' : 'warn'}" style="margin-top:12px">
    <strong>${formatMoney(c.overrunCents)} of margin has faded.</strong>
    Overruns come straight out of profit — there is no one left to bill for them.
    ${c.adjustedMargin < floor
      ? `This job is now under your ${formatPercent(floor)} floor. If there is uncontracted extra
         work behind these numbers, it belongs on a change order while the client still needs you.`
      : 'If any of this spend was caused by a client request, it belongs on a change order, not in your costs.'}
  </div>`
  : c.spentCents ? `
  <div class="coach good" style="margin-top:12px">
    <strong>On budget so far.</strong>
    ${formatPercent(c.spendRatio, 0)} of the direct budget is spent and no category is over.
  </div>` : `
  <div class="coach" style="margin-top:12px">
    <strong>Nothing spent yet.</strong>
    Log costs as they land and this panel will show the real margin, not the hoped-for one.
  </div>`}`;
}

function wireCosts() {
  $('#btnAddActual').onclick = addActualRow;
}
