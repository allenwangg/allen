/**
 * documents.test.js — what the CLIENT sees, asserted on rendered HTML.
 *
 * These pin defects that are invisible in the pricing engine and only appear
 * once a document is laid out: an itemization that does not add up to the
 * total being signed, a staffing category leaking as a trade heading, a draft
 * the client was never sent, and an unsigned contract presented as authorized.
 */
import { renderProposal, renderContractStatement, renderChangeOrder } from './proposal.js';
import { priceEstimate, summarizeContract, priceChangeOrder, defaultSettings, formatMoney } from './pricing.js';
const S = defaultSettings();
let pass=0, fail=0;
const check=(n,c,x='')=>{c?(pass++,console.log('  ok    '+n)):(fail++,console.log('  FAIL  '+n+' '+x));};
const money = (s) => [...s.matchAll(/\$([\d,]+\.\d\d)/g)].map(m=>Math.round(parseFloat(m[1].replace(/,/g,''))*100));

const est = {
  number:'Q-1', createdAt:'2026-01-01', title:'Job', jobAddress:'X',
  client:{name:'C'}, milestones:[{label:'Deposit',percent:1}], terms:['T'],
  items:[
    {id:'1',qty:10,unitCost:100,category:'labor',markup:null,trade:'Framing'},
    {id:'2',qty:1,unitCost:2000,category:'material',markup:null},  // NO trade
  ],
  changeOrders:[
    {id:'d',number:'CO-01',status:'draft',title:'Draft only',items:[{id:'a',qty:1,unitCost:500,category:'labor',markup:null}]},
    {id:'s',number:'CO-02',status:'sent',title:'Sent to client',items:[{id:'b',qty:1,unitCost:400,category:'labor',markup:null}]},
  ],
};
const priced = priceEstimate(est,S);
const html = renderProposal({estimate:est,priced,company:{name:'Co'},groupByTrade:true,showLinePrices:true});

// A: Price column reconciles to Scope price
const scope = priced.subtotalCents + priced.contingencyCents;
const cells = money(html.slice(html.indexOf('Included work'), html.indexOf('pr-totals')));
const colSum = cells.reduce((a,b)=>a+b,0);
check('proposal Price column sums to Scope price', colSum===scope,
      `(column ${formatMoney(colSum)} vs scope ${formatMoney(scope)})`);

// B: no staffing category as a client heading
const heads=[...html.matchAll(/class="group-head"><td colspan="\d">([^<]+)</g)].map(m=>m[1]);
check('no staffing category printed as a trade heading',
  !heads.some(h=>/subcontractor|material|labor|equipment/i.test(h)), `(headings: ${heads.join(', ')})`);
check('untraded lines group under General', heads.includes('General'), `(${heads.join(', ')})`);

// C: change order doc reconciles
const co = est.changeOrders[1];
const cp = priceChangeOrder(co,S,{});
const contract = summarizeContract(est,S);
const coHtml = renderChangeOrder({estimate:est,order:co,priced:cp,contract,company:{name:'Co'}});
const coCells = money(coHtml.slice(coHtml.indexOf('Work added'), coHtml.indexOf('pr-totals')));
check('change order Amount column sums to its total',
  coCells.reduce((a,b)=>a+b,0)===cp.totalCents,
  `(column ${formatMoney(coCells.reduce((a,b)=>a+b,0))} vs total ${formatMoney(cp.totalCents)})`);

// D + E: statement hides drafts, does not fake authorization
const stmt = renderContractStatement({estimate:est,contract,company:{name:'Co'}});
check('statement hides DRAFT change orders from the client', !stmt.includes('Draft only'));
check('statement does show SENT change orders', stmt.includes('Sent to client'));
check('unsigned contract is not presented as authorized',
  stmt.includes('not signed') && !stmt.includes('January 1, 2026'));

console.log(`\n  documents: ${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
