import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createModelFactory } from './solar-models.js';
import { PLANETS, EARTH_DIAMETER, AU_KM, yearText, numberText } from './solar-data.js';

export function mountSolarExplorer({ S, BODIES, infoOf, fmtLightTime, fmtLy }) {
  const $ = (id) => document.getElementById(id);
  const defs = new Map(BODIES.map((body) => [body.id, body]));
  const planetDefs = BODIES.filter((body) => body.kind === 'planet');
  const moonDefs = BODIES.filter((body) => body.kind === 'moon');
  let mode = 'detail', selectedId = 'earth', metric = 'diameter';
  let playing = true, speed = 1, age = 10, axisOn = true, cloudsOn = true, satellitesOn = true;
  let touring = false, tourIndex = 0, tourElapsed = 0;
  const TOUR = ['sun', ...planetDefs.map((body) => body.id)];
  const scene = S.createScene(0x060c16);
  const camera = S.createCamera(42, .03, 1600);
  camera.position.set(0, .1, 8);
  const { renderer, composer, renderPass } = S.createRenderer({ exposure: 1, bloomStrength: .2, bloomRadius: .4, bloomThreshold: 1.05 });
  renderer.domElement.setAttribute('aria-label', '太阳系交互模型：拖动旋转，滚轮缩放');
  const pixelRatio = Math.min(window.devicePixelRatio || 1, window.innerWidth <= 980 ? 1.5 : 2);
  renderer.setPixelRatio(pixelRatio); composer.setPixelRatio(pixelRatio);
  composer.addPass(new OutputPass());
  renderPass.scene = scene; renderPass.camera = camera;
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  Object.assign(labelRenderer.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '3' });
  document.body.appendChild(labelRenderer.domElement);
  const controls = S.createControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.dampingFactor = .07;
  const fly = S.makeFly(camera, controls);
  const voice = S.createVoice({ audioBase: '../audio/solar-system/' });
  S.bindVoiceButton($('voiceBtn'), voice);
  const clock = new THREE.Clock();
  scene.add(S.createStarfield(1200, 400, 0xe0e8f5, 0x829ebc));
  scene.add(new THREE.AmbientLight(0xa5bbd6, .085));
  const key = new THREE.DirectionalLight(0xfff5e6, 2.7);
  key.position.set(-6, 3, 6); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: .1, far: 32 });
  key.shadow.bias = -.0002; key.shadow.normalBias = .012;
  scene.add(key, key.target);
  const solarLight = new THREE.PointLight(0xfff4dc, 3.2, 0, 0);
  solarLight.visible = false; scene.add(solarLight);
  const lightPosition = key.position.clone();
  let textureErrors = 0;
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_, loaded, total) => { document.querySelector('.sv-loader__text').textContent = `正在加载星球地图 · ${loaded} / ${total}`; };
  manager.onLoad = () => $('loader').classList.add('is-done');
  manager.onError = () => { textureErrors++; $('textureStatus').textContent = '部分纹理简化显示'; };
  const factory = createModelFactory({ manager, lightPosition, proceduralTexture: S.planetTexture });
  const detailGroup = new THREE.Group(), orbitGroup = new THREE.Group(), compareGroup = new THREE.Group();
  scene.add(detailGroup, orbitGroup, compareGroup);
  const orbitModels = [], compareModels = [], detailWorlds = new Map();
  const labels = [];
  const pickables = [];

  function sync(selector, attribute, value) {
    document.querySelectorAll(selector).forEach((button) => {
      const on = button.dataset[attribute] === value;
      button.classList.toggle('is-on', on); button.setAttribute('aria-pressed', String(on));
    });
  }
  function addLabel(parent, text, position, id, className = '') {
    const wrap = document.createElement('div');
    const inner = document.createElement(id ? 'button' : 'span');
    inner.className = `ss-body-label ${className}`;
    inner.textContent = text;
    if (id) inner.addEventListener('click', (event) => { event.stopPropagation(); stopTour(); choose(id); });
    wrap.appendChild(inner);
    const object = new CSS2DObject(wrap);
    object.position.copy(position);
    object.userData = { inner, id };
    parent.add(object); labels.push(object);
    return object;
  }
  function orbitLine(radius, color = 0x4a6482, opacity = .3) {
    const points = Array.from({ length: 256 }, (_, index) => new THREE.Vector3(Math.cos(index / 256 * Math.PI * 2) * radius, 0, Math.sin(index / 256 * Math.PI * 2) * radius));
    return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
  }
  function addSunGlow(model, scale) {
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: S.glowTexture('rgba(255,192,94,.5)', 'rgba(211,106,28,.12)'), transparent: true, blending: THREE.AdditiveBlending, opacity: .4, depthWrite: false }));
    glow.scale.setScalar(scale); model.group.add(glow);
  }
  const orbitSun = factory.create(defs.get('sun'), 2.05);
  orbitGroup.add(orbitSun.group); addSunGlow(orbitSun, 9);
  pickables.push(orbitSun.body);
  addLabel(orbitSun.group, '太阳', new THREE.Vector3(0, 2.8, 0), 'sun');
  planetDefs.forEach((def, index) => {
    const model = factory.create(def, def.size);
    model.angle = index * 1.38 + .4;
    orbitGroup.add(orbitLine(def.orbit), model.group);
    orbitModels.push(model); pickables.push(model.body);
    addLabel(model.group, def.name, new THREE.Vector3(0, def.size + .55, 0), def.id);
  });
  let compareWidth = 0;
  planetDefs.forEach((def) => {
    const radius = PLANETS[def.id].diameter / EARTH_DIAMETER * .28;
    const extent = def.id === 'saturn' ? radius * 2.35 : radius;
    const model = factory.create(def, radius);
    model.group.position.x = compareWidth + extent;
    compareWidth += extent * 2 + 2.4;
    compareGroup.add(model.group); compareModels.push(model); pickables.push(model.body);
    addLabel(model.group, def.name, new THREE.Vector3(0, -4.3, 0), def.id);
  });
  compareWidth -= 2.4;
  compareModels.forEach((model) => { model.group.position.x -= compareWidth / 2; });

  function getWorld(id) {
    if (detailWorlds.has(id)) return detailWorlds.get(id);
    const def = defs.get(id), model = factory.create(def, 1);
    const root = new THREE.Group(); root.add(model.group); detailGroup.add(root);
    pickables.push(model.body);
    if (id === 'sun') addSunGlow(model, 5.1);
    const satellites = new THREE.Group(), moons = [];
    root.add(satellites);
    moonDefs.filter((moon) => moon.parent === id).forEach((moon, index) => {
      const hostDiameter = PLANETS[id]?.diameter || 12756;
      const physicalDiameter = Number((moon.diameter || '').replace(/[^0-9.]/g, ''));
      // Very small moons are enlarged so children can select them.
      const radius = id === 'earth' ? 3475 / hostDiameter : THREE.MathUtils.clamp(physicalDiameter / hostDiameter, .035, .1);
      const small = factory.create(moon, radius);
      small.orbitRadius = id === 'earth' ? 2.25 : 2.55 + index * .38;
      small.baseOrbitRadius = small.orbitRadius;
      small.angle = index * 1.7 + .27;
      const orbitalPlane = new THREE.Group();
      orbitalPlane.rotation.x = id === 'earth' ? THREE.MathUtils.degToRad(5.1) : 0;
      small.orbitPath = orbitLine(small.orbitRadius, 0x5c7591, .12);
      orbitalPlane.add(small.orbitPath, small.group);
      satellites.add(orbitalPlane);
      pickables.push(small.body); moons.push(small);
      if (id === 'earth' || index === 0) addLabel(small.group, moon.name.split(' · ')[0], new THREE.Vector3(0, radius + .12, 0), moon.id);
    });
    const world = { root, model, satellites, moons };
    detailWorlds.set(id, world);
    return world;
  }
  getWorld('earth');

  function frameView(duration = .8) {
    const rect = $('viewportFrame').getBoundingClientRect();
    const width = window.innerWidth, height = window.innerHeight;
    const compactEarth = mode === 'detail' && selectedId === 'earth' && window.innerWidth <= 600 && window.innerHeight > 600;
    const centerX = rect.left + rect.width * (compactEarth && satellitesOn ? .4 : .5);
    const centerY = rect.top + rect.height * .53;
    camera.setViewOffset(width, height, width / 2 - centerX, height / 2 - centerY, width, height);
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const availableX = Math.max(.2, rect.width / width), availableY = Math.max(.16, rect.height / height);
    let distance, position;
    if (mode === 'detail') {
      getWorld(selectedId).moons.forEach((moon) => {
        moon.orbitRadius = moon.baseOrbitRadius * (compactEarth ? 1.7 / 2.25 : 1);
        moon.orbitPath.scale.setScalar(moon.orbitRadius / moon.baseOrbitRadius);
      });
      const radiusY = selectedId === 'saturn' ? 1.65 : 1.25;
      const radiusX = selectedId === 'saturn' ? 2.45 : compactEarth && satellitesOn ? 1.55 : 1.25;
      distance = Math.max(radiusY / (tangent * availableY * .86), radiusX / (tangent * camera.aspect * availableX * .82));
      position = selectedId === 'saturn' ? new THREE.Vector3(0, .53 * distance, .85 * distance) : new THREE.Vector3(0, .08 * distance, distance);
      controls.minDistance = 2.5; controls.maxDistance = Math.max(18, distance * 2);
    } else if (mode === 'orbits') {
      distance = Math.max(29 / (tangent * camera.aspect * availableX * .9), 18 / (tangent * availableY * .9));
      position = new THREE.Vector3(0, distance * .58, distance * .84);
      controls.minDistance = 12; controls.maxDistance = Math.max(200, distance * 2);
    } else {
      distance = Math.max(compareWidth / 2 / (tangent * camera.aspect * availableX * .9), 5.3 / (tangent * availableY * .8));
      position = new THREE.Vector3(0, distance * .07, distance);
      controls.minDistance = 10; controls.maxDistance = distance * 2.5;
    }
    fly.flyTo(position, new THREE.Vector3(), duration);
  }
  function updateLayers() {
    detailWorlds.forEach((world, id) => {
      world.root.visible = mode === 'detail' && id === selectedId;
      world.model.axis.visible = axisOn && defs.get(id).kind === 'planet';
      if (world.model.clouds) world.model.clouds.visible = cloudsOn;
      world.satellites.visible = satellitesOn;
    });
    orbitGroup.visible = mode === 'orbits'; compareGroup.visible = mode === 'compare';
    key.visible = mode !== 'orbits'; key.castShadow = mode === 'detail';
    solarLight.visible = mode === 'orbits';
    if (mode === 'orbits') lightPosition.set(0, 0, 0);
    else lightPosition.copy(key.position).multiplyScalar(mode === 'compare' ? 1000 : 1);
    $('axisBtn').hidden = mode !== 'detail' || defs.get(selectedId).kind !== 'planet';
    $('cloudBtn').hidden = mode !== 'detail' || selectedId !== 'earth';
    $('satelliteBtn').hidden = mode !== 'detail' || !moonDefs.some((moon) => moon.parent === selectedId);
    $('axisBtn').textContent = `自转轴 · ${axisOn ? `${defs.get(selectedId).tilt || 0}°` : '关'}`;
    $('cloudBtn').textContent = `云层 · ${cloudsOn ? '开' : '关'}`;
    $('satelliteBtn').textContent = `卫星 · ${satellitesOn ? '开' : '关'}`;
    for (const [id, state] of [['axisBtn', axisOn], ['cloudBtn', cloudsOn], ['satelliteBtn', satellitesOn]]) $(id).setAttribute('aria-pressed', String(state));
  }
  function updateStage() {
    const def = defs.get(selectedId), meta = PLANETS[selectedId];
    $('stageIndex').textContent = mode === 'detail' ? meta ? `${String(meta.order).padStart(2, '0')} / 08 · ${selectedId === 'earth' ? '我们的家' : meta.category}` : def.kind === 'star' ? '太阳系的中心 · 恒星' : `围绕${defs.get(def.parent).name}运行 · 天然卫星` : mode === 'compare' ? '同一把尺子 · 同一套直径比例' : '从太阳出发 · 向外探索';
    $('stageTitle').textContent = mode === 'detail' ? meta?.en || (selectedId === 'sun' ? 'THE SUN' : selectedId.toUpperCase()) : mode === 'compare' ? '行星到底有多大？' : '八颗行星，各有轨道';
    $('stageSubtitle').textContent = mode === 'detail' ? meta?.subtitle || def.desc[0] : mode === 'compare' ? '八大行星按相同的直径比例呈现，太阳不参与本组对比。' : '越靠近太阳，公转通常越快。点击任意行星，靠近看。';
    $('viewNote').textContent = mode === 'compare' ? '行星直径按比例 · 星环宽度不计入直径 · 间距为示意' : mode === 'orbits' ? '轨道与天体大小已压缩 · 圆轨道为教学示意 · 不是实时星历' : selectedId === 'earth' ? '地月距离、轴线与运动速度为教学示意' : meta ? '表面地图为拼接与调色图 · 运动速度为教学示意' : selectedId === 'sun' ? '太阳表面为拼接示意图 · 自转速度已加快' : '卫星表面与运动为教学示意';
  }
  function setMode(next, duration = .8) {
    mode = next; document.body.dataset.mode = next;
    if (next === 'detail') getWorld(selectedId);
    sync('#modeSeg button', 'mode', mode);
    updateLayers(); updateStage(); frameView(duration);
  }
  function stat(label, value, unit = '') {
    const cell = document.createElement('div'); cell.className = 'ss-stat';
    const title = document.createElement('span'); title.textContent = label;
    const strong = document.createElement('strong'); strong.textContent = value;
    const small = document.createElement('small'); small.textContent = unit;
    strong.appendChild(small); cell.append(title, strong); $('statGrid').appendChild(cell);
  }
  function spinText(hours) {
    if (hours >= 48) return { value: (hours / 24).toFixed(1), unit: '天' };
    return { value: hours.toFixed(1), unit: '小时' };
  }
  function updateAge() {
    $('earthAge').textContent = age;
    const meta = PLANETS[selectedId];
    $('ageBlock').hidden = !meta;
    if (!meta) return;
    const years = age * 365.256 / meta.year;
    $('planetAge').replaceChildren(document.createTextNode(`在${defs.get(selectedId).name}上，你已经过了 `));
    const value = document.createElement('b'); value.textContent = years.toFixed(years < 1 ? 2 : 1);
    $('planetAge').append(value, document.createTextNode(' 个当地年。生日的间隔，和公转周期有关哦。'));
  }
  function updateDossier() {
    const def = defs.get(selectedId), meta = PLANETS[selectedId];
    $('dossierKind').textContent = meta?.category || (def.kind === 'star' ? '恒星' : '天然卫星');
    $('dossierName').replaceChildren(document.createTextNode(def.name.split(' · ')[0]));
    const en = document.createElement('small'); en.textContent = meta?.en || selectedId.toUpperCase(); $('dossierName').appendChild(en);
    $('statGrid').replaceChildren();
    if (meta) {
      const spin = spinText(meta.spinHours);
      stat('赤道直径', numberText(meta.diameter), 'km');
      stat('自转一圈', spin.value, spin.unit);
      stat('绕太阳一圈', yearText(meta.year));
      stat('平均距太阳', meta.au.toFixed(meta.au < 2 ? 3 : 2), 'AU');
      stat('直径 / 地球', (meta.diameter / EARTH_DIAMETER).toFixed(2), '倍');
      stat('平均参考温度', meta.temperature);
    } else {
      for (const entry of infoOf(def).stats.slice(0, 6)) stat(entry.label, entry.value);
    }
    $('featureTitle').textContent = meta?.title || (selectedId === 'sun' ? '它的光，照亮了整个太阳系' : def.desc[0]);
    $('featureText').textContent = meta?.feature || (selectedId === 'sun' ? '太阳通过核聚变释放能量。表面看起来像沸腾的海洋，内部的温度比表面还要高得多。' : def.desc.slice(1).join('。') + '。');
    const distance = meta ? meta.au * AU_KM : def.distKm;
    $('lightLabel').textContent = meta ? '一束阳光，到这里需要' : selectedId === 'sun' ? '一束阳光，到地球需要' : `光从${defs.get(def.parent).name}到这里需要`;
    $('lightTime').textContent = fmtLightTime(distance || AU_KM);
    $('distanceDetail').textContent = meta ? `${(distance / 1e8).toFixed(2)} 亿 km · ${fmtLy(distance)}` : def.distText || '1 AU = 地球与太阳的平均距离';
    const moons = moonDefs.filter((moon) => moon.parent === selectedId);
    $('moonHeading').textContent = def.kind === 'moon' ? '回到母星' : '身边的小伙伴 · 代表卫星';
    $('moonList').replaceChildren();
    const targets = def.kind === 'moon' ? [defs.get(def.parent)] : moons;
    for (const target of targets) {
      const button = document.createElement('button'); button.textContent = target.name.split(' · ')[0] + ' ↗';
      button.addEventListener('click', () => { stopTour(); choose(target.id); }); $('moonList').appendChild(button);
    }
    if (!targets.length) { const text = document.createElement('span'); text.textContent = def.kind === 'star' ? '八大行星都围绕太阳运行。' : '这颗行星没有天然卫星。'; $('moonList').appendChild(text); }
    $('moreFacts').replaceChildren();
    const facts = meta ? [...def.desc, `自转轴倾角 ${def.tilt}°。参考重力 ${meta.gravity} m/s²。`, selectedId === 'earth' ? '自转周期约 23 小时 56 分钟，日常说的一天约 24 小时。四季与地轴倾斜和公转共同有关。' : `公转周期约 ${yearText(meta.year)}，直径约为地球的 ${(meta.diameter / EARTH_DIAMETER).toFixed(2)} 倍。`] : def.desc;
    facts.forEach((text) => { const paragraph = document.createElement('p'); paragraph.textContent = text; $('moreFacts').appendChild(paragraph); });
    updateAge();
    sync('#planetList button', 'id', selectedId);
    sync('#comparisonGrid button', 'id', selectedId);
  }
  function choose(id, explain = true) {
    if (!defs.has(id)) return;
    selectedId = id;
    updateDossier();
    if (mode === 'compare' && PLANETS[id]) { updateStage(); }
    else setMode('detail');
    if (explain) speak();
  }
  function speak() {
    const def = defs.get(selectedId);
    voice.speak(def.say, def.id);
  }
  function buildNavigation() {
    for (const def of BODIES.filter((body) => body.kind !== 'moon')) {
      const meta = PLANETS[def.id], button = document.createElement('button');
      button.className = 'ss-planet-item'; button.dataset.id = def.id;
      const number = document.createElement('small'); number.textContent = meta ? String(meta.order).padStart(2, '0') : '☉';
      const icon = document.createElement('i'); icon.className = 'ss-planet-icon'; icon.style.backgroundImage = `url('./textures/${def.id === 'earth' ? 'earth' : def.id}.jpg')`;
      const names = document.createElement('span'), name = document.createElement('strong'), en = document.createElement('small');
      name.textContent = def.name; en.textContent = meta?.en || 'THE SUN'; names.append(name, en); button.append(number, icon, names);
      button.addEventListener('click', () => { stopTour(); choose(def.id); }); $('planetList').appendChild(button);
    }
  }
  function updateComparison() {
    $('comparisonGrid').replaceChildren();
    $('metricNote').textContent = metric === 'diameter' ? '赤道直径 · km' : metric === 'year' ? '地球上的天 / 年' : '1 AU ≈ 1.496 亿 km';
    const values = planetDefs.map((def) => { const data = PLANETS[def.id]; return metric === 'diameter' ? data.diameter : metric === 'year' ? data.year : data.au; });
    const max = Math.max(...values);
    planetDefs.forEach((def, index) => {
      const data = PLANETS[def.id], button = document.createElement('button'); button.className = 'ss-compare-cell'; button.dataset.id = def.id;
      const name = document.createElement('span'); name.textContent = def.name;
      const value = document.createElement('strong'); value.textContent = metric === 'diameter' ? numberText(data.diameter) : metric === 'year' ? yearText(data.year) : `${data.au.toFixed(2)} AU`;
      const bar = document.createElement('div'); bar.className = 'ss-bar';
      const fill = document.createElement('i'); fill.style.width = `${values[index] / max * 100}%`; bar.appendChild(fill);
      button.append(name, value, bar); button.addEventListener('click', () => { stopTour(); choose(def.id); }); $('comparisonGrid').appendChild(button);
    });
    sync('#comparisonGrid button', 'id', selectedId);
  }
  function stopTour() {
    touring = false; $('tourBtn').textContent = '▷ 星球导览'; $('tourBtn').classList.remove('is-active'); $('tourBtn').setAttribute('aria-pressed', 'false');
  }
  $('modeSeg').addEventListener('click', (event) => { const button = event.target.closest('button'); if (button) { stopTour(); voice.stop(); setMode(button.dataset.mode); } });
  $('metricSeg').addEventListener('click', (event) => { const button = event.target.closest('button'); if (!button) return; metric = button.dataset.metric; sync('#metricSeg button', 'metric', metric); updateComparison(); });
  $('playBtn').addEventListener('click', () => { playing = !playing; $('playBtn').textContent = playing ? '⏸ 暂停运动' : '▶ 继续运动'; $('playBtn').setAttribute('aria-pressed', String(!playing)); });
  $('speedBtn').addEventListener('click', () => { const speeds = [1, 3, 10]; speed = speeds[(speeds.indexOf(speed) + 1) % speeds.length]; $('speedBtn').textContent = `演示速度 ×${speed}`; });
  $('topBtn').addEventListener('click', () => { stopTour(); frameView(); });
  $('speakBtn').addEventListener('click', speak);
  $('axisBtn').addEventListener('click', () => { axisOn = !axisOn; updateLayers(); });
  $('cloudBtn').addEventListener('click', () => { cloudsOn = !cloudsOn; updateLayers(); });
  $('satelliteBtn').addEventListener('click', () => { satellitesOn = !satellitesOn; updateLayers(); frameView(.5); });
  $('ageSlider').addEventListener('input', (event) => { age = Number(event.target.value); updateAge(); });
  $('mobileInfoBtn').addEventListener('click', () => { const open = document.body.classList.toggle('info-open'); $('mobileInfoBtn').textContent = open ? '收起档案 ×' : '星球档案'; $('mobileInfoBtn').setAttribute('aria-expanded', String(open)); });
  $('tourBtn').addEventListener('click', () => {
    if (touring) { stopTour(); voice.stop(); return; }
    touring = true; tourIndex = 0; tourElapsed = 0; mode = 'detail';
    $('tourBtn').textContent = '■ 停止导览'; $('tourBtn').classList.add('is-active'); $('tourBtn').setAttribute('aria-pressed', 'true');
    choose(TOUR[0]);
  });
  controls.addEventListener('start', () => { fly.cancel(); stopTour(); });

  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  let down = null;
  renderer.domElement.style.cursor = 'grab';
  renderer.domElement.addEventListener('pointerdown', (event) => { down = { id: event.pointerId, x: event.clientX, y: event.clientY }; });
  renderer.domElement.addEventListener('pointercancel', () => { down = null; });
  function visible(object) { for (let node = object; node; node = node.parent) if (!node.visible) return false; return true; }
  renderer.domElement.addEventListener('pointerup', (event) => {
    if (!down || event.pointerId !== down.id) return;
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y); down = null;
    if (moved > 6) return;
    const rect = renderer.domElement.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickables.filter(visible), false)[0];
    if (hit) { stopTour(); if (mode === 'compare') mode = 'detail'; choose(hit.object.userData.id); }
  });
  const labelPosition = new THREE.Vector3(); let labelTick = 0;
  function arrangeLabels() {
    if (++labelTick % 4) return;
    const rect = $('viewportFrame').getBoundingClientRect(), placed = [];
    labels.forEach((label) => {
      if (!visible(label)) return;
      label.getWorldPosition(labelPosition).project(camera);
      const x = (labelPosition.x * .5 + .5) * window.innerWidth, y = (-labelPosition.y * .5 + .5) * window.innerHeight;
      const inner = label.userData.inner;
      inner.classList.toggle('is-on', label.userData.id === selectedId);
      const out = labelPosition.z > 1 || x < rect.left || x > rect.right || y < rect.top || y > rect.bottom;
      label.element.style.opacity = out ? '0' : '1'; inner.style.pointerEvents = out ? 'none' : 'auto';
      let shift = 0;
      for (let i = 0; i < 5; i++) { if (!placed.some((p) => Math.abs(x - p.x) < 55 && Math.abs(y + shift - p.y) < 24)) break; shift -= 24; }
      inner.style.translate = `0 ${shift}px`; placed.push({ x, y: y + shift });
    });
  }
  function spin(model, dt) {
    const meta = PLANETS[model.def.id];
    const multiplier = meta ? PLANETS.earth.spinHours / meta.spinHours : model.def.id === 'sun' ? 1 / 25.4 : .04;
    // Obliquity already encodes Venus/Uranus retrograde rotation; don't invert twice.
    model.body.rotation.y += dt * .13 * multiplier;
    if (model.clouds) model.clouds.rotation.y = model.body.rotation.y + .08 + simulationTime * .004;
  }
  let simulationTime = 0;
  function animate() {
    const dt = Math.min(clock.getDelta(), .05), simulated = playing ? dt * speed : 0;
    simulationTime += simulated;
    if (mode === 'detail') {
      const world = getWorld(selectedId); spin(world.model, simulated);
      world.moons.forEach((moon) => {
        moon.angle += simulated * .035 * (moon.def.orbitSpeed || 1);
        moon.group.position.set(Math.cos(moon.angle) * moon.orbitRadius, 0, Math.sin(moon.angle) * moon.orbitRadius);
        moon.body.rotation.y = -moon.angle;
      });
    } else if (mode === 'orbits') {
      spin(orbitSun, simulated);
      orbitModels.forEach((model) => {
        model.angle += simulated * .045 * (365.256 / PLANETS[model.def.id].year);
        model.group.position.set(Math.cos(model.angle) * model.def.orbit, 0, Math.sin(model.angle) * model.def.orbit);
        spin(model, simulated);
      });
    } else compareModels.forEach((model) => spin(model, simulated));
    if (touring && playing) {
      tourElapsed += dt;
      if (tourElapsed > 18) { tourElapsed = 0; tourIndex++; if (tourIndex >= TOUR.length) { stopTour(); voice.stop(); } else choose(TOUR[tourIndex]); }
    }
    fly.update(dt); controls.update();
    // CSS2DRenderer r160 doesn't inherit Group.visible when drawing DOM labels.
    // Mirror ancestor visibility explicitly for axes and labels in inactive modes.
    scene.traverse((object) => {
      if (!object.isCSS2DObject) return;
      let shown = true;
      for (let parent = object.parent; parent; parent = parent.parent) if (!parent.visible) { shown = false; break; }
      object.visible = shown;
    });
    arrangeLabels();
    labelRenderer.render(scene, camera); composer.render(); requestAnimationFrame(animate);
  }
  buildNavigation(); updateComparison(); updateDossier(); setMode('detail', .01); animate();
  // LoadingManager finishes even when a texture fails; procedural/solid fallbacks stay usable.
  if (textureErrors) $('textureStatus').textContent = '部分纹理简化显示';
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight); composer.setSize(window.innerWidth, window.innerHeight); labelRenderer.setSize(window.innerWidth, window.innerHeight);
    frameView(.15);
  });
}
