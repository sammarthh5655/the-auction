import { useMemo, useState } from 'react';
import { Button, Seg } from '../components/ui.jsx';
import { PlayerRow } from '../components/PlayerCard.jsx';
import PlayerDetail from '../components/PlayerDetail.jsx';
import { draftState, makeCtx } from '../engine/game.js';
import { bidCheck } from '../engine/rules.js';
import { asArray, formatMoney } from '../engine/util.js';
import { useNow } from '../hooks/useRoom.js';

export default function Draft({ room, actions, myTeams, backend, pack, players }) {
  const now = useNow(250, backend.now);
  const ctx = useMemo(() => makeCtx(room, pack, players), [room, pack, players]);
  const st = draftState(room, pack, ctx);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('all');
  const [detail, setDetail] = useState(null);
  if (!st) return null;
  const turnTeam = room.teams[st.team];
  const myTurn = turnTeam && myTeams.includes(turnTeam.id);
  const mode = turnTeam ? st.modeFor(turnTeam.id) : {};
  const left = Math.max(0, Math.ceil((room.draft.turnEndsAt - now) / 1000));
  const available = asArray(room.candidates).filter(id => !st.taken.has(id)).map(id => players.byId[id]).filter(Boolean)
    .filter(p => (role === 'all' || p.role === role) && (!q || p.name.toLowerCase().includes(q.toLowerCase())));
  const s = room.settings;

  return (
    <div className="page wide">
      <div className="section-title">Retention & RTM draft</div>
      <div className="muted" style={{ marginBottom: 14 }}>
        Teams take turns in snake order. <b>Retain</b> keeps a player now at a fixed slab price. <b>RTM tag</b> sends him into the auction, and if a rival buys him you can match the final bid.
      </div>
      <div className="xi-layout">
        <div className="panel">
          <div className="row wrap" style={{ marginBottom: 12 }}>
            <div className="grow">
              <div className="label">On the clock</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 34, color: turnTeam?.color }}>{turnTeam?.name || '…'}{myTurn && <span className="tag good" style={{ marginLeft: 8 }}>Your pick</span>}</div>
              <div className="hint">{mode.canRetain ? `Retain price now: ${formatMoney(mode.cost, pack.currency)}` : 'No retentions left'} · {mode.canTag ? 'RTM tag available' : 'No RTM tags left'} · {left}s</div>
            </div>
            {myTurn && <Button onClick={() => actions.draft(turnTeam.id, null)}>I'm done</Button>}
          </div>
          <div className="row wrap" style={{ marginBottom: 10 }}>
            <input className="input" style={{ maxWidth: 260 }} placeholder="Search players" value={q} onChange={e => setQ(e.target.value)} />
            <Seg value={role} onChange={setRole} options={[{ value: 'all', label: 'All' }, ...pack.roles.map(r => ({ value: r.key, label: r.key }))]} />
          </div>
          <div className="col" style={{ gap: 4, maxHeight: 560, overflow: 'auto' }}>
            {available.slice(0, 120).map(p => {
              const canRetain = myTurn && mode.canRetain && bidCheck(st.virtualTeam(turnTeam.id), p, mode.cost, ctx).ok;
              return (
                <PlayerRow key={p.id} player={p} pack={pack} onClick={() => setDetail(p)} right={myTurn && (
                  <div className="row" style={{ gap: 6 }} onClick={e => e.stopPropagation()}>
                    {mode.canRetain && <Button size="small" variant="primary" disabled={!canRetain} onClick={() => actions.draft(turnTeam.id, p.id, 'retain')}>Retain</Button>}
                    {mode.canTag && <Button size="small" onClick={() => actions.draft(turnTeam.id, p.id, 'rtm')}>RTM tag</Button>}
                  </div>
                )} />
              );
            })}
          </div>
        </div>
        <div className="col" style={{ gap: 12 }}>
          {s.teams.map(t => {
            const picks = st.picks.filter(p => p.team === t.id);
            return (
              <div key={t.id} className="tcard" style={{ '--tc': t.color }}>
                <div className="tn">{t.name}{st.done[t.id] && <span className="tag">done</span>}</div>
                {picks.length === 0 && <div className="hint">No picks yet</div>}
                {picks.map(p => <div key={p.pid} className="tsub"><span className="grow">{players.byId[p.pid]?.name}</span><span className={p.kind === 'retain' ? 'gold' : ''}>{p.kind === 'retain' ? formatMoney(p.cost, pack.currency) : 'RTM'}</span></div>)}
              </div>
            );
          })}
        </div>
      </div>
      {detail && <PlayerDetail player={detail} pack={pack} onClose={() => setDetail(null)} />}
    </div>
  );
}
