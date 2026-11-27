#!/usr/bin/env node
/** Packs the CC0 Quaternius skin + hair textures into small WebP detail/normal maps (see pack-models.mjs). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ZIP = path.join(ROOT, 'data-raw', 'models', 'ubc-standard.zip');
const OUT = path.join(ROOT, 'public', 'models', 'cricketer');
// ---- textures: greyscale "detail" maps (tinted at runtime to the player's skin / hair colour) + normal maps
const TEX = path.join(OUT, 'tex');
fs.mkdirSync(TEX, { recursive: true });
const zt = unzipSync(fs.readFileSync(ZIP), { filter: f => /Base Characters\/Textures\/(T_Superhero_Male_Ligh|T_Superhero_Male_Roughness|T_Hair_[12]_BaseColor)\.png$|Normals Unity - Godot\/(T_Superhero_Male_Normal|T_Hair_[12]_Normal)\.png$/.test(f.name) });
const src = re => Buffer.from(Object.entries(zt).find(([n]) => re.test(n))[1]);
// grey detail: mean pushed to ~215 so  colour x detail  ~= the trait colour (runtime divides by 0.84)
async function detail(buf, out, size) {
  const { data, info } = await sharp(buf).resize(size, size).toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height, c = info.channels, g = new Uint8Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) { const v = 0.299 * data[i * c] + 0.587 * data[i * c + 1] + 0.114 * data[i * c + 2]; g[i] = v; sum += v; }
  const mean = sum / n, a = 0.9, b = 215 - a * mean;
  for (let i = 0; i < n; i++) g[i] = Math.max(0, Math.min(255, a * g[i] + b));
  await sharp(Buffer.from(g), { raw: { width: info.width, height: info.height, channels: 1 } }).webp({ quality: 82 }).toFile(path.join(TEX, out));
}
await detail(src(/T_Superhero_Male_Ligh\.png$/), 'skin_detail.webp', 1024);
await sharp(src(/Normals Unity - Godot\/T_Superhero_Male_Normal\.png$/)).removeAlpha().resize(1024, 1024).webp({ quality: 88 }).toFile(path.join(TEX, 'skin_normal.webp'));
await sharp(src(/T_Superhero_Male_Roughness\.png$/)).resize(512, 512).webp({ quality: 80 }).toFile(path.join(TEX, 'skin_rough.webp'));
for (const k of [1, 2]) {
  await detail(src(new RegExp(`Textures/T_Hair_${k}_BaseColor\\.png$`)), `hair${k}_detail.webp`, 1024);
  await sharp(src(new RegExp(`Normals Unity - Godot/T_Hair_${k}_Normal\\.png$`))).removeAlpha().resize(1024, 1024).webp({ quality: 88 }).toFile(path.join(TEX, `hair${k}_normal.webp`));
}
for (const f of fs.readdirSync(TEX)) console.log(`tex/${f}: ${(fs.statSync(path.join(TEX, f)).size / 1024).toFixed(0)} KB`);
