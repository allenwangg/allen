/**
 * charts.js — Dependency-free SVG charts.
 *
 * No charting library. Three reasons, in order of importance:
 *  1. Bundle size. This is a PWA people open on a phone every morning; a
 *     charting lib is 150kB+ gzipped for six chart types we can hand-draw.
 *  2. Theme control. Everything is drawn with CSS custom properties so light
 *     and dark are one variable swap, with no fighting a library's theming.
 *  3. Accessibility. Each chart carries its own <title>/<desc> and a text
 *     summary, which most charting libraries make harder, not easier.
 *
 * All functions return SVG markup strings. Values are escaped at the boundary.
 */

const NS = 'http://www.w3.org/2000/svg';

export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const n = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : 0);

/** Rough advance width for the tabular label font, good enough for collision tests. */
const approxTextWidth = (text) => String(text).length * 6.6;

/* ------------------------------------------------------------------ *
 * Line / area chart with a smoothed overlay
 * ------------------------------------------------------------------ */

/**
 * @param {{date:string, value:number|null}[]} points
 * @param {object} opts
 */
export function lineChart(points, opts = {}) {
  const {
    width = 720, height = 240, pad = { t: 16, r: 14, b: 28, l: 34 },
    min = 0, max = 100, smooth = null, label = 'Score over time',
    bands = [], showDots = null, yTicks = [0, 25, 50, 75, 100],
  } = opts;

  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const valid = points.filter((p) => p.value != null);

  if (valid.length === 0) {
    return emptyChart(width, height, 'No data yet — log a day to see your trend.');
  }

  const x = (i) => pad.l + (points.length <= 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v) => pad.t + ih - ((v - min) / (max - min || 1)) * ih;

  // Reference bands (e.g. "good" zone) drawn behind everything.
  const bandRects = bands.map((b) => `<rect x="${pad.l}" y="${n(y(b.to))}" width="${n(iw)}" `
    + `height="${n(Math.abs(y(b.from) - y(b.to)))}" fill="${esc(b.color || 'var(--band)')}" opacity="${b.opacity ?? 0.5}"/>`).join('');

  const gridLines = yTicks.map((t) =>
    `<line x1="${pad.l}" y1="${n(y(t))}" x2="${n(pad.l + iw)}" y2="${n(y(t))}" class="grid"/>`
    + `<text x="${pad.l - 7}" y="${n(y(t) + 3.5)}" class="axis-label" text-anchor="end">${t}</text>`
  ).join('');

  // Build path segments, breaking on nulls so gaps read as gaps.
  const segments = [];
  let cur = [];
  points.forEach((p, i) => {
    if (p.value == null) { if (cur.length) segments.push(cur); cur = []; return; }
    cur.push([x(i), y(p.value)]);
  });
  if (cur.length) segments.push(cur);

  const linePath = segments.map((seg) =>
    seg.map((pt, i) => `${i === 0 ? 'M' : 'L'}${n(pt[0])},${n(pt[1])}`).join(' ')
  ).join(' ');

  // Area fill under the largest contiguous segment only — filling across gaps
  // would imply data we do not have.
  const biggest = segments.reduce((a, b) => (b.length > a.length ? b : a), []);
  const areaPath = biggest.length > 1
    ? `M${n(biggest[0][0])},${n(pad.t + ih)} `
      + biggest.map((pt) => `L${n(pt[0])},${n(pt[1])}`).join(' ')
      + ` L${n(biggest[biggest.length - 1][0])},${n(pad.t + ih)} Z`
    : '';

  const smoothPath = smooth
    ? smooth.map((v, i) => (v == null ? null : `${i === 0 ? 'M' : 'L'}${n(x(i))},${n(y(v))}`))
        .filter(Boolean).join(' ').replace(/L/, 'M').replace(/^M([^ ]+) M/, 'M$1 L')
    : '';

  const dotEvery = showDots ?? (points.length <= 45 ? 1 : Math.ceil(points.length / 45));
  const dots = points.map((p, i) => (p.value == null || i % dotEvery !== 0 ? '' :
    `<circle cx="${n(x(i))}" cy="${n(y(p.value))}" r="2.6" class="dot"><title>${esc(p.date)}: ${n(p.value)}</title></circle>`
  )).join('');

  const first = points.find((p) => p.value != null);
  const last = [...points].reverse().find((p) => p.value != null);
  const xLabels = points.length > 1
    ? `<text x="${pad.l}" y="${height - 8}" class="axis-label" text-anchor="start">${esc(shortDate(first.date))}</text>`
      + `<text x="${n(pad.l + iw)}" y="${height - 8}" class="axis-label" text-anchor="end">${esc(shortDate(last.date))}</text>`
    : '';

  const vals = valid.map((p) => p.value);
  const desc = `${label}. ${valid.length} points from ${first.date} to ${last.date}. `
    + `Low ${n(Math.min(...vals))}, high ${n(Math.max(...vals))}, latest ${n(last.value)}.`;

  return `<svg viewBox="0 0 ${width} ${height}" class="chart chart-line" role="img" `
    + `aria-label="${esc(desc)}" preserveAspectRatio="xMidYMid meet">`
    + `<title>${esc(label)}</title><desc>${esc(desc)}</desc>`
    + bandRects + gridLines
    + (areaPath ? `<path d="${areaPath}" class="area"/>` : '')
    + `<path d="${linePath}" class="line" fill="none"/>`
    + (smoothPath ? `<path d="${smoothPath}" class="line-smooth" fill="none"/>` : '')
    + dots + xLabels
    + '</svg>';
}

/** Fold a value back inside [lo, hi] by reflection, then clamp as a backstop. */
function reflectInto(v, lo, hi) {
  if (hi <= lo) return lo;
  let x = v;
  if (x < lo) x = lo + (lo - x);
  if (x > hi) x = hi - (x - hi);
  return Math.max(lo, Math.min(hi, x));
}

function shortDate(key) {
  const [, m, d] = key.split('-');
  return `${Number(d)} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m) - 1]}`;
}

function emptyChart(width, height, message) {
  return `<svg viewBox="0 0 ${width} ${height}" class="chart chart-empty" role="img" aria-label="${esc(message)}">`
    + `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" class="empty-label">${esc(message)}</text></svg>`;
}

/* ------------------------------------------------------------------ *
 * Radar — the pillar balance view
 * ------------------------------------------------------------------ */

export function radarChart(values, opts = {}) {
  const { size = 300, label = 'Pillar balance', rings = 4 } = opts;
  const keys = Object.keys(values);
  const cx = size / 2, cy = size / 2, r = size / 2 - 46;
  if (keys.length < 3) return emptyChart(size, size, 'Not enough pillars to plot.');

  const angle = (i) => (i / keys.length) * Math.PI * 2 - Math.PI / 2;
  const pt = (i, frac) => [cx + Math.cos(angle(i)) * r * frac, cy + Math.sin(angle(i)) * r * frac];

  const web = Array.from({ length: rings }, (_, ri) => {
    const frac = (ri + 1) / rings;
    const poly = keys.map((_, i) => pt(i, frac).map(n).join(',')).join(' ');
    return `<polygon points="${poly}" class="radar-ring"/>`;
  }).join('');

  const spokes = keys.map((_, i) => {
    const [px, py] = pt(i, 1);
    return `<line x1="${n(cx)}" y1="${n(cy)}" x2="${n(px)}" y2="${n(py)}" class="radar-spoke"/>`;
  }).join('');

  const present = keys.filter((k) => values[k].value != null);
  const shape = present.length >= 3
    ? `<polygon points="${keys.map((k, i) => (values[k].value == null ? null : pt(i, Math.max(0, Math.min(1, values[k].value / 100))).map(n).join(','))).filter(Boolean).join(' ')}" class="radar-shape"/>`
    : '';

  const nodes = keys.map((k, i) => {
    const v = values[k].value;
    if (v == null) return '';
    const [px, py] = pt(i, Math.max(0, Math.min(1, v / 100)));
    return `<circle cx="${n(px)}" cy="${n(py)}" r="3.4" class="radar-node"><title>${esc(values[k].label)}: ${n(v)}</title></circle>`;
  }).join('');

  const labels = keys.map((k, i) => {
    const [px, py] = pt(i, 1.24);
    const anchor = Math.abs(px - cx) < 12 ? 'middle' : px > cx ? 'start' : 'end';
    const v = values[k].value;
    return `<text x="${n(px)}" y="${n(py)}" text-anchor="${anchor}" class="radar-label">${esc(values[k].label)}`
      + `<tspan x="${n(px)}" dy="13" class="radar-value">${v == null ? '--' : n(v)}</tspan></text>`;
  }).join('');

  const desc = label + '. ' + keys.map((k) => `${values[k].label} ${values[k].value == null ? 'not logged' : n(values[k].value)}`).join(', ') + '.';

  return `<svg viewBox="0 0 ${size} ${size}" class="chart chart-radar" role="img" aria-label="${esc(desc)}">`
    + `<title>${esc(label)}</title><desc>${esc(desc)}</desc>`
    + web + spokes + shape + nodes + labels + '</svg>';
}

/* ------------------------------------------------------------------ *
 * Score ring — the headline number
 * ------------------------------------------------------------------ */

export function scoreRing(score, opts = {}) {
  const { size = 190, stroke = 14, label = 'Healthspan Score', sublabel = '' } = opts;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = score == null ? 0 : Math.max(0, Math.min(1, score / 100));
  const dash = c * frac;

  return `<svg viewBox="0 0 ${size} ${size}" class="chart chart-ring" role="img" `
    + `aria-label="${esc(label)}: ${score == null ? 'not available' : n(score) + ' out of 100'}">`
    + `<title>${esc(label)}</title>`
    + `<circle cx="${size / 2}" cy="${size / 2}" r="${n(r)}" class="ring-track" stroke-width="${stroke}" fill="none"/>`
    + `<circle cx="${size / 2}" cy="${size / 2}" r="${n(r)}" class="ring-value" stroke-width="${stroke}" fill="none" `
    + `stroke-dasharray="${n(dash)} ${n(c - dash)}" stroke-linecap="round" `
    + `transform="rotate(-90 ${size / 2} ${size / 2})"/>`
    + `<text x="${size / 2}" y="${size / 2 + 2}" text-anchor="middle" class="ring-number">${score == null ? '--' : Math.round(score)}</text>`
    + (sublabel ? `<text x="${size / 2}" y="${size / 2 + 26}" text-anchor="middle" class="ring-sub">${esc(sublabel)}</text>` : '')
    + '</svg>';
}

/* ------------------------------------------------------------------ *
 * Horizontal bars — used for weekday patterns and leverage rankings
 * ------------------------------------------------------------------ */

export function barChart(items, opts = {}) {
  const { width = 720, barHeight = 26, gap = 8, pad = { t: 8, r: 14, b: 8, l: 118 }, label = 'Comparison', signed = false } = opts;
  if (!items.length) return emptyChart(width, 120, 'Nothing to compare yet.');

  const height = pad.t + pad.b + items.length * (barHeight + gap) - gap;
  const iw = width - pad.l - pad.r;
  const maxAbs = Math.max(...items.map((i) => Math.abs(i.value ?? 0)), 1);
  const zeroX = signed ? pad.l + iw / 2 : pad.l;
  const scale = signed ? (iw / 2) / maxAbs : iw / maxAbs;

  const rows = items.map((it, i) => {
    const yy = pad.t + i * (barHeight + gap);
    const v = it.value ?? 0;
    const w = Math.abs(v) * scale;
    const bx = v < 0 ? zeroX - w : zeroX;
    const cls = it.className || (signed ? (v < 0 ? 'bar-neg' : 'bar-pos') : 'bar-pos');
    return `<text x="${pad.l - 10}" y="${n(yy + barHeight / 2 + 4)}" text-anchor="end" class="bar-label">${esc(it.label)}</text>`
      + `<rect x="${n(bx)}" y="${n(yy)}" width="${n(Math.max(w, 1))}" height="${barHeight}" rx="5" class="${cls}">`
      + `<title>${esc(it.label)}: ${esc(it.display ?? n(v))}</title></rect>`
      // A long negative bar pushes its value label left into the row-label
      // gutter, where the two overlap into unreadable glyph soup
      // ("68.0 (F-4d9)"). When there is no room outside the bar, put the label
      // inside it instead.
      + (() => {
          const outsideX = v < 0 ? bx - 7 : bx + w + 7;
          const fits = v < 0 ? outsideX - approxTextWidth(it.display ?? n(v)) > pad.l + 4
                             : outsideX + approxTextWidth(it.display ?? n(v)) < width - 2;
          const x = fits ? outsideX : (v < 0 ? bx + 7 : bx + w - 7);
          const anchor = fits ? (v < 0 ? 'end' : 'start') : (v < 0 ? 'start' : 'end');
          const cls = fits ? 'bar-value' : 'bar-value bar-value-inside';
          return `<text x="${n(x)}" y="${n(yy + barHeight / 2 + 4)}" `
            + `text-anchor="${anchor}" class="${cls}">${esc(it.display ?? n(v))}</text>`;
        })();
  }).join('');

  const axis = signed ? `<line x1="${n(zeroX)}" y1="${pad.t}" x2="${n(zeroX)}" y2="${n(height - pad.b)}" class="grid"/>` : '';
  const desc = label + '. ' + items.map((i) => `${i.label}: ${i.display ?? n(i.value)}`).join('; ');

  return `<svg viewBox="0 0 ${width} ${height}" class="chart chart-bars" role="img" aria-label="${esc(desc)}">`
    + `<title>${esc(label)}</title><desc>${esc(desc)}</desc>${axis}${rows}</svg>`;
}

/* ------------------------------------------------------------------ *
 * Scatter — shown alongside every insight so the user can see the evidence
 * ------------------------------------------------------------------ */

export function scatterChart(pairs, opts = {}) {
  const { width = 340, height = 200, pad = { t: 14, r: 12, b: 30, l: 40 }, xLabel = '', yLabel = '', trend = true } = opts;
  if (!pairs.length) return emptyChart(width, height, 'No paired days yet.');

  const xs = pairs.map((p) => p[0]);
  const ys = pairs.map((p) => p[1]);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const iw = width - pad.l - pad.r, ih = height - pad.t - pad.b;
  const sx = (v) => pad.l + (xMax === xMin ? iw / 2 : ((v - xMin) / (xMax - xMin)) * iw);
  const sy = (v) => pad.t + ih - (yMax === yMin ? ih / 2 : ((v - yMin) / (yMax - yMin)) * ih);

  // Jitter overlapping points so density is visible on coarse 1-5 scales.
  // Laid out on a widening spiral rather than a fixed 5x5 lattice: a lattice
  // with a small step packs coincident points into a solid square that reads as
  // one large marker instead of many.
  const seen = new Map();
  const dots = pairs.map(([px, py]) => {
    const key = `${px}|${py}`;
    const k = seen.get(key) || 0;
    seen.set(key, k + 1);
    let jx = 0, jy = 0;
    if (k > 0) {
      const ring = Math.ceil(Math.sqrt(k));
      const angle = k * 2.39996;              // golden angle, so rings don't align
      jx = Math.cos(angle) * ring * 3.1;
      jy = Math.sin(angle) * ring * 3.1;
    }
    // Keep jittered dots inside the plot rectangle. Coarse 1-5 scales stack
    // 40+ coincident pairs, and an unbounded spiral of ring*3.1px throws dots
    // over the axis labels and out of the viewBox (measured 21 of 89 on real
    // sample data). Reflect rather than clamp: clamping stacks every
    // over-jittered dot onto the boundary as a solid line, which reads as a
    // data feature that is not there.
    const r = 2.7;
    const cx = reflectInto(sx(px) + jx, pad.l + r, pad.l + iw - r);
    const cy = reflectInto(sy(py) + jy, pad.t + r, pad.t + ih - r);
    return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${r}" class="scatter-dot"/>`;
  }).join('');

  let trendLine = '';
  if (trend && pairs.length > 2) {
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let num = 0, den = 0;
    for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
    if (den !== 0) {
      const slope = num / den, intercept = my - slope * mx;
      trendLine = `<line x1="${n(sx(xMin))}" y1="${n(sy(slope * xMin + intercept))}" `
        + `x2="${n(sx(xMax))}" y2="${n(sy(slope * xMax + intercept))}" class="scatter-trend"/>`;
    }
  }

  const axes = `<line x1="${pad.l}" y1="${n(pad.t + ih)}" x2="${n(pad.l + iw)}" y2="${n(pad.t + ih)}" class="grid"/>`
    + `<line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${n(pad.t + ih)}" class="grid"/>`
    + `<text x="${n(pad.l + iw / 2)}" y="${height - 6}" text-anchor="middle" class="axis-label">${esc(xLabel)}</text>`
    + `<text x="10" y="${n(pad.t + ih / 2)}" text-anchor="middle" class="axis-label" transform="rotate(-90 10 ${n(pad.t + ih / 2)})">${esc(yLabel)}</text>`
    + `<text x="${pad.l - 6}" y="${n(pad.t + 8)}" text-anchor="end" class="axis-label">${n(yMax)}</text>`
    + `<text x="${pad.l - 6}" y="${n(pad.t + ih)}" text-anchor="end" class="axis-label">${n(yMin)}</text>`;

  return `<svg viewBox="0 0 ${width} ${height}" class="chart chart-scatter" role="img" `
    + `aria-label="Scatter of ${esc(xLabel)} against ${esc(yLabel)}, ${pairs.length} paired days.">`
    + axes + trendLine + dots + '</svg>';
}

/* ------------------------------------------------------------------ *
 * Sparkline — inline, tiny, no axes
 * ------------------------------------------------------------------ */

export function sparkline(values, opts = {}) {
  const { width = 96, height = 26 } = opts;
  const valid = values.filter((v) => v != null);
  if (valid.length < 2) return `<svg viewBox="0 0 ${width} ${height}" class="spark" aria-hidden="true"></svg>`;
  const min = Math.min(...valid), max = Math.max(...valid);
  const d = values.map((v, i) => {
    if (v == null) return null;
    const x = (i / (values.length - 1)) * width;
    const y = height - 2 - ((v - min) / (max - min || 1)) * (height - 4);
    return `${n(x)},${n(y)}`;
  }).filter(Boolean);
  return `<svg viewBox="0 0 ${width} ${height}" class="spark" role="img" `
    + `aria-label="Trend from ${n(valid[0])} to ${n(valid[valid.length - 1])}">`
    + `<polyline points="${d.join(' ')}" fill="none" class="spark-line"/></svg>`;
}
