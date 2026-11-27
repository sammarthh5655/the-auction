// Safe localStorage wrappers: per-device preferences and saved setting presets.
const NS = 'the-auction:';

function safeGet(k, fallback) {
  try { const v = localStorage.getItem(NS + k); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
}
function safeSet(k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch { /* private mode */ } }

export const prefs = { get: safeGet, set: safeSet };

export const presets = {
  list(sport) { return safeGet(`presets:${sport}`, []); },
  save(sport, name, settings) {
    const list = presets.list(sport).filter(p => p.name !== name);
    const { teams, seed, ...rest } = settings;
    list.unshift({ name, savedAt: Date.now(), settings: { ...rest, teams: teams.map(({ ownerUid, ...t }) => t) } });
    safeSet(`presets:${sport}`, list.slice(0, 20));
    return list;
  },
  remove(sport, name) { const l = presets.list(sport).filter(p => p.name !== name); safeSet(`presets:${sport}`, l); return l; },
};

export function playerName() { return safeGet('name', ''); }
export function setPlayerName(n) { safeSet('name', n); }
