// Small, dependency-free helpers shared by the engine, the host runner and the UI.

export function makeRng(seed = Date.now()) {
  let a = typeof seed === 'number' ? seed >>> 0 : hashStr(String(seed));
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const sum = arr => arr.reduce((s, x) => s + x, 0);
export const byId = list => Object.fromEntries(list.map(x => [x.id, x]));

/** Firebase RTDB turns arrays into objects and drops empty ones; normalise back. */
export function asArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(x => x !== undefined && x !== null);
  return Object.keys(v).sort((a, b) => Number(a) - Number(b)).map(k => v[k]).filter(x => x != null);
}
export const values = obj => (obj ? Object.values(obj) : []);

export function deepMerge(base, over) {
  if (Array.isArray(base) || Array.isArray(over)) return over === undefined ? base : over;
  if (typeof base !== 'object' || base === null) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    out[k] = typeof v === 'object' && v !== null && !Array.isArray(v) && typeof base[k] === 'object' && base[k] !== null
      ? deepMerge(base[k], v) : v;
  }
  return out;
}

/** Money is always an integer count of the sport's minor unit (cricket: lakhs). */
export function formatMoney(v, currency, { compact = false } = {}) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const { symbol, big, small, bigFactor } = currency;
  const neg = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (a >= bigFactor || compact) {
    const n = a / bigFactor;
    const s = n >= 100 ? n.toFixed(0) : n.toFixed(2).replace(/\.?0+$/, '');
    return `${neg}${symbol}${s}${compact ? '' : ' '}${big}`;
  }
  return `${neg}${symbol}${a}${small ? ' ' + small : ''}`;
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export const ROOM_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function makeRoomCode(rng = Math.random, len = 5) {
  let c = '';
  for (let i = 0; i < len; i++) c += ROOM_CODE_CHARS[Math.floor(rng() * ROOM_CODE_CHARS.length)];
  return c;
}

export function ageFrom(dob, at = new Date()) {
  if (!dob) return null;
  const d = new Date(dob);
  let age = at.getFullYear() - d.getFullYear();
  const m = at.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < d.getDate())) age--;
  return age;
}
