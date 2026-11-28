/**
 * FOOTBALL SPORT PACK - same interface as src/sports/cricket/pack.js; the auction engine, rooms,
 * bots and host settings are shared. Data: public/data/football/players.json (scripts/football/).
 */
import { clamp, sum } from '../../engine/util.js';
import { valueScore } from '../../engine/rules.js';

const ROLES = [
  { key: 'GK', label: 'Goalkeeper', plural: 'Goalkeepers', color: '#ffd54f', icon: '🧤' },
  { key: 'DEF', label: 'Defender', plural: 'Defenders', color: '#4fb3ff', icon: '🛡️' },
  { key: 'MID', label: 'Midfielder', plural: 'Midfielders', color: '#ffb547', icon: '🎯' },
  { key: 'FWD', label: 'Forward', plural: 'Forwards', color: '#ff6b6b', icon: '⚡' },
];
const n = v => (v === null || v === undefined ? '—' : typeof v === 'number' ? v.toLocaleString('en-GB') : v);
const pct = v => (v === null || v === undefined ? '—' : `${v}%`);
const money = v => (!v ? '—' : v >= 1e6 ? `€${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M` : `€${Math.round(v / 1e3)}K`);

// ---------------------------------------------------------------- lineup evaluation (formation aware)
const top = (vals, w) => { const v = vals.slice().sort((a, b) => b - a); return sum(w.map((x, i) => x * (v[i] || 0))) / sum(w); };
const attackVal = p => 0.7 * p.rating.attacking + 0.3 * p.rating.creativity;
const midVal = p => 0.45 * p.rating.creativity + 0.25 * p.rating.winning + 0.15 * p.rating.attacking + 0.15 * p.rating.defending;
const defVal = p => 0.75 * p.rating.defending + 0.25 * p.rating.winning;

function evaluateLineup(players) {
  const xi = players.slice(0, 11);
  const by = r => xi.filter(p => p.role === r);
  const gk = by('GK'), def = by('DEF'), mid = by('MID'), fwd = by('FWD');
  const star = sum(xi.map(p => p.ovr)) / 11;
  // attack: forwards first, attacking mids help; midfield: mids (others at half value); defence: defenders
  const attack = top([...fwd.map(attackVal), ...mid.map(p => attackVal(p) * 0.85)], [1, 0.9, 0.75]);
  const midfield = top([...mid.map(midVal), ...fwd.map(p => midVal(p) * 0.6), ...def.map(p => midVal(p) * 0.6)], [1, 0.95, 0.85]);
  const defence = top([...def.map(defVal), ...mid.map(p => defVal(p) * 0.6)], [1, 1, 0.95, 0.9]);
  const keeper = gk.length ? Math.max(...gk.map(p => 0.75 * p.rating.defending + 0.25 * p.ovr)) : 0;
  const issues = [];
  let balance = 100;
  const missing = 11 - xi.length;
  if (missing > 0) { balance -= 9 * missing; issues.push(`Only ${xi.length} players - ${missing} empty slot${missing > 1 ? 's' : ''}`); }
  if (!gk.length) { balance -= 50; issues.push('No goalkeeper'); }
  if (gk.length > 1) { balance -= 15 * (gk.length - 1); issues.push(`${gk.length} goalkeepers in the XI`); }
  if (def.length < 3) { balance -= 15 * (3 - def.length); issues.push(`Only ${def.length} defender${def.length === 1 ? '' : 's'}`); }
  if (def.length > 5) { balance -= 6 * (def.length - 5); issues.push(`${def.length} defenders - very defensive`); }
  if (mid.length < 2) { balance -= 12 * (2 - mid.length); issues.push(`Only ${mid.length} midfielder${mid.length === 1 ? '' : 's'}`); }
  if (!fwd.length && mid.length < 5) { balance -= 15; issues.push('No forward'); }
  if (fwd.length > 4) { balance -= 6 * (fwd.length - 4); issues.push(`${fwd.length} forwards - no shape`); }
  balance = clamp(balance, 0, 100);
  const cats = [
    { key: 'star', label: 'XI Rating', weight: 0.3, score: star, hint: 'Average OVR of the starting XI' },
    { key: 'attack', label: 'Attack', weight: 0.2, score: attack, hint: 'Best three attackers: goals + chance creation' },
    { key: 'midfield', label: 'Midfield', weight: 0.15, score: midfield, hint: 'Best three midfielders: creating, winning, covering' },
    { key: 'defence', label: 'Defence', weight: 0.15, score: defence, hint: 'Best back four: clean sheets + goals conceded' },
    { key: 'keeper', label: 'Goalkeeper', weight: 0.1, score: keeper, hint: 'Best goalkeeper in the XI' },
    { key: 'balance', label: 'Shape & Balance', weight: 0.1, score: balance, hint: 'Penalties for a missing keeper or a broken formation' },
  ];
  const formation = `${def.length}-${mid.length}-${fwd.length}`;
  return { total: sum(cats.map(c => c.weight * c.score)), cats, issues, formation };
}

const FORMATIONS = [[4, 3, 3], [4, 4, 2], [4, 5, 1], [3, 5, 2], [3, 4, 3], [5, 3, 2], [4, 2, 4]];
function autoPickLineup(squad) {
  if (squad.length <= 11) return order(squad).map(p => p.id);
  const by = r => squad.filter(p => p.role === r).sort((a, b) => b.ovr - a.ovr);
  let best = null;
  for (const [d, m, f] of FORMATIONS) {
    const xi = [...by('GK').slice(0, 1), ...by('DEF').slice(0, d), ...by('MID').slice(0, m), ...by('FWD').slice(0, f)];
    // short of a position? fill with the best remaining players
    for (const p of squad.slice().sort((a, b) => b.ovr - a.ovr)) { if (xi.length >= 11) break; if (!xi.includes(p) && !(p.role === 'GK' && xi.some(x => x.role === 'GK'))) xi.push(p); }
    const s = evaluateLineup(xi).total;
    if (!best || s > best.s) best = { s, xi };
  }
  return order(best.xi).map(p => p.id);
}
const ORDER = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
const order = list => list.slice().sort((a, b) => ORDER[a.role] - ORDER[b.role] || b.ovr - a.ovr);

// ---------------------------------------------------------------- pack
const football = {
  id: 'football',
  name: 'Football',
  emoji: '⚽',
  available: true,
  tagline: 'Club transfer auction - real stats from Europe\'s top leagues',
  homeBlurb: 'Real players from Europe\'s top leagues since 2012, rated from 1.9 million real match appearances.',
  dataUrl: 'data/football/players.json',
  sourceNote: 'Source: transfermarkt-datasets (CC0) - real appearances, minutes, goals, assists and match results since 2012.',
  domestic: null, // no overseas quota in football: everyone is eligible
  labels: { domestic: 'Home-grown', overseas: 'Foreign', league: 'League', lineup: 'Starting XI', squad: 'Squad', retired: 'Retired / legend', team: 'club' },
  currency: { symbol: '€', big: 'M', small: 'K', bigFactor: 1000 },
  theme: { accent: '#7cf2a4', accent2: '#3dd6ff', stage: '#07140f', glow: '#9dffc4', pitch: '#13361f' },
  roles: ROLES,
  lineupSize: 11,
  eras: [
    { key: 'e1', label: '2012-2015', from: 2012, to: 2015 },
    { key: 'e2', label: '2016-2019', from: 2016, to: 2019 },
    { key: 'e3', label: '2020-2023', from: 2020, to: 2023 },
    { key: 'e4', label: '2024-2026', from: 2024, to: 2026 },
  ],
  extraFilters: [
    { key: 'big5Only', label: "Only players with a big-5 league career", default: false, test: (p, on) => !on || p.big5 },
  ],
  defaults: {
    purse: 200,
    squad: { min: 15, max: 20, overseasOn: false, overseasMax: 8, lineupOverseasMax: 11,
      roleMins: { GK: { on: false, min: 1 }, DEF: { on: false, min: 4 }, MID: { on: false, min: 3 }, FWD: { on: false, min: 2 } } },
    pool: { count: 140 },
  },
  purseHint: 'Minimum 50, recommended 200, no upper limit.',
  sorts: [
    { value: 'goals', label: 'Goals', score: p => p.stats.career.goals || 0 },
    { value: 'assists', label: 'Assists', score: p => p.stats.career.assists || 0 },
    { value: 'cs', label: 'Clean sheets', score: p => p.stats.career.cleanSheets || 0 },
  ],
  referencePurse: 100,
  baseSlab(p) { const o = valueScore(p); return o >= 90 ? 4000 : o >= 84 ? 3000 : o >= 78 ? 2000 : o >= 70 ? 1500 : o >= 60 ? 1000 : o >= 50 ? 500 : 250; },
  incrementTiers: [{ upTo: 2000, inc: 100 }, { upTo: 5000, inc: 250 }, { upTo: 10000, inc: 500 }, { upTo: 25000, inc: 1000 }, { upTo: Infinity, inc: 2000 }],
  retentionSlabs: [16, 12, 9, 7, 5, 4],
  auctionSets: ['FWD', 'MID', 'DEF', 'GK'],
  roleTargets: { GK: 0.1, DEF: 0.33, MID: 0.3, FWD: 0.27 },
  essentialRoles: { GK: 1, DEF: 4, MID: 3, FWD: 2 },
  roleCaps: { GK: 2 },
  isMarquee: p => valueScore(p) >= 90 || (p.famous && p.status === 'retired' && valueScore(p) >= 75),
  cardSubtitle: p => p.subPosition || null,

  keyStats(p) {
    const s = p.stats.career;
    if (p.role === 'GK') return [{ label: 'Clean sheets', value: n(s.cleanSheets) }, { label: 'Conceded/gm', value: s.concededPerStart ?? '—' }, { label: 'Apps', value: n(s.apps) }, { label: 'Win %', value: pct(s.winPct) }];
    if (p.role === 'DEF') return [{ label: 'Apps', value: n(s.apps) }, { label: 'Clean sheets', value: n(s.cleanSheets) }, { label: 'Goals', value: n(s.goals) }, { label: 'Win %', value: pct(s.winPct) }];
    if (p.role === 'MID') return [{ label: 'Assists', value: n(s.assists) }, { label: 'Goals', value: n(s.goals) }, { label: 'Apps', value: n(s.apps) }, { label: 'Win %', value: pct(s.winPct) }];
    return [{ label: 'Goals', value: n(s.goals) }, { label: 'Assists', value: n(s.assists) }, { label: 'G+A /90', value: s.ga90 ?? '—' }, { label: 'Apps', value: n(s.apps) }];
  },
  revealStats(p) {
    const s = p.stats.career;
    const out = [{ label: 'Appearances', value: n(s.apps) }];
    if (p.role === 'GK') out.push({ label: 'Clean sheets', value: n(s.cleanSheets) }, { label: 'Conceded / game', value: s.concededPerStart ?? '—' });
    else out.push({ label: 'Goals', value: n(s.goals) }, { label: 'Assists', value: n(s.assists) });
    if (p.role === 'DEF') out.push({ label: 'Clean sheets', value: n(s.cleanSheets) });
    out.push({ label: 'Win rate', value: pct(s.winPct) });
    if (s.caps) out.push({ label: 'Caps', value: n(s.caps) });
    else if (p.peakValue) out.push({ label: 'Peak value', value: money(p.peakValue) });
    return out.slice(0, 6);
  },
  detailSections(p) {
    const c = p.stats.career;
    const block = (title, s) => s && { title, rows: [['Appearances', n(s.apps)], ['Minutes', n(s.min)], ['Goals', n(s.goals)], ['Assists', n(s.assists)], ['G+A per 90', s.ga90 ?? '—']] };
    return [
      {
        title: 'Career (since 2012)',
        groups: [
          { title: 'Playing', rows: [['Appearances', n(c.apps)], ['Starts (60+ min)', n(c.starts)], ['Minutes', n(c.min)], ['Seasons', `${c.seasons} (${c.span})`], ['Win rate', pct(c.winPct)]] },
          { title: 'Attacking', rows: [['Goals', n(c.goals)], ['Assists', n(c.assists)], ['Goals per 90', c.g90 ?? '—'], ['G+A per 90', c.ga90 ?? '—']] },
          { title: 'Defending & more', rows: [['Clean sheets (team)', n(c.cleanSheets)], ['Conceded per start', c.concededPerStart ?? '—'], ['Yellow / red', `${c.yellow} / ${c.red}`], ['Caps / intl goals', `${n(c.caps)} / ${n(c.intlGoals)}`], ['Market value (peak)', `${money(p.marketValue)} (${money(p.peakValue)})`]] },
        ],
      },
      { title: 'By competition', groups: [block('Big-5 leagues', p.stats.big5), block('Champions League', p.stats.cl), block('International tournaments', p.stats.intl)].filter(Boolean) },
    ];
  },
  ratingBreakdown(p) {
    const r = p.rating, d = r.detail, w = r.weights || {};
    const labels = { attacking: 'Attacking', creativity: 'Creativity', defending: p.role === 'GK' ? 'Goalkeeping (team defence)' : 'Defending (team defence)', winning: 'Winning', experience: 'Experience' };
    return {
      components: Object.entries(w).filter(([, x]) => x > 0).map(([k, x]) => ({ label: labels[k], value: r[k], weight: x })),
      composite: r.composite, rolePct: r.rolePct,
      inputs: [
        { group: 'Attacking & creating', items: [['Goals per 90 (league-weighted)', d.g90], ['Assists per 90 (league-weighted)', d.a90], ['Attacking score', r.attacking], ['Creativity score', r.creativity]],
          formula: 'Each = 0.65 x per-90 percentile + 0.35 x career-total percentile' },
        { group: 'Defending & winning', items: [['Team clean-sheet rate in his starts', `${d.csRate}%`], ['Goals conceded per start (league-adj.)', d.conc], ['Points per game (league-weighted)', d.ppg], ['Experience (weighted minutes) pct', r.experience]],
          formula: 'Defending = 0.5 x clean-sheet pct + 0.5 x conceded pct' },
      ],
      note: 'Every stat is weighted by competition strength (Premier League = 1.0, Champions League 1.12, Saudi Pro League 0.68 ...) and ' +
        'small samples are shrunk towards the position average. Percentiles compare him with every player in his position. ' +
        `OVR = 67 + 12 x (standard deviations above his position average): a bell curve, so 90+ is rare. Sub-position (${p.subPosition || p.role}) sets the weights. Market value is never used.`,
    };
  },
  evaluateLineup,
  autoPickLineup,
  loadCharacter: () => import('./FootballCharacter.jsx'),
  poses: ['shoot', 'dribble', 'pass', 'header', 'bicycle-kick', 'knee-slide', 'siu-jump', 'arms-wide', 'free-kick', 'keeper-dive', 'keeper-catch', 'tackle', 'arms-crossed'],
};
export default football;
