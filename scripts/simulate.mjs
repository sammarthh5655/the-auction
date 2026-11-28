#!/usr/bin/env node
/**
 * Headless auction simulator: runs complete bot-only auctions through the real engine + host runner
 * with a fake clock, then checks the rules were respected. Usage: npm run simulate [-- --games 5]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMemoryBackend } from '../src/net/memoryBackend.js';
import { createHostRunner, hostActions } from '../src/net/hostRunner.js';
import { defaultSettings, makeTeams } from '../src/engine/settings.js';
import { deepMerge, formatMoney, values } from '../src/engine/util.js';
import { purseLeft, squadCounts } from '../src/engine/rules.js';
import cricketPack from '../src/sports/cricket/pack.js';
import footballPack from '../src/sports/football/pack.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sportArg = process.argv.includes('--sport') ? process.argv[process.argv.indexOf('--sport') + 1] : 'cricket';
const cricket = sportArg === 'football' ? footballPack : cricketPack; // (variable name kept: it is just "the pack")
const data = JSON.parse(fs.readFileSync(path.join(ROOT, `public/data/${sportArg}/players.json`), 'utf8'));
const players = data.players; players.byId = Object.fromEntries(players.map(p => [p.id, p]));
const argv = process.argv.slice(2);
const games = Number(argv[argv.indexOf('--games') + 1]) || 4;

const CONFIGS = [
  { name: 'default medium', patch: {} },
  { name: 'hard, 8 teams, retention+rtm', patch: { teamCount: 8, bots: { difficulty: 'hard' }, retention: { on: true, max: 2 }, rtm: { on: true, cards: 2 }, pool: { count: 150 } } },
  { name: 'easy, 50 Cr, marquee, fixed inc', patch: { purse: 50, bots: { difficulty: 'easy' }, order: 'marquee', pricing: { incMode: 'fixed', incFixed: 0.25 } } },
  { name: '2 teams 500 Cr shuffled', patch: { purse: 500, teamCount: 2, order: 'shuffled', pool: { count: 40 } } },
  { name: '10 teams, optional role minimums ON', patch: { teamCount: 10, squad: { min: 14, max: 18, roleMins: sportArg === 'football' ? { GK: { on: true, min: 2 }, DEF: { on: true, min: 5 }, MID: { on: true, min: 4 } } : { WK: { on: true, min: 1 }, BOWL: { on: true, min: 4 }, AR: { on: true, min: 1 } } }, pool: { count: 200 }, secondRoundDiscount: 50 } },
];

async function runGame(cfg, seed) {
  let t = 1_700_000_000_000;
  const backend = createMemoryBackend({ uid: 'host', clock: () => t });
  let s = deepMerge(defaultSettings(cricket), cfg.patch);
  s.teams = makeTeams(s.teamCount, 0);
  s.seed = seed;
  const code = 'SIM';
  await backend.update({ [`rooms/${code}`]: { meta: { code, hostUid: 'host', status: 'lobby', mode: 'solo', sport: 'cricket' }, settings: s } });
  const runner = createHostRunner({ backend, code, pack: cricket, players, rng: Math.random });
  await hostActions({ backend, code, pack: cricket, players }).start();
  let steps = 0;
  while (steps++ < 400000) {
    t += 100;
    await runner.step();
    const st = runner.room?.meta?.status;
    if (st === 'results') break;
  }
  const room = runner.room;
  runner.stop();
  const ctx = { settings: room.settings, pack: cricket, playersById: players.byId };
  const problems = [];
  const lines = [];
  for (const team of values(room.teams)) {
    const c = squadCounts(team, players.byId);
    const left = purseLeft(team, room.settings, cricket);
    if (left < 0) problems.push(`${team.name} purse negative`);
    if (c.size > s.squad.max) problems.push(`${team.name} squad ${c.size} > max`);
    if (s.squad.overseasOn && c.overseas > s.squad.overseasMax) problems.push(`${team.name} overseas ${c.overseas}`);
    if (c.size < s.squad.min) problems.push(`${team.name} only ${c.size} players (min ${s.squad.min})`);
    for (const [r, req] of Object.entries(s.squad.roleMins)) if (req.on && (c.roles[r] || 0) < req.min) problems.push(`${team.name} lacks ${r}`);
    lines.push(`   ${team.name.padEnd(17)} ${String(c.size).padStart(2)} players  os ${c.overseas}  left ${formatMoney(left, cricket.currency).padStart(11)}`);
  }
  const res = room.results;
  for (const r of res.ranking) for (const i of (r.issues || []).filter(x => /wicketkeeper|goalkeeper|defender|midfielder|forward/i.test(x))) lines.push(`   (bot quality note) ${room.teams[r.teamId].name}: ${i}`);
  for (const r of res.ranking) for (const i of (r.issues || []).filter(x => /overseas|empty/i.test(x))) problems.push(`${room.teams[r.teamId].name} XI: ${i}`);
  const sold = Object.values(room.log || {}).filter(l => l.kind === 'sold');
  const top = sold.sort((a, b) => b.price - a.price).slice(0, 3).map(l => `${players.byId[l.pid].name} ${formatMoney(l.price, cricket.currency)}`);
  top.push(`| ${sold.length} sold, avg ${(sold.reduce((a, l) => a + (l.bids || 0), 0) / Math.max(1, sold.length)).toFixed(1)} bids/lot`);
  return { minutes: ((t - 1_700_000_000_000) / 60000).toFixed(1), problems, lines, winner: room.teams[res.winner]?.name, top, ranking: res.ranking.map(r => r.total) };
}

let failures = 0;
for (const cfg of CONFIGS) {
  for (let g = 0; g < Math.max(1, Math.round(games / 2)); g++) {
    const r = await runGame(cfg, 1000 + g * 17);
    console.log(`\n[${cfg.name}] game ${g + 1}: ${r.minutes} simulated min, winner ${r.winner}, scores ${r.ranking.join(' / ')}`);
    console.log('   top buys: ' + r.top.join(', '));
    r.lines.forEach(l => console.log(l));
    if (r.problems.length) { failures++; console.log('   PROBLEMS: ' + r.problems.join('; ')); }
  }
}
console.log(failures ? `\n${failures} game(s) had rule problems` : '\nAll games respected every rule.');
process.exit(failures ? 1 : 0);
