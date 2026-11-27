import { useEffect, useMemo, useState } from 'react';
import { Button, useToast } from '../components/ui.jsx';
import { PlayerRow } from '../components/PlayerCard.jsx';
import PlayerDetail from '../components/PlayerDetail.jsx';
import { computeResults } from '../engine/game.js';
import { asArray, formatMoney, ordinal } from '../engine/util.js';
import { shareUrl } from '../lib/share.js';
import { sfx, say } from '../lib/sound.js';
import { go } from '../lib/nav.js';

export function explain(a, b, ta, tb, pack, players) {
  const evA = pack.evaluateLineup(asArray(a.ids).map(id => players.byId[id]).filter(Boolean), {});
  const wins = [], losses = [];
  if (b && Math.abs(a.total - b.total) < 0.05) {
    return `${ta.name} and ${tb.name} are dead level on ${a.total.toFixed(1)} - neither team is better on the numbers.`;
  }
  for (const c of evA.cats) {
    const d = a.cats[c.key] - (b ? b.cats[c.key] : 0);
    if (d > 0.5) wins.push({ ...c, d }); else if (d < -0.5) losses.push({ ...c, d: -d });
  }
  wins.sort((x, y) => y.d * y.weight - x.d * x.weight);
  losses.sort((x, y) => y.d * y.weight - x.d * x.weight);
  const stars = asArray(a.ids).map(id => players.byId[id]).filter(Boolean).sort((x, y) => y.ovr - x.ovr).slice(0, 3);
  let txt = `${ta.name} ${b ? `beat ${tb.name} ${a.total.toFixed(1)} to ${b.total.toFixed(1)}` : `scored ${a.total.toFixed(1)}`}`;
  if (wins.length) txt += `, winning ${wins.length} of ${evA.cats.length} categories - biggest edges in ${wins.slice(0, 3).map(w => `${w.label.toLowerCase()} (+${w.d.toFixed(1)})`).join(', ')}`;
  txt += '.';
  if (stars.length) txt += ` Led by ${stars.map(p => `${p.name} (${p.ovr})`).join(', ')}.`;
  if (losses.length && tb) txt += ` ${tb.name} had the better ${losses.slice(0, 2).map(l => l.label.toLowerCase()).join(' and ')}, but not by enough.`;
  if (a.issues?.length) txt += ` Weak spot: ${a.issues[0].toLowerCase()}.`;
  return txt;
}

function HeadToHead({ res, teams, pack, players }) {
  const [ai, setA] = useState(res.ranking[0]?.teamId);
  const [bi, setB] = useState(res.ranking[1]?.teamId);
  const A = res.ranking.find(r => r.teamId === ai), B = res.ranking.find(r => r.teamId === bi);
  if (!A || !B) return null;
  const cats = pack.evaluateLineup([], {}).cats;
  const ta = teams[ai], tb = teams[bi];
  return (
    <div className="panel">
      <h3>Head to head</h3>
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <select className="input" style={{ maxWidth: 220 }} value={ai} onChange={e => setA(e.target.value)}>{res.ranking.map(r => <option key={r.teamId} value={r.teamId}>{teams[r.teamId].name}</option>)}</select>
        <span className="muted">vs</span>
        <select className="input" style={{ maxWidth: 220 }} value={bi} onChange={e => setB(e.target.value)}>{res.ranking.map(r => <option key={r.teamId} value={r.teamId}>{teams[r.teamId].name}</option>)}</select>
      </div>
      <div className="h2h">
        <div className="side l" style={{ fontFamily: 'var(--display)', fontSize: 22, color: ta.color, justifyContent: 'flex-start' }}>{ta.name}</div>
        <div className="cat">Category</div>
        <div className="side" style={{ fontFamily: 'var(--display)', fontSize: 22, color: tb.color }}>{tb.name}</div>
        {[...cats, { key: '__total', label: 'Team score' }].map(c => {
          const va = c.key === '__total' ? A.total : A.cats[c.key], vb = c.key === '__total' ? B.total : B.cats[c.key];
          return [
            <div key={c.key + 'a'} className="side l"><span className={`v ${va > vb ? 'win' : ''}`}>{va.toFixed(0)}</span><div className="bar"><i style={{ width: `${Math.min(100, va)}%`, background: ta.color }} /></div></div>,
            <div key={c.key + 'c'} className="cat" title={c.hint}>{c.label}{c.weight ? ` · ${Math.round(c.weight * 100)}%` : ''}</div>,
            <div key={c.key + 'b'} className="side"><div className="bar"><i style={{ width: `${Math.min(100, vb)}%`, background: tb.color }} /></div><span className={`v ${vb > va ? 'win' : ''}`}>{vb.toFixed(0)}</span></div>,
          ];
        })}
      </div>
      <div className="hint" style={{ marginTop: 12, lineHeight: 1.5 }}>{explain(A, B, ta, tb, pack, players)}</div>
    </div>
  );
}

export function ResultsView({ teams, lineups, settings, pack, players, results, footer, squads }) {
  const toastRoom = useMemo(() => ({ teams, lineups, settings }), [teams, lineups, settings]);
  const res = useMemo(() => results || computeResults(toastRoom, pack, players), [results, toastRoom, pack, players]);
  const [open, setOpen] = useState(null);
  const [detail, setDetail] = useState(null);
  useEffect(() => { sfx.win(); say(`The verdict. ${teams[res.winner]?.name} have the best team.`); }, [res.winner, teams]);
  const top = res.ranking[0], second = res.ranking[1];
  const tw = teams[res.winner];
  const tie = !!second && Math.abs(top.total - second.total) < 0.05;
  const cats = pack.evaluateLineup([], {}).cats;
  return (
    <div className="col" style={{ gap: 16 }}>
      <div className="verdict" style={{ '--tc': tw?.color }}>
        <div className="crown">🏆</div>
        <div className="kicker">The verdict</div>
        <div className="winner">{tie ? 'Dead heat' : tw?.name}</div>
        <div className="kicker" style={{ letterSpacing: '0.2em', marginTop: 6 }}>{tie ? 'no team is better' : 'have the best team'} · {top?.total.toFixed(1)} / 100</div>
        <div className="why">{top && explain(top, second, tw, second && teams[second.teamId], pack, players)}</div>
      </div>
      <div className="grid2">
        <div className="panel">
          <h3>Leaderboard</h3>
          <div className="lb">
            {res.ranking.map((r, i) => {
              const t = teams[r.teamId];
              return (
                <div key={r.teamId}>
                  <div className={`lb-row ${i === 0 ? 'first' : ''}`} style={{ '--tc': t.color }} onClick={() => setOpen(open === r.teamId ? null : r.teamId)}>
                    <div className="rank">{ordinal(i + 1)}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--cond)', fontWeight: 800, fontSize: 18, color: t.color }}>{t.name}</div>
                      <div className="bars">{cats.map(c => <i key={c.key} title={`${c.label}: ${r.cats[c.key]}`}><b style={{ width: `${r.cats[c.key]}%` }} /></i>)}</div>
                      {r.issues?.length > 0 && <div className="hint bad">⚠ {r.issues.join(' · ')}</div>}
                    </div>
                    <div className="score">{r.total.toFixed(1)}</div>
                  </div>
                  {open === r.teamId && (
                    <div className="col" style={{ gap: 4, padding: '8px 4px 12px' }}>
                      {asArray(r.ids).map(id => players.byId[id]).filter(Boolean).map(p => (
                        <PlayerRow key={p.id} player={p} pack={pack} onClick={() => setDetail(p)}
                          right={squads?.[r.teamId]?.[p.id] ? <span className="num gold" style={{ fontSize: 14 }}>{formatMoney(squads[r.teamId][p.id].price, pack.currency)}</span> : null} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="hint" style={{ marginTop: 10 }}>Bars: {cats.map(c => `${c.label} ${Math.round(c.weight * 100)}%`).join(' · ')}. Tap a team to see its XI.</div>
        </div>
        {res.ranking.length > 1 && <HeadToHead res={res} teams={teams} pack={pack} players={players} />}
      </div>
      {footer}
      {detail && <PlayerDetail player={detail} pack={pack} onClose={() => setDetail(null)} />}
    </div>
  );
}

export default function Results({ room, isHost, actions, pack, players, mode }) {
  const toast = useToast();
  const url = useMemo(() => shareUrl(room), [room]);
  const res = room.results;
  const squads = useMemo(() => Object.fromEntries(Object.values(room.teams).map(t => [t.id, t.squad || {}])), [room.teams]);
  const shareText = () => {
    const lines = res.ranking.map((r, i) => `${i + 1}. ${room.teams[r.teamId].name} - ${r.total.toFixed(1)}`);
    return `🏆 THE AUCTION verdict: ${room.teams[res.winner].name} have the best team!\n${lines.join('\n')}\n${url}`;
  };
  const share = async () => {
    const text = shareText();
    if (navigator.share) { try { await navigator.share({ title: 'The Auction - verdict', text, url }); return; } catch { /* cancelled */ } }
    await navigator.clipboard?.writeText(text); toast('Result copied - paste it anywhere');
  };
  return (
    <div className="page wide">
      <ResultsView teams={room.teams} lineups={room.lineups} settings={room.settings} pack={pack} players={players} results={res} squads={squads}
        footer={(
          <div className="row wrap" style={{ justifyContent: 'center' }}>
            <Button variant="primary" size="big" onClick={share}>Share result</Button>
            <Button size="big" onClick={() => { navigator.clipboard?.writeText(url); toast('Link copied'); }}>Copy link</Button>
            {isHost && <Button size="big" onClick={() => actions.host.playAgain()}>Play again (same room)</Button>}
            <Button size="big" onClick={() => go('/')}>Home</Button>
          </div>
        )} />
    </div>
  );
}
