/**
 * CRICKET SPORT PACK
 * Everything cricket-specific lives in src/sports/cricket. The auction engine, rooms, bots,
 * host settings and bidding only talk to a pack through the fields documented in
 * src/sports/README.md. Keep this file free of React/three imports so Node scripts can use it.
 */
import { clamp, sum } from '../../engine/util.js';
import { valueScore } from '../../engine/rules.js';

const ROLES = [
  { key: 'BAT', label: 'Batter', plural: 'Batters', color: '#4fb3ff', icon: '🏏' },
  { key: 'WK', label: 'Wicketkeeper', plural: 'Wicketkeepers', color: '#b388ff', icon: '🧤' },
  { key: 'AR', label: 'All-rounder', plural: 'All-rounders', color: '#ffb547', icon: '⚡' },
  { key: 'BOWL', label: 'Bowler', plural: 'Bowlers', color: '#4dd9a6', icon: '🎯' },
];

const n = v => (v === null || v === undefined ? '—' : typeof v === 'number' ? v.toLocaleString('en-IN') : v);
const fx = (v, d = 2) => (v === null || v === undefined ? '—' : Number(v).toFixed(d));

// ---------------------------------------------------------------- lineup evaluation
const BAT_W = [1, 1, 0.95, 0.9, 0.8, 0.65, 0.5];
const BOWL_W = [1, 1, 0.95, 0.9, 0.85, 0.35];
function weighted(values, weights) {
  const v = values.slice().sort((a, b) => b - a);
  return sum(weights.map((w, i) => w * (v[i] || 0))) / sum(weights);
}

function evaluateLineup(players, settings) {
  const size = 11;
  const xi = players.slice(0, size);
  const r = p => p.rating;
  const star = sum(xi.map(p => p.ovr)) / size;
  const batting = weighted(xi.map(p => r(p).batting), BAT_W);
  const bowlers = xi.filter(p => p.role === 'BOWL' || p.role === 'AR' || r(p).bowling >= 35);
  const bowling = weighted(bowlers.map(p => r(p).bowling), BOWL_W);
  const arVals = xi.map(p => Math.sqrt(Math.max(0, r(p).batting) * Math.max(0, r(p).bowling)));
  const allround = clamp(weighted(arVals, [0.5, 0.3, 0.2]) * 1.15, 0, 100);
  const keepers = xi.filter(p => p.role === 'WK');
  const keeperBest = keepers.map(p => ({ p, v: 0.55 * r(p).keeping + 0.45 * r(p).batting })).sort((a, b) => b.v - a.v)[0];
  const keeper = keeperBest ? keeperBest.v : 0;

  const issues = [];
  let balance = 100;
  const missing = size - xi.length;
  if (missing > 0) { balance -= 9 * missing; issues.push(`Only ${xi.length} players - ${missing} empty slot${missing > 1 ? 's' : ''}`); }
  if (!keepers.length) { balance -= 40; issues.push('No wicketkeeper'); }
  const bowlOpts = bowlers.length;
  if (bowlOpts < 5) { balance -= 12 * (5 - bowlOpts); issues.push(`Only ${bowlOpts} bowling option${bowlOpts === 1 ? '' : 's'} (need 5)`); }
  const batOpts = xi.filter(p => p.role !== 'BOWL').length;
  if (batOpts < 6) { balance -= 8 * (6 - batOpts); issues.push(`Thin batting: ${batOpts} specialist batting options`); }
  const pureBowlers = xi.filter(p => p.role === 'BOWL').length;
  if (pureBowlers > 6) { balance -= 6 * (pureBowlers - 6); issues.push(`${pureBowlers} specialist bowlers - long tail`); }
  const os = xi.filter(p => p.overseas).length;
  const osMax = settings?.squad?.lineupOverseasMax ?? 4;
  if (settings?.squad?.overseasOn !== false && os > osMax) { balance -= 20 * (os - osMax); issues.push(`${os} overseas players (max ${osMax})`); }
  balance = clamp(balance, 0, 100);

  const cats = [
    { key: 'star', label: 'XI Rating', weight: 0.3, score: star, hint: 'Average OVR of the Playing XI' },
    { key: 'batting', label: 'Batting Depth', weight: 0.2, score: batting, hint: 'Top-7 batting scores, weighted by order' },
    { key: 'bowling', label: 'Bowling Depth', weight: 0.2, score: bowling, hint: 'Best 5 bowling options + 6th-bowler cover' },
    { key: 'allround', label: 'All-rounders', weight: 0.1, score: allround, hint: 'Players who can bat and bowl' },
    { key: 'keeper', label: 'Wicketkeeper', weight: 0.1, score: keeper, hint: 'Best keeper: keeping + batting' },
    { key: 'balance', label: 'Role Balance', weight: 0.1, score: balance, hint: 'Penalties for missing roles / limits' },
  ];
  const total = sum(cats.map(c => c.weight * c.score));
  return {
    total, cats, issues,
    highlights: {
      keeper: keeperBest?.p?.id || null,
      topBat: xi.slice().sort((a, b) => r(b).batting - r(a).batting)[0]?.id || null,
      topBowl: xi.slice().sort((a, b) => r(b).bowling - r(a).bowling)[0]?.id || null,
    },
  };
}

function autoPickLineup(squad, settings) {
  const size = 11;
  if (squad.length <= size) return squad.map(p => p.id);
  const osMax = settings?.squad?.overseasOn === false ? 99 : (settings?.squad?.lineupOverseasMax ?? 4);
  const score = ids => evaluateLineup(ids.map(id => byIdLocal[id]), settings).total;
  const byIdLocal = Object.fromEntries(squad.map(p => [p.id, p]));
  const legal = ids => ids.filter(id => byIdLocal[id].overseas).length <= osMax;
  // greedy seed: best keeper, best 5 bowlers, then best by OVR
  const chosen = [];
  const take = p => { if (p && !chosen.includes(p.id) && legal([...chosen, p.id])) chosen.push(p.id); };
  take(squad.filter(p => p.role === 'WK').sort((a, b) => b.ovr - a.ovr)[0]);
  squad.filter(p => p.role === 'BOWL' || p.role === 'AR').sort((a, b) => b.rating.bowling - a.rating.bowling).slice(0, 5).forEach(take);
  squad.slice().sort((a, b) => b.ovr - a.ovr).forEach(p => { if (chosen.length < size) take(p); });
  squad.forEach(p => { if (chosen.length < size && !chosen.includes(p.id)) chosen.push(p.id); });
  // hill-climb with single swaps
  let best = score(chosen), improved = true, guard = 0;
  while (improved && guard++ < 40) {
    improved = false;
    for (let i = 0; i < chosen.length; i++) {
      for (const p of squad) {
        if (chosen.includes(p.id)) continue;
        const trial = chosen.slice(); trial[i] = p.id;
        if (!legal(trial)) continue;
        const s = score(trial);
        if (s > best + 1e-9) { best = s; chosen.splice(0, chosen.length, ...trial); improved = true; }
      }
    }
  }
  // batting order: by batting score, keeper kept in the middle order
  return chosen.sort((a, b) => byIdLocal[b].rating.batting - byIdLocal[a].rating.batting);
}

// ---------------------------------------------------------------- pack
const cricket = {
  id: 'cricket',
  name: 'Cricket',
  emoji: '🏏',
  available: true,
  tagline: 'T20 franchise auction - real IPL & T20I stats',
  dataUrl: 'data/cricket/players.json',
  sourceNote: "Source: Cricsheet ball-by-ball data (every IPL season + men's T20Is) and Wikidata (name, birth date, country).",
  domestic: 'India',
  labels: { domestic: 'Indian', overseas: 'Overseas', league: 'IPL', lineup: 'Playing XI', squad: 'Squad', retired: 'Retired / legend', team: 'franchise' },
  homeBlurb: 'Every IPL season 2008-2026 plus T20I stars, built from Cricsheet ball-by-ball data.',
  overseasHint: 'IPL: 8 per squad, 4 in the Playing XI',
  sorts: [
    { value: 'runs', label: 'Runs', score: p => (p.stats.ipl?.runs || 0) + (p.stats.t20i?.runs || 0) },
    { value: 'wk', label: 'Wickets', score: p => (p.stats.ipl?.wk || 0) + (p.stats.t20i?.wk || 0) },
  ],
  currency: { symbol: '₹', big: 'Cr', small: 'L', bigFactor: 100 },
  theme: { accent: '#f5c542', accent2: '#ff8a3d', stage: '#08101f', glow: '#ffd76a', pitch: '#1b2b18' },
  roles: ROLES,
  lineupSize: 11,
  eras: [
    { key: 'early', label: '2008-2012', from: 2008, to: 2012 },
    { key: 'middle', label: '2013-2017', from: 2013, to: 2017 },
    { key: 'late', label: '2018-2022', from: 2018, to: 2022 },
    { key: 'modern', label: '2023-2026', from: 2023, to: 2026 },
  ],
  extraFilters: [
    { key: 'includeNonIpl', label: 'Include T20I stars who never played IPL', default: true, test: (p, on) => on || !p.nonIpl },
  ],
  // Sport-specific defaults merged into the generic settings
  defaults: {
    purse: 100,
    squad: {
      min: 12, max: 16, overseasOn: true, overseasMax: 6, lineupOverseasMax: 4,
      // Optional house rules, OFF by default: buy whoever you like - the verdict punishes an unbalanced XI.
      roleMins: { WK: { on: false, min: 1 }, BOWL: { on: false, min: 4 }, AR: { on: false, min: 1 }, BAT: { on: false, min: 3 } },
    },
  },
  referencePurse: 100, // base prices / increments below are defined for a 100 Cr purse
  /** Base price (minor units, for the reference purse) derived from the stat rating. */
  baseSlab(p) {
    const o = valueScore(p);
    return o >= 90 ? 200 : o >= 84 ? 150 : o >= 78 ? 100 : o >= 70 ? 75 : o >= 60 ? 50 : o >= 50 ? 30 : 20;
  },
  /** Tiered increments that scale with the price (reference purse, minor units = lakhs). */
  incrementTiers: [{ upTo: 100, inc: 10 }, { upTo: 200, inc: 20 }, { upTo: 500, inc: 25 }, { upTo: 1000, inc: 50 }, { upTo: Infinity, inc: 100 }],
  retentionSlabs: [16, 12, 9, 7, 5, 4], // % of purse for 1st, 2nd... retention
  auctionSets: ['BAT', 'AR', 'WK', 'BOWL'],
  /** Ideal squad share per role - used by bots to judge needs. */
  roleTargets: { BAT: 0.27, WK: 0.12, AR: 0.23, BOWL: 0.38 },
  /** What a sensible XI needs - bots chase these, nobody is forced to. */
  essentialRoles: { WK: 1, BOWL: 4, AR: 1 },
  roleCaps: { WK: 3 },
  isMarquee: p => valueScore(p) >= 88 || (p.famous && p.status === 'retired' && valueScore(p) >= 75),

  // ------------------------------------------------ display
  keyStats(p) {
    const s = p.stats.ipl || p.stats.t20i || {};
    const lbl = p.stats.ipl ? 'IPL' : 'T20I';
    const bat = [
      { label: `${lbl} Runs`, value: n(s.runs) }, { label: 'Avg', value: fx(s.avg) }, { label: 'SR', value: fx(s.sr) },
    ];
    const bowl = [
      { label: `${lbl} Wkts`, value: n(s.wk) }, { label: 'Econ', value: fx(s.econ) }, { label: 'Best', value: s.bbi || '—' },
    ];
    if (p.role === 'BOWL') return [...bowl, { label: 'Matches', value: n(s.m) }];
    if (p.role === 'AR') return [bat[0], bat[2], bowl[0], bowl[1]];
    if (p.role === 'WK') return [...bat, { label: 'Dismissals', value: n((s.ct || 0) + (s.st || 0)) }];
    return [...bat, { label: '50s/100s', value: `${s.f50 ?? 0}/${s.f100 ?? 0}` }];
  },
  /** Stats that float around the 3D reveal. */
  revealStats(p) {
    const s = p.stats.ipl || p.stats.t20i || {};
    const out = [{ label: 'Matches', value: n(s.m) }];
    if (p.role !== 'BOWL') out.push({ label: 'Runs', value: n(s.runs) }, { label: 'Strike rate', value: fx(s.sr, 1) }, { label: 'High score', value: s.hs ?? '—' });
    if (p.role === 'BOWL' || p.role === 'AR') out.push({ label: 'Wickets', value: n(s.wk) }, { label: 'Economy', value: fx(s.econ) });
    if (p.role === 'WK') out.push({ label: 'Stumpings', value: n(s.st) });
    if (s.potm) out.push({ label: 'Player of match', value: n(s.potm) });
    return out.slice(0, 6);
  },
  detailSections(p) {
    const sec = (title, s) => s && ({
      title,
      groups: [
        { title: 'Batting', rows: [['Matches', n(s.m)], ['Innings', n(s.inn)], ['Runs', n(s.runs)], ['Highest', s.hs], ['Average', fx(s.avg)], ['Strike rate', fx(s.sr)], ['100s / 50s', `${s.f100} / ${s.f50}`], ['4s / 6s', `${n(s.b4)} / ${n(s.b6)}`], ['Ducks', n(s.d0)]] },
        { title: 'Bowling', rows: [['Overs', s.overs], ['Wickets', n(s.wk)], ['Economy', fx(s.econ)], ['Average', fx(s.bavg)], ['Strike rate', fx(s.bsr, 1)], ['Best', s.bbi || '—'], ['4w / 5w', `${s.w4} / ${s.w5}`], ['Dot %', s.dotPct ?? '—'], ['Maidens', n(s.mdn)]] },
        { title: 'Fielding & more', rows: [['Catches', n(s.ct)], ['Stumpings', n(s.st)], ['Run-outs', n(s.ro)], ['Player of match', n(s.potm)], ['Seasons', `${s.seasons} (${s.span})`]] },
      ],
    });
    return [sec('IPL career', p.stats.ipl), sec('T20 International career', p.stats.t20i)].filter(Boolean);
  },
  ratingBreakdown(p) {
    const r = p.rating, d = r.detail;
    const comps = {
      BAT: [['Batting', r.batting, 0.9], ['Fielding', r.fielding, 0.1]],
      WK: [['Batting', r.batting, 0.8], ['Keeping', r.keeping, 0.2]],
      BOWL: [['Bowling', r.bowling, 0.9], ['Fielding', r.fielding, 0.1]],
      AR: [['Batting', r.batting, 0.42], ['Bowling', r.bowling, 0.42], ['Balance bonus (weaker skill)', Math.min(r.batting, r.bowling), 0.16], ['Fielding', r.fielding, 0.05]],
    }[p.role];
    return {
      components: comps.map(([label, value, weight]) => ({ label, value, weight })),
      composite: r.composite,
      rolePct: r.rolePct,
      inputs: [
        { group: 'Batting', items: [
          ['Runs (volume) percentile', d.runsPct], ['Average vs era (index ' + d.avgIdx + ') percentile', d.avgPct],
          ['Strike rate vs era (index ' + d.srIdx + ') percentile', d.srPct], ['Sample-size factor', d.batConf],
        ], formula: '(0.30 x runs + 0.30 x average + 0.40 x strike rate) x sample factor' },
        { group: 'Bowling', items: [
          ['Wickets (volume) percentile', d.wkPct], ['Economy vs era (index ' + d.econIdx + ') percentile', d.econPct],
          ['Wicket rate vs era (index ' + d.wsrIdx + ') percentile', d.wsrPct], ['Sample-size factor', d.bowlConf],
        ], formula: '(0.30 x wickets + 0.40 x economy + 0.30 x strike rate) x sample factor' },
      ],
      note: 'Percentiles compare this player with every regular batter / bowler in the pool (IPL + T20Is between full members). ' +
        'Era index: 100 = league average for the seasons he played, so 2008 and 2026 numbers are judged fairly. ' +
        'OVR = 67 + 12 x (standard deviations above the average for his role): a bell curve, so 90+ is reserved for the true greats.',
    };
  },
  roleShort: key => ROLES.find(r => r.key === key)?.key || key,

  // ------------------------------------------------ lineup + verdict
  evaluateLineup,
  autoPickLineup,

  // ------------------------------------------------ 3D character (lazy, browser only)
  loadCharacter: () => import('./CricketCharacter.jsx'),
  poses: ['cover-drive', 'helicopter', 'pull-shot', 'straight-drive', 'lofted-drive', 'scoop', 'sweep', 'upper-cut', 'switch-hit',
    'bat-raise', 'forward-defence', 'fast-bowl', 'sling-bowl', 'short-run-bowl', 'leg-spin', 'off-spin', 'keeper-crouch',
    'wicket-celebration', 'sword-celebration', 'arms-crossed'],
};

export default cricket;
