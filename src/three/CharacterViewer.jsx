// Orbit-able preview of a 3D character (player detail + character creator).
import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { packCharacter } from './RevealStage.jsx';
import CustomModel from './CustomModel.jsx';

export default function CharacterViewer({ player, pack, character, poseKey, autoRotate = true, closeUp = false }) {
  const chr = character || player?.character || {};
  const hk = { short: 0.94, medium: 1, tall: 1.06 }[chr.height] || 1;
  const headY = 0.24 + 1.69 * hk;
  const Character = packCharacter(pack);
  return (
    <Canvas key={closeUp ? `face${hk}` : 'full'} dpr={[1, 1.75]} camera={{ fov: closeUp ? 22 : 32, position: closeUp ? [0.25, headY + 0.05, 1.05] : [2.2, 1.6, 4.6] }} onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; }}>
      <color attach="background" args={['#081022']} />
      <ambientLight intensity={0.45} color="#b4c3ff" />
      <hemisphereLight intensity={0.45} color="#e8eeff" groundColor="#2a1a08" />
      <directionalLight position={[3, 5, 4]} intensity={2.1} color="#fff1d6" />
      <directionalLight position={[-3, 3, 3]} intensity={0.8} color="#cfe0ff" />
      <pointLight position={[-2, 2.5, -2.5]} intensity={12} distance={8} color="#f5c542" />
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.8, 0.92, 0.24, 40]} />
        <meshStandardMaterial color="#141b30" metalness={0.7} roughness={0.35} />
      </mesh>
      <group position={[0, 0.24, 0]}>
        <Suspense fallback={null}>
          {player?.customModel
            ? <CustomModel url={player.customModel} />
            : <Character character={closeUp && (character || player.character)?.headgear === 'helmet' ? { ...(character || player.character), headgear: 'none' } : (character || player.character)} poseKey={closeUp ? 'portrait' : poseKey} strike={1} idle={!closeUp} />}
        </Suspense>
      </group>
      <ContactShadows position={[0, 0.245, 0]} opacity={0.5} scale={3} blur={2.2} far={2} />
      <OrbitControls target={closeUp ? [0, headY, 0] : [0, 1.05, 0]} enablePan={false} minDistance={closeUp ? 0.4 : 2.5} maxDistance={8} autoRotate={autoRotate && !closeUp} autoRotateSpeed={1.2} />
    </Canvas>
  );
}
