/**
 * Host runner: the authoritative game loop. Exactly one client runs it - the room host (or the solo
 * player). It opens lots, closes them when the timer expires, settles sales, drives the bots,
 * the retention draft and the end of the game. Every step is a transaction or an idempotent
 * update, so a refresh / reconnect / second host tab can never double-sell a player.
 */
import { asArray, values } from '../engine/util.js';
import { bidCheck, lotBidCheck } from '../engine/rules.js';
import { botDraftPick, botWantsRtm, planBotBid } from '../engine/bots.js';
import {
  TIMING, bidTxn, closeLotTxn, draftState, draftTxn, endAuctionUpdates, finalizeUpdates, finishDraftUpdates, makeCtx,
  openNextLotUpdates, rtmTxn, settleLotUpdates, startGameUpdates,
} from '../engine/game.js';

export const prefix = (code, map) => Object.fromEntries(Object.entries(map).map(([k, v]) => [`rooms/${code}/${k}`, v]));

export function createHostRunner({ backend, code, pack, players, rng = Math.random, onError = console.error }) {
  let room = null;
  let busy = false;
  let plan = null;
  let timer = null;
  const base = `rooms/${code}`;
  const unsub = backend.subscribe(base, r => { room = r; });
  const write = map => backend.update(prefix(code, map));
  const remainingPlayers = () => {
    const lots = asArray(room.pool?.lots);
    return lots.slice((room.pool?.cursor ?? 0) + 1).map(l => players.byId[l.p]).filter(Boolean);
  };

  async function auctionTick(now) {
    const lot = room.lot;
    if (!room.pool) return;
    if (!lot) { await write(openNextLotUpdates(room, pack, players, now)); return; }
    const ctx = makeCtx(room, pack, players);
    if (lot.status === 'open') {
      if (now >= lot.endsAt + TIMING.graceMs) {
        await backend.transaction(`${base}/lot`, closeLotTxn({ now, room }));
        plan = null;
        return;
      }
      if (now < lot.biddingFrom) return;
      if (!plan || plan.seq !== lot.seq || plan.bids !== lot.bids) {
        const p = planBotBid(lot, room, { ...ctx, remaining: remainingPlayers() }, now, rng);
        plan = { seq: lot.seq, bids: lot.bids, ...(p || { none: true }) };
      }
      if (!plan.none && now >= plan.at) {
        const team = room.teams[plan.teamId];
        const player = ctx.playersById[lot.pid];
        const go = plan;
        plan = { ...plan, none: true };
        if (team && lotBidCheck(team, player, go.amount, ctx, lot).ok) {
          await backend.transaction(`${base}/lot`, bidTxn({ seq: lot.seq, teamId: go.teamId, amount: go.amount, now, timerMs: room.settings.timer * 1000 }));
        }
      }
      return;
    }
    if (lot.status === 'rtm') {
      const rtmTeam = room.teams[lot.rtm.team];
      if (rtmTeam?.type === 'bot' && now >= lot.closedAt + 1600) {
        const player = ctx.playersById[lot.pid];
        const ok = bidCheck(rtmTeam, player, lot.bid, ctx).ok && botWantsRtm(rtmTeam, player, lot.bid, { ...ctx, teams: room.teams, remaining: remainingPlayers() });
        await backend.transaction(`${base}/lot`, rtmTxn({ seq: lot.seq, teamId: rtmTeam.id, match: ok, now }));
      } else if (now >= lot.rtm.endsAt) {
        await backend.transaction(`${base}/lot`, rtmTxn({ seq: lot.seq, match: false, now, force: true }));
      }
      return;
    }
    if ((lot.status === 'sold' || lot.status === 'unsold') && !lot.processed) {
      await write(settleLotUpdates(room, pack, players, now));
      return;
    }
    if (lot.processed) {
      const pause = lot.status === 'sold' ? TIMING.soldPauseMs : lot.reason ? 900 : TIMING.unsoldPauseMs;
      if (now >= lot.closedAt + pause) await write(openNextLotUpdates(room, pack, players, now));
    }
  }

  async function draftTick(now) {
    const ctx = makeCtx(room, pack, players);
    const st = draftState(room, pack, ctx);
    if (!st) return;
    if (st.finished) { await write(finishDraftUpdates(room, pack, players, now)); return; }
    const team = room.teams[st.team];
    const turnStart = room.draft.turnEndsAt - TIMING.draftTurnMs;
    if (team?.type === 'bot' && now >= turnStart + 1100) {
      const available = asArray(room.candidates).filter(id => !st.taken.has(id)).map(id => ctx.playersById[id]).filter(Boolean);
      const vt = st.virtualTeam(team.id);
      const pick = botDraftPick(vt, available, { ...ctx, teams: room.teams }, st.modeFor(team.id));
      await backend.transaction(`${base}/draft`, draftTxn({ teamId: team.id, pid: pick?.pid || null, kind: pick?.kind, now, pack, room, ctx }));
      return;
    }
    if (now >= room.draft.turnEndsAt) {
      await backend.transaction(`${base}/draft`, draftTxn({ teamId: st.team, pid: null, now, pack, room, ctx }));
    }
  }

  async function lineupTick(now) {
    const teams = values(room.teams);
    if (teams.length && teams.every(t => room.lineups?.[t.id]?.locked)) await write(finalizeUpdates(room, pack, players, now));
  }

  async function tick(now) {
    const st = room?.meta?.status;
    if (st === 'retention') return draftTick(now);
    if (st === 'auction') return auctionTick(now);
    if (st === 'lineup') return lineupTick(now);
  }

  async function step() {
    if (busy || !room) return;
    busy = true;
    try { await tick(backend.now()); } catch (e) { onError(e); } finally { busy = false; }
  }

  return {
    step,
    start(ms = 150) { if (!timer) timer = setInterval(step, ms); },
    stop() { clearInterval(timer); timer = null; unsub(); },
    get room() { return room; },
  };
}

// ---------------------------------------------------------------- host-only one-shot actions
export const hostActions = ({ backend, code, pack, players }) => {
  const get = () => backend.get(`rooms/${code}`);
  const write = map => backend.update(prefix(code, map));
  return {
    async start() {
      await write({ lot: null, log: null, lineups: null, results: null, rtmTags: null, draft: null, pool: null, candidates: null });
      const room = await get();
      const seats = room.seats || {};
      const solo = room.meta.mode === 'solo';
      room.teams = Object.fromEntries(room.settings.teams.map(t => [t.id, { ownerUid: seats[t.id] || (solo && t.type === 'human' ? room.meta.hostUid : null) }]));
      const s = room.settings;
      s.teams = s.teams.map(t => ({ ...t, type: t.type === 'human' && !seats[t.id] && room.meta.mode !== 'solo' ? 'bot' : t.type === 'open' ? 'bot' : t.type }));
      await write({ settings: s });
      await write(startGameUpdates({ ...room, settings: s }, pack, players, backend.now()));
    },
    async pause() {
      const now = backend.now();
      await backend.transaction(`rooms/${code}/lot`, lot => {
        if (!lot || lot.status !== 'open') return undefined;
        lot.status = 'paused'; lot.pausedLeft = Math.max(1500, lot.endsAt - now); lot.pausedIntro = Math.max(0, lot.biddingFrom - now);
        return lot;
      });
    },
    async resume() {
      const now = backend.now();
      await backend.transaction(`rooms/${code}/lot`, lot => {
        if (!lot || lot.status !== 'paused') return undefined;
        lot.status = 'open'; lot.endsAt = now + lot.pausedLeft; lot.biddingFrom = now + (lot.pausedIntro || 0); lot.pausedLeft = null;
        return lot;
      });
    },
    async skip() {
      const now = backend.now();
      await backend.transaction(`rooms/${code}/lot`, lot => {
        if (!lot || !['open', 'paused'].includes(lot.status)) return undefined;
        lot.status = lot.leader ? 'sold' : 'unsold';
        if (lot.leader) { lot.winner = lot.leader; lot.via = 'auction'; } else lot.reason = 'Skipped by host';
        lot.closedAt = now;
        return lot;
      });
    },
    async endAuction() {
      const room = await get();
      await write(endAuctionUpdates(room, pack, players, backend.now(), 'Ended early by the host'));
    },
    async revealResults() {
      const room = await get();
      await write(finalizeUpdates(room, pack, players, backend.now()));
    },
    async playAgain() {
      await write({ 'meta/status': 'lobby', 'settings/seed': Math.floor(Math.random() * 1e9), teams: null, pool: null, lot: null, lineups: null, results: null, log: null, draft: null, rtmTags: null, candidates: null });
    },
  };
};
