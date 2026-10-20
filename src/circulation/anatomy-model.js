import * as THREE from 'three';

// A restrained, non-emissive material keeps the source mesh's folds and relief visible.
// World-space mottling works on meshes without UV coordinates as well.
export function tissueMaterial(color, { roughness = .57, texture = .035 } = {}) {
  const mat = new THREE.MeshPhysicalMaterial({
    color, roughness, metalness: 0, clearcoat: .12,
    clearcoatRoughness: .6, envMapIntensity: .35, side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTissuePosition;');
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvTissuePosition = position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTissuePosition;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float tissueGrain = sin(vTissuePosition.x * 410.0 + sin(vTissuePosition.y * 290.0))
        * sin(vTissuePosition.y * 390.0 + vTissuePosition.z * 320.0);
      float tissueFold = sin(vTissuePosition.x * 75.0 + vTissuePosition.z * 63.0) * sin(vTissuePosition.y * 97.0);
      diffuseColor.rgb *= 1.0 + ${texture.toFixed(4)} * (tissueGrain + tissueFold);`);
  };
  mat.customProgramCacheKey = () => `tissue-${texture}`;
  return mat;
}

// BodyParts3D's lung concept in this reduced dataset contains the bronchial tree.
// Add a smooth teaching envelope, keeping the original branches inside it.
export function lungEnvelope() {
  const group = new THREE.Group();
  const lungMat = tissueMaterial(0xbc8580, { roughness: .73, texture: .075 });
  [-1, 1].forEach((s) => {
    const geometry = new THREE.SphereGeometry(1, 64, 48);
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      // Wider at the diaphragm, tapered at the apex; patient left has a cardiac notch.
      const width = .136 * (1 - y * .22);
      const cardiacNotch = s === 1 && x < 0 && z > -.2
        ? .05 * Math.exp(-Math.pow((y + .02) * 2.2, 2)) * -x : 0;
      const obliqueFissure = Math.exp(-Math.pow((y + .12 + z * .7) * 38, 2)) * .008;
      const horizontalFissure = s === -1 ? Math.exp(-Math.pow((y - .04) * 55, 2)) * Math.max(z, 0) * .008 : 0;
      const seam = obliqueFissure + horizontalFissure;
      pos.setXYZ(i,
        s * (.195 + x * (width - seam) + cardiacNotch),
        3.405 + y * .401,
        -.018 + z * (.192 - seam));
    }
    geometry.computeVertexNormals();
    const lung = new THREE.Mesh(geometry, lungMat);
    lung.userData.isLungEnvelope = true;
    group.add(lung);
  });
  return group;
}

// These centerlines are deliberately simplified teaching routes, not a vascular atlas.
// Every point lies in the same coordinate space as the BodyParts3D models.
export function atlasFlowRoutes() {
  const routes = [];
  const add = (key, points, group = 'systemic') => routes.push({ key, group, points });
  const leftHeart = [.10, 3.48, .15], rightHeart = [-.045, 3.51, .10];
  const arch = [.025, 3.72, .085], hip = [.025, 2.33, -.05];
  const aorta = [leftHeart, [.018, 3.64, .13], arch, [.075, 3.68, -.07], [.06, 3.3, -.10], [.035, 2.85, -.08], hip];
  add('aorta', aorta);
  add('venaCava', [[-.04, 2.33, -.015], [-.065, 2.8, -.015], [-.065, 3.2, .005], rightHeart]);
  [-1, 1].forEach((s) => {
    add('carotid', [arch, [s * .07, 3.88, .015], [s * .07, 4.10, .015], [s * .09, 4.36, .05]]);
    add('venaCava', [[s * .12, 4.36, .055], [s * .11, 4.05, .045], [s * .10, 3.83, .03], rightHeart]);
    add('aorta', [arch, [s * .32, 3.76, -.025], [s * .48, 3.52, .04], [s * .57, 3.13, .09], [s * .68, 2.72, .14], [s * .76, 2.47, .13]]);
    add('venaCava', [[s * .78, 2.47, .15], [s * .70, 2.72, .16], [s * .60, 3.13, .11], [s * .51, 3.52, .06], [s * .33, 3.74, .025], rightHeart]);
    add('aorta', [hip, [s * .19, 2.17, -.005], [s * .23, 1.77, .07], [s * .22, 1.24, .13], [s * .22, .69, .075], [s * .22, .16, .035], [s * .23, .07, .27]]);
    add('venaCava', [[s * .25, .07, .27], [s * .25, .16, .045], [s * .25, .69, .095], [s * .25, 1.24, .15], [s * .26, 1.77, .09], [s * .22, 2.17, .015], [-.04, 2.33, -.015]]);
    add('pulmonaryArtery', [rightHeart, [-.02, 3.65, .14], [s * .14, 3.62, .025], [s * .23, 3.43, -.03]], 'pulmonary');
    add('pulmonaryVein', [[s * .23, 3.43, -.03], [s * .18, 3.33, .075], [.08, 3.58, .03], leftHeart], 'pulmonary');
  });
  return routes;
}
