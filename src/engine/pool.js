// Player-pool filtering, selection and auction ordering. Sport-independent.
import { shuffle } from './util.js';

export function filterPool(players, s, pack) {
  const f = s.pool;
  const eras = (f.eras || []).map(k => pack.eras?.find(e => e.key === k)).filter(Boolean);
  return players.filter(p => {
    if (!f.includeRetired && p.status === 'retired') return false;
    if (f.onlyRetired && p.status !== 'retired') return false;
    if (f.roles?.length && !f.roles.includes(p.role)) return false;
    if (f.countries?.length && !f.countries.includes(p.country)) return false;
    if (f.origin === 'domestic' && p.overseas) return false;
    if (f.origin === 'overseas' && !p.overseas) return false;
    if (eras.length && !eras.some(e => p.years[0] <= e.to && p.years[1] >= e.from)) return false;
    if (f.minOvr && p.ovr < f.minOvr) return false;
    for (const xf of pack.extraFilters || []) if (!xf.test(p, f.extra?.[xf.key] ?? xf.default)) return false;
    return true;
  });
}

/**
 * Picks the players that will go under the hammer.
 * Guarantees enough players of each required role (teams x min x 1.5) when the pool allows.
 */
export function selectPlayers(cands, s, pack, rng, exclude = new Set()) {
  const pool = cands.filter(p => !exclude.has(p.id));
  const N = Math.min(s.pool.count, pool.length);
  const order = list => {
    if (s.pool.selection === 'top') return list.slice().sort((a, b) => b.ovr - a.ovr);
    if (s.pool.selection === 'random') return shuffle(list, rng);
    // mix: stars first, then a weighted-random tail so every game feels different
    const sorted = list.slice().sort((a, b) => b.ovr - a.ovr);
    const head = sorted.slice(0, Math.ceil(N * 0.5));
    const tail = sorted.slice(head.length).map(p => ({ p, k: rng() * (0.4 + p.ovr / 100) })).sort((a, b) => b.k - a.k).map(x => x.p);
    return [...head, ...tail];
  };
  const chosen = new Map();
  const teams = s.teams.length;
  const quota = { ...(pack.essentialRoles || {}) };
  for (const [role, req] of Object.entries(s.squad.roleMins || {})) if (req.on) quota[role] = Math.max(quota[role] || 0, req.min);
  for (const [role, min] of Object.entries(quota)) {
    const want = Math.ceil(teams * min * 1.5);
    order(pool.filter(p => p.role === role)).slice(0, want).forEach(p => chosen.set(p.id, p));
  }
  for (const p of order(pool)) { if (chosen.size >= N) break; chosen.set(p.id, p); }
  return [...chosen.values()].slice(0, Math.max(N, chosen.size));
}

/** Returns lots: [{ p: playerId, s: 'set label' }] */
export function orderLots(selected, s, pack, rng) {
  const roleLabel = k => pack.roles.find(r => r.key === k)?.plural || k;
  const bySets = list => {
    const groups = (pack.auctionSets || pack.roles.map(r => r.key)).map(role =>
      list.filter(p => p.role === role).sort((a, b) => b.ovr - a.ovr));
    const out = [];
    let setNo = 1;
    for (let k = 0; groups.some(g => g.length > k * s.setSize); k++) {
      groups.forEach((g, gi) => {
        const chunk = g.slice(k * s.setSize, (k + 1) * s.setSize);
        if (!chunk.length) return;
        const label = `Set ${setNo++} · ${roleLabel(pack.auctionSets?.[gi] || chunk[0].role)}`;
        shuffle(chunk, rng).forEach(p => out.push({ p: p.id, s: label }));
      });
    }
    return out;
  };
  if (s.order === 'shuffled') return shuffle(selected, rng).map(p => ({ p: p.id, s: 'Open auction' }));
  if (s.order === 'marquee') {
    const sorted = selected.slice().sort((a, b) => b.ovr - a.ovr);
    const marquee = sorted.slice(0, s.marqueeCount);
    const rest = sorted.slice(s.marqueeCount);
    return [...shuffle(marquee, rng).map(p => ({ p: p.id, s: 'Marquee set' })), ...bySets(rest)];
  }
  return bySets(selected);
}
