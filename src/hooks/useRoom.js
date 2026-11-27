import { useEffect, useMemo, useRef, useState } from 'react';
import { createHostRunner } from '../net/hostRunner.js';
import { makeActions } from '../net/actions.js';

/** Subscribes to a room, exposes actions, and runs the host loop when this device is the host. */
export function useRoom({ backend, code, pack, players }) {
  const [room, setRoom] = useState(undefined);
  const roomRef = useRef(null);
  useEffect(() => {
    if (!backend || !code) return undefined;
    return backend.subscribe(`rooms/${code}`, r => { roomRef.current = r; setRoom(r); });
  }, [backend, code]);

  const isHost = !!room && room.meta?.hostUid === backend?.uid;
  useEffect(() => {
    if (!isHost || !players) return undefined;
    const runner = createHostRunner({ backend, code, pack, players });
    runner.start(150);
    return () => runner.stop();
  }, [isHost, backend, code, pack, players]);

  const actions = useMemo(() => (backend && players ? makeActions({ backend, code, pack, players, getRoom: () => roomRef.current }) : null),
    [backend, code, pack, players]);

  // presence for online rooms
  useEffect(() => {
    if (!backend?.online || !room?.members?.[backend.uid] || room.members[backend.uid].online) return;
    actions?.setMember({ online: true });
  }, [backend, room, actions]);

  const myTeams = useMemo(() => {
    if (!room) return [];
    const seats = room.seats || {};
    const owned = Object.entries(seats).filter(([, uid]) => uid === backend.uid).map(([t]) => t);
    if (room.teams) return Object.values(room.teams).filter(t => t.type === 'human' && (t.ownerUid === backend.uid || owned.includes(t.id))).map(t => t.id);
    return owned;
  }, [room, backend]);

  return { room, isHost, actions, myTeams, now: () => backend.now() };
}

/** Re-render on an interval (for timers). */
export function useNow(ms = 100, clock = Date.now) {
  const [, setT] = useState(0);
  useEffect(() => { const i = setInterval(() => setT(x => x + 1), ms); return () => clearInterval(i); }, [ms]);
  return clock();
}
