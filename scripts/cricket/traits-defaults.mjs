/**
 * Builds the stylized 3D character description for a cricket player.
 * Hand-curated traits (data/cricket/traits.json) win; anything missing falls back to
 * deterministic, sensible defaults seeded by the player id, so a player always looks the same.
 *
 * The character schema is shared with the renderer in src/three/character/.
 */

export const POSES = [
  'cover-drive', 'helicopter', 'pull-shot', 'straight-drive', 'lofted-drive', 'scoop', 'sweep', 'upper-cut',
  'switch-hit', 'bat-raise', 'fast-bowl', 'sling-bowl', 'short-run-bowl', 'leg-spin', 'off-spin', 'keeper-crouch',
  'wicket-celebration', 'arms-crossed', 'sword-celebration', 'forward-defence',
];

const SKIN = {
  light: ['#f2d3bd', '#eac3a6', '#f5dcc8', '#e8b998'],
  tan: ['#d9a77f', '#cf9a70', '#c98f66', '#deae86'],
  brown: ['#b07850', '#a36d47', '#9c6440', '#b88257'],
  deep: ['#7a4b2e', '#6b4027', '#5c3520', '#83532f'],
};
const COUNTRY_SKIN = {
  India: ['tan', 'brown', 'brown', 'tan', 'deep'], Pakistan: ['tan', 'brown', 'tan'], 'Sri Lanka': ['brown', 'deep', 'brown'],
  Bangladesh: ['brown', 'tan', 'brown'], Afghanistan: ['tan', 'light', 'tan'], Nepal: ['tan', 'brown'],
  'West Indies': ['deep', 'deep', 'brown'], Zimbabwe: ['deep', 'light', 'deep'], 'South Africa': ['light', 'deep', 'light', 'brown'],
  England: ['light', 'light', 'light', 'tan'], Australia: ['light', 'light', 'light', 'tan'], 'New Zealand': ['light', 'light', 'tan'],
  Ireland: ['light'], Netherlands: ['light'], Scotland: ['light'],
};
const HAIR_COLORS = { black: '#15110f', darkbrown: '#3b2618', brown: '#6a4529', blonde: '#d7b56d', ginger: '#b5562a', grey: '#9a9a9a', white: '#e8e8e8' };
const NEUTRAL_JERSEYS = ['#1f3a68', '#2c2f3a', '#0f5257', '#7a1f2b', '#3d2f6b', '#1d5a3a', '#2b4c7e', '#22313f', '#4a1f5c', '#14465c'];
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const colourDist = (a, b) => { const x = hexRgb(a), y = hexRgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
/** a jersey colour that clearly contrasts with the skin (so nobody looks shirtless) */
function pickJersey(skin, r) {
  const start = Math.floor(r * NEUTRAL_JERSEYS.length);
  for (let i = 0; i < NEUTRAL_JERSEYS.length; i++) {
    const c = NEUTRAL_JERSEYS[(start + i) % NEUTRAL_JERSEYS.length];
    if (!skin.startsWith('#') || colourDist(c, skin) > 90) return c;
  }
  return '#1f3a68';
}
const pick = (arr, r) => arr[Math.floor(r * arr.length) % arr.length];

function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
}

export const FACE_KEYS = ['head', 'width', 'length', 'jaw', 'cheeks', 'nose', 'brow', 'forehead', 'chin', 'ears'];
/** Face sculpt multipliers (1 = base model). Curated values win; others get a small seeded variation. */
function buildFace(curated, r) {
  const out = {};
  for (const k of FACE_KEYS) {
    const v = curated?.[k] ?? 1 + (r() - 0.5) * (k === 'head' ? 0.04 : 0.1);
    out[k] = Math.round(v * 100) / 100;
  }
  return out;
}

export function buildCharacter({ id, name, country, role, traits }) {
  const r = seeded(id);
  const t = traits || {};
  const tone = pick(COUNTRY_SKIN[country] || ['tan', 'light', 'brown'], r());
  const fairHaired = ['England', 'Australia', 'New Zealand', 'Ireland', 'South Africa', 'Netherlands', 'Scotland'].includes(country) && tone === 'light';
  const hairColorKey = fairHaired ? pick(['brown', 'darkbrown', 'blonde', 'brown', 'ginger', 'darkbrown'], r()) : pick(['black', 'black', 'darkbrown'], r());
  const surname = (name || '').split(' ').filter(Boolean).pop() || 'PLAYER';
  const defaultPose = role === 'BOWL' ? pick(['fast-bowl', 'fast-bowl', 'off-spin', 'leg-spin'], r())
    : role === 'WK' ? pick(['keeper-crouch', 'pull-shot', 'cover-drive'], r())
    : role === 'AR' ? pick(['lofted-drive', 'fast-bowl', 'pull-shot'], r())
    : pick(['cover-drive', 'pull-shot', 'straight-drive', 'lofted-drive', 'bat-raise'], r());
  const hc = t.hairColor || hairColorKey;
  const skinHex = t.skin ? (SKIN[t.skin]?.[1] || t.skin) : pick(SKIN[tone], r());
  return {
    skin: skinHex,
    hair: { style: t.hair || pick(['short', 'short', 'crop', 'side-part', 'textured', 'buzz', 'quiff'], r()), color: HAIR_COLORS[hc] || hc },
    beard: { style: t.beard || pick(['none', 'stubble', 'stubble', 'short', 'none', 'full'], r()), color: HAIR_COLORS[t.beardColor || hc] || HAIR_COLORS[hc] || hc },
    build: t.build || pick(['slim', 'athletic', 'athletic', 'stocky'], r()),
    height: t.height || pick(['short', 'medium', 'medium', 'tall'], r()),
    headgear: t.headgear || (role === 'BOWL' ? pick(['none', 'none', 'cap'], r()) : pick(['helmet', 'helmet', 'none'], r())),
    sleeves: t.sleeves || pick(['short', 'short', 'long'], r()),
    shoes: t.shoes || pick(['white', 'white', 'black', 'neon'], r()),
    accessories: t.accessories || [],
    jersey: {
      number: t.number ?? (1 + Math.floor(r() * 99)),
      backName: (t.backName || surname).toUpperCase().slice(0, 12),
      color: t.jersey || pickJersey(skinHex, r()),
    },
    face: buildFace(t.face, r),
    pose: POSES.includes(t.pose) ? t.pose : defaultPose,
    hand: t.hand || 'right',
    bowlType: t.bowlType || null,
    curated: !!traits,
  };
}
