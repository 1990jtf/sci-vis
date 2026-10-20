/* BodyParts3D → GLB
   数据来源：ashemag/human-atlas 打包的 BodyParts3D 4.0（CC BY 4.0）
   格式：每个 chunk 内按 part 顺序存 [positions Float32][normals Int16][indices Uint32]
   输出：按解剖系统分组的 GLB，供 Three.js 直接加载 */
const fs = require('fs');
const path = require('path');

const ROOT = '/tmp/atlas';
const OUT = process.argv[2] || '/tmp/atlas/out';
const atlas = JSON.parse(fs.readFileSync(path.join(ROOT, 'atlas.json'), 'utf8'));
fs.mkdirSync(OUT, { recursive: true });

const chunks = atlas.chunks.map((c, i) => fs.readFileSync(path.join(ROOT, `body-${i}.bin`)));
const byId = new Map(atlas.parts.map((p) => [p.id, p]));
const conceptById = new Map(atlas.concepts.map((c) => [c.id, c]));

function extract(p) {
  const buf = chunks[p.chunk];
  const vn = p.vertexCount, inx = p.indexCount;
  const pos = new Float32Array(buf.buffer, buf.byteOffset + p.positions, vn * 3);
  const raw = new Int16Array(buf.buffer, buf.byteOffset + p.normals, vn * 3);
  const idx = new Uint32Array(buf.buffer, buf.byteOffset + p.indices, inx);
  const nrm = new Float32Array(vn * 3);
  for (let i = 0; i < vn * 3; i++) nrm[i] = raw[i] / 32767;
  return { pos, nrm, idx, vn, inx };
}

// 合并一组 part，并可施加缩放/平移
function merge(parts, tf) {
  let vn = 0, inx = 0;
  for (const p of parts) { vn += p.vertexCount; inx += p.indexCount; }
  const pos = new Float32Array(vn * 3);
  const nrm = new Float32Array(vn * 3);
  const idx = new Uint32Array(inx);
  let vo = 0, io = 0, base = 0;
  for (const p of parts) {
    const g = extract(p);
    for (let i = 0; i < g.vn; i++) {
      pos[(vo + i) * 3] = g.pos[i * 3] * tf.scale + tf.ox;
      pos[(vo + i) * 3 + 1] = g.pos[i * 3 + 1] * tf.scale + tf.oy;
      pos[(vo + i) * 3 + 2] = g.pos[i * 3 + 2] * tf.scale + tf.oz;
      nrm[(vo + i) * 3] = g.nrm[i * 3];
      nrm[(vo + i) * 3 + 1] = g.nrm[i * 3 + 1];
      nrm[(vo + i) * 3 + 2] = g.nrm[i * 3 + 2];
    }
    for (let i = 0; i < g.inx; i++) idx[io + i] = g.idx[i] + base;
    vo += g.vn; io += g.inx; base += g.vn;
  }
  return { pos, nrm, idx, vn, inx };
}

function pad4(n) { return (4 - (n % 4)) % 4; }

// 最小 glTF 2.0 打包器
function buildGLB(groups) {
  const json = {
    asset: { version: '2.0', generator: 'sci-vis · BodyParts3D 4.0 (CC BY 4.0)' },
    scene: 0,
    scenes: [{ nodes: [] }],
    nodes: [],
    meshes: [],
    materials: [],
    accessors: [],
    bufferViews: [],
    buffers: [],
  };
  const parts = [];
  let byteLen = 0;

  const addBufferView = (typedArray, target) => {
    const bytes = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
    const p = pad4(byteLen);
    if (p) { parts.push(Buffer.alloc(p)); byteLen += p; }
    const view = {
      buffer: 0, byteOffset: byteLen, byteLength: bytes.length,
      ...(target ? { target } : {}),
    };
    byteLen += bytes.length;
    parts.push(bytes);
    json.bufferViews.push(view);
    return json.bufferViews.length - 1;
  };

  groups.forEach((g, gi) => {
    const posView = addBufferView(g.pos, 34962);
    const nrmView = addBufferView(g.nrm, 34962);
    const idxView = addBufferView(g.idx, 34963);

    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < g.vn * 3; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = g.pos[i + k];
        if (v < mn[k]) mn[k] = v;
        if (v > mx[k]) mx[k] = v;
      }
    }

    json.accessors.push({
      bufferView: posView, componentType: 5126, count: g.vn, type: 'VEC3',
      min: mn, max: mx,
    });
    const aPos = json.accessors.length - 1;
    json.accessors.push({ bufferView: nrmView, componentType: 5126, count: g.vn, type: 'VEC3' });
    const aNrm = json.accessors.length - 1;
    json.accessors.push({ bufferView: idxView, componentType: 5125, count: g.inx, type: 'SCALAR' });
    const aIdx = json.accessors.length - 1;

    json.materials.push({
      name: g.key,
      pbrMetallicRoughness: {
        baseColorFactor: [...g.color, g.opacity != null ? g.opacity : 1],
        metallicFactor: g.metal != null ? g.metal : 0.0,
        roughnessFactor: g.rough != null ? g.rough : 0.62,
      },
      emissiveFactor: g.emissive ? g.emissive.map((c) => c * (g.emissiveStrength || 1)) : [0, 0, 0],
      ...(g.opacity != null && g.opacity < 1 ? { alphaMode: 'BLEND' } : {}),
      doubleSided: true,
    });

    json.meshes.push({
      name: g.key,
      primitives: [{
        attributes: { POSITION: aPos, NORMAL: aNrm },
        indices: aIdx,
        material: json.materials.length - 1,
      }],
    });
    json.nodes.push({ name: g.key, mesh: json.meshes.length - 1 });
    json.scenes[0].nodes.push(gi);
  });

  // 补齐 4 字节并写 buffer
  const total = byteLen + pad4(byteLen);
  if (total > byteLen) { parts.push(Buffer.alloc(total - byteLen)); }
  const bin = Buffer.concat(parts, total);
  json.buffers.push({ byteLength: bin.length });

  let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const jp = pad4(jsonBuf.length);
  if (jp) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jp, 0x20)]);

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546C67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + bin.length, 8);

  const jHead = Buffer.alloc(8);
  jHead.writeUInt32LE(jsonBuf.length, 0);
  jHead.writeUInt32LE(0x4E4F534A, 4);

  const bHead = Buffer.alloc(8);
  bHead.writeUInt32LE(bin.length, 0);
  bHead.writeUInt32LE(0x004E4942, 4);

  return Buffer.concat([header, jHead, jsonBuf, bHead, bin]);
}

/* ---------------- 分组定义 ---------------- */
const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const conceptParts = (fma) => {
  const c = conceptById.get(fma);
  if (!c) throw new Error('no concept ' + fma);
  return c.elements.map((id) => byId.get(id)).filter(Boolean);
};
const sysParts = (sys, minTri) =>
  atlas.parts.filter((p) => p.system === sys && p.indexCount / 3 >= (minTri || 0));

// 先用皮肤算出整体高度，统一缩放到 H
const skinParts = [byId.get('FJ2810')];
let ymin = Infinity, ymax = -Infinity, xmin = Infinity, xmax = -Infinity;
for (const p of skinParts) {
  ymin = Math.min(ymin, p.bounds[0][1]); ymax = Math.max(ymax, p.bounds[1][1]);
  xmin = Math.min(xmin, p.bounds[0][0]); xmax = Math.max(xmax, p.bounds[1][0]);
}
const H = 4.6;
const scale = H / (ymax - ymin);
const TF = { scale, ox: 0, oy: -ymin * scale, oz: 0 };
console.log(`模型原始高度 ${(ymax - ymin).toFixed(3)}m · 宽度 ${(xmax - xmin).toFixed(3)}m · 缩放 ${scale.toFixed(3)}`);

const GROUPS = [
  { key: 'skin', color: [0.86, 0.68, 0.60].map(s2l), opacity: 0.30, rough: 0.55,
    parts: skinParts },
  { key: 'bone', color: [0.90, 0.86, 0.78].map(s2l), opacity: 0.62, rough: 0.5,
    parts: sysParts('skeletal', 800) },
  { key: 'artery', color: [0.82, 0.16, 0.24].map(s2l), opacity: 0.95, rough: 0.45, emissive: [0.36, 0.04, 0.06],
    parts: sysParts('arterial', 1200) },
  { key: 'vein', color: [0.16, 0.36, 0.78].map(s2l), opacity: 0.95, rough: 0.45, emissive: [0.04, 0.10, 0.28],
    parts: sysParts('venous', 1200) },

  { key: 'heart', color: [0.72, 0.16, 0.20].map(s2l), opacity: 1, rough: 0.42, emissive: [0.24, 0.03, 0.04], parts: conceptParts('FMA7088') },
  { key: 'lungs', color: [0.86, 0.58, 0.60].map(s2l), opacity: 1, rough: 0.5, emissive: [0.18, 0.07, 0.08],
    parts: [...conceptParts('FMA7309'), ...conceptParts('FMA7310')] },
  { key: 'liver', color: [0.48, 0.16, 0.13].map(s2l), opacity: 1, rough: 0.46, emissive: [0.14, 0.03, 0.02], parts: conceptParts('FMA7197') },
  { key: 'stomach', color: [0.74, 0.42, 0.34].map(s2l), opacity: 1, rough: 0.46, parts: conceptParts('FMA7148') },
  { key: 'smallIntestine', color: [0.78, 0.42, 0.30].map(s2l), opacity: 1, rough: 0.46, parts: conceptParts('FMA7200') },
  { key: 'largeIntestine', color: [0.66, 0.48, 0.28].map(s2l), opacity: 1, rough: 0.48, parts: conceptParts('FMA7201') },
  { key: 'kidney', color: [0.46, 0.24, 0.22].map(s2l), opacity: 1, rough: 0.46, parts: conceptParts('FMA7203') },
  { key: 'spleen', color: [0.42, 0.20, 0.26].map(s2l), opacity: 1, rough: 0.46, parts: conceptParts('FMA7196') },
  { key: 'pancreas', color: [0.76, 0.60, 0.34].map(s2l), opacity: 1, rough: 0.48, parts: conceptParts('FMA7198') },
  { key: 'bladder', color: [0.72, 0.68, 0.40].map(s2l), opacity: 1, rough: 0.5, parts: conceptParts('FMA15900') },
  { key: 'trachea', color: [0.80, 0.72, 0.66].map(s2l), opacity: 1, rough: 0.5, parts: conceptParts('FMA7394') },
];

const CORE = ['skin', 'artery', 'vein', 'heart', 'lungs', 'liver', 'stomach', 'smallIntestine',
  'largeIntestine', 'kidney', 'spleen', 'pancreas', 'bladder', 'trachea'];

function emit(name, keys) {
  const groups = [];
  for (const k of keys) {
    const def = GROUPS.find((g) => g.key === k);
    if (!def) continue;
    const t0 = Date.now();
    const m = merge(def.parts, TF);
    if (!m.inx) { console.log('  跳过空组', k); continue; }
    groups.push({
      key: def.key, pos: m.pos, nrm: m.nrm, idx: m.idx, vn: m.vn, inx: m.inx,
      color: def.color, opacity: def.opacity, rough: def.rough, emissive: def.emissive,
    });
    console.log(`  ${def.key.padEnd(16)} ${(m.inx / 3 / 1000).toFixed(0).padStart(5)}k tri  ${(m.vn / 1000).toFixed(0).padStart(5)}k vert  ${Date.now() - t0}ms`);
  }
  const glb = buildGLB(groups);
  fs.writeFileSync(path.join(OUT, name), glb);
  console.log(`→ ${name}  ${(glb.length / 1048576).toFixed(2)} MB\n`);
  return glb.length;
}

let total = 0;
console.log('构建 core.glb（皮肤 + 内脏 + 血管）');
total += emit('core.glb', CORE);
console.log('构建 bone.glb（骨骼）');
total += emit('bone.glb', ['bone']);
console.log(`合计 ${(total / 1048576).toFixed(2)} MB`);
