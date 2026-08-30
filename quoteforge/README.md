# QuoteForge

Estimating and proposal software for remodelers, general contractors, and trades.

A contractor's most expensive habit is confusing **markup** with **margin**. Adding
20% to cost does not keep 20% of the sale — it keeps 16.7%. The gap is small enough
to ignore on one job and large enough to end a business over a few hundred of them.
Every number this app produces is derived from explicit cost so the two figures can
never quietly drift apart.

Open `index.html` in a browser. There is no build step, no dependencies, and no server.
To publish it, see [DEPLOY.md](../DEPLOY.md) — GitHub Pages takes about two minutes.

---

## What it does

- **Assemblies.** One driving quantity — "45 square feet of bathroom" — expands into a
  full coordinated scope with waste factors applied. 16 lines instead of a blank page.
- **A 60-item price book** across 21 trades, holding *your cost*, never a sell price —
  and fully editable. Set your own numbers, hide what you don't sell, add your own items.
  Overrides layer over the shipped catalog rather than replacing it, so a future update
  to the defaults never silently overwrites a cost someone deliberately set.
- **A live profit panel** showing real profit, margin against target, break-even, and
  the exact dollar amount you can discount before the job stops clearing your floor.
- **A margin coach** that says in plain language what is wrong with the number and
  offers a one-click fix.
- **Client proposals** grouped by trade, with optional upgrades priced separately, a
  payment schedule that reconciles to the penny, your terms, and signature capture.
- **A contract statement** — the one-page document that settles the last argument on a
  job. The client remembers a number from months ago and the final bill is larger; this
  lays the original contract beside every approved change, each with the date they
  authorized it. It is explicitly not an invoice, and unsigned changes are quarantined
  in their own section so it can never bill for unauthorized work.
- **Change orders**, because the second-biggest profit leak after mispricing is work
  performed and never billed. Each one carries its own scope, price, reason, and
  approval state, and prints as a one-page authorization. Unapproved work is reported
  as *money at risk* — including your own cost already sunk into it — so the exposure
  is visible from any tab rather than surfacing when the final invoice is disputed.
- **Print to PDF** through the browser's own print dialog. No PDF library, no server.

- **Job costing**, because the third leak is margin fade: the job was priced at 25%,
  finished at 14%, and nobody can say which trade ate the difference. Every receipt,
  sub invoice, and week of payroll is logged against the category it was estimated
  under; overruns erode the profit figure dollar for dollar, on screen, while the job
  is still running. Erosion is the sum of per-category overruns — deliberately not
  netted against underspent categories, because unbought tile is not savings.

## What it deliberately does not do

Invoicing, payroll, payment tracking, scheduling, accounting integration, or
multi-device sync. It prices work, produces the documents, and shows where the money
went. Export CSV and hand the rest to whatever you already use.

---

## Architecture

Four modules, no framework, no build:

| File | Responsibility |
|---|---|
| `js/pricing.js` | All money math. Pure functions, no DOM, no state. |
| `js/pricebook.js` | The starter catalog, the user-override layer, and assembly expansion. |
| `js/store.js` | State, persistence, undo/redo, import/export, migration. |
| `js/app.js` | UI wiring. Renders from state; owns no truth of its own. |
| `js/proposal.js` | The client-facing document, as a pure function of state. |

Three decisions worth knowing about:

**Money is integer cents everywhere.** Floats drift, and drift in a contract is a
support call. Dollars exist only at the input and output boundary.

**Order of operations in `priceEstimate` is deliberate.** Cost → overhead → markup →
contingency → discount → tax. Overhead is marked up rather than absorbed, because
absorbing it means working for free on the portion of the job that keeps the lights on.
Contingency is priced into the job but never reported as earned margin, because money
reserved for surprises is not profit until the surprises don't happen.

**`solveUniformMarkup` bisects instead of using a closed form.** `marginToMarkup(target)`
is correct only when there is no contingency and no pass-through line. With either
present it undershoots. Rather than maintain fragile algebra that would silently go
wrong the next time the pipeline changes, the solver searches against the real
`priceEstimate`. Margin is monotonic in markup and the search space is tiny.

**No server, on purpose.** Zero hosting cost, no signup friction, works with no signal
on a job site, and no custody of anyone's client list. The honest cost is that data is
bound to one browser — so JSON export/import is a first-class feature, not an
afterthought, and the UI says so.

---

## Tests

```sh
./run-tests.sh           # unit suites — no dependencies, always runnable
./run-tests.sh --all     # adds the browser suites (needs playwright + chromium)
node js/pricing.test.js  # just the money math
```

121 unit assertions with no test framework and no install step, plus 140 browser
assertions across `test/browser.mjs`, `test/change-orders.mjs`, `test/job-costs.mjs`,
and `test/security.mjs`. The pricing suite includes a
500-case property check that totals always reconcile, margins stay finite, and no total
ever lands on a fractional cent.

The browser suite drives the real app in Chromium and covers: the item grid keeping
focus across re-renders, reprice-to-target landing on the target, undo across an
assembly insert, persistence across reload, signature capture producing real pixels,
print producing a clean multi-page PDF, and — importantly — the proposal never leaking
cost, markup, margin, or a "Subcontractor" heading to the client. It also checks that
neither page scrolls sideways on a 390px phone, that an edited price book cost
flows into assemblies and survives a reload, and that a backup exported from one
profile imports cleanly into another without duplicating on a second import.

`test/security.mjs` is adversarial: it injects text-context, attribute-breakout, and
event-handler payloads into every editable field — and into an imported estimate file,
which is the path the contractor did not type themselves — then asserts nothing
executes. It also asserts the inverse, that markup in a client name still renders as
literal text, because escaping that eats the user's data is its own bug.

### Three bugs the tests caught

Worth recording, because both were invisible by inspection:

1. **`Number(null) === 0`.** `markup: null` means "use my category default", but the
   naive pass-through check read every such line as pinned to zero profit. The reprice
   button silently under-priced whole jobs. Two of the tests contained the same bug,
   and one of them was therefore vacuous — it skipped every iteration while reporting
   a pass. The property check now asserts it actually ran.

2. **Internal notes on a client document.** The price book's note on the permit line
   reads "Pass through at 0% markup". It was being copied onto the line item and
   rendered on the homeowner's proposal.

3. **A signature surviving a duplicate.** Duplicating a job cleared the estimate's
   signature but not the signatures on its change orders, so a new job could ship
   carrying a client's mark authorizing work they had never seen. The test that was
   supposed to cover this was named "drops signatures" and never asserted it.
