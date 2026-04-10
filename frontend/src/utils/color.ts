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
  if (!prize) return 4;
  return Math.max(4, Math.sqrt(prize) * 0.1);
}

/** 根据奖金计算节点颜色（靛蓝 → 亮紫 → 橘橙 三段式），柔和明亮适配浅色背景 */
export function getNodeColorHex(prize: number | null, maxPrize: number): string {
  const value = prize ?? 0;
  const threshold = maxPrize * 0.3;
  if (value <= threshold) {
    const t = threshold === 0 ? 0 : value / threshold;
    return lerpColorHex([99, 102, 241], [168, 85, 247], t);
  } else {
    const t = maxPrize === threshold ? 1 : (value - threshold) / (maxPrize - threshold);
    return lerpColorHex([168, 85, 247], [249, 115, 22], t);
  }
}
