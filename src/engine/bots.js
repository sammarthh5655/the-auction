// AI bidders. Sport-independent: they reason about OVR, roles (via pack.roleTargets), money and scarcity.
import { clamp, hashStr, makeRng, values } from './util.js';
import { bidCheck, isShort, lotBidCheck, purseLeft, purseMinor, squadCounts, valueScore } from './rules.js';

const DIFFICULTY = {
  easy: { noise: 0.38, delay: [1100, 3000], need: 0.35, pace: 0.4, snipe: 0.05, overpay: 1.12, jump: 0.15 },
  medium: { noise: 0.2, delay: [650, 1800], need: 0.7, pace: 0.8, snipe: 0.15, overpay: 1.0, jump: 0.5 },
  hard: { noise: 0.08, delay: [500, 1600], need: 1, pace: 1, snipe: 0.3, overpay: 0.96, jump: 0.55 },
};

// Value of a player as a % of the purse, by OVR (piecewise, log-ish). Tuned with scripts/simulate.mjs.
const CURVE = [[25, 0.12], [40, 0.22], [50, 0.4], [60, 0.8], [70, 1.7], [78, 3.0], [84, 4.8], [88, 6.6], [92, 9.0], [96, 12.0], [99, 14.5]];
export function marketShare(ovr) {
  if (ovr <= CURVE[0][0]) return CURVE[0][1];
  for (let i = 1; i < CURVE.length; i++) {
    const [x1, y1] = CURVE[i], [x0, y0] = CURVE[i - 1];
    if (ovr <= x1) return y0 * Math.pow(y1 / y0, (ovr - x0) / (x1 - x0));
  }
  return CURVE[CURVE.length - 1][1];
}

export function botProfile(team, seed) {
  const r = makeRng(hashStr(team.id + ':' + seed));
  return {
    roleLove: { BAT: 0.88 + r() * 0.24, WK: 0.88 + r() * 0.24, AR: 0.88 + r() * 0.24, BOWL: 0.88 + r() * 0.24,
      GK: 0.9 + r() * 0.2, DEF: 0.9 + r() * 0.2, MID: 0.9 + r() * 0.2, FWD: 0.9 + r() * 0.2 },
    legendLove: 0.92 + r() * 0.2,
    aggression: 0.9 + r() * 0.25,
  };
}

/** Maximum a bot team is willing to pay for `player` right now (minor units). */
export function botValuation(team, player, ctx) {
  const { settings: s, pack, playersById, remaining = [] } = ctx;
  const d = DIFFICULTY[s.bots.difficulty] || DIFFICULTY.medium;
  const prof = botProfile(team, s.seed);
  const total = purseMinor(s, pack);
  let v = (total * marketShare(valueScore(player))) / 100;

  // squad needs
  const counts = squadCounts(team, playersById);
  const target = Math.round((s.squad.min + s.squad.max) / 2);
  const roleTarget = (pack.roleTargets?.[player.role] || 0.25) * target;
  const have = counts.roles[player.role] || 0;
  let need = clamp(1 + ((roleTarget - have) / Math.max(1, roleTarget)) * 0.6, 0.35, 1.6);
  const req = s.squad.roleMins?.[player.role];
  if (req?.on && have < req.min) need = Math.max(need, 1.35);
  v *= 1 + (need - 1) * d.need;
  // every bot knows a lineup needs the essentials (e.g. a keeper, 5 bowling options) - strategy, not a rule
  const essential = pack.essentialRoles?.[player.role] || 0;
  const essentialGap = have < essential;
  // bot strategy (never a rule): secure the essentials (a goalkeeper / wicketkeeper, enough bowlers...)
  const deficits = Object.entries(pack.essentialRoles || {}).reduce((a, [r, k]) => a + Math.max(0, k - (counts.roles[r] || 0)), 0);
  const slotsLeft = s.squad.max - counts.size;
  if (!essentialGap && deficits >= slotsLeft) return 0; // keep the last slots for what the XI still lacks
  const cap = pack.roleCaps?.[player.role];
  if (cap && have >= cap) v *= 0.12; // a third keeper never plays - leave him for teams that need one
  if (essentialGap) {
    v *= 1.5;
    const left = remaining.filter(p => p.role === player.role).length;
    const lacking = values(ctx.teams || {}).filter(t => (squadCounts(t, playersById).roles[player.role] || 0) < essential).length;
    if (left <= Math.max(2, lacking * 2) || slotsLeft <= deficits + 2) v = Math.max(v * 1.8, (ctx.base || 0) * 2.5); // last chance
  }

  if (s.squad.overseasOn && player.overseas) {
    const left = s.squad.overseasMax - counts.overseas;
    if (left <= 1) v *= 0.8;
    // keep enough domestic players to field a legal lineup (e.g. 7 Indians for a 4-overseas XI)
    const osXI = s.squad.lineupOverseasMax ?? 4;
    const domesticNeeded = (pack.lineupSize || 11) - osXI;
    if (counts.overseas >= osXI && counts.size - counts.overseas < domesticNeeded) {
      if (ctx.lotRound !== 3) return 0; // bot strategy only: save the slot for a domestic player
    }
  }
  // budget pacing: rich late = spend more, poor = careful
  const slotsToFill = Math.max(1, target - counts.size);
  const perSlotNow = purseLeft(team, s, pack) / slotsToFill;
  const perSlotStart = total / target;
  v *= 1 + (clamp(Math.sqrt(perSlotNow / perSlotStart), 0.45, 1.9) - 1) * d.pace;

  // scarcity: few comparable players left -> pay up
  if (remaining.length) {
    const similar = remaining.filter(p => p.role === player.role && p.ovr >= player.ovr - 4).length;
    const teams = values(ctx.teams || {}).length || 4;
    if (similar < teams) v *= 1 + (teams - similar) * 0.04;
  }
  // personality + stable noise
  v *= prof.roleLove[player.role] || 1;
  if (player.status === 'retired') v *= prof.legendLove;
  const nr = makeRng(hashStr(`${team.id}|${player.id}|${s.seed}`))();
  v *= 1 + (nr * 2 - 1) * d.noise;
  v *= d.overpay * prof.aggression;

  // budget discipline: never sink more than a fair share of what is left into one player
  // (early on ~1/7 of the purse; the share grows as the squad fills up)
  const fairShare = purseLeft(team, s, pack) * Math.min(0.5, 2.4 / Math.max(1, target - counts.size));
  v = Math.min(v, fairShare * (essentialGap ? 1.6 : 1));

  // must still fill the minimum squad: when short and the pool is running dry, buy at base
  if (isShort(team, ctx)) {
    const teams = values(ctx.teams || {}).length || 4;
    const shortBy = Math.max(1, s.squad.min - counts.size);
    if (remaining.length <= shortBy * teams * 1.2 || (req?.on && have < req.min) || ctx.lotRound === 3) v = Math.max(v, (ctx.base || 0) * 1.6);
  }
  return Math.max(0, Math.round(v));
}

/**
 * Picks which (if any) bot bids next on the open lot, and when.
 * Returns { teamId, amount, at } or null.
 */
export function planBotBid(lot, room, ctx, now, rng = Math.random) {
  const { settings: s, pack } = ctx;
  if (!s.bots.allowed) return null;
  const d = DIFFICULTY[s.bots.difficulty] || DIFFICULTY.medium;
  const player = ctx.playersById[lot.pid];
  const amount = lot.bid == null ? lot.base : lot.bid + ctx.increment(lot.bid);
  const interested = [];
  for (const team of values(room.teams)) {
    if (team.type !== 'bot' || team.id === lot.leader) continue;
    if (!lotBidCheck(team, player, amount, ctx, lot).ok) continue;
    const val = botValuation(team, player, { ...ctx, base: lot.base, teams: room.teams, lotRound: lot.round });
    if (val >= amount) interested.push({ team, val, margin: (val - amount) / Math.max(1, amount) });
  }
  if (!interested.length) return null;
  // the bot with the most headroom is the most likely to jump in
  const weights = interested.map(x => 0.3 + Math.min(3, x.margin));
  let pick = rng() * weights.reduce((a, b) => a + b, 0), chosen = interested[0];
  for (let i = 0; i < interested.length; i++) { pick -= weights[i]; if (pick <= 0) { chosen = interested[i]; break; } }
  const left = lot.endsAt - now;
  let delay = d.delay[0] + rng() * (d.delay[1] - d.delay[0]);
  if (rng() < d.snipe && left > 2500) delay = left - 900 - rng() * 700; // "going twice..." snipe
  delay = Math.min(delay, Math.max(250, left - 450));
  // far below what it is willing to pay? sometimes jump a step or two to speed things up
  let bid = amount;
  if (lot.bid != null && chosen.margin > 0.6 && rng() < d.jump) {
    const extra = (chosen.margin > 2.5 ? 3 : chosen.margin > 1.2 ? 2 : 1) * ctx.increment(amount);
    if (amount + extra <= chosen.val && lotBidCheck(chosen.team, player, amount + extra, ctx, lot).ok) bid = amount + extra;
  }
  return { teamId: chosen.team.id, amount: bid, at: now + delay };
}

export function botWantsRtm(team, player, price, ctx) {
  return botValuation(team, player, { ...ctx, base: price }) >= price * 0.95;
}

/** Bot choice during the retention draft. Returns { pid, kind } or null to finish. */
export function botDraftPick(team, available, ctx, mode) {
  const { settings: s, pack } = ctx;
  const sorted = available.slice().sort((a, b) => valueScore(b) - valueScore(a));
  for (const p of sorted.slice(0, 12)) {
    const val = botValuation(team, p, { ...ctx, base: 0, teams: ctx.teams });
    if (mode.canRetain && mode.cost <= val * 1.15 && bidCheck(team, p, mode.cost, ctx).ok) return { pid: p.id, kind: 'retain' };
    if (mode.canTag && !mode.canRetain) return { pid: p.id, kind: 'rtm' };
  }
  if (mode.canTag) return sorted[0] ? { pid: sorted[0].id, kind: 'rtm' } : null;
  return null;
}
