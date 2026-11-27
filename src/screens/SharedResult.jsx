import { decodeResult } from '../lib/share.js';
import { Button } from '../components/ui.jsx';
import { ResultsView } from './Results.jsx';
import { go } from '../lib/nav.js';

export default function SharedResult({ data, pack, players }) {
  const r = decodeResult(data);
  if (!r) return <div className="page"><div className="err">This result link is broken or from an older version.</div></div>;
  return (
    <div className="page wide">
      <div className="note" style={{ marginBottom: 14 }}>Shared result - recomputed from the same public player database.</div>
      <ResultsView teams={r.teams} lineups={r.lineups} settings={r.settings} pack={pack} players={players}
        footer={<div className="center"><Button variant="primary" size="big" onClick={() => go('/')}>Start your own auction</Button></div>} />
    </div>
  );
}
