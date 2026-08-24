/**
 * proposal.js — the client-facing document.
 *
 * This is the only screen the homeowner ever sees, so it deliberately hides
 * every internal number: cost, markup, margin, and contingency never appear.
 * Showing a client that a $400 fixture cost you $180 is how a signed job turns
 * into a line-by-line negotiation.
 *
 * Output is plain HTML tuned for the browser's own print-to-PDF, which every
 * platform already has. No PDF library, no server round-trip, no watermark.
 */

import { CATEGORY_LABELS, formatMoney, buildSchedule } from './pricing.js';

/** Escape untrusted text for HTML interpolation. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Render text that may contain newlines as paragraphs. */
function paras(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return esc(iso);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Build the full proposal document.
 *
 * @param {object} ctx
 * @param {object} ctx.estimate
 * @param {object} ctx.priced     output of priceEstimate
 * @param {object} ctx.company
 * @param {boolean} ctx.groupByTrade
 * @param {boolean} ctx.showLinePrices  itemized pricing vs. a single scope price
 */
export function renderProposal({ estimate, priced, company, groupByTrade = true, showLinePrices = false }) {
  const accent = company.accent || '#c2410c';
  const schedule = buildSchedule(priced.totalCents, estimate.milestones || []);

  return `
<div style="--pr-accent:${esc(accent)}">
  ${header(estimate, company)}
  ${parties(estimate, company)}
  ${scope(estimate)}
  ${scopeTable(priced, { groupByTrade, showLinePrices })}
  ${totals(priced, estimate)}
  ${optionalSection(priced)}
  ${exclusions(estimate)}
  ${scheduleSection(schedule)}
  ${terms(estimate)}
  ${signatures(estimate, company)}
</div>`;
}

/* --------------------------------------------------------------- pieces -- */

function header(est, co) {
  const logo = co.logoDataUrl
    ? `<img class="logo" src="${esc(co.logoDataUrl)}" alt="${esc(co.name)}">`
    : `<div class="co-name">${esc(co.name || 'Your Company')}</div>`;

  const meta = [co.tagline, co.address, [co.phone, co.email].filter(Boolean).join(' · '),
    co.website, co.license && `License ${co.license}`]
    .filter(Boolean).map((l) => esc(l)).join('<br>');

  return `
<div class="pr-head">
  <div>
    ${logo}
    ${co.logoDataUrl && co.name ? `<div class="co-name" style="font-size:15px;margin-top:6px">${esc(co.name)}</div>` : ''}
    <div class="co-meta">${meta}</div>
  </div>
  <div class="pr-doc">
    <div class="doc-kind">Proposal</div>
    <div class="doc-no">${esc(est.number || '')}</div>
    <div class="co-meta" style="margin-top:6px">
      Issued ${fmtDate(est.createdAt)}<br>
      ${est.validUntil ? `Valid through ${fmtDate(est.validUntil)}` : ''}
    </div>
  </div>
</div>`;
}

function parties(est, co) {
  const c = est.client || {};
  const clientLines = [c.name, c.address, c.phone, c.email]
    .filter(Boolean).map((l) => esc(l)).join('<br>');

  return `
<div class="pr-parties">
  <div>
    <h3>Prepared for</h3>
    <div>${clientLines || '<span style="color:#a8a29e">—</span>'}</div>
  </div>
  <div>
    <h3>Job site</h3>
    <div>${esc(est.jobAddress || c.address || '—')}</div>
    ${est.title ? `<div style="margin-top:8px"><h3>Project</h3>${esc(est.title)}</div>` : ''}
  </div>
</div>`;
}

function scope(est) {
  if (!est.scopeSummary) return '';
  return `<div class="pr-section"><h3>Scope of work</h3>${paras(est.scopeSummary)}</div>`;
}

/**
 * The line item table. When line prices are hidden the client sees the scope
 * as a described deliverable with a single price — which is how most trades
 * prefer to sell, since it keeps the conversation on value rather than on
 * whether $9/sf for tile is fair.
 */
function scopeTable(priced, { groupByTrade, showLinePrices }) {
  const lines = priced.lines.filter((l) => !l.optional);
  if (!lines.length) {
    return '<div class="pr-section"><h3>Included work</h3><p style="color:#a8a29e">No line items yet.</p></div>';
  }

  const rows = [];
  const pushRow = (l) => {
    rows.push(`
<tr>
  <td>${esc(l.description || '—')}${l.note ? `<div style="font-size:10px;color:#78716c">${esc(l.note)}</div>` : ''}</td>
  <td class="r">${fmtQty(l.qty)} ${esc(l.unit || '')}</td>
  ${showLinePrices ? `<td class="r">${formatMoney(l.priceCents)}</td>` : ''}
</tr>`);
  };

  if (groupByTrade) {
    // Grouped by TRADE, deliberately not by category. A client-facing heading
    // reading "Subcontractor" advertises which work you are farming out and
    // invites the question of why your markup applies to someone else's labor.
    // Trade headings ("Tile", "Electrical") describe the work instead.
    const groups = new Map();
    for (const l of lines) {
      const key = l.trade || CATEGORY_LABELS[l.category] || 'Other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(l);
    }
    for (const [name, rowsIn] of groups) {
      const span = showLinePrices ? 3 : 2;
      rows.push(`<tr class="group-head"><td colspan="${span}">${esc(name)}</td></tr>`);
      rowsIn.forEach(pushRow);
    }
  } else {
    lines.forEach(pushRow);
  }

  return `
<div class="pr-section">
  <h3>Included work</h3>
  <table class="pr-table">
    <thead>
      <tr>
        <th>Description</th>
        <th class="r">Quantity</th>
        ${showLinePrices ? '<th class="r">Price</th>' : ''}
      </tr>
    </thead>
    <tbody>${rows.join('')}</tbody>
  </table>
</div>`;
}

function fmtQty(q) {
  const n = Number(q) || 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * Client-facing totals. Contingency is folded silently into the scope price
 * rather than itemized: a line reading "Contingency $2,400" invites the client
 * to ask for it back, and it is not a discount — it is the price of certainty.
 */
function totals(priced, est) {
  const rows = [];
  const scopePrice = priced.subtotalCents + priced.contingencyCents;

  rows.push(`<div class="row"><span>Scope price</span><span class="v">${formatMoney(scopePrice)}</span></div>`);

  if (priced.discountCents > 0) {
    const label = est.discount?.type === 'percent'
      ? `Discount (${(Number(est.discount.value) * 100).toFixed(0)}%)`
      : 'Discount';
    rows.push(`<div class="row"><span>${esc(label)}</span><span class="v">−${formatMoney(priced.discountCents)}</span></div>`);
  }
  if (priced.taxCents > 0) {
    rows.push(`<div class="row"><span>Sales tax (${(priced.taxRate * 100).toFixed(2).replace(/\.?0+$/, '')}%)</span><span class="v">${formatMoney(priced.taxCents)}</span></div>`);
  }
  rows.push(`<div class="row grand"><span>Total</span><span class="v">${formatMoney(priced.totalCents)}</span></div>`);

  return `<div class="pr-totals">${rows.join('')}</div>`;
}

function optionalSection(priced) {
  const opts = priced.optionalLines;
  if (!opts.length) return '';
  const rows = opts.map((l) => `
<tr>
  <td>${esc(l.description)}</td>
  <td class="r">${fmtQty(l.qty)} ${esc(l.unit || '')}</td>
  <td class="r">${formatMoney(l.priceCents)}</td>
</tr>`).join('');

  return `
<div class="pr-section">
  <h3>Optional upgrades</h3>
  <div class="pr-optional">
    <p style="margin-top:0;font-size:11px;color:#57534e">
      Not included in the total above. Any of these can be added before work begins at the price shown.
    </p>
    <table class="pr-table">
      <thead><tr><th>Description</th><th class="r">Quantity</th><th class="r">Add</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>`;
}

function exclusions(est) {
  if (!est.exclusions) return '';
  return `<div class="pr-section"><h3>Not included</h3>${paras(est.exclusions)}</div>`;
}

function scheduleSection(schedule) {
  if (!schedule.length) return '';
  const rows = schedule.map((m) => `
<tr>
  <td>${esc(m.label)}</td>
  <td class="r">${(m.percent * 100).toFixed(0)}%</td>
  <td class="r">${formatMoney(m.amountCents)}</td>
</tr>`).join('');

  return `
<div class="pr-section">
  <h3>Payment schedule</h3>
  <table class="pr-table">
    <thead><tr><th>Milestone</th><th class="r">Share</th><th class="r">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
}

function terms(est) {
  const list = (est.terms || []).filter(Boolean);
  if (!list.length) return '';
  return `
<div class="pr-section pr-terms">
  <h3>Terms &amp; conditions</h3>
  <ol style="margin:0;padding-left:18px">
    ${list.map((t) => `<li>${esc(t)}</li>`).join('')}
  </ol>
</div>`;
}

function signatures(est, co) {
  const sig = est.signature;
  const clientMark = sig?.dataUrl
    ? `<img src="${esc(sig.dataUrl)}" alt="Client signature">`
    : '';
  const signedLine = sig?.signedAt
    ? `<div style="font-size:10px;color:#78716c;margin-top:2px">Accepted ${fmtDate(sig.signedAt)}${sig.name ? ` by ${esc(sig.name)}` : ''}</div>`
    : '';

  return `
<div class="pr-section">
  <h3>Acceptance</h3>
  <p style="font-size:11px">
    Signing below authorizes ${esc(co.name || 'the contractor')} to perform the work described in this
    proposal at the total price shown, subject to the terms above.
  </p>
  <div class="sign-grid">
    <div class="sign-slot">
      <div class="sign-line">${clientMark}</div>
      <div class="sign-cap">Client signature</div>
      ${signedLine}
    </div>
    <div class="sign-slot">
      <div class="sign-line"></div>
      <div class="sign-cap">Date</div>
    </div>
  </div>
</div>`;
}

/* ------------------------------------------------------------ plain text -- */

/**
 * A text rendering for pasting into email or a text message — the way most
 * small jobs actually get sent.
 */
export function proposalAsText({ estimate, priced, company }) {
  const L = [];
  const rule = '─'.repeat(52);
  L.push(company.name || 'Proposal', rule);
  if (estimate.number) L.push(`Proposal ${estimate.number}`);
  if (estimate.title) L.push(`Project:  ${estimate.title}`);
  if (estimate.client?.name) L.push(`Client:   ${estimate.client.name}`);
  if (estimate.jobAddress) L.push(`Site:     ${estimate.jobAddress}`);
  L.push('');

  if (estimate.scopeSummary) {
    L.push('SCOPE OF WORK', estimate.scopeSummary, '');
  }

  L.push('INCLUDED WORK');
  for (const l of priced.lines.filter((x) => !x.optional)) {
    L.push(`  • ${l.description || '—'} — ${fmtQty(l.qty)} ${l.unit || ''}`.trimEnd());
  }
  L.push('');

  L.push(`TOTAL: ${formatMoney(priced.totalCents)}`);
  if (priced.taxCents > 0) L.push(`  (includes ${formatMoney(priced.taxCents)} sales tax)`);
  L.push('');

  const opts = priced.optionalLines;
  if (opts.length) {
    L.push('OPTIONAL UPGRADES (not included above)');
    for (const l of opts) L.push(`  • ${l.description} — add ${formatMoney(l.priceCents)}`);
    L.push('');
  }

  const schedule = buildSchedule(priced.totalCents, estimate.milestones || []);
  if (schedule.length) {
    L.push('PAYMENT SCHEDULE');
    for (const m of schedule) {
      L.push(`  ${m.label} — ${formatMoney(m.amountCents)}`);
    }
    L.push('');
  }

  if (estimate.validUntil) L.push(`This proposal is valid through ${fmtDate(estimate.validUntil)}.`);
  const contact = [company.phone, company.email].filter(Boolean).join(' · ');
  if (contact) L.push(contact);

  return L.join('\n');
}
