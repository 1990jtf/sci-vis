import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Original procedural garden. All surfaces and foliage are generated locally;
// repeated tiles/leaves are instanced, architectural parts are merged per owner.
export function createGarden(scene, renderer, S, definitions) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  let seed = 20261020;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const range = (a, b) => a + (b - a) * random();
  const TAU = Math.PI * 2;
  const WATER_Y = -0.18;
  const animated = [];
  const allDefs = [...definitions.SPOTS, ...definitions.PLANTS, ...definitions.IDEAS];
  function group(key, x = 0, z = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    if (key) g.userData = { ...allDefs.find(d => d.id === key), key, kind: 'garden' };
    scene.add(g);
    return g;
  }

  function texture(kind, size = 512) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const data = ctx.createImageData(size, size);
    const bases = { plaster: [222, 218, 203], stone: [147, 148, 133], wood: [91, 62, 43], bark: [89, 82, 64], soil: [88, 94, 64], paving: [165, 164, 147], tile: [70, 77, 76] };
    const base = bases[kind];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const n = S.fbm2(x / 54, y / 54, 4), fine = S.hash3(x, y, 14);
      let value = (n - 0.45) * 34 + (fine - 0.5) * 17;
      if (kind === 'wood' || kind === 'bark') {
        const grain = Math.sin(x * 0.3 + S.fbm2(x / 46, y / 190, 3) * 12);
        value += grain * 10 + Math.sin(x * 1.7 + n * 9) * 4;
      }
      if (kind === 'stone') value += (S.valueNoise2(x / 12, y / 12) - .5) * 9;
      if (kind === 'paving') {
        const row = Math.floor(y / 64), offset = (row % 2) * 64;
        const seam = (x + offset) % 128 < 3 || y % 64 < 3;
        value += seam ? -48 : S.hash3(Math.floor((x + offset) / 128), row, 3) * 18;
        if (!seam && ((x + offset) % 128 < 6 || y % 64 < 6)) value += 10;
      }
      const i = (y * size + x) * 4;
      data.data[i] = base[0] + value;
      data.data[i + 1] = base[1] + value;
      data.data[i + 2] = base[2] + value;
      data.data[i + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
    if (kind === 'plaster') {
      for (let i = 0; i < 35; i++) {
        const x = random() * size, y = random() * size;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, range(10, 70));
        grad.addColorStop(0, 'rgba(111,115,83,.10)'); grad.addColorStop(1, 'rgba(111,115,83,0)');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, size, size);
      }
    }
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  }
  const maps = Object.fromEntries(['plaster', 'stone', 'wood', 'bark', 'soil', 'paving', 'tile'].map(k => [k, texture(k)]));
  function material(color, map, scale = .025, options = {}) {
    return new THREE.MeshStandardMaterial({ color, map: map || null, bumpMap: map || null, bumpScale: scale, roughness: .9, ...options });
  }
  const M = {
    wall: material(0xfffdf1, maps.plaster, .022),
    stone: material(0xd1d3c5, maps.stone, .024),
    stoneDark: material(0x899785, maps.stone, .025),
    brick: material(0x68736f, maps.paving, .035),
    wood: material(0xb6a088, maps.wood, .025, { roughness: .72 }),
    darkWood: material(0x806e56, maps.wood, .025, { roughness: .76 }),
    tile: material(0x919c9e, maps.tile, .018, { roughness: .83, side: THREE.DoubleSide }),
    tileEdge: material(0x565e5d, maps.tile, .02, { side: THREE.DoubleSide }),
    ground: material(0xd5d5c5, maps.paving, .022),
    soil: material(0xb2b68f, maps.soil, .04),
    bark: material(0xc6b7a4, maps.bark, .075),
    leaf: material(0x52683c, null, 0, { side: THREE.DoubleSide, roughness: .85 }),
    gold: material(0xc9ad6c, null, 0, { roughness: .55, metalness: .18 }),
    shadow: new THREE.MeshBasicMaterial({ color: 0x18241d, transparent: true, opacity: .18, depthWrite: false }),
  };
  for (const mat of [M.stone, M.stoneDark, M.wall]) {
    const plaster = mat === M.wall;
    mat.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGardenWorld;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGardenWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGardenWorld;').replace('#include <color_fragment>', `#include <color_fragment>
        float mossPatch = sin(vGardenWorld.x * 2.7 + sin(vGardenWorld.z * 3.1)) * .5 + .5;
        float damp = (1.0 - smoothstep(0.05, ${plaster ? '.7' : '1.1'}, vGardenWorld.y)) * smoothstep(.28, .85, mossPatch);
        diffuseColor.rgb *= mix(vec3(1.), vec3(${plaster ? '.68, .73, .55' : '.44, .55, .34'}), damp * ${plaster ? '.4' : '.56'});
      `);
    };
    mat.customProgramCacheKey = () => 'garden-weathering-' + (plaster ? 'plaster' : 'stone');
  }

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  function mesh(g, geo, mat, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
  }
  function box(g, w, h, d, mat, x = 0, y = 0, z = 0, ry = 0) {
    const geo = new THREE.BoxGeometry(w, h, d);
    projectUV(geo, mat === M.wood || mat === M.darkWood ? .7 : .33);
    const m = mesh(g, geo, mat, x, y, z); m.rotation.y = ry; return m;
  }
  function cylinder(g, rt, rb, h, mat, x = 0, y = 0, z = 0, segments = 12) {
    return mesh(g, new THREE.CylinderGeometry(rt, rb, h, segments), mat, x, y, z);
  }
  function projectUV(geo, density = .5) {
    const p = geo.attributes.position, n = geo.attributes.normal;
    const uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) {
      const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
      uv[i * 2] = (nx > ny && nx > nz ? p.getZ(i) : p.getX(i)) * density;
      uv[i * 2 + 1] = (ny > nx && ny > nz ? p.getZ(i) : p.getY(i)) * density;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return geo;
  }
  function branch(g, points, r0, r1, mat = M.bark, segments = 14) {
    if (points.length === 2) points = [points[0], points[0].clone().lerp(points[1], .5), points[1]];
    const curve = new THREE.CatmullRomCurve3(points);
    const frames = curve.computeFrenetFrames(segments, false);
    const p = [], uv = [], indices = [], radial = 7;
    for (let i = 0; i <= segments; i++) {
      const c = curve.getPointAt(i / segments), r = THREE.MathUtils.lerp(r0, r1, i / segments);
      for (let j = 0; j <= radial; j++) {
        const a = j / radial * TAU, q = c.clone().addScaledVector(frames.normals[i], Math.cos(a) * r).addScaledVector(frames.binormals[i], Math.sin(a) * r);
        p.push(q.x, q.y, q.z); uv.push(j / radial, i / segments * 3);
        if (i < segments && j < radial) { const k = i * (radial + 1) + j; indices.push(k, k + 1, k + radial + 1, k + 1, k + radial + 2, k + radial + 1); }
      }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(indices); geo.computeVertexNormals();
    return mesh(g, geo, mat);
  }
  function beam(g, a, b, width, depth, mat = M.wood) {
    const mid = a.clone().add(b).multiplyScalar(.5);
    const m = box(g, width, a.distanceTo(b), depth, mat, mid.x, mid.y, mid.z);
    m.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()); return m;
  }
  function instances(g, geo, mat, transforms, tint = false) {
    if (!transforms.length) return;
    const m = new THREE.InstancedMesh(geo, mat, transforms.length);
    const dummy = new THREE.Object3D(), color = new THREE.Color();
    transforms.forEach((t, i) => {
      dummy.position.copy(t.p); dummy.rotation.set(...(t.r || [0, 0, 0]));
      if (t.q) dummy.quaternion.copy(t.q);
      const s = t.s || [1, 1, 1]; dummy.scale.set(...s); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
      if (tint) { color.setHSL(range(.21, .28), range(.2, .37), range(.65, .92)); m.setColorAt(i, color); }
    });
    m.castShadow = true; m.receiveShadow = true; g.add(m); return m;
  }
  function consolidate(g) {
    // Keep instancing and per-object picking; merge only ordinary opaque static meshes.
    g.updateMatrixWorld(true);
    const rootInverse = g.matrixWorld.clone().invert(), buckets = new Map(), originals = [];
    g.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh || o.material.transparent || o.userData.keep || Array.isArray(o.material)) return;
      const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      geo.applyMatrix4(rootInverse.clone().multiply(o.matrixWorld));
      if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      // Architectural meshes share the same attribute set.
      Object.keys(geo.attributes).filter(k => !['position', 'normal', 'uv'].includes(k)).forEach(k => geo.deleteAttribute(k));
      if (!buckets.has(o.material)) buckets.set(o.material, []);
      buckets.get(o.material).push(geo); originals.push(o);
    });
    originals.forEach(o => { o.removeFromParent(); o.geometry.dispose(); });
    buckets.forEach((geos, mat) => {
      const geo = mergeGeometries(geos, false);
      if (geo) mesh(g, geo, mat);
      geos.forEach(a => a.dispose());
    });
  }

  // Clouded daylight, neutral stone and soft, readable architectural shadows.
  scene.background = new THREE.Color(0xcbd4ce);
  scene.fog = new THREE.Fog(0xcbd4ce, 65, 155);
  scene.add(new THREE.HemisphereLight(0xe5eee9, 0x616a4e, 1.55));
  const sun = new THREE.DirectionalLight(0xfff1d9, 2.6); sun.position.set(-19, 36, 22);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 25, bottom: -25, near: 1, far: 100 });
  sun.shadow.normalBias = .035; sun.shadow.bias = -.00012; sun.shadow.radius = 3;
  scene.add(sun); scene.add(new THREE.DirectionalLight(0xc1d2dc, .55));
  const envScene = new THREE.Scene(); envScene.background = new THREE.Color(0xbfcfc9);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(envScene, 0); scene.environment = environment.texture; pmrem.dispose();

  const POND = [[-9.4, -1.2], [-8.2, -4.8], [-4.2, -6.6], [.6, -6.4], [5.6, -4.6], [9.2, -1], [9.8, 2.4], [7.8, 5.6], [3.4, 7.2], [-1.4, 6.9], [-5.8, 5.2], [-8.6, 2.2]];
  const shore = new THREE.CatmullRomCurve3(POND.map(([x, z]) => V(x, 0, z)), true, 'catmullrom', .35);
  const shorePoints = shore.getSpacedPoints(180);
  const pondPath = () => { const s = new THREE.Shape(); shorePoints.forEach((p, i) => i ? s.lineTo(p.x, -p.z) : s.moveTo(p.x, -p.z)); s.closePath(); return s; };
  const land = group();
  const groundShape = new THREE.Shape(); groundShape.moveTo(-21.5, -16.5); groundShape.lineTo(21.5, -16.5); groundShape.lineTo(21.5, 16.5); groundShape.lineTo(-21.5, 16.5); groundShape.closePath();
  groundShape.holes.push(new THREE.Path(pondPath().getPoints()));
  const groundGeo = new THREE.ShapeGeometry(groundShape); groundGeo.rotateX(-Math.PI / 2); projectUV(groundGeo, .19); mesh(land, groundGeo, M.ground);
  const outer = mesh(land, new THREE.PlaneGeometry(340, 340), M.soil, 0, -.12, 0); outer.rotation.x = -Math.PI / 2;
  // The outer ground needs the same pond cutout, otherwise it covers the water.
  const outerShape = new THREE.Shape(); outerShape.moveTo(-170, -170); outerShape.lineTo(170, -170); outerShape.lineTo(170, 170); outerShape.lineTo(-170, 170); outerShape.closePath(); outerShape.holes.push(new THREE.Path(pondPath().getPoints()));
  outer.geometry.dispose(); outer.geometry = new THREE.ShapeGeometry(outerShape); outer.geometry.rotateX(-Math.PI / 2); outer.rotation.x = 0; projectUV(outer.geometry, .3);
  const beds = [[-16.8, -2.6, 3.2, 5.5], [16.5, 2, 3.2, 7.2], [-3, 11.8, 9, 2.4], [2.3, -13.5, 8, 1.5], [-17.5, 10.5, 2.5, 3.3]];
  beds.forEach(([x, z, rx, rz]) => {
    const shape = new THREE.Shape();
    for (let i = 0; i <= 64; i++) { const a = i / 64 * TAU, r = 1 + .075 * Math.sin(a * 5 + x); const px = x + Math.cos(a) * rx * r, pz = -z + Math.sin(a) * rz * r; if (i) shape.lineTo(px, pz); else shape.moveTo(px, pz); }
    const geo = new THREE.ShapeGeometry(shape); geo.rotateX(-Math.PI / 2); projectUV(geo, .5); mesh(land, geo, M.soil, 0, .014, 0);
  });
  // Inlaid border strips and the approach to the moon gate.
  [-1, 1].forEach(s => { box(land, 42, .025, .12, M.stoneDark, 0, .018, s * 15.25); box(land, .12, .025, 30.5, M.stoneDark, s * 20.2, .018, 0); });
  for (let i = 0; i < 8; i++) box(land, 1.25, .04, .6, M.stone, Math.sin(i * .6) * .18, .022, 14.7 - i * .78);

  // Flower-street paving: dark and pale river pebbles form a lotus medallion.
  const mosaic = [], mosaicColors = [];
  for (let row = 0; row < 24; row++) {
    const radius = .08 + row * .066, n = Math.max(8, Math.round(TAU * radius / .075));
    for (let j = 0; j < n; j++) {
      const a = j / n * TAU + row * .045;
      mosaic.push({ p: V(Math.cos(a) * radius, .028, 12.2 + Math.sin(a) * radius), r: [0, -a, 0], s: [.036, .013, .023] });
      const petal = Math.abs(radius - (.65 + .43 * Math.cos(a * 5)));
      mosaicColors.push(petal < .07 || row === 23 ? 0x56615b : row === 21 ? 0xb4b5a0 : 0xd2d0bc);
    }
  }
  const mosaicMesh = instances(land, new THREE.SphereGeometry(1, 6, 4), material(0xffffff, null, 0), mosaic);
  mosaicMesh.castShadow = false;
  mosaicColors.forEach((c, i) => mosaicMesh.setColorAt(i, new THREE.Color(c)));

  function stoneGeo(rx, ry, rz, offset = 0) {
    const geo = new THREE.SphereGeometry(1, 14, 10), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 1 + .26 * (S.fbm2(x * 3 + offset, z * 3 + y * 2, 3) - .45) + .035 * Math.sin(x * 23 + y * 17 + z * 11);
      p.setXYZ(i, x * rx * n, y * ry * n, z * rz * n);
    }
    geo.computeVertexNormals(); projectUV(geo, .6); return geo;
  }
  // Two interlocking courses, dark wet footings and moss on the bank.
  shorePoints.forEach((p, i) => {
    if (i % 2) return;
    const tangent = shore.getTangent(i / 180), angle = -Math.atan2(tangent.z, tangent.x);
    const m = mesh(land, stoneGeo(range(.31, .52), range(.17, .28), range(.28, .43), i), i % 4 ? M.stone : M.stoneDark, p.x, -.04, p.z); m.rotation.y = angle;
    if (i % 4 === 0) { const q = p.clone().multiplyScalar(.993); mesh(land, stoneGeo(.36, .28, .28, i + 5), M.stoneDark, q.x, -.39, q.z); }
  });

  // Water's local XY plane is rotated into XZ so its reflection plane remains correct.
  const normalCanvas = document.createElement('canvas'); normalCanvas.width = normalCanvas.height = 256;
  const nc = normalCanvas.getContext('2d'), nd = nc.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const i = (y * 256 + x) * 4; const a = TAU * x / 256, b = TAU * y / 256; nd.data[i] = 128 + 16 * Math.sin(a * 5 + Math.cos(b * 3)); nd.data[i + 1] = 128 + 13 * Math.cos(b * 4 + Math.sin(a * 2)); nd.data[i + 2] = 252; nd.data[i + 3] = 255; }
  nc.putImageData(nd, 0, 0); const normals = new THREE.CanvasTexture(normalCanvas); normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
  const water = new Water(new THREE.ShapeGeometry(pondPath()), { textureWidth: 768, textureHeight: 768, waterNormals: normals, sunDirection: sun.position.clone().normalize(), sunColor: 0xe6e0c7, waterColor: 0x344f42, distortionScale: .75, fog: true });
  water.rotation.x = -Math.PI / 2; water.position.y = WATER_Y; water.material.uniforms.size.value = 14;
  water.material.fragmentShader = water.material.fragmentShader.replace('float rf0 = 0.3;', 'float rf0 = 0.055;');
  water.userData = { ...allDefs.find(d => d.id === 'chi'), kind: 'garden', key: 'chi' }; scene.add(water);

  // Small clay half-round tiles have real thickness, overlapping joints and eave mouths.
  const tileGeo = (() => {
    const geo = new THREE.CylinderGeometry(.102, .108, .41, 7, 1, true, 0, Math.PI);
    geo.rotateX(Math.PI / 2); geo.rotateZ(Math.PI / 2); return geo;
  })();
  function tileStrip(g, surface, length, width, countX, countZ) {
    const transforms = [];
    for (let ix = 0; ix < countX; ix++) for (let iz = 0; iz < countZ; iz++) {
      const u = (ix + .5) / countX, v = (iz + .5) / countZ;
      const p = surface(u, v), ahead = surface(u, Math.min(1, v + .006)), across = surface(Math.min(1, u + .006), v);
      const z = ahead.sub(p).normalize(), x = across.sub(p).normalize(), y = z.clone().cross(x).normalize();
      const matrix = new THREE.Matrix4().makeBasis(x, y, z);
      transforms.push({ p: p.clone().addScaledVector(y, .025), q: new THREE.Quaternion().setFromRotationMatrix(matrix), s: [width / countX / .204, 1, length / countZ / .36] });
    }
    const m = instances(g, tileGeo, M.tile, transforms);
    const color = new THREE.Color(); transforms.forEach((_, i) => { color.setScalar(.78 + .26 * S.hash3(i, countX, countZ)); m.setColorAt(i, color); });
  }
  function surfaceMesh(g, fn, nu, nv, mat) {
    const p = [], uv = [], idx = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const q = fn(i / nu, j / nv); p.push(q.x, q.y, q.z); uv.push(i / nu * 3, j / nv * 2); if (i < nu && j < nv) { const k = j * (nu + 1) + i; idx.push(k, k + nu + 1, k + 1, k + 1, k + nu + 1, k + nu + 2); } }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals(); return mesh(g, geo, mat);
  }
  function roof(g, w, d, eaveY, rise, hip = false) {
    const half = d / 2, ridgeHalf = hip ? Math.max(.4, w / 2 - half * .7) : w / 2;
    [-1, 1].forEach(side => {
      const surface = (u, t) => {
        const span = THREE.MathUtils.lerp(ridgeHalf, w / 2, t), x = (u * 2 - 1) * span;
        const curve = rise * Math.pow(1 - t, 1.65), tip = .16 * Math.pow(t, 7) + .11 * Math.pow(Math.abs(u * 2 - 1), 8) * t * t;
        return V(x, eaveY + curve + tip, side * half * t);
      };
      surfaceMesh(g, surface, 16, 16, M.tileEdge);
      // Orient the negative slope's parameter direction for an upward tile normal.
      const oriented = side === 1 ? surface : (u, t) => surface(1 - u, t);
      tileStrip(g, oriented, Math.hypot(half, rise), w, Math.ceil(w / .21), Math.ceil(half / .33));
      branch(g, Array.from({ length: 13 }, (_, i) => surface(i / 12, 1)), .055, .055, M.tileEdge, 24);
      for (let x = -ridgeHalf; x <= ridgeHalf; x += .44) {
        const u = (x / ridgeHalf + 1) / 2;
        branch(g, Array.from({ length: 8 }, (_, i) => surface(u, i / 7).add(V(0, -.18, 0))), .04, .04, M.darkWood, 14);
      }
    });
    if (hip) [-1, 1].forEach(side => {
      const end = (u, t) => V(side * THREE.MathUtils.lerp(ridgeHalf, w / 2, t), eaveY + rise * Math.pow(1 - t, 1.65) + .17 * Math.pow(t, 7), (u * 2 - 1) * half * t);
      surfaceMesh(g, end, 12, 12, M.tile);
      // Fan rows narrow toward the ridge on the two hip ends.
      const tiles = [];
      for (let row = 1; row <= 10; row++) for (let j = -row; j <= row; j++) {
        const t = row / 10, u = .5 + j / (2 * row + 1), p = end(u, t);
        const tangent = end(u, Math.min(1, t + .01)).sub(p).normalize();
        tiles.push({ p: p.add(V(0, .035, 0)), q: new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), tangent), s: [.9, .8, .8] });
      }
      instances(g, tileGeo, M.tile, tiles);
      [-1, 1].forEach(zside => branch(g, [V(side * ridgeHalf, eaveY + rise + .08, 0), V(side * (ridgeHalf + (w / 2 - ridgeHalf) * .55), eaveY + rise * .32, zside * half * .55), V(side * (w / 2 + .16), eaveY + .48, zside * (half + .1))], .085, .06, M.tileEdge));
    });
    branch(g, [V(-ridgeHalf - .2, eaveY + rise + .28, 0), V(-ridgeHalf * .7, eaveY + rise + .16, 0), V(ridgeHalf * .7, eaveY + rise + .16, 0), V(ridgeHalf + .2, eaveY + rise + .28, 0)], .105, .105, M.tileEdge, 24);
    [-1, 1].forEach(s => branch(g, [V(s * ridgeHalf, eaveY + rise + .18, 0), V(s * (ridgeHalf + .27), eaveY + rise + .22, 0), V(s * (ridgeHalf + .38), eaveY + rise + .47, 0)], .09, .035, M.tileEdge, 10));
  }
  function column(g, x, z, floor, h, radius = .13) {
    cylinder(g, .24, .29, .15, M.stone, x, floor + .075, z, 16);
    cylinder(g, .18, .23, .16, M.stoneDark, x, floor + .2, z, 16);
    cylinder(g, radius * .85, radius, h - .18, M.wood, x, floor + .18 + (h - .18) / 2, z, 16);
    box(g, .37, .12, .37, M.darkWood, x, floor + h - .12, z);
    // Stepped brackets and diagonal braces sit below the ring beam.
    for (let i = 0; i < 3; i++) box(g, .35 + i * .16, .09, .27 + i * .08, M.wood, x, floor + h - .35 + i * .1, z);
    [-1, 1].forEach(s => beam(g, V(x, floor + h - .7, z), V(x + s * .53, floor + h - .12, z), .085, .12));
  }
  function railing(g, a, b, floor = .5, stone = false) {
    const mat = stone ? M.stone : M.wood, d = a.distanceTo(b), n = Math.ceil(d / .55);
    beam(g, a.clone().setY(floor + .72), b.clone().setY(floor + .72), .09, .11, mat);
    beam(g, a.clone().setY(floor + .18), b.clone().setY(floor + .18), .07, .09, mat);
    for (let i = 0; i <= n; i++) { const p = a.clone().lerp(b, i / n); box(g, .07, .58, .07, mat, p.x, floor + .44, p.z); }
    for (let i = 0; i < n; i++) { const p = a.clone().lerp(b, (i + .5) / n); box(g, .26, .07, .07, mat, p.x, floor + .48, p.z, -Math.atan2(b.z - a.z, b.x - a.x)); }
  }
  function plaque(g, text, width, x, y, z) {
    box(g, width + .12, .49, .1, M.gold, x, y, z);
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#242b24'; ctx.fillRect(0, 0, 512, 128); ctx.strokeStyle = '#a99766'; ctx.lineWidth = 3; ctx.strokeRect(7, 7, 498, 114); ctx.font = '74px "Songti SC", "Noto Serif SC", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#d6c595'; ctx.fillText(text, 256, 66);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = mesh(g, new THREE.PlaneGeometry(width, .4), new THREE.MeshStandardMaterial({ map: t, roughness: .85 }), x, y, z + .056); m.castShadow = false;
  }
  function windowPanel(g, x, y, z, width, height, rotate = 0) {
    const panel = new THREE.Group(); panel.position.set(x, y, z); panel.rotation.y = rotate; g.add(panel);
    // Open lattice: no opaque box behind the wooden grid.
    [-1, 1].forEach(s => { box(panel, .065, height, .085, M.darkWood, s * width / 2, 0, 0); box(panel, width, .07, .085, M.darkWood, 0, s * height / 2, 0); });
    box(panel, width, .07, .08, M.wood, 0, -height * .2, 0);
    box(panel, width - .08, height * .24, .055, M.wood, 0, -height * .36, 0);
    const nx = Math.max(2, Math.round(width / .24)), ny = Math.max(3, Math.round(height * .65 / .26));
    for (let i = 1; i < nx; i++) box(panel, .028, height * .67, .055, M.wood, -width / 2 + width * i / nx, height * .135, 0);
    for (let i = 0; i <= ny; i++) box(panel, width, .027, .055, M.wood, 0, -height * .2 + height * .67 * i / ny, 0);
    // Brass drop handle.
    cylinder(panel, .026, .026, .12, M.gold, width * .34, -height * .19, .07, 8);
  }

  function pavilion() {
    const g = group('ting', 11.6, -7.6), radius = 2.5, h = 3.5, floor = .42;
    const base = cylinder(g, 2.98, 3.1, floor, M.stone, 0, floor / 2, 0, 6); base.rotation.y = Math.PI / 6;
    const top = cylinder(g, 2.94, 2.94, .07, M.ground, 0, floor + .035, 0, 6); top.rotation.y = Math.PI / 6;
    box(g, 1.5, .14, .8, M.stone, 0, .07, 2.9); box(g, 1.5, .14, .5, M.stone, 0, .21, 2.7);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU + Math.PI / 6, b = (i + 1) / 6 * TAU + Math.PI / 6;
      const p = V(Math.cos(a) * radius, 0, Math.sin(a) * radius), q = V(Math.cos(b) * radius, 0, Math.sin(b) * radius);
      column(g, p.x, p.z, floor, h);
      beam(g, p.clone().setY(floor + h), q.clone().setY(floor + h), .18, .22, M.darkWood);
      if (i !== 1) { railing(g, p, q, floor); beam(g, p.clone().setY(floor + .38), q.clone().setY(floor + .38), .12, .36); }
    }
    const ey = floor + h + .05, rise = 1.9, R = 3.45;
    for (let i = 0; i < 6; i++) {
      const a = (i + 1) / 6 * TAU + Math.PI / 6, b = i / 6 * TAU + Math.PI / 6;
      const edgeA = V(Math.cos(a) * R, 0, Math.sin(a) * R), edgeB = V(Math.cos(b) * R, 0, Math.sin(b) * R);
      const fn = (u, t) => { const e = edgeA.clone().lerp(edgeB, u); return V(e.x * t, ey + rise * Math.pow(Math.max(0, 1 - t), 1.6) + .18 * Math.pow(t, 7) + .3 * Math.pow(Math.abs(u * 2 - 1), 6) * t ** 4, e.z * t); };
      surfaceMesh(g, fn, 14, 18, M.tile);
      const tiles = [];
      for (let row = 1; row <= 12; row++) { const t = row / 12, n = Math.max(2, Math.round(t * R / .21)); for (let k = 0; k < n; k++) { const u = (k + .5) / n, p = fn(u, t); const z = fn(u, t + .005).sub(p).normalize(), x = edgeB.clone().sub(edgeA).normalize(), y = z.clone().cross(x).normalize(); tiles.push({ p: p.add(V(0, .035, 0)), q: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)), s: [R * t / n / .204, 1, .91] }); } }
      instances(g, tileGeo, M.tile, tiles);
      branch(g, [fn(0, .01).add(V(0, .05, 0)), fn(0, .45).add(V(0, .07, 0)), fn(0, .8).add(V(0, .07, 0)), fn(0, 1.03).add(V(0, .1, 0))], .095, .065, M.tileEdge, 28);
      branch(g, Array.from({ length: 12 }, (_, k) => fn(k / 11, 1)), .055, .055, M.tileEdge, 22);
      // Visible radial rafters under the eaves.
      for (let k = 1; k < 10; k++) branch(g, Array.from({ length: 8 }, (_, j) => fn(k / 10, .2 + j / 7 * .8).add(V(0, -.18, 0))), .038, .035, M.darkWood, 14);
    }
    cylinder(g, .06, .22, .48, M.tileEdge, 0, ey + rise + .25, 0, 16);
    mesh(g, new THREE.SphereGeometry(.18, 16, 12), M.tileEdge, 0, ey + rise + .53, 0);
    plaque(g, '听雨亭', 1.25, 0, floor + h - .3, radius * .87);
    cylinder(g, .62, .62, .13, M.stone, 0, 1.2, 0, 24); cylinder(g, .16, .24, .67, M.stoneDark, 0, .82, 0, 16);
    const ceramic = material(0xb7c8b6, null, 0, { roughness: .28 });
    cylinder(g, .13, .16, .13, ceramic, .05, 1.33, .02, 18);
    cylinder(g, .09, .12, .045, ceramic, .05, 1.42, .02, 18);
    [[.32, .14], [-.2, .19]].forEach(([x, z]) => { cylinder(g, .07, .055, .06, ceramic, x, 1.3, z, 14); cylinder(g, .055, .055, .005, M.darkWood, x, 1.333, z, 14); });
    [[.95, 0], [-.5, .82], [-.5, -.82]].forEach(([x, z]) => { cylinder(g, .24, .2, .4, M.stone, x, floor + .2, z, 16); cylinder(g, .28, .28, .07, M.stone, x, floor + .43, z, 16); });
    consolidate(g); return g;
  }
  const pavilionGroup = pavilion();

  function hall() {
    const g = group('tang', -11.2, -9.6), W = 9.6, D = 5.4, F = .5, H = 3.9;
    box(g, W + .7, F, D + .8, M.stoneDark, 0, F / 2, 0); box(g, W + .85, .1, D + .95, M.stone, 0, F, 0);
    for (let i = 0; i < 3; i++) box(g, 3.2 + i * .15, .13, .42, M.stone, 0, .065 + i * .13, D / 2 + .95 - i * .38);
    box(g, W, H, .23, M.wall, 0, F + H / 2, -D / 2);
    [-1, 1].forEach(s => box(g, .23, H, D, M.wall, s * W / 2, F + H / 2, 0));
    const columns = [-4.4, -1.5, 1.5, 4.4];
    columns.forEach(x => { column(g, x, D / 2 - .1, F, H); column(g, x, -D / 2 + .15, F, H); });
    box(g, W + .2, .25, .25, M.darkWood, 0, F + H, D / 2);
    for (let i = 0; i < 10; i++) {
      const x = -4.3 + i * .95;
      if (i === 4 || i === 5) continue;
      windowPanel(g, x, F + 1.8, D / 2 + .03, .9, 3.25);
    }
    // The two middle doors open onto a furnished, shaded interior.
    windowPanel(g, -.72, F + 1.8, D / 2 - .33, .9, 3.25, -.72);
    windowPanel(g, .72, F + 1.8, D / 2 - .33, .9, 3.25, .72);
    box(g, 2.3, .12, 1.0, M.wood, 0, 1.3, -.8);
    [-.95, .95].forEach(x => [-1.1, -.5].forEach(z => box(g, .09, .76, .09, M.darkWood, x, .91, z)));
    [-2.8, 2.8].forEach(x => { box(g, .72, .1, .72, M.wood, x, .95, -.8); box(g, .72, .9, .075, M.darkWood, x, 1.35, -1.14); [-.27, .27].forEach(dx => box(g, .07, .45, .6, M.wood, x + dx, .72, -.8)); });
    // White gables stay below the correctly sloping roof, leaving real overhangs.
    [-1, 1].forEach(s => { const sh = new THREE.Shape(); sh.moveTo(-D / 2, 0); sh.lineTo(D / 2, 0); sh.lineTo(0, 1.5); sh.closePath(); const geo = new THREE.ExtrudeGeometry(sh, { depth: .21, bevelEnabled: false }); geo.rotateY(Math.PI / 2); projectUV(geo); mesh(g, geo, M.wall, s * W / 2, F + H, 0); });
    roof(g, W + 1.35, D + 1.4, F + H, 1.6);
    plaque(g, '远香堂', 1.65, 0, F + H - .24, D / 2 + .19);
    consolidate(g); return g;
  }
  const hallGroup = hall();

  function xie() {
    const g = group('xie', 8.8, 8.4), W = 6.2, D = 4.8, F = .45, H = 3.2;
    // Open side faces north toward the pond, the rear wall belongs on the bank.
    box(g, W + 1.25, .34, D + 1.4, M.stoneDark, 0, .13, -.45); box(g, W + 1.4, .09, D + 1.5, M.stone, 0, F, -.45);
    [-2.7, 0, 2.7].forEach(x => [-2.15, 2.15].forEach(z => column(g, x, z, F, H)));
    box(g, W, H, .22, M.wall, 0, F + H / 2, D / 2);
    [-1, 1].forEach(s => { box(g, .2, H, 1.5, M.wall, s * W / 2, F + H / 2, 1.65); windowPanel(g, s * W / 2, F + 1.65, -.45, 2.3, 2.7, Math.PI / 2); });
    box(g, W, .2, .22, M.darkWood, 0, F + H, -D / 2);
    roof(g, W + 1.4, D + 1.4, F + H, 1.25, true);
    railing(g, V(-3.55, 0, -3.25), V(3.55, 0, -3.25), F);
    [-1, 1].forEach(s => railing(g, V(s * 3.55, 0, -3.25), V(s * 3.55, 0, 1.5), F));
    plaque(g, '芙蓉榭', 1.4, 0, F + H - .26, -D / 2 - .13);
    // Reverse the plaque to read from the water.
    const plaqueParts = g.children.slice(-2); plaqueParts.forEach(m => { m.rotation.y = Math.PI; m.position.z -= .12; });
    cylinder(g, .48, .48, .1, M.wood, 0, 1.2, -.3, 20); cylinder(g, .13, .2, .65, M.darkWood, 0, .85, -.3);
    consolidate(g); return g;
  }
  const xieGroup = xie();

  function boat() {
    const g = group('fang', -12.6, 4.2); g.rotation.y = Math.PI / 2;
    const sh = new THREE.Shape(); sh.moveTo(0, -4); sh.bezierCurveTo(1.5, -3.1, 1.4, -.6, 1.4, 2.8); sh.quadraticCurveTo(1.2, 3.6, 0, 3.6); sh.quadraticCurveTo(-1.2, 3.6, -1.4, 2.8); sh.bezierCurveTo(-1.4, -.6, -1.5, -3.1, 0, -4);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: .75, bevelEnabled: true, bevelThickness: .07, bevelSize: .07, bevelSegments: 2, steps: 1, curveSegments: 24 }); geo.rotateX(-Math.PI / 2); projectUV(geo, .5); mesh(g, geo, M.stone, 0, .04, 0);
    const deck = new THREE.ShapeGeometry(sh); deck.rotateX(-Math.PI / 2); projectUV(deck, .5); mesh(g, deck, M.ground, 0, .86, 0);
    [-1, 1].forEach(s => { railing(g, V(s * 1.22, 0, -.8), V(s * .86, 0, 2.8), .87); [-.8, 1.35].forEach(z => column(g, s * 1.05, z, .88, 2.3, .1)); });
    roof(g, 3.4, 3.1, 3.18, .85, true);
    box(g, 2.6, 1.7, 1.75, M.wall, 0, 1.68, -2.55);
    [-1, 1].forEach(s => windowPanel(g, s * 1.32, 1.95, -2.55, 1.2, 1.2, Math.PI / 2));
    box(g, 2.75, .15, 1.9, M.wood, 0, 2.6, -2.55);
    [-1, 1].forEach(s => [-3.15, -1.95].forEach(z => column(g, s * 1.02, z, 2.65, 1.65, .075)));
    windowPanel(g, 0, 3.48, -3.32, 1.85, 1.45);
    const tail = new THREE.Group(); tail.position.z = -2.55; g.add(tail); roof(tail, 3.15, 2.4, 4.3, .7, true);
    railing(g, V(-1.12, 0, -1.6), V(1.12, 0, -1.6), 2.63);
    plaque(g, '香洲', .95, 0, 2.95, 1.6);
    consolidate(g); return g;
  }
  const boatGroup = boat();

  const corridor = group('lang');
  const path = [[-6.4, -10.8], [1.5, -13.2], [8.4, -10.2]];
  for (let k = 0; k < path.length - 1; k++) {
    const a = V(path[k][0], 0, path[k][1]), b = V(path[k + 1][0], 0, path[k + 1][1]), length = a.distanceTo(b);
    const segment = new THREE.Group(); segment.position.copy(a.clone().lerp(b, .5)); segment.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x); corridor.add(segment);
    box(segment, length + .2, .18, 1.8, M.stone, 0, .09, 0);
    const n = Math.ceil(length / 2.2);
    for (let i = 0; i <= n; i++) [-1, 1].forEach(s => column(segment, -length / 2 + i * length / n, s * .68, .18, 2.65, .09));
    [-1, 1].forEach(s => { box(segment, length, .16, .14, M.wood, 0, 2.86, s * .68); box(segment, length, .1, .32, M.wood, 0, .63, s * .68); });
    roof(segment, length + .45, 2.4, 2.9, .5);
  }
  consolidate(corridor);

  // Eroded limestone is an isosurface with actual intersecting tunnels, not painted circles.
  const rockery = group('shan', -3.5, -6.7);
  function porousStone(g, x, y, z, scale, phase) {
    const res = 44, mc = new MarchingCubes(res, M.stone, false, false, 26000); mc.isolation = 0;
    const field = mc.field;
    for (let iz = 0; iz < res; iz++) for (let iy = 0; iy < res; iy++) for (let ix = 0; ix < res; ix++) {
      const px = ix / res * 2 - 1, py = iy / res * 2 - 1, pz = iz / res * 2 - 1;
      const bend = .12 * Math.sin(py * 5 + phase);
      const a = Math.hypot((px + bend) / (.52 + .12 * Math.sin(py * 8 + phase)), py / .91, pz / .52) - 1;
      const b = Math.hypot((px - .28) / .43, (py - .32) / .46, (pz + .07) / .55) - 1;
      const c = Math.hypot((px + .25) / .43, (py + .42) / .39, (pz - .06) / .56) - 1;
      let d = Math.min(a, b, c);
      // Front-to-back and oblique holes vary with depth so the interior has thickness.
      const h1 = Math.hypot((px + .03 + .055 * Math.sin(pz * 5)) / .25, (py - .19) / .19) - 1;
      const h2 = Math.hypot((px + .13 - pz * .22) / .19, (py + .4) / .14) - 1;
      const h3 = Math.hypot((pz + .03) / .2, (py - .61 - px * .2) / .13) - 1;
      d = Math.max(d, -h1 * .4, -h2 * .4, -h3 * .4);
      d += .045 * Math.sin(px * 24 + py * 8 + phase) * Math.sin(pz * 19 - py * 7) + .04 * (S.valueNoise2(px * 18 + phase, py * 18 + pz * 7) - .5);
      field[iz * res * res + iy * res + ix] = -d;
    }
    mc.update();
    const geo = new THREE.BufferGeometry();
    for (const name of ['position', 'normal']) geo.setAttribute(name, new THREE.BufferAttribute(mc.geometry.attributes[name].array.slice(0, mc.count * 3), 3));
    geo.scale(scale[0], scale[1], scale[2]); projectUV(geo, .7);
    const m = mesh(g, geo, M.stone, x, y, z); m.rotation.y = phase; mc.geometry.dispose(); return m;
  }
  porousStone(rockery, 0, 2.8, 0, [2.2, 3.3, 1.8], .3);
  porousStone(rockery, -1.6, 1.6, .7, [1.5, 1.95, 1.3], 1.4);
  porousStone(rockery, 1.7, 1.5, .8, [1.45, 1.9, 1.4], -.5);
  for (let i = 0; i < 22; i++) { const a = i / 22 * TAU, r = range(1.2, 3.3); mesh(rockery, stoneGeo(range(.3, .7), range(.2, .45), range(.3, .7), i), i % 3 ? M.stone : M.stoneDark, Math.cos(a) * r, .15, Math.sin(a) * r * .55); }
  consolidate(rockery);

  const bridge = group('qiao');
  const bridgePoints = [[-9.2, .6], [-4.6, 1.9], [-.6, .9], [3.4, 2.4], [7.4, 4.5]];
  for (let k = 0; k < bridgePoints.length - 1; k++) {
    const a = V(bridgePoints[k][0], 0, bridgePoints[k][1]), b = V(bridgePoints[k + 1][0], 0, bridgePoints[k + 1][1]), len = a.distanceTo(b), angle = -Math.atan2(b.z - a.z, b.x - a.x);
    const seg = new THREE.Group(); seg.position.copy(a.clone().lerp(b, .5)); seg.rotation.y = angle; bridge.add(seg);
    const slabs = Math.ceil(len / .8);
    for (let j = 0; j < slabs; j++) box(seg, len / slabs - .025, .17, 1.3, M.stone, -len / 2 + (j + .5) * len / slabs, .22, 0);
    [-1, 1].forEach(s => { railing(seg, V(-len / 2, 0, s * .61), V(len / 2, 0, s * .61), .28, true); for (let i = 0; i <= 2; i++) { const x = -len / 2 + i * len / 2; box(seg, .15, .87, .15, M.stoneDark, x, .65, s * .61); mesh(seg, new THREE.SphereGeometry(.105, 10, 8), M.stone, x, 1.1, s * .61); } });
    [-.32, .32].forEach(z => box(seg, .35, 1.3, .26, M.stoneDark, 0, -.48, z));
  }
  consolidate(bridge);

  // Limewashed perimeter with a genuinely open circular entrance and brick reveals.
  function wall(w, holes = []) {
    const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, 3.05); s.lineTo(-w / 2, 3.05); s.closePath(); s.holes.push(...holes);
    const geo = new THREE.ExtrudeGeometry(s, { depth: .34, bevelEnabled: false, curveSegments: 48 }); geo.translate(0, 0, -.17); projectUV(geo, .4); return geo;
  }
  function wallCap(g, w) {
    box(g, w + .2, .09, .65, M.tileEdge, 0, 3.08, 0);
    const rows = [];
    for (let x = -w / 2; x < w / 2; x += .22) rows.push({ p: V(x, 3.14, 0), r: [0, 0, 0], s: [1.05, 1, 1.7] });
    instances(g, tileGeo, M.tile, rows);
  }
  const moon = group('men', 0, 16);
  const hole = new THREE.Path(); hole.absarc(0, 1.42, 1.4, 0, TAU, true);
  mesh(moon, wall(42.6, [hole]), M.wall); wallCap(moon, 42.6);
  [-1, 1].forEach(s => box(moon, 19.8, .4, .39, M.brick, s * 11.4, .2, 0));
  const ringSegments = [];
  for (let i = 0; i < 48; i++) { const a = i / 48 * TAU; ringSegments.push({ p: V(Math.cos(a) * 1.46, 1.42 + Math.sin(a) * 1.46, 0), r: [0, 0, a - Math.PI / 2], s: [.177, .18, .4] }); }
  instances(moon, unitBox, M.brick, ringSegments);
  plaque(moon, '入画', 1, 0, 3.66, .09);
  box(moon, 1.2, .6, .28, M.wall, 0, 3.35, 0);
  consolidate(moon);
  const walls = group('chuang');
  const north = new THREE.Group(); north.position.z = -16; walls.add(north); mesh(north, wall(42.6), M.wall); wallCap(north, 42.6); box(north, 42.6, .43, .39, M.brick, 0, .215, 0);
  [-1, 1].forEach(side => {
    const g = new THREE.Group(); g.position.x = side * 21; g.rotation.y = Math.PI / 2; walls.add(g);
    const holes = [-9.5, 0, 9.5].map(x => { const h = new THREE.Path(); h.moveTo(x - .9, 1); h.lineTo(x + .9, 1); h.lineTo(x + .9, 2.55); h.lineTo(x - .9, 2.55); h.closePath(); return h; });
    mesh(g, wall(32.5, holes), M.wall); wallCap(g, 32.5); box(g, 32.5, .43, .39, M.brick, 0, .215, 0);
    [-9.5, 0, 9.5].forEach(x => {
      [-1, 1].forEach(s => { box(g, 1.98, .12, .43, M.brick, x, 1.775 + s * .82, 0); box(g, .12, 1.62, .43, M.brick, x + s * .95, 1.775, 0); });
      // Geometric diagonals with a central diamond, all open to the planted court.
      for (let i = -2; i <= 2; i++) {
        const shift = i * .34;
        const x1 = Math.max(-.84, -.73 + shift), x2 = Math.min(.84, .73 + shift);
        beam(g, V(x + x1, 1.775 + x1 - shift, 0), V(x + x2, 1.775 + x2 - shift, 0), .045, .08, M.brick);
        beam(g, V(x + x1, 1.775 - x1 + shift, 0), V(x + x2, 1.775 - x2 + shift, 0), .045, .08, M.brick);
      }
    });
  });
  consolidate(walls);

  // Organic leaf silhouettes, central veins, translucent edges, and curved tips.
  function leafTexture() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256; const ctx = c.getContext('2d');
    ctx.beginPath(); ctx.moveTo(64, 254); ctx.bezierCurveTo(12, 170, 15, 73, 64, 3); ctx.bezierCurveTo(110, 75, 114, 174, 64, 254);
    const grad = ctx.createLinearGradient(20, 0, 112, 0); grad.addColorStop(0, '#93a65f'); grad.addColorStop(.5, '#d3dba2'); grad.addColorStop(1, '#6f8c4e'); ctx.fillStyle = grad; ctx.fill();
    ctx.save(); ctx.clip(); ctx.strokeStyle = 'rgba(239,234,180,.32)'; ctx.lineWidth = 1;
    for (let y = 25; y < 240; y += 17) { ctx.beginPath(); ctx.moveTo(64, y + 18); ctx.lineTo(10, y - 15); ctx.moveTo(64, y + 18); ctx.lineTo(118, y - 15); ctx.stroke(); }
    ctx.restore(); ctx.strokeStyle = '#d9d7a0'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(64, 254); ctx.lineTo(64, 8); ctx.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const leafMap = leafTexture();
  const leafMat = new THREE.MeshStandardMaterial({ map: leafMap, color: 0x78944d, alphaTest: .45, side: THREE.DoubleSide, roughness: .86 });
  const willowMat = leafMat.clone(); willowMat.color.set(0x91a961);
  const leafGeo = new THREE.PlaneGeometry(1, 1, 2, 5);
  const lp = leafGeo.attributes.position; for (let i = 0; i < lp.count; i++) { const y = lp.getY(i); lp.setZ(i, .13 * (y + .5) ** 2 + Math.abs(lp.getX(i)) * .06); } leafGeo.computeVertexNormals();
  function pine(x, z, scale = 1, key = 'song') {
    const g = group(key, x, z); g.scale.setScalar(scale);
    branch(g, [V(0, 0, 0), V(.23, 1.1, .06), V(-.05, 2.2, -.1), V(.37, 3.3, .1), V(.1, 4.7, .05)], .3, .055, M.bark, 24);
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; branch(g, [V(0, .15, 0), V(Math.cos(a) * .45, .06, Math.sin(a) * .45), V(Math.cos(a) * .8, .015, Math.sin(a) * .8)], .11, .02); }
    const needles = [];
    for (let tier = 0; tier < 7; tier++) {
      const a = tier * 2.37, h = 2.3 + tier * .34, r = 1.8 - tier * .16;
      const end = V(Math.cos(a) * r, h + .2, Math.sin(a) * r);
      branch(g, [V(.12, h - .6, 0), end.clone().multiply(V(.7, 1, .7)), end], .12 - tier * .008, .025);
      for (let j = 0; j < 8; j++) {
        const c = end.clone().add(V(range(-.7, .7), range(-.06, .25), range(-.65, .65)));
        branch(g, [end.clone(), c], .022, .008, M.bark, 4);
        for (let k = 0; k < 28; k++) {
          const a = random() * TAU, r = random() * .46;
          needles.push({ p: c.clone().add(V(Math.cos(a) * r, range(-.03, .22), Math.sin(a) * r)), r: [range(.3, 1.8), a, range(-1, 1)], s: [.05, range(.3, .52), 1] });
        }
      }
    }
    const needleMat = leafMat.clone(); needleMat.color.set(0x52633a); instances(g, leafGeo, needleMat, needles, true);
    consolidate(g); return g;
  }
  function bamboo(x, z, count, spread) {
    const g = group('zhu', x, z), leaves = [];
    for (let i = 0; i < count; i++) {
      const a = random() * TAU, r = Math.sqrt(random()) * spread, px = Math.cos(a) * r, pz = Math.sin(a) * r, h = range(3.5, 6.1), lean = V(range(-.55, .55), 0, range(-.4, .4));
      const end = V(px + lean.x, h, pz + lean.z);
      branch(g, [V(px, 0, pz), V(px + lean.x * .3, h * .52, pz + lean.z * .3), end], .049, .025, M.leaf, 10);
      for (let k = 1; k < 11; k++) { const p = V(px, 0, pz).lerp(end, k / 11); cylinder(g, .056, .056, .035, M.stoneDark, p.x, p.y, p.z, 8); }
      for (let k = 0; k < 5; k++) {
        const h0 = h * (.53 + k * .09), node = V(px, 0, pz).lerp(end, h0 / h), angle = a + k * 2.4;
        const tip = node.clone().add(V(Math.cos(angle) * range(.5, 1.05), .22, Math.sin(angle) * range(.5, 1.05)));
        branch(g, [node, node.clone().lerp(tip, .55).add(V(0, .12, 0)), tip], .018, .004, M.leaf, 5);
        for (let j = 0; j < 14; j++) { const p = node.clone().lerp(tip, range(.25, 1.1)).add(V(range(-.15, .15), range(-.14, .13), range(-.15, .15))); leaves.push({ p, r: [range(.4, 2.2), angle + range(-.7, .7), range(-1.2, 1.2)], s: [range(.07, .12), range(.28, .49), 1] }); }
      }
    }
    instances(g, leafGeo, leafMat, leaves, true); consolidate(g); animated.push({ g, type: 'bamboo', phase: random() * 6 }); return g;
  }
  function willow(x, z, scale = 1) {
    const g = group('liu', x, z); g.scale.setScalar(scale);
    branch(g, [V(0, 0, 0), V(.18, 1.1, .1), V(-.12, 2.4, -.13), V(.1, 3.9, 0)], .29, .06, M.bark, 20);
    const leaves = [];
    for (let i = 0; i < 45; i++) {
      const a = i * 2.4, r = range(1.2, 2.7), h = range(3.4, 4.4), end = range(.3, 1.65);
      const pts = [V(.06, 2.9, 0), V(Math.cos(a) * r * .55, h, Math.sin(a) * r * .55), V(Math.cos(a) * r, h - .4, Math.sin(a) * r), V(Math.cos(a + .04) * r * 1.05, end, Math.sin(a + .04) * r * 1.05)];
      branch(g, pts, .045, .004, M.bark, 15);
      const c = new THREE.CatmullRomCurve3(pts);
      for (let k = 0; k < 34; k++) { const t = .25 + k / 34 * .74, p = c.getPoint(t); const s = k % 2 ? 1 : -1; leaves.push({ p: p.add(V(Math.cos(a) * .07 * s, -.035, Math.sin(a) * .07 * s)), r: [range(-.4, .4), a + s * .5, s * range(.2, .7)], s: [.08, range(.22, .34), 1] }); }
    }
    instances(g, leafGeo, willowMat, leaves, true); consolidate(g); animated.push({ g, type: 'willow', phase: random() * 6 }); return g;
  }
  const pineGroup = pine(-14.8, -3.8, 1.1);
  pine(16.8, -12.3, 1.15); pine(-17.4, 10.7, 1.12); pine(-18.4, -12.5, .86);
  const bambooGroup = bamboo(-17.2, -1.6, 26, 1.75); bamboo(16.4, 2.1, 21, 1.65); bamboo(-18.2, 6, 15, 1.1); bamboo(3.5, -14.3, 16, 1.4);
  const willowGroup = willow(10.6, 1.5, 1.2); willow(-5.6, 8.2, 1.05); willow(-9.7, -.8, .9);

  function lotus() {
    const g = group('he'), pads = [], flowers = [];
    const leafCanvas = document.createElement('canvas'); leafCanvas.width = leafCanvas.height = 256; const ctx = leafCanvas.getContext('2d');
    const grad = ctx.createRadialGradient(128, 128, 8, 128, 128, 124); grad.addColorStop(0, '#8da56a'); grad.addColorStop(.6, '#557b48'); grad.addColorStop(1, '#718d56'); ctx.fillStyle = grad; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 32; i++) { const a = i / 32 * TAU; ctx.strokeStyle = 'rgba(184,204,130,.35)'; ctx.lineWidth = i % 4 ? .7 : 1.5; ctx.beginPath(); ctx.moveTo(128, 128); ctx.quadraticCurveTo(128 + Math.cos(a + .08) * 65, 128 + Math.sin(a + .08) * 65, 128 + Math.cos(a) * 126, 128 + Math.sin(a) * 126); ctx.stroke(); }
    const t = new THREE.CanvasTexture(leafCanvas); t.colorSpace = THREE.SRGBColorSpace;
    const mat = material(0xffffff, t, .013, { side: THREE.DoubleSide, roughness: .76 });
    const geo = new THREE.CircleGeometry(1, 48); const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), r = Math.hypot(x, y), a = Math.atan2(y, x); pos.setZ(i, .13 * r * r + .035 * Math.sin(a * 8) * r * r); } geo.computeVertexNormals();
    const locations = [[4.2, 4.6], [5.4, 4.4], [3.2, 5.4], [6.2, 3.1], [-6.6, -.1], [-5.3, -.9], [-7.4, 1.5], [1.2, 5.8], [2.5, 4.8], [-1.8, 4.8], [7.2, 3.9], [5.6, -.2], [-3.4, 3.5], [-7.2, -2.2], [.2, 4.6]];
    locations.forEach(([x, z], i) => {
      const height = i % 3 === 0 ? range(.55, 1) : range(.06, .25), s = range(.35, .7);
      pads.push({ p: V(x, WATER_Y + height, z), r: [-Math.PI / 2 + range(-.13, .13), range(-.12, .12), random() * TAU], s: [s, s, s] });
      branch(g, [V(x, WATER_Y - .05, z), V(x + .1, WATER_Y + height * .6, z), V(x, WATER_Y + height, z)], .018, .012, M.leaf, 6);
      if (i % 4 === 1) flowers.push(V(x + .4, WATER_Y + height + .5, z - .18));
    });
    instances(g, geo, mat, pads);
    const petalGeo = new THREE.BufferGeometry(), pp = [], pc = [], pi = [];
    for (let row = 0; row <= 10; row++) for (let col = 0; col <= 4; col++) {
      const t = row / 10, u = col / 4 * 2 - 1;
      pp.push(u * Math.sin(Math.PI * t) ** .85 * .11, t * .34, .13 * t * t + .04 * u * u);
      const color = new THREE.Color().setRGB(1, .88 - t * .4, .82 - t * .23); pc.push(color.r, color.g, color.b);
      if (row < 10 && col < 4) { const k = row * 5 + col; pi.push(k, k + 1, k + 5, k + 1, k + 6, k + 5); }
    }
    petalGeo.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3)); petalGeo.setAttribute('color', new THREE.Float32BufferAttribute(pc, 3)); petalGeo.setIndex(pi); petalGeo.computeVertexNormals();
    const pink = material(0xffe4e1, null, 0, { side: THREE.DoubleSide, roughness: .72, vertexColors: true });
    const petals = [];
    flowers.forEach(p => {
      branch(g, [V(p.x, WATER_Y, p.z), p], .021, .016, M.leaf, 5);
      for (let layer = 0; layer < 3; layer++) for (let k = 0; k < 9; k++) {
        const a = k / 9 * TAU + layer * .32;
        petals.push({ p: p.clone().add(V(Math.sin(a) * .04, layer * .045, Math.cos(a) * .04)), r: [.95 - layer * .36, a, 0], s: [1 - layer * .13, 1 - layer * .08, 1] });
      }
      cylinder(g, .075, .04, .09, M.gold, p.x, p.y + .15, p.z, 14);
    }); instances(g, petalGeo, pink, petals); consolidate(g); return g;
  }
  const lotusGroup = lotus();

  // Low shrubs, iris-like grasses, ground cover and fallen leaves soften the paved court.
  const planting = group(), shrubLeaves = [], grassBlades = [], fallen = [];
  for (const [x, z, rx, rz] of beds) {
    for (let i = 0; i < 18; i++) {
      const a = random() * TAU, r = Math.sqrt(random()), px = x + Math.cos(a) * rx * r, pz = z + Math.sin(a) * rz * r;
      for (let j = 0; j < 23; j++) {
        const angle = random() * TAU, radius = random() * .39;
        shrubLeaves.push({ p: V(px + Math.cos(angle) * radius, range(.07, .5), pz + Math.sin(angle) * radius), r: [range(.3, 1.5), angle, random() * 2], s: [.12, .22, 1] });
      }
    }
  }
  for (let i = 0; i < 72; i++) {
    const t = random(), p = shore.getPointAt(t), n = p.clone().normalize(); p.addScaledVector(n, .55);
    for (let j = 0; j < 8; j++) grassBlades.push({ p: p.clone().add(V(range(-.18, .18), range(.13, .3), range(-.18, .18))), r: [range(-.4, .4), random() * TAU, range(-.6, .6)], s: [.035, range(.25, .63), 1] });
  }
  instances(planting, leafGeo, leafMat, shrubLeaves, true); instances(planting, leafGeo, leafMat, grassBlades, true);
  for (let i = 0; i < 220; i++) { const x = range(-19, 19), z = range(-14, 14); if (Math.hypot(x / 10.6, z / 8.3) < 1) continue; fallen.push({ p: V(x, .032, z), r: [-Math.PI / 2, 0, random() * TAU], s: [.05, .1, 1] }); }
  const fallMat = leafMat.clone(); fallMat.color.set(0x99855c); instances(planting, leafGeo, fallMat, fallen);
  // A few palm-sized broad leaves beside the rockery.
  for (const [x, z] of [[-8, -5.6], [-15.8, -6]]) {
    const g = new THREE.Group(); g.position.set(x, 0, z); planting.add(g);
    const bigLeaves = [];
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; branch(g, [V(0, 0, 0), V(Math.cos(a) * .2, .8, Math.sin(a) * .2), V(Math.cos(a) * .65, 1.3, Math.sin(a) * .65)], .05, .018, M.leaf, 7); bigLeaves.push({ p: V(Math.cos(a) * .8, 1.45, Math.sin(a) * .8), r: [Math.sin(a) * .7, a, Math.cos(a) * .7], s: [.5, 1.6, 1] }); }
    instances(g, leafGeo, leafMat, bigLeaves);
  }

  for (const [x, z] of [[-11.3, 9.5], [15.1, -5.6]]) {
    const g = new THREE.Group(); g.position.set(x, 0, z); planting.add(g);
    box(g, .6, .1, .6, M.stoneDark, 0, .05, 0);
    cylinder(g, .12, .18, .6, M.stone, 0, .4, 0, 8);
    box(g, .55, .11, .55, M.stone, 0, .75, 0);
    [-1, 1].forEach(a => [-1, 1].forEach(b => box(g, .075, .42, .075, M.stone, a * .2, .99, b * .2)));
    const cap = cylinder(g, .03, .45, .2, M.stoneDark, 0, 1.31, 0, 4); cap.rotation.y = Math.PI / 4;
    mesh(g, new THREE.SphereGeometry(.085, 10, 8), M.stone, 0, 1.48, 0);
  }
  consolidate(planting); consolidate(land);

  // Distant vegetation provides a garden horizon instead of an empty olive plane.
  const distant = group('jiejing', 13, -58);
  for (let i = 0; i < 7; i++) {
    const w = 4.5 - i * .4, y = i * 2.1;
    box(distant, w, 1.7, w, M.wall, 0, y + .85, 0);
    const level = new THREE.Group(); level.position.y = y + 1.65; distant.add(level); roof(level, w + 1, w + 1, 0, .58, true);
    [-1, 1].forEach(s => box(distant, .45, 1.0, .03, M.darkWood, s * w * .25, y + 1, w / 2 + .01));
  }
  cylinder(distant, .025, .16, 1.6, M.tileEdge, 0, 15.5, 0, 10); consolidate(distant);
  const horizon = group(), distantLeaves = [];
  for (let i = 0; i < 34; i++) {
    const a = i / 34 * TAU, r = range(35, 57), h = range(4.8, 8);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z > 18) continue;
    branch(horizon, [V(x, 0, z), V(x + .2, h * .5, z), V(x - .1, h * .9, z + .2)], .21, .035, M.bark, 8);
    for (let k = 0; k < 6; k++) {
      const angle = k * 2.4, radius = range(1.2, 2.7), tip = V(x + Math.cos(angle) * radius, h * range(.64, 1), z + Math.sin(angle) * radius);
      branch(horizon, [V(x, h * .5, z), tip], .075, .015, M.bark, 6);
      for (let j = 0; j < 100; j++) {
        const az = random() * TAU, rad = Math.sqrt(random()) * 1.25;
        distantLeaves.push({ p: tip.clone().add(V(Math.cos(az) * rad, range(-.45, .65), Math.sin(az) * rad)), r: [range(.4, 2.4), random() * TAU, range(-1, 1)], s: [range(.25, .4), range(.4, .65), 1] });
      }
    }
  }
  const distantLeafMat = leafMat.clone(); distantLeafMat.color.set(0x667c4d);
  const distantFoliage = instances(horizon, leafGeo, distantLeafMat, distantLeaves, true);
  distantFoliage.castShadow = false;
  consolidate(horizon);

  const pickTargets = [water, walls];
  scene.updateMatrixWorld(true);
  for (const owner of scene.children.filter(o => o.userData.kind && o !== water && o !== walls)) {
    const bounds = new THREE.Box3().setFromObject(owner), size = bounds.getSize(new THREE.Vector3());
    if (size.lengthSq() === 0) continue;
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshBasicMaterial());
    proxy.position.copy(bounds.getCenter(new THREE.Vector3())); proxy.userData = owner.userData;
    proxy.updateMatrixWorld(true); pickTargets.push(proxy);
  }

  function update(time) {
    water.material.uniforms.time.value = time * .26;
    animated.forEach(({ g, type, phase }) => { g.rotation.z = Math.sin(time * .65 + phase) * (type === 'willow' ? .008 : .004); g.rotation.x = Math.cos(time * .48 + phase) * .004; });
  }
  return { update, water, pickTargets, pavilion: pavilionGroup, hall: hallGroup, xie: xieGroup, boat: boatGroup, rockery, bridge, pine: pineGroup, bamboo: bambooGroup, willow: willowGroup, lotus: lotusGroup };
}
