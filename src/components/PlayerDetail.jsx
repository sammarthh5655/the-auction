import { lazy, Suspense, useState } from 'react';
import PlayerCard, { roleOf } from './PlayerCard.jsx';
import { Modal, Seg } from './ui.jsx';
import { ageFrom } from '../engine/util.js';
import { canUse3D } from '../three/capability.js';

const CharacterViewer = lazy(() => import('../three/CharacterViewer.jsx'));

export function RatingBreakdown({ player, pack }) {
  const rb = pack.ratingBreakdown(player);
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row" style={{ alignItems: 'baseline', gap: 14 }}>
        <div className="num" style={{ fontSize: 46, color: 'var(--gold2)', lineHeight: 1 }}>{player.ovr}</div>
        <div className="muted" style={{ fontSize: 13 }}>
          OVR · composite <b className="gold">{rb.composite}</b> sits at the <b className="gold">{rb.rolePct}th</b> percentile of {roleOf(pack, player.role).plural.toLowerCase()} in the pool
        </div>
      </div>
      <div className="col" style={{ gap: 8 }}>
        {rb.components.map(c => (
          <div key={c.label}>
            <div className="row" style={{ fontSize: 13 }}><span className="grow">{c.label} <span className="dim">x {c.weight}</span></span><b className="num">{Math.round(c.value)}</b></div>
            <div className="rb-bar"><i style={{ width: `${Math.max(2, c.value)}%` }} /></div>
          </div>
        ))}
      </div>
      <div className="grid2">
        {rb.inputs.map(g => (
          <div key={g.group} className="panel tight" style={{ boxShadow: 'none' }}>
            <div className="label" style={{ marginBottom: 6 }}>{g.group} inputs</div>
            <table className="stat-table"><tbody>
              {g.items.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}
            </tbody></table>
            <div className="hint" style={{ marginTop: 6 }}>{g.formula}</div>
          </div>
        ))}
      </div>
      <div className="hint" style={{ lineHeight: 1.5 }}>{rb.note}</div>
    </div>
  );
}

export function StatTables({ player, pack }) {
  const secs = pack.detailSections(player);
  const [i, setI] = useState(0);
  const sec = secs[i];
  if (!sec) return <div className="muted">No stats.</div>;
  return (
    <div className="col">
      {secs.length > 1 && <Seg value={i} onChange={setI} options={secs.map((s, k) => ({ value: k, label: s.title }))} />}
      <div className="grid3">
        {sec.groups.map(g => (
          <div key={g.title}>
            <div className="label" style={{ marginBottom: 4 }}>{g.title}</div>
            <table className="stat-table"><tbody>{g.rows.map(([k, v]) => <tr key={k}><td className="muted">{k}</td><td>{v ?? '—'}</td></tr>)}</tbody></table>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PlayerDetail({ player, pack, onClose, extra }) {
  const [tab, setTab] = useState('stats');
  const age = ageFrom(player.dob);
  const tabs = [{ value: 'stats', label: 'Stats' }, { value: 'rating', label: 'Rating breakdown' }, { value: '3d', label: '3D character' }];
  return (
    <Modal title={player.name} onClose={onClose} wide>
      <div className="detail-layout">
        <div className="col"><PlayerCard player={player} pack={pack} />{extra}</div>
        <div className="col" style={{ gap: 14 }}>
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="tag gold">{roleOf(pack, player.role).label}</span>
            <span className="tag">{player.country}</span>
            <span className={`tag ${player.status === 'retired' ? '' : 'good'}`}>{player.status}</span>
            {age && <span className="tag">{player.status === 'retired' ? `Born ${player.dob}` : `Age ${age}`}</span>}
            <span className="tag">{player.years[0]}–{player.years[1]}</span>
            {player.teams?.length > 0 && <span className="tag" title={player.teams.join(', ')}>{player.teams.length} franchise{player.teams.length > 1 ? 's' : ''}</span>}
          </div>
          <Seg value={tab} onChange={setTab} options={tabs} />
          {tab === 'stats' && <StatTables player={player} pack={pack} />}
          {tab === 'rating' && <RatingBreakdown player={player} pack={pack} />}
          {tab === '3d' && (
            <div className="creator-stage" style={{ height: 420 }}>
              {canUse3D() ? <Suspense fallback={<div className="center muted" style={{ paddingTop: 180 }}>Loading 3D…</div>}><CharacterViewer player={player} pack={pack} /></Suspense>
                : <div className="center muted" style={{ paddingTop: 180 }}>3D is not available on this device.</div>}
            </div>
          )}
          {player.teams?.length > 0 && tab === 'stats' && <div className="hint">Franchises: {player.teams.join(' · ')}</div>}
          <div className="hint">{pack.sourceNote}{player.sources?.country ? ` Country via ${player.sources.country}.` : ''}</div>
        </div>
      </div>
    </Modal>
  );
}
