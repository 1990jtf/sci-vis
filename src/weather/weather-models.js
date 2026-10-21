import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Original, deterministic teaching diorama. All geometry and textures are local.
export function createWeatherWorld(scene, renderer, S) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const clamp = THREE.MathUtils.clamp, mix = THREE.MathUtils.lerp;
  let seed = 20721;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const range = (a, b) => mix(a, b, random());
  const root = new THREE.Group(); scene.add(root);
  const picks = [], cloudGroups = [], surfaceMaterials = [], waterMaterials = [], flowGroups = [], rippleData = [];
  const X = 26, Z = 20, bottom = -7.2;
  const lake = { x: -1.5, z: 2.9, rx: 3.7, rz: 2.65, y: 2.45 };
  const riverXZ = [V(-9,0,-5.5), V(-7.3,0,-2.5), V(-5,0,-1), V(-3.1,0,1), V(-1.5,0,2.9), V(1.2,0,5.3), V(3.2,0,7.8), V(6.5,0,9.3), V(8.6,0,11.5), V(12.8,0,12.8), V(18,0,12.5)];
  const riverPlan = new THREE.CatmullRomCurve3(riverXZ, false, 'catmullrom', .4);
  const bed = riverPlan.getPoints(260);
  bed.forEach((p, i) => {
    const t = i / (bed.length - 1);
    p.y = t < .3 ? mix(5.1, lake.y, t / .3) : t < .49 ? lake.y : mix(lake.y, .09, clamp((t - .49) / .43, 0, 1));
  });
  function riverInfo(x, z) {
    let distance = Infinity, h = 0, t = 0;
    for (let i = 0; i < bed.length; i += 2) {
      const p = bed[i], d = (p.x-x)**2+(p.z-z)**2;
      if (d < distance) { distance = d; h = p.y; t = i/(bed.length-1); }
    }
    return { d: Math.sqrt(distance), h, t };
  }
  function coast(z) { return 13.6 + Math.sin(z*.2)*2.1 + Math.sin(z*.49+.8)*.8; }
  function rawHeight(x, z) {
    const coastal = clamp((coast(z)-x)/5.1, 0, 1);
    const peak = (cx, cz, rx, rz, h) => h * Math.pow(Math.max(0, 1-Math.hypot((x-cx)/rx,(z-cz)/rz)), 1.28);
    let mountain = Math.max(peak(-11,-9.5,12,10,14.8),peak(-18,-11,8,9,10.5),peak(-3.5,-12.3,8,8,10.3));
    const ridges = Math.abs(S.fbm2(x*.41+14,z*.41-7,4)-.47)*4.8;
    mountain *= .87 + ridges * .27;
    const rough = (S.fbm2(x*.28+6,z*.28-2,4)-.44)*1.5;
    const hills = 1.05*Math.sin(x*.13+z*.1)+.35*Math.cos(z*.27);
    return (2.3+mountain+rough+hills*.5)*coastal - (1-coastal)*1.5;
  }
  function heightAt(x, z, info = riverInfo(x,z)) {
    let h = rawHeight(x,z);
    const w = mix(.48,1.13,info.t);
    const influence = 1 - THREE.MathUtils.smoothstep(info.d,w*.8,w+1.15);
    h = mix(h, Math.min(h,info.h-.24),influence);
    const dl = Math.hypot((x-lake.x)/lake.rx,(z-lake.z)/lake.rz);
    const basin = 1-THREE.MathUtils.smoothstep(dl,.8,1.2);
    h = mix(h, Math.min(h,lake.y-.55),basin);
    return h;
  }
  function grainTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const ctx = c.getContext('2d'), image = ctx.createImageData(256,256);
    for (let y=0;y<256;y++) for(let x=0;x<256;x++) {
      const v=175+(S.fbm2(x/22,y/22,3)-.4)*100+(S.hash3(x,y,3)-.5)*55;
      const i=(y*256+x)*4; image.data[i]=v;image.data[i+1]=v;image.data[i+2]=v;image.data[i+3]=255;
    }
    ctx.putImageData(image,0,0);
    const t = new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(9,7);
    t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return t;
  }
  const grain=grainTexture();
  const terrainGeo=new THREE.PlaneGeometry(X*2,Z*2,200,160);terrainGeo.rotateX(-Math.PI/2);
  const positions=terrainGeo.attributes.position, colors=[];
  const palette=Object.fromEntries(Object.entries({sand:0xd1c59a,grass:0x7d985d,moss:0x4d7550,rock:0x858b83,dark:0x66726d,snow:0xe6eeeb,sea:0x5c9b9c}).map(([k,v])=>[k,new THREE.Color(v)]));
  for(let i=0;i<positions.count;i++) positions.setY(i,heightAt(positions.getX(i),positions.getZ(i)));
  terrainGeo.computeVertexNormals();
  for(let i=0;i<positions.count;i++) {
    const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i), ny=terrainGeo.attributes.normal.getY(i);
    const n=S.fbm2(x*.65+11,z*.65+7,3), slope=1-ny;
    let c=palette.grass.clone().lerp(palette.moss,clamp(n*.65+slope*.55,0,1));
    if(y<1.3)c.lerp(palette.sand,1-THREE.MathUtils.smoothstep(y,.35,1.3));
    if(y<0)c.lerp(palette.sea,clamp(-y/1.5,0,1));
    c.lerp(palette.rock,clamp((y-4.5)/3.4,0,1)*.85+clamp(slope-.16,0,.4)*.3);
    const snowLine=10.5+(n-.4)*3.5;
    if(y>snowLine)c.lerp(palette.snow,clamp((y-snowLine)*1.4,0,1)*clamp((ny-.18)*2.9,0,1));
    c.multiplyScalar(.93+n*.16);colors.push(c.r,c.g,c.b);
  }
  terrainGeo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const terrainMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.97,bumpMap:grain,bumpScale:.11});
  const terrain=new THREE.Mesh(terrainGeo,terrainMat);terrain.castShadow=true;terrain.receiveShadow=true;root.add(terrain);surfaceMaterials.push(terrainMat);

  // Four geological walls continue the terrain exactly to a solid base.
  const wallPos=[],wallCol=[],wallIdx=[];
  function sectionColor(y,x,z,top) {
    const n=S.fbm2(x*.4+7,z*.4+y*.5,3), wobble=Math.sin(x*.31+z*.12)*.25;
    let c;
    if(y>top-.75)c=new THREE.Color(0x77715b);
    else if(y>-.8+wobble)c=new THREE.Color(0xab9274);
    else if(y>-4.4+wobble)c=new THREE.Color(0xb1a488).lerp(new THREE.Color(0x739da0),.31);
    else c=new THREE.Color(0x727c77);
    c.multiplyScalar(.87+n*.24+(Math.sin(y*12+x*.8+z)*.5+.5)*.045); return c;
  }
  function side(ax,az,bx,bz) {
    const steps=150,rows=28,start=wallPos.length/3;
    for(let i=0;i<=steps;i++) {
      const x=mix(ax,bx,i/steps),z=mix(az,bz,i/steps),top=heightAt(x,z);
      for(let j=0;j<=rows;j++) {
        const y=mix(bottom,top,j/rows),c=sectionColor(y,x,z,top);
        wallPos.push(x,y,z);wallCol.push(c.r,c.g,c.b);
        if(i<steps&&j<rows){const a=start+i*(rows+1)+j,b=a+rows+1;wallIdx.push(a,b,a+1,b,b+1,a+1);}
      }
    }
  }
  side(-X,Z,X,Z);side(X,Z,X,-Z);side(X,-Z,-X,-Z);side(-X,-Z,-X,Z);
  const wallGeo=new THREE.BufferGeometry();wallGeo.setAttribute('position',new THREE.Float32BufferAttribute(wallPos,3));wallGeo.setAttribute('color',new THREE.Float32BufferAttribute(wallCol,3));wallGeo.setIndex(wallIdx);wallGeo.computeVertexNormals();
  const wallMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94,side:THREE.DoubleSide});
  const walls=new THREE.Mesh(wallGeo,wallMat);walls.receiveShadow=true;root.add(walls);
  const foundation=new THREE.Mesh(new THREE.BoxGeometry(X*2,.6,Z*2),new THREE.MeshStandardMaterial({color:0x657a72,roughness:.85}));foundation.position.y=bottom-.3;foundation.receiveShadow=true;root.add(foundation);

  // Water has shallow/deep colour, analytic wave normals and restrained highlights.
  function waterMaterial(isSea=false) {
    const m=new THREE.MeshStandardMaterial({color:isSea?0x509eab:0x3e9f9d,roughness:.29,metalness:.08,transparent:true,opacity:isSea?.92:.96,side:THREE.DoubleSide});
    m.onBeforeCompile=shader=>{
      shader.uniforms.uWaterTime={value:0};shader.uniforms.uRain={value:0};
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWaterWorld;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvWaterWorld=(modelMatrix*vec4(transformed,1.)).xyz;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vWaterWorld;uniform float uWaterTime;uniform float uRain;').replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
        float wx=sin(vWaterWorld.x*2.5+vWaterWorld.z*.9+uWaterTime*1.3);
        float wz=cos(vWaterWorld.z*3.2+vWaterWorld.x*.65-uWaterTime*1.6);
        normal=normalize(normal+vec3(wx*.075,wz*.045,wx*.04));
      `).replace('#include <color_fragment>',`#include <color_fragment>
        float ripple=sin(vWaterWorld.x*3.+vWaterWorld.z*1.7-uWaterTime*2.)*sin(vWaterWorld.z*2.-uWaterTime);
        diffuseColor.rgb+=vec3(.12,.19,.15)*pow(max(0.,ripple),10.)*.4;
        ${isSea?'float shore=13.6+sin(vWaterWorld.z*.2)*2.1+sin(vWaterWorld.z*.49+.8)*.8;diffuseColor.rgb=mix(vec3(.36,.68,.62),diffuseColor.rgb,smoothstep(shore-.8,shore+6.,vWaterWorld.x));':''}
      `);
      m.userData.shader=shader;
    };
    m.customProgramCacheKey=()=>isSea?'weather-sea':'weather-inland';waterMaterials.push(m);return m;
  }
  const seaMat=waterMaterial(true),seaGeo=new THREE.PlaneGeometry(52,40,1,1);seaGeo.rotateX(-Math.PI/2);
  const sea=new THREE.Mesh(seaGeo,seaMat);sea.position.y=.02;sea.receiveShadow=true;root.add(sea);
  // Transparent vertical sea faces make the coastal block read as a cutaway.
  const seaFaceMat=new THREE.MeshStandardMaterial({color:0x4d98a6,roughness:.46,transparent:true,opacity:.66,side:THREE.DoubleSide});
  const seaFront=new THREE.Mesh(new THREE.PlaneGeometry(X-coast(Z),1.5),seaFaceMat);seaFront.position.set((X+coast(Z))/2,-.74,Z+.015);root.add(seaFront);
  const seaRight=new THREE.Mesh(new THREE.PlaneGeometry(Z*2,1.5),seaFaceMat);seaRight.rotation.y=Math.PI/2;seaRight.position.set(X+.015,-.74,0);root.add(seaRight);
  const inlandMat=waterMaterial();
  const lakeShape=new THREE.Shape();
  for(let i=0;i<=100;i++) {const a=i/100*Math.PI*2,r=1+Math.sin(a*3)*.055+Math.sin(a*7)*.025;const x=Math.cos(a)*lake.rx*r,z=Math.sin(a)*lake.rz*r;if(!i)lakeShape.moveTo(x,z);else lakeShape.lineTo(x,z);}
  const lakeGeo=new THREE.ShapeGeometry(lakeShape,48);lakeGeo.rotateX(Math.PI/2);
  const lakeMesh=new THREE.Mesh(lakeGeo,inlandMat);lakeMesh.position.set(lake.x,lake.y,lake.z);lakeMesh.receiveShadow=true;root.add(lakeMesh);
  function ribbon(points,widthFn,mat) {
    const pos=[],uv=[],idx=[];
    points.forEach((p,i)=>{
      const next=points[Math.min(i+1,points.length-1)],prev=points[Math.max(0,i-1)];
      const d=next.clone().sub(prev).setY(0).normalize(),n=V(-d.z,0,d.x),w=widthFn(i/(points.length-1));
      pos.push(p.x+n.x*w,p.y,p.z+n.z*w,p.x-n.x*w,p.y,p.z-n.z*w);uv.push(0,i/(points.length-1),1,i/(points.length-1));
      if(i<points.length-1){const a=i*2;idx.push(a,a+2,a+1,a+1,a+2,a+3);}
    });
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return new THREE.Mesh(g,mat);
  }
  const river=ribbon(bed,t=>mix(.32,.86,t),inlandMat);river.receiveShadow=true;root.add(river);
  const foamMat=new THREE.MeshBasicMaterial({color:0xe1eee1,transparent:true,opacity:.5,depthWrite:false});
  const foamGeo=new THREE.SphereGeometry(1,7,4),foam=new THREE.InstancedMesh(foamGeo,foamMat,110),dummy=new THREE.Object3D();root.add(foam);
  const riverCurve=new THREE.CatmullRomCurve3(bed);

  // Vegetation uses shared detailed meshes and instancing, including real branches.
  function transformed(geo,x,y,z,sx=1,sy=1,sz=1,ry=0) {const g=geo.clone();g.scale(sx,sy,sz);g.rotateY(ry);g.translate(x,y,z);return g;}
  function merged(geos) {const flat=geos.map(g=>g.index?g.toNonIndexed():g);const g=mergeGeometries(flat);new Set([...geos,...flat]).forEach(x=>x.dispose());return g;}
  const branchGeo=new THREE.CylinderGeometry(.025,.07,1,6),leafGeo=new THREE.IcosahedronGeometry(1,1);
  const pineParts=[],pineBranches=[];
  for(let tier=0;tier<6;tier++) {
    const y=.65+tier*.35,r=.79-tier*.095;
    for(let k=0;k<7;k++) {
      const a=k/7*Math.PI*2+tier*.4;
      const g=transformed(leafGeo,Math.cos(a)*r*.38,y,Math.sin(a)*r*.38,r*.85,.22,r*.33,-a);
      pineParts.push(g);
      const b=branchGeo.clone();b.rotateZ(Math.PI*.43);b.scale(r*.9,r*.9,r*.9);b.rotateY(-a);b.translate(Math.cos(a)*r*.35,y-.08,Math.sin(a)*r*.35);pineBranches.push(b);
    }
  }
  pineParts.push(transformed(new THREE.ConeGeometry(.2,.7,9),0,2.75,0));
  const pineGeo=merged(pineParts),pineBranchGeo=merged(pineBranches);
  const broadParts=[];
  for(let i=0;i<12;i++){const a=i*2.4,r=i<8?.6:.28;broadParts.push(transformed(leafGeo,Math.cos(a)*r,1.85+range(-.25,.55),Math.sin(a)*r,range(.45,.68),range(.5,.85),range(.45,.65),a));}
  const broadGeo=merged(broadParts),trunkGeo=new THREE.CylinderGeometry(.055,.12,2.05,8);trunkGeo.translate(0,.9,0);
  const foliageMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.94});
  const barkMat=new THREE.MeshStandardMaterial({color:0x71644e,roughness:1,bumpMap:grain,bumpScale:.08});
  const treeData=[];let attempts=0;
  while(treeData.length<235&&attempts++<10000) {
    const x=range(-24,12),z=range(-18,18),info=riverInfo(x,z),h=heightAt(x,z,info);
    if(h<1.8||h>8.5||info.d<1.4||Math.hypot((x-lake.x)/lake.rx,(z-lake.z)/lake.rz)<1.3)continue;
    const slope=Math.abs(heightAt(x+.5,z)-h)+Math.abs(heightAt(x,z+.5)-h);if(slope>1.05)continue;
    if(S.fbm2(x*.18+2,z*.18-1,3)<.36&&random()>.2)continue;
    if(treeData.some(t=>Math.hypot(t.x-x,t.z-z)<.85))continue;
    treeData.push({x,y:h,z,s:range(.48,1.12),rot:range(0,Math.PI*2),pine:h>4||random()>.37});
  }
  const trees=new THREE.Group();root.add(trees);surfaceMaterials.push(foliageMat,barkMat);
  const pines=treeData.filter(t=>t.pine),broads=treeData.filter(t=>!t.pine);
  function instances(geo,mat,items,coloured=false) {
    const mesh=new THREE.InstancedMesh(geo,mat,items.length);mesh.castShadow=true;mesh.receiveShadow=true;
      items.forEach((t,i)=>{dummy.position.set(t.x,t.y-.08,t.z);dummy.rotation.set(0,t.rot,0);dummy.scale.set(t.s,t.s*1.05,t.s);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);if(coloured)mesh.setColorAt(i,new THREE.Color().setHSL(t.pine?range(.27,.34):range(.21,.29),range(.24,.42),range(.28,.42),THREE.SRGBColorSpace));});
    mesh.instanceMatrix.needsUpdate=true;trees.add(mesh);return mesh;
  }
  instances(trunkGeo,barkMat,treeData);instances(pineGeo,foliageMat,pines,true);instances(pineBranchGeo,barkMat,pines);instances(broadGeo,foliageMat,broads,true);
  // Small boulders, river pebbles and meadow tufts make the terrain readable close up.
  const stoneGeo=new THREE.IcosahedronGeometry(1,1),stoneMat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,bumpMap:grain,bumpScale:.15});
  const rocks=[];
  for(let i=0;i<320;i++) {
    const x=range(-25,17),z=range(-19,19),h=heightAt(x,z),info=riverInfo(x,z);
    if(h<.6||Math.hypot((x-lake.x)/lake.rx,(z-lake.z)/lake.rz)<1.1||info.d<.9)continue;
    const s=range(.09,.28)*(h>6?1.8:1);rocks.push({x,y:h-.025,z,s,rot:range(0,6.28)});
  }
  const rockMesh=new THREE.InstancedMesh(stoneGeo,stoneMat,rocks.length);
  rocks.forEach((r,i)=>{dummy.position.set(r.x,r.y,r.z);dummy.rotation.set(range(-.4,.4),r.rot,range(-.3,.3));dummy.scale.set(r.s*1.5,r.s*.7,r.s);dummy.updateMatrix();rockMesh.setMatrixAt(i,dummy.matrix);rockMesh.setColorAt(i,new THREE.Color().setHSL(.12,.09,range(.34,.55),THREE.SRGBColorSpace));});
  rockMesh.castShadow=true;rockMesh.receiveShadow=true;root.add(rockMesh);surfaceMaterials.push(stoneMat);
  const tuftParts=[];
  for(let i=0;i<5;i++){const g=new THREE.ConeGeometry(.022,range(.2,.4),3);g.rotateZ(range(-.35,.35));g.translate(range(-.1,.1),.12,range(-.1,.1));tuftParts.push(g);}
  const tuftGeo=merged(tuftParts),tuftMat=new THREE.MeshStandardMaterial({color:0x89965b,roughness:1});
  const grass=[];for(let i=0;i<600;i++){const x=range(-25,13),z=range(-19,19),info=riverInfo(x,z),h=heightAt(x,z,info);if(h>1.2&&h<4.5&&info.d>1.1&&Math.hypot((x-lake.x)/lake.rx,(z-lake.z)/lake.rz)>1.15)grass.push({x,y:h,z,s:range(.7,1.3),rot:range(0,6.28)});}
  const tufts=new THREE.InstancedMesh(tuftGeo,tuftMat,grass.length);grass.forEach((t,i)=>{dummy.position.set(t.x,t.y,t.z);dummy.rotation.set(0,t.rot,0);dummy.scale.setScalar(t.s);dummy.updateMatrix();tufts.setMatrixAt(i,dummy.matrix);});root.add(tufts);surfaceMaterials.push(tuftMat);

  // Cross-section: solid grains with blue pore spaces, fine roots and direction lines.
  const underground=new THREE.Group();root.add(underground);underground.visible=false;
  const poreGeo=new THREE.SphereGeometry(1,6,4),poreMat=new THREE.MeshBasicMaterial({color:0x6fc2d0,transparent:true,opacity:.8,depthWrite:false});
  const pores=new THREE.InstancedMesh(poreGeo,poreMat,300);
  for(let i=0;i<300;i++){dummy.position.set(range(-24,14),range(-4.2,-1.15),Z+.065);dummy.rotation.set(0,0,0);dummy.scale.set(range(.055,.14),range(.04,.09),.035);dummy.updateMatrix();pores.setMatrixAt(i,dummy.matrix);}underground.add(pores);
  const sediment=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:0xc2af8d,roughness:1}),180);
  for(let i=0;i<180;i++){dummy.position.set(range(-24,13),range(-4.2,-1),Z+.025);dummy.scale.set(range(.16,.32),range(.12,.23),.04);dummy.updateMatrix();sediment.setMatrixAt(i,dummy.matrix);}underground.add(sediment);
  const rootLines=[];
  for(let k=0;k<17;k++) {
    const x=-23+k*1.95,top=heightAt(x,Z),depth=range(.8,1.9);
    for(let j=0;j<3;j++) {
      let a=V(x,top-.1,Z+.045);for(let n=1;n<5;n++){const b=V(x+(j-1)*n*.17+range(-.09,.09),top-n*depth/4,Z+.05);rootLines.push(a.x,a.y,a.z,b.x,b.y,b.z);a=b;}
    }
  }
  const rootGeo=new THREE.BufferGeometry();rootGeo.setAttribute('position',new THREE.Float32BufferAttribute(rootLines,3));underground.add(new THREE.LineSegments(rootGeo,new THREE.LineBasicMaterial({color:0x685748,transparent:true,opacity:.8})));
  const waterTablePts=[];for(let i=0;i<=80;i++)waterTablePts.push(V(mix(-25,17,i/80),-1.13-i/80*.35,Z+.11));
  const tableGeo=new THREE.BufferGeometry().setFromPoints(waterTablePts),table=new THREE.Line(tableGeo,new THREE.LineDashedMaterial({color:0x79c5c7,dashSize:.5,gapSize:.3,transparent:true,opacity:.9}));table.computeLineDistances();underground.add(table);

  // Clouds have a flat shaded underside and small, softly lit lobes, no emissive glow.
  function makeCloud(x,y,z,s,storm=false) {
    const g=new THREE.Group(),parts=[];
    for(let i=0;i<18;i++){
      const a=i*2.4,r=i<10?range(.5,2.5):range(.3,1.5),cy=i<10?range(-.2,.2):range(.4,1.3);
      const geo=new THREE.SphereGeometry(1,16,10),p=geo.attributes.position;
      for(let j=0;j<p.count;j++){const a=p.getX(j),b=p.getY(j),c=p.getZ(j),n=S.fbm2(a*3+i,b*3+c*2,2);p.setXYZ(j,a*(.94+n*.12),Math.max(-.67,b*(.9+n*.12)),c*(.94+n*.12));}
      geo.computeVertexNormals();parts.push(transformed(geo,Math.cos(a)*r*.85,cy,Math.sin(a)*r*.45,range(.9,1.5),range(.6,.95),range(.7,1.15)));
    }
    const mat=new THREE.MeshStandardMaterial({color:0xeff3ed,roughness:1,transparent:true,opacity:1,depthWrite:false});
    const mesh=new THREE.Mesh(merged(parts),mat);mesh.castShadow=false;g.add(mesh);g.position.set(x,y,z);g.scale.setScalar(s);root.add(g);cloudGroups.push({g,mat,x,y,z,s,storm});return g;
  }
  makeCloud(-11,24.5,-8,1.25);makeCloud(-1,22,-7,.9);makeCloud(14,23,-3,1.02);makeCloud(2,25,-14,.85);
  makeCloud(-12,22.5,3,1.15,true);makeCloud(-2,21.7,5,1.1,true);makeCloud(7,23,-9,1,true);
  // A small solid sun and slender rays identify the energy source.
  const sun=new THREE.Group();sun.position.set(22,27,-13);root.add(sun);
  const sunMat=new THREE.MeshBasicMaterial({color:0xe7bf68});const sunBall=new THREE.Mesh(new THREE.SphereGeometry(1.25,24,16),sunMat);sun.add(sunBall);
  const rayPositions=[];for(let i=0;i<12;i++){const a=i/12*Math.PI*2;rayPositions.push(Math.cos(a)*1.65,Math.sin(a)*1.65,0,Math.cos(a)*2.1,Math.sin(a)*2.1,0);}
  const raysGeo=new THREE.BufferGeometry();raysGeo.setAttribute('position',new THREE.Float32BufferAttribute(rayPositions,3));sun.add(new THREE.LineSegments(raysGeo,new THREE.LineBasicMaterial({color:0xd5af61,transparent:true,opacity:.65})));

  // Process routes are teaching aids. Invisible water vapour is explicitly labelled in the UI.
  const flowRoot=new THREE.Group();root.add(flowRoot);
  function flow(key,points,color,{dots=9,speed=.07,section=false,dashed=true}={}) {
    const curve=new THREE.CatmullRomCurve3(points),g=new THREE.Group();(section?underground:flowRoot).add(g);
    const geo=new THREE.BufferGeometry().setFromPoints(curve.getPoints(100));
    const mat=dashed?new THREE.LineDashedMaterial({color,dashSize:.5,gapSize:.4,transparent:true,opacity:.45}):new THREE.LineBasicMaterial({color,transparent:true,opacity:.3});
    const line=new THREE.Line(geo,mat);if(dashed)line.computeLineDistances();g.add(line);
    const dotMat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.83}),dotMesh=new THREE.InstancedMesh(new THREE.SphereGeometry(.11,8,6),dotMat,dots);g.add(dotMesh);
    const f={key,curve,g,line,mat,dotMat,dotMesh,dots,speed,section};flowGroups.push(f);
    const at=curve.getPointAt(.68),dir=curve.getTangentAt(.68).normalize();
    const arrow=new THREE.Mesh(new THREE.ConeGeometry(.26,.8,8),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.7}));arrow.position.copy(at);arrow.quaternion.setFromUnitVectors(V(0,1,0),dir);g.add(arrow);return f;
  }
  flow('evap',[V(20,.8,5),V(21,7,4),V(20,15,0),V(16,21,-3)],0xc69845,{dots:12,speed:.058});
  flow('transp',[V(-17,4,7),V(-18,10,7),V(-15,17,5),V(-10,22,2)],0x699f64,{dots:9,speed:.055});
  flow('cond',[V(14,25,-4),V(5,27,-7),V(-4,27,-9),V(-12,26,-8)],0x85a6af,{dots:10,speed:.05});
  flow('precip',[V(-10,23,-6),V(-10,20,-5),V(-9,16,-4),V(-8,10,-3)],0x5f9dbe,{dots:10,speed:.09});
  flow('runoff',bed.filter((_,i)=>i%8===0).map(p=>p.clone().add(V(0,.18,0))),0x48abb1,{dots:16,speed:.08,dashed:false});
  flow('collect',[V(13,1,12.5),V(17,.6,12.5),V(22,.5,12)],0x4f9fac,{dots:6,speed:.09});
  flow('infil',[V(-6,3.3,17),V(-5,1,18),V(-4,-.5,20.2),V(-3,-2.5,20.3)],0xa391bc,{dots:8,speed:.065});
  flow('infil',[V(-17,-2,20.2),V(-9,-2.4,20.2),V(1,-2.8,20.2),V(12,-2.8,20.2),V(20,-1.2,20.2)],0x8eb8cb,{dots:15,speed:.045,section:true});

  // Rain particles reset to their own sampled land/water surface, including the lake.
  const rainCount=720,rainData=[],rainPos=new Float32Array(rainCount*6);
  function waterHeight(x,z) {const inLake=Math.hypot((x-lake.x)/lake.rx,(z-lake.z)/lake.rz)<1;return Math.max(.05,heightAt(x,z),inLake?lake.y:-100);}
  for(let i=0;i<rainCount;i++){const x=range(-20,8),z=range(-12,10),floor=waterHeight(x,z);rainData.push({x,z,floor,y:range(floor,22),speed:range(12,19)});}
  const rainGeo=new THREE.BufferGeometry();rainGeo.setAttribute('position',new THREE.BufferAttribute(rainPos,3));rainGeo.setDrawRange(0,0);
  const rainMat=new THREE.LineBasicMaterial({color:0x80a9bc,transparent:true,opacity:.6,depthWrite:false});const rainMesh=new THREE.LineSegments(rainGeo,rainMat);rainMesh.frustumCulled=false;root.add(rainMesh);
  const ringGeo=new THREE.RingGeometry(.9,1,24);ringGeo.rotateX(-Math.PI/2);const ringMat=new THREE.MeshBasicMaterial({color:0xc2e3dc,transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false});
  const splash=new THREE.InstancedMesh(ringGeo,ringMat,55);root.add(splash);
  for(let i=0;i<55;i++){const x=range(-4,5),z=range(2,8);rippleData.push({x,z,y:waterHeight(x,z)+.035,phase:random()});}

  // Cheap, invisible pick volumes avoid raycasting individual leaves or terrain triangles.
  const pickMat=new THREE.MeshBasicMaterial({visible:false});
  function pick(key,x,y,z,sx,sy,sz) {const m=new THREE.Mesh(new THREE.SphereGeometry(1,10,8),pickMat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.userData.key=key;root.add(m);picks.push(m);}
  pick('peak',-11,9,-9,6,7,5);pick('forest',-15,4,6,6,3,6);pick('lake',lake.x,lake.y,lake.z,3.5,.4,2.5);pick('ocean',21,.1,4,5,.2,13);pick('cloud',-10,24,-7,5,2,3);pick('sun',22,27,-13,2,2,2);
  const labels=[
    {key:'evap',text:'01 蒸发',detail:'液 → 气',pos:V(22,10,5)},
    {key:'transp',text:'02 蒸腾',detail:'植物放出水汽',pos:V(-19,11,8)},
    {key:'cond',text:'03 凝结',detail:'气 → 液',pos:V(6,25.4,-6)},
    {key:'precip',text:'04 降水',detail:'云 → 地面',pos:V(-10,18,-1)},
    {key:'runoff',text:'05 径流',detail:'向低处流',pos:V(4,4,8)},
    {key:'infil',text:'06 下渗',detail:'进入土壤',pos:V(-4,1,19)},
    {key:'collect',text:'07 汇集',detail:'回到海洋',pos:V(20,1,15)},
    {key:'peak',text:'积雪与裸岩',minor:true,pos:V(-13,16,-10)},
    {key:'forest',text:'针叶林 · 阔叶林',minor:true,pos:V(-17,4,4)},
    {key:'lake',text:'山间湖泊',minor:true,pos:V(-1.5,3.2,1.7)},
    {key:'ocean',text:'海洋',minor:true,pos:V(22,.6,-9)},
    {key:'sun',text:'太阳能',minor:true,pos:V(22,29.6,-13)},
    {key:'infil',text:'孔隙中的地下水',section:true,pos:V(2,-3.2,20.5)},
  ];

  let isSection=false,selected=null,flowEnabled=true,weather={rain:0,gloom:0,cloud:.2},sunlight=.75;
  function select(key) {
    selected=key;
    flowGroups.forEach(f=>{const on=!selected||f.key===selected;f.mat.opacity=on?.6:.14;f.dotMat.opacity=on?.96:.25;f.dotMesh.scale.setScalar(on?1.12:.8);});
  }
  function setSection(on) {
    isSection=on;underground.visible=on;
    // Keep the surface intact: the front geological wall is the actual teaching section.
    wallMat.vertexColors=true;wallMat.color.set(on?0xffffff:0xe0e2d5);
  }
  function setFlow(on) {flowEnabled=on;flowRoot.visible=on;flowGroups.filter(f=>f.section).forEach(f=>f.g.visible=on);}
  function setConditions(w,light) {weather=w;sunlight=light;}
  function update(t,dt) {
    waterMaterials.forEach(m=>{const s=m.userData.shader;if(s){s.uniforms.uWaterTime.value=t;s.uniforms.uRain.value=weather.rain;}});
    flowGroups.forEach(f=>{
      let speed=f.speed;if(f.key==='evap'||f.key==='transp')speed*=.3+sunlight*1.2;if(f.key==='runoff')speed*=1+weather.rain*.8;
      for(let i=0;i<f.dots;i++){const p=f.curve.getPointAt((i/f.dots+t*speed)%1);dummy.position.copy(p);dummy.rotation.set(0,0,0);dummy.scale.setScalar(1);dummy.updateMatrix();f.dotMesh.setMatrixAt(i,dummy.matrix);}f.dotMesh.instanceMatrix.needsUpdate=true;
      f.g.visible=flowEnabled&&(!f.section||isSection);
    });
    for(let i=0;i<110;i++){
      const q=(i/110+t*(.026+weather.rain*.02))%1,p=riverCurve.getPointAt(q),tangent=riverCurve.getTangentAt(q);
      const offset=Math.sin(i*7.9)*mix(.13,.57,q);dummy.position.copy(p).add(V(-tangent.z*offset,.025,tangent.x*offset));dummy.rotation.set(0,Math.atan2(tangent.x,tangent.z),0);dummy.scale.set(.025,.017,rangeFoam(i)*(.7+weather.rain*.5));dummy.updateMatrix();foam.setMatrixAt(i,dummy.matrix);
    }foam.instanceMatrix.needsUpdate=true;
    cloudGroups.forEach((c,i)=>{c.g.position.x=c.x+Math.sin(t*.045+i)*.7;c.g.position.y=c.y+Math.sin(t*.12+i*1.5)*.17;c.mat.opacity=c.storm?weather.cloud*.92:mix(.82,1,weather.cloud);c.mat.color.setRGB(mix(.91,.51,weather.gloom),mix(.94,.61,weather.gloom),mix(.91,.64,weather.gloom));c.g.visible=!c.storm||weather.cloud>.25;});
    sunMat.color.setRGB(1, .74+sunlight*.1,.36+sunlight*.12);sunBall.scale.setScalar(.88+sunlight*.12);
    const n=Math.floor(rainCount*weather.rain);rainMesh.visible=n>0;rainGeo.setDrawRange(0,n*2);
    for(let i=0;i<n;i++){const r=rainData[i];r.y-=dt*r.speed;if(r.y<r.floor)r.y=22;const j=i*6;rainPos[j]=r.x;rainPos[j+1]=r.y;rainPos[j+2]=r.z;rainPos[j+3]=r.x-.06;rainPos[j+4]=r.y+.5;rainPos[j+5]=r.z+.03;}rainGeo.attributes.position.needsUpdate=true;
    splash.visible=n>0;
    rippleData.forEach((r,i)=>{const phase=(r.phase+t*.7)%1,size=.07+phase*.48;dummy.position.set(r.x,r.y,r.z);dummy.rotation.set(0,0,0);dummy.scale.setScalar(size);dummy.updateMatrix();splash.setMatrixAt(i,dummy.matrix);});splash.instanceMatrix.needsUpdate=true;ringMat.opacity=weather.rain*.47;
  }
  function rangeFoam(i){return .12+S.hash3(i,8,7)*.19;}
  root.traverse(o=>{if(o.material){const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>{if('envMapIntensity' in m)m.envMapIntensity=.3;});}});
  return {root,picks,labels,heightAt,river:bed,lake,update,select,setSection,setFlow,setConditions,treeCount:treeData.length};
}
