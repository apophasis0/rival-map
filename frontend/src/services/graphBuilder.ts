import Graph from 'graphology';
import type { BackendGraphData, BackendNode, LinkType } from '../types';
import { getNodeSize, getNodeColorHex } from '../utils/color';
import { detectCommunities, getCommunityColorHex, getCommunityStats } from '../utils/community';
import {
  NODE_INIT_CONFIG,
  DEFAULT_EDGE_CONFIG,
  PEDIGREE_EDGE_CONFIG,
  EDGE_FILTER_CONFIG,
  TRACK_LAYOUT_CONFIG,
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

/** 计算场地布局的 Y 坐标
 *  从上到下：草地 → 泥地 → 跳栏
 *  跳栏马排最下方，草地马排最上方
 */
function calculateTrackLayoutY(
  node: BackendNode,
  height: number,
): number {
  const turfPrize = node.turfPrize ?? 0;
  const dirtPrize = node.dirtPrize ?? 0;
  const hurdPrize = node.hurdPrize ?? 0;
  const totalPrize = turfPrize + dirtPrize + hurdPrize;

  // 高斯随机（Box-Muller 变换）
  const u1 = Math.random();
  const u2 = Math.random();
  const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const jitter = gaussian * height * TRACK_LAYOUT_CONFIG.gaussianStdDev;

  // 情况 1：有跳栏奖金 → 排最下方（跳栏区）
  if (hurdPrize > 0) {
    const zoneHeight = height * TRACK_LAYOUT_CONFIG.hurdZoneRatio;
    const zoneTop = height * (1 - TRACK_LAYOUT_CONFIG.yPadding);
    const zoneBottom = zoneTop - zoneHeight;
    const y = zoneBottom + Math.random() * zoneHeight + jitter * 0.5;
    return Math.max(zoneBottom, Math.min(zoneTop, y));
  }

  // 情况 2：没有跳栏奖金，按草地/泥地比例分配
  const usableHeight = height * (1 - TRACK_LAYOUT_CONFIG.yPadding - TRACK_LAYOUT_CONFIG.hurdZoneRatio);
  const topMargin = height * TRACK_LAYOUT_CONFIG.yPadding;

  if (totalPrize === 0) {
    // 无奖金数据 → 中间位置
    return height / 2 + jitter;
  }

  const turfRatio = (turfPrize + dirtPrize) > 0 ? turfPrize / (turfPrize + dirtPrize) : 0.5;

  // turfRatio=1.0 → 最上方, turfRatio=0.0 → 跳栏区上方
  const yCenter = topMargin + (1 - turfRatio) * usableHeight;
  const y = yCenter + jitter;

  const minY = topMargin;
  const maxY = height * (1 - TRACK_LAYOUT_CONFIG.yPadding - TRACK_LAYOUT_CONFIG.hurdZoneRatio);

  return Math.max(minY, Math.min(maxY, y));
}

/** 将后端返回的数据转换为 graphology Graph 实例 */
export function buildGraph(
  data: BackendGraphData,
  width: number,
  height: number,
  useYearLayout: boolean,
  useCommunityMode: boolean = false,
  useTrackLayout: boolean = false,
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

  // 添加节点（X 轴和 Y 轴正交独立）
  for (const node of data.nodes) {
    let x: number;
    let y: number;

    // X 轴：由年份布局决定
    if (useYearLayout) {
      x = calculateYearLayoutX(node, minYear, yearRange, usableWidth, padding);
    } else {
      x = centerX + (Math.random() - 0.5) * initSpread;
    }

    // Y 轴：由场地布局决定
    if (useTrackLayout) {
      y = calculateTrackLayoutY(node, height);
    } else {
      y = centerY + (Math.random() - 0.5) * initSpread;
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
      sire_name: null as string | null,
      dam_name: null as string | null,
    });
  }

  // 1. 添加宿敌边（用于社区检测和基础布局）
  addRivalEdges(graph, data, nodeCount);

  // 2. 社区检测（基于宿敌边，不受血统边影响）
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

  // 3. 添加血统边（不影响社区检测）
  addPedigreeEdges(graph, data);

  return { graph, communityResult };
}

/** 添加宿敌边到图中 */
function addRivalEdges(graph: Graph, data: BackendGraphData, nodeCount: number): void {
  const rivalLinks = data.links.filter(l => l.linkType === 'rival' || !l.linkType);
  const maxWeight = Math.max(...rivalLinks.map((l) => l.weight), 1);

  // 计算动态过滤阈值
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
}

/** 添加血统边到图中（仅当 data 中包含时） */
function addPedigreeEdges(graph: Graph, data: BackendGraphData): void {
  const pedigreeLinks = data.links.filter(l => l.linkType === 'sire' || l.linkType === 'dam');

  // 先建立 nodeId -> name 映射
  const nameMap = new Map<string, string>();
  for (const node of data.nodes) {
    nameMap.set(node.id, node.name);
  }

  let pedigreeCount = 0;
  for (const link of pedigreeLinks) {
    if (!graph.hasNode(link.source) || !graph.hasNode(link.target)) continue;
    // 跳过已存在的边（避免重复）
    if (graph.hasEdge(link.source, link.target)) continue;

    pedigreeCount++;
    const lt = link.linkType as 'sire' | 'dam';
    const config = PEDIGREE_EDGE_CONFIG[lt];

    // 在子节点上记录父/母名字
    const parentName = nameMap.get(link.source) ?? '';
    if (lt === 'sire') {
      graph.setNodeAttribute(link.target, 'sire_name', parentName);
    } else {
      graph.setNodeAttribute(link.target, 'dam_name', parentName);
    }

    graph.addEdge(link.source, link.target, {
      weight: 0,  // FA2 布局权重为 0，不影响布局
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
