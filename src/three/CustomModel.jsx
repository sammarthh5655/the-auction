// Renders a player's own licensed 3D model (player.customModel = path/URL to a .glb/.gltf).
// It is auto-scaled to 1.8 m tall and stood on the pedestal. Plays its first animation if it has one.
import { useEffect, useMemo } from 'react';
import { useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

export default function CustomModel({ url }) {
  const gltf = useGLTF(url);
  const scene = useMemo(() => {
    const s = cloneSkinned(gltf.scene);
    const box = new THREE.Box3().setFromObject(s);
    const size = box.getSize(new THREE.Vector3());
    const k = size.y > 0 ? 1.8 / size.y : 1;
    s.scale.setScalar(k);
    const c = box.getCenter(new THREE.Vector3());
    s.position.set(-c.x * k, -box.min.y * k, -c.z * k);
    s.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    return s;
  }, [gltf.scene]);
  const { actions, names } = useAnimations(gltf.animations, scene);
  useEffect(() => { if (names[0]) actions[names[0]]?.reset().fadeIn(0.3).play(); }, [actions, names]);
  return <primitive object={scene} />;
}
