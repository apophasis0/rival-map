// ============ 颜色工具函数 ============

/** 线性插值颜色，返回 #rrggbb */
export function lerpColorHex(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

/** 根据奖金计算节点大小（Sigma 的 size 属性） */
export function getNodeSize(prize: number | null): number {
  if (!prize) return 6;  // 提高最小尺寸（原 4）
  return Math.max(6, Math.sqrt(prize) * 0.15);  // 提高尺寸系数（原 0.1）
}

/** 根据奖金计算节点颜色（Viridis 色阶），感知均匀、色盲友好 */
export function getNodeColorHex(prize: number | null, maxPrize: number): string {
  const value = prize ?? 0;
  const t = maxPrize === 0 ? 0 : Math.min(1, value / maxPrize);

  // Viridis 色阶：10 个关键帧 (r, g, b)
  const viridis: [number, number, number][] = [
    [68, 1, 84],     // 0.0  深紫
    [72, 40, 120],   // 0.1  紫蓝
    [62, 73, 137],   // 0.2  蓝
    [49, 104, 142],  // 0.3  蓝青
    [38, 130, 142],  // 0.4  青
    [31, 158, 137],  // 0.5  青绿
    [53, 183, 121],  // 0.6  绿
    [110, 206, 88],  // 0.7  黄绿
    [181, 222, 43],  // 0.8  黄
    [253, 231, 37],  // 0.9  亮黄
  ];

  const n = viridis.length - 1;
  const idx = t * n;
  const i = Math.min(Math.floor(idx), n - 1);
  const frac = idx - i;

  return lerpColorHex(viridis[i], viridis[i + 1], frac);
}
