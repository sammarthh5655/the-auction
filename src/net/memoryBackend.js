// In-memory backend for solo games (and the headless simulator). Same API as the Firebase backend.
import { clean, clone, getAt, pushKey, setAt, split } from './tree.js';

export function createMemoryBackend({ uid = 'solo-player', clock = () => Date.now(), persistKey = null } = {}) {
  let tree = {};
  if (persistKey && typeof localStorage !== 'undefined') {
    try { tree = JSON.parse(localStorage.getItem(persistKey) || '{}') || {}; } catch { tree = {}; }
  }
  const subs = new Set();
  let saveTimer = null;
  const emit = () => {
    for (const s of subs) {
      const v = getAt(tree, s.parts);
      if (v !== s.last) { s.last = v; s.cb(v); }
    }
    if (persistKey && typeof localStorage !== 'undefined') {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { try { localStorage.setItem(persistKey, JSON.stringify(tree)); } catch { /* quota */ } }, 400);
    }
  };
  return {
    kind: 'memory',
    uid,
    online: false,
    now: clock,
    async init() { return { uid }; },
    subscribe(path, cb) {
      const s = { parts: split(path), cb, last: undefined };
      subs.add(s);
      s.last = getAt(tree, s.parts); cb(s.last);
      return () => subs.delete(s);
    },
    async get(path) { return clone(getAt(tree, split(path))); },
    async update(map) {
      for (const [p, v] of Object.entries(map)) tree = setAt(tree, split(p), clean(clone(v)));
      emit();
    },
    async transaction(path, fn) {
      const parts = split(path);
      const cur = clone(getAt(tree, parts));
      const next = fn(cur);
      if (next === undefined) return { committed: false, value: getAt(tree, parts) };
      tree = setAt(tree, parts, clean(next));
      emit();
      return { committed: true, value: getAt(tree, parts) };
    },
    async push(path, value) { const k = pushKey(clock()); await this.update({ [`${path}/${k}`]: value }); return k; },
    onDisconnect() { /* no-op offline */ },
    async exists(path) { return getAt(tree, split(path)) != null; },
    clear() { tree = {}; emit(); if (persistKey) try { localStorage.removeItem(persistKey); } catch { /* */ } },
  };
}
