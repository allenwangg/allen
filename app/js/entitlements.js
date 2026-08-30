/**
 * entitlements.js — Free/Pro gating and trial state.
 *
 * PRODUCT STANCE, stated here because it constrains the code below:
 *
 * The free tier is genuinely useful forever. Logging, today's score, pillar
 * breakdown, streaks and a 14-day history are never taken away. We gate depth,
 * not function. A tracker that holds your own data hostage gets uninstalled and
 * one-starred, and churn is the only number that matters in subscription apps.
 *
 * What is gated is the work that is genuinely expensive to build and genuinely
 * valuable: the correlation engine, the simulator, unlimited history, and
 * export-grade reporting.
 *
 * What this file deliberately does NOT do:
 *   - no countdown timers manufactured from the current clock
 *   - no fake scarcity, no "3 people are viewing this"
 *   - no trial that starts silently and bills without a prompt
 *   - no burying the cancel path
 * Those tactics lift week-one conversion and destroy month-six retention, and
 * in a health app they are a regulatory and reputational liability besides.
 *
 * SECURITY NOTE: everything here is client-side and therefore advisory. A
 * determined user can flip a flag in devtools. That is an accepted trade for a
 * local-first app — the real enforcement point is the server that issues
 * receipts (see api/), and anything genuinely costly to serve must be verified
 * there. Client gating exists to shape the product, not to defend a perimeter.
 */

export const TIERS = {
  free: {
    id: 'free',
    label: 'Free',
    price: 0,
    historyDays: 14,
    features: new Set(['log', 'today', 'pillars', 'streak', 'weekday', 'export']),
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    priceMonthly: 8.99,
    priceAnnual: 59.0,
    historyDays: Infinity,
    features: new Set([
      'log', 'today', 'pillars', 'streak', 'weekday', 'export',
      'insights', 'simulator', 'leverage', 'fullHistory', 'trends',
      'biomarkers', 'report',
    ]),
  },
};

export const FEATURE_COPY = {
  insights:    { name: 'Personal insights',   why: 'Find which of your habits actually move your numbers, with proper significance testing.' },
  simulator:   { name: 'What-if simulator',   why: 'See what a change would do to your score before you commit to it.' },
  leverage:    { name: 'Highest-leverage actions', why: 'Ranked by simulated effect on your own data, not generic advice.' },
  fullHistory: { name: 'Unlimited history',   why: 'Free keeps 14 days. Pro keeps everything, forever.' },
  trends:      { name: 'Long-range trends',   why: '90-day and all-time trend analysis.' },
  biomarkers:  { name: 'Biomarker tracking',  why: 'Resting heart rate, HRV, waist and weight folded into your score.' },
  report:      { name: 'Shareable report',    why: 'A clean summary you can hand to a doctor or coach.' },
};

export const TRIAL_DAYS = 7;

/**
 * Resolve the current entitlement from stored state.
 * `now` is injected rather than read from the clock so this is testable and so
 * the trial cannot drift with timezone changes.
 */
export function resolveEntitlement(stored, now = Date.now()) {
  const s = stored || {};

  // An explicit cancellation, written only by a server response. This is the
  // ONLY way a paid subscription loses Pro.
  if (s.status === 'canceled') {
    return { tier: 'free', source: 'canceled', status: 'canceled', canceledAt: s.canceledAt || null };
  }

  if (s.status === 'active' && s.tier === 'pro') {
    // A paid subscription.
    //
    // A PASSED periodEnd DOES NOT MEAN THE SUBSCRIPTION ENDED. It means this
    // device has not heard from the billing server since the last period —
    // and for a renewing subscriber in good standing that is the normal case,
    // because Stripe renews silently and the client's copy is written exactly
    // once, at checkout.
    //
    // Treating it as expiry was catastrophic: every monthly subscriber was
    // warned "we couldn't process your renewal" on day 30 and hard-lapsed to
    // Free on day 33 — shown the pricing page and asked to buy again — while
    // their card was being charged perfectly well. Verified against this
    // module: day 29 pro, day 31 pro+inGrace, day 34 free/lapsed.
    //
    // So a stale record asks for revalidation and keeps Pro meanwhile. The
    // client cache was never a security boundary (see billing.js); erring
    // toward serving a paying customer is both the honest failure direction
    // and the cheap one, since nothing behind the paywall costs us to serve.
    const stale = !!(s.periodEnd && now >= s.periodEnd);
    return {
      tier: 'pro', source: 'subscription', status: 'active',
      renewsAt: s.periodEnd || null,
      // Asks boot() to re-check with the server; never gates access by itself.
      needsRefresh: stale,
      // Only set once the server has actually reported a payment problem.
      inGrace: s.pastDue === true,
    };
  }

  if (s.status === 'trialing' && s.trialStartedAt) {
    const endsAt = s.trialStartedAt + TRIAL_DAYS * 86400000;
    if (now < endsAt) {
      return {
        tier: 'pro', source: 'trial', status: 'trialing',
        trialEndsAt: endsAt,
        daysLeft: Math.ceil((endsAt - now) / 86400000),
      };
    }
    return { tier: 'free', source: 'trial-ended', status: 'trial-ended', trialEndedAt: endsAt };
  }

  return { tier: 'free', source: 'default', status: 'free' };
}

export function can(entitlement, feature) {
  const tier = TIERS[entitlement?.tier] || TIERS.free;
  return tier.features.has(feature);
}

export function historyLimit(entitlement) {
  return (TIERS[entitlement?.tier] || TIERS.free).historyDays;
}

/**
 * Trim an entry list to what the current tier may see.
 * Note it trims the *view*, never the stored data — a user who lets Pro lapse
 * and later resubscribes gets their full history back. Deleting paid-for data
 * on downgrade is the kind of thing that generates chargebacks.
 */
export function visibleEntries(entries, entitlement, today = null) {
  const limit = historyLimit(entitlement);
  if (!Number.isFinite(limit)) return entries;
  // Trim by DATE, not by entry count. Slicing the last N entries meant the
  // Free tier's "last 14 days" was really "your last 14 logged days": someone
  // logging twice a week saw a 46-day window under a label promising 14.
  // The label is a promise about the calendar, so the code must be too.
  const end = today || (entries.length ? entries[entries.length - 1].date : null);
  if (!end) return entries;
  const cutoff = shiftDate(end, -(limit - 1));
  return entries.filter((e) => e.date >= cutoff);
}

/** Local-time date arithmetic on a YYYY-MM-DD key. */
function shiftDate(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function startTrial(stored, now = Date.now()) {
  if (stored?.trialStartedAt) return { ...stored, error: 'Trial already used.' };
  return { ...stored, status: 'trialing', tier: 'pro', trialStartedAt: now };
}

/**
 * Annual savings, computed rather than hardcoded so the marketing copy can
 * never drift out of sync with the actual prices.
 */
export function annualSavings() {
  const yearOfMonthly = TIERS.pro.priceMonthly * 12;
  const saved = yearOfMonthly - TIERS.pro.priceAnnual;
  return {
    yearOfMonthly: round2(yearOfMonthly),
    annual: TIERS.pro.priceAnnual,
    saved: round2(saved),
    percent: Math.round((saved / yearOfMonthly) * 100),
    perMonthEquivalent: round2(TIERS.pro.priceAnnual / 12),
  };
}

const round2 = (x) => Math.round(x * 100) / 100;
