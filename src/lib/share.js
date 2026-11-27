// Shareable results: the final XIs are packed into the URL hash, so anyone with the link sees the
// same verdict computed from the same public player database. No server needed.
const enc = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const dec = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

export function encodeResult(room) {
  const teams = Object.values(room.teams).map(t => {
    const ids = room.lineups?.[t.id]?.ids;
    return [t.name, t.color, Array.isArray(ids) ? ids : Object.values(ids || {}), Object.keys(t.squad || {}).length];
  });
  const payload = { v: 1, s: room.meta.sport, p: room.settings.purse, o: room.settings.squad.lineupOverseasMax, on: room.settings.squad.overseasOn, t: teams };
  return enc(JSON.stringify(payload));
}

export function decodeResult(str) {
  try {
    const d = JSON.parse(dec(str));
    if (d.v !== 1) return null;
    const teams = {}, lineups = {};
    d.t.forEach(([name, color, ids, squadSize], i) => {
      const id = `t${i + 1}`;
      teams[id] = { id, name, color, squadSize };
      lineups[id] = { ids, locked: true };
    });
    return { sport: d.s, purse: d.p, settings: { purse: d.p, squad: { lineupOverseasMax: d.o, overseasOn: d.on } }, teams, lineups };
  } catch { return null; }
}

export function shareUrl(room) {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#/r/${encodeResult(room)}`;
}
