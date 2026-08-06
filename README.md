# 科普可视化（面向儿童科普）

面向儿童的科学知识可视化项目，使用 Web 技术（Three.js）制作交互式的科学演示，帮助孩子通过直观、有趣的 3D 动画认识科学。

## 目录结构

```
sci-vis/
├── index.html                     # 首页导航（各科普的入口）
└── src/
    ├── shared/                    # 共享模块源码（供新科普参考复用）
    │   ├── starfield.js           # 星空背景
    │   ├── speech.js              # 中文语音播报（Web Speech API）
    │   ├── infoCard.js            # 科普介绍卡片组件
    │   └── picking.js             # 点击拾取（Raycaster）
    ├── solar-system/              # 太阳系科普
    │   └── solar-system.html      # 自包含页面（单文件，含全部逻辑）
    └── circulation/               # 人体 · 血液循环科普
        └── circulation.html       # 自包含页面（单文件，含全部逻辑）
```

> **每个科普是一个自包含的 HTML 单文件**（HTML/CSS/JS 全部内联）。这样无需本地服务器，直接用浏览器双击打开即可运行，也兼容 `file://` 协议（若拆成 ES Modules 多文件，`file://` 下会因浏览器跨域限制而白屏）。
>
> `src/shared/` 保留公共模块源码，新增科普时可直接复制内联进单文件页面，或在 `index.html` 首页添加入口卡片即可。

## 共享模块（参考实现）

| 模块 | 说明 | 用法 |
| ---- | ---- | ---- |
| `starfield.js` | 随机星空背景 | `createStarfield(scene, { count, size })` |
| `speech.js` | 中文语音播报（可开关） | `createVoice(buttonEl)` → `speak(text)` / `toggle()` |
| `infoCard.js` | 科普介绍卡片（点开显示） | `createInfoCard(container, { onShow })` → `show(userData)` |
| `picking.js` | 点击拾取 | `enablePicking(renderer, camera, { clickable, onPick })` |

## 科普列表

### 🪐 太阳系 · 地球自转与公转（src/solar-system/solar-system.html）

基于 Three.js 制作的交互式太阳系 3D 演示，包含太阳与八大行星（水星、金星、地球、火星、木星、土星、天王星、海王星）。

**核心功能：**

- **行星自转与公转**：每颗行星按相对真实的速度绕太阳公转并自转，保留自转轴倾角
- **交互查看**：点击任意行星或太阳，弹出介绍卡片，展示直径、公转周期、表面温度等科普数据
- **语音讲解**：使用浏览器 Web Speech API 朗读选中天体的介绍（可开关）
- **自动漫游**：一键自动漫游，镜头依次飞向各天体并语音介绍
- **卫星系统**：地球、火星、木星、土星、天王星、海王星带有多颗环绕卫星
- **轨道可视化**：以半透明圆环展示各行星公转轨道
- **自由视角**：鼠标拖拽旋转视角，滚轮缩放（OrbitControls）
- **土星环**：为土星绘制了标志性的环

**操作方式：**

| 操作 | 说明 |
| ---- | ---- |
| 点击天体 | 查看科普介绍卡片 |
| 拖拽 | 旋转视角 |
| 滚轮 | 缩放 |
| 🔊 按钮 | 开启/关闭语音 |
| ⏸ 按钮 | 暂停/继续动画 |
| 🚀 自动漫游 | 开启/停止自动漫游 |

**技术要点：**

- 使用 Three.js 0.160（通过 importmap 从 CDN 加载，无需本地构建）
- 场景逻辑与科普数据分离（`main.js` / `data.js`），便于扩展
- `OrbitControls` 实现轨道相机控制
- `CSS2DRenderer` 实现天体名称标签
- `Raycaster` 实现点击拾取（公共模块 `picking.js`）
- `Web Speech API`（`speechSynthesis`）实现中文语音讲解（公共模块 `speech.js`）
- 2000 颗随机分布的点作为星空背景（公共模块 `starfield.js`）

## 运行方式

所有示例均为自包含的纯静态 HTML 单文件，无需构建工具、无需本地服务器。

```bash
# 方式一：直接双击打开首页（file:// 即可运行）
open index.html

# 方式二：也可通过本地静态服务器访问
python3 -m http.server 8000
# 然后访问 http://localhost:8000/
```

> 注意：页面通过 CDN 加载 Three.js，首次运行需要网络连接。

## 技术栈

- [Three.js](https://threejs.org/) — 3D 渲染引擎（importmap 从 CDN 加载）
- Web Speech API — 语音合成
- 原生 HTML / CSS / JavaScript（ES Module，单文件内联）