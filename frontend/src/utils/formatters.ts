// ============ 格式化工具函数 ============

/** 根据性别代码返回中文描述 */
export function getSexText(sex: string): string {
  if (sex === 'male') return '牡马 (公)';
  if (sex === 'female') return '牝马 (母)';
  if (sex === 'gelding') return '骟马 (阉)';
  return sex;
}

/** 格式化奖金文本 */
export function formatPrize(prize: number | null): string {
  if (!prize) return '无数据';
  return `约 ${Math.round(prize)} 万日元`;
}
