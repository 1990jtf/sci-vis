#!/usr/bin/env node
/* 内联构建：把 src/shared/kit.js 注入各页面，替换 ES import 语句。
 * 这样开发时 kit.js 是唯一源；发布页面保持单文件、file:// 双击可用。
 * 用法：node tools/inline-kit.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const kitSrc = fs.readFileSync(path.join(ROOT, 'src/shared/kit.js'), 'utf8');

// 剥离 export 关键字，包装成 IIFE，返回 exports 对象
const stripped = kitSrc.replace(/^export /gm, '');
const inlineBlock =
  '\n    // ===== SciVis Kit（由 tools/inline-kit.js 自动内联，勿手改） =====\n' +
  '    const SciVis = (function () {\n' +
  stripped
    .replace(/^\/\* =[\s\S]*?\*\/\n/m, '') // 去掉文件头注释块
    .split('\n').map((l) => '    ' + l).join('\n') +
  '\n    return exports;\n    })();\n';

const PAGES = [
  'src/solar-system/solar-system.html',
  'src/circulation/circulation.html',
  'src/weather/weather.html',
  'src/garden/garden.html',
  'src/dinosaur/dinosaur.html',
  'src/birth/birth.html',
];

// 匹配：import 语句（首次内联）或已内联的 IIFE 块（重复内联时替换）
const importRe = /import \* as SciVis from '[^']*kit\.js';/;
const inlineRe = /    \/\/ ===== SciVis Kit（由 tools\/inline-kit\.js 自动内联，勿手改） =====[\s\S]*?\n    \}\)\(\);\n/;

PAGES.forEach((rel) => {
  const file = path.join(ROOT, rel);
  let html = fs.readFileSync(file, 'utf8');
  if (inlineRe.test(html)) {
    html = html.replace(inlineRe, inlineBlock);
    fs.writeFileSync(file, html);
    console.log('RE-INLINE: ' + rel);
  } else if (importRe.test(html)) {
    html = html.replace(importRe, inlineBlock);
    fs.writeFileSync(file, html);
    console.log('INLINE: ' + rel);
  } else {
    console.log('SKIP（找不到 import 或已内联标记）: ' + rel);
  }
});
console.log('完成。');
