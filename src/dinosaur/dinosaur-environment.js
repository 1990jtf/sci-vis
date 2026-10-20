import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Deterministic, reusable environments: fern woodland, not a modern grass lawn.
export function createEnvironment({scene, S}) {
  const root=new THREE.Group();scene.add(root);
  const material=(color)=>new THREE.MeshStandardMaterial({color,roughness:.95});
  const bark=material(0x66503b),stone=material(0x7c8272),greens=[0x3f6042,0x4e7147,0x667d4c,0x314d3b].map(material);
  const leafGeo=new THREE.BufferGeometry();
  leafGeo.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,.08,.09,.2,0,.04,.5,-.08,.09,.2],3));
  leafGeo.setAttribute('uv',new THREE.Float32BufferAttribute([.5,0,1,.4,.5,1,0,.4],2));leafGeo.setIndex([0,1,2,0,2,3]);leafGeo.computeVertexNormals();
  greens.forEach(m=>m.side=THREE.DoubleSide);
  const foliageCanvas=document.createElement('canvas');foliageCanvas.width=foliageCanvas.height=256;
  const fc=foliageCanvas.getContext('2d');
  for(let i=0;i<550;i++){
    const a=S.hash3(i,8,13)*Math.PI*2,r=Math.sqrt(S.hash3(i,9,13))*108;
    const x=128+Math.cos(a)*r,y=128+Math.sin(a)*r*.85;
    const tone=60+Math.floor(S.hash3(i,7,13)*65);
    fc.fillStyle=`rgb(${tone*.8},${tone+20},${tone*.62})`;fc.beginPath();fc.ellipse(x,y,3+S.hash3(i,3,13)*5,2+S.hash3(i,4,13)*3,a,0,Math.PI*2);fc.fill();
  }
  const foliageTexture=new THREE.CanvasTexture(foliageCanvas);foliageTexture.colorSpace=THREE.SRGBColorSpace;
  const foliageMat=new THREE.MeshStandardMaterial({map:foliageTexture,alphaTest:.5,side:THREE.DoubleSide,roughness:.92});
  const foliageGeo=new THREE.PlaneGeometry(3.7,3.1);
  const sky=new THREE.Mesh(new THREE.SphereGeometry(230,32,20),new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color(0x819a9b)},bottom:{value:new THREE.Color(0xe9dfc3)}},
    vertexShader:'varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec3 vDirection;uniform vec3 top;uniform vec3 bottom;void main(){float h=normalize(vDirection).y;gl_FragColor=vec4(mix(bottom,top,smoothstep(-.08,.8,h)),1.);#include <tonemapping_fragment>\n#include <colorspace_fragment>}',
  }));
  // Keep shader preprocessor directives at the beginning of a line.
  sky.material.fragmentShader=sky.material.fragmentShader.replace(';#include',';\n#include');root.add(sky);
  const groundColors={tri:0xa08b63,jur:0x737d55,cre:0x798361};
  function riverX(z){return 10+Math.sin(z*.045)*6;}
  function height(x,z){
    const r=Math.abs(x-riverX(z));
    const flat=1-Math.exp(-(x*x+z*z)/140);
    return (S.fbm2(x*.06+3,z*.06-2,4)-.5)*2*flat-Math.exp(-r*r/14)*.8;
  }
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d');
  const data=ctx.createImageData(256,256);
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    const i=(y*256+x)*4,n=130+Math.floor(S.hash3(x,y,17)*90);data.data.set([n,n,n,255],i);
  }
  ctx.putImageData(data,0,0);const dirt=new THREE.CanvasTexture(canvas);dirt.wrapS=dirt.wrapT=THREE.RepeatWrapping;dirt.repeat.set(24,24);dirt.anisotropy=4;
  const terrainGeo=new THREE.PlaneGeometry(280,280,128,128);terrainGeo.rotateX(-Math.PI/2);
  const positions=terrainGeo.attributes.position,colors=new Float32Array(positions.count*3);
  for(let i=0;i<positions.count;i++)positions.setY(i,height(positions.getX(i),positions.getZ(i))-.04);
  terrainGeo.computeVertexNormals();terrainGeo.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const terrainMat=new THREE.MeshStandardMaterial({vertexColors:true,map:dirt,bumpMap:dirt,bumpScale:.09,roughness:1});
  const terrain=new THREE.Mesh(terrainGeo,terrainMat);terrain.receiveShadow=true;root.add(terrain);
  const waterPoints=[],waterIndices=[];
  for(let i=0;i<=100;i++){
    const z=-140+i*2.8,x=riverX(z);waterPoints.push(x-2.1,-.31,z,x+2.1,-.31,z);
    if(i<100){const a=i*2;waterIndices.push(a,a+1,a+2,a+1,a+3,a+2);}
  }
  const waterGeo=new THREE.BufferGeometry();waterGeo.setAttribute('position',new THREE.Float32BufferAttribute(waterPoints,3));waterGeo.setIndex(waterIndices);waterGeo.computeVertexNormals();
  const water=new THREE.Mesh(waterGeo,new THREE.MeshStandardMaterial({color:0x698e8a,metalness:.3,roughness:.24,side:THREE.DoubleSide}));root.add(water);
  const ripples=new THREE.Group();root.add(ripples);
  for(let i=0;i<26;i++){
    const z=-70+i*5,x=riverX(z);
    const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x-1.4,-.295,z),new THREE.Vector3(x+.7,-.295,z+.1)]);
    const line=new THREE.Line(geo,new THREE.LineBasicMaterial({color:0xc9d7bf,transparent:true,opacity:.2}));ripples.add(line);
  }
  const plants=new THREE.Group();root.add(plants);
  function fern(scale=1) {
    const g=new THREE.Group();
    for(let f=0;f<7;f++){
      const frond=new THREE.Group();frond.rotation.y=f/7*Math.PI*2;g.add(frond);
      for(let j=0;j<9;j++){
        const t=j/9,spread=Math.sin(t*Math.PI)*.32;
        for(const s of [-1,1]){const leaf=new THREE.Mesh(leafGeo,greens[(j+f)%4]);leaf.position.set(s*spread,t*.5,t*.83);leaf.rotation.y=s*.9;leaf.scale.set(.65*(1-t*.6),.7,.7*(1-t*.6));frond.add(leaf);}
      }
    }
    g.scale.setScalar(scale);return g;
  }
  function tree(kind,size) {
    const g=new THREE.Group();
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.12,.28,6,9),bark);trunk.position.y=3;trunk.castShadow=true;g.add(trunk);
    if(kind==='cycad'){
      trunk.scale.y=.28;trunk.position.y=.84;
      const crown=fern(3.1);crown.position.y=1.7;g.add(crown);
    }else{
      const count=kind==='broad'?9:10;
      for(let i=0;i<count;i++){
        const a=i*2.4,r=kind==='broad'?1.2:(1-i/count)*.9,y=kind==='broad'?5+Math.sin(i)*1.1:2.2+i*.42;
        const branch=new THREE.Mesh(new THREE.CylinderGeometry(.045,.085,1.8,6),bark);branch.position.set(Math.sin(a)*r*.55,y-.7,Math.cos(a)*r*.55);branch.rotation.z=Math.sin(a)*.7;branch.rotation.x=Math.cos(a)*.7;g.add(branch);
        for(let side=0;side<3;side++){
          const crown=new THREE.Mesh(foliageGeo,foliageMat);crown.position.set(Math.sin(a)*r,y,Math.cos(a)*r);crown.rotation.y=side*Math.PI/3+a;crown.rotation.x=side===2?Math.PI*.4:.1;
          const scale=kind==='broad'?1:(1-i/count)*.8+.18;crown.scale.set(scale,kind==='broad'?.8:scale*.7,scale);crown.castShadow=true;g.add(crown);
        }
      }
    }
    g.scale.setScalar(size);return g;
  }
  const boulders=new THREE.Group();root.add(boulders);
  for(let i=0;i<35;i++){
    const z=-80+S.hash3(i,1,3)*130,x=riverX(z)+(i%2?3.7:-3.7),r=.25+S.hash3(i,7,3)*.9;
    const rock=new THREE.Mesh(new THREE.IcosahedronGeometry(r,1),stone);rock.scale.set(1.4,.6,1);rock.position.set(x,height(x,z)+.2,z);rock.rotation.set(i,i*.7,i*.3);rock.castShadow=rock.receiveShadow=true;boulders.add(rock);
  }
  const mountains=new THREE.Group();root.add(mountains);
  for(let i=0;i<9;i++){
    const hill=new THREE.Mesh(new THREE.IcosahedronGeometry(1,3),material(i%2?0x83938a:0x8e9b8c));hill.scale.set(20+i%3*8,9+i%4*3,15);hill.position.set(-100+i*26,-3,-94-S.hash3(i,2,5)*24);mountains.add(hill);
  }
  let currentEra=null;
  function setEra(id){
    if(currentEra===id)return;currentEra=id;
    while(plants.children.length){const g=plants.children[0];plants.remove(g);g.traverse(o=>{if(o.isMesh&&o.geometry!==leafGeo)o.geometry.dispose();});}
    const base=new THREE.Color(groundColors[id]);
    for(let i=0;i<positions.count;i++){
      const x=positions.getX(i),z=positions.getZ(i),r=Math.abs(x-riverX(z)),n=S.fbm2(x*.35,z*.35,3);
      const c=base.clone().multiplyScalar(.75+n*.4);if(r<5)c.lerp(new THREE.Color(0xa79876),Math.max(0,(5-r)/5));
      colors.set([c.r,c.g,c.b],i*3);
    }
    terrainGeo.attributes.color.needsUpdate=true;
    for(let i=0;i<56;i++){
      const a=S.hash3(i,2,21)*Math.PI*2,r=17+S.hash3(i,3,21)*65,x=Math.cos(a)*r,z=Math.sin(a)*r-16;
      if(Math.abs(x-riverX(z))<4.5||(z>-12&&Math.abs(x)<32))continue;
      const kind=id==='tri'?(i%3?'conifer':'cycad'):id==='jur'?(i%4?'conifer':'cycad'):(i%3?'broad':'conifer');
      const g=tree(kind,.7+S.hash3(i,4,21)*.8);g.position.set(x,height(x,z),z);g.rotation.y=a;plants.add(g);
    }
    for(let i=0;i<95;i++){
      const a=S.hash3(i,1,32)*Math.PI*2,r=7+S.hash3(i,3,32)*45,x=Math.cos(a)*r,z=Math.sin(a)*r;
      if(Math.abs(x-riverX(z))<3)continue;
      const f=fern(.65+S.hash3(i,4,32)*1.25);f.position.set(x,height(x,z),z);f.rotation.y=a;plants.add(f);
    }
    // Bake thousands of static leaf/branch pieces into one draw per material.
    plants.updateMatrixWorld(true);
    const batches=new Map(),oldGeometry=new Set();
    plants.traverse(o=>{
      if(!o.isMesh)return;
      let geo=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();geo.applyMatrix4(o.matrixWorld);
      if(!batches.has(o.material))batches.set(o.material,[]);batches.get(o.material).push(geo);
      if(o.geometry!==leafGeo&&o.geometry!==foliageGeo)oldGeometry.add(o.geometry);
    });
    plants.clear();oldGeometry.forEach(g=>g.dispose());
    batches.forEach((geometries,mat)=>{
      const combined=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());
      const m=new THREE.Mesh(combined,mat);m.castShadow=m.receiveShadow=true;plants.add(m);
    });
    sky.material.uniforms.top.value.set(id==='tri'?0x9da6a0:0x829eab);
    sky.material.uniforms.bottom.value.set(id==='tri'?0xe6d8b8:0xdce1ca);
    scene.fog=new THREE.Fog(id==='tri'?0xd8d0b5:0xc8d4c3,45,155);
  }
  function setDust(step){
    const top=sky.material.uniforms.top.value,bottom=sky.material.uniforms.bottom.value;
    top.set(step>=2?0x7c8785:currentEra==='tri'?0x9da6a0:0x829eab);
    bottom.set(step>=2?0xa7afa1:currentEra==='tri'?0xe6d8b8:0xdce1ca);
    if(scene.fog)scene.fog.color.set(step>=2?0xa7afa1:currentEra==='tri'?0xd8d0b5:0xc8d4c3);
  }
  setEra('cre');
  return {root,setEra,setDust,update(time){ripples.children.forEach((line,i)=>{line.position.z=Math.sin(time*.2+i)*.22;});}};
}
