import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const MAPS = { sun: 'sun.jpg', mercury: 'mercury.jpg', venus: 'venus.jpg', earth: 'earth.jpg', mars: 'mars.jpg', jupiter: 'jupiter.jpg', saturn: 'saturn.jpg', uranus: 'uranus.jpg', neptune: 'neptune.jpg', moon: 'moon.jpg' };

export function createModelFactory({ manager, lightPosition, proceduralTexture }) {
  const loader = new THREE.TextureLoader(manager);
  const cache = new Map();
  function texture(file, color = true, fallback = '#777777') {
    if (cache.has(file)) return cache.get(file);
    const map = loader.load(new URL(`./textures/${file}`, import.meta.url).href, undefined, undefined, () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 2;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = fallback;
      ctx.fillRect(0, 0, 2, 2);
      map.image = canvas;
      map.needsUpdate = true;
    });
    map.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    map.anisotropy = 4;
    cache.set(file, map);
    return map;
  }
  function worldVaryings(shader) {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vPlanetPosition;\nvarying vec3 vPlanetNormal;');
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPlanetPosition = (modelMatrix * vec4(position, 1.0)).xyz;\nvPlanetNormal = normalize(mat3(modelMatrix) * normal);');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vPlanetPosition;\nvarying vec3 vPlanetNormal;\nuniform vec3 uSolarPosition;');
    shader.uniforms.uSolarPosition = { value: lightPosition };
  }
  function atmosphere(radius, color) {
    return new THREE.Mesh(new THREE.SphereGeometry(radius * 1.022, 64, 40), new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uSolarPosition: { value: lightPosition } },
      vertexShader: `varying vec3 vWorldPosition; varying vec3 vWorldNormal;
        void main() { vec4 p = modelMatrix * vec4(position, 1.0); vWorldPosition = p.xyz;
          vWorldNormal = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * p; }`,
      fragmentShader: `uniform vec3 uColor; uniform vec3 uSolarPosition;
        varying vec3 vWorldPosition; varying vec3 vWorldNormal;
        void main() { vec3 n = normalize(vWorldNormal);
          float rim = pow(1.0 - abs(dot(n, normalize(cameraPosition - vWorldPosition))), 3.4);
          float daylight = smoothstep(-0.28, 0.5, dot(n, normalize(uSolarPosition - vWorldPosition)));
          gl_FragColor = vec4(uColor * 1.5, rim * (0.1 + daylight * 0.65));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
  }
  function makeAxis(radius, tilt) {
    const group = new THREE.Group();
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -radius * 1.55, 0), new THREE.Vector3(0, radius * 1.55, 0)]);
    const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0x8bbbd8, transparent: true, opacity: .58, dashSize: radius * .055, gapSize: radius * .045 }));
    line.computeLineDistances(); group.add(line);
    const equatorPoints = Array.from({ length: 128 }, (_, i) => new THREE.Vector3(Math.cos(i / 128 * Math.PI * 2) * radius * 1.008, 0, Math.sin(i / 128 * Math.PI * 2) * radius * 1.008));
    group.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(equatorPoints), new THREE.LineBasicMaterial({ color: 0x99c0d8, transparent: true, opacity: .2 })));
    const el = document.createElement('div');
    el.className = 'ss-axis-label';
    el.textContent = `${tilt}° · 自转轴`;
    const label = new CSS2DObject(el);
    label.position.set(0, radius * 1.65, 0);
    group.add(label);
    group.visible = false;
    return group;
  }
  function create(def, radius = 1) {
    const group = new THREE.Group();
    const axial = new THREE.Group();
    const tilt = def.tilt || 0;
    axial.rotation.z = THREE.MathUtils.degToRad(tilt);
    group.add(axial);
    const map = MAPS[def.id] ? texture(MAPS[def.id]) : proceduralTexture(def.palette, 128);
    let material;
    if (def.id === 'sun') material = new THREE.MeshBasicMaterial({ map, color: new THREE.Color(1.35, 1.2, 1) });
    else if (def.id === 'earth') {
      material = new THREE.MeshPhongMaterial({ map, normalMap: texture('earth-normal.png', false, '#8080ff'), normalScale: new THREE.Vector2(.35, .35), specularMap: texture('earth-specular.png', false, '#222222'), shininess: 24, specular: new THREE.Color(0x666666) });
      const night = texture('earth-night.jpg', true, '#000000');
      material.onBeforeCompile = (shader) => {
        worldVaryings(shader);
        shader.uniforms.uNightMap = { value: night };
        shader.fragmentShader = shader.fragmentShader.replace('uniform vec3 uSolarPosition;', 'uniform vec3 uSolarPosition;\nuniform sampler2D uNightMap;');
        shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float illumination = dot(normalize(vPlanetNormal), normalize(uSolarPosition - vPlanetPosition));
          float nightSide = 1.0 - smoothstep(-0.15, 0.12, illumination);
          totalEmissiveRadiance += texture2D(uNightMap, vMapUv).rgb * nightSide * 1.3;`);
      };
      material.customProgramCacheKey = () => 'earth-night-hemisphere';
    } else material = new THREE.MeshStandardMaterial({ map, roughness: .97, metalness: 0 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), material);
    const flattening = { earth: .99665, mars: .994, jupiter: .935, saturn: .902, uranus: .977, neptune: .983 }[def.id] || 1;
    body.scale.y = flattening;
    body.userData = { id: def.id, radius };
    body.castShadow = def.id !== 'sun'; body.receiveShadow = def.id !== 'sun';
    body.rotation.y = def.id === 'earth' ? 2.35 : def.id === 'jupiter' ? 1.2 : .4;
    if (def.id === 'phobos') body.scale.set(1.25, .88, .94);
    if (def.id === 'deimos') body.scale.set(1.15, .78, .9);
    axial.add(body);
    let clouds = null;
    if (def.id === 'earth') {
      clouds = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.008, 80, 48), new THREE.MeshStandardMaterial({ color: 0xffffff, alphaMap: texture('earth-clouds.jpg', false, '#000000'), transparent: true, opacity: .9, depthWrite: false, roughness: 1 }));
      clouds.scale.y = flattening;
      axial.add(clouds);
    }
    const airColors = { earth: 0x4f96e8, venus: 0xc5a376, mars: 0xb77c56, jupiter: 0xb19b7c, saturn: 0xbeb090, uranus: 0x80b8ba, neptune: 0x4a76af };
    if (airColors[def.id]) { const air = atmosphere(radius, airColors[def.id]); air.scale.y = flattening; axial.add(air); }
    let ring = null;
    if (def.id === 'saturn') {
      const inner = radius * 1.24, outer = radius * 2.32;
      const geometry = new THREE.RingGeometry(inner, outer, 256, 8);
      const position = geometry.attributes.position, uv = geometry.attributes.uv;
      for (let i = 0; i < position.count; i++) uv.setXY(i, (Math.hypot(position.getX(i), position.getY(i)) - inner) / (outer - inner), .5);
      ring = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: texture('saturn-ring.png'), side: THREE.DoubleSide, transparent: true, alphaTest: .08, roughness: 1, metalness: 0, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.receiveShadow = true; ring.castShadow = true;
      axial.add(ring);
    }
    if (def.id === 'uranus') {
      const rings = new THREE.Group();
      for (const r of [1.52, 1.58, 1.68, 1.86]) {
        const line = new THREE.Mesh(new THREE.RingGeometry(radius * r, radius * (r + .007), 160), new THREE.MeshBasicMaterial({ color: 0x887e70, side: THREE.DoubleSide, transparent: true, opacity: .28 }));
        line.rotation.x = -Math.PI / 2; rings.add(line);
      }
      axial.add(rings);
    }
    const axis = makeAxis(radius, tilt);
    axial.add(axis);
    return { group, axial, body, clouds, ring, axis, radius, def };
  }
  return { create };
}
