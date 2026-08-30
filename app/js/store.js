/**
 * store.js — Local-first persistence.
 *
 * IndexedDB with a localStorage fallback. Local-first is a deliberate product
 * decision, not just an engineering one: health data that never leaves the
 * device is a genuine differentiator in this category, it removes an entire
 * class of privacy objection at the point of signup, and it means the app
 * costs almost nothing to run per free user.
 */

const DB_NAME = 'vitalarc';
const DB_VERSION = 1;
const STORE_ENTRIES = 'entries';
const STORE_META = 'meta';
const LS_PREFIX = 'vitalarc:';

let dbPromise = null;

function hasIDB() {
  try { return typeof indexedDB !== 'undefined' && indexedDB !== null; }
  catch { return false; }
}

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!hasIDB()) return reject(new Error('no-idb'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
        db.createObjectStore(STORE_ENTRIES, { keyPath: 'date' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // When a future version of the app upgrades the schema in another tab,
      // close this connection so the upgrade can proceed. Without this, the
      // new tab's open() blocks forever behind the old tab.
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error('idb-open-failed'));
    req.onblocked = () => reject(new Error('idb-blocked'));
  }).catch((e) => { dbPromise = null; throw e; });
  return dbPromise;
}

/**
 * Run one IndexedDB transaction.
 *
 * `fn(store)` may return an IDBRequest or nothing. We resolve with the
 * request's `.result` on transaction completion.
 *
 * This deliberately does NOT try to be clever about unwrapping. An earlier
 * version resolved with `req.result` only when it was defined and fell back to
 * the request object otherwise — which meant a lookup that legitimately
 * returned `undefined` (a meta key that was never set) handed back a settled
 * IDBRequest, and awaiting it waited forever on an `onsuccess` that had
 * already fired. Boot hung on first run with no error in the console, because
 * a pending promise is not an exception. `undefined` is a valid result, so it
 * has to be treated as one.
 */
function tx(db, storeName, mode, fn) {
  return new Promise((resolve, reject) => {
    let req;
    let t;
    try {
      t = db.transaction(storeName, mode);
      req = fn(t.objectStore(storeName));
    } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
    t.onerror = () => reject(t.error || new Error('transaction-failed'));
    t.onabort = () => reject(t.error || new Error('transaction-aborted'));
  });
}

/* ---------------- localStorage fallback ---------------- */

const lsFallback = {
  async all() {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(LS_PREFIX + 'entry:')) {
          try { out.push(JSON.parse(localStorage.getItem(k))); } catch { /* skip corrupt row */ }
        }
      }
    } catch { /* storage disabled entirely */ }
    return out;
  },
  async put(entry) {
    // A swallowed quota error here meant the app toasted "Day saved" while
    // nothing persisted — the worst possible failure for a journal. Writes
    // must propagate so the caller can tell the user the truth.
    try { localStorage.setItem(LS_PREFIX + 'entry:' + entry.date, JSON.stringify(entry)); }
    catch (e) { throw new Error('Storage is full or unavailable — the entry was NOT saved. Export your data and clear space.'); }
    return entry;
  },
  async get(date) {
    try { const v = localStorage.getItem(LS_PREFIX + 'entry:' + date); return v ? JSON.parse(v) : null; }
    catch { return null; }
  },
  async del(date) { try { localStorage.removeItem(LS_PREFIX + 'entry:' + date); } catch { /**/ } },
  async getMeta(key) {
    try { const v = localStorage.getItem(LS_PREFIX + 'meta:' + key); return v ? JSON.parse(v) : null; }
    catch { return null; }
  },
  async setMeta(key, value) {
    try { localStorage.setItem(LS_PREFIX + 'meta:' + key, JSON.stringify(value)); }
    catch (e) { throw new Error('Storage is full or unavailable — the setting was NOT saved.'); }
    return value;
  },
};

/* ---------------- public API ---------------- */

export const store = {
  /** True once we've confirmed IndexedDB actually works in this context. */
  _mode: null,

  async _backend() {
    if (this._mode) return this._mode;
    try { await openDB(); this._mode = 'idb'; }
    catch (e) {
      // A blocked open is TRANSIENT — an old tab holds the previous schema
      // version. Latching to localStorage here would silently fork the user's
      // data across two backends (new days in localStorage, history in
      // IndexedDB). Fall back for this call but leave _mode unset so the next
      // call retries IndexedDB.
      if (e && e.message === 'idb-blocked') return 'ls';
      this._mode = 'ls';
    }
    return this._mode;
  },

  async allEntries() {
    if (await this._backend() === 'ls') return (await lsFallback.all()).sort(byDate);
    const db = await openDB();
    const rows = await tx(db, STORE_ENTRIES, 'readonly', (s) => s.getAll());
    return (rows || []).sort(byDate);
  },

  async getEntry(date) {
    if (await this._backend() === 'ls') return lsFallback.get(date);
    const db = await openDB();
    return (await tx(db, STORE_ENTRIES, 'readonly', (s) => s.get(date))) ?? null;
  },

  async putEntry(entry) {
    if (await this._backend() === 'ls') return lsFallback.put(entry);
    const db = await openDB();
    await tx(db, STORE_ENTRIES, 'readwrite', (s) => s.put(entry));
    return entry;
  },

  async putMany(entries) {
    if (await this._backend() === 'ls') { for (const e of entries) await lsFallback.put(e); return entries.length; }
    const db = await openDB();
    await tx(db, STORE_ENTRIES, 'readwrite', (s) => { for (const e of entries) s.put(e); });
    return entries.length;
  },

  async deleteEntry(date) {
    if (await this._backend() === 'ls') return lsFallback.del(date);
    const db = await openDB();
    return tx(db, STORE_ENTRIES, 'readwrite', (s) => s.delete(date));
  },

  async getMeta(key, fallback = null) {
    if (await this._backend() === 'ls') return (await lsFallback.getMeta(key)) ?? fallback;
    const db = await openDB();
    const row = await tx(db, STORE_META, 'readonly', (s) => s.get(key));
    return row ? row.value : fallback;
  },

  async setMeta(key, value) {
    if (await this._backend() === 'ls') return lsFallback.setMeta(key, value);
    const db = await openDB();
    await tx(db, STORE_META, 'readwrite', (s) => s.put({ key, value }));
    return value;
  },

  /** Full export — the user's data is theirs, and saying so converts. */
  async exportAll() {
    const [entries, profile, entitlement] = await Promise.all([
      this.allEntries(), this.getMeta('profile'), this.getMeta('entitlement'),
    ]);
    return {
      app: 'VitalArc',
      exportedAt: new Date().toISOString(),
      schemaVersion: 3,
      profile,
      entitlement,
      entries,
    };
  },

  async importAll(payload, validate) {
    if (!payload || !Array.isArray(payload.entries)) throw new Error('Not a VitalArc export file.');
    const good = [];
    const problems = [];
    for (const raw of payload.entries) {
      const { entry, errors } = validate(raw);
      if (entry) { good.push(entry); if (errors.length) problems.push({ date: raw.date, errors }); }
      else problems.push({ date: raw && raw.date, errors });
    }
    await this.putMany(good);
    if (payload.profile && typeof payload.profile === 'object') {
      // The entries were validated; the profile must be too — an import is
      // attacker-shaped input like any other file.
      const age = Number(payload.profile.age);
      const weightKg = Number(payload.profile.weightKg);
      const profile = {};
      if (Number.isFinite(age) && age >= 13 && age <= 110) profile.age = age;
      if (Number.isFinite(weightKg) && weightKg >= 25 && weightKg <= 300) profile.weightKg = weightKg;
      const heightCm = Number(payload.profile.heightCm);
      if (Number.isFinite(heightCm) && heightCm >= 120 && heightCm <= 230) profile.heightCm = heightCm;
      if (Object.keys(profile).length) await this.setMeta('profile', profile);
    }
    // Backups export the entitlement, so restoring one must not silently drop
    // it: a paying user who restored a backup used to land on Free with no
    // recovery path, and a free user could export/wipe/import to re-arm the
    // trial indefinitely. Shape-validated like everything else from a file.
    if (payload.entitlement && typeof payload.entitlement === 'object') {
      const src = payload.entitlement;
      const ent = {};
      if (['active', 'trialing', 'canceled'].includes(src.status)) ent.status = src.status;
      if (src.tier === 'pro' || src.tier === 'free') ent.tier = src.tier;
      if (src.plan === 'monthly' || src.plan === 'annual') ent.plan = src.plan;
      if (typeof src.customerId === 'string' && /^cus_[A-Za-z0-9]+$/.test(src.customerId)) ent.customerId = src.customerId;
      if (typeof src.portalToken === 'string' && /^[0-9a-f]{64}$/.test(src.portalToken)) ent.portalToken = src.portalToken;
      for (const k of ['periodEnd', 'trialStartedAt', 'startedAt', 'canceledAt']) {
        if (Number.isFinite(Number(src[k]))) ent[k] = Number(src[k]);
      }
      if (typeof src.pastDue === 'boolean') ent.pastDue = src.pastDue;
      if (ent.status) await this.setMeta('entitlement', ent);
    }
    return { imported: good.length, problems };
  },

  async clearAll() {
    if (await this._backend() === 'ls') {
      try {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(LS_PREFIX)) keys.push(k);
        }
        for (const k of keys) localStorage.removeItem(k);
      } catch { /* storage disabled entirely — nothing to clear */ }
      return;
    }
    const db = await openDB();
    await tx(db, STORE_ENTRIES, 'readwrite', (s) => s.clear());
    await tx(db, STORE_META, 'readwrite', (s) => s.clear());
  },
};

function byDate(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }
