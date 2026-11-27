/**
 * Mesh helpers for the rigged cricketer (all work in bind space, before skinning):
 *  - physique(): slims or bulks the body around each bone axis so slim / athletic / stocky / heavy
 *    players really differ (instead of one superhero frame stretched sideways)
 *  - clothGeometry(): builds a loose jersey / trousers shell over the body: the kit region is welded,
 *    smoothed (so it reads as fabric, not painted-on muscle) and pushed out along the normals.
 */
import * as THREE from 'three';

const GIRTH = { slim: 0.86, athletic: 0.94, stocky: 1.04, heavy: 1.1 };
const NO_GIRTH = /^(Head|neck_01|hand_|foot_|ball_|index|middle|ring|pinky|thumb|root)/;

function dominantBones(geometry) {
  const sj = geometry.attributes.skinIndex, sw = geometry.attributes.skinWeight;
  const out = new Uint16Array(sj.count);
  for (let i = 0; i < sj.count; i++) {
    let bi = 0, bw = -1;
    for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; bi = sj.getComponent(i, k); } }
    out[i] = bi;
  }
  return out;
}

/** bones: skeleton bones (bind pose); restPos/restDir: per bone name, model-space position + axis */
const physCache = new Map();
export function physique(geometry, skeleton, axes, build) {
  const k = GIRTH[build] ?? 1;
  if (Math.abs(k - 1) < 0.01 && build !== 'heavy') return geometry;
  const key = `${geometry.uuid}|${build}`;
  if (physCache.has(key)) return physCache.get(key);
  const g = geometry.clone();
  const pos = g.attributes.position, dom = dominantBones(g);
  const names = skeleton.bones.map(b => b.name);
  const v = new THREE.Vector3(), d = new THREE.Vector3(), foot = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const name = names[dom[i]];
    const ax = axes[name];
    if (!ax || NO_GIRTH.test(name)) continue;
    v.fromBufferAttribute(pos, i);
    // radial offset from the bone axis
    d.copy(v).sub(ax.pos);
    const along = d.dot(ax.dir);
    foot.copy(ax.dir).multiplyScalar(along).add(ax.pos);
    const radial = v.clone().sub(foot);
    let s = k;
    if (/^spine|pelvis|clavicle/.test(name)) s = 1 + (k - 1) * 0.85;
    radial.multiplyScalar(s);
    v.copy(foot).add(radial);
    if (build === 'heavy' && /^(spine_01|spine_02|pelvis)$/.test(name) && radial.z > 0) v.z += 0.035 * Math.min(1, radial.z / 0.12);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  g.computeBoundingSphere();
  physCache.set(key, g);
  return g;
}

/**
 * Cloth shell from the triangles of one kit group of the body geometry.
 * @param group   index into geometry.groups (1 = jersey, 2 = trousers)
 * @param offset  metres pushed out along the (smoothed) normals
 */
const clothCache = new Map();
export function clothGeometry(geometry, group, offset, iterations = 6) {
  const key = `${geometry.uuid}|${group}|${offset}`;
  if (clothCache.has(key)) return clothCache.get(key);
  const grp = geometry.groups.find(x => x.materialIndex === group);
  if (!grp) return null;
  const index = geometry.index.array.slice(grp.start, grp.start + grp.count);
  const pos = geometry.attributes.position;
  // weld vertices that share a position (UV seams) so smoothing does not tear the cloth
  const weld = new Map(), wid = new Int32Array(pos.count).fill(-1);
  const P = [];
  for (const i of index) {
    if (wid[i] >= 0) continue;
    const kx = `${Math.round(pos.getX(i) * 2e4)},${Math.round(pos.getY(i) * 2e4)},${Math.round(pos.getZ(i) * 2e4)}`;
    let w = weld.get(kx);
    if (w === undefined) { w = P.length / 3; weld.set(kx, w); P.push(pos.getX(i), pos.getY(i), pos.getZ(i)); }
    wid[i] = w;
  }
  const n = P.length / 3;
  const nbr = Array.from({ length: n }, () => new Set());
  const edges = new Map();
  for (let t = 0; t < index.length; t += 3) {
    const a = wid[index[t]], b = wid[index[t + 1]], c = wid[index[t + 2]];
    for (const [x, y] of [[a, b], [b, c], [c, a]]) {
      nbr[x].add(y); nbr[y].add(x);
      const ek = x < y ? `${x}_${y}` : `${y}_${x}`;
      edges.set(ek, (edges.get(ek) || 0) + 1);
    }
  }
  const boundary = new Uint8Array(n);
  for (const [ek, cnt] of edges) if (cnt === 1) { const [x, y] = ek.split('_').map(Number); boundary[x] = boundary[y] = 1; }
  // Laplacian smoothing (fabric drapes over muscle detail); boundaries (collar, sleeve hems) stay put
  let cur = Float32Array.from(P);
  for (let it = 0; it < iterations; it++) {
    const next = Float32Array.from(cur);
    for (let i = 0; i < n; i++) {
      if (boundary[i] || !nbr[i].size) continue;
      let x = 0, y = 0, z = 0;
      for (const j of nbr[i]) { x += cur[j * 3]; y += cur[j * 3 + 1]; z += cur[j * 3 + 2]; }
      const m = nbr[i].size;
      next[i * 3] = cur[i * 3] * 0.45 + (x / m) * 0.55;
      next[i * 3 + 1] = cur[i * 3 + 1] * 0.45 + (y / m) * 0.55;
      next[i * 3 + 2] = cur[i * 3 + 2] * 0.45 + (z / m) * 0.55;
    }
    cur = next;
  }
  // welded normals of the smoothed surface, then inflate (hems get half the offset so they tuck in)
  const normals = new Float32Array(n * 3);
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3();
  for (let t = 0; t < index.length; t += 3) {
    const a = wid[index[t]], b = wid[index[t + 1]], c = wid[index[t + 2]];
    A.fromArray(cur, a * 3); B.fromArray(cur, b * 3); C.fromArray(cur, c * 3);
    N.subVectors(C, B).cross(A.clone().sub(B));
    for (const x of [a, b, c]) { normals[x * 3] += N.x; normals[x * 3 + 1] += N.y; normals[x * 3 + 2] += N.z; }
  }
  for (let i = 0; i < n; i++) {
    N.fromArray(normals, i * 3).normalize();
    const o = boundary[i] ? offset * 0.5 : offset;
    cur[i * 3] += N.x * o; cur[i * 3 + 1] += N.y * o; cur[i * 3 + 2] += N.z * o;
    N.toArray(normals, i * 3);
  }
  // un-weld back to the original vertex layout (keeps skin weights + UVs)
  const used = [...new Set(index)];
  const remap = new Map(used.map((v, i) => [v, i]));
  const g = new THREE.BufferGeometry();
  const posOut = new Float32Array(used.length * 3), nOut = new Float32Array(used.length * 3);
  used.forEach((v, i) => {
    const w = wid[v];
    posOut.set(cur.subarray(w * 3, w * 3 + 3), i * 3);
    nOut.set(normals.subarray(w * 3, w * 3 + 3), i * 3);
  });
  g.setAttribute('position', new THREE.BufferAttribute(posOut, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nOut, 3));
  for (const name of ['uv', 'skinIndex', 'skinWeight']) {
    const src = geometry.attributes[name]; if (!src) continue;
    // getComponent() handles interleaved glTF buffers (a raw .array copy would read the wrong stride)
    const Ctor = name === 'skinIndex' ? Uint16Array : Float32Array;
    const arr = new Ctor(used.length * src.itemSize);
    used.forEach((v, i) => { for (let c = 0; c < src.itemSize; c++) arr[i * src.itemSize + c] = src.getComponent(v, c); });
    g.setAttribute(name, new THREE.BufferAttribute(arr, src.itemSize));
  }
  g.setIndex(Array.from(index, v => remap.get(v)));
  g.computeBoundingSphere();
  if (clothCache.size > 60) clothCache.clear();
  clothCache.set(key, g);
  return g;
}

/** Model-space position + axis of every bone in the bind pose (for physique). */
export function boneAxes(rig, childMap = {}) {
  const axes = {};
  const p = new THREE.Vector3(), c = new THREE.Vector3();
  for (const [name, b] of Object.entries(rig.bones)) {
    b.getWorldPosition(p);
    const child = (childMap[name] && rig.bones[childMap[name]]) || b.children.find(x => x.isBone);
    let dir = new THREE.Vector3(0, 1, 0);
    if (child) { child.getWorldPosition(c); if (c.distanceTo(p) > 1e-4) dir = c.clone().sub(p).normalize(); }
    axes[name] = { pos: p.clone(), dir };
  }
  return axes;
}

/**
 * Printed jersey: draws the base colour plus the name + number straight into the jersey's UV space, so
 * the print sits on the fabric and moves with it. The back/chest UV islands are mapped by fitting an
 * affine map from model-space (x, y) to (u, v); if the region straddles a UV seam the fit fails and we
 * return printed: false so the caller can fall back to a back plate.
 */
function fitRegion(geometry, test) {
  const pos = geometry.attributes.position, uv = geometry.attributes.uv, nrm = geometry.attributes.normal;
  if (!uv) return null;
  const rows = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), nz = nrm.getZ(i);
    if (test(x, y, nz)) rows.push([x, y, uv.getX(i), uv.getY(i)]);
  }
  if (rows.length < 12) return null;
  // least squares for u and v against [x, y, 1]
  const solve = k => {
    let sxx = 0, sxy = 0, sx = 0, syy = 0, sy = 0, n = 0, sxt = 0, syt = 0, st = 0;
    for (const r of rows) { const [x, y] = r, t = r[k]; sxx += x * x; sxy += x * y; sx += x; syy += y * y; sy += y; n++; sxt += x * t; syt += y * t; st += t; }
    const M = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]], b = [sxt, syt, st];
    const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const D0 = det(M); if (Math.abs(D0) < 1e-12) return null;
    return [0, 1, 2].map(c => det(M.map((row, i) => row.map((v, j) => (j === c ? b[i] : v)))) / D0);
  };
  const cu = solve(2), cv = solve(3);
  if (!cu || !cv) return null;
  let err = 0;
  for (const [x, y, u, v] of rows) { err += (cu[0] * x + cu[1] * y + cu[2] - u) ** 2 + (cv[0] * x + cv[1] * y + cv[2] - v) ** 2; }
  err = Math.sqrt(err / rows.length);
  return err < 0.015 ? { cu, cv } : null;
}

export function jerseyTexture(geometry, { color = '#1f3a68', name = '', number = '', trim = '#ffffff' } = {}) {
  const S = 2048; // the back is a small UV island - high resolution keeps the lettering crisp
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, S, S);
  const back = fitRegion(geometry, (x, y, nz) => nz < -0.6 && y > 1.12 && y < 1.42 && Math.abs(x) < 0.15);
  const front = fitRegion(geometry, (x, y, nz) => nz > 0.55 && y > 1.15 && y < 1.45 && Math.abs(x) < 0.15);
  // text space is centimetres; xDir -1 on the back (viewer behind sees the player's left on their left)
  const place = (fit, xDir, yc) => {
    const { cu, cv } = fit, k = 0.01;
    g.setTransform(S * cu[0] * xDir * k, S * cv[0] * xDir * k, -S * cu[1] * k, -S * cv[1] * k, S * (cu[1] * yc + cu[2]), S * (cv[1] * yc + cv[2]));
  };
  const print = (text, size, y, weight = 700) => {
    g.font = `${weight} ${size}px "Bebas Neue", Impact, "Arial Narrow", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = size * 0.09; g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.strokeText(text, 0, y); g.fillStyle = trim; g.fillText(text, 0, y);
  };
  if (back) {
    // keep the print in the flat middle of the back - the shoulder blades stretch the fabric
    place(back, -1, 1.27);
    const nm = String(name).toUpperCase().slice(0, 12);
    print(nm, nm.length > 8 ? 5 : 6, -4.6);
    print(String(number ?? ''), 13, 4.2);
  }
  if (front) {
    place(front, 1, 1.33);
    print(String(number ?? ''), 6, 0);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return { texture: t, printed: !!back };
}
