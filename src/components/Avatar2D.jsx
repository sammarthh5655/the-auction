// Flat SVG portrait drawn from the same character traits as the 3D model (used on cards,
// lists and as the 2D reveal fallback). No photos - every look is generated from data.
import { memo } from 'react';

const shade = (hex, amt) => {
  const n = parseInt(hex.slice(1), 16);
  const c = k => Math.max(0, Math.min(255, ((n >> k) & 255) + amt));
  return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0')}`;
};

function Hair({ style, color }) {
  const d = shade(color, -25);
  switch (style) {
    case 'bald': return null;
    case 'buzz': return <path d="M62 96 Q60 54 100 50 Q140 54 138 96 Q132 70 100 66 Q68 70 62 96Z" fill={color} opacity="0.85" />;
    case 'receding': return <path d="M60 104 Q58 72 70 66 L74 92 Q66 96 64 108Z M140 104 Q142 72 130 66 L126 92 Q134 96 136 108Z" fill={color} />;
    case 'long': return <g><path d="M56 150 Q48 60 100 46 Q152 60 144 150 L132 150 Q138 92 100 72 Q62 92 68 150Z" fill={color} /><path d="M64 92 Q80 58 128 70 Q110 74 96 86 Q80 84 64 92Z" fill={d} /></g>;
    case 'mullet': return <g><path d="M58 100 Q56 52 100 46 Q144 52 142 100 Q130 70 100 68 Q70 70 58 100Z" fill={color} /><path d="M62 112 Q60 150 74 160 L80 120Z M138 112 Q140 150 126 160 L120 120Z" fill={color} /></g>;
    case 'curly': case 'afro': {
      const r = style === 'afro' ? 15 : 11, pts = style === 'afro' ? 15 : 12, rad = style === 'afro' ? 52 : 44;
      return <g fill={color}>{Array.from({ length: pts }, (_, i) => { const a = Math.PI * (1.05 + (i / (pts - 1)) * 0.9); return <circle key={i} cx={100 + Math.cos(a) * rad} cy={100 + Math.sin(a) * rad * 0.95} r={r} />; })}<circle cx="100" cy="62" r={r + 6} /></g>;
    }
    case 'dreadlocks': return <g fill={color}><path d="M60 98 Q58 54 100 48 Q142 54 140 98 Q130 70 100 68 Q70 70 60 98Z" />{[64, 74, 84, 116, 126, 136].map(x => <rect key={x} x={x - 4} y="80" width="8" height="70" rx="4" />)}</g>;
    case 'spiky': return <path d="M60 98 L62 66 L72 74 L76 50 L88 64 L96 42 L106 62 L118 46 L122 66 L134 56 L136 76 L142 70 L140 98 Q130 72 100 70 Q70 72 60 98Z" fill={color} />;
    case 'quiff': return <path d="M60 100 Q58 60 92 52 Q96 30 128 40 Q146 50 140 100 Q132 74 104 72 Q74 72 60 100Z" fill={color} />;
    case 'slick-back': return <path d="M60 100 Q60 50 104 48 Q146 52 140 100 Q134 66 102 62 Q70 66 60 100Z" fill={color} />;
    case 'undercut': return <g><path d="M60 100 Q60 74 64 70 L64 96Z M140 100 Q140 74 136 70 L136 96Z" fill={color} opacity="0.5" /><path d="M64 80 Q64 46 104 44 Q140 48 136 80 Q120 64 100 64 Q80 64 64 80Z" fill={color} /></g>;
    case 'man-bun': case 'ponytail': return <g fill={color}><path d="M60 100 Q58 54 100 48 Q142 54 140 100 Q130 70 100 68 Q70 70 60 100Z" /><circle cx="100" cy="40" r="13" /></g>;
    case 'mohawk': return <path d="M88 76 Q90 36 100 34 Q110 36 112 76Z" fill={color} />;
    case 'textured': return <path d="M60 100 Q56 58 76 54 Q80 44 96 48 Q106 38 118 48 Q136 46 140 64 Q146 80 140 100 Q130 70 100 68 Q70 70 60 100Z" fill={color} />;
    case 'side-part': return <g><path d="M60 100 Q58 54 100 48 Q142 54 140 100 Q134 72 112 66 L84 70 Q68 76 60 100Z" fill={color} /><path d="M84 52 L86 70" stroke={d} strokeWidth="2" /></g>;
    case 'crop': default: return <path d="M60 100 Q58 54 100 48 Q142 54 140 100 Q130 70 100 68 Q70 70 60 100Z" fill={color} />;
  }
}

function Beard({ style, color, skin }) {
  const c = color;
  switch (style) {
    case 'stubble': return <path d="M66 112 Q68 150 100 156 Q132 150 134 112 Q128 140 100 142 Q72 140 66 112Z" fill={c} opacity="0.35" />;
    case 'short': return <path d="M64 108 Q64 154 100 160 Q136 154 136 108 Q130 140 112 138 Q100 132 88 138 Q70 140 64 108Z" fill={c} opacity="0.9" />;
    case 'full': return <path d="M62 104 Q60 162 100 170 Q140 162 138 104 Q132 142 112 136 Q100 130 88 136 Q68 142 62 104Z" fill={c} />;
    case 'long': return <path d="M62 104 Q58 176 100 196 Q142 176 138 104 Q132 142 112 136 Q100 130 88 136 Q68 142 62 104Z" fill={c} />;
    case 'chinstrap': return <path d="M62 104 Q62 160 100 166 Q138 160 138 104 L132 106 Q130 150 100 154 Q70 150 68 106Z" fill={c} />;
    case 'goatee': return <path d="M88 140 Q100 136 112 140 Q112 160 100 164 Q88 160 88 140Z M86 130 Q100 124 114 130 L112 134 Q100 130 88 134Z" fill={c} />;
    case 'mustache': return <path d="M80 132 Q90 122 100 128 Q110 122 120 132 Q124 138 128 134 Q122 142 110 134 Q100 132 90 134 Q78 142 72 134 Q76 138 80 132Z" fill={c} />;
    case 'french': return <path d="M86 132 Q100 126 114 132 L112 136 Q100 132 88 136Z M92 146 Q100 142 108 146 L104 166 L96 166Z" fill={c} />;
    default: return skin ? null : null;
  }
}

function Headgear({ type, jersey }) {
  switch (type) {
    case 'helmet': return (
      <g>
        <path d="M54 108 Q50 46 100 40 Q150 46 146 108 L138 104 Q136 60 100 56 Q64 60 62 104Z" fill="#1b2a4a" />
        <path d="M58 96 Q100 82 142 96 L142 104 Q100 92 58 104Z" fill="#0d1730" />
        <g stroke="#c9d2e6" strokeWidth="3" fill="none" opacity="0.9"><path d="M62 108 Q100 132 138 108" /><path d="M64 120 Q100 146 136 120" /><path d="M100 104 L100 148" /></g>
        <circle cx="100" cy="62" r="5" fill="#f5c542" />
      </g>
    );
    case 'cap': return <g><path d="M60 94 Q60 52 100 50 Q140 52 140 94Z" fill={jersey} /><path d="M58 92 Q100 84 152 98 Q140 104 100 100 Q70 100 58 96Z" fill={shade(jersey, -30)} /></g>;
    case 'sunhat': return <g><ellipse cx="100" cy="88" rx="66" ry="12" fill="#f1ead8" /><path d="M66 88 Q68 50 100 48 Q132 50 134 88Z" fill="#f1ead8" /></g>;
    case 'patka': return <g><path d="M60 98 Q56 52 100 46 Q144 52 140 98 Q120 84 100 86 Q80 84 60 98Z" fill={shade(jersey, 40)} /><circle cx="100" cy="44" r="14" fill={shade(jersey, 40)} /><path d="M70 66 Q100 54 130 66" stroke={shade(jersey, 10)} strokeWidth="3" fill="none" /></g>;
    case 'headband': return <rect x="60" y="76" width="80" height="10" rx="4" fill="#fff" opacity="0.9" />;
    case 'bandana': return <path d="M60 92 Q60 52 100 50 Q140 52 140 92 Q100 80 60 92Z" fill="#d22" />;
    default: return null;
  }
}

function Avatar2D({ character, size = '100%', showNumber = true }) {
  const c = character || {};
  const skin = c.skin || '#c98f66';
  const jersey = c.jersey?.color || '#1f3a68';
  const hair = c.hair || { style: 'short', color: '#15110f' };
  const beard = c.beard || { style: 'none' };
  const wide = { slim: 0.9, athletic: 1, stocky: 1.1, heavy: 1.2 }[c.build] || 1;
  const hidesHair = c.headgear === 'helmet' || c.headgear === 'patka';
  const acc = c.accessories || [];
  return (
    <svg viewBox="0 0 200 240" width={size} height={size} role="img" aria-label="player portrait">
      <defs>
        <linearGradient id={`j-${jersey}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={shade(jersey, 35)} /><stop offset="1" stopColor={shade(jersey, -35)} /></linearGradient>
        <radialGradient id={`s-${skin}`} cx="0.45" cy="0.35" r="0.7"><stop offset="0" stopColor={shade(skin, 22)} /><stop offset="1" stopColor={shade(skin, -18)} /></radialGradient>
      </defs>
      <g transform={`translate(${100 - 100 * wide} 0) scale(${wide} 1)`}>
        <path d="M20 240 Q22 186 70 172 L100 196 L130 172 Q178 186 180 240Z" fill={`url(#j-${jersey})`} />
        <path d="M70 172 L100 196 L130 172 L122 168 L100 184 L78 168Z" fill={shade(jersey, -50)} />
        {c.sleeves === 'long' && <path d="M20 240 Q22 200 40 188 L44 240Z M180 240 Q178 200 160 188 L156 240Z" fill={shade(jersey, -20)} />}
      </g>
      <rect x="86" y="146" width="28" height="32" rx="10" fill={shade(skin, -18)} />
      {acc.includes('chain') && <path d="M80 176 Q100 196 120 176" stroke="#f5c542" strokeWidth="3" fill="none" />}
      {!hidesHair && (hair.style === 'long' || hair.style === 'dreadlocks') && <Hair style={hair.style} color={hair.color} />}
      <ellipse cx="62" cy="112" rx="8" ry="12" fill={shade(skin, -10)} />
      <ellipse cx="138" cy="112" rx="8" ry="12" fill={shade(skin, -10)} />
      <ellipse cx="100" cy="106" rx="40" ry="50" fill={`url(#s-${skin})`} />
      <Beard style={beard.style} color={beard.color || hair.color} />
      <g fill={shade(skin, -70)}>
        <ellipse cx="84" cy="108" rx="4.5" ry="5" /><ellipse cx="116" cy="108" rx="4.5" ry="5" />
      </g>
      <g stroke={hair.color} strokeWidth="4" strokeLinecap="round"><path d="M76 96 L92 94" /><path d="M108 94 L124 96" /></g>
      <path d="M100 112 Q96 126 100 128 Q104 128 104 126" stroke={shade(skin, -40)} strokeWidth="2" fill="none" />
      {beard.style !== 'full' && beard.style !== 'long' && <path d="M90 140 Q100 146 110 140" stroke={shade(skin, -55)} strokeWidth="2.5" fill="none" strokeLinecap="round" />}
      {acc.includes('zinc') && <path d="M95 112 L105 112 L104 124 L96 124Z" fill="#fff" opacity="0.85" />}
      {!hidesHair && hair.style !== 'long' && hair.style !== 'dreadlocks' && <Hair style={hair.style} color={hair.color} />}
      {acc.includes('sunglasses') && <g><rect x="72" y="100" width="24" height="14" rx="5" fill="#0b0b10" /><rect x="104" y="100" width="24" height="14" rx="5" fill="#0b0b10" /><path d="M96 106 L104 106" stroke="#0b0b10" strokeWidth="3" /></g>}
      <Headgear type={c.headgear} jersey={jersey} />
      {showNumber && c.jersey?.number != null && (
        <text x="100" y="228" textAnchor="middle" fontFamily="Bebas Neue, Impact, sans-serif" fontSize="34" fill="#fff" opacity="0.92">{c.jersey.number}</text>
      )}
    </svg>
  );
}

export default memo(Avatar2D);
