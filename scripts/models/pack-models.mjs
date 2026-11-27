#!/usr/bin/env node
/**
 * Packs the CC0 "Universal Base Characters" (Quaternius, free Standard version) into small GLBs for the web.
 * Textures and unused vertex attributes are stripped: skin, hair and kit colours come from each player's traits.
 *
 * 1. Download the Standard zip from https://quaternius.itch.io/universal-base-characters (CC0)
 * 2. Save it as data-raw/models/ubc-standard.zip
 * 3. node scripts/models/pack-models.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup } from '@gltf-transform/functions';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ZIP = path.join(ROOT, 'data-raw', 'models', 'ubc-standard.zip');
const TMP = path.join(ROOT, 'data-raw', 'models', 'extracted');
const OUT = path.join(ROOT, 'public', 'models', 'cricketer');

const FILES = {
  body: /Godot - UE\/(Superhero_Male_FullBody\.(gltf|bin)|T_Eye_Brown\.png)$/,
  hair: /Rigged to Head Bone\/glTF \(Godot -Unreal\)\/(Hair_Buzzed|Hair_SimpleParted|Hair_Long|Hair_Buns|Hair_Beard|Eyebrows_Regular)\.(gltf|bin)$/,
};

if (!fs.existsSync(ZIP)) { console.error(`Missing ${ZIP} - see the header of this script.`); process.exit(1); }
fs.mkdirSync(TMP, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
const z = unzipSync(fs.readFileSync(ZIP), { filter: f => FILES.body.test(f.name) || FILES.hair.test(f.name) || /License/i.test(f.name) });
for (const [name, bytes] of Object.entries(z)) fs.writeFileSync(path.join(TMP, path.basename(name)), bytes);

const io = new NodeIO();
const KEEP = new Set(['POSITION', 'NORMAL', 'JOINTS_0', 'WEIGHTS_0', 'TEXCOORD_0']);
async function pack(src, dst) {
  // the glTF references textures we don't ship - drop image URIs before reading
  const json = JSON.parse(fs.readFileSync(path.join(TMP, src), 'utf8'));
  // keep only the eye colour texture (36 KB); everything else is coloured from player traits
  const eyeImg = (json.images || []).findIndex(i => /T_Eye_Brown\.png$/.test(i.uri || ''));
  const eyeTex = (json.textures || []).findIndex(t => t.source === eyeImg);
  for (const m of json.materials || []) {
    const pbr = m.pbrMetallicRoughness || {};
    if (!(m.name === 'MI_Eyes' && pbr.baseColorTexture && eyeTex >= 0 && pbr.baseColorTexture.index === eyeTex)) delete pbr.baseColorTexture;
    else pbr.baseColorTexture.index = 0;
    delete pbr.metallicRoughnessTexture; delete m.normalTexture; delete m.occlusionTexture; delete m.emissiveTexture;
  }
  const keepEye = eyeTex >= 0 && (json.materials || []).some(m => m.pbrMetallicRoughness?.baseColorTexture);
  json.images = keepEye ? [json.images[eyeImg]] : undefined;
  json.textures = keepEye ? [{ ...json.textures[eyeTex], source: 0, sampler: json.textures[eyeTex].sampler !== undefined ? 0 : undefined }] : undefined;
  json.samplers = keepEye && json.samplers ? [json.samplers[json.textures[0].sampler ?? 0] || {}] : undefined;
  if (!json.images) { delete json.images; delete json.textures; delete json.samplers; }
  const bin = fs.readFileSync(path.join(TMP, json.buffers[0].uri));
  const resources = { [json.buffers[0].uri]: new Uint8Array(bin) };
  if (keepEye) resources[json.images[0].uri] = new Uint8Array(fs.readFileSync(path.join(TMP, path.basename(json.images[0].uri))));
  const doc = await io.readJSON({ json, resources });
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    for (const sem of prim.listSemantics()) if (!KEEP.has(sem)) prim.setAttribute(sem, null);
  }
  await doc.transform(prune(), dedup());
  await io.write(path.join(OUT, dst), doc);
  console.log(`${dst}: ${(fs.statSync(path.join(OUT, dst)).size / 1024).toFixed(0)} KB`);
}

await pack('Superhero_Male_FullBody.gltf', 'body.glb');
for (const h of ['Hair_Buzzed', 'Hair_SimpleParted', 'Hair_Long', 'Hair_Buns', 'Hair_Beard', 'Eyebrows_Regular']) await pack(`${h}.gltf`, `${h.toLowerCase()}.glb`);
fs.copyFileSync(path.join(TMP, 'License_Standard.txt'), path.join(OUT, 'LICENSE-Quaternius-CC0.txt'));
console.log('done ->', path.relative(ROOT, OUT));
