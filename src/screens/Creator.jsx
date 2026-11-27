import { lazy, Suspense, useMemo, useState } from 'react';
import { Button, Field, Seg, useToast } from '../components/ui.jsx';
import Avatar2D from '../components/Avatar2D.jsx';
import { canUse3D } from '../three/capability.js';

const CharacterViewer = lazy(() => import('../three/CharacterViewer.jsx'));

const OPTIONS = {
  hair: ['bald', 'buzz', 'crop', 'short', 'side-part', 'quiff', 'slick-back', 'undercut', 'textured', 'spiky', 'curly', 'afro', 'long', 'mullet', 'man-bun', 'mohawk', 'dreadlocks', 'receding'],
  beard: ['none', 'stubble', 'short', 'full', 'long', 'chinstrap', 'goatee', 'mustache', 'french'],
  build: ['slim', 'athletic', 'stocky', 'heavy'],
  height: ['short', 'medium', 'tall'],
  headgear: ['none', 'helmet', 'cap', 'sunhat', 'patka', 'headband', 'bandana'],
  sleeves: ['short', 'long'],
  shoes: ['white', 'black', 'neon'],
  accessories: ['sunglasses', 'chain', 'wristbands', 'tattoo-sleeve', 'zinc', 'keeper-gloves'],
};
const FACE = [['head', 'Head size'], ['width', 'Face width'], ['length', 'Face length'], ['jaw', 'Jaw'], ['cheeks', 'Cheeks'],
  ['nose', 'Nose'], ['brow', 'Brow'], ['forehead', 'Forehead'], ['chin', 'Chin'], ['ears', 'Ears']];
const SKINS = ['#f5dcc8', '#eac3a6', '#deae86', '#cf9a70', '#b88257', '#a36d47', '#83532f', '#6b4027', '#5c3520'];

function Pick({ label, value, options, onChange }) {
  return <Field label={label}><select className="input" value={value} onChange={e => onChange(e.target.value)}>{options.map(o => <option key={o} value={o}>{o}</option>)}</select></Field>;
}

/** Character creator: tweak any player's look, preview in 3D, copy the traits JSON into data/cricket/traits.json */
export default function Creator({ pack, players, initialId }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [pid, setPid] = useState(initialId || players[0]?.id);
  const player = players.byId[pid];
  const [ch, setCh] = useState(() => structuredClone(player.character));
  const [customImage, setCustomImage] = useState(player.customImage || '');
  const [customModel, setCustomModel] = useState(player.customModel || '');
  const [view, setView] = useState(canUse3D() ? '3d' : '2d');
  const [closeUp, setCloseUp] = useState(false);
  const choose = id => { setPid(id); setCh(structuredClone(players.byId[id].character)); setCustomImage(players.byId[id].customImage || ''); setCustomModel(players.byId[id].customModel || ''); };
  const upd = patch => setCh(c => ({ ...c, ...patch }));
  const matches = useMemo(() => players.filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 40), [players, q]);
  const json = useMemo(() => {
    const tone = ch.skin;
    const out = {
      skin: tone, hair: ch.hair.style, hairColor: ch.hair.color, beard: ch.beard.style, beardColor: ch.beard.color, build: ch.build, height: ch.height,
      headgear: ch.headgear, sleeves: ch.sleeves, shoes: ch.shoes, number: ch.jersey.number, backName: ch.jersey.backName, jersey: ch.jersey.color,
      hand: ch.hand, pose: ch.pose, accessories: ch.accessories, face: ch.face,
    };
    if (customImage) out.customImage = customImage;
    if (customModel) out.customModel = customModel;
    return `"${player.short}": ${JSON.stringify(out)}`;
  }, [ch, player, customImage, customModel]);

  return (
    <div className="page wide">
      <div className="section-title">Character creator</div>
      <div className="muted" style={{ marginBottom: 14 }}>
        Every player is a stylized low-poly figure generated from trait fields - no photos. Tweak a look here, then paste the JSON line into
        <code> data/cricket/traits.json</code> and re-run <code>npm run data:cricket</code>. Add <code>customImage</code> to use your own licensed artwork instead.
      </div>
      <div className="creator">
        <div className="col" style={{ gap: 12 }}>
          <div className="creator-stage">
            {view === '3d'
              ? <Suspense fallback={<div className="center muted" style={{ paddingTop: 200 }}>Loading 3D…</div>}><CharacterViewer player={{ ...player, customImage, customModel: customModel || null }} pack={pack} character={ch} poseKey={ch.pose} closeUp={closeUp} /></Suspense>
              : <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}><div style={{ width: 300 }}><Avatar2D character={ch} /></div></div>}
            <div className="row" style={{ position: 'absolute', top: 12, left: 12 }}>
              <Seg value={view} onChange={setView} options={[{ value: '3d', label: '3D' }, { value: '2d', label: '2D' }]} />
              {view === '3d' && <Seg value={closeUp ? 'face' : 'full'} onChange={v => setCloseUp(v === 'face')} options={[{ value: 'full', label: 'Full body' }, { value: 'face', label: 'Face' }]} />}
            </div>
          </div>
          <div className="panel tight">
            <div className="row"><b className="grow">{player.name}</b><Button size="small" variant="primary" onClick={() => { navigator.clipboard?.writeText(json); toast('Traits JSON copied'); }}>Copy traits JSON</Button></div>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12, color: 'var(--muted)', margin: '8px 0 0' }}>{json}</pre>
          </div>
        </div>
        <div className="panel col" style={{ gap: 12, maxHeight: 900, overflow: 'auto' }}>
          <Field label="Player"><input className="input" placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} />
            <select className="input" value={pid} onChange={e => choose(e.target.value)} style={{ marginTop: 6 }}>{matches.concat(matches.some(m => m.id === pid) ? [] : [player]).map(p => <option key={p.id} value={p.id}>{p.name} ({p.ovr})</option>)}</select></Field>
          <Pick label="Pose" value={ch.pose} options={pack.poses} onChange={v => upd({ pose: v })} />
          <Field label="Skin tone"><div className="row wrap" style={{ gap: 6 }}>{SKINS.map(c => <button key={c} className="color-swatch" style={{ background: c, outline: ch.skin === c ? '2px solid var(--gold)' : 'none' }} onClick={() => upd({ skin: c })} />)}
            <label className="color-swatch" style={{ background: ch.skin }}><input type="color" value={ch.skin} onChange={e => upd({ skin: e.target.value })} /></label></div></Field>
          <div className="grid2">
            <Pick label="Hair" value={ch.hair.style} options={OPTIONS.hair} onChange={v => upd({ hair: { ...ch.hair, style: v } })} />
            <Field label="Hair colour"><input type="color" className="input" style={{ height: 40, padding: 2 }} value={ch.hair.color} onChange={e => upd({ hair: { ...ch.hair, color: e.target.value } })} /></Field>
            <Pick label="Beard" value={ch.beard.style} options={OPTIONS.beard} onChange={v => upd({ beard: { ...ch.beard, style: v } })} />
            <Field label="Beard colour"><input type="color" className="input" style={{ height: 40, padding: 2 }} value={ch.beard.color} onChange={e => upd({ beard: { ...ch.beard, color: e.target.value } })} /></Field>
            <Pick label="Build" value={ch.build} options={OPTIONS.build} onChange={v => upd({ build: v })} />
            <Pick label="Height" value={ch.height} options={OPTIONS.height} onChange={v => upd({ height: v })} />
            <Pick label="Headgear" value={ch.headgear} options={OPTIONS.headgear} onChange={v => upd({ headgear: v })} />
            <Pick label="Sleeves" value={ch.sleeves} options={OPTIONS.sleeves} onChange={v => upd({ sleeves: v })} />
            <Pick label="Shoes" value={ch.shoes} options={OPTIONS.shoes} onChange={v => upd({ shoes: v })} />
            <Pick label="Hand" value={ch.hand} options={['right', 'left']} onChange={v => upd({ hand: v })} />
            <Field label="Jersey number"><input className="input" type="number" min={0} max={999} value={ch.jersey.number} onChange={e => upd({ jersey: { ...ch.jersey, number: Number(e.target.value) } })} /></Field>
            <Field label="Name on back"><input className="input" maxLength={12} value={ch.jersey.backName} onChange={e => upd({ jersey: { ...ch.jersey, backName: e.target.value.toUpperCase() } })} /></Field>
            <Field label="Jersey colour (team-neutral)"><input type="color" className="input" style={{ height: 40, padding: 2 }} value={ch.jersey.color} onChange={e => upd({ jersey: { ...ch.jersey, color: e.target.value } })} /></Field>
          </div>
          <Field label="Face shape" hint="Sculpts the head mesh. 1.00 = base model.">
            <div className="col" style={{ gap: 6 }}>
              {FACE.map(([k, label]) => (
                <div key={k} className="row" style={{ gap: 8 }}>
                  <span className="hint" style={{ width: 70 }}>{label}</span>
                  <input type="range" min={0.8} max={1.25} step={0.01} value={ch.face?.[k] ?? 1} className="grow"
                    onChange={e => upd({ face: { ...(ch.face || {}), [k]: Number(e.target.value) } })} />
                  <span className="num" style={{ width: 36, textAlign: 'right' }}>{(ch.face?.[k] ?? 1).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </Field>
          <Field label="Accessories"><div className="chips">{OPTIONS.accessories.map(a => (
            <button key={a} className={`chip ${ch.accessories?.includes(a) ? 'on' : ''}`} onClick={() => upd({ accessories: ch.accessories?.includes(a) ? ch.accessories.filter(x => x !== a) : [...(ch.accessories || []), a] })}>{a}</button>))}</div></Field>
          <Field label="customModel (optional)" hint="Path or URL to your own licensed 3D model of this player (.glb). Replaces the generated character in the 3D reveal, e.g. models/players/kohli.glb in /public."><input className="input" value={customModel} onChange={e => setCustomModel(e.target.value)} placeholder="models/players/name.glb" /></Field>
          <Field label="customImage (optional)" hint="Path or URL to your own licensed cutout (PNG with transparency). Replaces the 3D character, e.g. images/players/kohli.png in /public."><input className="input" value={customImage} onChange={e => setCustomImage(e.target.value)} placeholder="images/players/name.png" /></Field>
        </div>
      </div>
    </div>
  );
}
