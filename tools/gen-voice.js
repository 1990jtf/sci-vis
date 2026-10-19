#!/usr/bin/env node
/* ==========================================================================
   神经语音包生成器
   --------------------------------------------------------------------------
   原理：页面里 `/* @voice-data-begin *\/ ... /* @voice-data-end *\/` 之间是
   纯数据（BODIES 数组），每个天体带一条 `say` 口语讲解。本脚本读出这些
   文案，调用 edge-tts（微软 Edge 神经网络语音，免费、无需 API Key）批量
   合成 mp3，输出到 src/audio/<页面名>/v_<id>.mp3。

   页面侧由 S.createVoice({ audioBase }) 按 id 直接播放，音质接近真人；
   找不到音频时自动回退到浏览器 speechSynthesis。

   用法：
     pip install edge-tts
     node tools/gen-voice.mjs src/solar-system/solar-system.html

   可选环境变量：
     EDGE_TTS    edge-tts 可执行文件路径（默认走 PATH）
     VOICE       音色，默认 zh-CN-XiaoxiaoNeural（女声·温柔）
                 其他推荐：zh-CN-YunxiNeural（男声·活泼）、zh-CN-XiaoyiNeural（女声·童趣）
     RATE        语速，默认 -4%
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const rel = process.argv[2] || 'src/solar-system/solar-system.html';
const pageFile = path.join(ROOT, rel);
const pageName = path.basename(rel, '.html');
const outDir = path.join(ROOT, process.argv[3] || path.join('src/audio', pageName));

const VOICE = process.env.VOICE || 'zh-CN-XiaoxiaoNeural';
const RATE = process.env.RATE || '-4%';
const EDGE = process.env.EDGE_TTS || 'edge-tts';

function fail(msg) {
  console.error('\n✗ ' + msg + '\n');
  process.exit(1);
}

/* --- 1. 取出数据块并求值（只含纯数据，不依赖浏览器 API） --- */
const html = fs.readFileSync(pageFile, 'utf8');
const m = html.match(/\/\* @voice-data-begin \*\/([\s\S]*?)\/\* @voice-data-end \*\//);
if (!m) fail(rel + ' 里找不到 @voice-data-begin / @voice-data-end 标记');

const block = m[1];
// 数据块里可以有多组顶层变量（数组或对象映射），把带 say 的条目全挑出来。
// 注意块里也可能有辅助函数内部的局部 const，逐个求值、失败就跳过。
const names = [...new Set(
  [...block.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)].map((x) => x[1]),
)];
const scope = [];
names.forEach((name) => {
  try {
    scope.push({ name, value: new Function(block + '\nreturn ' + name + ';')() });
  } catch (e) {
    // 只存在于内层作用域的变量（如工具函数里的临时值），跳过
  }
});
if (!scope.length) fail('数据块求值失败，没有可用的顶层变量');

const items = [];
scope.forEach(({ name: key, value: v }) => {
  if (Array.isArray(v)) {
    v.forEach((it) => { if (it && it.say) addItem(it, it.name || key); });
  } else if (v && typeof v === 'object') {
    // 对象映射（如 SPECIES）：变量名是分类，键名才是条目名
    Object.entries(v).forEach(([k, it]) => { if (it && it.say) addItem(it, it.name || k); });
  }
});

function addItem(it, fallbackName) {
  const id = it.id || it.voiceId;
  if (!id) return;
  items.push({ id, name: fallbackName, text: it.say });
}

if (!items.length) fail('数据块里没有带 say 文案的条目');
console.log(`页面：${rel}\n音色：${VOICE}    语速：${RATE}\n共 ${items.length} 条讲解 → ${path.relative(ROOT, outDir)}`);

/* --- 2. 准备环境 --- */
const probe = spawnSync(EDGE, ['--version'], { encoding: 'utf8' });
if (probe.error) {
  fail('找不到 edge-tts。请先安装：pip install edge-tts\n  或用 EDGE_TTS=/path/to/edge-tts 指定路径');
}
fs.mkdirSync(outDir, { recursive: true });

const indexPath = path.join(outDir, 'index.json');
let index = {};
try { index = JSON.parse(fs.readFileSync(indexPath, 'utf8')); } catch (e) { index = {}; }
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);

/* --- 3. 逐条合成（文案没变就跳过） --- */
let made = 0, skipped = 0, failed = 0;
items.forEach((it, i) => {
  const file = 'v_' + it.id + '.mp3';
  const h = hash(it.text);
  const abs = path.join(outDir, file);
  const prev = index[it.id];
  if (prev && prev.hash === h && prev.voice === VOICE && fs.existsSync(abs)) {
    skipped++;
    return;
  }
  process.stdout.write(`  [${i + 1}/${items.length}] ${it.name} (${file}) … `);
  const r = spawnSync(EDGE, [
    '--voice=' + VOICE,
    '--rate=' + RATE,          // 注意用 = 形式，argparse 会把 "-4%" 误当成参数名
    '--text', it.text,
    '--write-media', abs,
  ], { encoding: 'utf8' });

  if (r.status === 0 && fs.existsSync(abs) && fs.statSync(abs).size > 1000) {
    const size = fs.statSync(abs).size;
    index[it.id] = { file, hash: h, voice: VOICE, bytes: size };
    made++;
    console.log(Math.round(size / 1024) + ' KB');
  } else {
    failed++;
    console.log('失败');
    if (r.stderr) console.error('    ' + r.stderr.trim().split('\n').slice(-2).join(' '));
  }
});

/* --- 4. 清理已删除天体的旧音频 --- */
const keep = new Set(items.map((it) => 'v_' + it.id + '.mp3'));
fs.readdirSync(outDir).forEach((f) => {
  if (/^v_.*\.mp3$/.test(f) && !keep.has(f)) {
    fs.unlinkSync(path.join(outDir, f));
    delete index[f.replace(/^v_|\.mp3$/g, '')];
    console.log('  − 清理 ' + f);
  }
});

fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n');
const totalKB = Object.values(index).reduce((s, v) => s + (v.bytes || 0), 0) / 1024;
console.log(`\n完成：新生成 ${made}，跳过 ${skipped}，失败 ${failed}，音频总计 ${Math.round(totalKB)} KB`);
console.log('提示：音频变化后记得一起提交，线上才能听到。');
