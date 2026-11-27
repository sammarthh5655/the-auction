/**
 * CHARACTER CREATOR (cricket) - rigged human model edition.
 * Body + hair: "Universal Base Characters" by Quaternius (CC0), packed into public/models/cricketer/ by
 * scripts/models/pack-models.mjs. Everything that makes a player recognisable is applied from his traits:
 * skin tone, hairstyle + colour, beard, build, height, kit colour (jersey / trousers / shoes painted onto
 * the body by bone region), name + number on the back, headgear, pads, gloves, bat/ball, accessories,
 * and his signature pose (retargeted from poses.js onto the skeleton).
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { poseFor } from './poses.js';
import { boneAxes, clothGeometry, physique } from './characterMesh.js';
import { Bat, Hair, Headgear, backTexture, useMats } from './CricketCharacterLowPoly.jsx';

// bump MODEL_VERSION after re-running scripts/models/pack-models.mjs so browsers refetch
const MODEL_VERSION = 4;
const url = f => `${import.meta.env.BASE_URL}models/cricketer/${f}.glb?v=${MODEL_VERSION}`;
const tex = f => `${import.meta.env.BASE_URL}models/cricketer/tex/${f}.webp?v=${MODEL_VERSION}`;
const TEX_FILES = ['skin_detail', 'skin_normal', 'skin_rough', 'hair1_detail', 'hair1_normal', 'hair2_detail', 'hair2_normal'];
const HAIR_TEX = { hair_long: 2, hair_buns: 2 };
const DETAIL_MEAN = 0.68; // linear mean of the detail maps (215/255 sRGB) - colour is divided by it

/** colour x detail-map material: keeps the trait colour, adds the pack's texture detail */
function detailMaterial(hex, map, normalMap, extra = {}) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(1 / DETAIL_MEAN);
  c.r = Math.min(1, c.r); c.g = Math.min(1, c.g); c.b = Math.min(1, c.b);
  return new THREE.MeshStandardMaterial({ color: c, map, normalMap, ...extra });
}

export const MODEL_FILES = ['body', 'hair_buzzed', 'hair_simpleparted', 'hair_long', 'hair_buns', 'hair_beard'];
const HAIR_FILE = {
  buzz: 'hair_buzzed', receding: 'hair_buzzed', crop: 'hair_buzzed', spiky: 'hair_buzzed', curly: 'hair_buzzed', mohawk: 'hair_buzzed',
  afro: 'hair_buzzed', dreadlocks: 'hair_buzzed',
  short: 'hair_simpleparted', 'side-part': 'hair_simpleparted', quiff: 'hair_simpleparted', 'slick-back': 'hair_simpleparted',
  undercut: 'hair_simpleparted', textured: 'hair_simpleparted', mullet: 'hair_simpleparted',
  long: 'hair_long', 'man-bun': 'hair_buns', ponytail: 'hair_buns',
};
const PRIMITIVE_HAIR = new Set(['spiky', 'curly', 'afro', 'mohawk', 'dreadlocks', 'quiff', 'mullet']);
const GLB_BEARD = new Set(['short', 'full', 'long', 'chinstrap', 'stubble']);
const D = Math.PI / 180;
const R = 0.105; // head "radius" in metres for the primitive add-ons (helmet, extras)

// --------------------------------------------------------------- kit painting by bone region
const JERSEY = /^(spine_0[123]|clavicle_[lr]|upperarm_[lr])$/;
const PANTS = /^(pelvis|thigh_[lr]|calf_[lr])$/;
const SHOES = /^(foot_[lr]|ball_[lr]|ball_leaf_[lr])$/;
const HANDS = /^(hand_[lr]|(index|middle|ring|pinky|thumb)_.*)$/;
const kitCache = new Map();
function kitGeometry(mesh, longSleeves, tattoo) {
  const key = `${mesh.geometry.uuid}|${longSleeves}|${tattoo}`;
  if (kitCache.has(key)) return kitCache.get(key);
  const g = mesh.geometry.clone();
  const idx = g.index ? g.index.array : Array.from({ length: g.attributes.position.count }, (_, i) => i);
  const sj = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const names = mesh.skeleton.bones.map(b => b.name);
  const cls = new Uint8Array(g.attributes.position.count);
  for (let i = 0; i < cls.length; i++) {
    let bi = 0, bw = -1;
    for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; bi = sj.getComponent(i, k); } }
    const n = names[bi];
    cls[i] = JERSEY.test(n) || (longSleeves && /^lowerarm_[lr]$/.test(n)) ? 1 : PANTS.test(n) ? 2 : SHOES.test(n) ? 3 : HANDS.test(n) ? 4
      : tattoo && /^lowerarm_l$/.test(n) ? 5 : 0;
  }
  const buckets = [[], [], [], [], [], []];
  for (let t = 0; t < idx.length; t += 3) {
    const a = cls[idx[t]], b = cls[idx[t + 1]], c = cls[idx[t + 2]];
    const k = a === b || a === c ? a : b === c ? b : a;
    buckets[k].push(idx[t], idx[t + 1], idx[t + 2]);
  }
  const flat = [].concat(...buckets);
  g.setIndex(flat);
  g.clearGroups();
  let start = 0;
  buckets.forEach((b, i) => { if (b.length) g.addGroup(start, b.length, i); start += b.length; });
  kitCache.set(key, g);
  return g;
}

// --------------------------------------------------------------- face sculpting
/**
 * Reshapes the head in bind space so each player gets his own face: all parameters are multipliers
 * around 1 (see traits "face"): head, width, length, jaw, cheeks, nose, brow, forehead, chin, ears.
 * Applied identically to the body, eyes, eyebrows, hair and beard meshes so everything stays attached.
 */
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const bump = (x, c, w) => { const d = (x - c) / w; return Math.exp(-d * d); };
export function sculptPoint(v, f) {
  let { x, y, z } = v;
  const hw = smooth(1.53, 1.59, y);
  if (hw <= 0) return v;
  const g = k => 1 + ((f[k] ?? 1) - 1) * hw;
  // overall head size + width around the neck pivot
  const py = 1.56;
  const s = g('head');
  x *= s * g('width'); y = py + (y - py) * s; z *= s;
  const E = 1.715 * s + py * (1 - s);
  if (y < E) y = E - (E - y) * g('length');
  if (y > E + 0.015) y = E + 0.015 + (y - E - 0.015) * g('forehead');
  const jt = smooth(1.675, 1.6, y);
  x *= 1 + ((f.jaw ?? 1) - 1) * jt * hw;
  const wc = bump(y, 1.665, 0.03) * smooth(0.025, 0.06, Math.abs(x)) * (z > 0 ? 1 : 0.3) * hw;
  x *= 1 + ((f.cheeks ?? 1) - 1) * 0.9 * wc; z += ((f.cheeks ?? 1) - 1) * 0.02 * wc;
  const wn = bump(x, 0, 0.02) * bump(y, 1.685, 0.028) * smooth(0.06, 0.1, z) * hw;
  z += ((f.nose ?? 1) - 1) * 0.035 * wn; x *= 1 + ((f.nose ?? 1) - 1) * 0.7 * wn;
  const wb = bump(y, 1.737, 0.013) * smooth(0.06, 0.095, z) * hw;
  z += ((f.brow ?? 1) - 1) * 0.025 * wb;
  const wch = bump(x, 0, 0.035) * bump(y, 1.59, 0.025) * smooth(0.02, 0.07, z) * hw;
  z += ((f.chin ?? 1) - 1) * 0.035 * wch; y -= ((f.chin ?? 1) - 1) * 0.012 * wch;
  const we = smooth(0.075, 0.09, Math.abs(x)) * bump(y, 1.7, 0.04) * smooth(0.02, -0.04, z) * hw;
  x += Math.sign(x) * ((f.ears ?? 1) - 1) * 0.03 * we;
  v.x = x; v.y = y; v.z = z;
  return v;
}
const sculptCache = new Map();
function sculpted(geometry, face) {
  if (!face) return geometry;
  const key = `${geometry.uuid}|${JSON.stringify(face)}`;
  if (sculptCache.has(key)) return sculptCache.get(key);
  const g = geometry.clone();
  const pos = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); sculptPoint(v, face); pos.setXYZ(i, v.x, v.y, v.z); }
  pos.needsUpdate = true;
  // recompute normals for the head only - keep the artist's normals (and seams) everywhere else
  const orig = geometry.attributes.normal;
  g.computeVertexNormals();
  const nrm = g.attributes.normal, p0 = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) if (p0.getY(i) < 1.54) nrm.setXYZ(i, orig.getX(i), orig.getY(i), orig.getZ(i));
  if (sculptCache.size > 200) sculptCache.clear();
  sculptCache.set(key, g);
  return g;
}

// --------------------------------------------------------------- pose retargeting
const SEGMENTS = {
  pelvis: 'hips', spine_01: ['hips', 'spine', 0.4], spine_02: ['hips', 'spine', 0.72], spine_03: 'spine',
  neck_01: ['spine', 'head', 0.5], Head: 'head',
  upperarm_l: 'lSh', lowerarm_l: 'lEl', upperarm_r: 'rSh', lowerarm_r: 'rEl',
  thigh_l: 'lHip', calf_l: 'lKnee', thigh_r: 'rHip', calf_r: 'rKnee',
};
const CHILD = { pelvis: 'spine_01', spine_01: 'spine_02', spine_02: 'spine_03', spine_03: 'neck_01', neck_01: 'Head',
  upperarm_l: 'lowerarm_l', lowerarm_l: 'hand_l', upperarm_r: 'lowerarm_r', lowerarm_r: 'hand_r',
  thigh_l: 'calf_l', calf_l: 'foot_l', thigh_r: 'calf_r', calf_r: 'foot_r' };
const DOWN = /^(upperarm|lowerarm|thigh|calf)_/;
const JOINTS = ['hips', 'spine', 'head', 'lSh', 'lEl', 'rSh', 'rEl', 'lHip', 'lKnee', 'rHip', 'rKnee'];

function mirrorPose(p) {
  const m = a => [a[0], -a[1], -a[2]];
  return {
    ...p, hips: m(p.hips), spine: m(p.spine), head: m(p.head),
    lSh: m(p.rSh), rSh: m(p.lSh), lEl: m(p.rEl), rEl: m(p.lEl), lHip: m(p.rHip), rHip: m(p.lHip), lKnee: m(p.rKnee), rKnee: m(p.lKnee),
    bat: p.bat && m(p.bat), motion: (p.motion || []).map(x => ({ ...x, j: x.j.replace(/^l/, '#').replace(/^r/, 'l').replace(/^#/, 'r'), amp: x.a === 0 ? x.amp : -x.amp })),
  };
}

function buildRig(scene) {
  scene.updateMatrixWorld(true);
  const bones = {};
  scene.traverse(o => { if (o.isBone) bones[o.name] = o; });
  const rest = {};
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  for (const [name, b] of Object.entries(bones)) {
    const worldQ = b.getWorldQuaternion(new THREE.Quaternion());
    let align = new THREE.Quaternion();
    if (CHILD[name] && bones[CHILD[name]]) {
      b.getWorldPosition(tmpA); bones[CHILD[name]].getWorldPosition(tmpB);
      const dir = tmpB.sub(tmpA).normalize();
      align = new THREE.Quaternion().setFromUnitVectors(dir, DOWN.test(name) ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(0, 1, 0));
    }
    rest[name] = { worldQ, localQ: b.quaternion.clone(), align };
  }
  return { bones, rest, rootBone: bones.root || bones.pelvis };
}

function Socket({ sref, children }) { return <group ref={sref}>{children}</group>; }

/** Moustache / goatee / french beard sized for the rigged head (socket origin = head centre). */
function FacialHair({ style, mat }) {
  const lip = [0, -0.026, 0.104];
  const tache = (curl) => (
    <group position={lip}>
      <mesh material={mat} position={[0.015, 0, -0.002]} rotation={[0, 0.35, Math.PI / 2 - 0.22]}><capsuleGeometry args={[0.005, 0.022, 2, 6]} /></mesh>
      <mesh material={mat} position={[-0.015, 0, -0.002]} rotation={[0, -0.35, -(Math.PI / 2 - 0.22)]}><capsuleGeometry args={[0.005, 0.022, 2, 6]} /></mesh>
      {curl && <><mesh material={mat} position={[0.031, 0.007, -0.008]}><sphereGeometry args={[0.0042, 6, 5]} /></mesh>
        <mesh material={mat} position={[-0.031, 0.007, -0.008]}><sphereGeometry args={[0.0042, 6, 5]} /></mesh></>}
    </group>
  );
  const goatee = <mesh material={mat} position={[0, -0.082, 0.088]} rotation={[0.35, 0, 0]}><capsuleGeometry args={[0.012, 0.018, 2, 8]} /></mesh>;
  switch (style) {
    case 'mustache': return tache(true);
    case 'goatee': return <group>{tache(false)}{goatee}</group>;
    case 'french': return goatee;
    default: return null;
  }
}

export default function CricketCharacterGLB({ character, poseKey, strike = 1, idle = true }) {
  const ch = character || {};
  const gltfs = useGLTF(MODEL_FILES.map(url));
  const files = Object.fromEntries(MODEL_FILES.map((f, i) => [f, gltfs[i]]));
  const texList = useTexture(TEX_FILES.map(tex));
  const T = useMemo(() => {
    const t = Object.fromEntries(TEX_FILES.map((f, i) => [f, texList[i]]));
    for (const [k, x] of Object.entries(t)) {
      x.flipY = false;
      x.colorSpace = /detail/.test(k) ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      x.anisotropy = 4;
      x.needsUpdate = true;
    }
    return t;
  }, [texList]);
  const mats = useMats(ch);
  const left = ch.hand === 'left';
  const basePose = poseFor(poseKey || ch.pose);
  const pose = useMemo(() => (left ? mirrorPose(basePose) : basePose), [basePose, left]);
  const stand = useMemo(() => (left ? mirrorPose(poseFor('stand')) : poseFor('stand')), [left]);
  const batting = !!pose.bat;
  const keeper = !!pose.keeper;
  const acc = ch.accessories || [];
  const hairStyle = ch.hair?.style || 'short';
  const beardStyle = ch.beard?.style || 'none';
  const helmetLike = ch.headgear === 'helmet' || ch.headgear === 'patka';
  const face = ch.face || null;
  const faceKey = JSON.stringify(face);

  // ---- build the character (clone skeleton, paint kit, attach hair + beard)
  const built = useMemo(() => {
    const scene = cloneSkinned(files.body.scene);
    const rig = buildRig(scene);
    const axes = boneAxes(rig, CHILD);
    let body = null;
    scene.traverse(o => { if (o.isSkinnedMesh && o.name === 'SuperHero_Male') body = o; });
    const skin = detailMaterial(ch.skin || '#c98f66', T.skin_detail, T.skin_normal, { roughnessMap: T.skin_rough, roughness: 1, normalScale: new THREE.Vector2(0.7, 0.7) });
    const tattoo = detailMaterial(new THREE.Color(ch.skin || '#c98f66').multiplyScalar(0.72), T.skin_detail, T.skin_normal, { roughness: 0.7 });
    const hands = (batting || keeper) ? mats.glove : skin;
    if (body) {
      const kit = kitGeometry(body, ch.sleeves === 'long', acc.includes('tattoo-sleeve'));
      body.geometry = sculpted(physique(kit, body.skeleton, axes, ch.build), face);
      body.material = [skin, mats.jersey, mats.pants, mats.shoe, hands, tattoo];
      body.castShadow = true;
      // loose jersey + trousers draped over the body (skinned to the same skeleton)
      const cloth = (group, offset, material) => {
        const g = clothGeometry(body.geometry, group, offset); if (!g) return;
        const m = new THREE.SkinnedMesh(g, material);
        m.bind(body.skeleton, body.bindMatrix);
        m.frustumCulled = false; m.castShadow = true;
        body.parent.add(m);
      };
      cloth(1, 0.011, new THREE.MeshStandardMaterial({ color: ch.jersey?.color || '#1f3a68', roughness: 0.78, metalness: 0.02 }));
      cloth(2, 0.009, new THREE.MeshStandardMaterial({ color: mats.pants.color, roughness: 0.85 }));
    }
    scene.traverse(o => {
      if (!o.isSkinnedMesh) return;
      if (o !== body) o.geometry = sculpted(o.geometry, face);
      if (o.name === 'Eyebrows') o.material = detailMaterial(ch.hair?.color || '#15110f', T.hair1_detail, T.hair1_normal, { roughness: 0.9, side: THREE.DoubleSide });
      if (o.name === 'Eyes' && !o.material.map) o.material = new THREE.MeshStandardMaterial({ color: '#f2efe9', roughness: 0.15 });
      o.frustumCulled = false;
    });
    const attach = (file, makeMaterial) => {
      const src = files[file]?.scene; if (!src) return;
      src.traverse(o => {
        if (!o.isSkinnedMesh) return;
        const m = o.clone();
        const sk = new THREE.Skeleton(o.skeleton.bones.map(b => rig.bones[b.name] || b), o.skeleton.boneInverses);
        m.bind(sk, o.bindMatrix);
        m.geometry = sculpted(o.geometry, face);
        m.material = makeMaterial(HAIR_TEX[file] || 1); m.frustumCulled = false;
        (body?.parent || scene).add(m);
      });
    };
    const hairMat = k => detailMaterial(ch.hair?.color || '#15110f', T[`hair${k}_detail`], T[`hair${k}_normal`], { roughness: 0.78, side: THREE.DoubleSide });
    const beardMat = k => detailMaterial(ch.beard?.color || ch.hair?.color || '#15110f', T[`hair${k}_detail`], T[`hair${k}_normal`], { roughness: 0.88, side: THREE.DoubleSide,
      transparent: beardStyle === 'stubble', opacity: beardStyle === 'stubble' ? 0.5 : 1 });
    if (hairStyle !== 'bald' && !(helmetLike && hairStyle !== 'long') && HAIR_FILE[hairStyle]) attach(HAIR_FILE[hairStyle], hairMat);
    if (GLB_BEARD.has(beardStyle)) attach('hair_beard', beardMat);
    // fixed bounds for every skinned mesh: three.js would otherwise recompute them through the bones on
    // the first render, which can run while a freshly cloned skeleton is still being swapped in
    const bounds = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 1.6);
    scene.traverse(o => { if (o.isSkinnedMesh) { o.boundingSphere = bounds.clone(); o.boundingBox = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(0, 1, 0), new THREE.Vector3(3, 3, 3)); } });
    return { scene, rig };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.body, T, ch.build, ch.jersey?.color, ch.skin, ch.sleeves, ch.hair?.color, ch.hair?.style, ch.beard?.style, ch.beard?.color, ch.headgear, batting, keeper, mats, acc.join(), faceKey]);

  const backTex = useMemo(() => backTexture(ch.jersey?.backName, ch.jersey?.number, ch.jersey?.color || '#1f3a68'), [ch.jersey?.backName, ch.jersey?.number, ch.jersey?.color]);
  useEffect(() => () => backTex.dispose(), [backTex]);

  const group = useRef();
  const model = useRef();
  const cur = useRef(Object.fromEntries(JOINTS.map(j => [j, stand[j].slice()])));
  const drop = useRef(0);
  const sockets = { head: useRef(), handR: useRef(), handL: useRef(), calfL: useRef(), calfR: useRef(), chest: useRef(), neck: useRef(), foreL: useRef() };
  const batRef = useRef();
  const h = { short: 0.94, medium: 1, tall: 1.06 }[ch.height] || 1;
  const w = { slim: 0.97, athletic: 1, stocky: 1.03, heavy: 1.05 }[ch.build] || 1; // girth comes from physique(); this is just shoulder spread

  const q = useMemo(() => ({
    e: new THREE.Euler(), V: Object.fromEntries(JOINTS.map(j => [j, new THREE.Quaternion()])), tmp: new THREE.Quaternion(),
    world: {}, v: new THREE.Vector3(), off: new THREE.Vector3(), rootParent: null,
    ik: { t: new THREE.Vector3(), l: new THREE.Vector3(), e: new THREE.Vector3(), d: new THREE.Vector3(), r: new THREE.Quaternion(), w: new THREE.Quaternion(), p: new THREE.Quaternion() },
  }), []);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const k = 1 - Math.exp(-dt * 7);
    // 1. smooth the virtual joint angles towards the (partially struck) signature pose
    for (const j of JOINTS) {
      const a = stand[j], b = pose[j], c = cur.current[j];
      for (let i = 0; i < 3; i++) {
        let tgt = a[i] + (b[i] - a[i]) * strike;
        if (idle) for (const m of pose.motion || []) if (m.j === j && m.a === i) tgt += Math.sin(t * m.spd) * m.amp * strike;
        c[i] += (tgt - c[i]) * k;
      }
    }
    // 2. virtual segment world rotations (same hierarchy as poses.js)
    const E = (j, out) => out.setFromEuler(q.e.set(cur.current[j][0] * D, cur.current[j][1] * D, cur.current[j][2] * D));
    const V = q.V;
    E('hips', V.hips);
    V.spine.copy(V.hips).multiply(E('spine', q.tmp));
    V.head.copy(V.spine).multiply(E('head', q.tmp));
    for (const s of ['l', 'r']) {
      V[`${s}Sh`].copy(V.spine).multiply(E(`${s}Sh`, q.tmp));
      V[`${s}El`].copy(V[`${s}Sh`]).multiply(E(`${s}El`, q.tmp));
      V[`${s}Hip`].copy(V.hips).multiply(E(`${s}Hip`, q.tmp));
      V[`${s}Knee`].copy(V[`${s}Hip`]).multiply(E(`${s}Knee`, q.tmp));
    }
    // 3. drive the real skeleton: world = V(segment) * align * restWorld, then convert to local
    const { bones, rest, rootBone } = built.rig;
    const world = q.world;
    const visit = (bone, parentWorld) => {
      const r = rest[bone.name];
      let wq = world[bone.name] || (world[bone.name] = new THREE.Quaternion());
      const seg = SEGMENTS[bone.name];
      if (seg && r) {
        if (Array.isArray(seg)) wq.copy(V[seg[0]]).slerp(V[seg[1]], seg[2]); else wq.copy(V[seg]);
        wq.multiply(r.align).multiply(r.worldQ);
        bone.quaternion.copy(parentWorld).invert().multiply(wq);
      } else if (r) {
        bone.quaternion.copy(r.localQ);
        wq.copy(parentWorld).multiply(r.localQ);
      }
      for (const c of bone.children) if (c.isBone) visit(c, wq);
    };
    // parent of the root bone, expressed in the model's own space (static: the Armature node never moves)
    if (!q.rootParent) { const r = rest[rootBone.name]; q.rootParent = r.worldQ.clone().multiply(r.localQ.clone().invert()); }
    visit(rootBone, q.rootParent);
    // 4. crouch / drop
    const dTarget = (stand.drop + (pose.drop - stand.drop) * strike);
    drop.current += (dTarget - drop.current) * k;
    if (model.current) model.current.position.y = -drop.current + (idle ? Math.sin(t * 1.8) * 0.003 : 0);
    // 5. sockets follow bones, oriented in the virtual frames used by the prop code
    built.scene.updateMatrixWorld(true);
    const place = (ref, boneName, Vq, offset) => {
      const s = ref.current, b = bones[boneName]; if (!s || !b) return;
      b.getWorldPosition(q.v); group.current.worldToLocal(q.v);
      s.position.copy(q.v);
      s.quaternion.copy(Vq);
      if (offset) s.position.add(q.off.set(offset[0], offset[1], offset[2]).applyQuaternion(Vq));
    };
    place(sockets.head, 'Head', V.head, [0, 0.09, 0.02]);
    place(sockets.handR, 'hand_r', V.rEl, [0, -0.05, 0]);
    place(sockets.handL, 'hand_l', V.lEl, [0, -0.05, 0]);
    place(sockets.calfL, 'calf_l', V.lKnee);
    place(sockets.calfR, 'calf_r', V.rKnee);
    place(sockets.chest, 'spine_03', V.spine);
    place(sockets.neck, 'neck_01', V.spine);
    place(sockets.foreL, 'lowerarm_l', V.lEl);
    if (batRef.current && pose.bat) {
      const br = pose.bat.map(x => x * D);
      batRef.current.rotation.set(br[0], br[1], br[2]);
      if (pose.spin && strike > 0.6) batRef.current.rotation[['x', 'y', 'z'][pose.spin.axis]] += t * pose.spin.speed * (left ? -1 : 1);
      // two-handed grip: pull the top hand onto the handle with a tiny CCD IK on the other arm
      if (!pose.oneHand && strike > 0.3) {
        group.current.updateMatrixWorld(true);
        const s = left ? 'r' : 'l';
        const target = batRef.current.localToWorld(q.ik.t.set(0, 0.075, 0));
        const hand = bones[`hand_${s}`], links = [bones[`lowerarm_${s}`], bones[`upperarm_${s}`]];
        for (let it = 0; it < 6; it++) {
          for (const link of links) {
            link.getWorldPosition(q.ik.l); hand.getWorldPosition(q.ik.e);
            const from = q.ik.e.sub(q.ik.l).normalize(), to = q.ik.d.copy(target).sub(q.ik.l).normalize();
            q.ik.r.setFromUnitVectors(from, to);
            link.getWorldQuaternion(q.ik.w).premultiply(q.ik.r);
            link.parent.getWorldQuaternion(q.ik.p);
            link.quaternion.copy(q.ik.p.invert().multiply(q.ik.w));
            link.updateMatrixWorld(true);
          }
        }
        place(left ? sockets.handR : sockets.handL, `hand_${s}`, left ? V.rEl : V.lEl, [0, -0.05, 0]);
      }
    }
  });

  const pads = batting || keeper;
  return (
    <group ref={group} scale={[w * h, h, w * h]}>
      <group ref={model}><primitive object={built.scene} /></group>
      <Socket sref={sockets.head}>
        <group scale={1}>
          <Headgear type={ch.headgear} R={R} mats={mats} />
          {!helmetLike && PRIMITIVE_HAIR.has(hairStyle) && <Hair style={hairStyle} R={R} mat={mats.hair} />}
          {!GLB_BEARD.has(beardStyle) && <FacialHair style={beardStyle} mat={mats.beard} />}
          {acc.includes('sunglasses') && <group position={[0, 0.014, 0.103]}>
            {[0.031, -0.031].map(x => (
              <mesh key={x} material={mats.black} position={[x, 0, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.72]}>
                <cylinderGeometry args={[0.019, 0.019, 0.004, 16]} />
              </mesh>
            ))}
            <mesh material={mats.black} position={[0, 0.004, 0]}><boxGeometry args={[0.024, 0.003, 0.003]} /></mesh>
            <mesh material={mats.black} position={[0.054, 0.004, -0.04]} rotation={[0, Math.PI / 2, 0]}><boxGeometry args={[0.08, 0.004, 0.003]} /></mesh>
            <mesh material={mats.black} position={[-0.054, 0.004, -0.04]} rotation={[0, Math.PI / 2, 0]}><boxGeometry args={[0.08, 0.004, 0.003]} /></mesh>
          </group>}
          {acc.includes('zinc') && <mesh material={mats.white} position={[0, -R * 0.12, R * 1.0]}><boxGeometry args={[R * 0.22, R * 0.3, R * 0.06]} /></mesh>}
        </group>
      </Socket>
      <Socket sref={sockets.chest}>
        <mesh position={[0, 0.0, -0.17]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[0.24, 0.24]} />
          <meshStandardMaterial map={backTex} transparent alphaTest={0.01} roughness={0.6} />
        </mesh>
      </Socket>
      <Socket sref={sockets.neck}>
        {acc.includes('chain') && <mesh material={mats.gold} position={[0, -0.02, 0.03]} rotation={[1.2, 0, 0]}><torusGeometry args={[0.075, 0.006, 4, 16]} /></mesh>}
      </Socket>
      <Socket sref={sockets.foreL}>
        {acc.includes('wristbands') && <mesh material={mats.white} position={[0, -0.22, 0]}><cylinderGeometry args={[0.04, 0.04, 0.05, 8]} /></mesh>}
      </Socket>
      <Socket sref={sockets.handR}>{!left && pose.bat && <group ref={batRef}><Bat mats={mats} /></group>}{!left && pose.ball && <mesh material={mats.ball} position={[0, -0.05, 0.03]}><icosahedronGeometry args={[0.036, 1]} /></mesh>}
        {keeper && <mesh material={mats.keeperGlove} position={[0, -0.03, 0]}><boxGeometry args={[0.11, 0.13, 0.07]} /></mesh>}</Socket>
      <Socket sref={sockets.handL}>{left && pose.bat && <group ref={batRef}><Bat mats={mats} /></group>}{left && pose.ball && <mesh material={mats.ball} position={[0, -0.05, 0.03]}><icosahedronGeometry args={[0.036, 1]} /></mesh>}
        {keeper && <mesh material={mats.keeperGlove} position={[0, -0.03, 0]}><boxGeometry args={[0.11, 0.13, 0.07]} /></mesh>}</Socket>
      {pads && ['calfL', 'calfR'].map(k => (
        <Socket key={k} sref={sockets[k]}>
          <mesh material={mats.pad} position={[0, -0.2, 0.06]}><boxGeometry args={[0.14, 0.44, 0.07]} /></mesh>
          <mesh material={mats.pad} position={[0, 0.02, 0.085]}><boxGeometry args={[0.15, 0.1, 0.07]} /></mesh>
        </Socket>
      ))}
    </group>
  );
}

MODEL_FILES.forEach(f => useGLTF.preload(url(f)));
