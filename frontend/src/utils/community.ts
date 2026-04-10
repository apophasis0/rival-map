import Graph from 'graphology';
import louvain from 'graphology-communities-louvain';

// ============ 社区调色板（20 个高区分度颜色，适配暗色霓虹主题）============

const COMMUNITY_PALETTE = [
  '#f97316', // 0: 橘橙
  '#06b6d4', // 1: 青色
  '#a855f7', // 2: 亮紫
  '#eab308', // 3: 黄色
  '#ec4899', // 4: 粉色
  '#22c55e', // 5: 绿色
  '#3b82f6', // 6: 蓝色
  '#ef4444', // 7: 红色
  '#14b8a6', // 8: 蓝绿
  '#f59e0b', // 9: 琥珀
  '#8b5cf6', // 10: 紫罗兰
  '#6366f1', // 11: 靛蓝
  '#e11d48', // 12: 玫红
  '#0ea5e9', // 13: 天蓝
  '#84cc16', // 14: 青柠
  '#d946ef', // 15: 品红
  '#f97316', // 16: 深橘
  '#10b981', // 17: 翠绿
  '#6366f1', // 18: 深蓝
  '#fb923c', // 19: 浅橘
];

/** 获取社区颜色 */
export function getCommunityColorHex(communityId: number): string {
  return COMMUNITY_PALETTE[communityId % COMMUNITY_PALETTE.length];
}

/**
 * 运行 Louvain 社区发现算法
 * @returns { nodeId: communityId } 映射，如果只检测到 1 个社区则返回 null
 */
export function detectCommunities(graph: Graph): Record<string, number> | null {
  if (graph.order === 0) return null;

  const t0 = performance.now();
  const communities = louvain(graph);
  const elapsed = performance.now() - t0;

  // 检查检测到了多少个不同的社区
  const uniqueCommunities = new Set(Object.values(communities));
  if (uniqueCommunities.size <= 1) {
    console.log(`[Community] Louvain 只检测到 ${uniqueCommunities.size} 个社区，跳过社区染色`);
    return null;
  }

  console.log(
    `[Community] Louvain 完成: ${uniqueCommunities.size} 个社区, ${graph.order} 节点, ${elapsed.toFixed(1)}ms`
  );
  return communities;
}

/**
 * 统计每个社区的节点数量
 * @returns 按社区 ID 排序的数组 [{ id, count, color }]
 */
export function getCommunityStats(
  communities: Record<string, number>
): Array<{ id: number; count: number; color: string }> {
  const counts: Record<number, number> = {};
  for (const communityId of Object.values(communities)) {
    counts[communityId] = (counts[communityId] || 0) + 1;
  }

  return Object.entries(counts)
    .map(([id, count]) => ({
      id: Number(id),
      count,
      color: getCommunityColorHex(Number(id)),
    }))
    .sort((a, b) => b.count - a.count); // 按节点数降序
}
