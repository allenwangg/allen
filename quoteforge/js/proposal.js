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

  const rows = (order.items || []).length
    ? priced.lines.map((l) => `
        <tr>
          <td>${esc(l.description || '—')}</td>
          <td class="r">${fmtQty(l.qty)} ${esc(l.unit || '')}</td>
          <td class="r">${formatMoney(l.priceCents)}</td>
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

  const pending = contract.unapproved;

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
          <td class="r">${estimate.signature?.signedAt ? fmtDate(estimate.signature.signedAt) : fmtDate(estimate.createdAt)}</td>
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

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
