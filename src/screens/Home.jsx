import { useState } from 'react';
import { Button, Field, GavelIcon, Modal, useToast } from '../components/ui.jsx';
import { SPORTS } from '../sports/index.js';
import { go } from '../lib/nav.js';
import { playerName, setPlayerName } from '../lib/storage.js';
import { createOnlineRoom, createSoloRoom, getSoloBackend, joinOnlineRoom, onlineMode } from '../net/rooms.js';
import { sfx } from '../lib/sound.js';

export default function Home({ pack, sportId, onSport, players }) {
  const toast = useToast();
  const [dialog, setDialog] = useState(null); // 'create' | 'join'
  const [name, setName] = useState(playerName());
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const solo = getSoloBackend();
  const [hasSave] = useState(() => { let ok = false; solo.subscribe('rooms/SOLO/meta', m => { ok = !!m && m.sport === pack.id && m.status !== 'lobby'; })(); return ok; });
  const online = onlineMode();

  const startSolo = async () => { sfx.click(); await createSoloRoom(pack, name || 'You'); go('/solo'); };
  const doCreate = async () => {
    setBusy(true); setErr('');
    try { setPlayerName(name); const c = await createOnlineRoom(pack, name || 'Host'); go(`/room/${c}`); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const doJoin = async () => {
    setBusy(true); setErr('');
    try { setPlayerName(name); const c = code.trim().toUpperCase(); await joinOnlineRoom(c, name || 'Player'); go(`/room/${c}`); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="page">
      <section className="hero">
        <GavelIcon className="hero-gavel" size={90} />
        <div className="hero-kicker">Bid · Build · Win</div>
        <div className="hero-title">THE AUCTION</div>
        <p className="hero-sub">
          The school-bench auction game, IPL style - now for cricket and football. Bid for real players with a fixed purse, build the best squad, and let
          real stats decide whose team is better. No luck, no simulations - just the verdict.
        </p>
      </section>

      <div className="sport-tabs" role="tablist" aria-label="Sport">
        {SPORTS.map(s => (
          <button key={s.id} role="tab" aria-selected={sportId === s.id} className={`sport-tab ${sportId === s.id ? 'on' : ''} ${s.available ? '' : 'soon'}`}
            onClick={() => (s.available ? onSport(s.id) : toast(`${s.name} is coming soon - the engine is ready for it`))}>
            {!s.available && <span className="soon-badge">COMING SOON</span>}
            <span className="emoji">{s.emoji}</span>
            <span><span className="name">{s.name}</span><br /><span className="sub">{s.tagline}</span></span>
          </button>
        ))}
      </div>

      <div className="mode-cards">
        <button className="mode-card" onClick={startSolo} disabled={!players}>
          <span className="big-emoji">🤖</span>
          <h2>Play solo</h2>
          <p>You against AI bidders (easy, medium or hard). Or pass-and-play: give several teams to humans on this one device.</p>
        </button>
        <button className="mode-card" onClick={() => { setErr(''); setDialog('create'); }}>
          <span className="big-emoji">📡</span>
          <h2>Create room</h2>
          <p>Host an online auction. Share the room code, friends join from their own phones, bots fill empty seats.</p>
        </button>
        <button className="mode-card" onClick={() => { setErr(''); setDialog('join'); }}>
          <span className="big-emoji">🎟️</span>
          <h2>Join room</h2>
          <p>Got a code from a friend? Jump in, claim a team and get your paddle ready.</p>
        </button>
      </div>
      {hasSave && <div className="center" style={{ marginTop: 16 }}><Button variant="primary" onClick={() => go('/solo')}>Resume your solo auction</Button></div>}

      <div className="feature-strip">
        <div className="feature"><b>{players ? players.length.toLocaleString() : '…'} real players</b>{pack.homeBlurb}</div>
        <div className="feature"><b>Transparent ratings</b>Era-adjusted percentile scores by role. Every card shows exactly how its rating was made.</div>
        <div className="feature"><b>3D player reveals</b>Spotlight, smoke and a spinning pedestal - each player in their signature pose.</div>
        <div className="feature"><b>The verdict</b>Pick your Playing XI. The site compares batting, bowling, balance and more - and names the winner.</div>
      </div>
      <div className="center" style={{ marginTop: 18 }}>
        <Button size="small" variant="ghost" onClick={() => go('/players')}>Browse player database</Button>
        <Button size="small" variant="ghost" onClick={() => go('/creator')}>Character creator</Button>
        <Button size="small" variant="ghost" onClick={() => go('/how')}>How to play</Button>
      </div>

      {dialog && (
        <Modal title={dialog === 'create' ? 'Create an online room' : 'Join a room'} onClose={() => setDialog(null)}>
          <div className="col" style={{ gap: 14 }}>
            {!online && <div className="note">Online rooms need Firebase keys in <code>.env.local</code> (see README). To try multiplayer without Firebase, open this site with <code>?backend=tabs</code> and play across two browser tabs.</div>}
            {online === 'tabs' && <div className="note">Test mode: rooms are shared between tabs of this browser only.</div>}
            <Field label="Your name"><input className="input" value={name} maxLength={20} onChange={e => setName(e.target.value)} placeholder="e.g. Rahul" autoFocus /></Field>
            {dialog === 'join' && <Field label="Room code"><input className="input" value={code} maxLength={6} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="ABCDE" style={{ fontFamily: 'var(--display)', fontSize: 28, letterSpacing: '0.3em' }} /></Field>}
            {err && <div className="err">{err}</div>}
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <Button onClick={() => setDialog(null)}>Cancel</Button>
              <Button variant="primary" disabled={busy || !online || (dialog === 'join' && code.trim().length < 4)} onClick={dialog === 'create' ? doCreate : doJoin}>
                {busy ? 'Connecting…' : dialog === 'create' ? 'Create room' : 'Join'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
