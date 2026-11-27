// Player-side actions. Each one validates locally, then commits through a transaction so that
// simultaneous bids from different devices are resolved by the database, not by luck.
import { bidTxn, draftTxn, makeCtx, rtmTxn } from '../engine/game.js';
import { lotBidCheck } from '../engine/rules.js';
import { hostActions } from './hostRunner.js';

export function makeActions({ backend, code, pack, players, getRoom }) {
  const base = `rooms/${code}`;
  const host = hostActions({ backend, code, pack, players });
  return {
    host,
    async bid(teamId, amount) {
      const room = getRoom();
      const lot = room?.lot;
      if (!lot) return { ok: false, reason: 'No player on the block' };
      const ctx = makeCtx(room, pack, players);
      const chk = lotBidCheck(room.teams[teamId], ctx.playersById[lot.pid], amount, ctx, lot);
      if (!chk.ok) return chk;
      const res = await backend.transaction(`${base}/lot`, bidTxn({ seq: lot.seq, teamId, amount, now: backend.now(), timerMs: room.settings.timer * 1000 }));
      return res.committed && res.value?.leader === teamId ? { ok: true } : { ok: false, reason: 'Outbid - someone got there first' };
    },
    async rtm(teamId, match) {
      const room = getRoom();
      return backend.transaction(`${base}/lot`, rtmTxn({ seq: room.lot.seq, teamId, match, now: backend.now() }));
    },
    async draft(teamId, pid, kind) {
      const room = getRoom();
      const ctx = makeCtx(room, pack, players);
      return backend.transaction(`${base}/draft`, draftTxn({ teamId, pid, kind, now: backend.now(), pack, room, ctx }));
    },
    async saveLineup(teamId, ids, locked) {
      await backend.update({ [`${base}/lineups/${teamId}`]: { ids, locked: !!locked } });
    },
    async updateSettings(settings) {
      await backend.update({ [`${base}/settings`]: settings });
    },
    async setMember(patch) {
      const up = {};
      for (const [k, v] of Object.entries(patch)) up[`${base}/members/${backend.uid}/${k}`] = v;
      await backend.update(up);
    },
  };
}
