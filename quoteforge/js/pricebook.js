/**
 * pricebook.js — the starter catalog.
 *
 * Costs here are YOUR cost, never the sell price; markup is applied by the
 * pricing engine. Figures are representative US national-average ranges for
 * residential remodeling and are meant to be edited — every contractor's real
 * costs differ by market, and the app nags them to tune these.
 *
 * `waste` is a multiplier applied to material quantities when an item is added
 * from an assembly, because ordering exactly the measured quantity is how you
 * end up short on a Sunday.
 */

export const UNITS = ['ea', 'hr', 'day', 'sf', 'lf', 'sy', 'cy', 'sq', 'ton', 'gal', 'ls'];

export const UNIT_LABELS = {
  ea: 'each', hr: 'hour', day: 'day', sf: 'sq ft', lf: 'lin ft', sy: 'sq yd',
  cy: 'cu yd', sq: 'square', ton: 'ton', gal: 'gallon', ls: 'lump sum',
};

/**
 * @typedef {object} PriceBookItem
 * @property {string} sku
 * @property {string} description
 * @property {string} trade
 * @property {string} category  one of pricing.CATEGORIES
 * @property {string} unit
 * @property {number} unitCost  dollars, YOUR cost
 * @property {number} [waste]   material waste multiplier, e.g. 1.10
 * @property {string} [note]
 */

/** @type {PriceBookItem[]} */
export const PRICE_BOOK = [
  /* ------------------------------------------------------------ labor --- */
  { sku: 'LAB-LEAD', description: 'Lead carpenter', trade: 'General', category: 'labor', unit: 'hr', unitCost: 58, note: 'Loaded rate incl. burden' },
  { sku: 'LAB-CARP', description: 'Carpenter', trade: 'General', category: 'labor', unit: 'hr', unitCost: 46 },
  { sku: 'LAB-HELP', description: 'Laborer / helper', trade: 'General', category: 'labor', unit: 'hr', unitCost: 32 },
  { sku: 'LAB-PM', description: 'Project management', trade: 'General', category: 'labor', unit: 'hr', unitCost: 75, note: 'Bill it or eat it' },
  { sku: 'LAB-DEMO', description: 'Demolition labor', trade: 'Demo', category: 'labor', unit: 'hr', unitCost: 38 },
  { sku: 'LAB-CLEAN', description: 'Final clean', trade: 'General', category: 'labor', unit: 'ls', unitCost: 385 },

  /* ---------------------------------------------------------- demo/site -- */
  { sku: 'DEM-DUMP', description: 'Dumpster, 20 yd, delivered & hauled', trade: 'Demo', category: 'equipment', unit: 'ea', unitCost: 625 },
  { sku: 'DEM-PROT', description: 'Floor & surface protection', trade: 'Demo', category: 'material', unit: 'sf', unitCost: 0.42, waste: 1.1 },
  { sku: 'DEM-DUST', description: 'Dust containment / zip wall', trade: 'Demo', category: 'material', unit: 'ls', unitCost: 240 },
  { sku: 'SIT-PORT', description: 'Portable toilet, monthly', trade: 'Site', category: 'equipment', unit: 'ea', unitCost: 175 },

  /* ------------------------------------------------------------ framing -- */
  { sku: 'FRM-LUM', description: 'Framing lumber package', trade: 'Framing', category: 'material', unit: 'sf', unitCost: 4.85, waste: 1.1 },
  { sku: 'FRM-SHTH', description: 'Wall sheathing, 7/16 OSB', trade: 'Framing', category: 'material', unit: 'sf', unitCost: 1.35, waste: 1.12 },
  { sku: 'FRM-LVL', description: 'LVL beam, installed', trade: 'Framing', category: 'material', unit: 'lf', unitCost: 28 },
  { sku: 'FRM-HDW', description: 'Framing hardware & fasteners', trade: 'Framing', category: 'material', unit: 'ls', unitCost: 320 },

  /* -------------------------------------------------------------- roof --- */
  { sku: 'ROF-ARCH', description: 'Architectural shingles, installed', trade: 'Roofing', category: 'subcontractor', unit: 'sq', unitCost: 268, waste: 1.1 },
  { sku: 'ROF-UNDR', description: 'Synthetic underlayment', trade: 'Roofing', category: 'material', unit: 'sq', unitCost: 42, waste: 1.1 },
  { sku: 'ROF-ICE', description: 'Ice & water shield', trade: 'Roofing', category: 'material', unit: 'lf', unitCost: 2.15, waste: 1.1 },
  { sku: 'ROF-FLSH', description: 'Step & counter flashing', trade: 'Roofing', category: 'material', unit: 'lf', unitCost: 6.5 },

  /* ---------------------------------------------------------- mechanical - */
  { sku: 'ELE-SUB', description: 'Electrician, licensed', trade: 'Electrical', category: 'subcontractor', unit: 'hr', unitCost: 95 },
  { sku: 'ELE-RECP', description: 'Receptacle, rough & trim', trade: 'Electrical', category: 'subcontractor', unit: 'ea', unitCost: 165 },
  { sku: 'ELE-CAN', description: 'Recessed LED can, installed', trade: 'Electrical', category: 'subcontractor', unit: 'ea', unitCost: 195 },
  { sku: 'ELE-PANL', description: 'Panel upgrade, 200A', trade: 'Electrical', category: 'subcontractor', unit: 'ea', unitCost: 2850 },
  { sku: 'PLM-SUB', description: 'Plumber, licensed', trade: 'Plumbing', category: 'subcontractor', unit: 'hr', unitCost: 110 },
  { sku: 'PLM-ROUG', description: 'Fixture rough-in', trade: 'Plumbing', category: 'subcontractor', unit: 'ea', unitCost: 685 },
  { sku: 'PLM-WH', description: 'Water heater, 50 gal, installed', trade: 'Plumbing', category: 'subcontractor', unit: 'ea', unitCost: 1950 },
  { sku: 'HVC-MINI', description: 'Mini-split, 12k BTU, installed', trade: 'HVAC', category: 'subcontractor', unit: 'ea', unitCost: 3400 },
  { sku: 'HVC-DUCT', description: 'Duct run, flex, installed', trade: 'HVAC', category: 'subcontractor', unit: 'ea', unitCost: 385 },

  /* --------------------------------------------------------- insulation -- */
  { sku: 'INS-BATT', description: 'Batt insulation, R-15 wall', trade: 'Insulation', category: 'material', unit: 'sf', unitCost: 1.15, waste: 1.08 },
  { sku: 'INS-SPRY', description: 'Closed-cell spray foam, 2"', trade: 'Insulation', category: 'subcontractor', unit: 'sf', unitCost: 3.25 },
  { sku: 'INS-BLOW', description: 'Blown attic insulation, R-49', trade: 'Insulation', category: 'subcontractor', unit: 'sf', unitCost: 2.1 },

  /* ------------------------------------------------------------ drywall -- */
  { sku: 'DRY-HANG', description: 'Drywall hang & finish, level 4', trade: 'Drywall', category: 'subcontractor', unit: 'sf', unitCost: 2.65, waste: 1.1 },
  { sku: 'DRY-MR', description: 'Moisture-resistant board, wet areas', trade: 'Drywall', category: 'material', unit: 'sf', unitCost: 1.05, waste: 1.12 },
  { sku: 'DRY-PTCH', description: 'Patch & blend, existing', trade: 'Drywall', category: 'labor', unit: 'hr', unitCost: 52 },

  /* -------------------------------------------------------------- trim --- */
  { sku: 'TRM-BASE', description: 'Baseboard, primed MDF, installed', trade: 'Trim', category: 'material', unit: 'lf', unitCost: 3.4, waste: 1.12 },
  { sku: 'TRM-CASE', description: 'Door & window casing', trade: 'Trim', category: 'material', unit: 'lf', unitCost: 3.9, waste: 1.12 },
  { sku: 'TRM-CROWN', description: 'Crown molding, installed', trade: 'Trim', category: 'material', unit: 'lf', unitCost: 6.75, waste: 1.15 },
  { sku: 'DOR-INT', description: 'Interior door, prehung, installed', trade: 'Trim', category: 'material', unit: 'ea', unitCost: 285 },
  { sku: 'DOR-EXT', description: 'Exterior door, insulated, installed', trade: 'Trim', category: 'material', unit: 'ea', unitCost: 1150 },

  /* --------------------------------------------------------- finishes ---- */
  { sku: 'PNT-INT', description: 'Interior paint, walls & ceiling, 2 coats', trade: 'Paint', category: 'subcontractor', unit: 'sf', unitCost: 1.95 },
  { sku: 'PNT-TRIM', description: 'Trim & door paint', trade: 'Paint', category: 'subcontractor', unit: 'lf', unitCost: 2.4 },
  { sku: 'FLR-LVP', description: 'Luxury vinyl plank, installed', trade: 'Flooring', category: 'material', unit: 'sf', unitCost: 4.6, waste: 1.1 },
  { sku: 'FLR-HDWD', description: 'Site-finished hardwood', trade: 'Flooring', category: 'subcontractor', unit: 'sf', unitCost: 9.75, waste: 1.1 },
  { sku: 'FLR-TILE', description: 'Floor tile, set & grouted', trade: 'Tile', category: 'subcontractor', unit: 'sf', unitCost: 11.5, waste: 1.15 },
  { sku: 'TIL-WALL', description: 'Wall tile, shower surround', trade: 'Tile', category: 'subcontractor', unit: 'sf', unitCost: 14.25, waste: 1.15 },
  { sku: 'TIL-WPRF', description: 'Waterproofing membrane', trade: 'Tile', category: 'material', unit: 'sf', unitCost: 2.85, waste: 1.1 },

  /* --------------------------------------------------------- cabinetry -- */
  { sku: 'CAB-BASE', description: 'Base cabinet, semi-custom', trade: 'Cabinetry', category: 'material', unit: 'lf', unitCost: 320 },
  { sku: 'CAB-WALL', description: 'Wall cabinet, semi-custom', trade: 'Cabinetry', category: 'material', unit: 'lf', unitCost: 245 },
  { sku: 'CAB-INST', description: 'Cabinet installation', trade: 'Cabinetry', category: 'labor', unit: 'lf', unitCost: 62 },
  { sku: 'CTP-QRTZ', description: 'Quartz countertop, fabricated & set', trade: 'Countertop', category: 'subcontractor', unit: 'sf', unitCost: 78 },
  { sku: 'CTP-LAM', description: 'Laminate countertop', trade: 'Countertop', category: 'material', unit: 'lf', unitCost: 48 },

  /* --------------------------------------------------------- exterior --- */
  { sku: 'WIN-VNYL', description: 'Vinyl window, installed', trade: 'Windows', category: 'material', unit: 'ea', unitCost: 685 },
  { sku: 'SID-FIBR', description: 'Fiber cement siding, installed', trade: 'Siding', category: 'subcontractor', unit: 'sf', unitCost: 9.2, waste: 1.1 },
  { sku: 'DCK-PT', description: 'Pressure-treated deck framing', trade: 'Decking', category: 'material', unit: 'sf', unitCost: 12.5, waste: 1.1 },
  { sku: 'DCK-COMP', description: 'Composite decking, installed', trade: 'Decking', category: 'material', unit: 'sf', unitCost: 22, waste: 1.1 },
  { sku: 'CON-FLAT', description: 'Concrete flatwork, 4"', trade: 'Concrete', category: 'subcontractor', unit: 'sf', unitCost: 8.75 },
  { sku: 'CON-FTG', description: 'Footing, poured', trade: 'Concrete', category: 'subcontractor', unit: 'lf', unitCost: 42 },
  { sku: 'EXC-MINI', description: 'Mini excavator, daily rental', trade: 'Site', category: 'equipment', unit: 'day', unitCost: 385 },

  /* ---------------------------------------------------------- soft costs - */
  { sku: 'FEE-PERM', description: 'Building permit', trade: 'Fees', category: 'other', unit: 'ls', unitCost: 850, note: 'Pass through at 0% markup' },
  { sku: 'FEE-ENGR', description: 'Structural engineer', trade: 'Fees', category: 'other', unit: 'ls', unitCost: 1400 },
  { sku: 'FEE-DSGN', description: 'Design & drafting', trade: 'Fees', category: 'other', unit: 'hr', unitCost: 95 },
];

/**
 * Assemblies: one click adds a whole coordinated set of line items, scaled by
 * a driving quantity (square feet, count of fixtures, etc.). This is where the
 * time savings actually comes from — a bathroom is 14 line items, not one.
 *
 * `factor` multiplies the driving quantity to get that line's quantity.
 */
export const ASSEMBLIES = [
  {
    id: 'asm-bath-full',
    name: 'Full bathroom remodel',
    driver: 'Bathroom floor area',
    driverUnit: 'sf',
    defaultDriver: 45,
    note: 'Gut to studs, new tile shower, vanity, and fixtures.',
    items: [
      { sku: 'LAB-DEMO', factor: 0.45 },
      { sku: 'DEM-DUMP', factor: 0.022, min: 1 },
      { sku: 'DEM-PROT', factor: 1.5 },
      { sku: 'PLM-ROUG', factor: 0.067, min: 3 },
      { sku: 'ELE-SUB', factor: 0.18 },
      { sku: 'INS-BATT', factor: 1.8 },
      { sku: 'DRY-MR', factor: 2.4 },
      { sku: 'DRY-HANG', factor: 2.4 },
      { sku: 'TIL-WPRF', factor: 1.6 },
      { sku: 'TIL-WALL', factor: 1.4 },
      { sku: 'FLR-TILE', factor: 1.0 },
      { sku: 'TRM-BASE', factor: 0.6 },
      { sku: 'PNT-INT', factor: 2.2 },
      { sku: 'LAB-LEAD', factor: 0.9 },
      { sku: 'LAB-CLEAN', factor: 0.022, min: 1 },
      { sku: 'FEE-PERM', factor: 0.022, min: 1 },
    ],
  },
  {
    id: 'asm-kitchen',
    name: 'Kitchen remodel',
    driver: 'Kitchen floor area',
    driverUnit: 'sf',
    defaultDriver: 180,
    note: 'Cabinets, quartz tops, new electrical, flooring, and paint.',
    items: [
      { sku: 'LAB-DEMO', factor: 0.18 },
      { sku: 'DEM-DUMP', factor: 0.011, min: 1 },
      { sku: 'DEM-PROT', factor: 1.2 },
      { sku: 'CAB-BASE', factor: 0.11 },
      { sku: 'CAB-WALL', factor: 0.08 },
      { sku: 'CAB-INST', factor: 0.19 },
      { sku: 'CTP-QRTZ', factor: 0.28 },
      { sku: 'ELE-RECP', factor: 0.05 },
      { sku: 'ELE-CAN', factor: 0.04 },
      { sku: 'PLM-ROUG', factor: 0.011, min: 1 },
      { sku: 'DRY-PTCH', factor: 0.06 },
      { sku: 'FLR-LVP', factor: 1.0 },
      { sku: 'TRM-BASE', factor: 0.32 },
      { sku: 'PNT-INT', factor: 2.6 },
      { sku: 'LAB-LEAD', factor: 0.35 },
      { sku: 'LAB-CLEAN', factor: 0.006, min: 1 },
      { sku: 'FEE-PERM', factor: 0.006, min: 1 },
    ],
  },
  {
    id: 'asm-roof',
    name: 'Roof replacement',
    driver: 'Roof area',
    driverUnit: 'sq',
    defaultDriver: 28,
    note: 'Tear-off, underlayment, flashing, and architectural shingles.',
    items: [
      { sku: 'LAB-DEMO', factor: 0.75 },
      { sku: 'DEM-DUMP', factor: 0.06, min: 1 },
      { sku: 'ROF-UNDR', factor: 1.0 },
      { sku: 'ROF-ICE', factor: 4.5 },
      { sku: 'ROF-FLSH', factor: 3.0 },
      { sku: 'ROF-ARCH', factor: 1.0 },
      { sku: 'LAB-LEAD', factor: 0.4 },
      { sku: 'FEE-PERM', factor: 0.036, min: 1 },
    ],
  },
  {
    id: 'asm-deck',
    name: 'Composite deck',
    driver: 'Deck area',
    driverUnit: 'sf',
    defaultDriver: 320,
    note: 'Footings, PT frame, composite surface, and railing allowance.',
    items: [
      { sku: 'CON-FTG', factor: 0.09 },
      { sku: 'DCK-PT', factor: 1.0 },
      { sku: 'DCK-COMP', factor: 1.0 },
      { sku: 'FRM-HDW', factor: 0.004, min: 1 },
      { sku: 'LAB-CARP', factor: 0.22 },
      { sku: 'LAB-LEAD', factor: 0.09 },
      { sku: 'FEE-PERM', factor: 0.003, min: 1 },
      { sku: 'FEE-ENGR', factor: 0.003, min: 1 },
    ],
  },
  {
    id: 'asm-basement',
    name: 'Basement finish',
    driver: 'Finished area',
    driverUnit: 'sf',
    defaultDriver: 700,
    note: 'Framing, mechanicals, insulation, drywall, flooring, and trim.',
    items: [
      { sku: 'FRM-LUM', factor: 0.85 },
      { sku: 'ELE-SUB', factor: 0.05 },
      { sku: 'ELE-CAN', factor: 0.017 },
      { sku: 'HVC-DUCT', factor: 0.01 },
      { sku: 'INS-BATT', factor: 1.1 },
      { sku: 'DRY-HANG', factor: 2.6 },
      { sku: 'FLR-LVP', factor: 1.0 },
      { sku: 'TRM-BASE', factor: 0.42 },
      { sku: 'DOR-INT', factor: 0.006 },
      { sku: 'PNT-INT', factor: 2.6 },
      { sku: 'LAB-LEAD', factor: 0.14 },
      { sku: 'LAB-CLEAN', factor: 0.0015, min: 1 },
      { sku: 'FEE-PERM', factor: 0.0015, min: 1 },
    ],
  },
];

const BY_SKU = new Map(PRICE_BOOK.map((i) => [i.sku, i]));

export function findSku(sku) {
  return BY_SKU.get(sku) || null;
}

export function trades() {
  return [...new Set(PRICE_BOOK.map((i) => i.trade))].sort();
}

/**
 * Search the price book. Matches description, sku, and trade; ranks whole-word
 * prefix hits above mid-string hits so typing "til" surfaces Tile before
 * "Ventilation".
 */
export function searchPriceBook(query, { trade = null, limit = 40 } = {}) {
  const q = String(query || '').trim().toLowerCase();
  let rows = PRICE_BOOK;
  if (trade) rows = rows.filter((i) => i.trade === trade);
  if (!q) return rows.slice(0, limit);

  const scored = [];
  for (const item of rows) {
    const hay = `${item.description} ${item.sku} ${item.trade}`.toLowerCase();
    const idx = hay.indexOf(q);
    if (idx === -1) continue;
    const wordStart = idx === 0 || /[\s\-\/]/.test(hay[idx - 1]);
    scored.push({ item, score: (wordStart ? 0 : 100) + idx });
  }
  scored.sort((a, b) => a.score - b.score || a.item.description.localeCompare(b.item.description));
  return scored.slice(0, limit).map((s) => s.item);
}

/**
 * Expand an assembly into concrete line items at a given driving quantity.
 * Quantities are rounded sensibly per unit — you cannot order 3.7 dumpsters,
 * but you can pour 3.7 cubic yards.
 */
export function expandAssembly(assembly, driverQty) {
  const qty = Number(driverQty) || 0;
  return assembly.items.map((ref) => {
    const book = findSku(ref.sku);
    if (!book) return null;
    let q = qty * ref.factor * (book.waste || 1);
    if (ref.min !== undefined) q = Math.max(q, ref.min);
    q = roundQty(q, book.unit);
    return {
      description: book.description,
      category: book.category,
      unit: book.unit,
      qty: q,
      unitCost: book.unitCost,
      markup: book.category === 'other' ? 0 : null,
      sku: book.sku,
      trade: book.trade,
    };
  }).filter(Boolean);
}

/** Whole units for countable things, two decimals for measured things. */
function roundQty(q, unit) {
  const countable = ['ea', 'ls', 'day', 'sq'];
  if (countable.includes(unit)) return Math.max(1, Math.ceil(q - 1e-9));
  return Math.round(q * 100) / 100;
}

/* ==================================================== user price book ===== */

/**
 * The shipped catalog is a starting point, not the truth. A contractor's real
 * costs differ by market, by supplier, and by month, and a price book they
 * cannot correct is one they stop trusting — at which point the whole tool
 * degrades into a calculator.
 *
 * Overrides are stored separately from the shipped catalog rather than mutating
 * it, so that a future update to the shipped costs never silently overwrites a
 * number someone deliberately set.
 *
 * @typedef {object} PriceBookOverride
 * @property {number} [unitCost]  the user's own cost
 * @property {boolean} [hidden]   removed from the picker
 * @property {boolean} [custom]   an item the user created; carries full fields
 */

/** Merge shipped items with user overrides and custom additions. */
export function effectivePriceBook(overrides = {}) {
  const out = [];
  for (const item of PRICE_BOOK) {
    const ov = overrides[item.sku];
    if (ov?.hidden) continue;
    out.push(ov ? { ...item, ...ov, edited: ov.unitCost !== undefined && ov.unitCost !== item.unitCost } : item);
  }
  for (const [sku, ov] of Object.entries(overrides)) {
    if (!ov?.custom || ov.hidden) continue;
    out.push({
      sku,
      description: ov.description || 'Custom item',
      trade: ov.trade || 'Custom',
      category: ov.category || 'material',
      unit: ov.unit || 'ea',
      unitCost: Number(ov.unitCost) || 0,
      custom: true,
    });
  }
  return out;
}

/** Resolve one sku against the user's overrides. */
export function effectiveItem(sku, overrides = {}) {
  return effectivePriceBook(overrides).find((i) => i.sku === sku) || null;
}

/** Trades present in the effective book, including any the user invented. */
export function effectiveTrades(overrides = {}) {
  return [...new Set(effectivePriceBook(overrides).map((i) => i.trade))].sort();
}

/**
 * Search over the effective book. Same ranking as searchPriceBook: whole-word
 * prefix hits outrank mid-string hits, so typing "til" surfaces Tile before
 * Ventilation.
 */
export function searchEffective(query, { overrides = {}, trade = null, limit = 60 } = {}) {
  const q = String(query || '').trim().toLowerCase();
  let rows = effectivePriceBook(overrides);
  if (trade) rows = rows.filter((i) => i.trade === trade);
  if (!q) return rows.slice(0, limit);

  const scored = [];
  for (const item of rows) {
    const hay = `${item.description} ${item.sku} ${item.trade}`.toLowerCase();
    const idx = hay.indexOf(q);
    if (idx === -1) continue;
    const wordStart = idx === 0 || /[\s\-\/]/.test(hay[idx - 1]);
    scored.push({ item, score: (wordStart ? 0 : 100) + idx });
  }
  scored.sort((a, b) => a.score - b.score || a.item.description.localeCompare(b.item.description));
  return scored.slice(0, limit).map((s) => s.item);
}

/** Expand an assembly using the user's own costs where they have set them. */
export function expandAssemblyWith(assembly, driverQty, overrides = {}) {
  const qty = Number(driverQty) || 0;
  return assembly.items.map((ref) => {
    // A hidden item means "I don't sell this", so an assembly must not quietly
    // insert one either. Only fall back to the shipped catalog when the sku is
    // genuinely unknown, never to resurrect something deliberately hidden.
    if (overrides[ref.sku]?.hidden) return null;
    const book = effectiveItem(ref.sku, overrides) || findSku(ref.sku);
    if (!book) return null;
    let q = qty * ref.factor * (book.waste || 1);
    if (ref.min !== undefined) q = Math.max(q, ref.min);
    q = roundQty(q, book.unit);
    return {
      description: book.description,
      category: book.category,
      unit: book.unit,
      qty: q,
      unitCost: book.unitCost,
      markup: book.category === 'other' ? 0 : null,
      sku: book.sku,
      trade: book.trade,
    };
  }).filter(Boolean);
}
