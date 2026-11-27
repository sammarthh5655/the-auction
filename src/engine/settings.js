// Generic (sport-independent) host settings. A sport pack can override any default via pack.defaults.
import { deepMerge } from './util.js';

export const TEAM_COLORS = ['#f5c542', '#ff5d5d', '#3fa7ff', '#ffd23f', '#9b5cff', '#ff8a3d', '#2ee6a6', '#ff4fb4', '#00d1d1', '#c0e85a'];
export const TEAM_NAMES = ['Golden Gavels', 'Crimson Strikers', 'Blue Bombers', 'Sunrise Sixers', 'Royal Rhinos', 'Desert Hawks',
  'Emerald Eagles', 'Pink Panthers', 'Coastal Kings', 'Lime Lions'];

export function makeTeams(count, humans = 1) {
  return Array.from({ length: count }, (_, i) => ({
    id: `t${i + 1}`, name: TEAM_NAMES[i % TEAM_NAMES.length], color: TEAM_COLORS[i % TEAM_COLORS.length],
    type: i < humans ? 'human' : 'bot',
  }));
}

export function defaultSettings(pack) {
  const base = {
    sport: pack.id,
    purse: 100,              // in big currency units (Cr)
    teamCount: 6,
    teams: makeTeams(6),
    pool: {
      includeRetired: true, eras: [], countries: [], roles: [], origin: 'all', minOvr: 0,
      extra: Object.fromEntries((pack.extraFilters || []).map(f => [f.key, f.default])),
      count: 110, selection: 'mix',
    },
    squad: { min: 12, max: 16, overseasOn: true, overseasMax: 6, lineupOverseasMax: 4, roleMins: {} },
    pricing: { baseMode: 'rating', flatBase: 0.5, scaleWithPurse: true, incMode: 'tiered', incFixed: 0.25, incPercent: 5 },
    timer: 10,
    order: 'sets', marqueeCount: 12, setSize: 8,
    secondRound: true, secondRoundDiscount: 50,
    retention: { on: false, max: 2 },
    rtm: { on: false, cards: 1 },
    bots: { allowed: true, difficulty: 'medium' },
    reveal: 'auto',          // auto | 3d | 2d   (per-device preference lives in localStorage too)
    seed: Math.floor(Math.random() * 1e9),
  };
  return deepMerge(base, pack.defaults || {});
}

/** Returns a list of human-readable problems that block starting the game. */
export function validateSettings(s, pack, poolSize) {
  const problems = [], warnings = [];
  if (!(s.purse >= 50)) problems.push('Budget must be at least 50 ' + pack.currency.big + '.');
  if (s.teams.length < 2 || s.teams.length > 10) problems.push('Choose between 2 and 10 teams.');
  if (s.squad.min > s.squad.max) problems.push('Minimum squad size is larger than the maximum.');
  if (s.squad.min < pack.lineupSize) warnings.push(`Minimum squad is below ${pack.lineupSize}: teams may not be able to field a full ${pack.labels.lineup}.`);
  const roleMinTotal = Object.values(s.squad.roleMins || {}).filter(r => r.on).reduce((a, r) => a + r.min, 0);
  if (roleMinTotal > s.squad.max) problems.push('Role requirements add up to more than the maximum squad size.');
  const need = s.teams.length * s.squad.min;
  if (poolSize !== undefined && poolSize < need) problems.push(`Only ${poolSize} players match your filters, but ${s.teams.length} teams x ${s.squad.min} minimum squad = ${need}.`);
  if (s.pool.count < need) warnings.push(`Players to auction (${s.pool.count}) is below teams x min squad (${need}).`);
  if (!s.bots.allowed && s.teams.some(t => t.type === 'bot')) problems.push('Bots are switched off but some seats are set to Bot.');
  if (s.timer < 3) problems.push('Bid timer must be at least 3 seconds.');
  return { problems, warnings };
}

export const BUILTIN_PRESETS = [
  { id: 'mega', name: 'Mega Auction (default)', patch: {} },
  { id: 'quick', name: 'Quick 15-minute game', patch: { teamCount: 4, squad: { min: 11, max: 13, overseasMax: 5 }, pool: { count: 60, selection: 'top' }, timer: 6, order: 'marquee', secondRound: false } },
  { id: 'school', name: 'School Rules (50 Cr, no limits)', patch: { purse: 50, squad: { min: 11, max: 15, overseasOn: false }, timer: 8, order: 'shuffled', pricing: { incMode: 'fixed', incFixed: 0.25 } } },
  { id: 'legends', name: 'Legends Only (retired players)', patch: { pool: { includeRetired: true, onlyRetired: true, count: 90 }, order: 'marquee' } },
  { id: 'retention', name: 'Retention + RTM', patch: { retention: { on: true, max: 3 }, rtm: { on: true, cards: 2 } } },
];
