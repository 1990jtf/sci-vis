// 公共模块：点击拾取（Raycaster）
// 用法：
//   enablePicking(renderer, camera, {
//     clickable,          // 可点击的三维对象数组
//     onPick: (object) => {}
//   });
import * as THREE from 'three';

export function enablePicking(renderer, camera, { clickable, onPick }) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  renderer.domElement.addEventListener('click', (event) => {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(clickable, false);
    if (hits.length > 0 && onPick) onPick(hits[0].object);
  });
}