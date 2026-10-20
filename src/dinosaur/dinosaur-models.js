import * as THREE from 'three';

// Original, code-built teaching reconstructions. Metres, +X forward.
// Soft tissue, colour, armour arrangement and motion are interpretive, not scans.
export function createDinosaurFactory() {
  const sphere = new THREE.SphereGeometry(1, 32, 20);
  let seed = 137;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#aca799'; ctx.fillRect(0, 0, 512, 512);
  for (let row = -1; row < 66; row++) for (let col = -1; col < 66; col++) {
    const x = col * 8 + (row % 2) * 4, y = row * 8;
    const tone = 135 + Math.floor(random() * 72);
    ctx.fillStyle = `rgb(${tone},${tone},${tone})`;
    ctx.beginPath(); ctx.ellipse(x, y, 3.1 + random(), 3 + random(), random(), 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(51,46,36,.2)'; ctx.lineWidth = .7; ctx.stroke();
  }
  const skin = new THREE.CanvasTexture(canvas); skin.wrapS = skin.wrapT = THREE.RepeatWrapping;
  skin.anisotropy = 4;
  const skinColor=skin.clone();skinColor.colorSpace=THREE.SRGBColorSpace;skinColor.needsUpdate=true;
  const horn = new THREE.MeshStandardMaterial({ color: 0xd4c5a3, roughness: .6 });
  const claw = new THREE.MeshStandardMaterial({ color: 0x3b342a, roughness: .7 });
  const eye = new THREE.MeshStandardMaterial({ color: 0x160f07, roughness: .13 });
  const iris = new THREE.MeshStandardMaterial({ color: 0xb69137, roughness: .35 });

  function material(color) {
    const mat = new THREE.MeshStandardMaterial({ color:new THREE.Color(color).multiplyScalar(1.65), map:skinColor, bumpMap: skin, bumpScale: .07, roughness: .88 });
    // Broad dorsal mottling and a lighter belly, in model coordinates. No UV seams.
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSkinPosition;\nvarying vec3 vSkinNormal;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkinPosition = position; vSkinNormal = normal;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSkinPosition;\nvarying vec3 vSkinNormal;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float m = sin(vSkinPosition.x*6.0+sin(vSkinPosition.y*9.0))*sin(vSkinPosition.z*8.0+vSkinPosition.x*2.0);
          float stripe = smoothstep(.3,.85,m) * smoothstep(-.2,.7,vSkinNormal.y);
          diffuseColor.rgb *= 1.0-stripe*.22;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*1.19+vec3(.035,.025,.008), (1.0-smoothstep(-.7,.2,vSkinNormal.y))*.55);`);
    };
    mat.customProgramCacheKey = () => 'dinosaur-skin-v1';
    return mat;
  }
  function mesh(parent, geo, mat) {
    const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  }
  function ellipsoid(parent, mat, position, scale) {
    const m = mesh(parent, sphere, mat); m.position.set(...position); m.scale.set(...scale); return m;
  }
  function tube(parent, mat, points, radii, sides = 12) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    const n = Math.max(20, points.length * 9), frames = curve.computeFrenetFrames(n, false);
    const vertices = [], uvs = [], indices = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, p = curve.getPointAt(t), q = t * (radii.length - 1), k = Math.min(radii.length - 2, Math.floor(q));
      const r = THREE.MathUtils.lerp(radii[k], radii[k + 1], q - k);
      for (let j = 0; j <= sides; j++) {
        const a = j / sides * Math.PI * 2;
        const v = p.clone().addScaledVector(frames.normals[i], Math.cos(a) * r).addScaledVector(frames.binormals[i], Math.sin(a) * r);
        vertices.push(v.x, v.y, v.z); uvs.push(t * 3, j / sides);
        if (i < n && j < sides) { const b = i * (sides + 1) + j; indices.push(b, b + sides + 1, b + 1, b + 1, b + sides + 1, b + sides + 2); }
      }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(indices); geo.computeVertexNormals();
    return mesh(parent, geo, mat);
  }
  function spike(parent, mat, start, end, radius) { return tube(parent, mat, [start, end], [radius, .001], 10); }
  // A continuous ellipsoidal loft gives the torso / neck / tail one smooth skin.
  function loft(parent, mat, sections) {
    const curves = [0, 1, 2, 3].map(axis => new THREE.CatmullRomCurve3(sections.map((s, i) => new THREE.Vector3(i, s[axis], 0))));
    const ringCount = sections.length * 10, sides = 32, vertices = [], uvs = [], indices = [];
    for (let i = 0; i <= ringCount; i++) {
      const t = i / ringCount, s = curves.map(c => c.getPoint(t).y);
      for (let j = 0; j <= sides; j++) {
        const a = j / sides * Math.PI * 2;
        vertices.push(s[0], s[1] + Math.cos(a) * Math.max(.005, s[2]), Math.sin(a) * Math.max(.005, s[3]));
        uvs.push(t * 5, j / sides * 2);
        if (i < ringCount && j < sides) { const b = i * (sides + 1) + j; indices.push(b, b + 1, b + sides + 1, b + 1, b + sides + 2, b + sides + 1); }
      }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(indices); geo.computeVertexNormals();
    return mesh(parent, geo, mat);
  }
  function eyes(parent, x, y, z, size) {
    for (const sign of [-1, 1]) {
      ellipsoid(parent, iris, [x, y, sign * z], [size, size, size * .5]);
      ellipsoid(parent, eye, [x + size * .17, y, sign * (z + size * .38)], [size * .48, size * .72, size * .2]);
    }
  }
  function leg(parent, mat, top, knee, ankle, foot, radius, limbs, phase, stocky=false) {
    const pivot = new THREE.Group(); pivot.position.set(...top); parent.add(pivot);
    const local = (p) => p.map((v, i) => v - top[i]);
    tube(pivot, mat, [[0, 0, 0], local(knee), local(ankle), local(foot)], [radius, radius * .72, radius * (stocky?.55:.28), radius * (stocky?.45:.22)]);
    if(!stocky)ellipsoid(pivot, mat, local(knee), [radius * .64, radius * .72, radius * .64]);
    for (let t = -1; t <= 1; t++) {
      const a = local(foot), tip = [a[0] + radius * (stocky?.9:1.6), a[1] - .025, a[2] + t * radius * .65];
      tube(pivot, mat, [a, [tip[0] - radius * .3, tip[1], tip[2]]], [radius * .23, radius * .12]);
      spike(pivot, claw, [tip[0] - radius * .35, tip[1] + .04, tip[2]], tip, radius * .16);
    }
    limbs.push({ pivot, phase });
  }
  function theropod(id, root, mat, limbs) {
    const slender = id === 'coelophysis', bull = id === 'carnotaurus';
    const bodyWidth = slender ? .45 : .86;
    loft(root, mat, [[-7,1.4,.008,.008],[-5.2,1.9,.18,.2],[-3.4,2.35,.35,.39],[-1.8,2.8,.62,.58],[-.6,2.9,.92,bodyWidth],[.65,2.95,.78,bodyWidth*.85],[1.35,3.25,.5,.44],[1.8,3.75,.44,.36],[2.15,4,.44,.43],[2.7,4,.06,.12]]);
    if(bull)ellipsoid(root,mat,[2.62,4.01,0],[.65,.66,.48]);
    else loft(root,mat,[[1.9,4.07,.06,.08],[2.15,4.13,slender?.28:.49,slender?.26:.47],[2.55,4.12,slender?.23:.46,slender?.29:.51],[3.08,4.02,.27,.38],[3.5,4.01,.24,.28],[3.57,4.01,.04,.1]]);
    ellipsoid(root, mat, [2.85,3.59,0], [.78,.19,.43]);
    // Narrow lip gap and small teeth; no permanent aggressive pose.
    const mouth = new THREE.MeshStandardMaterial({ color: 0x49362b, roughness: .9 });
    for (const sign of [-1,1]) {
      tube(root, mouth, [[2.16,3.69,sign*.43],[2.8,3.67,sign*.48],[3.32,3.78,sign*.24]], [.023,.023,.008]);
      for (let i=0;i<9;i++) spike(root,horn,[2.3+i*.105,3.72,sign*(.42-i*.013)],[2.3+i*.105,3.58+(i%2)*.02,sign*(.42-i*.013)],.045);
      ellipsoid(root,mat,[2.2,4.31,sign*.43],[.33,.14,.15]);
      ellipsoid(root,eye,[3.27,4.04,sign*.29],[.055,.036,.022]);
      leg(root,mat,[-.6,2.95,sign*.67],[.13,1.77,sign*.83],[-.4,.57,sign*.74],[.12,.13,sign*.81],slender?.34:.56,limbs,sign<0?Math.PI:0);
      const reach = slender ? .83 : bull ? .25 : .56;
      const arm = [[1.05,2.95,sign*.62],[1.18,2.45,sign*.67],[1.18+reach,2.5,sign*.56]];
      tube(root,mat,arm,[.18,.12,.085]);
      for(let f=0;f<(id==='trex'?2:3);f++) spike(root,claw,[1.18+reach,2.5,sign*(.52+f*.07)],[1.4+reach,2.36,sign*(.52+f*.07)],.05);
      if(bull) spike(root,horn,[2.18,4.48,sign*.4],[2.05,4.91,sign*.84],.2);
    }
    eyes(root,2.22,4.15,.52,slender?.055:.085);
    return { head:[2.65,4.75,.6], arms:[1.4,2.7,.9], tail:[-3.6,2.5,.3] };
  }
  function quadruped(id, root, mat, limbs) {
    const stego=id==='stegosaurus', armour=id==='ankylosaurus';
    const h=armour?1.4:2.05, width=armour?1.22:1.02;
    loft(root,mat,[[id==='triceratops'?-4.8:-5.9,.7,.008,.008],[id==='triceratops'?-3.8:-4.5,1.06,.18,.2],[-2.8,1.43,.39,.4],[-1.7,h,.8,.8],[-.25,h+.15,1.05,width],[1,h,.88,width*.91],[1.7,h-.2,.48,.57],[2.5,h-.45,.35,.36],[2.9,h-.45,.02,.04]]);
    for(const sign of [-1,1]) {
      leg(root,mat,[-1.1,h,sign*.77],[-1.22,h*.54,sign*.95],[-.92,.26,sign*.99],[-.75,.1,sign*1.04],armour?.38:.45,limbs,sign<0?Math.PI:0,true);
      leg(root,mat,[1.12,h-.15,sign*.72],[1.3,h*.49,sign*.87],[1.4,.25,sign*.88],[1.57,.1,sign*.91],.38,limbs,sign<0?0:Math.PI,true);
    }
    ellipsoid(root,mat,[2.55,h-.46,0],[stego?.48:.7,stego?.25:.39,stego?.25:.5]);
    ellipsoid(root,claw,[3.02,h-.53,0],[.22,.16,stego?.21:.35]);
    eyes(root,2.62,h-.26,stego?.25:.48,stego?.048:.07);
    if(id==='triceratops') {
      const shape=new THREE.Shape(); shape.moveTo(0,-.65);
      shape.bezierCurveTo(-.7,-.52,-1.12,.1,-1.12,.7);shape.bezierCurveTo(-1.1,1.6,-.52,1.86,0,1.94);
      shape.bezierCurveTo(.52,1.86,1.1,1.6,1.12,.7);shape.bezierCurveTo(1.12,.1,.7,-.52,0,-.65);
      const geo=new THREE.ExtrudeGeometry(shape,{depth:.12,bevelEnabled:true,bevelSize:.09,bevelThickness:.05,bevelSegments:3,steps:1,curveSegments:22});
      const frill=mesh(root,geo,mat);frill.rotation.y=Math.PI/2;frill.rotateX(-.3);frill.position.set(1.75,h-.1,0);
      for(const sign of [-1,1]) spike(root,horn,[2.5,h+.07,sign*.42],[3.6,h+.92,sign*.59],.2);
      spike(root,horn,[3,h-.26,0],[3.22,h+.22,0],.14);
    }
    if(stego) {
      const plateMat=material(0x875e42);
      for(let i=0;i<17;i++) {
        const x=-3.7+i*.35, rise=Math.sin((i+1)/18*Math.PI), y=x< -1.7?1.5+(x+3.7)*.25:2.6-Math.max(0,x)*.31;
        const shape=new THREE.Shape(); const w=.16+rise*.29, ph=.22+rise*1.2;
        shape.moveTo(-w,0); shape.quadraticCurveTo(-w*.95,ph*.55,-w*.18,ph); shape.quadraticCurveTo(w*.75,ph*.72,w,.07);shape.lineTo(-w,0);
        const p=mesh(root,new THREE.ExtrudeGeometry(shape,{depth:.06,bevelEnabled:true,bevelSize:.035,bevelThickness:.025,bevelSegments:2,steps:1,curveSegments:10}),plateMat);
        p.position.set(x,y,i%2?.22:-.22); p.rotation.x=(i%2?1:-1)*.11;
      }
      for(const x of [-4.9,-4.25]) for(const sign of [-1,1]) spike(root,horn,[x,1.05,sign*.15],[x-.55,1.5,sign*.91],.12);
    }
    if(armour) {
      const plate=material(0x82775b);
      for(let row=0;row<6;row++) for(let col=-2;col<=2;col++) {
        const x=-1.65+row*.55,z=col*.41,y=h+.88*Math.sqrt(Math.max(.05,1-z*z/1.7));
        ellipsoid(root,plate,[x,y,z],[.34,.16,.25]);
      }
      for(let row=0;row<7;row++) for(const sign of [-1,1]) spike(root,plate,[-1.6+row*.55,h+.16,sign*1.1],[-1.85+row*.55,h+.32,sign*1.55],.2);
      ellipsoid(root,plate,[-5.45,.83,0],[.58,.31,.57]);
    }
    return { head:[2.6,h+.1,.5], defence:stego?[-.1,3.7,.2]:armour?[-5.4,.95,.3]:[2.5,3.4,.4], food:[3,h-.5,.35],tail:[-4.7,1.45,.7],armour:[0,h+1.2,.5] };
  }
  function pterosaur(id, root, mat, wings) {
    const early=id==='eudimorphodon';
    ellipsoid(root,mat,[0,.5,0],[.15,.12,.08]);
    tube(root,mat,[[.08,.53,0],[.2,.67,0],[.3,.69,0]],[.07,.046,.045]);
    ellipsoid(root,mat,[.29,.7,0],[.1,.055,.043]);
    spike(root,mat,[.33,.7,0],[early?.49:.55,.69,0],.036);
    eyes(root,.3,.72,.042,.012);
    if(early) tube(root,mat,[[-.1,.5,0],[-.3,.48,0],[-.64,.46,0]],[.032,.02,.001]);
    const membrane=new THREE.MeshStandardMaterial({color:0xa99370,roughness:.9,side:THREE.DoubleSide,bumpMap:skin,bumpScale:.002});
    for(const sign of [-1,1]) {
      const wing=new THREE.Group(); root.add(wing); wings.push({wing,sign});
      const shape=new THREE.Shape();shape.moveTo(.04,.04);shape.lineTo(.16,.2);shape.lineTo(.06,.52);shape.quadraticCurveTo(-.05,.38,-.12,.12);shape.lineTo(-.12,.02);shape.closePath();
      const geometry=new THREE.ShapeGeometry(shape,18); geometry.rotateX(Math.PI/2);geometry.scale(1,1,sign);
      const m=mesh(wing,geometry,membrane);m.position.y=.51;
      tube(wing,mat,[[.04,.51,sign*.04],[.16,.51,sign*.2],[.06,.51,sign*.52]],[.018,.013,.003],8);
      tube(root,mat,[[-.1,.48,sign*.04],[-.19,.39,sign*.06],[-.26,.39,sign*.09]],[.017,.012,.005],8);
    }
    return { head:[.38,.75,.04], wing:[.08,.54,.41], tail:[early?-.5:-.12,.5,0] };
  }
  function create(def) {
    const root=new THREE.Group(), body=new THREE.Group(); root.add(body);
    const mat=material(def.color),limbs=[],wings=[];
    let hotspots;
    if(def.flying) {
      const form=new THREE.Group();body.add(form);hotspots=pterosaur(def.id,form,mat,wings);form.scale.x=.7;
      Object.values(hotspots).forEach(p=>p[0]*=.7);
    }
    else if(['trex','carnotaurus','coelophysis'].includes(def.id)) hotspots=theropod(def.id,body,mat,limbs);
    else hotspots=quadruped(def.id,body,mat,limbs);
    const box=new THREE.Box3().setFromObject(body),size=box.getSize(new THREE.Vector3());
    const scale=def.length/(def.flying?size.z:size.x);
    body.scale.setScalar(scale);
    const center=box.getCenter(new THREE.Vector3());body.position.set(-center.x*scale,-box.min.y*scale,-center.z*scale);
    const positions=Object.fromEntries(Object.entries(hotspots).map(([key,p])=>[key,new THREE.Vector3(...p).multiplyScalar(scale).add(body.position)]));
    const bounds=new THREE.Box3().setFromObject(root),height=bounds.max.y;
    const baseline=body.position.y;
    return {root,body,hotspots:positions,height,length:def.length,update(time,walking){
      limbs.forEach(({pivot,phase})=>{pivot.rotation.z=walking?Math.sin(time*3+phase)*.13:0;});
      wings.forEach(({wing,sign})=>{wing.rotation.x=Math.sin(time*2.7)*.13*sign;});
      body.position.y=baseline+(def.flying?Math.sin(time*1.7)*.012:Math.sin(time*1.4)*.009)*scale;
    }};
  }
  return {create};
}
