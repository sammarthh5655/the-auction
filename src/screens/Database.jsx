import { useMemo, useState } from 'react';
import { Chips, Field, Seg, Toggle } from '../components/ui.jsx';
import PlayerCard from '../components/PlayerCard.jsx';
import PlayerDetail from '../components/PlayerDetail.jsx';

export default function Database({ pack, players }) {
  const [q, setQ] = useState('');
  const [roles, setRoles] = useState([]);
  const [status, setStatus] = useState('all');
  const [origin, setOrigin] = useState('all');
  const [famous, setFamous] = useState(false);
  const [sort, setSort] = useState('ovr');
  const [limit, setLimit] = useState(60);
  const [detail, setDetail] = useState(null);
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const f = players.filter(p => (!ql || p.name.toLowerCase().includes(ql) || p.short.toLowerCase().includes(ql) || p.country.toLowerCase().includes(ql))
      && (!roles.length || roles.includes(p.role)) && (status === 'all' || p.status === status)
      && (origin === 'all' || (origin === 'overseas') === p.overseas) && (!famous || p.famous));
    const key = { ovr: p => -p.ovr, name: p => p.name, runs: p => -((p.stats.ipl?.runs || 0) + (p.stats.t20i?.runs || 0)), wk: p => -((p.stats.ipl?.wk || 0) + (p.stats.t20i?.wk || 0)) }[sort];
    return f.sort((a, b) => { const x = key(a), y = key(b); return x < y ? -1 : x > y ? 1 : 0; });
  }, [players, q, roles, status, origin, famous, sort]);
  const meta = players.meta || {};
  return (
    <div className="page wide">
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <div className="grow">
          <div className="section-title">Player database</div>
          <div className="muted">{players.length} players · data up to {meta.latestMatch} · {meta.sources?.ipl} · {meta.sources?.t20i}</div>
        </div>
      </div>
      <div className="db-layout">
        <div className="panel col" style={{ gap: 14 }}>
          <Field label="Search"><input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="Name or country" /></Field>
          <Field label="Role"><Chips values={roles} onChange={setRoles} options={pack.roles.map(r => ({ value: r.key, label: r.plural }))} /></Field>
          <Field label="Status"><Seg value={status} onChange={setStatus} options={[{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'retired', label: 'Retired' }]} /></Field>
          <Field label="Origin"><Seg value={origin} onChange={setOrigin} options={[{ value: 'all', label: 'All' }, { value: 'domestic', label: pack.labels.domestic }, { value: 'overseas', label: pack.labels.overseas }]} /></Field>
          <Field label="Sort"><Seg value={sort} onChange={setSort} options={[{ value: 'ovr', label: 'OVR' }, { value: 'runs', label: 'Runs' }, { value: 'wk', label: 'Wickets' }, { value: 'name', label: 'A-Z' }]} /></Field>
          <Toggle checked={famous} onChange={setFamous} label="Hand-styled characters only" />
          <div className="hint">{list.length} match</div>
        </div>
        <div>
          <div className="db-grid">
            {list.slice(0, limit).map(p => <PlayerCard key={p.id} player={p} pack={pack} mini onClick={() => setDetail(p)} />)}
          </div>
          {list.length > limit && <div className="center" style={{ marginTop: 16 }}><button className="btn" onClick={() => setLimit(l => l + 60)}>Show more</button></div>}
        </div>
      </div>
      {detail && <PlayerDetail player={detail} pack={pack} onClose={() => setDetail(null)} />}
    </div>
  );
}
