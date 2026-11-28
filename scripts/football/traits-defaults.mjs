/**
 * Football character defaults. Uses the real height + preferred foot from the dataset; everything else
 * (skin, hair, beard, number) is a seeded sensible default unless data/football/traits.json curates it.
 * Same character schema as cricket (rendered by the shared rigged-human renderer), with kit: 'football'.
 */
export const FOOTBALL_POSES = ['shoot', 'dribble', 'header', 'bicycle-kick', 'knee-slide', 'siu-jump', 'arms-wide', 'free-kick',
  'keeper-dive', 'keeper-catch', 'tackle', 'arms-crossed', 'pass'];

const SKIN = {
  light: ['#f2d3bd', '#eac3a6', '#f5dcc8', '#e8b998'],
  tan: ['#d9a77f', '#cf9a70', '#c98f66', '#deae86'],
  brown: ['#b07850', '#a36d47', '#9c6440', '#b88257'],
  deep: ['#7a4b2e', '#6b4027', '#5c3520', '#83532f'],
};
const LIGHT = ['England', 'Germany', 'Netherlands', 'Belgium', 'Denmark', 'Sweden', 'Norway', 'Poland', 'Croatia', 'Serbia', 'Russia',
  'Ukraine', 'Czech Republic', 'Austria', 'Switzerland', 'Scotland', 'Wales', 'Ireland', 'Iceland', 'Finland', 'Slovakia', 'Slovenia', 'Hungary'];
const TAN = ['Spain', 'Italy', 'Portugal', 'Argentina', 'Uruguay', 'Greece', 'Türkiye', 'Turkey', 'Mexico', 'Chile', 'Japan', 'Korea, South', 'Georgia',
  'Albania', 'Bosnia-Herzegovina', 'Romania', 'Bulgaria', 'Israel', 'Iran', 'Paraguay', 'Peru', 'Ecuador', 'Venezuela', 'Algeria', 'Morocco', 'Tunisia', 'Egypt'];
const MIX = ['France', 'Brazil', 'Colombia', 'United States', 'Canada', 'Australia'];
const DEEP = ['Nigeria', 'Ghana', "Cote d'Ivoire", 'Senegal', 'Cameroon', 'Mali', 'DR Congo', 'Guinea', 'Burkina Faso', 'Gabon', 'Jamaica', 'Zambia', 'Angola', 'Gambia', 'Togo', 'Benin', 'Haiti'];
const HAIR_COLORS = { black: '#15110f', darkbrown: '#3b2618', brown: '#6a4529', blonde: '#d7b56d', ginger: '#b5562a', grey: '#9a9a9a', white: '#e8e8e8' };
const JERSEYS = ['#1f3a68', '#2c2f3a', '#0f5257', '#7a1f2b', '#3d2f6b', '#1d5a3a', '#2b4c7e', '#22313f', '#4a1f5c', '#14465c', '#b8202e', '#f2f2f2'];
const pick = (arr, r) => arr[Math.floor(r * arr.length) % arr.length];
function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
}
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const dist = (a, b) => { const x = hexRgb(a), y = hexRgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
const FACE_KEYS = ['head', 'width', 'length', 'jaw', 'cheeks', 'nose', 'brow', 'forehead', 'chin', 'ears'];

export function buildFootballCharacter({ id, name, country, role, foot, heightCm, traits }) {
  const r = seeded('fb' + id);
  const t = traits || {};
  const tones = LIGHT.includes(country) ? ['light', 'light', 'light', 'tan', 'deep'] : TAN.includes(country) ? ['tan', 'tan', 'light', 'brown']
    : MIX.includes(country) ? ['light', 'tan', 'brown', 'deep', 'deep'] : DEEP.includes(country) ? ['deep', 'deep', 'brown'] : ['tan', 'light', 'brown', 'deep'];
  const tone = pick(tones, r());
  const skin = t.skin ? (SKIN[t.skin]?.[1] || t.skin) : pick(SKIN[tone], r());
  const fair = tone === 'light';
  const hc = t.hairColor || (fair ? pick(['brown', 'darkbrown', 'blonde', 'brown', 'darkbrown'], r()) : pick(['black', 'black', 'darkbrown'], r()));
  const height = t.height || (heightCm ? (heightCm < 175 ? 'short' : heightCm > 188 ? 'tall' : 'medium') : 'medium');
  const poseDefault = role === 'GK' ? pick(['keeper-dive', 'keeper-catch'], r()) : role === 'DEF' ? pick(['tackle', 'header', 'arms-crossed'], r())
    : role === 'MID' ? pick(['pass', 'dribble', 'free-kick'], r()) : pick(['shoot', 'knee-slide', 'shoot', 'header'], r());
  let jersey = t.jersey;
  if (!jersey) { const s = Math.floor(r() * JERSEYS.length); for (let i = 0; i < JERSEYS.length; i++) { const c = JERSEYS[(s + i) % JERSEYS.length]; if (dist(c, skin) > 90) { jersey = c; break; } } }
  const face = {};
  for (const k of FACE_KEYS) face[k] = Math.round((t.face?.[k] ?? 1 + (r() - 0.5) * (k === 'head' ? 0.04 : 0.1)) * 100) / 100;
  const surname = (name || '').split(' ').filter(Boolean).pop() || 'PLAYER';
  return {
    kit: 'football',
    skin,
    hair: { style: t.hair || pick(['short', 'crop', 'side-part', 'textured', 'buzz', 'quiff', 'short'], r()), color: HAIR_COLORS[hc] || hc },
    beard: { style: t.beard || pick(['none', 'stubble', 'stubble', 'short', 'none', 'full'], r()), color: HAIR_COLORS[t.beardColor || hc] || HAIR_COLORS[hc] || hc },
    build: t.build || pick(['slim', 'athletic', 'athletic', 'stocky'], r()),
    height,
    headgear: t.headgear || 'none',
    sleeves: t.sleeves || (role === 'GK' ? 'long' : 'short'),
    shoes: t.shoes || pick(['black', 'neon', 'white', 'neon'], r()),
    socks: t.socks || null,
    accessories: t.accessories || (role === 'GK' ? ['keeper-gloves'] : []),
    jersey: { number: t.number ?? (role === 'GK' ? 1 : 2 + Math.floor(r() * 30)), backName: (t.backName || surname).toUpperCase().slice(0, 12), color: jersey || '#1f3a68' },
    face,
    pose: FOOTBALL_POSES.includes(t.pose) ? t.pose : poseDefault,
    hand: t.hand || (foot === 'left' ? 'left' : 'right'),
    curated: !!traits,
  };
}
