/**
 * Cross-tab test backend (development only): every browser tab on this origin shares one database
 * stored in localStorage. Transactions are made atomic with the Web Locks API and changes are
 * broadcast with BroadcastChannel. Lets you test online multiplayer without a Firebase project:
 *   open  http://localhost:5173/?backend=tabs  in two tabs.
 */
import { clean, clone, getAt, pushKey, setAt, split } from './tree.js';

const KEY = 'the-auction:tabs-db';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };

export function createTabsBackend() {
  let uid = sessionStorage.getItem('the-auction:tab-uid');
  if (!uid) { uid = 'tab-' + Math.random().toString(36).slice(2, 8); sessionStorage.setItem('the-auction:tab-uid', uid); }
  const chan = new BroadcastChannel('the-auction-tabs');
  let tree = read();
  const subs = new Set();
  const disconnects = [];
  const emit = () => {
    for (const s of subs) {
      const v = getAt(tree, s.parts);
      if (JSON.stringify(v) !== s.lastJson) { s.lastJson = JSON.stringify(v); s.last = v; s.cb(v); }
    }
  };
  chan.onmessage = () => { tree = read(); emit(); };
  const commit = () => { localStorage.setItem(KEY, JSON.stringify(tree)); chan.postMessage(1); emit(); };
  const locked = fn => navigator.locks.request('the-auction-db', async () => { tree = read(); return fn(); });
  window.addEventListener('beforeunload', () => {
    tree = read();
    for (const [p, v] of disconnects) tree = setAt(tree, split(p), v);
    localStorage.setItem(KEY, JSON.stringify(tree)); chan.postMessage(1);
  });
  return {
    kind: 'tabs', uid, online: true,
    now: () => Date.now(),
    async init() { return { uid }; },
    subscribe(path, cb) {
      const s = { parts: split(path), cb, last: undefined, lastJson: '' };
      subs.add(s); s.last = getAt(tree, s.parts); s.lastJson = JSON.stringify(s.last); cb(s.last);
      return () => subs.delete(s);
    },
    async get(path) { tree = read(); return clone(getAt(tree, split(path))); },
    update(map) {
      return locked(() => { for (const [p, v] of Object.entries(map)) tree = setAt(tree, split(p), clean(clone(v))); commit(); });
    },
    transaction(path, fn) {
      return locked(() => {
        const parts = split(path);
        const next = fn(clone(getAt(tree, parts)));
        if (next === undefined) return { committed: false, value: getAt(tree, parts) };
        tree = setAt(tree, parts, clean(next)); commit();
        return { committed: true, value: getAt(tree, parts) };
      });
    },
    async push(path, value) { const k = pushKey(); await this.update({ [`${path}/${k}`]: value }); return k; },
    onDisconnect(path, value) { disconnects.push([path, value]); },
    async exists(path) { tree = read(); return getAt(tree, split(path)) != null; },
  };
}
