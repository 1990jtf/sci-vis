import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { createDinosaurFactory } from './dinosaur-models.js';
import { createEnvironment } from './dinosaur-environment.js';

export function mountDinosaurExplorer({S, ERAS, SPECIES, LINES}) {
  const $=id=>document.getElementById(id), defs=new Map(SPECIES.map(d=>[d.id,d]));
  let selectedId='trex',mode='habitat',filter='all',playing=true,walking=false,labelsOn=true,childOn=false;
  let selectedPart=null,touring=false,tourElapsed=0,simTime=0,quizIndex=0,impactStep=0;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduced)playing=false;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x24372c);
  const camera=S.createCamera(40,.025,600);camera.position.set(6,5,22);
  const {renderer}=S.createRenderer({bloom:false,alpha:false,exposure:1.12});
  const ratio=Math.min(window.devicePixelRatio||1,window.innerWidth<=980?1.5:2);renderer.setPixelRatio(ratio);
  renderer.domElement.setAttribute('aria-label','恐龙三维模型，拖动旋转，双指或滚轮缩放');
  const controls=S.createControls(camera,renderer.domElement);controls.enablePan=false;controls.minDistance=.7;controls.maxDistance=100;
  controls.minPolarAngle=.15;controls.maxPolarAngle=Math.PI*.49;controls.dampingFactor=.07;
  const fly=S.makeFly(camera,controls),clock=new THREE.Clock();
  const voice=S.createVoice({audioBase:'../audio/dinosaur/'});S.bindVoiceButton($('voiceBtn'),voice);
  const labels=new CSS2DRenderer();labels.setSize(window.innerWidth,window.innerHeight);
  Object.assign(labels.domElement.style,{position:'absolute',inset:'0',pointerEvents:'none',zIndex:'5'});document.body.appendChild(labels.domElement);
  const hemi=new THREE.HemisphereLight(0xe0e7d5,0x64704c,2);scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xffe5b7,3.3);sun.position.set(-12,24,14);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-25,right:25,top:24,bottom:-24,near:.1,far:100});sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias=.035;sun.shadow.bias=-.0001;sun.shadow.radius=3;scene.add(sun,sun.target);
  const rim=new THREE.DirectionalLight(0xb6d8cc,1.2);rim.position.set(5,9,-14);scene.add(rim);
  const environment=createEnvironment({scene,S});
  const studio=new THREE.Group();scene.add(studio);
  const floor=new THREE.Mesh(new THREE.CircleGeometry(70,96),new THREE.MeshStandardMaterial({color:0x35483a,roughness:.98}));floor.rotation.x=-Math.PI/2;floor.position.y=-.05;floor.receiveShadow=true;studio.add(floor);
  const grid=new THREE.GridHelper(100,100,0x83906e,0x5e715c);grid.material.transparent=true;grid.material.opacity=.22;grid.position.y=-.035;studio.add(grid);
  const factory=createDinosaurFactory(),models=new Map(),pickables=[];
  SPECIES.forEach(def=>{
    const model=factory.create(def);models.set(def.id,model);model.root.visible=false;scene.add(model.root);
    model.root.traverse(o=>{if(o.isMesh){o.userData.species=def.id;pickables.push(o);}});
    model.markers=[];
    def.hotspots.forEach(([part,title],index)=>{
      const button=document.createElement('button');button.className='de-hotspot';button.setAttribute('aria-label',`${def.name}：${title}`);
      const badge=document.createElement('i');badge.textContent=index+1;
      const span=document.createElement('span');span.textContent=title;button.append(badge,span);
      button.addEventListener('click',event=>{event.stopPropagation();stopTour();observePart(part);});
      const marker=new CSS2DObject(button);marker.position.copy(model.hotspots[part]);model.root.add(marker);
      model.markers.push({marker,button,part});
    });
    const tag=document.createElement('span');tag.className='de-model-label';tag.textContent=`${def.name} · ${def.length} m${def.flying?' 翼展':''}`;
    const label=new CSS2DObject(tag);label.position.set(0,-.35,0);model.root.add(label);model.compareLabel=label;
  });
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;
  const shadowCtx=shadowCanvas.getContext('2d'),gradient=shadowCtx.createRadialGradient(64,64,0,64,64,64);
  gradient.addColorStop(0,'rgba(12,22,12,.34)');gradient.addColorStop(.5,'rgba(12,22,12,.17)');gradient.addColorStop(1,'rgba(12,22,12,0)');shadowCtx.fillStyle=gradient;shadowCtx.fillRect(0,0,128,128);
  const contactShadow=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));
  contactShadow.rotation.x=-Math.PI/2;contactShadow.position.y=.008;scene.add(contactShadow);
  const child=new THREE.Group(),person=new THREE.Group();child.add(person);scene.add(child);
  const humanMat=new THREE.MeshStandardMaterial({color:0xd8c693,roughness:.8});
  function humanPiece(geo,pos){const mesh=new THREE.Mesh(geo,humanMat);mesh.position.set(...pos);mesh.castShadow=true;person.add(mesh);return mesh;}
  humanPiece(new THREE.SphereGeometry(.088,20,12),[0,1.112,0]);
  humanPiece(new THREE.CapsuleGeometry(.085,.29,5,12),[0,.82,0]);
  for(const sign of [-1,1]){
    humanPiece(new THREE.CapsuleGeometry(.042,.43,4,10),[sign*.06,.29,0]);
    const arm=humanPiece(new THREE.CapsuleGeometry(.03,.3,4,10),[sign*.13,.78,0]);arm.rotation.z=sign*.14;
    humanPiece(new THREE.SphereGeometry(.045,12,8),[sign*.06,.04,.035]).scale.z=1.7;
  }
  const childTag=document.createElement('span');childTag.className='de-model-label';
  const childLabel=new CSS2DObject(childTag);childLabel.position.set(0,1.42,0);child.add(childLabel);
  const rulerMaterial=new THREE.LineBasicMaterial({color:0xd0c496,transparent:true,opacity:.7});
  const ruler=new THREE.Group();scene.add(ruler);
  function buildRuler(length){
    while(ruler.children.length){const line=ruler.children[0];ruler.remove(line);line.geometry.dispose();}
    const points=[new THREE.Vector3(-length/2,.035,2),new THREE.Vector3(length/2,.035,2)];
    for(let i=0;i<=Math.ceil(length);i++){const x=Math.min(i,length)-length/2;points.push(new THREE.Vector3(x,.035,1.87),new THREE.Vector3(x,.035,2.13));}
    ruler.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),rulerMaterial));
  }
  const meteor=new THREE.Group();scene.add(meteor);meteor.visible=false;
  const rock=new THREE.Mesh(new THREE.IcosahedronGeometry(.7,2),new THREE.MeshStandardMaterial({color:0x8a6850,emissive:0xc57832,emissiveIntensity:.8}));meteor.add(rock);
  const trail=new THREE.Mesh(new THREE.ConeGeometry(.65,6,20),new THREE.MeshBasicMaterial({color:0xe2ae6b,transparent:true,opacity:.5}));trail.rotation.z=-.7;trail.position.set(-2,2.2,0);meteor.add(trail);meteor.position.set(-22,26,-60);

  const speciesIcons={
    theropod:'M2 24 28 17 40 14 48 8 61 8 66 13 63 18 52 18 48 21 49 27 44 27 42 23 37 23 34 35 40 37 29 37 29 28 24 24 10 26Z',
    horned:'M3 25 21 18 33 16 43 18 44 9 48 15 54 9 53 18 64 15 60 23 66 26 58 30 51 27 48 37 42 37 42 28 29 29 27 38 20 38 21 27 12 28Z',
    armoured:'M2 27 14 23 20 18 23 13 28 17 34 12 38 17 45 14 49 21 59 23 65 28 62 31 51 30 49 37 43 37 42 30 28 30 26 37 20 37 19 29 7 31Z',
    plated:'M2 29 14 24 17 17 22 20 23 10 29 16 33 7 38 15 45 12 45 23 58 25 65 30 60 32 50 29 48 37 42 37 41 29 29 30 26 38 20 38 21 30 10 30Z',
    flying:'M1 10 24 17 33 21 38 14 50 11 42 20 64 8 54 21 40 27 36 36 31 37 30 28 17 23Z'
  };
  function renderList(){
    $('speciesList').replaceChildren();const shown=SPECIES.filter(d=>filter==='all'||d.era===filter);
    $('speciesCount').textContent=`${shown.length} 个观察对象`;
    shown.forEach(d=>{
      const button=document.createElement('button');button.className=`de-species${d.id===selectedId?' is-on':''}`;button.dataset.species=d.id;button.setAttribute('aria-pressed',String(d.id===selectedId));
      const icon=d.flying?'flying':d.id==='stegosaurus'?'plated':d.id==='ankylosaurus'?'armoured':d.id==='triceratops'?'horned':'theropod';
      button.innerHTML=`<svg viewBox="0 0 68 44" aria-hidden="true"><path d="${speciesIcons[icon]}"/></svg><span><strong>${d.name}</strong><small>${ERAS.find(e=>e.id===d.era).name} · ${d.flying?'翼龙近亲':d.diet}</small></span>`;
      button.addEventListener('click',()=>{stopTour();choose(d.id);});$('speciesList').appendChild(button);
    });
  }
  ERAS.forEach(era=>{
    const button=document.createElement('button');button.className='de-era';button.dataset.period=era.id;button.style.flex=String(era.start-era.end);
    button.innerHTML=`<strong>${era.name}</strong><small>${era.latin}</small><p>${era.tagline}</p>`;
    button.addEventListener('click',()=>{stopTour();setFilter(era.id);});$('eraTrack').appendChild(button);
  });
  function syncEra(){
    const era=ERAS.find(e=>e.id===defs.get(selectedId).era);
    document.querySelectorAll('[data-period]').forEach(b=>{const active=b.dataset.period===era.id;b.classList.toggle('is-on',active);b.setAttribute('aria-pressed',String(active));});
    $('eraYears').textContent=era.years;$('eraFact').textContent=era.fact;
  }
  function setFilter(value){
    filter=value;document.querySelectorAll('[data-era]').forEach(b=>{const on=b.dataset.era===filter;b.classList.toggle('is-on',on);b.setAttribute('aria-pressed',String(on));});
    if(filter!=='all'&&defs.get(selectedId).era!==filter)choose(SPECIES.find(d=>d.era===filter).id);
    else renderList();
  }
  const classification={trex:'兽脚类',carnotaurus:'兽脚类',coelophysis:'兽脚类',triceratops:'角龙类',ankylosaurus:'甲龙类',stegosaurus:'剑龙类'};
  function fillDossier(){
    const d=defs.get(selectedId);$('infoName').textContent=d.name;$('infoLatin').textContent=d.latin;
    $('classification').textContent=d.flying?'翼龙 · 恐龙的近亲':`${classification[d.id]} · ${d.diet}`;
    const stats=[[d.flying?'翼展（参照）':'体长（参照）',`${d.length} m`],['体重估算',d.mass],['生活年代',d.age],['化石发现地',d.region],['食性',d.diet],['主要姿态',d.flying?'翼膜飞行':d.hip?`双足 · 臀高 ${d.hip}`:['carnotaurus','coelophysis'].includes(d.id)?'双足行走':'四足行走']];
    $('statGrid').innerHTML=stats.map(([key,value])=>`<div class="de-stat"><span>${key}</span><strong>${value}</strong></div>`).join('');
    $('featureTitle').textContent=d.feature;$('featureBody').textContent=d.body;
    $('partsList').replaceChildren();
    d.hotspots.forEach(([part,title],index)=>{
      const button=document.createElement('button');button.textContent=`${index+1} · ${title}`;button.dataset.part=part;
      button.addEventListener('click',()=>{stopTour();observePart(part);});$('partsList').appendChild(button);
    });
    const url=d.source==='pterosaur'?'https://www.amnh.org/explore/news-blogs/what-is-a-pterosaur':`https://www.nhm.ac.uk/discover/dino-directory/${d.source}.html`;
    $('speciesSource').href=url;$('speciesSource').textContent=d.source==='pterosaur'?'美国自然历史博物馆 · 翼龙资料 ↗':'自然历史博物馆 · 物种资料 ↗';
    $('observationText').textContent='点选模型上的标记，看看身体结构有什么用。';updateChild();
  }
  function updateChild(){
    const h=Number($('childHeight').value),d=defs.get(selectedId),count=d.length/(h/100);
    $('heightOutput').textContent=h;person.scale.setScalar(h/120);childLabel.position.y=h/100+.21;childTag.textContent=`身高 ${h} cm`;
    $('childFact').innerHTML=`它的${d.flying?'翼展':'体长'}，相当于约 <b>${count.toFixed(1)}</b> 个你的身高首尾相接。${d.flying?'比较的是张开双翼的宽度。':'这里比的是长度，不是恐龙的高度。'}`;
  }
  function updateScene(){
    const d=defs.get(selectedId),selected=models.get(selectedId);
    scene.background.set(mode==='habitat'?0xbac8b1:0x24372c);
    environment.root.visible=mode==='habitat';studio.visible=mode!=='habitat';
    environment.setEra(d.era);environment.setDust(impactStep);
    if(mode!=='habitat')scene.fog=null;
    else if(!scene.fog)scene.fog=new THREE.Fog(impactStep>=2?0xa7afa1:d.era==='tri'?0xd8d0b5:0xc8d4c3,45,155);
    hemi.intensity=impactStep>=2?1.25:mode==='habitat'?2:1.8;sun.intensity=impactStep>=2?1.6:mode==='habitat'?3.3:3.1;
    models.forEach(model=>{model.root.visible=false;model.root.position.set(0,0,0);model.root.rotation.y=0;model.compareLabel.visible=false;});
    selected.root.visible=true;
    if(d.flying)selected.root.position.y=mode==='habitat'?.9:.4;
    child.visible=childOn||mode==='compare';ruler.visible=mode==='compare'||childOn;
    child.position.set(d.flying?d.length*.6+1:d.length*.5+1.1,0,1.1);
    contactShadow.visible=!d.flying;contactShadow.scale.set(d.length*.72,Math.max(1.6,d.length*.3),1);
    if(mode==='compare'){
      const referenceId=selectedId==='trex'||d.flying?'coelophysis':'trex';
      const reference=models.get(referenceId),refDef=defs.get(referenceId);
      selected.root.position.x=-refDef.length/2-1.3;reference.root.position.x=d.length/2+1.3;reference.root.visible=true;
      selected.compareLabel.visible=reference.compareLabel.visible=true;
      child.position.set(-(d.length+refDef.length)/2-3.4,0,0);contactShadow.visible=false;
      buildRuler(d.length+refDef.length+5.8);
    }else buildRuler(d.length);
    models.forEach(model=>model.markers.forEach(({marker})=>{marker.visible=labelsOn&&model===selected&&mode!=='compare';}));
    $('labelsBtn').disabled=mode==='compare';$('labelsBtn').setAttribute('aria-pressed',String(labelsOn));
    $('childBtn').setAttribute('aria-pressed',String(childOn||mode==='compare'));
    $('childBtn').disabled=mode==='compare';
    $('walkBtn').textContent=d.flying?'振翼观察':'足步观察';
    $('stageKicker').textContent=mode==='compare'?'SAME SCALE / 1 GRID = 1 METRE':`${ERAS.find(e=>e.id===d.era).latin} / ${d.flying?'PTEROSAUR':'DINOSAUR'}`;
    $('stageName').textContent=mode==='compare'?'谁比谁大？':d.name;
    $('stageSubtitle').textContent=mode==='compare'?'同一把尺，不同年代。1 格 = 1 米。':mode==='detail'?'转动模型，找一找身体结构与生存方式的联系。':d.feature;
    $('eraBadge').textContent=ERAS.find(e=>e.id===d.era).name+(d.era==='cre'?'晚期':'晚期');
    $('sceneRegion').textContent=mode==='compare'?'同尺展示，不代表共同生活':`${d.region} · ${d.flying?'水岸环境示意':'河岸林地示意'}`;
    document.body.dataset.mode=mode;
  }
  function frameView(duration=.7){
    const rect=$('viewportFrame').getBoundingClientRect(),w=window.innerWidth,h=window.innerHeight;
    const centerX=rect.left+rect.width*.5,centerY=rect.top+rect.height*.58;
    camera.setViewOffset(w,h,w/2-centerX,h/2-centerY,w,h);
    const selected=models.get(selectedId),d=defs.get(selectedId),target=new THREE.Vector3(0,selected.height*.48+selected.root.position.y,0);
    const tan=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),availableX=rect.width/w,availableY=rect.height/h;
    let width=d.flying?d.length*1.22:d.length*1.07,height=selected.height*1.5;
    if(mode==='compare'){
      const referenceId=selectedId==='trex'||d.flying?'coelophysis':'trex';
      width=d.length+defs.get(referenceId).length+8;
      height=Math.max(selected.height,models.get(referenceId).height,Number($('childHeight').value)/100)*1.5;
      target.set(-1,height*.32,0);
    }else if(childOn){width+=4;target.x=1.1;}
    const distance=Math.max(width/(2*tan*camera.aspect*availableX),height/(2*tan*availableY));
    const direction=mode==='compare'?new THREE.Vector3(0,.12,1):d.flying?new THREE.Vector3(.8,.75,1):new THREE.Vector3(.53,.19,1);
    fly.flyTo(target.clone().add(direction.normalize().multiplyScalar(distance)),target,reduced?.01:duration);
    controls.minDistance=d.flying?.5:1.4;controls.maxDistance=Math.max(45,distance*1.5);
  }
  function choose(id,{speak=false}={}){
    voice.stop();selectedId=id;selectedPart=null;walking=false;$('walkBtn').setAttribute('aria-pressed','false');
    resetImpact();
    if(filter!=='all'&&defs.get(id).era!==filter){filter='all';document.querySelectorAll('[data-era]').forEach(b=>{const on=b.dataset.era==='all';b.classList.toggle('is-on',on);b.setAttribute('aria-pressed',String(on));});}
    models.forEach(model=>model.markers.forEach(({button})=>button.classList.remove('is-on')));
    renderList();fillDossier();$('dossier').scrollTop=0;syncEra();updateScene();frameView();
    if(speak)voice.speak(defs.get(id).say,id);
  }
  function observePart(part){
    if(mode==='compare'){mode='detail';syncModes();updateScene();}
    const d=defs.get(selectedId),model=models.get(selectedId),entry=d.hotspots.find(p=>p[0]===part);
    const same=selectedPart===part;selectedPart=same?null:part;
    document.querySelectorAll('[data-part]').forEach(b=>{const on=b.dataset.part===selectedPart;b.classList.toggle('is-on',on);b.setAttribute('aria-pressed',String(on));});
    model.markers.forEach(({button,part:key})=>button.classList.toggle('is-on',key===selectedPart));
    $('observationText').textContent=same?'点选模型上的标记，看看身体结构有什么用。':entry[2];
    $('stageSubtitle').textContent=same?d.feature:entry[2];
    if(same){frameView();return;}
    const target=model.hotspots[part].clone().add(model.root.position);
    if(part==='head')target.y-=d.flying?.025:model.height*.1;
    const rect=$('viewportFrame').getBoundingClientRect(),tan=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
    const size=d.flying?.55:part==='tail'?d.length*.35:d.length*.26;
    const distance=Math.max(size/(2*tan*(rect.width/window.innerWidth)*camera.aspect),size/(2*tan*(rect.height/window.innerHeight)));
    fly.flyTo(target.clone().add(new THREE.Vector3(.24,.12,1).normalize().multiplyScalar(distance)),target,reduced?.01:.7);
  }
  function syncModes(){document.querySelectorAll('.de-modes [data-mode]').forEach(b=>{const on=b.dataset.mode===mode;b.classList.toggle('is-on',on);b.setAttribute('aria-pressed',String(on));});}
  document.querySelectorAll('.de-modes [data-mode]').forEach(b=>b.addEventListener('click',()=>{stopTour();mode=b.dataset.mode;selectedPart=null;resetImpact();syncModes();fillDossier();updateScene();frameView();}));
  document.querySelectorAll('[data-era]').forEach(b=>b.addEventListener('click',()=>{stopTour();setFilter(b.dataset.era);}));
  $('labelsBtn').addEventListener('click',()=>{labelsOn=!labelsOn;updateScene();});
  $('childBtn').addEventListener('click',()=>{childOn=!childOn;if(mode==='compare'&&!childOn)childOn=true;updateScene();frameView();});
  $('childHeight').addEventListener('input',()=>{updateChild();if(!child.visible){childOn=true;updateScene();frameView();}});
  $('speakBtn').addEventListener('click',()=>voice.speak(defs.get(selectedId).say,selectedId));
  $('eraSpeakBtn').addEventListener('click',()=>{const era=ERAS.find(e=>e.id===defs.get(selectedId).era);voice.speak(era.say,era.id);});
  function syncPlaying(){$('playBtn').textContent=playing?'Ⅱ 暂停动作':'▷ 继续动作';$('playBtn').setAttribute('aria-pressed',String(!playing));}
  $('playBtn').addEventListener('click',()=>{playing=!playing;syncPlaying();});
  $('walkBtn').addEventListener('click',()=>{walking=!walking;$('walkBtn').setAttribute('aria-pressed',String(walking));if(walking){playing=true;syncPlaying();$('observationText').textContent=defs.get(selectedId).flying?'振翼动作帮助观察膜翼的展开方式。动作是教学示意。':'观察双足和四足的区别。这里展示的是原地步态示意，不代表已经测得的真实速度。';}});
  $('resetBtn').addEventListener('click',()=>{selectedPart=null;fillDossier();models.get(selectedId).markers.forEach(({button})=>button.classList.remove('is-on'));updateScene();frameView();});
  function stopTour(){touring=false;tourElapsed=0;$('tourBtn').textContent='▷ 自动导览';$('tourBtn').setAttribute('aria-pressed','false');}
  $('tourBtn').addEventListener('click',()=>{if(touring){stopTour();voice.stop();return;}touring=true;tourElapsed=0;playing=true;syncPlaying();$('tourBtn').textContent='■ 停止导览';$('tourBtn').setAttribute('aria-pressed','true');voice.speak(defs.get(selectedId).say,selectedId);});
  function toggleInfo(open){document.body.classList.toggle('info-open',open);$('mobileInfoBtn').setAttribute('aria-expanded',String(open));}
  $('mobileInfoBtn').addEventListener('click',()=>toggleInfo(!document.body.classList.contains('info-open')));
  $('closeInfoBtn').addEventListener('click',()=>toggleInfo(false));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){toggleInfo(false);resetImpact();}});

  const quizzes=[
    {q:'霸王龙能在野外遇见剑龙吗？',options:['能，它们都是恐龙','不能，生活年代相隔很远'],answer:1,feedback:'它们相隔数千万年！恐龙生活了很长时间，并非都活在同一个时代。'},
    {q:'翼手龙属于哪一类？',options:['恐龙','翼龙，是恐龙的近亲'],answer:1,feedback:'翼龙和恐龙是近亲。翼龙的膜翼主要由伸长的第四指支撑。'},
    {q:'哪一条信息最能直接从化石里找到证据？',options:['骨头和牙齿的形状','每只恐龙的准确皮肤颜色'],answer:0,feedback:'骨头、牙齿、足迹和某些皮肤印痕可以保存。许多动物的颜色与行为仍需要推测。'}
  ];
  function renderQuiz(){
    const q=quizzes[quizIndex];$('quizPrompt').textContent=q.q;$('quizCount').textContent=`0${quizIndex+1} / 03`;$('quizFeedback').textContent='';$('quizOptions').replaceChildren();
    q.options.forEach((text,index)=>{
      const button=document.createElement('button');button.textContent=text;
      button.addEventListener('click',()=>{Array.from($('quizOptions').children).forEach((b,i)=>{b.classList.toggle('is-correct',i===q.answer);b.classList.toggle('is-wrong',i===index&&index!==q.answer);});$('quizFeedback').textContent=(index===q.answer?'观察得很好。':'再看一条线索：')+q.feedback;});
      $('quizOptions').appendChild(button);
    });
  }
  $('nextQuizBtn').addEventListener('click',()=>{quizIndex=(quizIndex+1)%quizzes.length;renderQuiz();});renderQuiz();
  const impactTitles=['① 撞击','② 遮光','③ 食物链','④ 幸存者'];
  const impactText=[
    '约 6600 万年前，一颗直径约 10 公里的小行星撞击地球，地点在今天墨西哥的尤卡坦半岛附近。画面中的远处天体仅用于示意，距离与大小不按比例。',
    '撞击抛出的尘埃与其他物质进入大气，遮挡阳光。植物得到的光减少，地球环境发生剧烈变化。画面只是轻微变暗，变化实际上经历了复杂的过程。',
    '植物受影响，依靠植物的动物和捕食它们的动物也受到冲击。环境剧变和食物链变化，帮助解释了为什么大灭绝影响那么广。',
    '这场大灭绝中约四分之三的物种消失，包括所有非鸟恐龙。但是鸟类这一支幸存并继续演化。今天的一只麻雀，就是活着的恐龙！'
  ];
  impactTitles.forEach((title,index)=>{const button=document.createElement('button');button.textContent=title;button.addEventListener('click',()=>setImpact(index+1));$('impactSteps').appendChild(button);});
  function setImpact(step){
    impactStep=step;meteor.visible=step===1;environment.setDust(step);sun.intensity=step>=2?1.6:3.3;hemi.intensity=step>=2?1.25:2;
    Array.from($('impactSteps').children).forEach((b,i)=>{b.classList.toggle('is-on',i===step-1);b.setAttribute('aria-pressed',String(i===step-1));});$('impactText').textContent=impactText[step-1];
  }
  function resetImpact(){impactStep=0;meteor.visible=false;$('impactPanel').hidden=true;environment.setDust(0);sun.intensity=mode==='habitat'?3.3:3.1;hemi.intensity=mode==='habitat'?2:1.8;}
  $('impactBtn').addEventListener('click',()=>{stopTour();toggleInfo(false);mode='habitat';syncModes();if(defs.get(selectedId).era!=='cre')choose('trex');updateScene();frameView();$('impactPanel').hidden=false;setImpact(1);});
  $('closeImpactBtn').addEventListener('click',resetImpact);$('resetImpactBtn').addEventListener('click',()=>{voice.stop();resetImpact();});
  $('impactSpeakBtn').addEventListener('click',()=>voice.speak(LINES.impact.say,'impact'));

  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let down=null;
  renderer.domElement.addEventListener('pointerdown',event=>{down={x:event.clientX,y:event.clientY};});
  renderer.domElement.addEventListener('pointercancel',()=>{down=null;});
  renderer.domElement.addEventListener('pointerup',event=>{
    if(!down||Math.hypot(event.clientX-down.x,event.clientY-down.y)>6){down=null;return;}down=null;
    pointer.set(event.clientX/window.innerWidth*2-1,-event.clientY/window.innerHeight*2+1);ray.setFromCamera(pointer,camera);
    const visible=pickables.filter(o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;});
    const hit=ray.intersectObjects(visible,false)[0];if(hit){stopTour();if(hit.object.userData.species!==selectedId)choose(hit.object.userData.species);else voice.speak(defs.get(selectedId).say,selectedId);}
  });
  controls.addEventListener('start',()=>{fly.cancel();stopTour();});
  window.addEventListener('resize',()=>{camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();renderer.setSize(window.innerWidth,window.innerHeight);labels.setSize(window.innerWidth,window.innerHeight);frameView(.25);});
  const resizeObserver=new ResizeObserver(()=>frameView(.25));resizeObserver.observe($('viewportFrame'));
  choose('trex');syncModes();syncPlaying();
  $('loader').classList.add('is-done');
  function animate(){
    requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05),simulation=playing?dt:0;simTime+=simulation;
    models.forEach(model=>{if(model.root.visible)model.update(simTime,walking&&model===models.get(selectedId));});
    environment.update(simTime);
    if(touring&&playing){tourElapsed+=dt;if(tourElapsed>=(defs.get(selectedId).audioSeconds||35)+2){tourElapsed=0;const index=SPECIES.findIndex(d=>d.id===selectedId);choose(SPECIES[(index+1)%SPECIES.length].id,{speak:true});}}
    fly.update(dt);controls.update();
    // CSS2DRenderer does not inherit Group.visible for DOM labels.
    models.forEach(model=>{
      model.markers.forEach(({marker})=>{marker.visible=model.root.visible&&labelsOn&&mode!=='compare';});
      model.compareLabel.visible=model.root.visible&&mode==='compare';
    });
    childLabel.visible=child.visible;
    renderer.render(scene,camera);labels.render(scene,camera);
  }
  animate();
}
