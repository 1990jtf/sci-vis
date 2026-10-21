import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Original interpretive reconstruction. Heights, roof forms, furnishings and the
// compressed landscape are illustrative, not an archaeological survey.
export function createXuanquanModels(scene, renderer) {
  let seed = 618;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const noise = (x, z) => {
    const hash = (a, b) => {
      const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
      return n - Math.floor(n);
    };
    const ix = Math.floor(x), iz = Math.floor(z);
    let u = x - ix, v = z - iz;
    u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(hash(ix, iz), hash(ix + 1, iz), u),
      THREE.MathUtils.lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), u), v);
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const material = (color, options = {}) => new THREE.MeshStandardMaterial({
    color, roughness: 0.92, ...options,
  });

  function texture(kind) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = { earth: '#c4a47b', adobe: '#c9b18b', wood: '#796047',
      straw: '#b8a072', soil: '#c9b69a' }[kind];
    ctx.fillRect(0, 0, 512, 512);
    if (kind === 'earth') {
      for (let y = 0; y < 512; y += 24) {
        ctx.fillStyle = `rgba(94,67,42,${0.04 + random() * 0.1})`;
        ctx.fillRect(0, y, 512, 1 + random() * 2);
        ctx.fillStyle = `rgba(235,217,180,${random() * 0.13})`;
        ctx.fillRect(0, y + 2, 512, 12 + random() * 8);
      }
    }
    if (kind === 'adobe') {
      for (let row = 0; row < 16; row++) {
        for (let col = -1; col < 8; col++) {
          const x = col * 74 + (row % 2) * 37, y = row * 34;
          const c = 171 + random() * 35;
          ctx.fillStyle = `rgb(${c + 27},${c + 7},${c - 30})`;
          ctx.fillRect(x + 1, y + 1, 72, 32);
          ctx.strokeStyle = 'rgba(87,68,43,.15)';
          ctx.strokeRect(x + 1, y + 1, 72, 32);
        }
      }
    }
    if (kind === 'wood' || kind === 'straw') {
      for (let i = 0; i < 1050; i++) {
        const x = random() * 512, y = random() * 512;
        ctx.strokeStyle = random() > 0.5 ? 'rgba(40,27,16,.18)' : 'rgba(238,215,162,.22)';
        ctx.lineWidth = 0.5 + random();
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.lineTo(x + (random() - 0.5) * 5, y + 12 + random() * 110); ctx.stroke();
      }
    }
    for (let i = 0; i < 10500; i++) {
      const c = random() > 0.5 ? '64,47,29' : '255,243,208';
      ctx.fillStyle = `rgba(${c},${0.03 + random() * 0.13})`;
      ctx.fillRect(random() * 512, random() * 512, 0.5 + random() * 2.5, 0.5 + random() * 2);
    }
    if (kind === 'soil') {
      for (let i = 0; i < 2200; i++) {
        const x = random() * 512, y = random() * 512, r = 0.6 + random() * 2;
        ctx.fillStyle = random() > 0.5 ? '#9e8f76' : '#dbccb0';
        ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.65, random() * 3, 0, Math.PI * 2); ctx.fill();
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return tex;
  }
  const maps = Object.fromEntries(['earth', 'adobe', 'wood', 'straw', 'soil'].map(k => [k, texture(k)]));
  const surface = (map, scale, color = 0xffffff, bumpScale = 0.07) => {
    const t = map.clone(); t.repeat.set(...scale); t.needsUpdate = true;
    // Bump data is linear; keep the colour map's sRGB interpretation separate.
    const bump = t.clone(); bump.colorSpace = THREE.NoColorSpace; bump.needsUpdate = true;
    return material(color, { map: t, bumpMap: bump, bumpScale });
  };
  const M = {
    earth: surface(maps.earth, [1, 1]), adobe: surface(maps.adobe, [1, 1]),
    wood: surface(maps.wood, [1, 1], 0xb5a08a, 0.035),
    woodLight: surface(maps.wood, [1, 1], 0xe2c49b, 0.035),
    woodDark: surface(maps.wood, [1, 1], 0x887563, 0.025),
    straw: surface(maps.straw, [2, 1], 0xffffff, 0.1),
    mud: surface(maps.earth, [2, 2], 0xd4bd9b, 0.06),
    floor: surface(maps.soil, [10, 10], 0xf1dfbf, 0.045),
    stone: material(0x9c9584, { flatShading: true }),
    stoneDark: material(0x777365, { flatShading: true }),
    rope: material(0xab9670), strawDark: material(0x95815a),
    ceramic: material(0x827466), ceramicRed: material(0xa78668),
    bronze: material(0x7c795a, { metalness: 0.5, roughness: 0.62 }),
    ink: material(0x3a332a), plaster: material(0xdccbab),
    reed: material(0x8e9268, { side: THREE.DoubleSide }),
    leaf: material(0x737d53, { side: THREE.DoubleSide }),
    flower: material(0x9b7e7c, { side: THREE.DoubleSide }),
  };
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const sphere = new THREE.IcosahedronGeometry(1, 1);
  const poleGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
  const roofGroups = [], pickTargets = [], staticRoots = [];
  const boxGeometries = new Map();
  function mesh(parent, geo, mat, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  }
  function box(parent, w, h, d, mat, x = 0, y = 0, z = 0) {
    let geo = cube;
    if (mat === M.adobe || mat === M.mud) {
      const key = [w, h, d, mat === M.adobe].join(',');
      if (!boxGeometries.has(key)) {
        geo = cube.clone();
        const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
        const tw = mat === M.adobe ? 3.8 : 5.5, th = mat === M.adobe ? 2.4 : 3.2;
        for (let i = 0; i < p.count; i++) {
          const a = Math.abs(n.getX(i)) > 0.5 ? (p.getZ(i) + 0.5) * d : (p.getX(i) + 0.5) * w;
          const b = Math.abs(n.getY(i)) > 0.5 ? (p.getZ(i) + 0.5) * d : (p.getY(i) + 0.5) * h;
          uv.setXY(i, a / tw, b / th);
        }
        boxGeometries.set(key, geo);
      }
      geo = boxGeometries.get(key);
    }
    const m = mesh(parent, geo, mat, x, y, z); m.scale.set(w, h, d); return m;
  }
  function ellipsoid(parent, x, y, z, a, b, c, mat = M.stone) {
    const m = mesh(parent, sphere, mat, x, y, z); m.scale.set(a, b, c);
    m.rotation.y = random() * 6.28; return m;
  }
  function beam(parent, from, to, radius = 0.09, mat = M.wood) {
    const m = mesh(parent, poleGeo, mat);
    m.position.copy(from).add(to).multiplyScalar(0.5);
    m.scale.set(radius, from.distanceTo(to), radius);
    m.quaternion.setFromUnitVectors(V(0, 1, 0), to.clone().sub(from).normalize()); return m;
  }
  function rope(parent, points, radius = 0.025) {
    return mesh(parent, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 16, radius, 5, false), M.rope);
  }
  function group(key, x = 0, z = 0) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    if (key) { g.userData = { kind: 'spot', key }; pickTargets.push(g); }
    scene.add(g); staticRoots.push(g); return g;
  }
  function roofGroup(parent) {
    const g = new THREE.Group(); parent.add(g); roofGroups.push(g); return g;
  }
  function pottery(parent, x, z, scale = 1, red = false) {
    const points = [[0.16, 0], [0.24, 0.04], [0.36, 0.28], [0.34, 0.53],
      [0.19, 0.72], [0.19, 0.8], [0.23, 0.82], [0.23, 0.87], [0.17, 0.87],
      [0.16, 0.78], [0.16, 0.72], [0.29, 0.51], [0.29, 0.29], [0.14, 0.08]];
    const jar = mesh(parent, new THREE.LatheGeometry(points.map(p => new THREE.Vector2(...p)), 16),
      red ? M.ceramicRed : M.ceramic, x, 0.12, z);
    jar.scale.setScalar(scale);
  }
  // Tapered, subtly uneven mud wall: every face has metre-based UVs, so long
  // stretches don't stretch their texture. Shared end vertices stay watertight.
  function earthWall(parent, width, height, thickness, x, y, z, rotation = 0) {
    const geo = new THREE.BoxGeometry(width, height, thickness, Math.ceil(width * 1.2), 5, 1);
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), py = p.getY(i), pz = p.getZ(i), t = py / height + 0.5;
      const top = Math.max(0, (t - 0.7) / 0.3);
      p.setXYZ(i, px, py - top * (0.025 + noise(px * 1.2 + x, z) * 0.09),
        pz * (1 - t * 0.18) + Math.sign(pz) * (noise(px * 0.9 + x, py + z) - 0.5) * 0.055);
      uv.setXY(i, uv.getX(i) * width / 5.5, uv.getY(i) * height / 3.2);
    }
    geo.computeVertexNormals();
    const wall = mesh(parent, geo, M.earth, x, y, z); wall.rotation.y = rotation;
    return wall;
  }

  const yard = group('wuyuan');
  const H = 4.6;
  [[51.5, 0, -25, 0], [51.5, 0, 25, 0], [50, -25, 0, Math.PI / 2],
    [23.1, 25, -13.55, Math.PI / 2], [23.1, 25, 13.55, Math.PI / 2]].forEach(([w, x, z, r]) => {
    earthWall(yard, w, H, 1.5, x, H / 2, z, r);
    const foot = box(yard, w, 0.3, 1.76, M.mud, x, 0.15, z); foot.rotation.y = r;
  });
  earthWall(yard, 4, 1.25, 1.5, 25, 3.975, 0, Math.PI / 2);
  box(yard, 48.4, 0.12, 48.4, M.floor, 0, 0.01, 0);
  // Mud buttresses and chipped toes catch the low afternoon light.
  for (let i = -2; i <= 2; i++) {
    [-1, 1].forEach(s => {
      earthWall(yard, 1.1, 2.4, 0.8, i * 9, 1.2, s * 25.7);
      if (i !== 0) earthWall(yard, 1.1, 2.4, 0.8, s * 25.7, 1.2, i * 9, Math.PI / 2);
    });
  }
  for (let i = 0; i < 190; i++) {
    const side = i % 4, a = -25 + random() * 50, off = 26 + random() * 1.6;
    if (side === 1 && Math.abs(a) < 4) continue;
    const x = side < 2 ? (side ? off : -off) : a;
    const z = side < 2 ? a : (side === 2 ? off : -off);
    ellipsoid(yard, x, 0.08, z, 0.08 + random() * 0.22, 0.08 + random() * 0.13, 0.1 + random() * 0.23, M.mud);
  }

  // Real openings: the front facade is assembled around each door and window.
  // The interior remains visible when the optional roofs are lifted away.
  const roomGroups = [];
  function room(x, z, w, d, rotation, index, pitched = false) {
    const g = group('fangwu', x, z); g.rotation.y = rotation; roomGroups.push(g);
    const h = 2.85 + noise(x, z) * 0.45, t = 0.34, front = d / 2;
    box(g, w, 0.16, d, M.mud, 0, 0.13, 0);
    box(g, w, h, t, M.adobe, 0, h / 2, -front);
    [-1, 1].forEach(s => box(g, t, h, d, M.adobe, s * (w / 2 - t / 2), h / 2, 0));
    const dw = 1.05, dh = 2.0, windowX = w > 4 ? w * 0.29 : null;
    // Left pier, door lintel, right pier with a rectangular window cut through it.
    box(g, (w - dw) / 2, h, t, M.adobe, -(w + dw) / 4, h / 2, front);
    box(g, dw, h - dh, t, M.adobe, 0, dh + (h - dh) / 2, front);
    if (windowX) {
      const ww = 0.78, wh = 0.6, wy = 1.95;
      const leftW = windowX - ww / 2 - dw / 2;
      box(g, leftW, h, t, M.adobe, dw / 2 + leftW / 2, h / 2, front);
      const rightW = w / 2 - windowX - ww / 2;
      box(g, rightW, h, t, M.adobe, w / 2 - rightW / 2, h / 2, front);
      box(g, ww, wy - wh / 2, t, M.adobe, windowX, (wy - wh / 2) / 2, front);
      box(g, ww, h - wy - wh / 2, t, M.adobe, windowX, (h + wy + wh / 2) / 2, front);
      for (let i = -1; i <= 1; i++) box(g, 0.045, wh, 0.07, M.wood, windowX + i * 0.23, wy, front);
      box(g, ww + 0.2, 0.1, 0.48, M.woodLight, windowX, wy - wh / 2, front);
      box(g, ww + 0.2, 0.1, 0.42, M.wood, windowX, wy + wh / 2, front);
    } else box(g, (w - dw) / 2, h, t, M.adobe, (w + dw) / 4, h / 2, front);
    [-1, 1].forEach(s => box(g, 0.13, dh + 0.1, 0.43, M.woodLight, s * (dw / 2 + 0.035), dh / 2, front));
    box(g, dw + 0.36, 0.16, 0.45, M.wood, 0, dh + 0.02, front);
    box(g, dw + 0.35, 0.12, 0.8, M.stone, 0, 0.1, front + 0.15);
    // A plank door, physically hinged and partly open.
    const leaf = new THREE.Group(); leaf.position.set(-dw / 2, 0.14, front - 0.12);
    leaf.rotation.y = -0.65 - (index % 3) * 0.22; g.add(leaf);
    for (let i = 0; i < 5; i++) box(leaf, dw / 5 - 0.018, dh - 0.15, 0.08, M.wood, dw / 10 + i * dw / 5, (dh - 0.15) / 2, 0);
    [0.35, 1.48].forEach(y => box(leaf, dw, 0.1, 0.11, M.woodDark, dw / 2, y, 0));
    // Low sleeping platform / writing desk with bamboo slips and vessels.
    box(g, w * 0.64, 0.35, 1.25, M.mud, 0, 0.32, -front + 1.02);
    box(g, w * 0.57, 0.025, 1.05, M.straw, 0, 0.51, -front + 1.02);
    box(g, 1.1, 0.08, 0.6, M.wood, -w * 0.2, 0.55, 0);
    [-0.4, 0.4].forEach(a => box(g, 0.07, 0.35, 0.5, M.woodDark, -w * 0.2 + a, 0.35, 0));
    for (let i = 0; i < 7; i++) box(g, 0.044, 0.018, 0.3, M.rope, -w * 0.2 - 0.18 + i * 0.05, 0.607, 0);
    pottery(g, w * 0.27, -front + 0.9, 0.65 + random() * 0.3);

    const roof = roofGroup(g);
    const roofY = h + 0.16;
    if (pitched) {
      const rise = 0.9, half = d / 2 + 0.48, angle = Math.atan2(rise, half);
      [-1, 1].forEach(s => {
        const slab = box(roof, w + 0.7, 0.22, Math.hypot(half, rise), M.straw, 0, roofY + rise / 2, s * half / 2);
        slab.rotation.x = s * angle;
        for (let i = 0; i < Math.ceil(w / 0.38); i++) {
          const a = -w / 2 + i * 0.38;
          beam(roof, V(a, roofY + rise - 0.15, 0), V(a, roofY - 0.15, s * half), 0.047, M.woodLight);
        }
      });
      beam(roof, V(-w / 2 - 0.4, roofY + rise + 0.1, 0), V(w / 2 + 0.4, roofY + rise + 0.1, 0), 0.11, M.strawDark);
    } else {
      box(roof, w + 0.32, 0.23, d + 0.56, M.mud, 0, roofY, 0);
      for (let i = 0; i <= Math.ceil(w / 0.55); i++) {
        const a = -w / 2 + i * w / Math.ceil(w / 0.55);
        beam(roof, V(a, h - 0.08, -front - 0.34), V(a, h - 0.08, front + 0.44), 0.07, M.woodLight);
      }
      [-1, 1].forEach(s => box(roof, w + 0.35, 0.18, 0.16, M.mud, 0, roofY + 0.2, s * (front + 0.17)));
      // Small timber drain projecting from the edge of the earthen roof.
      box(roof, 0.16, 0.08, 0.8, M.wood, w * 0.31, roofY + 0.12, front + 0.3);
    }
    box(roof, w + 0.2, 0.13, 0.18, M.wood, 0, h - 0.13, front + 0.21);
  }
  for (let i = 0; i < 7; i++) room(-14.65 + i * 5.7, -21.1, 5.58, 5.3, 0, i, i === 3);
  for (let i = 0; i < 10; i++) room(-21, -18 + i * 3.6, 3.48, 5.8, Math.PI / 2, i + 7, i === 6);
  for (let i = 0; i < 5; i++) room(21.2, -15.7 + i * 3.15, 3.03, 5.5, -Math.PI / 2, i + 17);
  for (let i = 0; i < 2; i++) room(21.2, 10.8 + i * 7.4, 6.15, 5.5, -Math.PI / 2, i + 22);
  for (let i = 0; i < 3; i++) room(-10 + i * 9.3, 21, 8.4, 5.6, Math.PI, i + 24, i === 1);

  const gate = group('zhi', 25, 0);
  // Modest timber shelter and two open gate leaves rather than a monumental roof.
  [-1, 1].forEach(s => {
    beam(gate, V(0.9, 0.2, s * 2.05), V(0.9, 4.2, s * 2.05), 0.15);
    box(gate, 0.55, 0.3, 0.55, M.stone, 0.9, 0.15, s * 2.05);
    const leaf = new THREE.Group(); leaf.position.set(0.65, 0.16, s * 1.96);
    leaf.rotation.y = s * 0.82; gate.add(leaf);
    for (let i = 0; i < 9; i++) box(leaf, 0.14, 3.0, 0.201, M.woodDark, 0, 1.5, -s * (i * 0.213 + 0.11));
    [0.48, 1.5, 2.52].forEach(y => {
      box(leaf, 0.2, 0.13, 1.93, M.woodLight, 0, y, -s * 0.965);
      for (let i = 0; i < 5; i++) ellipsoid(leaf, 0.125, y, -s * (0.2 + i * 0.37), 0.035, 0.043, 0.043, M.bronze);
    });
    const ring = mesh(leaf, new THREE.TorusGeometry(0.13, 0.022, 6, 20), M.bronze, 0.15, 1.48, -s * 1.55);
    ring.rotation.y = Math.PI / 2;
  });
  box(gate, 0.32, 0.25, 4.8, M.wood, 0.9, 3.35, 0);
  const gateRoof = roofGroup(gate);
  for (let i = 0; i < 13; i++) beam(gateRoof, V(-0.7, 4.42, -2.6 + i * 0.43), V(3.7, 3.87, -2.6 + i * 0.43), 0.075, M.woodLight);
  const shelter = box(gateRoof, 4.7, 0.22, 5.8, M.straw, 1.5, 4.3, 0); shelter.rotation.z = -0.125;
  [-1, 1].forEach(s => {
    beam(gate, V(3.4, 0.2, s * 2.35), V(3.4, 3.95, s * 2.35), 0.13);
    beam(gate, V(3.4, 2.9, s * 2.35), V(2.5, 4.08, s * 2.35), 0.07);
  });
  const signCanvas = document.createElement('canvas'); signCanvas.width = 512; signCanvas.height = 128;
  const signCtx = signCanvas.getContext('2d'); signCtx.fillStyle = '#604b35'; signCtx.fillRect(0, 0, 512, 128);
  signCtx.fillStyle = '#d2b88b'; signCtx.font = '64px "Songti SC", serif'; signCtx.textAlign = 'center'; signCtx.fillText('悬 泉 置', 256, 85);
  const signTex = new THREE.CanvasTexture(signCanvas); signTex.colorSpace = THREE.SRGBColorSpace;
  const sign = mesh(gate, new THREE.PlaneGeometry(2.3, 0.575), material(0xffffff, { map: signTex }), 3.53, 3.25, 0);
  sign.rotation.y = Math.PI / 2;

  const props = group('fangwu');
  // A hollow well with individual voussoirs, dark water, windlass and bucket.
  const well = new THREE.Group(); props.add(well); well.position.set(9.5, 0.1, 3);
  for (let row = 0; row < 3; row++) for (let i = 0; i < 14; i++) {
    const a = (i + (row % 2) / 2) * Math.PI * 2 / 14;
    const geo = new THREE.CylinderGeometry(1.22, 1.26, 0.22, 2, 1, true, a, Math.PI * 2 / 14 - 0.025);
    mesh(well, geo, M.stone, 0, row * 0.23 + 0.11, 0);
    const stone = box(well, 0.45, 0.22, 0.32, M.stone, Math.sin(a) * 1.05, row * 0.23 + 0.11, Math.cos(a) * 1.05);
    stone.rotation.y = a;
  }
  const wellWater = mesh(well, new THREE.CircleGeometry(0.9, 32), material(0x263d37, { roughness: 0.22 }), 0, 0.04, 0); wellWater.rotation.x = -Math.PI / 2;
  [-1, 1].forEach(s => beam(well, V(s * 1.4, 0, 0), V(s * 1.4, 2.65, 0), 0.1));
  beam(well, V(-1.55, 2.65, 0), V(1.55, 2.65, 0), 0.1);
  beam(well, V(-1.6, 2.12, 0), V(1.6, 2.12, 0), 0.15, M.woodLight);
  for (let i = 0; i < 10; i++) {
    const ring = mesh(well, new THREE.TorusGeometry(0.166, 0.017, 5, 12), M.rope, -0.16 + i * 0.035, 2.12, 0);
    ring.rotation.y = Math.PI / 2;
  }
  rope(well, [V(0.2, 2.1, 0.15), V(0.18, 1.1, 0.1), V(0.16, 0.1, 0.09)]);
  beam(well, V(1.6, 2.12, 0), V(1.6, 1.8, 0), 0.05);
  beam(well, V(1.6, 1.8, 0), V(1.85, 1.8, 0), 0.05);
  pottery(well, 1.8, 0.8, 0.8);
  for (let i = 0; i < 6; i++) {
    beam(props, V(16.5, 0, -2 + i * 2.6), V(16.5, 1.35, -2 + i * 2.6), 0.1);
  }
  [[-15.5, 5.5, 1.65], [-15.5, 10.3, 1.55]].forEach(([x, z, r]) => {
    mesh(props, new THREE.CylinderGeometry(r, r * 1.04, 2.8, 24), M.mud, x, 1.4, z);
    mesh(props, new THREE.ConeGeometry(r + 0.4, 1.15, 24), M.straw, x, 3.2, z);
    for (let i = 0; i < 3; i++) {
      const ring = mesh(props, new THREE.TorusGeometry(r + 0.03, 0.035, 5, 32), M.rope, x, 0.45 + i * 0.9, z);
      ring.rotation.x = Math.PI / 2;
    }
  });
  for (let i = 0; i < 9; i++) pottery(props, -6.4 + (i % 3) * 0.7, -16.4 + Math.floor(i / 3) * 0.8, 0.65 + random() * 0.5, i % 3 === 0);
  // A visible bundle of documents gives the Han slips entry a concrete focus.
  const documents = group('jiandu', -3.25, -16.2);
  box(documents, 2.0, 0.12, 1.05, M.wood, 0, 0.85, 0);
  [-0.75, 0.75].forEach(x => box(documents, 0.1, 0.78, 0.75, M.woodDark, x, 0.4, 0));
  for (let i = 0; i < 18; i++) {
    box(documents, 0.063, 0.025, 0.65, M.rope, -0.65 + i * 0.075, 0.93, 0);
    for (let j = 0; j < 5; j++) box(documents, 0.024, 0.006, 0.028, M.ink, -0.65 + i * 0.075, 0.947, -0.21 + j * 0.1);
  }
  [-0.2, 0.2].forEach(z => box(documents, 1.4, 0.008, 0.018, M.woodDark, 0, 0.951, z));

  const stable = group('majiu');
  const sw = 27, sd = 19, sz = 35.4;
  box(stable, sw + 1.2, 0.1, sd + 0.5, M.floor, 0, 0.04, sz);
  // Actual posts, braces, rafters and two independent roof bays.
  for (let i = 0; i <= 8; i++) {
    const x = -sw / 2 + i * sw / 8;
    [26.9, 34.7, 43.9].forEach((z, row) => {
      const h = 3.65 - row * 0.22;
      beam(stable, V(x, 0.2, z), V(x, h, z), 0.13);
      box(stable, 0.5, 0.23, 0.5, M.stoneDark, x, 0.15, z);
      if (i < 8) beam(stable, V(x, h - 0.6, z), V(x + 0.75, h, z), 0.065);
    });
  }
  [26.9, 34.7, 43.9].forEach((z, row) => beam(stable, V(-14, 3.65 - row * 0.22, z), V(14, 3.65 - row * 0.22, z), 0.14));
  const stableRoof = roofGroup(stable);
  for (let bay = 0; bay < 2; bay++) {
    const start = bay === 0 ? 26.3 : 35.5, end = bay === 0 ? 34.2 : 44.7;
    const roofY = bay === 0 ? 3.78 : 3.55;
    const roof = box(stableRoof, sw + 1.6, 0.18, end - start, M.straw, 0, roofY, (start + end) / 2);
    roof.rotation.x = 0.026;
    for (let i = 0; i <= 52; i++) {
      const x = -14 + i * 28 / 52;
      beam(stableRoof, V(x, roofY - 0.1 + 0.12, start - 0.15), V(x, roofY - 0.1 - 0.12, end + 0.15), 0.05, M.woodLight);
    }
    for (let i = 0; i < 5; i++) beam(stableRoof, V(-14.1, roofY + 0.14, start + i * (end - start) / 4), V(14.1, roofY + 0.14, start + i * (end - start) / 4), 0.035, M.rope);
  }
  box(stable, 0.32, 1.4, 17.1, M.adobe, 0, 0.7, 35.6);
  // Hollow troughs with straw inside; dividers stop short of the walking aisle.
  for (let i = 0; i < 8; i++) {
    const x = -11.8 + i * 3.37;
    box(stable, 2.5, 0.12, 0.75, M.woodDark, x, 0.4, 27.55);
    [-1, 1].forEach(s => box(stable, 2.65, 0.44, 0.09, M.wood, x, 0.65, 27.55 + s * 0.37));
    [-1, 1].forEach(s => box(stable, 0.1, 0.44, 0.75, M.wood, x + s * 1.3, 0.65, 27.55));
    box(stable, 2.45, 0.05, 0.58, M.straw, x, 0.66, 27.55);
    if (i !== 3 && i !== 4) {
      beam(stable, V(x + 1.5, 0, 31.6), V(x + 1.5, 1.4, 31.6), 0.075);
      beam(stable, V(x + 1.5, 1.1, 28.2), V(x + 1.5, 1.1, 31.6), 0.06);
    }
    rope(stable, [V(x, 1.1, 26.95), V(x + 0.1, 0.88, 27.9), V(x + 0.15, 1.25, 28.55)]);
  }
  [-9.5, 8].forEach(x => {
    ellipsoid(stable, x, 0.8, 40.5, 1.9, 0.85, 1.45, M.straw);
    for (let i = 0; i < 18; i++) beam(stable, V(x - 1.4 + random() * 2.8, 1.1 + random() * 0.6, 39.7 + random() * 1.3), V(x - 1.3 + random() * 2.6, 0.55, 41.3 + random() * 0.4), 0.016, M.strawDark);
  });

  // A four-sided tapered tower with a continuous stairway to the platform.
  const tower = group('fengdun', -21.5, 21.5);
  const tg = new THREE.CylinderGeometry(3.5, 6.2, 10.8, 4, 8);
  tg.rotateY(Math.PI / 4);
  const tuv = tg.attributes.uv;
  for (let i = 0; i < tuv.count; i++) tuv.setXY(i, tuv.getX(i) * 4, tuv.getY(i) * 3.4);
  mesh(tower, tg, M.earth, 0, 5.4, 0);
  // The platform follows the square's side length (not the cylinder diameter).
  box(tower, 5.1, 0.25, 5.1, M.mud, 0, 10.85, 0);
  [-1, 1].forEach(s => {
    earthWall(tower, 5.1, 0.8, 0.42, 0, 11.35, s * 2.35);
    earthWall(tower, s === 1 ? 2.9 : 4.3, 0.8, 0.42, s * 2.35, 11.35, s === 1 ? -0.7 : 0, Math.PI / 2);
  });
  // External mud stairs; each tread rests on a solid supporting mass.
  for (let i = 0; i < 31; i++) {
    const y = (i + 1) * 0.35, x = 6.0 - i * 0.115, z = -8.8 + i * 0.35;
    box(tower, 1.35, y, 0.37, M.mud, x, y / 2, z);
  }
  box(tower, 1.6, 0.28, 1.65, M.mud, 2.55, 10.7, 2.1);
  // Small fuel reserve, rather than constantly burning an alarm fire.
  for (let i = 0; i < 12; i++) beam(tower, V(-1.2 + random() * 0.5, 11.1 + random() * 0.15, -0.8), V(-0.4 + random() * 0.4, 11.15 + random() * 0.1, 0.7), 0.06, M.woodDark);

  // Landscape is flat around walking routes and gently rises beyond the site.
  function groundHeight(x, z) {
    const outside = Math.max(Math.abs(x) - 58, Math.abs(z) - 115, 0);
    return -0.16 + (noise(x * 0.018, z * 0.018) * 1.8 + noise(x * 0.07, z * 0.07) * 0.4)
      * THREE.MathUtils.smoothstep(outside, 0, 65);
  }
  const terrain = group();
  const groundGeo = new THREE.PlaneGeometry(3000, 3000, 150, 150); groundGeo.rotateX(-Math.PI / 2);
  const gp = groundGeo.attributes.position, guv = groundGeo.attributes.uv;
  const colors = [];
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i), z = gp.getZ(i); gp.setY(i, groundHeight(x, z));
    guv.setXY(i, x / 14, z / 14);
    const c = new THREE.Color(0xc7b699).lerp(new THREE.Color(0xe4d1ac), noise(x * 0.025, z * 0.025));
    colors.push(c.r, c.g, c.b);
  }
  groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); groundGeo.computeVertexNormals();
  const soilBump = maps.soil.clone(); soilBump.colorSpace = THREE.NoColorSpace; soilBump.needsUpdate = true;
  const groundMat = material(0xffffff, { map: maps.soil, bumpMap: soilBump, bumpScale: 0.1, vertexColors: true });
  mesh(terrain, groundGeo, groundMat).castShadow = false;

  // Feathery road shoulders and irregular wheel ruts replace hard flat strips.
  const road = group('yidao');
  const roadGeo = new THREE.PlaneGeometry(9, 1100, 16, 180); roadGeo.rotateX(-Math.PI / 2); roadGeo.translate(38, -0.06, 0);
  const rp = roadGeo.attributes.position, rc = [];
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i), z = rp.getZ(i), dx = x - 38;
    const tracks = Math.exp(-Math.pow((Math.abs(dx) - 1.07) / 0.21, 2));
    rp.setY(i, groundHeight(x, z) + 0.09 - tracks * 0.025);
    const edge = THREE.MathUtils.smoothstep(Math.abs(dx) + (noise(z, dx) - 0.5) * 0.5, 2.7, 4.5);
    const c = new THREE.Color(0xbfa984).lerp(new THREE.Color(0xd0bd9e), edge);
    c.multiplyScalar(1 - tracks * 0.12 + (noise(dx * 3, z * 0.3) - 0.5) * 0.08);
    rc.push(c.r, c.g, c.b);
  }
  roadGeo.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3)); roadGeo.computeVertexNormals();
  mesh(road, roadGeo, material(0xffffff, { vertexColors: true, map: maps.soil })).castShadow = false;
  box(road, 12.7, 0.025, 3.5, M.floor, 31.7, -0.015, 0);

  // Distant ranges use ridged heightfields with an uneven snow line. They are
  // inside the far plane and sky dome, so the southern mountains actually show.
  const mountains = group('qilian');
  for (let layer = 0; layer < 3; layer++) {
    const geo = new THREE.PlaneGeometry(1350, 150, 180, 20); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const ridge = Math.max(0, Math.sin((z + 75) / 150 * Math.PI));
      const peaks = 13 + noise(x * 0.012 + layer * 5, 3.6) * 54 + noise(x * 0.039, layer + 6) * 27;
      const h = Math.pow(ridge, 1.1) * peaks * (1 + layer * 0.22) + noise(x * 0.12, z * 0.15) * 4 * ridge;
      pos.setY(i, h - 3);
      const snow = THREE.MathUtils.smoothstep(h + noise(x * 0.09, z * 0.07) * 16, 61 + layer * 9, 72 + layer * 9);
      const c = new THREE.Color([0xb5ada0, 0xa2adb0, 0xa9bcc4][layer]);
      c.lerp(new THREE.Color(0xe2e5df), snow); col.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
    const m = mesh(mountains, geo, material(0xffffff, { vertexColors: true, flatShading: true }), 0, 0, 375 + layer * 105);
    m.castShadow = m.receiveShadow = false;
  }

  const spring = group('xuanquan', 14, 96);
  const springScenery = new THREE.Group(); spring.add(springScenery);
  // Strata built from irregular solid rock, with a continuous rivulet to the pool.
  for (let layer = 0; layer < 3; layer++) {
    const width = 17 - layer * 3.1, height = 3.2 - layer * 0.4, depth = 6 - layer * 0.8;
    const geo = new THREE.BoxGeometry(width, height, depth, 24, 8, 8);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = noise(x * 0.7 + layer * 4, z * 0.7);
      const n2 = noise(x * 2, y * 2 + layer * 7);
      p.setXYZ(i, x + (n2 - 0.5) * 0.45,
        y + (n - 0.5) * 0.65 + Math.sin(x * 1.7) * 0.1,
        z + (noise(x * 0.9, y * 0.6) - 0.5) * 0.7);
    }
    geo.computeVertexNormals();
    mesh(springScenery, geo, M.mud, layer * 0.6, 1.3 + layer * 1.8, -6.5 - layer * 1.9);
  }
  const waterGeo = new THREE.CircleGeometry(1, 64); waterGeo.rotateX(-Math.PI / 2);
  const wp = waterGeo.attributes.position;
  for (let i = 1; i < wp.count; i++) {
    const x = wp.getX(i), z = wp.getZ(i), n = 1 + noise(x * 5, z * 5) * 0.18;
    wp.setXYZ(i, x * 3.6 * n, 0, z * 2.7 * n);
  }
  const waterMat = material(0x617f72, { roughness: 0.2, metalness: 0.18, transparent: true, opacity: 0.88 });
  mesh(spring, waterGeo, waterMat, 1.5, 0.035, 1.5).castShadow = false;
  const stream = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(1, 2.8, -7), V(0.9, 1.3, -4.4), V(1.6, 0.06, -2.5), V(1.5, 0.02, 0)]), 32, 0.13, 6, false);
  mesh(spring, stream, waterMat).castShadow = false;
  const ripples = [];
  for (let i = 0; i < 4; i++) {
    const r = mesh(spring, new THREE.RingGeometry(0.97, 1, 48), new THREE.MeshBasicMaterial({ color: 0xd0d9bd, transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false }), 1.5, 0.043, -0.5);
    r.rotation.x = -Math.PI / 2; r.castShadow = r.receiveShadow = false; ripples.push(r);
  }
  for (let i = 0; i < 32; i++) {
    const a = i / 32 * Math.PI * 2;
    ellipsoid(springScenery, 1.5 + Math.cos(a) * (4 + random() * 0.5), 0.12, 1.5 + Math.sin(a) * (3.1 + random() * 0.5), 0.22 + random() * 0.25, 0.15, 0.22 + random() * 0.25, M.stoneDark);
  }

  // Stones and sparse, branched desert shrubs are batched after construction.
  const nature = group();
  const stones = new THREE.InstancedMesh(sphere, M.stone, 1700);
  const dummy = new THREE.Object3D(), stoneColor = new THREE.Color();
  let count = 0;
  for (let i = 0; i < 2600 && count < 1700; i++) {
    const x = (random() - 0.5) * 260, z = (random() - 0.5) * 280;
    if ((Math.abs(x) < 29 && z > -29 && z < 48) || Math.abs(x - 38) < 4 || (Math.abs(x - 14) < 12 && z > 84 && z < 104)) continue;
    const s = 0.035 + Math.pow(random(), 4) * 0.4;
    dummy.position.set(x, groundHeight(x, z) + s * 0.32, z); dummy.rotation.set(random() * 0.4, random() * 6.28, 0);
    dummy.scale.set(s * 1.3, s * 0.65, s); dummy.updateMatrix(); stones.setMatrixAt(count, dummy.matrix);
    stoneColor.set(0xa69b87).multiplyScalar(0.7 + random() * 0.5); stones.setColorAt(count++, stoneColor);
  }
  stones.count = count; stones.receiveShadow = true; stones.castShadow = false; nature.add(stones);
  function shrub(x, z, size, pink = false, reeds = false) {
    const y = groundHeight(x, z);
    for (let i = 0; i < (reeds ? 18 : 10); i++) {
      const angle = random() * 6.28, height = size * (0.4 + random() * 0.75);
      const bottom = V(x + (random() - 0.5) * size * 0.5, y, z + (random() - 0.5) * size * 0.5);
      const end = bottom.clone().add(V(Math.cos(angle) * height * 0.4, height, Math.sin(angle) * height * 0.4));
      beam(nature, bottom, end, size * 0.014, reeds ? M.reed : M.woodLight);
      for (let j = 0; j < 3; j++) {
        const p = bottom.clone().lerp(end, 0.4 + j * 0.18), q = p.clone().add(V(Math.cos(angle + j) * size * 0.23, size * 0.16, Math.sin(angle + j) * size * 0.23));
        beam(nature, p, q, size * 0.008, M.reed);
        const leaf = mesh(nature, new THREE.PlaneGeometry(size * 0.07, size * 0.23), pink ? M.flower : M.leaf, q.x, q.y, q.z);
        leaf.rotation.set(0.5, angle + j, -0.4);
      }
    }
  }
  for (let i = 0; i < 65; i++) {
    const x = (random() - 0.5) * 180, z = (random() - 0.5) * 180;
    if ((Math.abs(x) < 31 && z > -31 && z < 50) || Math.abs(x - 38) < 5 || (Math.abs(x - 14) < 14 && z > 78)) continue;
    shrub(x, z, 0.5 + random() * 1.05, i % 6 === 0);
  }
  for (let i = 0; i < 14; i++) {
    const a = random() * 6.28;
    shrub(15.5 + Math.cos(a) * 5, 97.5 + Math.sin(a) * 4, 0.8 + random() * 0.8, false, true);
  }
  [[-42, 14, 1.1], [57, 31, 0.85], [-37, -34, 0.7]].forEach(([x, z, s]) => {
    const y = groundHeight(x, z), top = V(x + s * 0.5, y + 4 * s, z - s * 0.3);
    beam(nature, V(x, y, z), top, 0.2 * s, M.woodLight);
    for (let i = 0; i < 6; i++) {
      const p = V(x, y, z).lerp(top, 0.45 + random() * 0.4);
      const a = random() * 6.28, end = p.clone().add(V(Math.cos(a) * s * 1.6, s * (1 + random()), Math.sin(a) * s));
      beam(nature, p, end, 0.07 * s, M.woodLight);
      beam(nature, end, end.clone().add(V(s * 0.4, s * 0.8, s * 0.3)), 0.025 * s, M.woodLight);
    }
    for (let i = 0; i < 5; i++) beam(nature, V(x, y + 0.2, z), V(x + (random() - 0.5) * s * 2.3, y + 0.02, z + (random() - 0.5) * s * 2.3), 0.09 * s, M.woodLight);
  });

  // Merge static details per material and per semantic group, retaining separate
  // roof visibility and raycast ownership. Temporary transformed copies are freed.
  function batch(root) {
    const buckets = new Map(), remove = [];
    root.updateWorldMatrix(true, true);
    const inverse = root.matrixWorld.clone().invert();
    root.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material)) return;
      const entry = buckets.get(o.material) || [];
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(inverse.clone().multiply(o.matrixWorld));
      // Use one common attribute layout (some custom terrain has vertex colours).
      if (!g.attributes.color) {
        const c = new Float32Array(g.attributes.position.count * 3).fill(1);
        g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      }
      entry.push(g); buckets.set(o.material, entry); remove.push(o);
    });
    for (const [mat, geometries] of buckets) {
      const merged = mergeGeometries(geometries, false);
      if (merged) {
        const m = mesh(root, merged, mat); m.castShadow = root !== terrain && root !== mountains && root !== road;
        m.receiveShadow = root !== mountains;
      }
      geometries.forEach(g => g.dispose());
    }
    remove.forEach(o => o.removeFromParent());
  }
  // Collect roofs in world space before merging rooms. Visibility stays separate
  // without paying for a separate draw call for every room's eaves and rafters.
  const roofCollections = new Map();
  for (const roof of roofGroups) {
    const key = roof.parent.userData.key;
    if (!roofCollections.has(key)) {
      const g = new THREE.Group(); g.userData = { kind: 'spot', key };
      scene.add(g); pickTargets.push(g); roofCollections.set(key, g);
    }
    roofCollections.get(key).attach(roof);
  }
  roofGroups.splice(0, roofGroups.length, ...roofCollections.values());
  const roomCollection = group('fangwu');
  for (const root of [...roomGroups, props]) {
    roomCollection.attach(root);
    staticRoots.splice(staticRoots.indexOf(root), 1);
    pickTargets.splice(pickTargets.indexOf(root), 1);
  }
  staticRoots.filter(r => r !== spring).forEach(batch);
  batch(springScenery);
  roofGroups.forEach(batch);
  // Public controls are deliberately small; the legacy actor animation is separate.
  return {
    materials: M,
    pickTargets,
    roomCount: roomGroups.length,
    mergeStaticProps(roots) { roots.forEach(batch); },
    setRoofsVisible(visible) { roofGroups.forEach(r => { r.visible = visible; }); },
    update(time) {
      ripples.forEach((r, i) => {
        const phase = (time * 0.28 + i / 4) % 1;
        r.scale.setScalar(0.2 + phase * 2.1);
        r.material.opacity = (1 - phase) * 0.18;
      });
    },
  };
}

// Repeated pieces across moving actors share draw calls. Animation drives the
// original joint groups; instances copy their world transforms afterwards.
export function instanceActorDetails(scene, roots) {
  const buckets = new Map();
  for (const root of roots) {
    root.updateWorldMatrix(true, true);
    root.traverse(node => {
      if (!node.isMesh || node.isInstancedMesh) return;
      const key = [node.geometry.uuid, node.material.uuid, root.userData.key || ''].join(':');
      const entries = buckets.get(key) || [];
      node.updateMatrix();
      entries.push({ node, parent: node.parent, key: root.userData.key }); buckets.set(key, entries);
    });
  }
  const batches = [], transform = new THREE.Matrix4();
  for (const entries of buckets.values()) {
    if (entries.length < 2) continue;
    const source = entries[0].node;
    const batch = new THREE.InstancedMesh(source.geometry, source.material, entries.length);
    batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    batch.castShadow = batch.receiveShadow = true;
    batch.frustumCulled = false;
    batch.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 400);
    if (entries[0].key) batch.userData = { kind: 'spot', key: entries[0].key };
    for (const { node } of entries) node.removeFromParent();
    scene.add(batch); batches.push({ batch, entries });
  }
  return () => {
    scene.updateMatrixWorld(true);
    for (const { batch, entries } of batches) {
      entries.forEach(({ node, parent }, i) => {
        transform.multiplyMatrices(parent.matrixWorld, node.matrix); batch.setMatrixAt(i, transform);
      });
      batch.instanceMatrix.needsUpdate = true;
    }
  };
}
