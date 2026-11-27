import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Modal, useToast } from '../components/ui.jsx';
import PlayerCard, { PlayerRow, roleOf } from '../components/PlayerCard.jsx';
import PlayerDetail from '../components/PlayerDetail.jsx';
import { Reveal2D, SoldOverlay, TimerRing, UnsoldOverlay } from '../components/AuctionVisuals.jsx';
import { asArray, formatMoney, values } from '../engine/util.js';
import { lotBidCheck, purseLeft, purseMinor, remainingRequirements, squadEntries } from '../engine/rules.js';
import { makeCtx } from '../engine/game.js';
import { useNow } from '../hooks/useRoom.js';
import { say, sfx } from '../lib/sound.js';
import { markSlow, revealMode } from '../three/capability.js';
import { prefs } from '../lib/storage.js';
import { go } from '../lib/nav.js';

const RevealStage = lazy(() => import('../three/RevealStage.jsx'));

function Stage({ lot, player, pack, base, mode3d, setMode3d }) {
  if (!player) return null;
  if (mode3d === '3d') {
    return (
      <div className="stage-canvas">
        <Suspense fallback={<Reveal2D player={player} pack={pack} marquee={lot.marquee} lotKey={lot.seq} base={base} />}>
          <RevealStage player={player} pack={pack} marquee={lot.marquee} lotKey={lot.seq} onSlow={() => { if (prefs.get('reveal', 'auto') === '3d') return; markSlow(); setMode3d('2d'); }} />
        </Suspense>
      </div>
    );
  }
  return <Reveal2D player={player} pack={pack} marquee={lot.marquee} lotKey={lot.seq} base={base} />;
}

export function TeamCard({ team, room, pack, players, leading, mine, onClick }) {
  const s = room.settings;
  const ctx = { settings: s, playersById: players.byId, pack };
  const req = remainingRequirements(team, ctx);
  const left = purseLeft(team, s, pack);
  const total = purseMinor(s, pack);
  return (
    <div className={`tcard ${leading ? 'lead' : ''} ${mine ? 'mine' : ''}`} style={{ '--tc': team.color }} onClick={onClick}>
      <div className="row">
        <div className="tn grow">{team.name}{mine && <span className="tag gold">You</span>}{team.type === 'bot' && <span title="Bot">🤖</span>}</div>
        <div className="tp">{formatMoney(left, pack.currency)}</div>
      </div>
      <div className="meter"><i style={{ width: `${(100 * left) / total}%` }} /></div>
      <div className="tsub">
        <span>👥 {req.counts.size}/{s.squad.max}</span>
        {s.squad.overseasOn && <span>✈ {req.counts.overseas}/{s.squad.overseasMax}</span>}
        {req.roles.filter(r => r.need > 0).map(r => <span key={r.role} className="bad">needs {r.need} {r.role}</span>)}
        {team.rtmLeft > 0 && <span className="gold">RTM ×{team.rtmLeft}</span>}
      </div>
    </div>
  );
}

function SquadList({ team, pack, players, onPick }) {
  const entries = squadEntries(team).sort((a, b) => (a.at || 0) - (b.at || 0));
  if (!entries.length) return <div className="hint">No players yet.</div>;
  return (
    <div className="col" style={{ gap: 4 }}>
      {entries.map(e => {
        const p = players.byId[e.pid];
        return p && <PlayerRow key={e.pid} player={p} pack={pack} onClick={() => onPick(p)}
          right={<div className="num gold" style={{ fontSize: 15, textAlign: 'right' }}>{formatMoney(e.price, pack.currency)}{e.via !== 'auction' && <div className="hint">{e.via}</div>}</div>} />;
      })}
    </div>
  );
}

export default function Auction({ room, isHost, actions, myTeams, backend, pack, players, mode }) {
  const toast = useToast();
  const now = useNow(100, backend.now);
  const [mode3d, setMode3d] = useState(revealMode());
  const [detail, setDetail] = useState(null);
  const [viewTeam, setViewTeam] = useState(null);
  const [flash, setFlash] = useState(0);
  const lot = room.lot;
  const s = room.settings;
  const ctx = useMemo(() => makeCtx(room, pack, players), [room, pack, players]);
  const player = lot ? players.byId[lot.pid] : null;
  const teams = values(room.teams);
  const mine = myTeams.map(id => room.teams[id]).filter(Boolean);
  const left = lot ? (lot.status === 'paused' ? lot.pausedLeft : lot.endsAt - now) / 1000 : 0;
  const opensIn = lot ? (lot.biddingFrom - now) / 1000 : 0;
  const nextAmt = lot ? (lot.bid == null ? lot.base : lot.bid + ctx.increment(lot.bid)) : 0;
  const pool = room.pool || {};
  const lots = asArray(pool.lots);
  const log = useMemo(() => Object.entries(room.log || {}).sort((a, b) => (b[1].t - a[1].t) || (a[0] < b[0] ? 1 : -1)).map(x => x[1]), [room.log]);
  const sold = log.filter(l => l.kind === 'sold').length;
  const unsoldCount = asArray(pool.unsold).length;
  const remaining = Math.max(0, lots.length - (pool.cursor ?? 0) - 1);

  // ---- sounds + auctioneer calls on state changes
  const prev = useRef({});
  useEffect(() => {
    if (!lot) return;
    const p = prev.current;
    if (p.seq !== lot.seq) { sfx.reveal(lot.marquee); if (lot.marquee) setTimeout(() => say(`Marquee player. ${player?.name}`), 900); }
    else if (p.bids !== lot.bids && lot.bids > 0) {
      setFlash(f => f + 1);
      if (myTeams.includes(lot.leader)) sfx.bid(); else sfx.rivalBid();
    }
    if (p.status !== lot.status && p.seq === lot.seq) {
      if (lot.status === 'sold') { sfx.sold(); say(`Sold! to ${room.teams[lot.winner]?.name}`); }
      if (lot.status === 'unsold') { sfx.unsold(); }
      if (lot.status === 'rtm') { sfx.going(); say('Right to match!'); }
    }
    prev.current = { seq: lot.seq, bids: lot.bids, status: lot.status };
  }, [lot, myTeams, player, room.teams]);
  const callRef = useRef('');
  const call = lot && lot.status === 'open' && opensIn <= 0 ? (left <= 1.5 ? 'twice' : left <= 3 ? 'once' : '') : '';
  useEffect(() => {
    if (call && call !== callRef.current) {
      sfx.going();
      if (lot?.leader) say(call === 'once' ? 'Going once' : 'Going twice');
    }
    callRef.current = call;
  }, [call, lot?.leader]);
  const lastTick = useRef(0);
  useEffect(() => {
    if (lot?.status === 'open' && left > 0 && left <= 3 && Math.ceil(left) !== lastTick.current) { lastTick.current = Math.ceil(left); sfx.tick(); }
  }, [left, lot?.status]);

  const bid = useCallback(async (teamId, amount) => {
    const r = await actions.bid(teamId, amount);
    if (!r.ok) { sfx.error(); toast(r.reason, 'bad'); }
  }, [actions, toast]);

  // keyboard: space / enter = bid for your team; 1-9 for pass-and-play teams
  useEffect(() => {
    const k = e => {
      if (e.target.tagName === 'INPUT' || !lot || lot.status !== 'open') return;
      if ((e.code === 'Space' || e.key === 'Enter') && mine.length === 1) { e.preventDefault(); bid(mine[0].id, nextAmt); }
      const n = Number(e.key);
      if (n >= 1 && n <= mine.length) bid(mine[n - 1].id, nextAmt);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [lot, mine, nextAmt, bid]);

  const leader = lot?.leader ? room.teams[lot.leader] : null;
  const rtmTeam = lot?.status === 'rtm' ? room.teams[lot.rtm.team] : null;
  const myRtm = rtmTeam && myTeams.includes(rtmTeam.id);
  const focusTeam = mine[0];

  return (
    <div className="page wide">
      <div className="auction-layout">
        <aside className="auction-left col">
          <div className="counters">
            <div className="counter"><b>{remaining}</b><span>Remaining</span></div>
            <div className="counter"><b>{sold}</b><span>Sold</span></div>
            <div className="counter"><b>{unsoldCount}</b><span>Unsold</span></div>
          </div>
          <div className="team-strip">
            {teams.map(t => <TeamCard key={t.id} team={t} room={room} pack={pack} players={players} leading={lot?.leader === t.id && lot.status === 'open'} mine={myTeams.includes(t.id)} onClick={() => setViewTeam(t.id)} />)}
          </div>
        </aside>

        <main className="col" style={{ gap: 12, minWidth: 0 }}>
          <div className="stage">
            {lot && player && <Stage lot={lot} player={player} pack={pack} base={lot.base} mode3d={mode3d} setMode3d={setMode3d} />}
            <div className="stage-head">
              <span className="tag gold">{lot?.set || 'Auction'}</span>
              {pool.round > 1 && <span className="tag bad">{pool.round === 2 ? 'Round 2' : 'Supplementary'}</span>}
              {lot?.marquee && <span className="tag gold">★ Marquee</span>}
              <span className="spacer" />
              <span className="tag">Lot {lot?.seq || 0}</span>
              <button className="tag" style={{ border: 0, cursor: 'pointer' }} onClick={() => setMode3d(m => (m === '3d' ? '2d' : '3d'))}>{mode3d === '3d' ? '3D' : '2D'} ⇄</button>
            </div>
            {lot?.status === 'open' && opensIn > 0 && <div className="opens-in">Bidding opens in {Math.ceil(opensIn)}</div>}
            {lot?.status === 'paused' && <div className="status-call">PAUSED</div>}
            {call && <div key={call} className="status-call">{lot.leader ? (call === 'once' ? 'Going once…' : 'Going twice…') : 'Last call…'}</div>}
            {lot?.status === 'sold' && <SoldOverlay key={`s${lot.seq}`} team={room.teams[lot.winner]} price={lot.bid} currency={pack.currency} rtm={lot.via === 'rtm'} />}
            {lot?.status === 'unsold' && <UnsoldOverlay key={`u${lot.seq}`} reason={lot.reason} />}
            {lot?.status === 'rtm' && <div className="status-call" style={{ fontSize: 'clamp(28px,5vw,52px)' }}>RTM? {rtmTeam?.name} can match</div>}
            {!lot && <div className="center muted" style={{ paddingTop: 220 }}>Preparing the next player…</div>}

            {lot && player && (
              <div className="stage-bottom">
                <div className="row wrap" style={{ alignItems: 'flex-end' }}>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="lot-name">{player.name}</div>
                    <div className="lot-meta">
                      <span className="tag" style={{ color: roleOf(pack, player.role).color }}>{roleOf(pack, player.role).label}</span>
                      <span className="tag">{player.country}</span>
                      <span className="tag gold">OVR {player.ovr}</span>
                      <span className="tag">{player.status === 'retired' ? 'Legend' : 'Active'}</span>
                      <span className="tag">Base {formatMoney(lot.base, pack.currency)}</span>
                      <button className="tag" style={{ border: 0, cursor: 'pointer' }} onClick={() => setDetail(player)}>Stats & rating ›</button>
                    </div>
                  </div>
                </div>
                <div className="bid-bar">
                  <TimerRing left={lot.status === 'open' && opensIn <= 0 ? left : lot.status === 'open' ? s.timer : 0} total={s.timer} />
                  <div style={{ minWidth: 0 }}>
                    <div className="price-label">{lot.bid == null ? 'Base price' : 'Current bid'}</div>
                    <div key={flash} className={`price ${flash ? 'flash' : ''}`}>{formatMoney(lot.bid ?? lot.base, pack.currency)}</div>
                    <div className="leader">{leader ? <><span className="swatch" style={{ background: leader.color }} />{leader.name}{myTeams.includes(leader.id) && <span className="tag good">You lead</span>}</> : <span className="muted">No bids yet</span>}</div>
                  </div>
                  <div className="bid-actions">
                    {mine.length === 0 && <span className="muted">Spectating</span>}
                    {mine.map((t, i) => {
                      const chk = lotBidCheck(t, player, nextAmt, ctx, lot);
                      const can = lot.status === 'open' && opensIn <= 0 && chk.ok && lot.leader !== t.id;
                      return (
                        <div key={t.id} className="col" style={{ gap: 4, alignItems: 'flex-end' }}>
                          <button className={`bid-btn ${mine.length > 1 ? 'team' : ''} ${lot.leader === t.id ? 'leading' : ''}`} style={{ '--tc': t.color }} disabled={!can} onClick={() => bid(t.id, nextAmt)}>
                            {lot.leader === t.id ? 'LEADING' : `BID ${formatMoney(nextAmt, pack.currency)}`}
                            <small>{mine.length > 1 ? `${i + 1} · ${t.name}` : !chk.ok ? chk.reason : `Max ${formatMoney(chk.maxBid, pack.currency)}`}</small>
                          </button>
                          {mine.length === 1 && can && lot.bid != null && (
                            <div className="jump-row">
                              {[2, 4].map(k => {
                                let amt = lot.bid; for (let j = 0; j < k; j++) amt += ctx.increment(amt);
                                const ok = lotBidCheck(t, player, amt, ctx, lot).ok;
                                return <button key={k} className="btn small" disabled={!ok} onClick={() => bid(t.id, amt)}>Jump {formatMoney(amt, pack.currency)}</button>;
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
          {isHost && (
            <div className="row wrap">
              {lot?.status === 'paused' ? <Button size="small" onClick={() => actions.host.resume()}>▶ Resume</Button> : <Button size="small" onClick={() => actions.host.pause()} disabled={lot?.status !== 'open'}>⏸ Pause</Button>}
              <Button size="small" onClick={() => actions.host.skip()} disabled={!lot || !['open', 'paused'].includes(lot.status)}>⏭ Close lot now</Button>
              <span className="spacer" />
              <Button size="small" variant="danger" onClick={() => { if (window.confirm('End the auction now and go to team selection?')) actions.host.endAuction(); }}>End auction</Button>
            </div>
          )}
        </main>

        <aside className="auction-right col">
          {focusTeam && (
            <div className="panel tight">
              <div className="row" style={{ marginBottom: 8 }}><h3 style={{ margin: 0 }} className="grow">{mine.length > 1 ? 'Your teams' : 'Your squad'}</h3><span className="tag">{squadEntries(focusTeam).length}/{s.squad.max}</span></div>
              {mine.map(t => (
                <div key={t.id} style={{ marginBottom: 8 }}>
                  {mine.length > 1 && <div className="label" style={{ color: t.color }}>{t.name}</div>}
                  <div className="hint" style={{ marginBottom: 6 }}>Purse {formatMoney(purseLeft(t, s, pack), pack.currency)} · keep {formatMoney(Math.max(0, remainingRequirements(t, ctx).toMin) * ctx.minBase, pack.currency)} for minimum squad</div>
                  <SquadList team={t} pack={pack} players={players} onPick={setDetail} />
                </div>
              ))}
            </div>
          )}
          <div className="panel tight">
            <h3 style={{ marginBottom: 8 }}>Auction log</h3>
            <div className="log">
              {log.slice(0, 80).map((l, i) => (
                <div key={i} className={`li ${l.kind}`}>
                  <time>{new Date(l.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                  <div className="grow">{l.kind === 'sold'
                    ? <><b>{players.byId[l.pid]?.name}</b> → <span style={{ color: room.teams[l.team]?.color }}>{room.teams[l.team]?.name}</span> for <b>{formatMoney(l.price, pack.currency)}</b>{l.via === 'rtm' ? ' (RTM)' : ''}</>
                    : l.text}</div>
                </div>
              ))}
            </div>
          </div>
          {mode === 'solo' && <Button size="small" onClick={() => go('/')}>Save & exit (resume later)</Button>}
        </aside>
      </div>

      {myRtm && lot?.status === 'rtm' && (
        <Modal title="Right to Match!" onClose={() => actions.rtm(rtmTeam.id, false)}>
          <div className="col" style={{ gap: 12, alignItems: 'center' }}>
            <PlayerCard player={player} pack={pack} mini />
            <div className="center">{room.teams[lot.leader]?.name} won <b>{player.name}</b> for <b className="gold">{formatMoney(lot.bid, pack.currency)}</b>.<br />Use an RTM card to take him at that price? ({Math.max(0, Math.ceil((lot.rtm.endsAt - now) / 1000))}s)</div>
            <div className="row">
              <Button onClick={() => actions.rtm(rtmTeam.id, false)}>Let him go</Button>
              <Button variant="primary" disabled={!lotBidCheck(rtmTeam, player, lot.bid, ctx, lot).ok} onClick={() => actions.rtm(rtmTeam.id, true)}>Match {formatMoney(lot.bid, pack.currency)}</Button>
            </div>
          </div>
        </Modal>
      )}
      {detail && <PlayerDetail player={detail} pack={pack} onClose={() => setDetail(null)} />}
      {viewTeam && room.teams[viewTeam] && (
        <Modal title={room.teams[viewTeam].name} onClose={() => setViewTeam(null)}>
          <SquadList team={room.teams[viewTeam]} pack={pack} players={players} onPick={p => { setViewTeam(null); setDetail(p); }} />
        </Modal>
      )}
    </div>
  );
}
