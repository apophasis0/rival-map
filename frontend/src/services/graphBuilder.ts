import Graph from 'graphology';
import type { BackendGraphData, BackendNode, LinkType } from '../types';
import { getNodeSize, getNodeColorHex } from '../utils/color';
import { detectCommunities, getCommunityColorHex, getCommunityStats } from '../utils/community';
import {
  NODE_INIT_CONFIG,
  DEFAULT_EDGE_CONFIG,
  PEDIGREE_EDGE_CONFIG,
  EDGE_FILTER_CONFIG,
} from '../config/sigmaConfig';

// ============ 图数据构建 ============

/** 社区检测结果 */
export interface CommunityResult {
  communities: Record<string, number> | null;
  stats: Array<{ id: number; count: number; color: string }> | null;
}

/** 计算年份布局的 X 坐标 */
function calculateYearLayoutX(node: BackendNode, minYear: number, yearRange: number, usableWidth: number, padding: number): number {
  const yearProgress = (node.active_year - minYear) / yearRange;
  const baseX = padding + yearProgress * usableWidth;
  // 添加随机偏移
  return baseX + (Math.random() - 0.5) * usableWidth * NODE_INIT_CONFIG.yearLayoutJitter;
}

/** 计算默认布局的坐标 */
function calculateDefaultPosition(centerX: number, centerY: number, initSpread: number): { x: number; y: number } {
  return {
    x: centerX + (Math.random() - 0.5) * initSpread,
    y: centerY + (Math.random() - 0.5) * initSpread,
  };
}

/** 将后端返回的数据转换为 graphology Graph 实例 */
export function buildGraph(
  data: BackendGraphData,
  width: number,
  height: number,
  useYearLayout: boolean,
  useCommunityMode: boolean = false,
): { graph: Graph; communityResult: CommunityResult } {
  const graph = new Graph();
  let communityResult: CommunityResult = { communities: null, stats: null };

  if (data.nodes.length === 0) return { graph, communityResult };

  // 计算全局映射参数
  const maxPrize = Math.max(...data.nodes.map((n) => n.prize_score ?? 0), 1000);
  const nodeCount = data.nodes.length;

  // 布局参数
  const centerX = width / 2;
  const centerY = height / 2;
  const initSpread = Math.min(width, height) * NODE_INIT_CONFIG.initSpreadRatio;

  // 年份布局参数
  let minYear = 0;
  let yearRange = 1;
  const padding = width * NODE_INIT_CONFIG.yearLayoutPadding;
  const usableWidth = width - 2 * padding;

  if (useYearLayout && data.nodes.length > 0) {
    const years = data.nodes.map(n => n.active_year).filter(y => y > 0);
    if (years.length > 0) {
      minYear = Math.min(...years);
      yearRange = Math.max(Math.max(...years) - minYear, 1);
    }
  }

  // 添加节点
  for (const node of data.nodes) {
    let x: number;
    let y: number;

    if (useYearLayout) {
      x = calculateYearLayoutX(node, minYear, yearRange, usableWidth, padding);
      y = centerY + (Math.random() - 0.5) * initSpread;
    } else {
      const pos = calculateDefaultPosition(centerX, centerY, initSpread);
      x = pos.x;
      y = pos.y;
    }

    graph.addNode(node.id, {
      x,
      y,
      size: getNodeSize(node.prize_score),
      color: getNodeColorHex(node.prize_score, maxPrize),
      label: node.name,
      name: node.name,
      sex: node.sex,
      prize_score: node.prize_score,
      active_year: node.active_year,
      community: null as number | null,
    });
  }

  // 添加边 — 动态过滤 + 自适应透明度/粗细
  addEdges(graph, data, nodeCount);

  // 社区检测（必须在边添加之后运行，因为 Louvain 依赖边的权重）
  if (useCommunityMode) {
    const communities = detectCommunities(graph);
    communityResult = {
      communities,
      stats: communities ? getCommunityStats(communities) : null,
    };

    // 如果检测到了社区，重新为节点分配颜色
    if (communities) {
      graph.forEachNode((nodeId) => {
        const community = communities[nodeId];
        if (community !== undefined) {
          graph.setNodeAttribute(nodeId, 'color', getCommunityColorHex(community));
          graph.setNodeAttribute(nodeId, 'community', community);
        }
      });
    }
  }

  return { graph, communityResult };
}

/** 添加边到图中 */
function addEdges(graph: Graph, data: BackendGraphData, nodeCount: number): void {
  const maxWeight = Math.max(...data.links.map((l) => l.weight), 1);

  // 分离宿敌边和血统边
  const rivalLinks = data.links.filter(l => l.linkType === 'rival' || !l.linkType);
  const pedigreeLinks = data.links.filter(l => l.linkType === 'sire' || l.linkType === 'dam');

  // --- 宿敌边：动态过滤 + 自适应透明度/粗细 ---
  const edgeBudget = Math.max(nodeCount * EDGE_FILTER_CONFIG.edgeBudgetMultiplier, EDGE_FILTER_CONFIG.edgeBudgetMin);
  let edgeVisibilityThreshold = 1;

  if (rivalLinks.length > edgeBudget) {
    const sortedWeights = [...rivalLinks].map((l) => l.weight).sort((a, b) => b - a);
    edgeVisibilityThreshold = sortedWeights[Math.min(edgeBudget - 1, sortedWeights.length - 1)];
    console.log(`[Edge] 宿敌边数 ${rivalLinks.length} 超过预算 ${edgeBudget}，动态过滤阈值: ${edgeVisibilityThreshold}`);
  }

  let visibleEdgeCount = 0;
  for (const link of rivalLinks) {
    if (link.weight < edgeVisibilityThreshold) continue;
    if (!graph.hasNode(link.source) || !graph.hasNode(link.target)) continue;

    visibleEdgeCount++;

    const normalizedWeight = link.weight / maxWeight;
    const alpha = DEFAULT_EDGE_CONFIG.alphaBase + DEFAULT_EDGE_CONFIG.alphaScale * Math.pow(normalizedWeight, DEFAULT_EDGE_CONFIG.alphaExponent);
    const size = DEFAULT_EDGE_CONFIG.sizeBase + DEFAULT_EDGE_CONFIG.sizeScale * normalizedWeight;

    graph.addEdge(link.source, link.target, {
      weight: link.weight,
      size,
      color: DEFAULT_EDGE_CONFIG.color,
      alpha: Math.min(DEFAULT_EDGE_CONFIG.alphaMax, alpha),
      linkType: 'rival' as LinkType,
    });
  }

  console.log(`[Edge] 可见宿敌边数: ${visibleEdgeCount} / ${rivalLinks.length} (阈值: ${edgeVisibilityThreshold})`);

  // --- 血统边：不过滤，全部显示 ---
  let pedigreeCount = 0;
  for (const link of pedigreeLinks) {
    if (!graph.hasNode(link.source) || !graph.hasNode(link.target)) continue;
    // 跳过已存在的边（避免重复）
    if (graph.hasEdge(link.source, link.target)) continue;

    pedigreeCount++;
    const lt = link.linkType as 'sire' | 'dam';
    const config = PEDIGREE_EDGE_CONFIG[lt];

    graph.addEdge(link.source, link.target, {
      weight: 1,
      size: config.size,
      color: config.color,
      alpha: config.alpha,
      linkType: link.linkType,
    });
  }

  const sireCount = pedigreeLinks.filter(l => l.linkType === 'sire').length;
  const damCount = pedigreeLinks.filter(l => l.linkType === 'dam').length;
  console.log(`[Edge] 血统边数: ${pedigreeCount} (${sireCount} 父系, ${damCount} 母系)`);
}
