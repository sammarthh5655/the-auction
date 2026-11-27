// Immutable path-tree helpers used by the in-memory and cross-tab backends (mirrors RTDB semantics).
export const split = path => String(path).split('/').filter(Boolean);

export function getAt(tree, parts) {
  let cur = tree;
  for (const k of parts) { if (cur == null || typeof cur !== 'object') return null; cur = cur[k]; }
  return cur === undefined ? null : cur;
}

/** Strip undefined, turn empty objects into null - like Firebase does. */
export function clean(v) {
  if (v === undefined) return null;
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) { const a = v.map(clean).filter(x => x !== null); return a.length ? a : null; }
  const out = {};
  for (const [k, x] of Object.entries(v)) { const c = clean(x); if (c !== null) out[k] = c; }
  return Object.keys(out).length ? out : null;
}

export function setAt(tree, parts, value) {
  if (!parts.length) return value === undefined ? null : value;
  const [k, ...rest] = parts;
  const base = tree && typeof tree === 'object' && !Array.isArray(tree) ? tree : Array.isArray(tree) ? { ...tree } : {};
  const child = setAt(base[k], rest, value);
  const out = Array.isArray(tree) ? Object.assign([], tree) : { ...base };
  if (child === null || child === undefined || (typeof child === "object" && !Array.isArray(child) && !Object.keys(child).length)) delete out[k];
  else out[k] = child;
  return out;
}

export const clone = v => (v == null ? v : typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

let counter = 0;
export function pushKey(now = Date.now()) {
  counter = (counter + 1) % 1000;
  return now.toString(36) + counter.toString(36).padStart(2, '0') + Math.random().toString(36).slice(2, 5);
}
