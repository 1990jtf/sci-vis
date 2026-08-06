// 公共模块：星空背景
// 用法：createStarfield(scene, { count, size })
import * as THREE from 'three';

export function createStarfield(scene, { count = 2000, size = 0.08, color = 0xffffff } = {}) {
  const stars = new THREE.Points(
    new THREE.BufferGeometry(),
    new THREE.PointsMaterial({ color, size })
  );
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 300;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 300;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 300;
  }
  stars.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(stars);
  return stars;
}