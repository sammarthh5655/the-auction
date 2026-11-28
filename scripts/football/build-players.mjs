#!/usr/bin/env node
/**
 * Football sport pack - player database builder.
 *
 * Source (public, CC0): "transfermarkt-datasets" by dcaribou - https://github.com/dcaribou/transfermarkt-datasets
 *   players.csv.gz, appearances.csv.gz (one row per player per match: minutes, goals, assists, cards),
 *   games.csv.gz (scores), competitions.csv.gz, clubs.csv.gz. Snapshot current to July 2026.
 * Player photo URLs in the dataset are deliberately NOT used.
 *
 * Ratings use only real match data, weighted by competition strength (table below):
 *   attacking  = goals per 90 + goals volume          creativity = assists per 90 + assists volume
 *   defending  = team clean-sheet rate + goals conceded in matches the player started
 *   winning    = team points per game in his matches  experience = weighted minutes
 * Market value is shown on cards but never used for the rating.
 *
 * Usage:  node scripts/football/build-players.mjs [--refresh] [--offline] [--top]
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { buildFootballCharacter } from './traits-defaults.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RAW = path.join(ROOT, 'data-raw', 'football');
const OUT = path.join(ROOT, 'public', 'data', 'football', 'players.json');
const TRAITS = path.join(ROOT, 'data', 'football', 'traits.json');
const OVERRIDES = path.join(ROOT, 'data', 'football', 'overrides.json');
const BASE_URL = 'https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data/';
const TABLES = ['players', 'appearances', 'games', 'competitions', 'clubs'];
const args = new Set(process.argv.slice(2));
const log = (...a) => console.log('[football-data]', ...a);

/** Competition strength (1.0 = Premier League). Anything not listed falls back by type. */
export const STRENGTH = {
  GB1: 1.0, ES1: 0.97, L1: 0.94, IT1: 0.94, FR1: 0.88,
  CL: 1.12, EL: 0.92, UCOL: 0.78, USC: 1.0, CLQ: 0.6, ELQ: 0.55, ECLQ: 0.5,
  FIWC: 1.08, EURO: 1.04, COPA: 1.0, AFCN: 0.85, AFAC: 0.72,
  PO1: 0.8, NL1: 0.78, BRA1: 0.8, BE1: 0.74, TR1: 0.72, RU1: 0.72, ARG1: 0.74, MEX1: 0.7, SA1: 0.68,
  MLS1: 0.66, UKR1: 0.66, A1: 0.66, SC1: 0.64, C1: 0.64, GR1: 0.64, DK1: 0.62, JAP1: 0.62, KR1: 0.6,
  TS1: 0.6, PL1: 0.6, RSK1: 0.6, SER1: 0.58, NO1: 0.58, SE1: 0.58, RO1: 0.56, AUS1: 0.56,
  FAC: 0.75, CDR: 0.75, DFB: 0.75, CIT: 0.75, GBCS: 0.8, SUC: 0.8, SCI: 0.8, DFL: 0.8, FRCH: 0.75,
};
const strength = (id, type) => STRENGTH[id] ?? (type === 'domestic_cup' ? 0.55 : type === 'other' ? 0.5 : 0.55);
const BIG5 = new Set(['GB1', 'ES1', 'L1', 'IT1', 'FR1']);
const ROLE = { Goalkeeper: 'GK', Defender: 'DEF', Midfield: 'MID', Attack: 'FWD' };

async function ensure(t) {
  const p = path.join(RAW, `${t}.csv.gz`);
  if (fs.existsSync(p) && !args.has('--refresh')) return p;
  if (args.has('--offline')) throw new Error(`Missing ${p} and --offline was given`);
  fs.mkdirSync(RAW, { recursive: true });
  log('downloading', t);
  const res = await fetch(BASE_URL + `${t}.csv.gz`);
  if (!res.ok) throw new Error(`Download failed ${res.status} for ${t}`);
  fs.writeFileSync(p, Buffer.from(await res.arrayBuffer()));
  return p;
}

function parseLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

async function eachRow(file, fn) {
  const rl = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  let head = null;
  for await (const line of rl) {
    if (!line) continue;
    const row = parseLine(line);
    if (!head) { head = row; continue; }
    const o = {}; head.forEach((h, i) => { o[h] = row[i]; });
    fn(o);
  }
}

function percentileFn(values) {
  const s = [...values].sort((a, b) => a - b);
  return v => {
    if (!s.length) return 50;
    let lo = 0, hi = s.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (s[m] < v) lo = m + 1; else hi = m; }
    let hi2 = lo; while (hi2 < s.length && s[hi2] === v) hi2++;
    return 100 * ((lo + hi2) / 2) / s.length;
  };
}
const r1 = x => Math.round(x * 10) / 10;
const r2 = x => Math.round(x * 100) / 100;

async function main() {
  const files = {};
  for (const t of TABLES) files[t] = await ensure(t);

  const comps = {};
  await eachRow(files.competitions, c => { comps[c.competition_id] = { name: c.name, type: c.type, sub: c.sub_type, country: c.country_name }; });
  const clubs = {};
  await eachRow(files.clubs, c => { clubs[c.club_id] = c.name; });
  const games = new Map();
  await eachRow(files.games, g => {
    games.set(g.game_id, { comp: g.competition_id, home: g.home_club_id, away: g.away_club_id, hg: +g.home_club_goals, ag: +g.away_club_goals, season: +g.season });
  });
  log(`games: ${games.size}`);

  const agg = new Map();
  const A = id => {
    let a = agg.get(id);
    if (!a) {
      a = { apps: 0, starts: 0, min: 0, wMin: 0, goals: 0, assists: 0, wGoals: 0, wAssists: 0, yellow: 0, red: 0,
        csStarts: 0, wCs: 0, concStarts: 0, wConc: 0, wStartW: 0, pts: 0, wPts: 0, ptsGames: 0, wPtsW: 0,
        seasons: new Set(), clubs: {}, last: '', first: '', big5Min: 0,
        split: { big5: { apps: 0, min: 0, goals: 0, assists: 0 }, cl: { apps: 0, min: 0, goals: 0, assists: 0 }, intl: { apps: 0, min: 0, goals: 0, assists: 0 } } };
      agg.set(id, a);
    }
    return a;
  };
  let rows = 0;
  await eachRow(files.appearances, r => {
    rows++;
    const g = games.get(r.game_id); if (!g) return;
    const comp = comps[g.comp] || {};
    const W = strength(g.comp, comp.type);
    const min = +r.minutes_played || 0;
    const a = A(r.player_id);
    const goals = +r.goals || 0, assists = +r.assists || 0;
    a.apps++; a.min += min; a.wMin += min * W;
    a.goals += goals; a.assists += assists; a.wGoals += goals * W; a.wAssists += assists * W;
    a.yellow += +r.yellow_cards || 0; a.red += +r.red_cards || 0;
    a.seasons.add(g.season);
    if (!a.last || r.date > a.last) a.last = r.date;
    if (!a.first || r.date < a.first) a.first = r.date;
    if (r.player_club_id) a.clubs[r.player_club_id] = (a.clubs[r.player_club_id] || 0) + 1;
    const home = r.player_club_id === g.home;
    const scored = home ? g.hg : g.ag, conceded = home ? g.ag : g.hg;
    if (min >= 45 && Number.isFinite(scored)) {
      const p = scored > conceded ? 3 : scored === conceded ? 1 : 0;
      a.pts += p; a.wPts += p * W; a.ptsGames++; a.wPtsW += W;
    }
    if (min >= 60 && Number.isFinite(conceded)) {
      a.starts++; a.concStarts += conceded; a.wConc += conceded / W; a.wStartW += W;
      if (conceded === 0) { a.csStarts++; a.wCs += W; }
    }
    const sp = BIG5.has(g.comp) ? a.split.big5 : g.comp === 'CL' ? a.split.cl : comp.type === 'national_team_competition' ? a.split.intl : null;
    if (BIG5.has(g.comp)) a.big5Min += min;
    if (sp) { sp.apps++; sp.min += min; sp.goals += goals; sp.assists += assists; }
  });
  log(`appearances: ${rows}, players with minutes: ${agg.size}`);

  const traits = fs.existsSync(TRAITS) ? JSON.parse(fs.readFileSync(TRAITS, 'utf8')) : {};
  const overrides = fs.existsSync(OVERRIDES) ? JSON.parse(fs.readFileSync(OVERRIDES, 'utf8')) : {};
  delete traits._comment; delete overrides._comment;
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const traitsByName = Object.fromEntries(Object.entries(traits).map(([k, v]) => [norm(k), v]));

  // ---- pool: real, meaningful careers in serious competitions
  const pool = [];
  await eachRow(files.players, p => {
    const a = agg.get(p.player_id); if (!a) return;
    const role = ROLE[p.position]; if (!role) return;
    const curated = !!traitsByName[norm(p.name)];
    // ~2,000 players: real top-level careers (big-5 leagues), long careers elsewhere, or hand-styled stars
    if (!((a.big5Min >= 7000 && a.wMin >= 7000) || a.wMin >= 22000 || (curated && a.wMin >= 1500))) return;
    pool.push({ p, a, role });
  });
  log(`pool: ${pool.length} players`);

  // ---- metrics (league-weighted, small samples shrunk to the position mean)
  for (const x of pool) {
    const { a } = x;
    const n90 = a.wMin / 90;
    x.m = {
      g90: (a.wGoals) / Math.max(1, n90), a90: a.wAssists / Math.max(1, n90),
      csRate: a.starts ? a.wCs / Math.max(1, a.wStartW) : 0,
      concAdj: a.starts ? a.wConc / a.starts : 2,
      ppg: a.ptsGames ? a.wPts / Math.max(1, a.wPtsW) * (a.wPtsW / a.ptsGames) : 0,
      wMin: a.wMin, wGoals: a.wGoals, wAssists: a.wAssists,
    };
  }
  const byRole = r => pool.filter(x => x.role === r);
  const means = {};
  for (const r of ['GK', 'DEF', 'MID', 'FWD']) {
    const g = byRole(r);
    means[r] = { g90: g.reduce((s, x) => s + x.m.g90, 0) / g.length, a90: g.reduce((s, x) => s + x.m.a90, 0) / g.length };
  }
  for (const x of pool) {
    const k = 12, n90 = x.a.wMin / 90, mu = means[x.role];
    x.m.g90s = (x.m.g90 * n90 + mu.g90 * k) / (n90 + k);
    x.m.a90s = (x.m.a90 * n90 + mu.a90 * k) / (n90 + k);
    const ks = 15, st = x.a.starts;
    x.m.csS = (x.m.csRate * st + 0.3 * ks) / (st + ks);
    x.m.concS = (x.m.concAdj * st + 1.3 * ks) / (st + ks);
  }
  const P = {};
  for (const r of ['GK', 'DEF', 'MID', 'FWD']) {
    const g = byRole(r);
    P[r] = {
      g90: percentileFn(g.map(x => x.m.g90s)), a90: percentileFn(g.map(x => x.m.a90s)),
      goals: percentileFn(g.map(x => x.m.wGoals)), assists: percentileFn(g.map(x => x.m.wAssists)),
      cs: percentileFn(g.map(x => x.m.csS)), conc: percentileFn(g.map(x => -x.m.concS)),
      ppg: percentileFn(g.map(x => x.m.ppg)), min: percentileFn(g.map(x => x.m.wMin)),
    };
  }
  const W = {
    FWD: { attacking: 0.5, creativity: 0.18, winning: 0.17, experience: 0.15, defending: 0 },
    MID: { attacking: 0.25, creativity: 0.32, winning: 0.18, experience: 0.13, defending: 0.12 },
    DEF: { attacking: 0.06, creativity: 0.1, winning: 0.2, experience: 0.18, defending: 0.46 },
    GK: { attacking: 0, creativity: 0, winning: 0.22, experience: 0.18, defending: 0.6 },
  };
  for (const x of pool) {
    const p = P[x.role], m = x.m;
    const c = {
      attacking: 0.65 * p.g90(m.g90s) + 0.35 * p.goals(m.wGoals),
      creativity: 0.65 * p.a90(m.a90s) + 0.35 * p.assists(m.wAssists),
      defending: 0.5 * p.cs(m.csS) + 0.5 * p.conc(-m.concS),
      winning: p.ppg(m.ppg),
      experience: p.min(m.wMin),
    };
    x.c = c;
    // finer weights by sub-position: holding midfielders are judged on defence + winning, wingers on creating too
    const sub = x.p.sub_position || '';
    const weights = /Defensive Midfield/.test(sub) ? { attacking: 0.08, creativity: 0.14, winning: 0.26, experience: 0.17, defending: 0.35 }
      : /Winger/.test(sub) ? { attacking: 0.36, creativity: 0.32, winning: 0.17, experience: 0.15, defending: 0 }
      : /Attacking Midfield/.test(sub) ? { attacking: 0.32, creativity: 0.36, winning: 0.17, experience: 0.15, defending: 0 }
      : /(Left|Right)-Back/.test(sub) ? { attacking: 0.05, creativity: 0.17, winning: 0.2, experience: 0.16, defending: 0.42 }
      : W[x.role];
    x.weights = weights;
    x.composite = Object.entries(weights).reduce((s, [k, w]) => s + w * c[k], 0);
  }
  const rolePct = {};
  for (const r of ['GK', 'DEF', 'MID', 'FWD']) rolePct[r] = percentileFn(byRole(r).map(x => x.composite));
  // OVR on a bell curve (FIFA-like): 67 + 12 x standard deviations above the position average
  const roleStats = {};
  for (const r of ['GK', 'DEF', 'MID', 'FWD']) {
    const v = byRole(r).map(x => x.composite);
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    roleStats[r] = { mean, sd: Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length) || 1 };
  }

  const out = [];
  const used = new Set();
  for (const x of pool) {
    const { p, a, role } = x;
    const ov = overrides[p.player_id] || overrides[p.name] || {};
    const pct = rolePct[role](x.composite);
    const ovr = Math.max(30, Math.min(99, Math.round(67 + 12 * (x.composite - roleStats[role].mean) / roleStats[role].sd)));
    const years = [...a.seasons].sort();
    const t = traitsByName[norm(p.name)] || null;
    if (t) used.add(norm(p.name));
    const country = ov.country || p.country_of_citizenship || p.country_of_birth || 'Unknown';
    const lastSeason = +p.last_season || years[years.length - 1];
    const status = ov.status || (lastSeason >= 2025 ? 'active' : 'retired');
    const topClubs = Object.entries(a.clubs).sort((q, w) => w[1] - q[1]).slice(0, 4).map(([id]) => clubs[id]).filter(Boolean);
    const per90 = (v, m) => (m >= 90 ? r2((v * 90) / m) : null);
    const split = s => (s.apps ? { apps: s.apps, min: s.min, goals: s.goals, assists: s.assists, ga90: per90(s.goals + s.assists, s.min) } : null);
    out.push({
      id: p.player_id,
      name: ov.name || p.name,
      short: p.name,
      role,
      subPosition: p.sub_position || null,
      country,
      overseas: false,
      status,
      dob: p.date_of_birth ? p.date_of_birth.slice(0, 10) : null,
      years: [years[0] + 0, lastSeason],
      foot: p.foot || null,
      heightCm: +p.height_in_cm || null,
      famous: !!t,
      big5: a.big5Min >= 2500,
      ovr,
      marketValue: +p.market_value_in_eur || null,
      peakValue: +p.highest_market_value_in_eur || null,
      rating: {
        attacking: Math.round(x.c.attacking), creativity: Math.round(x.c.creativity), defending: Math.round(x.c.defending),
        winning: Math.round(x.c.winning), experience: Math.round(x.c.experience),
        composite: r1(x.composite), rolePct: Math.round(pct), weights: x.weights,
        detail: { g90: r2(x.m.g90s), a90: r2(x.m.a90s), csRate: Math.round(100 * x.m.csS), conc: r2(x.m.concS), ppg: r2(x.m.ppg) },
      },
      stats: {
        career: {
          apps: a.apps, starts: a.starts, min: a.min, goals: a.goals, assists: a.assists,
          ga90: per90(a.goals + a.assists, a.min), g90: per90(a.goals, a.min), yellow: a.yellow, red: a.red,
          cleanSheets: a.csStarts, concededPerStart: a.starts ? r2(a.concStarts / a.starts) : null,
          winPct: a.ptsGames ? Math.round((100 * (a.pts / 3)) / a.ptsGames) : null,
          span: `${years[0]}-${lastSeason}`, seasons: a.seasons.size,
          caps: +p.international_caps || null, intlGoals: +p.international_goals || null,
        },
        big5: split(a.split.big5), cl: split(a.split.cl), intl: split(a.split.intl),
      },
      teams: topClubs,
      character: buildFootballCharacter({ id: p.player_id, name: p.name, country, role, foot: p.foot, heightCm: +p.height_in_cm, traits: t }),
      customImage: ov.customImage || t?.customImage || null,
      customModel: ov.customModel || t?.customModel || null,
    });
  }
  const missing = Object.keys(traitsByName).filter(k => !used.has(k));
  if (missing.length) log('WARNING traits with no matching player:', missing.join(', '));
  out.sort((x, y) => y.ovr - x.ovr || y.rating.composite - x.rating.composite);
  const meta = {
    sport: 'football', generatedAt: new Date().toISOString(),
    sources: { matches: `transfermarkt-datasets (CC0) - ${rows} player-match rows, ${games.size} games`, license: 'CC0 1.0 - github.com/dcaribou/transfermarkt-datasets' },
    latestMatch: [...agg.values()].reduce((m, a) => (a.last > m ? a.last : m), ''),
    count: out.length,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ meta, players: out }));
  log(`wrote ${out.length} players -> ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB), curated ${used.size}`);
  if (args.has('--top')) {
    for (const r of ['FWD', 'MID', 'DEF', 'GK']) console.log(r, out.filter(p => p.role === r).slice(0, 14).map(p => `${p.name} ${p.ovr}`).join(', '));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
