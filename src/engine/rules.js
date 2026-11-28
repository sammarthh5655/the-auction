// Money, eligibility and squad rules. Sport-independent: everything sport-specific comes from the pack.
import { values, sum } from './util.js';

/**
 * Auction "value score" (25-99): the player's rank within his role on a curved scale. Prices, marquee
 * status and bot valuations use it, so the auction economy is independent of how OVR is displayed.
 */
export const valueScore = p => (p?.rating?.rolePct != null ? 35 + 64 * Math.pow(p.rating.rolePct / 100, 1.6) : p.ovr);

/** Scale factor between the host's purse and the pack's reference purse. */
export const purseScale = (s, pack) => (s.pricing.scaleWithPurse ? s.purse / (pack.referencePurse || 100) : 1);
export const purseMinor = (s, pack) => Math.round(s.purse * pack.currency.bigFactor);
const roundTo = (v, step) => Math.max(step, Math.round(v / step) * step);

export function basePriceFor(p, s, pack) {
  const f = pack.currency.bigFactor;
  if (s.pricing.baseMode === 'flat') return Math.max(1, Math.round(s.pricing.flatBase * f));
  const raw = pack.baseSlab(p) * purseScale(s, pack);
  const step = raw >= 100 ? 5 : raw >= 20 ? 5 : 1;
  return roundTo(raw, step);
}

export function incrementFor(current, s, pack) {
  const f = pack.currency.bigFactor;
  if (s.pricing.incMode === 'fixed') return Math.max(1, Math.round(s.pricing.incFixed * f));
  if (s.pricing.incMode === 'percent') return Math.max(1, Math.round((current * s.pricing.incPercent) / 100));
  const k = purseScale(s, pack);
  const tier = pack.incrementTiers.find(t => current < t.upTo * k) || pack.incrementTiers[pack.incrementTiers.length - 1];
  return Math.max(1, Math.round(tier.inc * k));
}

export function nextBidAmount(lot, s, pack) {
  if (lot.bid === null || lot.bid === undefined) return lot.base;
  return lot.bid + incrementFor(lot.bid, s, pack);
}

// ---------------------------------------------------------------- team helpers
export const squadEntries = team => Object.entries(team?.squad || {}).map(([pid, v]) => ({ pid, ...v }));
export const spent = team => sum(squadEntries(team).map(e => e.price || 0));
export const purseLeft = (team, s, pack) => purseMinor(s, pack) - spent(team);

export function squadCounts(team, playersById) {
  const c = { size: 0, overseas: 0, roles: {} };
  for (const e of squadEntries(team)) {
    const p = playersById[e.pid]; if (!p) continue;
    c.size++; if (p.overseas) c.overseas++;
    c.roles[p.role] = (c.roles[p.role] || 0) + 1;
  }
  return c;
}

/** Domestic players a squad needs to field a full lineup within the overseas cap (bots plan around this; humans are free). */
export function domesticNeeded(s, pack) {
  if (!s.squad.overseasOn) return 0;
  return Math.max(0, Math.min(s.squad.min, pack?.lineupSize || 11) - (s.squad.lineupOverseasMax ?? 4));
}

/** How many squad slots this team still *must* fill (min squad, required roles, domestic quota). */
function mandatorySlots(counts, s, extraPlayer, pack) {
  const size = counts.size + (extraPlayer ? 1 : 0);
  let unmetRoles = 0;
  for (const [role, req] of Object.entries(s.squad.roleMins || {})) {
    if (!req.on) continue;
    const have = (counts.roles[role] || 0) + (extraPlayer && extraPlayer.role === role ? 1 : 0);
    unmetRoles += Math.max(0, req.min - have);
  }
  return { needed: Math.max(s.squad.min - size, unmetRoles, 0), unmetRoles, size };
}

/**
 * Can `team` bid `amount` for `player`? Returns { ok, reason, maxBid }.
 * Enforces: squad max, overseas limit, role requirements (must keep room for required roles),
 * and the reserve rule - always keep enough purse to fill the minimum squad at the lowest base price.
 */
export function bidCheck(team, player, amount, ctx) {
  const { settings: s, pack, playersById, minBase } = ctx;
  const counts = squadCounts(team, playersById);
  if (counts.size >= s.squad.max) return { ok: false, reason: 'Squad full', maxBid: 0 };
  if (s.squad.overseasOn && player.overseas && counts.overseas >= s.squad.overseasMax) return { ok: false, reason: `Overseas limit (${s.squad.overseasMax}) reached`, maxBid: 0 };
  const after = mandatorySlots(counts, s, player, pack);
  const roomAfter = s.squad.max - after.size;
  if (after.unmetRoles > roomAfter) return { ok: false, reason: 'Must fill required roles first', maxBid: 0 };
  const reserve = after.needed * minBase;
  const maxBid = purseLeft(team, s, pack) - reserve;
  if (amount > maxBid) return { ok: false, reason: maxBid <= 0 ? 'Purse reserved for minimum squad' : 'Over your max bid', maxBid: Math.max(0, maxBid) };
  return { ok: true, maxBid };
}

export function eligibleTeams(teams, player, amount, ctx) {
  return values(teams).filter(t => bidCheck(t, player, amount, ctx).ok);
}

export function remainingRequirements(team, ctx) {
  const { settings: s, playersById, pack } = ctx;
  const counts = squadCounts(team, playersById);
  const roles = Object.entries(s.squad.roleMins || {}).filter(([, r]) => r.on)
    .map(([role, r]) => ({ role, need: Math.max(0, r.min - (counts.roles[role] || 0)), min: r.min, have: counts.roles[role] || 0 }));
  const domestic = Math.max(0, domesticNeeded(s, pack) - (counts.size - counts.overseas));
  return { counts, roles, domestic, toMin: Math.max(0, s.squad.min - counts.size), slotsLeft: s.squad.max - counts.size };
}

/** Is this team still short of its minimum squad or required roles? */
export function isShort(team, ctx) {
  const r = remainingRequirements(team, ctx);
  return r.toMin > 0 || r.roles.some(x => x.need > 0);
}

/** bidCheck + lot-specific rules (supplementary round is only for teams below the minimum). */
export function lotBidCheck(team, player, amount, ctx, lot) {
  if (lot?.round === 3 && !isShort(team, ctx)) return { ok: false, reason: 'Supplementary round: only teams below the minimum squad', maxBid: 0 };
  return bidCheck(team, player, amount, ctx);
}
