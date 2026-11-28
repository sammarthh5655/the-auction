import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Chips, Field, Seg, Stepper, Toggle, useToast } from '../components/ui.jsx';
import { BUILTIN_PRESETS, TEAM_COLORS, TEAM_NAMES, defaultSettings, validateSettings } from '../engine/settings.js';
import { filterPool } from '../engine/pool.js';
import { retentionCost } from '../engine/game.js';
import { deepMerge, formatMoney } from '../engine/util.js';
import { presets as presetStore } from '../lib/storage.js';
import { claimSeat, leaveSeat } from '../net/rooms.js';
import { go } from '../lib/nav.js';

const TABS = [
  { value: 'teams', label: 'Teams' }, { value: 'money', label: 'Budget & squad' }, { value: 'pool', label: 'Player pool' },
  { value: 'rules', label: 'Auction rules' }, { value: 'retain', label: 'Retention / RTM' }, { value: 'bots', label: 'Bots' }, { value: 'presets', label: 'Presets' },
];

export default function Lobby({ room, isHost, actions, backend, pack, players, code, mode }) {
  const toast = useToast();
  const [tab, setTab] = useState('teams');
  const [s, setS] = useState(room.settings);
  const dirty = useRef(false);
  const timer = useRef(null);
  // follow the room's settings unless the host is mid-edit
  useEffect(() => { if (!dirty.current) setS(room.settings); }, [room.settings]);
  const edit = fn => {
    if (!isHost) return;
    const next = typeof fn === 'function' ? fn(structuredClone(s)) : fn;
    setS(next); dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => { await actions.updateSettings(next); dirty.current = false; }, 250);
  };
  const ro = !isHost;
  const pool = useMemo(() => filterPool(players, s, pack), [players, s, pack]);
  const { problems, warnings } = validateSettings(s, pack, pool.length);
  const cur = pack.currency;
  const seats = room.seats || {};
  const members = room.members || {};
  const myUid = backend.uid;
  const countries = useMemo(() => {
    const c = {}; players.forEach(p => { c[p.country] = (c[p.country] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k]) => ({ value: k, label: k }));
  }, [players]);

  const setTeamCount = n => edit(x => {
    const teams = x.teams.slice(0, n);
    for (let i = teams.length; i < n; i++) teams.push({ id: `t${i + 1}`, name: TEAM_NAMES[i % 10], color: TEAM_COLORS[i % 10], type: 'bot' });
    x.teams = teams; x.teamCount = n; return x;
  });
  const setTeam = (i, patch) => edit(x => { x.teams[i] = { ...x.teams[i], ...patch }; return x; });
  const applyPreset = patch => edit(() => {
    const base = deepMerge(defaultSettings(pack), patch);
    const n = base.teamCount;
    const teams = s.teams.slice(0, n);
    for (let i = teams.length; i < n; i++) teams.push({ id: `t${i + 1}`, name: TEAM_NAMES[i % 10], color: TEAM_COLORS[i % 10], type: 'bot' });
    return { ...base, teams: patch.teams || teams, seed: s.seed };
  });
  const [saved, setSaved] = useState(presetStore.list(pack.id));
  const [presetName, setPresetName] = useState('');

  const start = async () => {
    if (problems.length) { toast(problems[0], 'bad'); return; }
    clearTimeout(timer.current);
    await actions.updateSettings(s);
    dirty.current = false;
    await actions.host.start();
  };

  const roleMins = s.squad.roleMins || {};
  return (
    <div className="page wide">
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <div className="grow">
          <div className="section-title">{mode === 'solo' ? 'Solo auction setup' : 'Auction lobby'}</div>
          <div className="muted">{isHost ? 'You are the host - set the rules, then start the auction.' : 'Waiting for the host to start. Claim a team below.'}</div>
        </div>
        <Button onClick={() => go('/')}>Leave</Button>
      </div>
      <div className="setup-layout">
        <div className="panel">
          <div className="settings-tabs"><Seg value={tab} onChange={setTab} options={TABS} /></div>

          {tab === 'teams' && (
            <div className="col" style={{ gap: 12 }}>
              <div className="row wrap" style={{ gap: 18 }}>
                <Field label="Number of teams"><Stepper value={s.teams.length} min={2} max={10} onChange={setTeamCount} disabled={ro} /></Field>
                <div className="hint grow">{mode === 'solo' ? 'Set any team to "Human" for pass-and-play on this device - each human team gets its own bid button (keys 1-9).' : 'Human seats are claimed by players who join with the room code. Unclaimed seats become bots when the auction starts.'}</div>
              </div>
              {s.teams.map((t, i) => {
                const owner = seats[t.id];
                const ownerName = owner ? (owner === myUid ? 'You' : members[owner]?.name || 'Player') : null;
                return (
                  <div key={t.id} className="team-row">
                    <label className="color-swatch" style={{ background: t.color }} title="Team colour">
                      <input type="color" value={t.color} disabled={ro} onChange={e => setTeam(i, { color: e.target.value })} />
                    </label>
                    <input className="input" value={t.name} maxLength={22} disabled={ro} onChange={e => setTeam(i, { name: e.target.value })} />
                    <select className="input" value={t.type} disabled={ro || (mode === 'solo' && i === 0)} onChange={e => setTeam(i, { type: e.target.value })}>
                      <option value="human">{mode === 'solo' ? 'Human (this device)' : 'Human seat'}</option>
                      <option value="bot" disabled={!s.bots.allowed}>Bot</option>
                    </select>
                    <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                      {mode === 'online' && t.type === 'human' && (ownerName
                        ? <><span className="tag good">{ownerName}</span>{owner === myUid && <Button size="small" onClick={() => leaveSeat(backend, code, t.id)}>Leave</Button>}</>
                        : <Button size="small" variant="primary" onClick={() => claimSeat(backend, code, t.id)}>Take seat</Button>)}
                      {mode === 'solo' && t.type === 'human' && <span className="tag good">You</span>}
                      {t.type === 'bot' && <span className="tag">🤖 {s.bots.difficulty}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'money' && (
            <div className="settings-grid">
              <Field label={`Purse per team (${cur.big})`} hint={pack.purseHint || 'Minimum 50, recommended 100, no upper limit.'}>
                <Stepper value={s.purse} min={50} max={1e6} step={5} unit={cur.big} onChange={v => edit(x => ({ ...x, purse: v }))} disabled={ro} />
              </Field>
              <Field label="Squad size (min - max)">
                <div className="row"><Stepper value={s.squad.min} min={1} max={40} onChange={v => edit(x => { x.squad.min = v; if (x.squad.max < v) x.squad.max = v; return x; })} disabled={ro} />
                  <Stepper value={s.squad.max} min={s.squad.min} max={40} onChange={v => edit(x => { x.squad.max = v; return x; })} disabled={ro} /></div>
              </Field>
              {pack.domestic && <Field label={`${pack.labels.overseas} limit`} hint={pack.overseasHint}>
                <Toggle checked={s.squad.overseasOn} onChange={v => edit(x => { x.squad.overseasOn = v; return x; })} label="Limit overseas players" disabled={ro} />
                {s.squad.overseasOn && <div className="row" style={{ marginTop: 6 }}>
                  <span className="hint">Squad</span><Stepper value={s.squad.overseasMax} min={0} max={40} onChange={v => edit(x => { x.squad.overseasMax = v; return x; })} disabled={ro} />
                  <span className="hint">XI</span><Stepper value={s.squad.lineupOverseasMax} min={0} max={11} onChange={v => edit(x => { x.squad.lineupOverseasMax = v; return x; })} disabled={ro} />
                </div>}
              </Field>}
              {pack.roles.map(r => {
                const req = roleMins[r.key] || { on: false, min: 1 };
                return (
                  <Field key={r.key} label={`Minimum ${r.plural.toLowerCase()}`}>
                    <div className="row">
                      <Toggle checked={req.on} onChange={v => edit(x => { x.squad.roleMins = { ...x.squad.roleMins, [r.key]: { ...req, on: v } }; return x; })} disabled={ro} />
                      <Stepper value={req.min} min={1} max={15} disabled={ro || !req.on} onChange={v => edit(x => { x.squad.roleMins = { ...x.squad.roleMins, [r.key]: { ...req, min: v } }; return x; })} />
                    </div>
                  </Field>
                );
              })}
            </div>
          )}

          {tab === 'pool' && (
            <div className="col" style={{ gap: 16 }}>
              <div className="note">{pool.length} players match these filters · {s.pool.count} will be auctioned.</div>
              <div className="settings-grid">
                <Field label="Retired players / legends"><Toggle checked={s.pool.includeRetired} onChange={v => edit(x => { x.pool.includeRetired = v; if (!v) x.pool.onlyRetired = false; return x; })} label="Include retired" disabled={ro} />
                  <div style={{ marginTop: 6 }}><Toggle checked={!!s.pool.onlyRetired} onChange={v => edit(x => { x.pool.onlyRetired = v; if (v) x.pool.includeRetired = true; return x; })} label="Legends only" disabled={ro} /></div></Field>
                {(pack.extraFilters || []).map(f => (
                  <Field key={f.key} label="Extra"><Toggle checked={s.pool.extra?.[f.key] ?? f.default} onChange={v => edit(x => { x.pool.extra = { ...x.pool.extra, [f.key]: v }; return x; })} label={f.label} disabled={ro} /></Field>
                ))}
                {pack.domestic && <Field label={`${pack.labels.domestic} vs ${pack.labels.overseas}`}>
                  <Seg value={s.pool.origin} disabled={ro} onChange={v => edit(x => { x.pool.origin = v; return x; })}
                    options={[{ value: 'all', label: 'All' }, { value: 'domestic', label: `${pack.labels.domestic} only` }, { value: 'overseas', label: `${pack.labels.overseas} only` }]} />
                </Field>}
                <Field label="Players to auction" hint="Should be at least teams x minimum squad">
                  <Stepper value={s.pool.count} min={10} max={1000} step={5} onChange={v => edit(x => { x.pool.count = v; return x; })} disabled={ro} />
                </Field>
                <Field label="Which players">
                  <Seg value={s.pool.selection} disabled={ro} onChange={v => edit(x => { x.pool.selection = v; return x; })}
                    options={[{ value: 'top', label: 'Top rated' }, { value: 'mix', label: 'Stars + mix' }, { value: 'random', label: 'Random' }]} />
                </Field>
                <Field label="Minimum OVR"><Stepper value={s.pool.minOvr || 0} min={0} max={95} step={5} onChange={v => edit(x => { x.pool.minOvr = v; return x; })} disabled={ro} /></Field>
              </div>
              <Field label="Era (seasons played)"><Chips values={s.pool.eras} options={pack.eras.map(e => ({ value: e.key, label: e.label }))} onChange={v => edit(x => { x.pool.eras = v; return x; })} disabled={ro} allLabel="All eras" /></Field>
              <Field label="Role"><Chips values={s.pool.roles} options={pack.roles.map(r => ({ value: r.key, label: r.plural }))} onChange={v => edit(x => { x.pool.roles = v; return x; })} disabled={ro} allLabel="All roles" /></Field>
              <Field label="Country"><Chips values={s.pool.countries} options={countries} onChange={v => edit(x => { x.pool.countries = v; return x; })} disabled={ro} allLabel="All countries" /></Field>
            </div>
          )}

          {tab === 'rules' && (
            <div className="settings-grid">
              <Field label="Base price" hint="Rating-based: 20 L for fringe players up to 2 Cr for stars (at a 100 Cr purse)">
                <Seg value={s.pricing.baseMode} disabled={ro} onChange={v => edit(x => { x.pricing.baseMode = v; return x; })} options={[{ value: 'rating', label: 'From stats' }, { value: 'flat', label: 'Flat' }]} />
                {s.pricing.baseMode === 'flat' && <div style={{ marginTop: 6 }}><Stepper value={s.pricing.flatBase} min={0.05} max={1000} step={0.05} unit={cur.big} onChange={v => edit(x => { x.pricing.flatBase = v; return x; })} disabled={ro} /></div>}
              </Field>
              <Field label="Scale prices with purse" hint="Base prices & bid steps grow with a bigger purse"><Toggle checked={s.pricing.scaleWithPurse} onChange={v => edit(x => { x.pricing.scaleWithPurse = v; return x; })} disabled={ro} /></Field>
              <Field label="Bid increments" hint="Tiered: steps grow with the price (10 L → 1 Cr)">
                <Seg value={s.pricing.incMode} disabled={ro} onChange={v => edit(x => { x.pricing.incMode = v; return x; })} options={[{ value: 'tiered', label: 'Tiered' }, { value: 'fixed', label: 'Fixed' }, { value: 'percent', label: '% of bid' }]} />
                {s.pricing.incMode === 'fixed' && <div style={{ marginTop: 6 }}><Stepper value={s.pricing.incFixed} min={0.01} max={1000} step={0.05} unit={cur.big} onChange={v => edit(x => { x.pricing.incFixed = v; return x; })} disabled={ro} /></div>}
                {s.pricing.incMode === 'percent' && <div style={{ marginTop: 6 }}><Stepper value={s.pricing.incPercent} min={1} max={50} unit="%" onChange={v => edit(x => { x.pricing.incPercent = v; return x; })} disabled={ro} /></div>}
              </Field>
              <Field label="Bid timer" hint="Resets on every bid"><Stepper value={s.timer} min={3} max={60} unit="sec" onChange={v => edit(x => ({ ...x, timer: v }))} disabled={ro} /></Field>
              <Field label="Auction order">
                <Seg value={s.order} disabled={ro} onChange={v => edit(x => ({ ...x, order: v }))} options={[{ value: 'shuffled', label: 'Shuffled' }, { value: 'sets', label: 'By sets' }, { value: 'marquee', label: 'Marquee first' }]} />
                {s.order === 'marquee' && <div className="row" style={{ marginTop: 6 }}><span className="hint">Marquee players</span><Stepper value={s.marqueeCount} min={1} max={40} onChange={v => edit(x => ({ ...x, marqueeCount: v }))} disabled={ro} /></div>}
                {s.order !== 'shuffled' && <div className="row" style={{ marginTop: 6 }}><span className="hint">Set size</span><Stepper value={s.setSize} min={2} max={30} onChange={v => edit(x => ({ ...x, setSize: v }))} disabled={ro} /></div>}
              </Field>
              <Field label="Unsold players" hint="Come back once more after the main round">
                <Toggle checked={s.secondRound} onChange={v => edit(x => ({ ...x, secondRound: v }))} label="Second round" disabled={ro} />
                {s.secondRound && <div className="row" style={{ marginTop: 6 }}><span className="hint">Base price cut</span><Stepper value={s.secondRoundDiscount} min={0} max={90} step={10} unit="%" onChange={v => edit(x => ({ ...x, secondRoundDiscount: v }))} disabled={ro} /></div>}
              </Field>
            </div>
          )}

          {tab === 'retain' && (
            <div className="col" style={{ gap: 14 }}>
              <div className="settings-grid">
                <Field label="Retentions" hint="Before the auction, teams take turns (snake order) keeping players at fixed slab prices">
                  <Toggle checked={s.retention.on} onChange={v => edit(x => { x.retention.on = v; return x; })} label="Allow retentions" disabled={ro} />
                  {s.retention.on && <div className="row" style={{ marginTop: 6 }}><span className="hint">Max per team</span><Stepper value={s.retention.max} min={1} max={6} onChange={v => edit(x => { x.retention.max = v; return x; })} disabled={ro} /></div>}
                </Field>
                <Field label="Right to Match (RTM)" hint="Tag players in the draft; when one is sold to a rival you may match the final bid">
                  <Toggle checked={s.rtm.on} onChange={v => edit(x => { x.rtm.on = v; return x; })} label="RTM cards" disabled={ro} />
                  {s.rtm.on && <div className="row" style={{ marginTop: 6 }}><span className="hint">Cards per team</span><Stepper value={s.rtm.cards} min={1} max={5} onChange={v => edit(x => { x.rtm.cards = v; return x; })} disabled={ro} /></div>}
                </Field>
              </div>
              {s.retention.on && <div className="note">Retention prices: {Array.from({ length: s.retention.max }, (_, k) => `${k + 1}${['st', 'nd', 'rd'][k] || 'th'} ${formatMoney(retentionCost(k, s, pack), cur)}`).join(' · ')}</div>}
            </div>
          )}

          {tab === 'bots' && (
            <div className="settings-grid">
              <Field label="Allow bots" hint="Bots fill empty seats"><Toggle checked={s.bots.allowed} onChange={v => edit(x => { x.bots.allowed = v; if (!v) x.teams = x.teams.map(t => ({ ...t, type: 'human' })); return x; })} disabled={ro} /></Field>
              <Field label="Bot difficulty" hint="Hard bots value players precisely, pace their budget and snipe late">
                <Seg value={s.bots.difficulty} disabled={ro} onChange={v => edit(x => { x.bots.difficulty = v; return x; })} options={[{ value: 'easy', label: 'Easy' }, { value: 'medium', label: 'Medium' }, { value: 'hard', label: 'Hard' }]} />
              </Field>
            </div>
          )}

          {tab === 'presets' && (
            <div className="col" style={{ gap: 14 }}>
              <div className="label">Built-in</div>
              <div className="row wrap">{BUILTIN_PRESETS.map(p => <Button key={p.id} size="small" disabled={ro} onClick={() => { applyPreset(p.patch); toast(`Loaded "${p.name}"`); }}>{p.name}</Button>)}</div>
              <div className="divider" />
              <div className="label">Your presets (saved on this device)</div>
              <div className="row">
                <input className="input" placeholder="Preset name" value={presetName} onChange={e => setPresetName(e.target.value)} maxLength={30} />
                <Button variant="primary" disabled={!presetName.trim()} onClick={() => { setSaved(presetStore.save(pack.id, presetName.trim(), s)); toast('Preset saved'); setPresetName(''); }}>Save current</Button>
              </div>
              {saved.length === 0 && <div className="hint">No saved presets yet.</div>}
              {saved.map(p => (
                <div key={p.name} className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--line2)' }}>
                  <div className="grow"><b>{p.name}</b> <span className="hint">{new Date(p.savedAt).toLocaleDateString()}</span></div>
                  <Button size="small" disabled={ro} onClick={() => { applyPreset(p.settings); toast(`Loaded "${p.name}"`); }}>Load</Button>
                  <Button size="small" variant="danger" onClick={() => setSaved(presetStore.remove(pack.id, p.name))}>Delete</Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="col" style={{ gap: 16 }}>
          {mode === 'online' && (
            <div className="panel center">
              <div className="label">Room code</div>
              <div className="room-code">{code}</div>
              <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
                <Button size="small" onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}${window.location.pathname}${window.location.search}#/room/${code}`); toast('Invite link copied'); }}>Copy invite link</Button>
              </div>
              <div className="divider" />
              <div style={{ textAlign: 'left' }}>
                <div className="label">In the room</div>
                {Object.entries(members).map(([uid, m]) => (
                  <div key={uid} className="member"><span className={`online-dot ${m.online === false ? 'off' : ''}`} /><span className="grow">{m.name}{uid === myUid ? ' (you)' : ''}</span>{room.meta.hostUid === uid && <span className="tag gold">Host</span>}</div>
                ))}
              </div>
            </div>
          )}
          <div className="panel">
            <h3>Summary</h3>
            <div className="col" style={{ gap: 6, fontSize: 14 }}>
              <div className="row"><span className="grow muted">Teams</span><b>{s.teams.length}</b></div>
              <div className="row"><span className="grow muted">Purse</span><b>{formatMoney(Math.round(s.purse * cur.bigFactor), cur)}</b></div>
              <div className="row"><span className="grow muted">Squad</span><b>{s.squad.min}–{s.squad.max}</b></div>
              <div className="row"><span className="grow muted">Timer</span><b>{s.timer}s</b></div>
              <div className="row"><span className="grow muted">Players</span><b>{Math.min(s.pool.count, pool.length)} of {pool.length}</b></div>
              <div className="row"><span className="grow muted">Order</span><b>{{ shuffled: 'Shuffled', sets: 'By sets', marquee: 'Marquee first' }[s.order]}</b></div>
              <div className="row"><span className="grow muted">Bots</span><b>{s.bots.allowed ? s.bots.difficulty : 'off'}</b></div>
            </div>
            {problems.map(p => <div key={p} className="err" style={{ marginTop: 10 }}>{p}</div>)}
            {warnings.map(p => <div key={p} className="note" style={{ marginTop: 10 }}>{p}</div>)}
            {isHost
              ? <Button variant="primary" size="big" style={{ width: '100%', marginTop: 14 }} disabled={problems.length > 0} onClick={start}>Start auction</Button>
              : <div className="hint center" style={{ marginTop: 14 }}>Only the host can start.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
