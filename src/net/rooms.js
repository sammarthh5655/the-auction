// Room lifecycle: create, join, seat claiming, presence. Works with any backend.
import { makeRoomCode } from '../engine/util.js';
import { defaultSettings, makeTeams } from '../engine/settings.js';
import { createMemoryBackend } from './memoryBackend.js';
import { createTabsBackend } from './tabsBackend.js';
import { firebaseConfigured } from './firebaseConfig.js';

export const SOLO_CODE = 'SOLO';
let soloBackend = null;
let onlineBackend = null;

export function getSoloBackend() {
  if (!soloBackend) soloBackend = createMemoryBackend({ uid: 'solo-player', persistKey: 'the-auction:solo-save' });
  return soloBackend;
}

export function onlineMode() {
  const q = new URLSearchParams(window.location.search);
  if (q.get('backend') === 'tabs') return 'tabs';
  return firebaseConfigured ? 'firebase' : null;
}

let onlineReady = null;
export function getOnlineBackend() {
  // one shared promise: every caller waits for the same, fully signed-in backend
  onlineReady ||= (async () => {
    const mode = onlineMode();
    if (!mode) throw new Error('Online play is not configured. Add your Firebase keys to .env.local (see README) - or open the app with ?backend=tabs to test multiplayer across browser tabs.');
    const b = mode === 'tabs' ? createTabsBackend() : (await import('./firebaseBackend.js')).createFirebaseBackend();
    await b.init();
    onlineBackend = b;
    return b;
  })().catch(e => { onlineReady = null; throw e; });
  return onlineReady;
}

export function newRoomData({ code, pack, uid, name, mode, settings }) {
  const s = settings || defaultSettings(pack);
  if (!settings) s.teams = makeTeams(s.teamCount, 1);
  return {
    meta: { code, hostUid: uid, status: 'lobby', mode, sport: pack.id, createdAt: Date.now() },
    settings: s,
    members: { [uid]: { name: name || 'Host', joinedAt: Date.now(), online: true } },
    seats: { [s.teams[0].id]: uid },
  };
}

export async function createSoloRoom(pack, name, settings) {
  const b = getSoloBackend();
  b.clear();
  const s = settings || defaultSettings(pack);
  if (!settings) s.teams = makeTeams(s.teamCount, 1);
  s.teams = s.teams.map((t, i) => ({ ...t, type: i === 0 ? 'human' : t.type === 'human' ? 'human' : 'bot' }));
  const data = newRoomData({ code: SOLO_CODE, pack, uid: b.uid, name, mode: 'solo', settings: s });
  // in solo every human seat is controlled from this device
  data.seats = Object.fromEntries(s.teams.filter(t => t.type === 'human').map(t => [t.id, b.uid]));
  await b.update({ [`rooms/${SOLO_CODE}`]: data });
  return SOLO_CODE;
}

export async function createOnlineRoom(pack, name) {
  const b = await getOnlineBackend();
  let code;
  for (let i = 0; i < 6; i++) {
    code = makeRoomCode();
    if (!(await b.exists(`rooms/${code}/meta`))) break;
  }
  // write each child separately so per-node security rules apply (see database.rules.json)
  const data = newRoomData({ code, pack, uid: b.uid, name, mode: 'online' });
  const up = {};
  for (const [k, v] of Object.entries(data)) {
    // members/seats are written per entry - the rules only allow writing your own member record / seat
    if (k === 'members' || k === 'seats') for (const [id, x] of Object.entries(v)) up[`rooms/${code}/${k}/${id}`] = x;
    else up[`rooms/${code}/${k}`] = v;
  }
  await b.update(up);
  b.onDisconnect(`rooms/${code}/members/${b.uid}/online`, false);
  return code;
}

export async function joinOnlineRoom(code, name) {
  const b = await getOnlineBackend();
  const meta = await b.get(`rooms/${code}/meta`);
  if (!meta) throw new Error(`Room ${code} does not exist.`);
  await b.update({ [`rooms/${code}/members/${b.uid}`]: { name: name || 'Player', joinedAt: Date.now(), online: true } });
  b.onDisconnect(`rooms/${code}/members/${b.uid}/online`, false);
  return meta;
}

export async function claimSeat(b, code, teamId) {
  // release any other seat first
  const seats = (await b.get(`rooms/${code}/seats`)) || {};
  const up = {};
  for (const [t, uid] of Object.entries(seats)) if (uid === b.uid && t !== teamId) up[`rooms/${code}/seats/${t}`] = null;
  if (Object.keys(up).length) await b.update(up);
  return b.transaction(`rooms/${code}/seats/${teamId}`, cur => (cur && cur !== b.uid ? undefined : b.uid));
}

export async function leaveSeat(b, code, teamId) {
  return b.transaction(`rooms/${code}/seats/${teamId}`, cur => (cur === b.uid ? null : undefined));
}
