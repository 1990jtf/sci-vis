import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createWeatherWorld } from './weather-models.js';
import { PROCESSES, PLACES, OVERVIEW, WEATHER, JOURNEY, QUIZZES } from './weather-data.js';

export function mountWeatherExplorer(THREE, S) {
  const $ = id => document.getElementById(id), V = (x,y,z) => new THREE.Vector3(x,y,z);
  const viewport=$('viewport'),scene=new THREE.Scene();
  const sceneColor=new THREE.Color(0xe2edeb);scene.background=sceneColor;
  let renderer;
  try {renderer=S.createRenderer({bloom:false,exposure:1.12,alpha:false}).renderer;}
  catch(error){$('loader').innerHTML='<p class="wx-load-error">三维场景需要开启浏览器硬件加速。请使用支持 WebGL 的浏览器重新打开。</p>';console.error(error);return;}
  viewport.appendChild(renderer.domElement);renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.7));
  renderer.domElement.setAttribute('aria-label','山川、森林、河湖和海洋的三维水循环模型');
  const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment(),environment=pmrem.fromScene(room,.04);
  scene.environment=environment.texture;pmrem.dispose();room.dispose();
  const camera=S.createCamera(36,.1,400),controls=S.createControls(camera,renderer.domElement,V(0,8,0));
  controls.minDistance=20;controls.maxDistance=170;controls.maxPolarAngle=Math.PI*.48;controls.minPolarAngle=.15;controls.enablePan=true;
  const fly=S.makeFly(camera,controls);
  const ambient=new THREE.HemisphereLight(0xeaf5ef,0x7e8e72,1.65);scene.add(ambient);
  const sunlight=new THREE.DirectionalLight(0xffedcb,3.1);sunlight.position.set(-26,48,28);sunlight.castShadow=true;
  sunlight.shadow.mapSize.set(2048,2048);Object.assign(sunlight.shadow.camera,{left:-42,right:42,top:42,bottom:-42,near:1,far:140});sunlight.shadow.normalBias=.06;sunlight.shadow.bias=-.00015;sunlight.shadow.radius=3;scene.add(sunlight);
  const fill=new THREE.DirectionalLight(0xdbece9,.6);fill.position.set(30,20,-20);scene.add(fill);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(600,600),new THREE.ShadowMaterial({opacity:.13}));floor.rotation.x=-Math.PI/2;floor.position.y=-8.6;floor.receiveShadow=true;scene.add(floor);
  // A soft contact shadow anchors the miniature without a glowing outline.
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;
  const shadowContext=shadowCanvas.getContext('2d'),gradient=shadowContext.createRadialGradient(64,64,15,64,64,64);gradient.addColorStop(0,'rgba(38,68,57,.20)');gradient.addColorStop(1,'rgba(38,68,57,0)');shadowContext.fillStyle=gradient;shadowContext.fillRect(0,0,128,128);
  const contact=new THREE.Mesh(new THREE.PlaneGeometry(90,75),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));contact.rotation.x=-Math.PI/2;contact.position.y=-8.56;scene.add(contact);
  const world=createWeatherWorld(scene,renderer,S);
  const labelRenderer=new CSS2DRenderer();labelRenderer.domElement.className='wx-label-layer';viewport.appendChild(labelRenderer.domElement);
  const definitions=[...PROCESSES,...PLACES],byId=Object.fromEntries(definitions.map(d=>[d.id,d]));
  const labels=world.labels.map(def=>{
    const el=document.createElement('div'),button=document.createElement('button');
    button.className='wx-label'+(def.minor?' is-minor':'');button.style.setProperty('--label-color',byId[def.key]?.color||'#4b9e94');
    button.innerHTML='<i></i><span>'+def.text+'</span>'+(def.detail?'<small>'+def.detail+'</small>':'')+'<span class="wx-label-stem"></span>';
    button.setAttribute('aria-label','了解'+def.text.replace(/^\d+ /,''));button.addEventListener('pointerdown',e=>e.stopPropagation());button.addEventListener('click',()=>focusKey(def.key));el.appendChild(button);
    const object=new CSS2DObject(el);object.position.copy(def.pos);scene.add(object);return {...def,object,el,button};
  });
  const voice=S.createVoice({audioBase:'../audio/weather/'});voice.toggle();
  // The local neural voice pack is generated from the same definitions as the cards.
  let selected='overview',currentView='overview',weatherKey='clear',section=false,flow=true,labelsOn=true,playing=!matchMedia('(prefers-reduced-motion: reduce)').matches;
  let sunshine=.75,tour=false,tourStep=0,tourElapsed=0,elapsed=0,quizIndex=0,quizAnswered=false;
  const currentWeather={...WEATHER.clear};
  function syncVoice(){const enabled=voice.isEnabled();$('voiceBtn').setAttribute('aria-pressed',String(enabled));$('voiceBtn').innerHTML='♪ <span>讲解'+(enabled?'开':'关')+'</span>';}
  $('voiceBtn').addEventListener('click',()=>{voice.toggle();syncVoice();const def=byId[selected]||OVERVIEW;if(voice.isEnabled())voice.speak(def.say,def.id);});
  $('speakBtn').addEventListener('click',()=>{if(!voice.isEnabled())voice.toggle();syncVoice();const def=byId[selected]||OVERVIEW;voice.speak(def.say,def.id);});
  function showInfo(def,speak=false){
    $('dossierState').textContent=def.state;$('dossierEn').textContent=def.en;$('dossierName').textContent=def.name;$('dossierName').style.color=def.color;
    $('dossierHeadline').textContent=def.headline;$('dossierDesc').textContent=def.desc;$('observation').textContent=def.observe;$('fact').textContent=def.fact;
    $('statGrid').replaceChildren(...def.stats.map(([label,value])=>{const d=document.createElement('div'),s=document.createElement('span'),b=document.createElement('b');s.textContent=label;b.textContent=value;d.append(s,b);return d;}));
    if(speak&&voice.isEnabled())voice.speak(def.say,def.id);
  }
  let lastGroup='';
  PROCESSES.forEach((def,i)=>{
    if(lastGroup!==def.group){const p=document.createElement('div');p.className='wx-process-group';p.textContent=def.group;$('stageList').appendChild(p);lastGroup=def.group;}
    const b=document.createElement('button');b.className='wx-process';b.dataset.key=def.id;b.style.setProperty('--process-color',def.color);b.setAttribute('aria-pressed','false');
    b.innerHTML='<span class="wx-process-index">'+String(i+1).padStart(2,'0')+'</span><span><strong>'+def.name+'</strong><small>'+def.short+'</small></span><span class="wx-process-arrow">›</span>';
    b.addEventListener('click',()=>focusKey(def.id));$('stageList').appendChild(b);
  });
  JOURNEY.forEach((key,i)=>{const b=document.createElement('button');b.dataset.journey=key;b.setAttribute('aria-pressed','false');b.innerHTML='<span>'+String(i+1).padStart(2,'0')+'</span>'+byId[key].name;b.addEventListener('click',()=>{tourStep=i;tourElapsed=0;focusKey(key);});$('journeySteps').appendChild(b);});

  function viewPosition(key){
    const aspect=viewport.clientWidth/viewport.clientHeight;
    const wide=aspect>1.6;
    const distance=Math.max(1,1.28/aspect);
    const views={overview:{pos:V(64,47,73),target:V(0,7.5,0)},mountain:{pos:V(30,30,43),target:V(-10,8,-5)},coast:{pos:V(40,24,48),target:V(6,2,8)},underground:{pos:V(36,13,58),target:V(0,-.1,15)}};
    const v=views[key]||views.overview;
    let scale=distance;
    if(key==='overview')scale*=wide?.93:.95;
    return {pos:v.pos.clone().sub(v.target).multiplyScalar(scale).add(v.target),target:v.target};
  }
  function setView(key,instant=false){
    currentView=key;
    document.querySelectorAll('[data-view]').forEach(b=>{const on=b.dataset.view===key;b.classList.toggle('is-on',on);b.setAttribute('aria-pressed',String(on));});
    const v=viewPosition(key);if(instant){fly.cancel();camera.position.copy(v.pos);controls.target.copy(v.target);camera.lookAt(v.target);}else fly.flyTo(v.pos,v.target,.95);
  }
  const focusView={evap:'coast',transp:'mountain',cond:'overview',precip:'mountain',runoff:'coast',infil:'underground',collect:'coast',peak:'mountain',forest:'mountain',lake:'coast',ocean:'coast',cloud:'overview',sun:'overview'};
  function focusKey(key,{move=true,fromTour=false}={}){
    const def=byId[key];if(!def)return;
    if(tour&&!fromTour)stopTour();
    selected=key;showInfo(def,true);world.select(key);
    document.querySelectorAll('[data-key]').forEach(b=>{const on=b.dataset.key===key;b.classList.toggle('is-on',on);b.setAttribute('aria-pressed',String(on));});
    document.querySelectorAll('[data-journey]').forEach(b=>{const on=b.dataset.journey===key;b.classList.toggle('is-on',on);b.setAttribute('aria-pressed',String(on));});
    labels.forEach(l=>{l.button.classList.toggle('is-on',l.key===key);l.button.classList.toggle('is-dim',!l.minor&&l.key!==key);l.button.setAttribute('aria-pressed',String(l.key===key));});
    if(key==='infil')setSection(true);
    if(move)setView(focusView[key]);
    $('sceneCaption').textContent=def.name+' · '+def.state;
    if(viewport.clientWidth<500){const b=document.querySelector('[data-key="'+key+'"]');if(b)b.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});}
  }
  function setSection(on){section=on;world.setSection(on);$('sectionBtn').setAttribute('aria-pressed',String(on));$('sectionBtn').innerHTML='地下剖面 <span>'+(on?'开':'关')+'</span>';$('sectionKey').hidden=!on;}
  $('sectionBtn').addEventListener('click',()=>{setSection(!section);if(section){setView('underground');focusKey('infil',{move:false});}else if(currentView==='underground')setView('overview');});
  $('flowBtn').addEventListener('click',()=>{flow=!flow;world.setFlow(flow);$('flowBtn').setAttribute('aria-pressed',String(flow));$('flowBtn').innerHTML='流向 <span>'+(flow?'开':'关')+'</span>';});
  $('labelBtn').addEventListener('click',()=>{labelsOn=!labelsOn;$('labelBtn').setAttribute('aria-pressed',String(labelsOn));$('labelBtn').innerHTML='标注 <span>'+(labelsOn?'开':'关')+'</span>';});
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{stopTour();setView(b.dataset.view);if(b.dataset.view==='underground'){setSection(true);focusKey('infil',{move:false});}}));
  function setWeather(key){
    weatherKey=key;const w=WEATHER[key];
    document.querySelectorAll('[data-weather]').forEach(b=>{const on=b.dataset.weather===key;b.classList.toggle('is-on',on);b.setAttribute('aria-pressed',String(on));});
    $('weatherNote').textContent=w.note;$('cloudReading').textContent=w.cloudText;$('rainReading').textContent=w.rainText;$('flowReading').textContent=w.flowText;
    // Weather remains inspectable when animation is paused.
    if(!playing){Object.assign(currentWeather,w);world.setConditions(currentWeather,sunshine);world.update(elapsed,0);}
  }
  document.querySelectorAll('[data-weather]').forEach(b=>b.addEventListener('click',()=>setWeather(b.dataset.weather)));
  $('sunSlider').addEventListener('input',()=>{sunshine=Number($('sunSlider').value)/100;$('sunValue').textContent=Math.round(sunshine*100)+'%';world.setConditions(currentWeather,sunshine);});
  function syncPlaying(){$('playBtn').textContent=playing?'Ⅱ':'▷';$('playBtn').setAttribute('aria-label',playing?'暂停动画':'继续动画');$('playBtn').setAttribute('aria-pressed',String(!playing));}
  $('playBtn').addEventListener('click',()=>{playing=!playing;syncPlaying();});
  function stopTour(){tour=false;$('tourBtn').textContent='▷ 开始旅行';$('tourBtn').setAttribute('aria-pressed','false');}
  function goTourStep(){const key=JOURNEY[tourStep];focusKey(key,{fromTour:true});if(key==='precip')setWeather('rain');$('tourBtn').textContent='Ⅱ 旅行 '+(tourStep+1)+' / '+JOURNEY.length;}
  $('tourBtn').addEventListener('click',()=>{
    if(tour){stopTour();return;}tour=true;tourStep=0;tourElapsed=0;playing=true;syncPlaying();$('tourBtn').setAttribute('aria-pressed','true');goTourStep();
  });
  $('resetBtn').addEventListener('click',()=>{
    stopTour();voice.stop();selected='overview';showInfo(OVERVIEW);world.select(null);setSection(false);flow=true;world.setFlow(true);labelsOn=true;
    $('flowBtn').setAttribute('aria-pressed','true');$('flowBtn').innerHTML='流向 <span>开</span>';$('labelBtn').setAttribute('aria-pressed','true');$('labelBtn').innerHTML='标注 <span>开</span>';
    document.querySelectorAll('[data-key],[data-journey]').forEach(b=>{b.classList.remove('is-on');b.setAttribute('aria-pressed','false');});labels.forEach(l=>{l.button.classList.remove('is-on','is-dim');l.button.setAttribute('aria-pressed','false');});
    $('sunSlider').value='75';sunshine=.75;$('sunValue').textContent='75%';setWeather('clear');setView('overview');$('sceneCaption').textContent='拖动旋转 · 滚轮 / 双指缩放 · 点标注探索';
  });
  $('mobileInfoBtn').addEventListener('click',()=>{const on=$('dossier').classList.toggle('is-open');$('mobileInfoBtn').setAttribute('aria-expanded',String(on));if(on)$('dossier').scrollIntoView({block:'start',behavior:'smooth'});});

  // A pointer gesture must be a tap/click, not the end of an orbit drag.
  const raycaster=new THREE.Raycaster(),ndc=new THREE.Vector2();let pointerStart=null;
  function hit(e){const r=renderer.domElement.getBoundingClientRect();ndc.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(ndc,camera);return raycaster.intersectObjects(world.picks,false)[0]?.object.userData.key;}
  renderer.domElement.addEventListener('pointerdown',e=>{pointerStart={x:e.clientX,y:e.clientY};fly.cancel();stopTour();});
  renderer.domElement.addEventListener('pointerup',e=>{if(pointerStart&&Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)<5){const key=hit(e);if(key)focusKey(key);}pointerStart=null;});
  renderer.domElement.addEventListener('pointercancel',()=>pointerStart=null);
  renderer.domElement.addEventListener('pointermove',e=>{if(!e.buttons)renderer.domElement.style.cursor=hit(e)?'pointer':'grab';});

  // Small, accessible quiz with feedback; answers never change the scene until chosen.
  function renderQuiz(){
    quizAnswered=false;const q=QUIZZES[quizIndex];$('quizProgress').textContent='小小观察家 · '+(quizIndex+1)+' / '+QUIZZES.length;$('quizQuestion').textContent=q.question;$('quizFeedback').textContent='先猜一猜，再到模型里找证据。';$('quizNext').hidden=true;
    $('quizOptions').replaceChildren(...q.options.map((text,i)=>{const b=document.createElement('button');b.textContent=String.fromCharCode(65+i)+'  '+text;b.addEventListener('click',()=>{
      if(quizAnswered)return;quizAnswered=true;
      [...$('quizOptions').children].forEach((option,j)=>{option.disabled=true;option.classList.toggle('is-correct',j===q.answer);option.classList.toggle('is-wrong',j===i&&i!==q.answer);});
      $('quizFeedback').textContent=(i===q.answer?'答对了！':'再记住这个发现：')+q.explanation;$('quizNext').hidden=false;$('quizNext').textContent=quizIndex===QUIZZES.length-1?'完成探索 ✓':'下一题 →';focusKey(q.key);
    });return b;}));
  }
  function closeQuiz(){$('quizPanel').hidden=true;$('quizBtn').setAttribute('aria-expanded','false');$('quizBtn').focus();}
  $('quizBtn').addEventListener('click',()=>{const open=$('quizPanel').hidden;$('quizPanel').hidden=!open;$('quizBtn').setAttribute('aria-expanded',String(open));if(open){quizIndex=0;renderQuiz();$('quizClose').focus();}});
  $('quizClose').addEventListener('click',closeQuiz);$('quizNext').addEventListener('click',()=>{if(quizIndex===QUIZZES.length-1){closeQuiz();S.toast('完成了！再找一条水的旅行路线吧。');}else{quizIndex++;renderQuiz();$('quizOptions').firstElementChild.focus();}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('quizPanel').hidden)closeQuiz();});

  // Labels are projected to the stage, then culled rather than piled up in the corner.
  const projected=V(0,0,0);let frame=0;
  function layoutLabels(){
    const w=viewport.clientWidth,h=viewport.clientHeight,narrow=w<550;
    const placed=[];
    const sorted=[...labels].sort((a,b)=>(a.key===selected?-4:a.minor?2:0)-(b.key===selected?-4:b.minor?2:0));
    for(const l of sorted){
      let visible=labelsOn&&(!l.section||section)&&(!narrow||!l.minor);
      projected.copy(l.object.position).project(camera);const x=(projected.x*.5+.5)*w,y=(-projected.y*.5+.5)*h;
      const bw=l.button.offsetWidth||92,bh=27,box={left:x-bw/2,right:x+bw/2,top:y-bh/2,bottom:y+bh/2};
      if(projected.z>1||projected.z< -1||box.left<5||box.right>w-5||box.top<25||box.bottom>h-53)visible=false;
      if(x<325&&box.top<153)visible=false;
      if(section&&x<210&&y>h-235)visible=false;
      if(visible&&placed.some(p=>!(box.right+6<p.left||box.left-6>p.right||box.bottom+7<p.top||box.top-7>p.bottom)))visible=false;
      l.object.visible=visible;l.el.style.visibility=visible?'visible':'hidden';if(visible)placed.push(box);
    }
  }
  function resize(){
    const w=viewport.clientWidth,h=viewport.clientHeight;camera.aspect=w/h;camera.clearViewOffset();camera.setViewOffset(w,h,0,h*(w<550?-.025:.11),w,h);camera.updateProjectionMatrix();renderer.setSize(w,h);labelRenderer.setSize(w,h);
    setView(currentView,true);
  }
  const observer=new ResizeObserver(resize);observer.observe(viewport);
  const clock=new THREE.Clock();
  function animate(){
    const dt=Math.min(clock.getDelta(),.05),target=WEATHER[weatherKey];
    for(const k of ['rain','cloud','gloom'])currentWeather[k]=THREE.MathUtils.lerp(currentWeather[k],target[k],Math.min(dt*2.2,1));
    if(playing){elapsed+=dt;if(tour){tourElapsed+=dt;if(tourElapsed>(voice.isEnabled()?30:11)){tourElapsed=0;tourStep++;if(tourStep>=JOURNEY.length){stopTour();S.toast('水回到海洋，还会开始下一次旅行。');}else goTourStep();}}}
    world.setConditions(currentWeather,sunshine);world.update(elapsed,playing?dt:0);
    sunlight.intensity=(1.1+sunshine*1.5)*(1-currentWeather.gloom*.65);ambient.intensity=.85-currentWeather.gloom*.2;
    sceneColor.set(0xe2edeb).lerp(new THREE.Color(0xb8cbcc),currentWeather.gloom*.52);renderer.toneMappingExposure=1.03+sunshine*.10-currentWeather.gloom*.08;
    fly.update(dt);controls.update();if(frame++%3===0)layoutLabels();renderer.render(scene,camera);labelRenderer.render(scene,camera);requestAnimationFrame(animate);
  }
  showInfo(OVERVIEW);setWeather('clear');syncVoice();syncPlaying();resize();world.update(0,0);$('loader').classList.add('is-done');animate();
  window.addEventListener('pagehide',()=>{voice.stop();observer.disconnect();});
}
