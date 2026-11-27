import { useEffect, useState } from 'react';

const cache = {};

/** Loads a sport pack's player database (public/data/<sport>/players.json) once. */
export function loadSportData(pack) {
  if (!cache[pack.id]) {
    // ?v=<build id> so a new deploy never serves an hour-old cached copy of the player data
    cache[pack.id] = fetch(`${pack.dataUrl}?v=${typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'}`).then(r => {
      if (!r.ok) throw new Error(`Could not load ${pack.dataUrl} (${r.status}). Run the data script - see README.`);
      return r.json();
    }).then(d => {
      const players = d.players;
      players.byId = Object.fromEntries(players.map(p => [p.id, p]));
      players.meta = d.meta;
      return players;
    });
    cache[pack.id].catch(() => { delete cache[pack.id]; });
  }
  return cache[pack.id];
}

export function useSportData(pack) {
  const [state, setState] = useState({ players: null, error: null });
  useEffect(() => {
    if (!pack?.available) return undefined;
    let live = true;
    loadSportData(pack).then(players => live && setState({ players, error: null }), error => live && setState({ players: null, error }));
    return () => { live = false; };
  }, [pack]);
  return state;
}
