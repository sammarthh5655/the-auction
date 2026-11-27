import { useEffect, useState } from 'react';
import { Button, Field } from '../components/ui.jsx';
import { useRoom } from '../hooks/useRoom.js';
import { getOnlineBackend, getSoloBackend, joinOnlineRoom } from '../net/rooms.js';
import { playerName, setPlayerName } from '../lib/storage.js';
import { go } from '../lib/nav.js';
import Lobby from './Lobby.jsx';
import Draft from './Draft.jsx';
import Auction from './Auction.jsx';
import Lineup from './Lineup.jsx';
import Results from './Results.jsx';

function JoinGate({ code, onJoined }) {
  const [name, setName] = useState(playerName());
  const [err, setErr] = useState('');
  const join = async () => {
    try { setPlayerName(name); await joinOnlineRoom(code, name || 'Player'); onJoined(); } catch (e) { setErr(e.message); }
  };
  return (
    <div className="page" style={{ maxWidth: 480 }}>
      <div className="panel col" style={{ gap: 14 }}>
        <h3>Join room {code}</h3>
        <Field label="Your name"><input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus maxLength={20} /></Field>
        {err && <div className="err">{err}</div>}
        <Button variant="primary" onClick={join}>Join auction</Button>
      </div>
    </div>
  );
}

export default function RoomScreen({ mode, code, pack, players }) {
  const [backend, setBackend] = useState(mode === 'solo' ? getSoloBackend() : null);
  const [err, setErr] = useState('');
  const [joined, setJoined] = useState(mode === 'solo');
  useEffect(() => {
    if (mode === 'solo') return;
    getOnlineBackend().then(setBackend, e => setErr(e.message));
  }, [mode]);
  const r = useRoom({ backend, code, pack, players });

  if (err) return <div className="page"><div className="err">{err}</div><div style={{ marginTop: 12 }}><Button onClick={() => go('/')}>Home</Button></div></div>;
  if (!backend || r.room === undefined) return <div className="page center muted">Connecting…</div>;
  if (r.room === null) {
    return (
      <div className="page center col" style={{ alignItems: 'center', gap: 14 }}>
        <div className="muted">{mode === 'solo' ? 'No solo game in progress.' : `Room ${code} was not found.`}</div>
        <Button variant="primary" onClick={() => go('/')}>Back home</Button>
      </div>
    );
  }
  const isMember = !!r.room.members?.[backend.uid];
  if (mode === 'online' && !isMember && !joined) return <JoinGate code={code} onJoined={() => setJoined(true)} />;
  if (r.room.meta.sport !== pack.id) return <div className="page"><div className="note">This room plays {r.room.meta.sport}. Switch sport on the home screen.</div></div>;

  const props = { ...r, backend, pack, players, code, mode };
  switch (r.room.meta.status) {
    case 'lobby': return <Lobby {...props} />;
    case 'retention': return <Draft {...props} />;
    case 'auction': return <Auction {...props} />;
    case 'lineup': return <Lineup {...props} />;
    case 'results': return <Results {...props} />;
    default: return <div className="page muted">Unknown state.</div>;
  }
}
