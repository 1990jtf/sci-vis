// Equatorial diameters, sidereal rotations and orbital periods: NASA/NSSDCA.
// Small differences from rounded spoken narration reflect display rounding.
export const PLANETS = {
  mercury: { en: 'MERCURY', order: 1, category: '岩石行星', diameter: 4879, year: 87.969, spinHours: 1407.6, gravity: 3.7, temperature: '约 167 ℃', au: .387, title: '跑得最快，转得很慢', feature: '一年只有 88 天，自转一圈却要 58.6 天。没有浓厚大气保护，表面留下了密密麻麻的撞击坑。', subtitle: '灰色的岩石世界，保存着无数次撞击的痕迹。' },
  venus: { en: 'VENUS', order: 2, category: '岩石行星', diameter: 12104, year: 224.701, spinHours: 5832.5, gravity: 8.9, temperature: '约 464 ℃', au: .723, title: '最热的行星，却不是离太阳最近的', feature: '厚厚的二氧化碳大气把热量留住。我们从太空看见的是云顶，云层下面才是金星的地面。', subtitle: '浓密的云层，把炽热的岩石表面藏了起来。' },
  earth: { en: 'EARTH', order: 3, category: '岩石行星', diameter: 12756, year: 365.256, spinHours: 23.934, gravity: 9.8, temperature: '约 15 ℃', au: 1, title: '白天与黑夜，就在眼前交替', feature: '向着太阳的一面是白天，背光的一面是黑夜。注意那条蓝色薄边：大气层就像保护地球的一层轻纱。', subtitle: '蓝色海洋、白色云层，还有薄薄的大气。' },
  mars: { en: 'MARS', order: 4, category: '岩石行星', diameter: 6792, year: 686.980, spinHours: 24.623, gravity: 3.7, temperature: '约 −65 ℃', au: 1.524, title: '红色沙漠，也有白色的极冠', feature: '表面的含铁矿物让火星呈现红色。它的一天只比地球长一点，但过一次生日，要等上接近两个地球年。', subtitle: '铁锈色的沙漠，峡谷与火山组成的另一个世界。' },
  jupiter: { en: 'JUPITER', order: 5, category: '气态巨行星', diameter: 142984, year: 4332.59, spinHours: 9.925, gravity: 23.1, temperature: '约 −110 ℃', au: 5.203, title: '身上的条纹，是流动的云带', feature: '不同颜色的云带沿不同方向流动。大红斑是一场巨大的风暴；这里没有能让人站立的固体表面。', subtitle: '壮观的云带与大红斑，属于这颗行星之王。' },
  saturn: { en: 'SATURN', order: 6, category: '气态巨行星', diameter: 120536, year: 10759.22, spinHours: 10.656, gravity: 9.0, temperature: '约 −140 ℃', au: 9.537, title: '它的光环，不是一整块圆盘', feature: '环由无数冰块和岩石碎屑组成。仔细看，环中有明暗不同的细带与缝隙，还会把影子投在土星上。', subtitle: '由冰与岩石组成的光环，在阳光下留下层次与阴影。' },
  uranus: { en: 'URANUS', order: 7, category: '冰巨行星', diameter: 51118, year: 30688.5, spinHours: 17.24, gravity: 8.7, temperature: '约 −195 ℃', au: 19.191, title: '一颗几乎“躺着转”的行星', feature: '自转轴倾斜约 98°，像一个侧躺的陀螺。淡蓝绿色来自大气中的甲烷，它会吸收阳光里的部分红光。', subtitle: '淡蓝绿色的冰巨行星，沿着倾斜的轴缓慢转动。' },
  neptune: { en: 'NEPTUNE', order: 8, category: '冰巨行星', diameter: 49528, year: 60182, spinHours: 16.11, gravity: 11.0, temperature: '约 −200 ℃', au: 30.069, title: '最遥远的大行星，也有猛烈的风', feature: '大气中的风速可达每小时约 2,000 公里。深浅不同的蓝色云带是大气活动的线索，过一年要约 165 个地球年。', subtitle: '遥远、寒冷，却有着太阳系里最猛烈的风。' },
};
export const EARTH_DIAMETER = PLANETS.earth.diameter;
export const AU_KM = 149597870.7;
export function yearText(days) {
  if (days < 730) return `${days < 100 ? Math.round(days) : Math.round(days).toLocaleString('zh-CN')} 天`;
  return `${(days / 365.256).toFixed(days > 30000 ? 1 : 2).replace(/0+$/, '').replace(/\.$/, '')} 年`;
}
export function numberText(value) { return Math.round(value).toLocaleString('zh-CN'); }
