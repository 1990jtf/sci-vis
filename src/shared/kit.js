/* ==========================================================================
   SciVis Kit · 共用运行时（ES Module）
   由页面 `import * as S from '../shared/kit.js'` 引入，
   再调用 S.init(THREE, { OrbitControls, EffectComposer, RenderPass, UnrealBloomPass })
   注入依赖，之后所有 helper 即可使用。
   职责：渲染器（ACES + 泛光）、场景、相机、OrbitControls、运镜、
   语音、信息卡片、拾取、程序化纹理、噪声、星空、UI 助手。
   ========================================================================== */

// THREE / addons 依赖占位，由 init() 注入
let THREE = null;
let OrbitControls = null;
let EffectComposer = null;
let RenderPass = null;
let UnrealBloomPass = null;

export function init(_THREE, addons) {
  THREE = _THREE;
  addons = addons || {};
  OrbitControls = addons.OrbitControls;
  EffectComposer = addons.EffectComposer;
  RenderPass = addons.RenderPass;
  UnrealBloomPass = addons.UnrealBloomPass;
  return exports;
}

/* ---------------- 确定性噪声（替代 Math.random 做程序化纹理） --------- */
export function hash3(x, y, z) {
  let n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}
function smooth(t) { return t * t * (3 - 2 * t); }
export function valueNoise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const a = hash3(ix, iy, 0), b = hash3(ix + 1, iy, 0);
  const c = hash3(ix, iy + 1, 0), d = hash3(ix + 1, iy + 1, 0);
  return a + (b - a) * smooth(fx) + (c - a) * smooth(fy) * (1 - smooth(fx)) + (d - b) * smooth(fx) * smooth(fy);
}
export function fbm2(x, y, oct) {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < (oct || 5); i++) { v += amp * valueNoise2(x * f, y * f); f *= 2; amp *= 0.5; }
  return v;
}
export function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
export function lerp(a, b, t) { return a + (b - a) * t; }

/* ---------------- 渲染器：ACES 色调映射 + UnrealBloom --------- */
export function createRenderer(opts) {
  opts = opts || {};
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: opts.alpha !== false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = opts.exposure != null ? opts.exposure : 1.1;
  if (opts.shadow !== false) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  document.body.appendChild(renderer.domElement);

  let composer = null, bloom = null, renderPass = null;
  if (opts.bloom !== false) {
    composer = new EffectComposer(renderer);
    renderPass = new RenderPass(new THREE.Scene(), new THREE.Camera());
    composer.addPass(renderPass);
    bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      opts.bloomStrength != null ? opts.bloomStrength : 0.55,
      opts.bloomRadius != null ? opts.bloomRadius : 0.7,
      opts.bloomThreshold != null ? opts.bloomThreshold : 0.85
    );
    composer.addPass(bloom);
  }
  // 页面需将真实场景/相机绑定到 renderPass：renderPass.scene = scene; renderPass.camera = camera;
  return { renderer, composer, bloom, renderPass };
}

/* ---------------- 基础场景 + 相机 + 轨道控制 --------- */
export function createScene(bg, fog) {
  const scene = new THREE.Scene();
  if (bg) scene.background = new THREE.Color(bg);
  if (fog) scene.fog = fog;
  return scene;
}
export function createCamera(fov, near, far) {
  return new THREE.PerspectiveCamera(fov || 50, window.innerWidth / window.innerHeight, near || 0.1, far || 1000);
}
export function createControls(camera, dom, target) {
  const c = new OrbitControls(camera, dom);
  c.enableDamping = true;
  c.dampingFactor = 0.08;
  c.rotateSpeed = 0.7;
  if (target) c.target.copy(target);
  return c;
}

/* ---------------- 平滑运镜（点击聚焦 / 漫游） --------- */
export function makeFly(camera, controls) {
  const state = {
    active: false,
    from: new THREE.Vector3(), to: new THREE.Vector3(),
    fromTarget: new THREE.Vector3(), toTarget: new THREE.Vector3(),
    t: 0, dur: 1, onDone: null,
  };
  function flyTo(pos, target, dur, onDone) {
    state.from.copy(camera.position);
    state.to.copy(pos);
    state.fromTarget.copy(controls.target);
    state.toTarget.copy(target);
    state.t = 0;
    state.dur = dur || 1;
    state.onDone = onDone || null;
    state.active = true;
    controls.enabled = false;
  }
  function update(dt) {
    if (!state.active) return;
    state.t += dt / state.dur;
    const k = state.t >= 1 ? 1 : 1 - Math.pow(1 - state.t, 3); // easeOutCubic
    camera.position.lerpVectors(state.from, state.to, k);
    controls.target.lerpVectors(state.fromTarget, state.toTarget, k);
    camera.lookAt(controls.target);
    if (state.t >= 1) {
      state.active = false;
      controls.enabled = true;
      if (state.onDone) state.onDone();
    }
  }
  function cancel() {
    if (!state.active) return;
    state.active = false;
    controls.enabled = true;
  }
  return { flyTo, update, cancel, isActive: () => state.active };
}

/* ---------------- 语音（中文） --------- */
export function createVoice() {
  const synth = window.speechSynthesis;
  let enabled = true, zhVoice = null;
  function pick() {
    const vs = synth.getVoices();
    zhVoice = vs.find((v) => /zh/i.test(v.lang)) || null;
  }
  pick();
  synth.addEventListener('voiceschanged', pick);
  function speak(text) {
    if (!enabled || !synth || !text) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN'; u.rate = 0.95; u.pitch = 1.02;
    if (zhVoice) u.voice = zhVoice;
    synth.speak(u);
  }
  function toggle() { enabled = !enabled; if (!enabled) synth.cancel(); return enabled; }
  function stop() { synth.cancel(); }
  return { speak, toggle, stop, isEnabled: () => enabled };
}

/* ---------------- 信息卡片（CSS 类 + 结构化字段） --------- */
export function createCard(container) {
  const el = document.createElement('div');
  el.className = 'sv-card';
  el.innerHTML =
    '<div class="sv-card__head">' +
    '  <span class="sv-card__dot"></span>' +
    '  <div class="sv-card__titles"><div class="sv-card__title"></div><div class="sv-card__sub"></div></div>' +
    '  <button class="sv-card__close" aria-label="关闭">\u00D7</button>' +
    '</div>' +
    '<div class="sv-card__body"></div>';
  container.appendChild(el);
  const dot = el.querySelector('.sv-card__dot');
  const title = el.querySelector('.sv-card__title');
  const sub = el.querySelector('.sv-card__sub');
  const body = el.querySelector('.sv-card__body');
  const close = el.querySelector('.sv-card__close');

  function show(data) {
    if (!data || !data.name) return;
    const color = data.color ? '#' + data.color.toString(16).padStart(6, '0') : '#6a8cff';
    dot.style.background = color;
    dot.style.color = color;
    title.textContent = data.name;
    sub.textContent = data.type || '';
    body.innerHTML = '';
    if (data.stats && data.stats.length) {
      data.stats.forEach((s) => {
        const row = document.createElement('div');
        row.className = 'sv-card__stat';
        row.innerHTML = '<span>' + s.label + '</span><b>' + s.value + '</b>';
        body.appendChild(row);
      });
    }
    if (data.desc && data.desc.length) {
      data.desc.forEach((line) => {
        const row = document.createElement('div');
        row.className = 'sv-card__row';
        row.textContent = line;
        body.appendChild(row);
      });
    }
    el.classList.add('is-open');
  }
  function hide() { el.classList.remove('is-open'); }
  close.addEventListener('click', hide);
  return { element: el, show, hide };
}

/* ---------------- 悬停 + 点击拾取（合并） --------- */
export function makePicker(camera, dom) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function setFromEvent(e) {
    const r = dom.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
  }
  function pick(e, targets) {
    setFromEvent(e);
    const hits = raycaster.intersectObjects(targets, true);
    return hits.length ? hits[0].object : null;
  }
  function onHover(targets, cb) {
    dom.addEventListener('mousemove', (e) => cb(pick(e, targets), e));
    dom.addEventListener('mouseleave', () => cb(null, null));
  }
  function onClick(targets, cb) {
    dom.addEventListener('click', (e) => cb(pick(e, targets), e));
  }
  return { pick, onHover, onClick };
}

/* ---------------- 程序化纹理 --------- */
function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  return c;
}
export function glowTexture(inner, mid, size) {
  size = size || 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, mid);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}
// 行星地表（fbm 噪声 + 色带，经度无缝）
export function planetTexture(palette, size) {
  size = size || 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const bands = palette.map((p) => new THREE.Color(p));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const th = u * Math.PI * 2;
      const nx = Math.cos(th) * 3, ny = Math.sin(th) * 3;
      const n = fbm2(nx + 1.7, v * 5 - ny * 0.4, 5);
      const n2 = fbm2(nx * 2.3 + 9.1, v * 7 + 3.3, 4);
      let t = clamp(n * 0.7 + n2 * 0.3, 0, 1);
      const col = sampleBands(bands, t);
      const i = (y * size + x) * 4;
      img.data[i] = col.r * 255;
      img.data[i + 1] = col.g * 255;
      img.data[i + 2] = col.b * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function sampleBands(bands, t) {
  const seg = 1 / (bands.length - 1);
  const idx = Math.min(Math.floor(t / seg), bands.length - 2);
  const local = (t - idx * seg) / seg;
  return bands[idx].clone().lerp(bands[idx + 1], local);
}

// 恐龙皮肤纹理（鳞片噪声 + 色斑 + 腹部渐变）
export function skinTexture(baseColor, spotColor, size) {
  size = size || 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const base = new THREE.Color(baseColor);
  const spot = new THREE.Color(spotColor);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      // 鳞片：高频网格噪声
      const scale = fbm2(u * 18, v * 18, 4);
      const scale2 = fbm2(u * 40 + 3, v * 40 + 7, 3);
      // 色斑：低频大块斑纹
      const spotN = fbm2(u * 6 + 11, v * 6 - 5, 4);
      let col = base.clone();
      col.lerp(spot, S.clamp((spotN - 0.42) * 3.0, 0, 1) * 0.5);
      // 鳞片刻痕（微亮/微暗）
      const sheen = (scale2 - 0.5) * 0.16 + (scale - 0.5) * 0.08;
      col.r = S.clamp(col.r + sheen, 0, 1);
      col.g = S.clamp(col.g + sheen, 0, 1);
      col.b = S.clamp(col.b + sheen, 0, 1);
      const i = (y * size + x) * 4;
      img.data[i] = col.r * 255;
      img.data[i + 1] = col.g * 255;
      img.data[i + 2] = col.b * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------------- 星空（分层 + 大小/亮度变化） --------- */
export function createStarfield(count, radius, color1, color2) {
  count = count || 1400;
  radius = radius || 240;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const c1 = new THREE.Color(color1 || 0xffffff);
  const c2 = new THREE.Color(color2 || 0xaac4ff);
  for (let i = 0; i < count; i++) {
    const v = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
      .normalize().multiplyScalar(radius);
    pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
    const c = c1.clone().lerp(c2, Math.random());
    const b = 0.4 + Math.random() * 0.6;
    col[i * 3] = c.r * b; col[i * 3 + 1] = c.g * b; col[i * 3 + 2] = c.b * b;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.5, vertexColors: true, transparent: true, opacity: 0.85,
    sizeAttenuation: true, depthWrite: false,
  });
  return new THREE.Points(geo, mat);
}

/* ---------------- UI 助手 --------- */
// 创建 3D 标签（需传入 CSS2DObject 构造器）并定位
export function makeLabel(CSS2DObject, text, position, className) {
  const div = document.createElement('div');
  div.className = className || 'sv-label';
  div.textContent = text;
  const obj = new CSS2DObject(div);
  if (position) obj.position.copy(position);
  return obj;
}

export function toast(text, ms) {  let el = document.querySelector('.sv-toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'sv-toast';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add('is-open');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('is-open'), ms || 2200);
}
export function bindVoiceButton(btn, voice) {
  if (!btn) return;
  const sync = () => btn.classList.toggle('is-off', !voice.isEnabled());
  sync();
  btn.addEventListener('click', () => { voice.toggle(); sync(); });
}

// 具名导出集合（供 init 返回全部 API）
const exports = {
  init, hash3, valueNoise2, fbm2, clamp, lerp,
  createRenderer, createScene, createCamera, createControls,
  makeFly, createVoice, createCard, makePicker, makeLabel,
  glowTexture, planetTexture, skinTexture, createStarfield,
  toast, bindVoiceButton,
};

