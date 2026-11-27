/**
 * Auction state machine - pure functions, no network or React.
 * The host runner (src/net/hostRunner.js) calls these and writes the results through a backend
 * (in-memory for solo, Firebase RTDB online). Clients only ever run the small transaction
 * functions (bidTxn, rtmTxn, draftTxn) against the `lot` / `draft` nodes.
 */
import { asArray, byId, makeRng, values } from './util.js';
import { filterPool, orderLots, selectPlayers } from './pool.js';
import { basePriceFor, bidCheck, incrementFor, isShort, lotBidCheck, purseLeft, purseMinor, remainingRequirements, squadCounts } from './rules.js';

export const TIMING = { introMs: 2600, marqueeIntroMs: 4200, soldPauseMs: 3600, unsoldPauseMs: 2200, graceMs: 350, rtmMs: 9000, draftTurnMs: 30000 };

export function makeCtx(room, pack, players) {
  const s = room.settings;
  const playersById = players.byId || byId(players);
  return {
    settings: s, pack, playersById,
    minBase: room.pool?.minBase ?? 1,
    increment: cur => incrementFor(cur, s, pack),
  };
}

export function retentionCost(k, s, pack) {
  const pct = pack.retentionSlabs?.[k] ?? pack.retentionSlabs?.[pack.retentionSlabs.length - 1] ?? 5;
  return Math.max(5, Math.round((purseMinor(s, pack) * pct) / 100 / 5) * 5);
}

// ---------------------------------------------------------------- start
export function startGameUpdates(room, pack, players, now) {
  const s = room.settings;
  const rng = makeRng(s.seed);
  const cands = filterPool(players, s, pack);
  const up = {};
  for (const t of s.teams) {
    up[`teams/${t.id}`] = {
      id: t.id, name: t.name, color: t.color, type: t.type === 'open' ? 'bot' : t.type,
      ownerUid: room.teams?.[t.id]?.ownerUid || null, squad: null, rtmLeft: 0,
    };
  }
  up['lot'] = null; up['lineups'] = null; up['results'] = null; up['log'] = null; up['rtmTags'] = null;
  up['meta/startedAt'] = now;
  up['log/A0000'] = { t: now, kind: 'info', text: `Auction started - ${s.teams.length} teams, purse ${s.purse} ${pack.currency.big}` };
  const draftOn = s.retention.on || s.rtm.on;
  if (draftOn) {
    const ids = s.teams.map(t => t.id);
    const rounds = (s.retention.on ? s.retention.max : 0) + (s.rtm.on ? s.rtm.cards : 0);
    const order = [];
    for (let r = 0; r < rounds; r++) order.push(...(r % 2 ? ids.slice().reverse() : ids));
    up['candidates'] = cands.sort((a, b) => b.ovr - a.ovr).slice(0, 400).map(p => p.id);
    up['draft'] = { order, turn: 0, turnEndsAt: now + TIMING.draftTurnMs, picks: null, done: null };
    up['meta/status'] = 'retention';
  } else {
    Object.assign(up, buildPoolUpdates(room, pack, players, cands, new Set(), rng));
    up['meta/status'] = 'auction';
  }
  return up;
}

function buildPoolUpdates(room, pack, players, cands, exclude, rng) {
  const s = room.settings;
  const selected = selectPlayers(cands, s, pack, rng, exclude);
  const lots = orderLots(selected, s, pack, rng);
  const minBase = Math.min(...selected.map(p => basePriceFor(p, s, pack)));
  return { pool: { lots, cursor: -1, round: 1, unsold: null, total: lots.length, minBase: Number.isFinite(minBase) ? minBase : 1 } };
}

// ---------------------------------------------------------------- retention draft
export function draftState(room, pack, ctx) {
  const d = room.draft; if (!d) return null;
  const s = room.settings;
  const picks = asArray(d.picks);
  const order = asArray(d.order);
  const team = order[d.turn];
  const mine = id => picks.filter(p => p.team === id);
  const retained = id => mine(id).filter(p => p.kind === 'retain').length;
  const tagged = id => mine(id).filter(p => p.kind === 'rtm').length;
  const taken = new Set(picks.map(p => p.pid));
  const virtualTeam = id => ({ ...room.teams[id], squad: Object.fromEntries(mine(id).filter(p => p.kind === 'retain').map(p => [p.pid, { price: p.cost }])) });
  const modeFor = id => {
    const canRetain = s.retention.on && retained(id) < s.retention.max;
    const canTag = s.rtm.on && tagged(id) < s.rtm.cards;
    return { canRetain, canTag, cost: retentionCost(retained(id), s, pack) };
  };
  return { order, team, picks, taken, retained, tagged, virtualTeam, modeFor, done: d.done || {}, finished: d.turn >= order.length };
}

/** Transaction on `draft`: a team picks (kind = retain | rtm) or passes (pid = null). */
export function draftTxn({ teamId, pid, kind, now, pack, room, ctx }) {
  return d => {
    if (!d) return d;
    const order = asArray(d.order);
    if (order[d.turn] !== teamId) return undefined;
    const st = draftState({ ...room, draft: d }, pack, ctx);
    if (pid) {
      const m = st.modeFor(teamId);
      if (st.taken.has(pid)) return undefined;
      if (kind === 'retain' && !m.canRetain) return undefined;
      if (kind === 'rtm' && !m.canTag) return undefined;
      const p = ctx.playersById[pid];
      if (kind === 'retain' && !bidCheck(st.virtualTeam(teamId), p, m.cost, ctx).ok) return undefined;
      d.picks = [...asArray(d.picks), { team: teamId, pid, kind, cost: kind === 'retain' ? m.cost : 0 }];
    } else {
      d.done = { ...(d.done || {}), [teamId]: true };
    }
    d.turn = nextDraftTurn(d, room, pack, ctx, d.turn + 1);
    d.turnEndsAt = now + TIMING.draftTurnMs;
    return d;
  };
}

export function nextDraftTurn(d, room, pack, ctx, from) {
  const order = asArray(d.order);
  let t = from;
  while (t < order.length) {
    const st = draftState({ ...room, draft: { ...d, turn: t } }, pack, ctx);
    const m = st.modeFor(order[t]);
    if (!(d.done || {})[order[t]] && (m.canRetain || m.canTag)) break;
    t++;
  }
  return t;
}

export function finishDraftUpdates(room, pack, players, now) {
  const s = room.settings;
  const picks = asArray(room.draft?.picks);
  const up = {};
  const exclude = new Set();
  for (const pk of picks) {
    if (pk.kind === 'retain') {
      up[`teams/${pk.team}/squad/${pk.pid}`] = { price: pk.cost, via: 'retained', at: now };
      exclude.add(pk.pid);
    } else up[`rtmTags/${pk.pid}`] = pk.team;
  }
  for (const t of s.teams) up[`teams/${t.id}/rtmLeft`] = s.rtm.on ? picks.filter(p => p.team === t.id && p.kind === 'rtm').length : 0;
  const byIdMap = players.byId || byId(players);
  const cands = asArray(room.candidates).map(id => byIdMap[id]).filter(Boolean);
  const all = filterPool(players, s, pack);
  // RTM-tagged players must be in the auction
  const pool = buildPoolUpdates(room, pack, players, all.length ? all : cands, exclude, makeRng(s.seed + 7));
  const tagged = picks.filter(p => p.kind === 'rtm').map(p => p.pid).filter(pid => !pool.pool.lots.some(l => l.p === pid));
  pool.pool.lots = [...tagged.map(pid => ({ p: pid, s: 'Released players (RTM)' })), ...pool.pool.lots];
  pool.pool.total = pool.pool.lots.length;
  Object.assign(up, pool);
  up['meta/status'] = 'auction';
  up['log/A0001'] = { t: now, kind: 'info', text: `Retention done: ${picks.filter(p => p.kind === 'retain').length} retained, ${tagged.length + picks.filter(p => p.kind === 'rtm').length - tagged.length} RTM tags` };
  return up;
}

// ---------------------------------------------------------------- lots
export function openNextLotUpdates(room, pack, players, now) {
  const s = room.settings;
  const ctx = makeCtx(room, pack, players);
  const pool = room.pool;
  const lots = asArray(pool.lots);
  const teams = values(room.teams);
  const allFull = teams.every(t => squadCounts(t, ctx.playersById).size >= s.squad.max);
  let cursor = pool.cursor + 1;
  const up = {};
  if (allFull) return endAuctionUpdates(room, pack, players, now, 'Every squad is full');
  if (cursor >= lots.length) {
    const unsold = asArray(pool.unsold);
    if (pool.round === 1 && s.secondRound && unsold.length) {
      const rng = makeRng(s.seed + 99);
      const next = unsold.map(pid => ({ p: pid, s: 'Accelerated round · unsold players' }));
      for (let i = next.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [next[i], next[j]] = [next[j], next[i]]; }
      up['pool/lots'] = next; up['pool/round'] = 2; up['pool/unsold'] = null; up['pool/cursor'] = 0; up['pool/total'] = next.length;
      up[`log/R2`] = { t: now, kind: 'info', text: `Second round: ${next.length} unsold players return` };
      Object.assign(up, lotFor(next[0], 2, (room.lot?.seq || 0) + 1, room, pack, ctx, now));
      return up;
    }
    // Supplementary round(s): keep the auction going for teams below the minimum squad / roles.
    const supp = room.pool.supp || 0;
    const short = teams.filter(t => isShort(t, ctx) && purseLeft(t, s, pack) >= ctx.minBase && squadCounts(t, ctx.playersById).size < s.squad.max);
    if (short.length && supp < 4) {
      const owned = new Set(teams.flatMap(t => Object.keys(t.squad || {})));
      const recent = new Set(pool.round === 3 ? lots.map(l => l.p) : []);
      const needRoles = new Set(short.flatMap(t => remainingRequirements(t, ctx).roles.filter(r => r.need > 0).map(r => r.role)));
      const needDomestic = short.some(t => { const c = squadCounts(t, ctx.playersById); return s.squad.overseasOn && c.overseas >= (s.squad.lineupOverseasMax ?? 4); });
      // only players at least one short team is actually allowed to buy (overseas cap, roles, purse)
      const cands = filterPool(players, s, pack).filter(p => !owned.has(p.id) && !recent.has(p.id)
        && short.some(t => bidCheck(t, p, ctx.minBase, ctx).ok))
        .sort((a, b) => (needRoles.has(b.role) - needRoles.has(a.role)) || (needDomestic ? a.overseas - b.overseas : 0) || b.ovr - a.ovr);
      const deficit = short.reduce((a, t) => { const r = remainingRequirements(t, ctx); return a + Math.max(r.toMin, r.roles.reduce((x, y) => x + y.need, 0)); }, 0);
      const next = cands.slice(0, deficit + short.length + 2).map(p => ({ p: p.id, s: 'Supplementary round · teams below minimum' }));
      if (next.length) {
        up['pool/lots'] = next; up['pool/round'] = 3; up['pool/unsold'] = null; up['pool/cursor'] = 0; up['pool/total'] = next.length; up['pool/supp'] = supp + 1;
        up[`log/S${supp + 1}`] = { t: now, kind: 'info', text: `Supplementary round: ${short.map(t => t.name).join(', ')} still need players` };
        Object.assign(up, lotFor(next[0], 3, (room.lot?.seq || 0) + 1, room, pack, ctx, now));
        return up;
      }
    }
    return endAuctionUpdates(room, pack, players, now, 'All players have been auctioned');
  }
  up['pool/cursor'] = cursor;
  Object.assign(up, lotFor(lots[cursor], pool.round, (room.lot?.seq || 0) + 1, room, pack, ctx, now));
  return up;
}

function lotFor(entry, round, seq, room, pack, ctx, now) {
  const s = room.settings;
  const p = ctx.playersById[entry.p];
  let base = round === 3 ? ctx.minBase : basePriceFor(p, s, pack);
  if (round === 2 && s.secondRoundDiscount) base = Math.max(ctx.minBase, Math.round(base * (1 - s.secondRoundDiscount / 100)));
  const marquee = !!pack.isMarquee?.(p) || /Marquee/.test(entry.s);
  const intro = marquee ? TIMING.marqueeIntroMs : TIMING.introMs;
  const eligible = values(room.teams).filter(t => lotBidCheck(t, p, base, ctx, { round })).length;
  return {
    lot: {
      seq, pid: p.id, set: entry.s, round, base, bid: null, leader: null, bids: 0, marquee,
      status: eligible ? 'open' : 'unsold', reason: eligible ? null : 'No team can bid',
      openedAt: now, biddingFrom: now + intro, endsAt: now + intro + s.timer * 1000,
      closedAt: eligible ? null : now, processed: false, history: null, rtm: null, pausedLeft: null,
    },
  };
}

/** Client transaction on `lot`: place a bid. Validation of purse/squad happens before (bidCheck). */
export function bidTxn({ seq, teamId, amount, now, timerMs }) {
  return lot => {
    if (!lot || lot.seq !== seq || lot.status !== 'open') return undefined;
    if (now < lot.biddingFrom - 50 || now > lot.endsAt) return undefined;
    if (lot.leader === teamId) return undefined;
    const min = lot.bid == null ? lot.base : lot.bid;
    if (lot.bid == null ? amount < lot.base : amount <= min) return undefined;
    lot.bid = amount; lot.leader = teamId; lot.bids = (lot.bids || 0) + 1;
    lot.endsAt = Math.max(lot.endsAt, now + timerMs);
    lot.lastBidAt = now;
    lot.history = [...asArray(lot.history), { t: teamId, a: amount }].slice(-8);
    return lot;
  };
}

/** Host transaction: close an expired lot (sold / unsold / RTM window). */
export function closeLotTxn({ now, room }) {
  return lot => {
    if (!lot || lot.status !== 'open' || now < lot.endsAt + TIMING.graceMs) return undefined;
    lot.closedAt = now;
    if (!lot.leader) { lot.status = 'unsold'; return lot; }
    const tagTeam = room.rtmTags?.[lot.pid];
    const t = tagTeam && room.teams[tagTeam];
    if (t && tagTeam !== lot.leader && (t.rtmLeft || 0) > 0) {
      lot.status = 'rtm';
      lot.rtm = { team: tagTeam, endsAt: now + TIMING.rtmMs, decision: null };
      return lot;
    }
    lot.status = 'sold'; lot.winner = lot.leader; lot.via = 'auction';
    return lot;
  };
}

/** RTM decision (RTM team) or timeout (host). */
export function rtmTxn({ seq, teamId, match, now, force }) {
  return lot => {
    if (!lot || lot.seq !== seq || lot.status !== 'rtm') return undefined;
    if (!force && lot.rtm.team !== teamId) return undefined;
    if (force && now < lot.rtm.endsAt) return undefined;
    lot.rtm.decision = match ? 'match' : 'decline';
    lot.status = 'sold';
    lot.winner = match ? lot.rtm.team : lot.leader;
    lot.via = match ? 'rtm' : 'auction';
    lot.closedAt = now;
    return lot;
  };
}

/** Host: apply a closed lot to squads / unsold list (idempotent). */
export function settleLotUpdates(room, pack, players, now) {
  const lot = room.lot;
  const ctx = makeCtx(room, pack, players);
  const p = ctx.playersById[lot.pid];
  const key = `log/L${String(lot.seq).padStart(4, '0')}`;
  const up = { 'lot/processed': true };
  if (lot.status === 'sold') {
    const w = lot.winner;
    up[`teams/${w}/squad/${lot.pid}`] = { price: lot.bid, via: lot.via, at: now, round: lot.round };
    if (lot.via === 'rtm') up[`teams/${w}/rtmLeft`] = Math.max(0, (room.teams[w].rtmLeft || 1) - 1);
    up[key] = { t: now, kind: 'sold', pid: lot.pid, team: w, price: lot.bid, via: lot.via, bids: lot.bids, text: `${p.name} SOLD to ${room.teams[w].name}${lot.via === 'rtm' ? ' (RTM)' : ''}` };
  } else {
    if (lot.round === 1) up['pool/unsold'] = [...asArray(room.pool.unsold), lot.pid];
    up[key] = { t: now, kind: 'unsold', pid: lot.pid, text: `${p.name} UNSOLD${lot.reason ? ' - ' + lot.reason : ''}` };
  }
  return up;
}

export function endAuctionUpdates(room, pack, players, now, why) {
  const ctx = makeCtx(room, pack, players);
  const up = { 'meta/status': 'lineup', 'lot': null, 'meta/auctionEndedAt': now };
  up['log/Z0000'] = { t: now, kind: 'info', text: `Auction complete - ${why}` };
  for (const t of values(room.teams)) {
    const squad = Object.keys(t.squad || {}).map(id => ctx.playersById[id]).filter(Boolean);
    up[`lineups/${t.id}`] = { ids: pack.autoPickLineup(squad, room.settings), locked: t.type === 'bot' };
  }
  return up;
}

// ---------------------------------------------------------------- results
export function computeResults(room, pack, players) {
  const ctx = makeCtx(room, pack, players);
  const ranking = values(room.teams).map(t => {
    const ids = asArray(room.lineups?.[t.id]?.ids);
    const xi = ids.map(id => ctx.playersById[id]).filter(Boolean);
    const ev = pack.evaluateLineup(xi, room.settings);
    return { teamId: t.id, total: Math.round(ev.total * 10) / 10, cats: Object.fromEntries(ev.cats.map(c => [c.key, Math.round(c.score * 10) / 10])), issues: ev.issues, ids };
  }).sort((a, b) => b.total - a.total);
  return { ranking, winner: ranking[0]?.teamId || null };
}

export function finalizeUpdates(room, pack, players, now) {
  const up = { 'meta/status': 'results', 'meta/finishedAt': now };
  for (const t of values(room.teams)) {
    const l = room.lineups?.[t.id];
    if (!l?.ids?.length && !Array.isArray(l?.ids)) {
      const squad = Object.keys(t.squad || {}).map(id => (players.byId || byId(players))[id]).filter(Boolean);
      up[`lineups/${t.id}`] = { ids: pack.autoPickLineup(squad, room.settings), locked: true };
    } else up[`lineups/${t.id}/locked`] = true;
  }
  const merged = { ...room, lineups: { ...(room.lineups || {}) } };
  for (const [k, v] of Object.entries(up)) if (k.startsWith('lineups/') && !k.endsWith('/locked')) merged.lineups[k.split('/')[1]] = v;
  up['results'] = computeResults(merged, pack, players);
  return up;
}
