import { memo, useMemo } from 'react';
import PlayerCard from './PlayerCard.jsx';
import { formatMoney } from '../engine/util.js';

/** Animated 2D reveal - fallback for weak phones / no WebGL. Same beats as the 3D stage. */
export const Reveal2D = memo(function Reveal2D({ player, pack, marquee, lotKey, base }) {
  const smokes = useMemo(() => Array.from({ length: 7 }, (_, i) => ({ left: `${8 + i * 13}%`, delay: `${(i * 0.7) % 4}s`, sx: `${(i % 2 ? 1 : -1) * (20 + i * 6)}px` })), []);
  const sparks = useMemo(() => (marquee ? Array.from({ length: 18 }, (_, i) => ({ left: `${10 + ((i * 37) % 80)}%`, bottom: `${10 + ((i * 13) % 30)}%`, delay: `${(i * 0.31) % 3}s` })) : []), [marquee]);
  const stats = pack.revealStats(player);
  const spots = [[5, 14], [76, 12], [3, 34], [79, 32], [8, 52], [77, 52]];
  return (
    <div key={lotKey} className={`reveal2d ${marquee ? 'marquee' : ''}`}>
      <div className="dim" />
      <div className="beam" />
      {smokes.map((s, i) => <div key={i} className="smoke" style={{ left: s.left, animationDelay: s.delay, '--sx': s.sx }} />)}
      {sparks.map((s, i) => <div key={i} className="spark" style={{ left: s.left, bottom: s.bottom, animationDelay: s.delay }} />)}
      <div className="pedestal2d" />
      <div className="card-spin"><PlayerCard player={player} pack={pack} base={base} /></div>
      {stats.map((s, i) => (
        <div key={s.label} className="float-stat hide-sm" style={{ left: `${spots[i % 6][0]}%`, top: `${spots[i % 6][1]}%`, animationDelay: `${1.6 + i * 0.15}s, ${i * 0.4}s` }}>
          <b>{s.value}</b><span>{s.label}</span>
        </div>
      ))}
    </div>
  );
});

export function TimerRing({ left, total }) {
  const r = 32, c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, left / total));
  const urgent = left <= 3.05;
  return (
    <div className={`timer-ring ${urgent ? 'urgent' : ''}`}>
      <svg width="74" height="74" viewBox="0 0 74 74">
        <circle cx="37" cy="37" r={r} fill="rgba(0,0,0,0.45)" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
        <circle cx="37" cy="37" r={r} fill="none" stroke={urgent ? '#ff5d6c' : '#f5c542'} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - frac)} style={{ transition: 'stroke-dashoffset 0.1s linear' }} />
      </svg>
      <div className="t">{Math.max(0, Math.ceil(left))}</div>
    </div>
  );
}

function Gavel() {
  return (
    <svg viewBox="0 0 220 220" width="220" height="220">
      <defs>
        <linearGradient id="hg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#ffeaa0" /><stop offset="0.5" stopColor="#e2a92a" /><stop offset="1" stopColor="#8a5a08" /></linearGradient>
        <linearGradient id="hw" x1="0" x2="1"><stop offset="0" stopColor="#9a5418" /><stop offset="1" stopColor="#4d2405" /></linearGradient>
      </defs>
      <g transform="rotate(-38 110 110)">
        <rect x="40" y="40" width="120" height="52" rx="10" fill="url(#hg)" stroke="#5a3a00" strokeWidth="3" />
        <rect x="30" y="46" width="16" height="40" rx="5" fill="#fff1c2" />
        <rect x="154" y="46" width="16" height="40" rx="5" fill="#fff1c2" />
        <rect x="92" y="88" width="18" height="120" rx="9" fill="url(#hw)" />
      </g>
    </svg>
  );
}

/** SOLD! - hammer strike, impact ring, screen shake, confetti in the buying team's colour. */
export const SoldOverlay = memo(function SoldOverlay({ team, price, currency, rtm }) {
  const conf = useMemo(() => Array.from({ length: 46 }, (_, i) => ({
    left: `${(i * 23) % 100}%`, delay: `${0.55 + (i % 10) * 0.06}s`, dx: `${((i * 37) % 160) - 80}px`, rot: `${(i * 97) % 720}deg`,
    c: i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? '#f5c542' : team?.color || '#f5c542',
  })), [team]);
  return (
    <div className="sold-overlay shake">
      <div className="flashbg" />
      <div className="impact-ring" />
      <div className="gavel-wrap"><Gavel /></div>
      {conf.map((c, i) => <i key={i} className="confetti" style={{ left: c.left, background: c.c, animationDelay: c.delay, '--dx': c.dx, '--rot': c.rot }} />)}
      <div className="sold-stamp" style={{ '--tc': team?.color }}>
        <div className="word">SOLD!</div>
        <div className="to"><span style={{ width: 14, height: 14, borderRadius: 4, background: team?.color, display: 'inline-block' }} />{team?.name}{rtm ? ' · RTM' : ''}<span className="amt">{formatMoney(price, currency)}</span></div>
      </div>
    </div>
  );
});

export function UnsoldOverlay({ reason }) {
  return (
    <div className="sold-overlay">
      <div className="center">
        <div className="unsold-stamp">UNSOLD</div>
        {reason && <div className="muted" style={{ marginTop: 8, fontFamily: 'var(--cond)', letterSpacing: '0.1em' }}>{reason}</div>}
      </div>
    </div>
  );
}
