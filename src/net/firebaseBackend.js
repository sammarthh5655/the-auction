/**
 * Firebase Realtime Database backend (online rooms) with anonymous auth.
 * Configure via .env.local (see .env.example). Set VITE_FIREBASE_EMULATORS=true to use the local emulators.
 */
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth';
import {
  connectDatabaseEmulator, get, getDatabase, onDisconnect, onValue, push, ref, runTransaction, update,
} from 'firebase/database';
import { clean } from './tree.js';

import { firebaseConfig, useEmulators } from './firebaseConfig.js';

let singleton = null;

export function createFirebaseBackend() {
  if (singleton) return singleton;
  const useEmu = useEmulators;
  const cfg = useEmu
    ? { apiKey: 'demo-key', projectId: 'demo-the-auction', databaseURL: 'http://127.0.0.1:9000?ns=demo-the-auction', ...Object.fromEntries(Object.entries(firebaseConfig).filter(([, v]) => v)) }
    : firebaseConfig;
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const db = getDatabase(app);
  if (useEmu) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectDatabaseEmulator(db, '127.0.0.1', 9000);
  }
  let offset = 0;
  onValue(ref(db, '.info/serverTimeOffset'), s => { offset = s.val() || 0; });

  let signingIn = null;
  const api = {
    kind: 'firebase', online: true,
    // always the user Firebase is really signed in as (the security rules check this uid)
    get uid() { return auth.currentUser?.uid || null; },
    now: () => Date.now() + offset,
    init() {
      // sign in exactly once, reusing a persisted anonymous user - parallel callers share the same promise
      signingIn ||= (async () => {
        await auth.authStateReady();
        if (!auth.currentUser) await signInAnonymously(auth);
        return { uid: auth.currentUser.uid };
      })().catch(err => { signingIn = null; throw err; });
      return signingIn;
    },
    subscribe(path, cb) { return onValue(ref(db, path), s => cb(s.val())); },
    async get(path) { return (await get(ref(db, path))).val(); },
    update(map) {
      const m = {};
      for (const [k, v] of Object.entries(map)) m[k] = clean(v);
      return update(ref(db), m);
    },
    async transaction(path, fn) {
      const res = await runTransaction(ref(db, path), cur => {
        const next = fn(cur === null ? null : JSON.parse(JSON.stringify(cur)));
        return next === undefined ? undefined : clean(next);
      }, { applyLocally: true });
      return { committed: res.committed, value: res.snapshot.val() };
    },
    async push(path, value) { const r = push(ref(db, path)); await update(r, clean(value)); return r.key; },
    onDisconnect(path, value) { onDisconnect(ref(db, path)).set(value); },
    async exists(path) { return (await get(ref(db, path))).exists(); },
  };
  singleton = api;
  return api;
}
