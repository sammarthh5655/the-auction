#!/usr/bin/env node
/**
 * Cricket sport pack - player database builder.
 *
 * Sources (all public, real data - no invented numbers):
 *   - Cricsheet IPL ball-by-ball JSON (every IPL season)      https://cricsheet.org/downloads/ipl_json.zip
 *   - Cricsheet men's T20 international ball-by-ball JSON     https://cricsheet.org/downloads/t20s_male_json.zip
 *   - Cricsheet people register (ids -> ESPNcricinfo keys)    https://cricsheet.org/register/people.csv
 *   - Wikidata (CC0) for full name, date of birth, country    https://query.wikidata.org
 *
 * Curated inputs (hand-maintained, no stats in them):
 *   - data/cricket/traits.json     3D character traits for famous players
 *   - data/cricket/overrides.json  corrections for country / role / status / name
 *
 * Output: public/data/cricket/players.json
 *
 * Usage:
 *   node scripts/cricket/build-players.mjs            # use cached downloads if present
 *   node scripts/cricket/build-players.mjs --refresh  # re-download everything
 *   node scripts/cricket/build-players.mjs --offline  # never touch the network
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import { buildCharacter } from './traits-defaults.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RAW = path.join(ROOT, 'data-raw', 'cricket');
const OUT = path.join(ROOT, 'public', 'data', 'cricket', 'players.json');
const TRAITS = path.join(ROOT, 'data', 'cricket', 'traits.json');
const OVERRIDES = path.join(ROOT, 'data', 'cricket', 'overrides.json');
const args = new Set(process.argv.slice(2));
const OFFLINE = args.has('--offline');
const REFRESH = args.has('--refresh');
const UA = 'TheAuctionDataBuild/1.0 (open-source cricket auction game data script)';

const SOURCES = {
  ipl: { url: 'https://cricsheet.org/downloads/ipl_json.zip', file: 'ipl_json.zip' },
  t20i: { url: 'https://cricsheet.org/downloads/t20s_male_json.zip', file: 't20s_male_json.zip' },
  people: { url: 'https://cricsheet.org/register/people.csv', file: 'people.csv' },
};

// Non-IPL internationals are added to the pool when they meet this bar.
const FULL_MEMBERS = new Set(['Afghanistan', 'Australia', 'Bangladesh', 'England', 'India', 'Ireland',
  'New Zealand', 'Pakistan', 'South Africa', 'Sri Lanka', 'West Indies', 'Zimbabwe']);
const INTL_MIN_MATCHES = 40;
// A player counts as "active" if seen in IPL or T20I on/after this date.
const ACTIVE_SINCE = '2025-01-01';

const FRANCHISE_ALIASES = {
  'Royal Challengers Bangalore': 'Royal Challengers Bengaluru',
  'Delhi Daredevils': 'Delhi Capitals',
  'Kings XI Punjab': 'Punjab Kings',
  'Rising Pune Supergiants': 'Rising Pune Supergiant',
};

const log = (...a) => console.log('[cricket-data]', ...a);

// ---------------------------------------------------------------- downloads
async function ensure(src) {
  const p = path.join(RAW, src.file);
  if (fs.existsSync(p) && !REFRESH) return p;
  if (OFFLINE) throw new Error(`Missing ${p} and --offline was given`);
  fs.mkdirSync(RAW, { recursive: true });
  log('downloading', src.url);
  const res = await fetch(src.url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Download failed ${res.status} ${src.url}`);
  fs.writeFileSync(p, Buffer.from(await res.arrayBuffer()));
  return p;
}

function parseCsv(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const [head, ...rest] = rows;
  return rest.filter(r => r.length > 1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

// ---------------------------------------------------------------- aggregation
const players = new Map(); // id -> record
const league = {};         // "ipl:2024" -> totals

function blankComp() {
  return { m: 0, inn: 0, no: 0, runs: 0, bf: 0, hs: 0, hsNO: false, f50: 0, f100: 0, d0: 0, b4: 0, b6: 0,
    posSum: 0, posN: 0, bowlInn: 0, balls: 0, rc: 0, wk: 0, mdn: 0, dots: 0, bbiW: 0, bbiR: 0, w4: 0, w5: 0,
    ct: 0, st: 0, ro: 0, potm: 0, first: null, last: null, seasons: new Set(), teams: {}, bySeason: {} };
}
function rec(id, name) {
  let p = players.get(id);
  if (!p) { p = { id, sheetName: name, comps: { ipl: blankComp(), t20i: blankComp() } }; players.set(id, p); }
  return p;
}
const SINK = { bf: 0, runs: 0, outs: 0, balls: 0, rc: 0, wk: 0 };
function season(c, key) { if (!key) return SINK; return (c.bySeason[key] ||= { bf: 0, runs: 0, outs: 0, balls: 0, rc: 0, wk: 0, inn: 0, no: 0 }); }
function lg(key) { return (league[key] ||= { bf: 0, runs: 0, outs: 0, balls: 0, rc: 0, wk: 0 }); }

const NOT_OUT_KINDS = new Set(['retired hurt', 'retired not out']);
const BOWLER_KINDS = new Set(['bowled', 'caught', 'caught and bowled', 'lbw', 'stumped', 'hit wicket']);

function processMatch(m, comp) {
  const info = m.info;
  if (info.gender && info.gender !== 'male') return false;
  if (comp === 't20i' && info.team_type !== 'international') return false;
  const date = info.dates[0];
  const year = date.slice(0, 4);
  // Ratings only use IPL + T20Is between full members (associate games would inflate numbers).
  const elite = comp === 'ipl' || (info.teams || []).every(t => FULL_MEMBERS.has(t));
  const skey = elite ? `${comp}:${year}` : null;
  const L = elite ? lg(skey) : { bf: 0, runs: 0, outs: 0, balls: 0, rc: 0, wk: 0 };
  const reg = info.registry?.people || {};
  const idOf = name => reg[name];
  const teamOf = {};
  const appeared = new Set();
  for (const [team, list] of Object.entries(info.players || {})) {
    for (const n of list) { teamOf[n] = team; appeared.add(n); }
  }
  const innings = (m.innings || []).filter(i => !i.super_over);
  // also count anybody who featured in a delivery
  for (const inn of innings) for (const o of inn.overs || []) for (const d of o.deliveries) {
    for (const n of [d.batter, d.non_striker, d.bowler]) if (n) { appeared.add(n); teamOf[n] ||= inn.team; }
  }
  const P = name => { const id = idOf(name); return id ? rec(id, name).comps[comp] : null; };

  for (const n of appeared) {
    const id = idOf(n); if (!id) continue;
    const c = rec(id, n).comps[comp];
    c.m++;
    c.seasons.add(+year);
    if (!c.first || date < c.first) c.first = date;
    if (!c.last || date > c.last) c.last = date;
    let team = teamOf[n];
    if (team) { team = FRANCHISE_ALIASES[team] || team; c.teams[team] = (c.teams[team] || 0) + 1; }
  }
  for (const n of info.player_of_match || []) { const c = P(n); if (c) c.potm++; }

  for (const inn of innings) {
    const order = [];
    const bat = {};   // name -> {runs, bf, out}
    const bowl = {};  // name -> {runs, wk}
    const arrive = n => { if (n && !bat[n]) { bat[n] = { runs: 0, bf: 0, out: false }; order.push(n); } };
    for (const o of inn.overs || []) {
      const overBowl = { bowlers: new Set(), legal: 0, rc: 0 };
      for (const d of o.deliveries) {
        arrive(d.batter); arrive(d.non_striker);
        const ex = d.extras || {};
        const wide = !!ex.wides, nb = !!ex.noballs;
        const rb = d.runs.batter;
        const conceded = rb + (ex.wides || 0) + (ex.noballs || 0);
        const legal = !wide && !nb;
        // batter
        const b = bat[d.batter];
        const cb = P(d.batter);
        if (!wide) {
          b.bf++;
          L.bf++;
          if (cb) { cb.bf++; season(cb, skey).bf++; }
        }
        b.runs += rb; L.runs += rb;
        if (cb) {
          cb.runs += rb; season(cb, skey).runs += rb;
          if (rb === 4 && !d.runs.non_boundary) cb.b4++;
          if (rb === 6) cb.b6++;
        }
        // bowler
        const cw = P(d.bowler);
        const bw = (bowl[d.bowler] ||= { runs: 0, wk: 0 });
        bw.runs += conceded;
        overBowl.bowlers.add(d.bowler); overBowl.rc += conceded; if (legal) overBowl.legal++;
        L.rc += conceded; if (legal) L.balls++;
        if (cw) {
          cw.rc += conceded; season(cw, skey).rc += conceded;
          if (legal) { cw.balls++; season(cw, skey).balls++; if (conceded === 0) cw.dots++; }
        }
        for (const w of d.wickets || []) {
          arrive(w.player_out);
          const kind = w.kind;
          if (!NOT_OUT_KINDS.has(kind)) {
            bat[w.player_out].out = true;
            L.outs++;
            const co = P(w.player_out); if (co) season(co, skey).outs++;
          }
          if (BOWLER_KINDS.has(kind)) {
            bw.wk++; L.wk++;
            if (cw) { cw.wk++; season(cw, skey).wk++; }
          }
          const fielders = (w.fielders || []).filter(f => f.name && !f.substitute);
          if (kind === 'caught and bowled') { if (cw) cw.ct++; }
          else if (kind === 'caught' && fielders[0]) { const c = P(fielders[0].name); if (c) c.ct++; }
          else if (kind === 'stumped' && fielders[0]) { const c = P(fielders[0].name); if (c) c.st++; }
          else if (kind === 'run out') { for (const f of fielders) { const c = P(f.name); if (c) c.ro++; } }
        }
      }
      if (overBowl.bowlers.size === 1 && overBowl.legal >= 6 && overBowl.rc === 0) {
        const c = P([...overBowl.bowlers][0]); if (c) c.mdn++;
      }
    }
    order.forEach((n, i) => {
      const c = P(n); if (!c) return;
      const b = bat[n];
      c.inn++;
      c.posSum += i + 1; c.posN++;
      if (!b.out) c.no++;
      const ss = season(c, skey); ss.inn++; if (!b.out) ss.no++;
      if (b.runs > c.hs || (b.runs === c.hs && !b.out)) { c.hs = b.runs; c.hsNO = !b.out; }
      if (b.runs >= 100) c.f100++; else if (b.runs >= 50) c.f50++;
      if (b.runs === 0 && b.out) c.d0++;
    });
    for (const [n, bw] of Object.entries(bowl)) {
      const c = P(n); if (!c) continue;
      c.bowlInn++;
      if (bw.wk > c.bbiW || (bw.wk === c.bbiW && bw.runs < c.bbiR)) { c.bbiW = bw.wk; c.bbiR = bw.runs; }
      if (bw.wk >= 5) c.w5++; else if (bw.wk >= 4) c.w4++;
    }
  }
  return true;
}

function processZip(file, comp) {
  const z = unzipSync(fs.readFileSync(file));
  let n = 0;
  for (const [name, bytes] of Object.entries(z)) {
    if (!name.endsWith('.json')) continue;
    const m = JSON.parse(strFromU8(bytes));
    if (comp === 'ipl' && !/Indian Premier League/i.test(m.info.event?.name || '')) continue;
    if (processMatch(m, comp)) n++;
  }
  log(`${comp}: ${n} matches`);
  return n;
}

// ---------------------------------------------------------------- wikidata
async function wikidata(cricinfoIds) {
  const cacheFile = path.join(RAW, 'wikidata.json');
  let cache = {};
  if (fs.existsSync(cacheFile)) cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  const missing = cricinfoIds.filter(id => !(id in cache) || REFRESH);
  if (missing.length && !OFFLINE) {
    log(`wikidata: querying ${missing.length} players`);
    for (let i = 0; i < missing.length; i += 150) {
      const batch = missing.slice(i, i + 150);
      const q = `SELECT ?ci ?itemLabel ?dob ?csLabel ?citLabel WHERE {
        VALUES ?ci { ${batch.map(b => `"${b}"`).join(' ')} }
        ?item wdt:P2697 ?ci .
        OPTIONAL { ?item wdt:P569 ?dob }
        OPTIONAL { ?item wdt:P1532 ?cs }
        OPTIONAL { ?item wdt:P27 ?cit }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
      }`;
      let json = null;
      for (let attempt = 0; attempt < 3 && !json; attempt++) {
        try {
          const res = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q),
            { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } });
          if (res.ok) json = await res.json();
          else await new Promise(r => setTimeout(r, 3000));
        } catch { await new Promise(r => setTimeout(r, 3000)); }
      }
      for (const id of batch) cache[id] = cache[id] && !REFRESH ? cache[id] : null;
      if (!json) { log('wikidata batch failed, continuing without it'); continue; }
      for (const b of json.results.bindings) {
        const id = b.ci.value;
        const e = cache[id] || { name: null, dob: null, countries: [], citizenships: [] };
        const label = b.itemLabel?.value;
        if (label && !/^Q\d+$/.test(label)) e.name = label;
        if (b.dob?.value && !e.dob) e.dob = b.dob.value.slice(0, 10);
        if (b.csLabel?.value && !e.countries.includes(b.csLabel.value)) e.countries.push(b.csLabel.value);
        if (b.citLabel?.value && !e.citizenships.includes(b.citLabel.value)) e.citizenships.push(b.citLabel.value);
        cache[id] = e;
      }
      process.stdout.write('.');
    }
    process.stdout.write('\n');
    fs.writeFileSync(cacheFile, JSON.stringify(cache));
  }
  return cache;
}

const COUNTRY_MAP = {
  'United Kingdom': 'England', 'Wales': 'England', 'Scotland': 'Scotland',
  'Jamaica': 'West Indies', 'Trinidad and Tobago': 'West Indies', 'Barbados': 'West Indies', 'Guyana': 'West Indies',
  'Antigua and Barbuda': 'West Indies', 'Saint Kitts and Nevis': 'West Indies', 'Saint Lucia': 'West Indies',
  'Saint Vincent and the Grenadines': 'West Indies', 'Grenada': 'West Indies', 'Dominica': 'West Indies',
  "People's Republic of China": 'China', 'United States of America': 'USA', 'Kingdom of the Netherlands': 'Netherlands',
};
const normCountry = c => COUNTRY_MAP[c] || c;

// ---------------------------------------------------------------- stats helpers
const r1 = x => Math.round(x * 10) / 10;
const r2 = x => Math.round(x * 100) / 100;
function compStats(c) {
  if (!c.m) return null;
  const outs = c.inn - c.no;
  return {
    m: c.m, inn: c.inn, no: c.no, runs: c.runs, bf: c.bf,
    hs: c.hs + (c.hsNO ? '*' : ''),
    avg: outs ? r2(c.runs / outs) : null,
    sr: c.bf ? r2(100 * c.runs / c.bf) : null,
    f50: c.f50, f100: c.f100, d0: c.d0, b4: c.b4, b6: c.b6,
    overs: `${Math.floor(c.balls / 6)}${c.balls % 6 ? '.' + (c.balls % 6) : ''}`,
    balls: c.balls, rc: c.rc, wk: c.wk, mdn: c.mdn,
    econ: c.balls ? r2(c.rc * 6 / c.balls) : null,
    bavg: c.wk ? r2(c.rc / c.wk) : null,
    bsr: c.wk ? r1(c.balls / c.wk) : null,
    dotPct: c.balls ? r1(100 * c.dots / c.balls) : null,
    bbi: c.bowlInn ? `${c.bbiW}/${c.bbiR}` : null,
    w4: c.w4, w5: c.w5, ct: c.ct, st: c.st, ro: c.ro, potm: c.potm,
    span: c.seasons.size ? `${Math.min(...c.seasons)}-${Math.max(...c.seasons)}` : null,
    seasons: c.seasons.size,
  };
}

function percentileFn(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return v => {
    if (!sorted.length) return 50;
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < v) lo = mid + 1; else hi = mid; }
    let hi2 = lo; while (hi2 < sorted.length && sorted[hi2] === v) hi2++;
    return 100 * ((lo + hi2) / 2) / sorted.length;
  };
}

// ---------------------------------------------------------------- main
async function main() {
  const iplFile = await ensure(SOURCES.ipl);
  const t20File = await ensure(SOURCES.t20i);
  const peopleFile = await ensure(SOURCES.people);
  const people = new Map(parseCsv(fs.readFileSync(peopleFile, 'utf8')).map(r => [r.identifier, r]));

  const iplMatches = processZip(iplFile, 'ipl');
  const t20Matches = processZip(t20File, 't20i');

  // ---- pool selection
  const pool = [];
  for (const p of players.values()) {
    const ipl = p.comps.ipl, t = p.comps.t20i;
    const intlTeams = Object.entries(t.teams).filter(([k]) => !/XI$/.test(k)).sort((a, b) => b[1] - a[1]);
    p.intlTeam = intlTeams[0]?.[0] || null;
    if (ipl.m > 0) pool.push(p);
    else if (t.m >= INTL_MIN_MATCHES && FULL_MEMBERS.has(p.intlTeam)) { p.nonIpl = true; pool.push(p); }
  }
  log(`pool: ${pool.length} players (${pool.filter(p => p.nonIpl).length} non-IPL internationals)`);

  const wd = await wikidata([...new Set(pool.map(p => people.get(p.id)?.key_cricinfo).filter(Boolean))]);
  const traits = fs.existsSync(TRAITS) ? JSON.parse(fs.readFileSync(TRAITS, 'utf8')) : {};
  const overrides = fs.existsSync(OVERRIDES) ? JSON.parse(fs.readFileSync(OVERRIDES, 'utf8')) : {};
  delete traits._comment; delete overrides._comment;

  // ---- league rates per season (for era adjustment)
  const rate = {};
  for (const [k, v] of Object.entries(league)) {
    rate[k] = { rpb: v.runs / v.bf, opb: v.outs / v.bf, rcpb: v.rc / v.balls, wpb: v.wk / v.balls };
  }

  // ---- per-player derived metrics
  for (const p of pool) {
    const A = p.comps.ipl, B = p.comps.t20i;
    const sum = k => A[k] + B[k];
    const all = { m: sum('m'), inn: sum('inn'), no: sum('no'), runs: sum('runs'), bf: sum('bf'), balls: sum('balls'),
      rc: sum('rc'), wk: sum('wk'), ct: sum('ct'), st: sum('st'), ro: sum('ro'), posSum: sum('posSum'), posN: sum('posN'),
      bowlInn: sum('bowlInn'), f50: sum('f50'), f100: sum('f100') };
    let expRuns = 0, expOuts = 0, expRc = 0, expWk = 0;
    const el = { runs: 0, bf: 0, outs: 0, balls: 0, rc: 0, wk: 0 };
    for (const c of [A, B]) for (const [k, s] of Object.entries(c.bySeason)) {
      const r = rate[k];
      expRuns += s.bf * r.rpb; expOuts += s.bf * r.opb; expRc += s.balls * r.rcpb; expWk += s.balls * r.wpb;
      el.runs += s.runs; el.bf += s.bf; el.outs += s.outs; el.balls += s.balls; el.rc += s.rc; el.wk += s.wk;
    }
    const outs = el.outs;
    // batting (shrunk towards the player's own era average)
    const rpb = el.bf ? expRuns / el.bf : 1.25;
    const lgAvg = expOuts ? expRuns / expOuts : 25;
    const srIdx = 100 * (el.runs + 60 * rpb) / (expRuns + 60 * rpb);
    const avgIdx = 100 * ((el.runs + 3 * lgAvg) / (outs + 3)) / lgAvg;
    // bowling
    const rcpb = el.balls ? expRc / el.balls : 1.35;
    const econIdx = 100 * (expRc + 120 * rcpb) / (el.rc + 120 * rcpb);
    const wsrIdx = 100 * (el.wk + 3) / (expWk + 3);
    p.all = all; p.el = el;
    p.metrics = { srIdx, avgIdx, econIdx, wsrIdx, runs: el.runs, wk: el.wk,
      catchPm: all.m ? (all.ct + all.ro * 0.5) / all.m : 0,
      keepPm: all.m ? (all.ct + all.st * 1.5) / all.m : 0 };
    p.avgPos = all.posN ? all.posSum / all.posN : 11;
    p.lastSeen = [A.last, B.last].filter(Boolean).sort().pop();
    p.firstSeen = [A.first, B.first].filter(Boolean).sort()[0];
    // ---- role classification
    const ballsPm = all.m ? all.balls / all.m : 0;
    const bowledShare = all.m ? all.bowlInn / all.m : 0;
    const runsPerInn = all.inn ? all.runs / all.inn : 0;
    const isKeeper = all.st >= 2 || (all.st >= 1 && all.m && all.ct / all.m >= 0.45);
    const bowls = ballsPm >= 9 && bowledShare >= 0.4;
    const bats = p.avgPos <= 6.6 && runsPerInn >= 13;
    p.roleFlags = { isKeeper, bowls, bats, ballsPm, bowledShare, runsPerInn };
  }

  // ---- percentile scoring (reference groups = regular batters / bowlers)
  const batRef = pool.filter(p => p.el.bf >= 150);
  const bowlRef = pool.filter(p => p.el.balls >= 180);
  const fieldRef = pool.filter(p => p.all.m >= 15 && !p.roleFlags.isKeeper);
  const keepRef = pool.filter(p => p.roleFlags.isKeeper && p.all.m >= 10);
  const pct = {
    runs: percentileFn(batRef.map(p => p.metrics.runs)),
    avgIdx: percentileFn(batRef.map(p => p.metrics.avgIdx)),
    srIdx: percentileFn(batRef.map(p => p.metrics.srIdx)),
    wk: percentileFn(bowlRef.map(p => p.metrics.wk)),
    econIdx: percentileFn(bowlRef.map(p => p.metrics.econIdx)),
    wsrIdx: percentileFn(bowlRef.map(p => p.metrics.wsrIdx)),
    catchPm: percentileFn(fieldRef.map(p => p.metrics.catchPm)),
    keepPm: percentileFn(keepRef.map(p => p.metrics.keepPm)),
  };

  const out = [];
  for (const p of pool) {
    const m = p.metrics;
    const batConf = 0.55 + 0.45 * Math.min(1, p.el.bf / 600);
    const bowlConf = 0.55 + 0.45 * Math.min(1, p.el.balls / 720);
    const bp = { runs: pct.runs(m.runs), avg: pct.avgIdx(m.avgIdx), sr: pct.srIdx(m.srIdx) };
    const wp = { wk: pct.wk(m.wk), econ: pct.econIdx(m.econIdx), wsr: pct.wsrIdx(m.wsrIdx) };
    const batting = (0.3 * bp.runs + 0.3 * bp.avg + 0.4 * bp.sr) * batConf;
    const bowling = (0.3 * wp.wk + 0.4 * wp.econ + 0.3 * wp.wsr) * bowlConf * (p.el.balls >= 30 ? 1 : p.el.balls / 30);
    const fielding = p.all.m >= 5 ? pct.catchPm(m.catchPm) : 30;
    const f = p.roleFlags;
    const keeping = f.isKeeper ? pct.keepPm(m.keepPm) : 0;
    // Role from how the player was actually used + how good they are at each discipline
    let auto;
    if (f.isKeeper) auto = 'WK';
    else if (f.bats && f.bowls) auto = 'AR';
    else if (f.bats && f.ballsPm >= 6 && f.bowledShare >= 0.33 && bowling >= 42 && batting >= 42) auto = 'AR';
    else if (f.bowls && p.avgPos <= 7.4 && f.runsPerInn >= 15 && batting >= 40 && bowling >= 40) auto = 'AR';
    else if (f.bowls) auto = 'BOWL';
    else if (f.ballsPm >= 9 && bowling > batting) auto = 'BOWL';
    else auto = 'BAT';
    const ov = overrides[p.id] || overrides[p.sheetName] || {};
    const role = ov.role || auto;
    let composite;
    if (role === 'BAT') composite = 0.9 * batting + 0.1 * fielding;
    else if (role === 'WK') composite = 0.8 * batting + 0.2 * keeping;
    else if (role === 'BOWL') composite = 0.9 * bowling + 0.1 * fielding;
    else composite = 0.42 * batting + 0.42 * bowling + 0.16 * Math.min(batting, bowling) + 0.05 * fielding;
    p._comp = { batting, bowling, fielding, keeping, composite, bp, wp, batConf, bowlConf, role, ov };
  }

  // Overall rating: composite mapped onto 30..99 through its rank among established players,
  // OVR = 35 + 64 * (percentile/100)^1.6, so only the top ~10% reach 89+. Transparent and stable.
  // Percentiles are taken within the player's role ("percentile scoring by role").
  const ovrPctByRole = {};
  for (const r of ['BAT', 'WK', 'AR', 'BOWL']) {
    ovrPctByRole[r] = percentileFn(pool.filter(p => p.all.m >= 20 && p._comp.role === r).map(p => p._comp.composite));
  }
  const ovrPct = (v, r) => ovrPctByRole[r](v);

  const usedTraits = new Set();
  for (const p of pool) {
    const c = p._comp;
    const ov = c.ov;
    const person = people.get(p.id) || {};
    const w = wd[person.key_cricinfo] || null;
    const ovr = Math.max(25, Math.min(99, Math.round(35 + 64 * Math.pow(ovrPct(c.composite, c.role) / 100, 1.6))));
    // country: T20I team > Wikidata sport country > citizenship > override > India (IPL default)
    let country = p.intlTeam, countrySource = 't20i';
    if (!country && w?.countries?.length) { country = normCountry(w.countries[0]); countrySource = 'wikidata'; }
    if (!country && w?.citizenships?.length) { country = normCountry(w.citizenships[0]); countrySource = 'wikidata'; }
    if (!country) { country = 'India'; countrySource = 'assumed'; }
    if (ov.country) { country = ov.country; countrySource = 'override'; }

    const name = ov.name || w?.name || person.unique_name || p.sheetName;
    const status = ov.status || (p.lastSeen >= ACTIVE_SINCE ? 'active' : 'retired');
    const ipl = compStats(p.comps.ipl);
    const t20i = compStats(p.comps.t20i);
    const iplTeams = Object.entries(p.comps.ipl.teams).sort((a, b) => b[1] - a[1]).map(x => x[0]);
    const years = [...new Set([...p.comps.ipl.seasons, ...p.comps.t20i.seasons])].sort();
    const t = traits[p.sheetName] || traits[p.id] || traits[name] || null;
    if (t) usedTraits.add(t);
    const character = buildCharacter({ id: p.id, name, country, role: c.role, traits: t });

    out.push({
      id: p.id,
      name,
      short: p.sheetName,
      role: c.role,
      country,
      overseas: country !== 'India',
      status,
      dob: w?.dob || null,
      years: [years[0], years[years.length - 1]],
      nonIpl: !!p.nonIpl,
      famous: !!t,
      ovr,
      rating: {
        batting: Math.round(c.batting), bowling: Math.round(c.bowling),
        fielding: Math.round(c.fielding), keeping: Math.round(c.keeping),
        composite: r1(c.composite), rolePct: Math.round(ovrPct(c.composite, c.role)),
        detail: {
          runsPct: Math.round(c.bp.runs), avgPct: Math.round(c.bp.avg), srPct: Math.round(c.bp.sr),
          wkPct: Math.round(c.wp.wk), econPct: Math.round(c.wp.econ), wsrPct: Math.round(c.wp.wsr),
          srIdx: Math.round(p.metrics.srIdx), avgIdx: Math.round(p.metrics.avgIdx),
          econIdx: Math.round(p.metrics.econIdx), wsrIdx: Math.round(p.metrics.wsrIdx),
          batConf: r2(c.batConf), bowlConf: r2(c.bowlConf), avgPos: r1(p.avgPos),
        },
      },
      stats: { ipl, t20i },
      teams: iplTeams,
      sources: { country: countrySource },
      character,
      customImage: ov.customImage || t?.customImage || null,
      customModel: ov.customModel || t?.customModel || null,
    });
  }

  const unused = Object.entries(traits).filter(([, v]) => !usedTraits.has(v)).map(([k]) => k);
  if (unused.length) log('WARNING traits with no matching player:', unused.join(', '));
  log(`curated characters: ${usedTraits.size}`);
  out.sort((a, b) => b.ovr - a.ovr || b.rating.composite - a.rating.composite);
  const meta = {
    sport: 'cricket',
    generatedAt: new Date().toISOString(),
    sources: {
      ipl: `Cricsheet IPL ball-by-ball (${iplMatches} matches)`,
      t20i: `Cricsheet men's T20I ball-by-ball (${t20Matches} matches)`,
      bio: 'Wikidata (CC0): name, date of birth, country',
      license: 'Cricsheet data is ODC-BY 1.0 licensed - https://cricsheet.org',
    },
    latestMatch: [...players.values()].map(p => p.lastSeen || p.comps.ipl.last).filter(Boolean).sort().pop(),
    count: out.length,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ meta, players: out }));
  log(`wrote ${out.length} players -> ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
  const assumed = out.filter(p => p.sources.country === 'assumed');
  log(`${assumed.length} players had no T20I/Wikidata country and were assumed Indian. Review with --list-assumed.`);
  if (args.has('--list-assumed')) console.log(assumed.map(p => `${p.short} (${p.id}) ${p.years.join('-')}`).join('\n'));
  if (args.has('--top')) console.log(out.slice(0, 60).map(p => `${p.ovr} ${p.role.padEnd(4)} ${p.name} [${p.country}] bat${p.rating.batting} bowl${p.rating.bowling}`).join('\n'));
}

main().catch(e => { console.error(e); process.exit(1); });
