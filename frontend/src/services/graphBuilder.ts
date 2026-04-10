import Graph from 'graphology';
import type { BackendGraphData, BackendNode } from '../types';
import { getNodeSize, getNodeColorHex } from '../utils/color';
import {
  NODE_INIT_CONFIG,
  DEFAULT_EDGE_CONFIG,
  EDGE_FILTER_CONFIG,
} from '../config/sigmaConfig';

// ============ 图数据构建 ============

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
export function buildGraph(data: BackendGraphData, width: number, height: number, useYearLayout: boolean): Graph {
  const graph = new Graph();

  if (data.nodes.length === 0) return graph;

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
    });
  }

  // 添加边 — 动态过滤 + 自适应透明度/粗细
  addEdges(graph, data, nodeCount);

  return graph;
}

/** 添加边到图中 */
function addEdges(graph: Graph, data: BackendGraphData, nodeCount: number): void {
  const maxWeight = Math.max(...data.links.map((l) => l.weight), 1);

  // 计算动态过滤阈值
  const edgeBudget = Math.max(nodeCount * EDGE_FILTER_CONFIG.edgeBudgetMultiplier, EDGE_FILTER_CONFIG.edgeBudgetMin);
  let edgeVisibilityThreshold = 1;

  if (data.links.length > edgeBudget) {
    const sortedWeights = [...data.links].map((l) => l.weight).sort((a, b) => b - a);
    edgeVisibilityThreshold = sortedWeights[Math.min(edgeBudget - 1, sortedWeights.length - 1)];
    console.log(`[Edge] 边数 ${data.links.length} 超过预算 ${edgeBudget}，动态过滤阈值: ${edgeVisibilityThreshold}`);
  }

  let visibleEdgeCount = 0;
  for (const link of data.links) {
    if (link.weight < edgeVisibilityThreshold) continue;
    if (!graph.hasNode(link.source) || !graph.hasNode(link.target)) continue;

    visibleEdgeCount++;

    // 自适应透明度和粗细
    const normalizedWeight = link.weight / maxWeight;
    const alpha = DEFAULT_EDGE_CONFIG.alphaBase + DEFAULT_EDGE_CONFIG.alphaScale * Math.pow(normalizedWeight, DEFAULT_EDGE_CONFIG.alphaExponent);
    const size = DEFAULT_EDGE_CONFIG.sizeBase + DEFAULT_EDGE_CONFIG.sizeScale * normalizedWeight;

    graph.addEdge(link.source, link.target, {
      weight: link.weight,
      size,
      color: DEFAULT_EDGE_CONFIG.color,
      alpha: Math.min(DEFAULT_EDGE_CONFIG.alphaMax, alpha),
    });
  }

  console.log(`[Edge] 可见边数: ${visibleEdgeCount} / ${data.links.length} (阈值: ${edgeVisibilityThreshold})`);
}
