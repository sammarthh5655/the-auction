import { useEffect, useMemo, useState } from 'react';
import { Button, useToast } from '../components/ui.jsx';
import { PlayerRow } from '../components/PlayerCard.jsx';
import PlayerDetail from '../components/PlayerDetail.jsx';
import { asArray, formatMoney, values } from '../engine/util.js';

export function LineupEditor({ team, room, pack, players, onSave, locked }) {
  const toast = useToast();
  const squad = useMemo(() => Object.keys(team.squad || {}).map(id => players.byId[id]).filter(Boolean).sort((a, b) => b.ovr - a.ovr), [team, players]);
  const saved = asArray(room.lineups?.[team.id]?.ids);
  const [ids, setIds] = useState(saved);
  const [detail, setDetail] = useState(null);
  useEffect(() => { setIds(asArray(room.lineups?.[team.id]?.ids)); }, [room.lineups, team.id]);
  const size = pack.lineupSize;
  const xi = ids.map(id => players.byId[id]).filter(Boolean);
  const ev = pack.evaluateLineup(xi, room.settings);
  const os = xi.filter(p => p.overseas).length;
  const osMax = room.settings.squad.lineupOverseasMax;
  const toggle = p => {
    if (locked) return;
    if (ids.includes(p.id)) setIds(ids.filter(x => x !== p.id));
    else if (ids.length >= size) toast(`${pack.labels.lineup} is full - remove someone first`, 'bad');
    else setIds([...ids, p.id]);
  };
  const auto = () => setIds(pack.autoPickLineup(squad, room.settings));
  return (
    <div className="xi-layout">
      <div className="panel">
        <div className="row" style={{ marginBottom: 10 }}>
          <h3 className="grow" style={{ margin: 0, color: team.color }}>{team.name} · squad ({squad.length})</h3>
          {!locked && <Button size="small" onClick={auto}>✨ Auto-pick best XI</Button>}
        </div>
        <div className="hint" style={{ marginBottom: 8 }}>Tap players to add / remove them from your {pack.labels.lineup}.</div>
        <div className="col" style={{ gap: 4 }}>
          {squad.map(p => (
            <PlayerRow key={p.id} player={p} pack={pack} selected={ids.includes(p.id)} onClick={() => toggle(p)}
              sub={<span className="dim"> · bat {p.rating.batting} · bowl {p.rating.bowling}</span>}
              right={<div className="row" style={{ gap: 6 }}>
                <span className="num gold" style={{ fontSize: 14 }}>{formatMoney(team.squad[p.id]?.price, pack.currency)}</span>
                <button className="btn small ghost" onClick={e => { e.stopPropagation(); setDetail(p); }}>ⓘ</button>
              </div>} />
          ))}
        </div>
      </div>
      <div className="col" style={{ gap: 12 }}>
        <div className="panel">
          <div className="row"><h3 className="grow" style={{ margin: 0 }}>{pack.labels.lineup}</h3><span className="tag">{xi.length}/{size}</span>{room.settings.squad.overseasOn && <span className={`tag ${os > osMax ? 'bad' : ''}`}>OS {os}/{osMax}</span>}</div>
          <div className="col" style={{ gap: 4, marginTop: 10 }}>
            {Array.from({ length: size }, (_, i) => {
              const p = xi[i];
              return <div key={i} className="xi-slot"><span className="no">{i + 1}</span>{p ? <div className="grow"><PlayerRow player={p} pack={pack} onClick={() => toggle(p)} /></div> : <span className="dim">Empty slot</span>}</div>;
            })}
          </div>
          <div className="divider" />
          <div className="row"><span className="grow label">Projected team score</span><span className="num gold" style={{ fontSize: 28 }}>{ev.total.toFixed(1)}</span></div>
          {ev.issues.map(x => <div key={x} className="hint bad">⚠ {x}</div>)}
          {!locked && <Button variant="primary" style={{ width: '100%', marginTop: 12 }} onClick={() => onSave(ids, true)}>Lock in {pack.labels.lineup}</Button>}
          {locked && <div className="note" style={{ marginTop: 12 }}>Locked in. Waiting for the other teams…</div>}
          {!locked && ids.join() !== saved.join() && <Button size="small" style={{ width: '100%', marginTop: 8 }} onClick={() => onSave(ids, false)}>Save draft</Button>}
        </div>
      </div>
      {detail && <PlayerDetail player={detail} pack={pack} onClose={() => setDetail(null)} />}
    </div>
  );
}

export default function Lineup({ room, isHost, actions, myTeams, pack, players }) {
  const mine = myTeams.map(id => room.teams[id]).filter(Boolean);
  const [active, setActive] = useState(mine[0]?.id);
  const team = room.teams[active] || mine[0];
  const teams = values(room.teams);
  const lockedCount = teams.filter(t => room.lineups?.[t.id]?.locked).length;
  return (
    <div className="page wide">
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <div className="grow">
          <div className="section-title">Pick your {pack.labels.lineup}</div>
          <div className="muted">The auction is over. Choose your best eleven (or let auto-pick do it). Then the site decides whose team is better.</div>
        </div>
        <span className="tag gold">{lockedCount}/{teams.length} locked</span>
        {isHost && <Button variant="primary" onClick={() => actions.host.revealResults()}>Reveal verdict now</Button>}
      </div>
      {mine.length > 1 && (
        <div className="row wrap" style={{ marginBottom: 12 }}>
          {mine.map(t => <Button key={t.id} size="small" variant={t.id === team?.id ? 'primary' : ''} onClick={() => setActive(t.id)}>{t.name}{room.lineups?.[t.id]?.locked ? ' ✓' : ''}</Button>)}
        </div>
      )}
      {team ? <LineupEditor key={team.id} team={team} room={room} pack={pack} players={players} locked={!!room.lineups?.[team.id]?.locked}
        onSave={(ids, lock) => actions.saveLineup(team.id, ids, lock)} />
        : <div className="panel muted">You are spectating. Waiting for teams to lock their lineups…</div>}
    </div>
  );
}
