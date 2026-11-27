import { Button } from '../components/ui.jsx';
import { go } from '../lib/nav.js';

export default function HowTo({ pack }) {
  const cats = pack.evaluateLineup ? pack.evaluateLineup([], {}).cats : [];
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div className="section-title">How to play</div>
      <div className="col" style={{ gap: 14, marginTop: 12, lineHeight: 1.6 }}>
        <div className="panel">
          <h3>1 · Set up</h3>
          Play <b>solo</b> against bots (or pass-and-play several human teams on one device), or <b>create a room</b> and share the code.
          The host controls everything: purse (min 50 Cr, default 100 Cr, no cap), number of teams (2-10), squad limits, overseas limits,
          role requirements, base prices, bid steps, the timer, auction order, retentions/RTM, bots and which players are in the pool.
        </div>
        <div className="panel">
          <h3>2 · The auction</h3>
          Players come up one at a time with a dramatic reveal. Hit <b>BID</b> (or Space). Every bid resets the timer. When it runs low:
          <i> going once… going twice… SOLD!</i> Nobody bids? <b>UNSOLD</b> - and with second round on, they return later at a discount.
          You can never bid more than you can afford while still keeping enough to fill your minimum squad, and you can't exceed the squad or overseas limits.
          If a team is still short at the end, a supplementary round gives it a chance to fill up.
        </div>
        <div className="panel">
          <h3>3 · The verdict</h3>
          Pick your best {pack.labels?.lineup || 'XI'} (or auto-pick). The site scores every team from real-stat ratings - no match simulation:
          <ul>{cats.map(c => <li key={c.key}><b>{c.label}</b> ({Math.round(c.weight * 100)}%) - {c.hint}</li>)}</ul>
          The highest total wins, with a head-to-head breakdown showing exactly why.
        </div>
        <div className="panel">
          <h3>Ratings</h3>
          Every rating comes from real ball-by-ball data (Cricsheet). Batting compares runs, era-adjusted average and era-adjusted strike rate against every regular batter in the pool;
          bowling does the same with wickets, economy and strike rate. Small samples are shrunk towards average. Open any player card and tap <b>Rating breakdown</b> to see the maths.
        </div>
        <div className="center"><Button variant="primary" size="big" onClick={() => go('/')}>Let's go</Button></div>
      </div>
    </div>
  );
}
