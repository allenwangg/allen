# QuoteForge

Estimating and proposal software for remodelers, general contractors, and trades.

A contractor's most expensive habit is confusing **markup** with **margin**. Adding
20% to cost does not keep 20% of the sale — it keeps 16.7%. The gap is small enough
to ignore on one job and large enough to end a business over a few hundred of them.
Every number this app produces is derived from explicit cost so the two figures can
never quietly drift apart.

Open `index.html` in a browser. There is no build step, no dependencies, and no server.

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
- **Print to PDF** through the browser's own print dialog. No PDF library, no server.

## What it deliberately does not do

Job costing against actuals, invoicing, payroll, scheduling, accounting integration,
or multi-device sync. It prices work and produces proposals. Export CSV and hand it to
whatever you already use.

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
./run-tests.sh --all     # adds the browser suite (needs playwright + chromium)
node js/pricing.test.js  # just the money math
```

86 unit assertions with no test framework and no install step, plus 61 browser
assertions in `test/browser.mjs`. The pricing suite includes a
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

### Two bugs the tests caught

Worth recording, because both were invisible by inspection:

1. **`Number(null) === 0`.** `markup: null` means "use my category default", but the
   naive pass-through check read every such line as pinned to zero profit. The reprice
   button silently under-priced whole jobs. Two of the tests contained the same bug,
   and one of them was therefore vacuous — it skipped every iteration while reporting
   a pass. The property check now asserts it actually ran.

2. **Internal notes on a client document.** The price book's note on the permit line
   reads "Pass through at 0% markup". It was being copied onto the line item and
   rendered on the homeowner's proposal.
