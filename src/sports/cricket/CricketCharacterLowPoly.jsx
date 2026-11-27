/**
 * CHARACTER CREATOR (cricket): renders any player as a stylized low-poly 3D figure from the
 * trait fields stored in players.json -> player.character:
 *   skin, hair {style,color}, beard {style,color}, build, height, headgear, sleeves, shoes,
 *   accessories[], jersey {number, backName, color}, pose, hand
 * No photos or likenesses - recognisability comes from silhouette, hair, beard, kit and pose.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { poseFor } from './poses.js';

const D = Math.PI / 180;
const JOINTS = ['hips', 'spine', 'head', 'lSh', 'lEl', 'rSh', 'rEl', 'lHip', 'lKnee', 'rHip', 'rKnee'];

function shade(hex, amt) {
  const c = new THREE.Color(hex);
  const hsl = {}; c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return `#${c.getHexString()}`;
}

export function useMats(ch) {
  return useMemo(() => {
    const m = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.75, metalness: 0.05, ...extra });
    const jersey = ch.jersey?.color || '#1f3a68';
    return {
      skin: m(ch.skin || '#c98f66', { roughness: 0.6 }),
      skinDark: m(shade(ch.skin || '#c98f66', -0.12), { roughness: 0.6 }),
      tattoo: m(shade(ch.skin || '#c98f66', -0.22), { roughness: 0.6 }),
      hair: m(ch.hair?.color || '#15110f', { roughness: 0.9 }),
      beard: m(ch.beard?.color || ch.hair?.color || '#15110f', { roughness: 0.95 }),
      stubble: m(ch.beard?.color || '#15110f', { transparent: true, opacity: 0.42, roughness: 1 }),
      jersey: m(jersey, { roughness: 0.55 }),
      jerseyDark: m(shade(jersey, -0.14), { roughness: 0.6 }),
      trim: m(shade(jersey, 0.25)),
      pants: m(shade(jersey, -0.2), { roughness: 0.7 }),
      white: m('#f4f1ea', { roughness: 0.6 }),
      pad: m('#f7f4ec', { roughness: 0.5 }),
      shoe: m(ch.shoes === 'black' ? '#1a1a1f' : ch.shoes === 'neon' ? '#c6ff3a' : '#f2f2f2', { roughness: 0.5 }),
      sole: m('#2a2a30'),
      helmet: m('#16264a', { roughness: 0.35, metalness: 0.35 }),
      grill: m('#c9d2e6', { roughness: 0.3, metalness: 0.8 }),
      bat: m('#e8d3a2', { roughness: 0.65 }),
      grip: m('#202024'),
      ball: m('#b3141c', { roughness: 0.4 }),
      gold: m('#f5c542', { metalness: 0.9, roughness: 0.25, emissive: '#3a2a00' }),
      black: m('#0b0b10', { roughness: 0.2, metalness: 0.4 }),
      eye: m('#120d0b', { roughness: 0.2 }),
      glove: m('#eef0f4', { roughness: 0.6 }),
      keeperGlove: m('#e9e2cf', { roughness: 0.5 }),
      cloth: m(shade(jersey, 0.3), { roughness: 0.9 }),
    };
  }, [ch]);
}

export function backTexture(name, number, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.font = '700 40px "Bebas Neue", Impact, "Arial Narrow", sans-serif';
  g.fillText(String(name || '').slice(0, 12), 128, 58);
  g.font = '700 150px "Bebas Neue", Impact, "Arial Narrow", sans-serif';
  g.fillText(String(number ?? ''), 128, 205);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function Hair({ style, R, mat }) {
  const shell = (theta, s = 1.07, rot = 0, sy = 1, sz = 1, y = 0) => (
    <mesh material={mat} rotation={[rot, 0, 0]} scale={[1, sy, sz]} position={[0, y, 0]}>
      <sphereGeometry args={[R * s, 10, 7, 0, Math.PI * 2, 0, theta]} />
    </mesh>
  );
  switch (style) {
    case 'bald': return null;
    case 'buzz': return shell(Math.PI * 0.5, 1.025, -0.15);
    case 'receding': return shell(Math.PI * 0.42, 1.05, -0.55);
    case 'crop': case 'short': return shell(Math.PI * 0.48, 1.07, -0.18);
    case 'side-part': return <group>{shell(Math.PI * 0.48, 1.08, -0.18)}<mesh material={mat} position={[R * 0.35, R * 0.85, R * 0.35]} rotation={[0.3, 0, -0.4]}><boxGeometry args={[R * 0.9, R * 0.22, R * 0.7]} /></mesh></group>;
    case 'quiff': return <group>{shell(Math.PI * 0.48, 1.08, -0.18)}<mesh material={mat} position={[0, R * 1.0, R * 0.55]} rotation={[-0.5, 0, 0]}><boxGeometry args={[R * 1.2, R * 0.45, R * 0.6]} /></mesh></group>;
    case 'slick-back': return shell(Math.PI * 0.5, 1.08, -0.35, 0.95, 1.12);
    case 'undercut': return <group>{shell(Math.PI * 0.5, 1.02, -0.15)}{shell(Math.PI * 0.3, 1.14, -0.15, 1.1, 1, R * 0.06)}</group>;
    case 'textured': return <group>{shell(Math.PI * 0.48, 1.07, -0.18)}{[[-0.4, 0.2], [0, 0.35], [0.4, 0.15], [-0.15, -0.2], [0.25, -0.25], [0, 0.05]].map(([x, z], i) => (
      <mesh key={i} material={mat} position={[x * R, R * 1.0, z * R + 0.02]} rotation={[0.4 * z, 0.5 * i, 0.3 * x]}><boxGeometry args={[R * 0.5, R * 0.28, R * 0.5]} /></mesh>))}</group>;
    case 'spiky': return <group>{shell(Math.PI * 0.48, 1.06, -0.18)}{Array.from({ length: 9 }, (_, i) => { const a = (i / 9) * Math.PI * 2; return (
      <mesh key={i} material={mat} position={[Math.cos(a) * R * 0.5, R * 0.95, Math.sin(a) * R * 0.5]} rotation={[Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6]}><coneGeometry args={[R * 0.2, R * 0.55, 5]} /></mesh>); })}</group>;
    case 'curly': return <group>{shell(Math.PI * 0.45, 1.04, -0.18)}{Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * Math.PI * 2, rr = i % 2 ? 0.55 : 0.85; return (
      <mesh key={i} material={mat} position={[Math.cos(a) * R * rr, R * (0.75 + (i % 3) * 0.1), Math.sin(a) * R * rr]}><icosahedronGeometry args={[R * 0.3, 0]} /></mesh>); })}</group>;
    case 'afro': return <mesh material={mat} position={[0, R * 0.45, -R * 0.15]}><icosahedronGeometry args={[R * 1.45, 1]} /></mesh>;
    case 'long': return <group>{shell(Math.PI * 0.55, 1.08, -0.15)}
      <mesh material={mat} position={[0, -R * 0.35, -R * 0.65]}><boxGeometry args={[R * 1.9, R * 1.7, R * 0.6]} /></mesh>
      <mesh material={mat} position={[R * 0.92, -R * 0.2, -R * 0.1]}><boxGeometry args={[R * 0.3, R * 1.2, R * 1.1]} /></mesh>
      <mesh material={mat} position={[-R * 0.92, -R * 0.2, -R * 0.1]}><boxGeometry args={[R * 0.3, R * 1.2, R * 1.1]} /></mesh></group>;
    case 'mullet': return <group>{shell(Math.PI * 0.5, 1.08, -0.18)}<mesh material={mat} position={[0, -R * 0.5, -R * 0.75]}><boxGeometry args={[R * 1.5, R * 1.3, R * 0.4]} /></mesh></group>;
    case 'man-bun': case 'ponytail': return <group>{shell(Math.PI * 0.5, 1.07, -0.25)}<mesh material={mat} position={[0, R * 0.75, -R * 0.85]}><icosahedronGeometry args={[R * 0.38, 0]} /></mesh></group>;
    case 'mohawk': return <group>{shell(Math.PI * 0.5, 1.01, -0.15)}<mesh material={mat} position={[0, R * 1.05, 0]}><boxGeometry args={[R * 0.3, R * 0.6, R * 1.7]} /></mesh></group>;
    case 'dreadlocks': return <group>{shell(Math.PI * 0.5, 1.08, -0.15)}{Array.from({ length: 10 }, (_, i) => { const a = Math.PI * (0.15 + (i / 9) * 0.7) + Math.PI; return (
      <mesh key={i} material={mat} position={[Math.cos(a) * R * 0.95, -R * 0.5, Math.sin(a) * R * 0.95]}><cylinderGeometry args={[R * 0.1, R * 0.08, R * 1.6, 5]} /></mesh>); })}</group>;
    default: return shell(Math.PI * 0.48, 1.07, -0.18);
  }
}

export function Beard({ style, R, mats }) {
  const front = (w, t0, t1, s, mat) => (
    <mesh material={mat}><sphereGeometry args={[R * s, 12, 8, Math.PI / 2 - w / 2, w, Math.PI * t0, Math.PI * (t1 - t0)]} /></mesh>
  );
  switch (style) {
    case 'stubble': return front(2.4, 0.55, 0.92, 1.015, mats.stubble);
    case 'short': return front(2.3, 0.56, 0.95, 1.05, mats.beard);
    case 'full': return <group>{front(2.6, 0.5, 1, 1.09, mats.beard)}</group>;
    case 'long': return <group>{front(2.6, 0.5, 1, 1.09, mats.beard)}<mesh material={mats.beard} position={[0, -R * 1.1, R * 0.45]} rotation={[0.25, 0, Math.PI]}><coneGeometry args={[R * 0.5, R * 0.9, 6]} /></mesh></group>;
    case 'chinstrap': return front(2.7, 0.7, 0.98, 1.06, mats.beard);
    case 'goatee': return <mesh material={mats.beard} position={[0, -R * 0.78, R * 0.62]}><boxGeometry args={[R * 0.45, R * 0.4, R * 0.25]} /></mesh>;
    case 'mustache': return <group>
      <mesh material={mats.beard} position={[0, -R * 0.33, R * 0.95]}><boxGeometry args={[R * 0.7, R * 0.12, R * 0.12]} /></mesh>
      <mesh material={mats.beard} position={[R * 0.38, -R * 0.4, R * 0.88]}><icosahedronGeometry args={[R * 0.09, 0]} /></mesh>
      <mesh material={mats.beard} position={[-R * 0.38, -R * 0.4, R * 0.88]}><icosahedronGeometry args={[R * 0.09, 0]} /></mesh></group>;
    case 'french': return <mesh material={mats.beard} position={[0, -R * 0.8, R * 0.6]}><boxGeometry args={[R * 0.3, R * 0.5, R * 0.25]} /></mesh>;
    default: return null;
  }
}

export function Headgear({ type, R, mats }) {
  switch (type) {
    case 'helmet': return (
      <group>
        <mesh material={mats.helmet} rotation={[-0.2, 0, 0]}><sphereGeometry args={[R * 1.2, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.56]} /></mesh>
        <mesh material={mats.helmet} position={[0, R * 0.12, R * 1.08]} rotation={[0.35, 0, 0]}><boxGeometry args={[R * 1.5, R * 0.08, R * 0.5]} /></mesh>
        {[0, 1, 2].map(i => (
          <mesh key={i} material={mats.grill} position={[0, -R * (0.15 + i * 0.32), R * 0.15]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[R * 1.12, R * 0.035, 4, 16, Math.PI]} />
          </mesh>
        ))}
        <mesh material={mats.grill} position={[0, -R * 0.45, R * 1.25]}><boxGeometry args={[R * 0.06, R * 0.7, R * 0.06]} /></mesh>
        <mesh material={mats.gold} position={[0, R * 0.95, R * 0.55]}><icosahedronGeometry args={[R * 0.12, 0]} /></mesh>
      </group>
    );
    case 'cap': return <group>
      <mesh material={mats.jersey}><sphereGeometry args={[R * 1.09, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.45]} /></mesh>
      <mesh material={mats.jerseyDark} position={[0, R * 0.32, R * 1.0]} rotation={[0.15, 0, 0]}><boxGeometry args={[R * 1.3, R * 0.05, R * 0.75]} /></mesh></group>;
    case 'sunhat': return <group>
      <mesh material={mats.white}><sphereGeometry args={[R * 1.1, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.45]} /></mesh>
      <mesh material={mats.white} position={[0, R * 0.3, 0]}><cylinderGeometry args={[R * 1.9, R * 1.9, R * 0.05, 16]} /></mesh></group>;
    case 'patka': return <group>
      <mesh material={mats.cloth} rotation={[-0.15, 0, 0]}><sphereGeometry args={[R * 1.12, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52]} /></mesh>
      <mesh material={mats.cloth} position={[0, R * 1.15, -R * 0.1]}><icosahedronGeometry args={[R * 0.42, 1]} /></mesh></group>;
    case 'headband': return <mesh material={mats.white} position={[0, R * 0.42, 0]} rotation={[Math.PI / 2 - 0.15, 0, 0]}><torusGeometry args={[R * 1.03, R * 0.09, 4, 18]} /></mesh>;
    case 'bandana': return <mesh material={mats.cloth} rotation={[-0.2, 0, 0]}><sphereGeometry args={[R * 1.08, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.42]} /></mesh>;
    default: return null;
  }
}

export function Bat({ mats }) {
  return (
    <group>
      <mesh material={mats.grip} position={[0, -0.02, 0]}><cylinderGeometry args={[0.018, 0.02, 0.26, 6]} /></mesh>
      <mesh material={mats.bat} position={[0, -0.42, 0]}><boxGeometry args={[0.11, 0.56, 0.045]} /></mesh>
      <mesh material={mats.bat} position={[0, -0.42, -0.03]}><boxGeometry args={[0.05, 0.5, 0.03]} /></mesh>
    </group>
  );
}

/**
 * @param character  player.character
 * @param poseKey    override pose (character creator)
 * @param strike     0..1 how far from "stand" into the signature pose (reveal animation)
 */
export default function CricketCharacter({ character, poseKey, strike = 1, idle = true }) {
  const ch = character || {};
  const mats = useMats(ch);
  const pose = poseFor(poseKey || ch.pose);
  const stand = poseFor('stand');
  const h = { short: 0.93, medium: 1, tall: 1.08 }[ch.height] || 1;
  const w = { slim: 0.88, athletic: 1, stocky: 1.12, heavy: 1.25 }[ch.build] || 1;
  const R = 0.16;
  const thigh = 0.42 * h, shin = 0.42 * h, torsoH = 0.56 * h, uArm = 0.3 * h, fArm = 0.28 * h;
  const hipY = thigh + shin + 0.07;
  const shoulderX = 0.21 * w, hipX = 0.1 * w;
  const limbR = 0.058 * Math.sqrt(w);
  const refs = useRef({});
  const root = useRef();
  const batRef = useRef();
  const batting = !!pose.bat;
  const keeper = !!pose.keeper;
  const wantsPads = batting || keeper;
  const backTex = useMemo(() => backTexture(ch.jersey?.backName, ch.jersey?.number, ch.jersey?.color || '#1f3a68'), [ch.jersey?.backName, ch.jersey?.number, ch.jersey?.color]);
  const acc = ch.accessories || [];
  const left = ch.hand === 'left';
  const hideHair = ch.headgear === 'helmet' || ch.headgear === 'patka';
  const set = k => el => { if (el) refs.current[k] = el; };

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const k = 1 - Math.exp(-dt * 7);
    for (const j of JOINTS) {
      const el = refs.current[j]; if (!el) continue;
      const a = stand[j], b = pose[j];
      const tgt = [0, 1, 2].map(i => (a[i] + (b[i] - a[i]) * strike) * D);
      if (idle) for (const m of pose.motion || []) if (m.j === j) tgt[m.a] += Math.sin(t * m.spd) * m.amp * D * strike;
      el.rotation.x += (tgt[0] - el.rotation.x) * k;
      el.rotation.y += (tgt[1] - el.rotation.y) * k;
      el.rotation.z += (tgt[2] - el.rotation.z) * k;
    }
    if (root.current) {
      const drop = (stand.drop + (pose.drop - stand.drop) * strike) * h;
      root.current.position.y += (hipY - drop - root.current.position.y) * k;
      if (idle) root.current.position.y += Math.sin(t * 1.8) * 0.0012;
    }
    if (batRef.current && pose.bat) {
      const br = pose.bat.map(x => x * D);
      batRef.current.rotation.set(br[0], br[1], br[2]);
      if (pose.spin && strike > 0.6) batRef.current.rotation[['x', 'y', 'z'][pose.spin.axis]] += t * pose.spin.speed;
    }
  });

  const renderArm = side => {
    const L = side === 'l';
    const sleeveLong = ch.sleeves === 'long';
    const tattoo = L && acc.includes('tattoo-sleeve');
    const upperMat = sleeveLong ? mats.jersey : tattoo ? mats.tattoo : mats.skin;
    const foreMat = sleeveLong ? mats.jersey : tattoo ? mats.tattoo : mats.skin;
    const gloveMat = keeper ? mats.keeperGlove : (pose.gloves && batting) ? mats.glove : mats.skin;
    const handR = keeper ? limbR * 1.9 : (pose.gloves && batting) ? limbR * 1.35 : limbR * 1.05;
    return (
      <group ref={set(L ? 'lSh' : 'rSh')} position={[L ? shoulderX : -shoulderX, torsoH - 0.06, 0]}>
        <mesh material={mats.jersey} position={[0, -0.02, 0]}><icosahedronGeometry args={[limbR * 1.55, 0]} /></mesh>
        <mesh material={upperMat} position={[0, -uArm / 2, 0]}><capsuleGeometry args={[limbR, uArm - limbR, 2, 6]} /></mesh>
        {!sleeveLong && <mesh material={mats.jersey} position={[0, -uArm * 0.22, 0]}><cylinderGeometry args={[limbR * 1.35, limbR * 1.25, uArm * 0.45, 7]} /></mesh>}
        <group ref={set(L ? 'lEl' : 'rEl')} position={[0, -uArm, 0]}>
          <mesh material={foreMat} position={[0, -fArm / 2, 0]}><capsuleGeometry args={[limbR * 0.9, fArm - limbR, 2, 6]} /></mesh>
          {acc.includes('wristbands') && <mesh material={mats.white} position={[0, -fArm * 0.85, 0]}><cylinderGeometry args={[limbR * 1.05, limbR * 1.05, 0.05, 7]} /></mesh>}
          <mesh material={gloveMat} position={[0, -fArm - handR * 0.4, 0]}><icosahedronGeometry args={[handR, 0]} /></mesh>
          {!L && pose.bat && <group ref={batRef} position={[0, -fArm - 0.02, 0]}><Bat mats={mats} /></group>}
          {!L && pose.ball && <mesh material={mats.ball} position={[0, -fArm - handR * 1.3, 0.02]}><icosahedronGeometry args={[0.036, 1]} /></mesh>}
        </group>
      </group>
    );
  };

  const renderLeg = side => {
    const L = side === 'l';
    return (
      <group ref={set(L ? 'lHip' : 'rHip')} position={[L ? hipX : -hipX, 0, 0]}>
        <mesh material={mats.pants} position={[0, -thigh / 2, 0]}><capsuleGeometry args={[limbR * 1.35, thigh - limbR, 2, 7]} /></mesh>
        <group ref={set(L ? 'lKnee' : 'rKnee')} position={[0, -thigh, 0]}>
          <mesh material={mats.pants} position={[0, -shin / 2, 0]}><capsuleGeometry args={[limbR * 1.15, shin - limbR, 2, 7]} /></mesh>
          {wantsPads && <group>
            <mesh material={mats.pad} position={[0, -shin * 0.45, limbR * 0.55]}><boxGeometry args={[limbR * 2.9, shin * 0.95, limbR * 1.6]} /></mesh>
            <mesh material={mats.pad} position={[0, 0.02, limbR * 0.9]}><boxGeometry args={[limbR * 3.0, limbR * 2.2, limbR * 1.4]} /></mesh>
          </group>}
          <group position={[0, -shin - 0.035, 0.05]}>
            <mesh material={mats.shoe}><boxGeometry args={[limbR * 2.1, 0.07, 0.24]} /></mesh>
            <mesh material={mats.sole} position={[0, -0.04, 0]}><boxGeometry args={[limbR * 2.2, 0.02, 0.25]} /></mesh>
          </group>
        </group>
      </group>
    );
  };

  return (
    <group scale={[left ? -1 : 1, 1, 1]}>
      <group ref={root} position={[0, hipY, 0]}>
        <group ref={set('hips')}>
          <mesh material={mats.pants} position={[0, -0.02, 0]}><boxGeometry args={[0.3 * w, 0.16, 0.2 * w]} /></mesh>
          {renderLeg("l")}{renderLeg("r")}
          <group ref={set('spine')}>
            {/* torso */}
            <mesh material={mats.jersey} position={[0, torsoH * 0.52, 0]}>
              <cylinderGeometry args={[0.19 * w, 0.155 * w, torsoH * 0.95, 8]} />
            </mesh>
            {ch.build === 'heavy' && <mesh material={mats.jersey} position={[0, torsoH * 0.3, 0.06]}><icosahedronGeometry args={[0.17 * w, 1]} /></mesh>}
            <mesh material={mats.trim} position={[0, torsoH * 0.98, 0.05]} rotation={[0.3, 0, 0]}><torusGeometry args={[0.075, 0.018, 4, 10]} /></mesh>
            <mesh position={[0, torsoH * 0.6, -0.162 * w - 0.03]} rotation={[0, Math.PI, 0]} scale={[left ? -1 : 1, 1, 1]}>
              <planeGeometry args={[0.27 * w, 0.27 * w]} />
              <meshStandardMaterial map={backTex} roughness={0.6} />
            </mesh>
            {acc.includes('chain') && <mesh material={mats.gold} position={[0, torsoH * 0.93, 0.07]} rotation={[1.1, 0, 0]}><torusGeometry args={[0.09, 0.008, 4, 14]} /></mesh>}
            {renderArm("l")}{renderArm("r")}
            {/* neck + head */}
            <mesh material={mats.skinDark} position={[0, torsoH + 0.04, 0]}><cylinderGeometry args={[0.055, 0.065, 0.1, 6]} /></mesh>
            <group ref={set('head')} position={[0, torsoH + 0.07, 0]}>
              <group position={[0, R + 0.03, 0.01]}>
                <mesh material={mats.skin} scale={[0.95, 1.08, 1]}><icosahedronGeometry args={[R, 1]} /></mesh>
                <mesh material={mats.skin} position={[0, -R * 0.55, R * 0.25]} scale={[0.85, 0.6, 0.9]}><icosahedronGeometry args={[R * 0.78, 1]} /></mesh>
                <mesh material={mats.skin} position={[R * 0.96, 0, 0]}><icosahedronGeometry args={[R * 0.2, 0]} /></mesh>
                <mesh material={mats.skin} position={[-R * 0.96, 0, 0]}><icosahedronGeometry args={[R * 0.2, 0]} /></mesh>
                <mesh material={mats.eye} position={[R * 0.33, R * 0.08, R * 0.9]}><icosahedronGeometry args={[R * 0.1, 0]} /></mesh>
                <mesh material={mats.eye} position={[-R * 0.33, R * 0.08, R * 0.9]}><icosahedronGeometry args={[R * 0.1, 0]} /></mesh>
                <mesh material={mats.hair} position={[R * 0.33, R * 0.27, R * 0.9]} rotation={[0, 0, -0.08]}><boxGeometry args={[R * 0.38, R * 0.08, R * 0.08]} /></mesh>
                <mesh material={mats.hair} position={[-R * 0.33, R * 0.27, R * 0.9]} rotation={[0, 0, 0.08]}><boxGeometry args={[R * 0.38, R * 0.08, R * 0.08]} /></mesh>
                <mesh material={mats.skinDark} position={[0, -R * 0.1, R * 1.0]} rotation={[0.2, 0, 0]}><boxGeometry args={[R * 0.2, R * 0.34, R * 0.2]} /></mesh>
                <mesh material={mats.skinDark} position={[0, -R * 0.48, R * 0.88]}><boxGeometry args={[R * 0.4, R * 0.06, R * 0.06]} /></mesh>
                {acc.includes('zinc') && <mesh material={mats.white} position={[0, -R * 0.08, R * 1.08]}><boxGeometry args={[R * 0.22, R * 0.3, R * 0.06]} /></mesh>}
                {acc.includes('sunglasses') && <group>
                  <mesh material={mats.black} position={[R * 0.33, R * 0.1, R * 0.98]}><boxGeometry args={[R * 0.42, R * 0.24, R * 0.05]} /></mesh>
                  <mesh material={mats.black} position={[-R * 0.33, R * 0.1, R * 0.98]}><boxGeometry args={[R * 0.42, R * 0.24, R * 0.05]} /></mesh>
                </group>}
                <Beard style={ch.beard?.style} R={R} mats={mats} />
                {!hideHair && <Hair style={ch.hair?.style} R={R} mat={mats.hair} />}
                {hideHair && ch.hair?.style === 'long' && <Hair style="long" R={R} mat={mats.hair} />}
                <Headgear type={ch.headgear} R={R} mats={mats} />
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}
