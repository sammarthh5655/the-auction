/**
 * FOOTBALL SPORT PACK - placeholder ("Coming soon").
 * Shows how a second sport plugs in. To make it playable, implement the same fields as
 * src/sports/cricket/pack.js (dataUrl, roles, defaults, baseSlab, evaluateLineup, autoPickLineup,
 * keyStats, revealStats, detailSections, ratingBreakdown, loadCharacter ...) and set available: true.
 */
const football = {
  id: 'football',
  name: 'Football',
  emoji: '⚽',
  available: false,
  tagline: 'Club transfer auction - coming soon',
  domestic: null,
  labels: { domestic: 'Home-grown', overseas: 'Foreign', league: 'League', lineup: 'Starting XI', squad: 'Squad', retired: 'Retired / legend' },
  currency: { symbol: '€', big: 'M', small: 'K', bigFactor: 1000 },
  theme: { accent: '#7cf2a4', accent2: '#3dd6ff', stage: '#07140f', glow: '#9dffc4', pitch: '#13361f' },
  roles: [
    { key: 'GK', label: 'Goalkeeper', plural: 'Goalkeepers', color: '#ffd54f', icon: '🧤' },
    { key: 'DEF', label: 'Defender', plural: 'Defenders', color: '#4fb3ff', icon: '🛡️' },
    { key: 'MID', label: 'Midfielder', plural: 'Midfielders', color: '#ffb547', icon: '🎯' },
    { key: 'FWD', label: 'Forward', plural: 'Forwards', color: '#ff6b6b', icon: '⚡' },
  ],
  lineupSize: 11,
  poses: ['bicycle-kick', 'knee-slide', 'free-kick', 'keeper-dive', 'arms-crossed'],
};
export default football;
