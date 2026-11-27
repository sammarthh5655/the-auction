import { memo } from 'react';
import Avatar2D from './Avatar2D.jsx';
import { ageFrom, formatMoney } from '../engine/util.js';

export const tierOf = ovr => (ovr >= 88 ? 'elite' : ovr >= 75 ? 'gold' : ovr >= 60 ? 'silver' : 'bronze');
export const roleOf = (pack, key) => pack.roles.find(r => r.key === key) || { key, label: key, color: '#888' };

const FLAGS = {
  India: 'IND', Australia: 'AUS', England: 'ENG', 'South Africa': 'SA', 'New Zealand': 'NZ', 'West Indies': 'WI', Pakistan: 'PAK',
  'Sri Lanka': 'SL', Bangladesh: 'BAN', Afghanistan: 'AFG', Zimbabwe: 'ZIM', Ireland: 'IRE', Netherlands: 'NED', Nepal: 'NEP',
  Scotland: 'SCO', USA: 'USA', 'United Arab Emirates': 'UAE', Namibia: 'NAM', Singapore: 'SIN', Canada: 'CAN', Oman: 'OMA',
};
export const countryCode = c => FLAGS[c] || (c || '').slice(0, 3).toUpperCase();

export function Portrait({ player, size }) {
  if (player.customImage) return <img src={player.customImage} alt={player.name} />;
  return <Avatar2D character={player.character} size={size} />;
}

function PlayerCard({ player, pack, mini = false, base, onClick, className = '' }) {
  if (!player) return null;
  const role = roleOf(pack, player.role);
  const stats = pack.keyStats(player);
  const age = ageFrom(player.dob);
  return (
    <div className={`pcard ${tierOf(player.ovr)} ${mini ? 'mini' : ''} ${className}`} onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <div className="ovr"><b>{player.ovr}</b><span>{role.key}</span></div>
      <div className="flag">{countryCode(player.country)}<br /><span style={{ opacity: 0.75, fontSize: '0.85em' }}>{player.overseas ? pack.labels.overseas : pack.labels.domestic}</span></div>
      <div className="badges">
        {player.status === 'retired' ? <span className="tag">Legend</span> : <span className="tag">Active</span>}
        {age && <span className="tag">{player.status === 'retired' ? `b. ${player.dob.slice(0, 4)}` : `Age ${age}`}</span>}
        {player.nonIpl && <span className="tag">Intl</span>}
      </div>
      <div className="portrait"><Portrait player={player} /></div>
      <div className="nameplate">
        <div className="pname">{player.name}</div>
        <div className="prole">{role.label}{base != null ? ` · Base ${formatMoney(base, pack.currency)}` : ''}</div>
        <div className="pstats">
          {stats.slice(0, 4).map(s => <div key={s.label}><b>{s.value}</b><span>{s.label}</span></div>)}
        </div>
      </div>
    </div>
  );
}
export default memo(PlayerCard);

export function PlayerRow({ player, pack, right, selected, onClick, sub }) {
  const role = roleOf(pack, player.role);
  return (
    <div className={`prow ${selected ? 'sel' : ''}`} onClick={onClick}>
      <div className={`ovrb ${tierOf(player.ovr)}`}>{player.ovr}</div>
      <div className="grow">
        <div className="pn">{player.name}</div>
        <div className="ps row" style={{ gap: 6 }}>
          <span className="role-dot" style={{ background: role.color }} />{role.label} · {countryCode(player.country)}
          {player.overseas && <span className="tag" style={{ padding: '0 5px' }}>OS</span>}
          {player.status === 'retired' && <span className="tag gold" style={{ padding: '0 5px' }}>Legend</span>}
          {sub}
        </div>
      </div>
      {right}
    </div>
  );
}
