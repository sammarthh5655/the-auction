import { lazy, Suspense, useEffect, useState } from 'react';
import { GavelIcon, ToastProvider } from './components/ui.jsx';
import { getSport } from './sports/index.js';
import { useSportData } from './hooks/useSportData.js';
import { isMuted, onMuteChange, setMuted, sfx } from './lib/sound.js';
import { prefs } from './lib/storage.js';
import Home from './screens/Home.jsx';
import RoomScreen from './screens/RoomScreen.jsx';

const Database = lazy(() => import('./screens/Database.jsx'));
const SharedResult = lazy(() => import('./screens/SharedResult.jsx'));
const Creator = lazy(() => import('./screens/Creator.jsx'));
const HowTo = lazy(() => import('./screens/HowTo.jsx'));

function parseHash() {
  const h = window.location.hash.replace(/^#\/?/, '');
  const [name, ...rest] = h.split('/');
  if (name === 'solo') return { name: 'room', mode: 'solo', code: 'SOLO' };
  if (name === 'room' && rest[0]) return { name: 'room', mode: 'online', code: rest[0].toUpperCase() };
  if (name === 'players') return { name: 'players' };
  if (name === 'creator') return { name: 'creator', id: rest[0] };
  if (name === 'how') return { name: 'how' };
  if (name === 'r' && rest[0]) return { name: 'share', data: rest.join('/') };
  return { name: 'home' };
}
import { go } from './lib/nav.js';

function MuteButton() {
  const [m, setM] = useState(isMuted());
  useEffect(() => onMuteChange(setM), []);
  return (
    <button className="btn icon-btn" title={m ? 'Unmute' : 'Mute'} aria-label={m ? 'Unmute sound' : 'Mute sound'} onClick={() => { setMuted(!m); if (m) sfx.click(); }}>
      {m ? '🔇' : '🔊'}
    </button>
  );
}

function RevealPref() {
  const [v, setV] = useState(prefs.get('reveal', 'auto'));
  const next = { auto: '3d', '3d': '2d', '2d': 'auto' };
  const label = { auto: 'Auto', '3d': '3D', '2d': '2D' };
  return (
    <button className="btn small hide-sm" title="Player reveal: Auto picks 2D on weak phones" onClick={() => { const n = next[v]; prefs.set('reveal', n); setV(n); }}>
      Reveal: {label[v]}
    </button>
  );
}

export default function App() {
  const [route, setRoute] = useState(parseHash());
  const [sportId, setSportId] = useState(prefs.get('sport', 'cricket'));
  useEffect(() => {
    const f = () => setRoute(parseHash());
    window.addEventListener('hashchange', f);
    const unlock = () => sfx.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('hashchange', f);
  }, []);
  const pack = getSport(sportId);
  const data = useSportData(pack);
  const chooseSport = id => { setSportId(id); prefs.set('sport', id); };

  return (
    <ToastProvider>
      <div className="app">
        <header className="topbar">
          <div className="brand" onClick={() => go('/')} role="link" aria-label="Home">
            <GavelIcon className="brand-mark" />
            <div><div className="brand-name">THE AUCTION</div><div className="brand-sub">{pack.emoji} {pack.name} edition</div></div>
          </div>
          <div className="spacer" />
          <button className="btn small ghost hide-sm" onClick={() => go('/players')}>Players</button>
          <button className="btn small ghost hide-sm" onClick={() => go('/how')}>How to play</button>
          <RevealPref />
          <MuteButton />
        </header>
        <Suspense fallback={<div className="page center muted">Loading…</div>}>
          {data.error && <div className="page"><div className="err">{String(data.error.message || data.error)}</div></div>}
          {route.name === 'home' && <Home pack={pack} sportId={sportId} onSport={chooseSport} players={data.players} />}
          {route.name === 'room' && (data.players
            ? <RoomScreen key={`${route.mode}-${route.code}`} mode={route.mode} code={route.code} pack={pack} players={data.players} />
            : <div className="page center muted">Loading player database…</div>)}
          {route.name === 'players' && data.players && <Database pack={pack} players={data.players} />}
          {route.name === 'creator' && data.players && <Creator key={route.id || 'new'} pack={pack} players={data.players} initialId={route.id} />}
          {route.name === 'how' && <HowTo pack={pack} />}
          {route.name === 'share' && data.players && <SharedResult data={route.data} pack={pack} players={data.players} />}
        </Suspense>
      </div>
    </ToastProvider>
  );
}
