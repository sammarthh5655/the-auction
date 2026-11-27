/**
 * THE REVEAL - lights dim, a spotlight snaps on through drifting smoke, the pedestal rises and the
 * player appears in their signature pose, spinning slowly with their stats floating around them.
 * Marquee / legend players get a gold glow, sparkles, a camera push-in and a longer entrance.
 * The character itself comes from the sport pack (pack.loadCharacter), so this stage is sport-neutral.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import CustomModel from './CustomModel.jsx';

const charCache = new Map();
export function packCharacter(pack) {
  if (!charCache.has(pack.id)) charCache.set(pack.id, lazy(pack.loadCharacter));
  return charCache.get(pack.id);
}

function radialTexture(inner, outer, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, inner); grd.addColorStop(1, outer);
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const ease = x => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3));
const seg = (t, a, b) => ease((t - a) / (b - a));

function Smoke({ start, gold }) {
  const N = 70;
  const ref = useRef();
  const tex = useMemo(() => radialTexture('rgba(210,220,255,0.28)', 'rgba(210,220,255,0)'), []);
  const data = useMemo(() => {
    const pos = new Float32Array(N * 3), speed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.6 + Math.random() * 2.6;
      pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = Math.random() * 2.2; pos[i * 3 + 2] = Math.sin(a) * r - 1.2;
      speed[i] = 0.08 + Math.random() * 0.22;
    }
    return { pos, speed };
  }, []);
  useFrame((state, dt) => {
    const g = ref.current; if (!g) return;
    const p = g.geometry.attributes.position.array;
    for (let i = 0; i < N; i++) {
      p[i * 3 + 1] += data.speed[i] * dt;
      p[i * 3] += Math.sin(state.clock.elapsedTime * 0.3 + i) * dt * 0.05;
      if (p[i * 3 + 1] > 2.6) p[i * 3 + 1] = 0;
    }
    g.geometry.attributes.position.needsUpdate = true;
    const t = (performance.now() - start.current) / 1000;
    g.material.opacity = 0.08 + 0.22 * seg(t, 0, 1.2) * (1 - 0.5 * seg(t, 3, 6));
  });
  return (
    <points ref={ref}>
      <bufferGeometry><bufferAttribute attach="attributes-position" count={N} array={data.pos} itemSize={3} /></bufferGeometry>
      <pointsMaterial map={tex} size={2.2} sizeAttenuation transparent depthWrite={false} opacity={0.3} color={gold ? '#ffe4a8' : '#b9c6ff'} />
    </points>
  );
}

function Rig({ start, marquee }) {
  const { camera } = useThree();
  useFrame(() => {
    const t = (performance.now() - start.current) / 1000;
    const dur = marquee ? 2.8 : 1.8;
    const p = seg(t, 0, dur);
    // frame the whole 1.8 m figure (arms raised) in the upper part of the stage, above the bid bar
    const z = (marquee ? 9.4 : 7.6) + ((marquee ? 6.1 : 6.3) - (marquee ? 9.4 : 7.6)) * p;
    camera.position.set(Math.sin(t * 0.15) * 0.3, 1.5 + 0.3 * (1 - p), z);
    camera.lookAt(0, 0.92, 0);
  });
  return null;
}

function Lights({ start, marquee }) {
  const amb = useRef(), spot = useRef(), rim = useRef(), beam = useRef(), pool = useRef(), fill = useRef();
  const target = useMemo(() => { const o = new THREE.Object3D(); o.position.set(0, 1, 0); return o; }, []);
  useFrame(() => {
    const t = (performance.now() - start.current) / 1000;
    const on = marquee ? 1.1 : 0.7;
    const flick = t > on && t < on + 0.45 ? (Math.sin(t * 70) > 0 ? 1 : 0.2) : t >= on + 0.45 ? 1 : 0;
    if (amb.current) amb.current.intensity = 0.55 - 0.47 * seg(t, 0, on) + 0.12 * seg(t, on + 0.8, on + 2);
    if (fill.current) fill.current.intensity = 0.9 * seg(t, on + 0.6, on + 1.6);
    if (spot.current) spot.current.intensity = 95 * flick;
    if (rim.current) rim.current.intensity = (marquee ? 26 : 9) * seg(t, on + 0.6, on + 1.6) * (marquee ? 0.85 + 0.15 * Math.sin(t * 3) : 1);
    if (beam.current) beam.current.material.opacity = 0.11 * flick;
    if (pool.current) pool.current.material.opacity = 0.75 * flick;
  });
  return (
    <>
      <ambientLight ref={amb} intensity={0.5} color="#8ea2ff" />
      <hemisphereLight ref={fill} intensity={0} color="#d8e2ff" groundColor="#20140a" />
      <primitive object={target} />
      <spotLight ref={spot} position={[0, 6.2, 1.6]} angle={0.4} penumbra={0.5} intensity={0} distance={14} decay={1.3} color="#fff1d6" target={target} />
      <pointLight ref={rim} position={[0, 2.4, -2.2]} intensity={0} distance={7} color={marquee ? '#ffc94a' : '#7aa2ff'} />
      <mesh ref={beam} position={[0, 3.25, 0.6]} rotation={[0.18, 0, 0]}>
        <coneGeometry args={[1.55, 6.3, 24, 1, true]} />
        <meshBasicMaterial color={marquee ? '#ffd98a' : '#fff4dc'} transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={pool} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <circleGeometry args={[1.9, 40]} />
        <meshBasicMaterial map={useMemo(() => radialTexture(marquee ? 'rgba(255,215,120,0.9)' : 'rgba(255,240,215,0.75)', 'rgba(0,0,0,0)'), [marquee])} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </>
  );
}

function Pedestal({ start, marquee, children }) {
  const g = useRef(), ring = useRef(), spinner = useRef();
  useFrame((_, dt) => {
    const t = (performance.now() - start.current) / 1000;
    const rise = seg(t, marquee ? 1.3 : 0.85, marquee ? 2.6 : 1.8);
    if (g.current) g.current.position.y = -0.9 + 0.9 * rise;
    if (spinner.current) spinner.current.rotation.y += dt * (2 * Math.PI / 14) + (1 - rise) * dt * 6;
    if (ring.current) ring.current.material.emissiveIntensity = (marquee ? 2.2 : 0.9) * (0.75 + 0.25 * Math.sin(t * 2.5)) * rise;
  });
  return (
    <group ref={g} position={[0, -0.9, 0]}>
      <mesh position={[0, 0.17, 0]}>
        <cylinderGeometry args={[0.82, 0.95, 0.34, 40]} />
        <meshStandardMaterial color="#141b30" metalness={0.75} roughness={0.32} />
      </mesh>
      <mesh ref={ring} position={[0, 0.345, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.82, 0.025, 8, 64]} />
        <meshStandardMaterial color={marquee ? '#ffd45a' : '#c9a24a'} emissive={marquee ? '#ffb800' : '#8a6a1a'} emissiveIntensity={1} metalness={1} roughness={0.2} />
      </mesh>
      <group ref={spinner} position={[0, 0.35, 0]}>{children}</group>
    </group>
  );
}

function Appear({ start, marquee, children }) {
  const g = useRef();
  useFrame(() => {
    const t = (performance.now() - start.current) / 1000;
    const s = 0.55 + 0.45 * seg(t, marquee ? 1.6 : 1.1, marquee ? 2.6 : 1.8);
    if (g.current) { g.current.scale.setScalar(s); g.current.visible = t > (marquee ? 1.3 : 0.85); }
  });
  return <group ref={g}>{children}</group>;
}

function StrikeCharacter({ Character, player, start, marquee }) {
  const [strike, setStrike] = useState(0);
  useFrame(() => {
    const t = (performance.now() - start.current) / 1000;
    const s = seg(t, marquee ? 2.4 : 1.6, marquee ? 3.6 : 2.6);
    if (Math.abs(s - strike) > 0.04 || (s === 1 && strike !== 1)) setStrike(s);
  });
  return <Character character={player.character} strike={strike} />;
}

function ImageCutout({ url }) {
  const tex = useMemo(() => { const t = new THREE.TextureLoader().load(url); t.colorSpace = THREE.SRGBColorSpace; return t; }, [url]);
  return (
    <mesh position={[0, 0.95, 0]}>
      <planeGeometry args={[1.3, 1.9]} />
      <meshBasicMaterial map={tex} transparent side={THREE.DoubleSide} alphaTest={0.05} />
    </mesh>
  );
}

function FloatingStats({ stats, start, marquee }) {
  const g = useRef();
  const n = stats.length;
  useFrame((_, dt) => { if (g.current) g.current.rotation.y -= dt * 0.12; });
  const t0 = marquee ? 3.2 : 2.3;
  return (
    <group ref={g}>
      {stats.map((s, i) => {
        const a = (i / n) * Math.PI * 2 + 0.4;
        return (
          <Html key={s.label} position={[Math.cos(a) * 1.35, 0.8 + (i % 3) * 0.45, Math.sin(a) * 1.0]} center zIndexRange={[5, 0]}>
            <div className="stat3d" style={{ animationDelay: `${t0 + i * 0.18}s` }}><b>{s.value}</b><span>{s.label}</span></div>
          </Html>
        );
      })}
    </group>
  );
}

function FpsGuard({ onSlow }) {
  const acc = useRef({ n: 0, t: 0, done: false });
  useFrame((_, dt) => {
    const a = acc.current; if (a.done) return;
    a.n++; a.t += dt;
    if (a.t > 4) { a.done = true; if (a.n / a.t < 22) onSlow?.(); }
  });
  return null;
}

export default function RevealStage({ player, pack, marquee, lotKey, onSlow }) {
  const start = useRef(performance.now());
  useEffect(() => { start.current = performance.now(); }, [lotKey]);
  const Character = packCharacter(pack);
  const stats = useMemo(() => pack.revealStats(player), [pack, player]);
  const floorTex = useMemo(() => radialTexture('rgba(40,60,120,0.55)', 'rgba(5,9,20,0)', 256), []);
  return (
    <Canvas dpr={[1, 1.75]} camera={{ fov: 34, position: [0, 1.6, 6.4], near: 0.1, far: 60 }} gl={{ antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ gl, scene }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; scene.fog = new THREE.Fog('#050914', 8.5, 19); }}>
      <color attach="background" args={['#050914']} />
      <Rig start={start} marquee={marquee} />
      <Lights start={start} marquee={marquee} />
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[9, 48]} />
        <meshStandardMaterial color="#0a1024" roughness={0.85} metalness={0.2} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <circleGeometry args={[5, 48]} />
        <meshBasicMaterial map={floorTex} transparent depthWrite={false} />
      </mesh>
      <Smoke start={start} gold={marquee} />
      {marquee && <Sparkles count={70} scale={[4, 3.4, 3]} position={[0, 1.6, 0]} size={4} speed={0.5} color="#ffd45a" />}
      <Pedestal start={start} marquee={marquee}>
        <Appear start={start} marquee={marquee}>
          <Suspense fallback={null}>
            {player.customModel ? <CustomModel url={player.customModel} />
              : player.customImage ? <ImageCutout url={player.customImage} />
              : <StrikeCharacter Character={Character} player={player} start={start} marquee={marquee} />}
          </Suspense>
        </Appear>
      </Pedestal>
      <FloatingStats key={lotKey} stats={stats} start={start} marquee={marquee} />
      <FpsGuard key={`fps-${lotKey}`} onSlow={onSlow} />
    </Canvas>
  );
}
