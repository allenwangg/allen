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

import {
  CATEGORY_LABELS, formatMoney, formatPercent, buildSchedule, allocateLinePrices,
  marginToMarkup,
} from './pricing.js';

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

  // Printed line prices must sum to the printed Scope price. The raw line
  // prices do not — they exclude overhead, overhead's markup, and contingency
  // — so a client adding up the column lands short and can back out the
  // contractor's loading by subtraction. Allocate it across the lines instead.
  const scopePriceCents = priced.subtotalCents + priced.contingencyCents;
  const shown = allocateLinePrices(lines.map((l) => l.priceCents), scopePriceCents);
  const priceOf = new Map(lines.map((l, i) => [l.id, shown[i]]));

  const rows = [];
  const pushRow = (l) => {
    rows.push(`
<tr>
  <td>${esc(l.description || '—')}${l.note ? `<div style="font-size:10px;color:#78716c">${esc(l.note)}</div>` : ''}</td>
  <td class="r">${fmtQty(l.qty)} ${esc(l.unit || '')}</td>
  ${showLinePrices ? `<td class="r">${formatMoney(priceOf.get(l.id))}</td>` : ''}
</tr>`);
  };

  if (groupByTrade) {
    // Grouped by TRADE, deliberately not by category. A client-facing heading
    // reading "Subcontractor" advertises which work you are farming out and
    // invites the question of why your markup applies to someone else's labor.
    // Trade headings ("Tile", "Electrical") describe the work instead.
    const groups = new Map();
    for (const l of lines) {
      // Never fall back to a staffing CATEGORY here: a heading reading
      // "Subcontractor" or "Material" tells the client how the job is staffed
      // and invites an argument about markup on other people's labor. A line
      // with no trade of its own is simply "General".
      const key = l.trade || 'General';
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

/** A number with at most two decimals and no trailing zeros. */
function trimNum(n) {
  return String(Math.round(n * 100) / 100);
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
    // Print the rate that was actually applied. Rounding 12.5% to "13%" beside
    // an amount computed at 12.5% invites the client to recompute and find a
    // discrepancy on a document they are about to sign.
    const label = est.discount?.type === 'percent'
      ? `Discount (${trimNum(Number(est.discount.value) * 100)}%)`
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

/* ======================================================= change orders ==== */

/**
 * A change order authorization.
 *
 * This document exists to answer one question months later, in front of a
 * client who does not remember agreeing to anything: what changed, why, what
 * it cost, and when they said yes. So it leads with the reason, states the
 * revised contract total rather than only the delta, and puts the signature
 * block on the same page as the price.
 */
export function renderChangeOrder({ estimate, order, priced, contract, company }) {
  const accent = company.accent || '#c2410c';
  const isCredit = priced.totalCents < 0;

  // Same reconciliation rule as the proposal, and it matters more here: this
  // is the document the client physically signs. An itemization that lands
  // ~15% under the amount being authorized reads as either an error or a
  // hidden fee, and neither survives the conversation that follows.
  const coShown = allocateLinePrices(priced.lines.map((l) => l.priceCents), priced.totalCents);
  const rows = (order.items || []).length
    ? priced.lines.map((l, i) => `
        <tr>
          <td>${esc(l.description || '—')}</td>
          <td class="r">${fmtQty(l.qty)} ${esc(l.unit || '')}</td>
          <td class="r">${formatMoney(coShown[i])}</td>
        </tr>`).join('')
    : '<tr><td colspan="3" style="color:#a8a29e">No items yet.</td></tr>';

  return `
<div style="--pr-accent:${esc(accent)}">
  <div class="pr-head">
    <div>
      ${company.logoDataUrl
        ? `<img class="logo" src="${esc(company.logoDataUrl)}" alt="${esc(company.name)}">`
        : `<div class="co-name">${esc(company.name || 'Your Company')}</div>`}
      <div class="co-meta">
        ${[company.phone, company.email].filter(Boolean).map(esc).join(' · ')}
        ${company.license ? `<br>License ${esc(company.license)}` : ''}
      </div>
    </div>
    <div class="pr-doc">
      <div class="doc-kind">Change order</div>
      <div class="doc-no">${esc(order.number || '')}</div>
      <div class="co-meta" style="margin-top:6px">
        Issued ${fmtDate(order.createdAt)}<br>
        To contract ${esc(estimate.number || '')}
      </div>
    </div>
  </div>

  <div class="pr-parties">
    <div>
      <h3>Client</h3>
      <div>${esc(estimate.client?.name || '—')}</div>
    </div>
    <div>
      <h3>Job site</h3>
      <div>${esc(estimate.jobAddress || '—')}</div>
    </div>
  </div>

  <div class="pr-section">
    <h3>Change requested</h3>
    <p style="font-size:13px;font-weight:600;margin-bottom:4px">${esc(order.title || 'Untitled change')}</p>
    ${order.reason
      ? paras(order.reason)
      : '<p style="color:#a8a29e">No reason recorded — describe what prompted this change.</p>'}
  </div>

  <div class="pr-section">
    <h3>Work ${isCredit ? 'removed' : 'added'}</h3>
    <table class="pr-table">
      <thead><tr><th>Description</th><th class="r">Quantity</th><th class="r">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>

  <div class="pr-totals">
    <div class="row"><span>Original contract</span><span class="v">${formatMoney(contract.originalTotalCents)}</span></div>
    ${contract.approvedCount
      ? `<div class="row"><span>Previously approved changes</span><span class="v">${formatMoney(approvedExcluding(contract, order.id))}</span></div>`
      : ''}
    <div class="row"><span>This change order</span><span class="v">${isCredit ? '−' : '+'}${formatMoney(Math.abs(priced.totalCents))}</span></div>
    <div class="row grand"><span>Revised contract total</span><span class="v">${formatMoney(revisedTotal(contract, order, priced))}</span></div>
  </div>

  ${Number(order.daysAdded)
    ? `<div class="pr-section"><h3>Schedule</h3>
        <p>This change ${Number(order.daysAdded) > 0 ? 'adds' : 'removes'}
           <strong>${Math.abs(Number(order.daysAdded))} working day${Math.abs(Number(order.daysAdded)) === 1 ? '' : 's'}</strong>
           ${Number(order.daysAdded) > 0 ? 'to' : 'from'} the completion date.</p></div>`
    : ''}

  <div class="pr-section">
    <h3>Authorization</h3>
    <p style="font-size:11px">
      Signing below authorizes the work described above and amends the contract total to
      <strong>${formatMoney(revisedTotal(contract, order, priced))}</strong>. All other terms of the
      original proposal remain in effect. Work on this change will not begin until this
      authorization is signed.
    </p>
    <div class="sign-grid">
      <div class="sign-slot">
        <div class="sign-line">${order.signature?.dataUrl
          ? `<img src="${esc(order.signature.dataUrl)}" alt="Client signature">` : ''}</div>
        <div class="sign-cap">Client signature</div>
        ${order.decidedAt && order.status === 'approved'
          ? `<div style="font-size:10px;color:#78716c;margin-top:2px">Approved ${fmtDate(order.decidedAt)}</div>` : ''}
      </div>
      <div class="sign-slot">
        <div class="sign-line"></div>
        <div class="sign-cap">Date</div>
      </div>
    </div>
  </div>
</div>`;
}

/** Approved change-order value, excluding the one being displayed. */
function approvedExcluding(contract, orderId) {
  return contract.approved
    .filter((o) => o.order.id !== orderId)
    .reduce((a, o) => a + o.priced.totalCents, 0);
}

/**
 * What the contract becomes if this order is signed. An already-approved order
 * is part of the contract total, so it must not be counted twice.
 */
function revisedTotal(contract, order, priced) {
  const alreadyIn = order.status === 'approved';
  return contract.contractTotalCents + (alreadyIn ? 0 : priced.totalCents);
}

/* =================================================== contract statement === */

/**
 * A contract statement.
 *
 * This is the document that settles the last argument on a job: the client
 * remembers a number from months ago and the final bill is larger. It lays the
 * original contract next to every approved change, each with the date the
 * client authorized it, and arrives at the current total by addition the client
 * can follow.
 *
 * It is deliberately NOT an invoice. It records nothing about what has been
 * paid, because this tool does not track payments and a document that implies
 * a balance it cannot actually compute would be worse than no document.
 * Change orders still awaiting a signature are listed separately and excluded
 * from the total, so the statement never quietly bills for unauthorized work.
 */
export function renderContractStatement({ estimate, contract, company }) {
  const accent = company.accent || '#c2410c';
  const schedule = buildSchedule(contract.contractTotalCents, estimate.milestones || []);

  const changeRows = contract.approved.length
    ? contract.approved.map(({ order, priced }) => `
        <tr>
          <td>
            ${esc(order.number)} — ${esc(order.title || 'Change')}
            ${order.reason ? `<div style="font-size:10px;color:#78716c">${esc(firstLine(order.reason))}</div>` : ''}
          </td>
          <td class="r">${order.decidedAt ? fmtDate(order.decidedAt) : '—'}</td>
          <td class="r">${priced.totalCents < 0 ? '−' : '+'}${formatMoney(Math.abs(priced.totalCents))}</td>
        </tr>`).join('')
    : '<tr><td colspan="3" style="color:#a8a29e">No changes were made to this contract.</td></tr>';

  // Only changes actually SENT to the client belong on their statement. A
  // draft is the contractor's own working note; printing it under "awaiting
  // your approval" asks the client to react to a price nobody has quoted them.
  const pending = contract.unapproved.filter((o) => o.order.status === 'sent');

  return `
<div style="--pr-accent:${esc(accent)}">
  <div class="pr-head">
    <div>
      ${company.logoDataUrl
        ? `<img class="logo" src="${esc(company.logoDataUrl)}" alt="${esc(company.name)}">`
        : `<div class="co-name">${esc(company.name || 'Your Company')}</div>`}
      <div class="co-meta">
        ${[company.phone, company.email].filter(Boolean).map(esc).join(' · ')}
        ${company.license ? `<br>License ${esc(company.license)}` : ''}
      </div>
    </div>
    <div class="pr-doc">
      <div class="doc-kind">Contract statement</div>
      <div class="doc-no">${esc(estimate.number || '')}</div>
      <div class="co-meta" style="margin-top:6px">${fmtDate(todayISO())}</div>
    </div>
  </div>

  <div class="pr-parties">
    <div><h3>Client</h3><div>${esc(estimate.client?.name || '—')}</div></div>
    <div>
      <h3>Job site</h3><div>${esc(estimate.jobAddress || '—')}</div>
      ${estimate.title ? `<div style="margin-top:8px"><h3>Project</h3>${esc(estimate.title)}</div>` : ''}
    </div>
  </div>

  <div class="pr-section">
    <h3>How the contract reached its current total</h3>
    <table class="pr-table">
      <thead><tr><th>Item</th><th class="r">Authorized</th><th class="r">Amount</th></tr></thead>
      <tbody>
        <tr>
          <td>Original contract — proposal ${esc(estimate.number || '')}</td>
          <td class="r">${estimate.signature?.signedAt
            ? fmtDate(estimate.signature.signedAt)
            : '<span style="color:#a8a29e">not signed</span>'}</td>
          <td class="r">${formatMoney(contract.originalTotalCents)}</td>
        </tr>
        ${changeRows}
      </tbody>
    </table>
    <div class="pr-totals">
      <div class="row grand"><span>Current contract total</span><span class="v">${formatMoney(contract.contractTotalCents)}</span></div>
    </div>
  </div>

  ${pending.length ? `
  <div class="pr-section">
    <h3>Awaiting your approval — not included above</h3>
    <div class="pr-optional">
      <p style="margin-top:0;font-size:11px;color:#57534e">
        These changes have been prepared but not yet authorized. They are not part of the total
        above and no work on them will be billed unless they are signed.
      </p>
      <table class="pr-table">
        <thead><tr><th>Description</th><th class="r">Amount</th></tr></thead>
        <tbody>
          ${pending.map(({ order, priced }) => `
            <tr>
              <td>${esc(order.number)} — ${esc(order.title || 'Change')}</td>
              <td class="r">${priced.totalCents < 0 ? '−' : '+'}${formatMoney(Math.abs(priced.totalCents))}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>` : ''}

  ${schedule.length ? `
  <div class="pr-section">
    <h3>Payment schedule at the current total</h3>
    <table class="pr-table">
      <thead><tr><th>Milestone</th><th class="r">Share</th><th class="r">Amount</th></tr></thead>
      <tbody>
        ${schedule.map((m) => `
          <tr><td>${esc(m.label)}</td><td class="r">${(m.percent * 100).toFixed(0)}%</td>
              <td class="r">${formatMoney(m.amountCents)}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>` : ''}

  <div class="pr-section pr-terms">
    <p style="margin:0">
      This statement summarizes the contract and every change authorized to date. It is a
      summary of the agreement, not an invoice, and does not reflect payments received.
    </p>
  </div>
</div>`;
}

/**
 * First line of a multi-line reason, for a one-line summary in a table.
 * Truncates on a word boundary — an ellipsis landing mid-word reads as a bug
 * on a document the client is scrutinizing.
 */
function firstLine(text, limit = 120) {
  const line = String(text || '').split('\n').find((l) => l.trim()) || '';
  if (line.length <= limit) return line;
  const cut = line.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\s]+$/, '')}…`;
}

/**
 * Today's date in the LOCAL timezone.
 *
 * toISOString() is UTC, so a contractor printing a statement at 6pm Pacific
 * got tomorrow's date on a document a client reads — and on an audit report
 * whose whole value is being trusted with dates.
 */
function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* ======================================================== audit report ==== */

/**
 * A margin audit report — the deliverable of the audit service, and the one
 * document in this app that is NOT for the homeowner. It is for the
 * contractor, so unlike the proposal it shows everything the proposal hides:
 * cost, markup, margin, and exactly where the money went.
 *
 * Structure follows the three leaks, in the order they bite:
 *   1. Pricing — what the job kept vs what the target said it should keep.
 *   2. Unbilled changes — work performed with nothing signed behind it.
 *   3. Margin fade — overruns by category against the budget.
 *
 * Every section ends in a dollar figure, because "you should price better" is
 * advice and "$4,120 on this one job" is a decision.
 */
export function renderAuditReport({ estimate, costed, company, targetMargin, floorMargin }) {
  const accent = company.accent || '#c2410c';
  const contract = costed.contract;

  // Pre-tax on BOTH halves, as the row label says. Sales tax on approved
  // change orders is money the contractor collects and remits, not revenue —
  // including it inflated profit kept and understated the pricing leak.
  const revenue = contract.base.afterDiscountCents + contract.approvedPreTaxCents;
  const target = Number(targetMargin) || 0;

  // What was actually kept, using real spend where it exists. Overhead is
  // applied at the configured rate against actual direct cost, and labeled as
  // an estimate — the audit must not claim precision it does not have.
  const overheadRate = Number(costed.contract.base.settings?.overhead) || 0;
  const spentDirect = costed.spentCents;
  const hasActuals = costed.entries.length > 0;
  const directCost = hasActuals ? spentDirect : costed.budgetCents;
  const overheadActual = Math.round(directCost * overheadRate);
  const trueCost = directCost + overheadActual;
  const actualProfit = revenue - trueCost;
  const actualMargin = revenue === 0 ? 0 : actualProfit / revenue;

  // The price this job needed to hit the target, at its REAL cost — the
  // headline "what happened" figure for the summary table.
  const neededPrice = target < 1 ? Math.round(trueCost / (1 - target)) : Infinity;

  // Leak 1 is measured against BUDGETED cost, not real cost. The pricing leak
  // is what was wrong with the quote before anything went wrong on site;
  // pricing it at real cost would fold the overruns (leak 3) into it and
  // double-count. Keeping the bases separate is what makes the three leak
  // figures additive.
  const budgetedTrueCost = Math.round(costed.budgetCents * (1 + overheadRate));
  const neededAtBudget = target < 1 ? Math.round(budgetedTrueCost / (1 - target)) : Infinity;
  const pricingGap = Math.max(0, neededAtBudget - revenue);

  const fadeRows = Object.entries(costed.byCategory)
    .filter(([, v]) => v.overrunCents > 0)
    .map(([cat, v]) => `
      <tr>
        <td>${CATEGORY_LABELS[cat]}</td>
        <td class="r">${formatMoney(v.budgetCents)}</td>
        <td class="r">${formatMoney(v.spentCents)}</td>
        <td class="r" style="color:#b91c1c;font-weight:600">${formatMoney(v.overrunCents)}</td>
      </tr>`).join('');

  const unsignedRows = contract.unapproved.map(({ order, priced }) => `
    <tr>
      <td>${esc(order.number)} — ${esc(order.title || 'Untitled change')}</td>
      <td class="r">${esc(order.status)}</td>
      <td class="r">${formatMoney(priced.totalCents)}</td>
    </tr>`).join('');

  const totalLeak = pricingGap + contract.atRiskCents + costed.overrunCents;

  return `
<div style="--pr-accent:${esc(accent)}">
  <div class="pr-head">
    <div>
      ${company.logoDataUrl
        ? `<img class="logo" src="${esc(company.logoDataUrl)}" alt="${esc(company.name)}">`
        : `<div class="co-name">${esc(company.name || 'Margin Audit')}</div>`}
      <div class="co-meta">${[company.phone, company.email].filter(Boolean).map(esc).join(' · ')}</div>
    </div>
    <div class="pr-doc">
      <div class="doc-kind">Margin audit</div>
      <div class="doc-no">${esc(estimate.number || '')}</div>
      <div class="co-meta" style="margin-top:6px">${fmtDate(todayISO())}</div>
    </div>
  </div>

  <div class="pr-parties">
    <div><h3>Job</h3><div>${esc(estimate.title || 'Untitled')}</div></div>
    <div><h3>Basis</h3><div>${hasActuals
      ? `${costed.entries.length} logged cost entr${costed.entries.length === 1 ? 'y' : 'ies'}`
      : 'Estimated costs — no actuals were provided'}</div></div>
  </div>

  <div class="pr-section">
    <h3>What this job actually kept</h3>
    <table class="pr-table">
      <tbody>
        <tr><td>Revenue (contract incl. approved changes, pre-tax)</td><td class="r">${formatMoney(revenue)}</td></tr>
        <tr><td>Direct costs ${hasActuals ? 'actually paid' : '(estimated)'}</td><td class="r">${formatMoney(directCost)}</td></tr>
        <tr><td>Overhead at your ${(overheadRate * 100).toFixed(0)}% rate (estimate)</td><td class="r">${formatMoney(overheadActual)}</td></tr>
        <tr>
          <td style="font-weight:700">Profit kept — ${formatPercent(actualMargin)} margin</td>
          <td class="r" style="font-weight:700">${formatMoney(actualProfit)}</td>
        </tr>
        <tr>
          <td>Your target is ${formatPercent(target, 0)}. At this job's real cost, that required a price of</td>
          <td class="r">${formatMoney(neededPrice)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="pr-section">
    <h3>Leak 1 — Pricing</h3>
    ${pricingGap > 0 ? `
      <p>Measured against its own budget, this job was sold ${formatMoney(pricingGap)} below the
         price needed to hit your ${formatPercent(target, 0)} target. That money was gone before the
         first day of work — it was promised away in the quote, independent of anything that
         happened on site afterward.</p>`
      : `<p>None found. The quote cleared your ${formatPercent(target, 0)} target against the job's
         own budget. Whatever went wrong on this job, it was not the quote.</p>`}
  </div>

  <div class="pr-section">
    <h3>Leak 2 — Work without a signature</h3>
    ${contract.unapproved.length ? `
      <table class="pr-table">
        <thead><tr><th>Change order</th><th class="r">Status</th><th class="r">Value</th></tr></thead>
        <tbody>${unsignedRows}</tbody>
      </table>
      <p style="margin-top:8px">${formatMoney(contract.atRiskCents)} of change-order work has nothing
         signed behind it. If any of this work was performed, it is currently a gift.</p>`
      : `<p>None found. Every change order on this job is signed or was declined before work began.
         This is rarer than you think.</p>`}
  </div>

  <div class="pr-section">
    <h3>Leak 3 — Margin fade</h3>
    ${fadeRows ? `
      <table class="pr-table">
        <thead><tr><th>Category</th><th class="r">Budget</th><th class="r">Spent</th><th class="r">Over</th></tr></thead>
        <tbody>${fadeRows}</tbody>
      </table>
      <p style="margin-top:8px">${formatMoney(costed.overrunCents)} was spent past budget with no one
         left to bill for it. Where an overrun traces to a client request, it belonged on a change
         order; where it traces to the estimate, the price book number that caused it needs fixing
         before the next bid repeats it.</p>
      ${contract.approvedCount ? `<p style="font-size:10.5px;color:#78716c;margin-top:6px">
         Budgets include work you were paid for through an approved change order, so a category
         can read higher here than you first estimated.</p>` : ''}`
      : hasActuals
        ? '<p>None found. No category ran past its budget.</p>'
        : '<p>Not assessable — no actual costs were provided for this job.</p>'}
  </div>

  <div class="pr-section pr-keep">
    <h3>The number</h3>
    <div class="pr-totals" style="width:100%;margin-left:0">
      <div class="row grand">
        <span>Found on this one job</span>
        <span class="v">${formatMoney(totalLeak)}</span>
      </div>
    </div>
    <p style="font-size:11px;color:#57534e;margin:8px 0 0">
      Pricing gap + unsigned change orders + budget overruns. The pricing gap is measured against
      budgeted cost so it does not double-count the overruns, which can overlap only where the
      unsigned work also ran past budget. This is the size of the problem, not an invoice, and
      overhead is applied at your stated rate rather than measured.
    </p>
  </div>
</div>`;
}

/* ======================================================= portfolio ======== */

/**
 * The multi-job margin audit — the actual thing the offer sells.
 *
 * Three single-job reports are three data points and an exercise for the
 * reader. This is the page a contractor keeps: what the jobs earned together,
 * which door the money leaves by, whether that is a habit or one bad week, and
 * the one thing to change as a result.
 *
 * The recommendation is derived, not templated. Which leak dominates decides
 * what the advice is, and whether it is systematic decides whether the advice
 * is "change how you price" or "this was one job, do not rewrite your model
 * over it".
 */
export function renderPortfolioReport({ portfolio: pf, company, settings }) {
  const accent = company.accent || '#c2410c';
  const target = pf.targetMargin;

  const jobRows = pf.jobs.map((j) => `
    <tr>
      <td>${esc(j.title)}${j.hasActuals ? '' : '<div style="font-size:9.5px;color:#a8a29e">no actual costs given</div>'}</td>
      <td class="r">${formatMoney(j.revenueCents)}</td>
      <td class="r" style="${j.margin < 0 ? 'color:#b91c1c;font-weight:600' : ''}">${formatPercent(j.margin)}</td>
      <td class="r" style="${j.foundCents > 0 ? 'color:#b91c1c;font-weight:600' : 'color:#a8a29e'}">${formatMoney(j.foundCents)}</td>
    </tr>`).join('');

  const maxLeak = Math.max(1, ...pf.leaks.map((l) => l.cents));
  const leakRows = pf.leaks.map((l) => `
    <tr>
      <td style="width:44%">${l.label}</td>
      <td style="width:34%">
        <div style="height:8px;background:#ededeb;border-radius:999px;overflow:hidden">
          <div style="height:100%;width:${Math.round((l.cents / maxLeak) * 100)}%;background:${l.cents === pf.dominant.cents ? '#b91c1c' : '#d6d3d1'}"></div>
        </div>
      </td>
      <td class="r">${formatMoney(l.cents)}</td>
      <td class="r">${pf.foundCents === 0 ? '—' : formatPercent(l.cents / pf.foundCents, 0)}</td>
    </tr>`).join('');

  return `
<div style="--pr-accent:${esc(accent)}">
  <div class="pr-head">
    <div>
      ${company.logoDataUrl
        ? `<img class="logo" src="${esc(company.logoDataUrl)}" alt="${esc(company.name)}">`
        : `<div class="co-name">${esc(company.name || 'Margin Audit')}</div>`}
      <div class="co-meta">${[company.phone, company.email].filter(Boolean).map(esc).join(' · ')}</div>
    </div>
    <div class="pr-doc">
      <div class="doc-kind">Margin audit</div>
      <div class="doc-no">${pf.count} job${pf.count === 1 ? '' : 's'}</div>
      <div class="co-meta" style="margin-top:6px">${fmtDate(todayISO())}</div>
    </div>
  </div>

  <div class="pr-section pr-keep">
    <h3>Across these jobs</h3>
    <table class="pr-table">
      <tbody>
        <tr><td>Billed to clients</td><td class="r">${formatMoney(pf.revenueCents)}</td></tr>
        <tr><td>Kept after every cost — ${formatPercent(pf.averageMargin)} average margin against your ${formatPercent(target, 0)} target</td>
            <td class="r">${formatMoney(pf.keptCents)}</td></tr>
        <tr>
          <td style="font-weight:700">Found — money that was earned and not kept</td>
          <td class="r" style="font-weight:700">${formatMoney(pf.foundCents)}</td>
        </tr>
        <tr><td>As a share of everything billed</td><td class="r">${formatPercent(pf.foundShare)}</td></tr>
      </tbody>
    </table>
  </div>

  <div class="pr-section">
    <h3>Job by job</h3>
    <table class="pr-table">
      <thead><tr><th>Job</th><th class="r">Billed</th><th class="r">Kept</th><th class="r">Found</th></tr></thead>
      <tbody>${jobRows}</tbody>
    </table>
  </div>

  <div class="pr-section">
    <h3>Where it goes</h3>
    <table class="pr-table">
      <thead><tr><th>Leak</th><th></th><th class="r">Amount</th><th class="r">Share</th></tr></thead>
      <tbody>${leakRows}</tbody>
    </table>
  </div>

  <div class="pr-section pr-keep">
    <h3>What to change</h3>
    ${diagnosis(pf, settings)}
  </div>

  <div class="pr-section pr-terms">
    <p style="margin:0">
      Built from figures you provided, not from your books. Overhead is applied at your stated
      rate rather than measured, and the three leaks are summed as the size of the problem
      rather than as an invoice.${pf.jobsMissingActuals
        ? ` ${pf.jobsMissingActuals} job${pf.jobsMissingActuals === 1 ? '' : 's'} had no actual
            costs supplied, so ${pf.jobsMissingActuals === 1 ? 'its' : 'their'} estimate was used
            in place of what was really paid — margin fade cannot be seen there.` : ''}
    </p>
  </div>
</div>`;
}

/**
 * The recommendation. Derived from which leak dominates and whether it recurs,
 * because those two facts imply completely different advice — and getting them
 * backwards is worse than saying nothing.
 */
function diagnosis(pf, settings) {
  if (pf.foundCents === 0) {
    return `<p><strong>Nothing found worth acting on.</strong> These jobs priced correctly, the
      changes were signed, and the work came in on budget. That is rare, and it means the next
      place to look is volume and overhead rather than pricing.</p>`;
  }

  const { dominant, systematic, jobsAffected, count } = pf;
  const share = pf.foundCents === 0 ? 0 : dominant.cents / pf.foundCents;

  const spread = systematic
    ? `<p><strong>This is a habit, not a bad week.</strong> ${jobsAffected} of ${count} jobs
        show it, and no single job carries the bulk — which means the next job will do the same
        thing unless something changes.</p>`
    : `<p><strong>One job carries most of this.</strong> ${jobsAffected} of ${count} jobs are
        affected and the worst accounts for ${formatPercent(pf.concentration, 0)} of it. Fix the
        specific cause; do not rewrite how you price everything over a single job.</p>`;

  const advice = {
    pricing: `<p>Most of the money — ${formatPercent(share, 0)} of it — was gone before work
      started: these jobs were sold below the price their own budgets required. To keep
      ${formatPercent(pf.targetMargin, 0)} you need to mark up
      <strong>${formatPercent(marginToMarkup(pf.targetMargin), 0)}</strong> on cost, not
      ${formatPercent(pf.targetMargin, 0)}. Those are different numbers and the difference is
      exactly what went missing.</p>`,
    unsigned: `<p>Most of the money — ${formatPercent(share, 0)} of it — is work done with
      nothing signed behind it. This one is not a pricing problem and no markup fixes it: the
      remedy is a signature before the crew starts, every time, even when it feels awkward with
      a client you like.</p>`,
    fade: `<p>Most of the money — ${formatPercent(share, 0)} of it — was spent past budget with
      no one left to bill. Two causes look identical on paper and need opposite fixes: where the
      overrun followed a client request it belonged on a change order, and where it followed
      your own estimate the number that produced it needs correcting before the next bid repeats
      it.</p>`,
  }[dominant.key];

  return `${advice}${spread}`;
}
