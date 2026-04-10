import Graph from 'graphology';
import Sigma from 'sigma';
import type { NodeDisplayData, EdgeDisplayData } from 'sigma/types';
import type { Settings } from 'sigma/settings';
import { appState } from '../state/appState';
import { getTwoHopNeighbors } from '../algorithms/graph';
import { getSexText, formatPrize } from '../utils/formatters';
import { COMMUNITY_LABELS } from '../utils/communityUI';
import {
  HIGHLIGHT_COLORS,
  NODE_SIZE_MULTIPLIERS,
  EDGE_SIZE_CONFIG,
} from '../config/sigmaConfig';

// ============ 交互逻辑 ============

const tooltipEl = document.getElementById('tooltip') as HTMLElement;
const showLabelsToggle = document.getElementById('showLabelsToggle') as HTMLInputElement;

// Tooltip 显示模式
let tooltipMode: 'follow' | 'fixed' | 'hidden' = 'follow';

export function setTooltipMode(mode: 'follow' | 'fixed' | 'hidden'): void {
  tooltipMode = mode;
  // 清除固定定位样式
  if (mode !== 'fixed') {
    tooltipEl.classList.remove('tooltip-fixed');
  }
}

/** 设置高亮状态 */
export function setHighlight(centerNodeId: string | null): void {
  const renderer = appState.renderer;
  const graph = appState.graph;

  if (!renderer || !graph) return;

  if (centerNodeId === null) {
    clearHighlight(renderer);
    return;
  }

  const context = buildHighlightContext(graph, centerNodeId);
  applyLabelVisibility(renderer, context);

  const nodeReducer = createNodeReducer(context);
  const edgeReducer = createEdgeReducer(context);

  renderer.setSetting('nodeReducer', nodeReducer);
  renderer.setSetting('edgeReducer', edgeReducer);
  renderer.refresh();
}

/** 清除高亮 */
function clearHighlight(renderer: Sigma): void {
  renderer.setSetting('nodeReducer', null);
  renderer.setSetting('edgeReducer', null);
  tooltipEl.style.opacity = '0';

  const labelDensity = showLabelsToggle.checked ? 0.15 : 0;
  renderer.setSetting('labelDensity', labelDensity);
}

/** 构建高亮上下文 */
interface HighlightContext {
  graph: Graph;
  centerNodeId: string;
  twoHop: Set<string>;
  oneHopNodes: Set<string>;
  oneHopEdges: Set<string>;
  twoHopEdges: Set<string>;
  maxEdgeWeight: number;
}

function buildHighlightContext(graph: Graph, centerNodeId: string): HighlightContext {
  const twoHop = getTwoHopNeighbors(graph, centerNodeId);
  const oneHopNodes = new Set<string>();
  const oneHopEdges = new Set<string>();
  const twoHopEdges = new Set<string>();

  // 收集 1-hop 节点
  graph.forEachNeighbor(centerNodeId, (neighbor) => {
    if (twoHop.has(neighbor)) {
      oneHopNodes.add(neighbor);
    }
  });

  // 预计算最大边权重
  let maxEdgeWeight = 1;
  graph.forEachEdge((edge) => {
    const weight = graph.getEdgeAttributes(edge).weight ?? 1;
    if (weight > maxEdgeWeight) maxEdgeWeight = weight;
  });

  // 分类边
  graph.forEachEdge((edge, _attrs, source, target) => {
    if (!twoHop.has(source) || !twoHop.has(target)) return;
    if (source === centerNodeId || target === centerNodeId) {
      oneHopEdges.add(edge);
    } else {
      twoHopEdges.add(edge);
    }
  });

  return {
    graph,
    centerNodeId,
    twoHop,
    oneHopNodes,
    oneHopEdges,
    twoHopEdges,
    maxEdgeWeight,
  };
}

/** 应用标签可见性 */
function applyLabelVisibility(renderer: Sigma, _context: HighlightContext): void {
  if (!showLabelsToggle.checked) {
    renderer.setSetting('labelDensity', 1); // 允许显示所有标签
  }
}

/** 创建节点 reducer */
function createNodeReducer(context: HighlightContext): (node: string, data: Parameters<NonNullable<Settings['nodeReducer']>>[1]) => Partial<NodeDisplayData> {
  return (node: string, data: Parameters<NonNullable<Settings['nodeReducer']>>[1]): Partial<NodeDisplayData> => {
    const isVisible = context.twoHop.has(node);

    if (!isVisible) {
      return { ...data, hidden: true };
    }

    let baseResult: Partial<NodeDisplayData> = { ...data, hidden: false };

    // 标签控制
    if (!showLabelsToggle.checked) {
      baseResult = {
        ...baseResult,
        forceLabel: node === context.centerNodeId ? true : data.forceLabel,
      };
    }

    // 大小区分
    const originalSize = data.size;
    if (node === context.centerNodeId) {
      return {
        ...baseResult,
        size: originalSize * NODE_SIZE_MULTIPLIERS.centerNode,
        // 保留节点原有的颜色，不覆盖
      };
    } else if (context.oneHopNodes.has(node)) {
      return {
        ...baseResult,
        size: originalSize * NODE_SIZE_MULTIPLIERS.oneHopNode,
      };
    } else {
      return baseResult;
    }
  };
}

/** 创建边 reducer */
function createEdgeReducer(context: HighlightContext): (edge: string, data: Parameters<NonNullable<Settings['edgeReducer']>>[1]) => Partial<EdgeDisplayData> {
  return (edge: string, data: Parameters<NonNullable<Settings['edgeReducer']>>[1]): Partial<EdgeDisplayData> => {
    const edgeWeight = context.graph.getEdgeAttributes(edge).weight ?? 1;
    const normalizedWeight = edgeWeight / context.maxEdgeWeight;

    if (context.oneHopEdges.has(edge)) {
      const size = EDGE_SIZE_CONFIG.oneHopEdge.base + EDGE_SIZE_CONFIG.oneHopEdge.scale * normalizedWeight;
      return {
        ...data,
        hidden: false,
        color: HIGHLIGHT_COLORS.oneHopEdge,
        size,
      };
    }

    if (context.twoHopEdges.has(edge)) {
      const size = EDGE_SIZE_CONFIG.twoHopEdge.base + EDGE_SIZE_CONFIG.twoHopEdge.scale * normalizedWeight;
      return {
        ...data,
        hidden: false,
        color: HIGHLIGHT_COLORS.twoHopEdge,
        size,
      };
    }

    return { ...data, hidden: true };
  };
}

/** 显示 Tooltip */
export function showTooltip(nodeId: string, event: MouseEvent): void {
  if (tooltipMode === 'hidden') return;

  const graph = appState.graph;
  if (!graph) return;

  const attrs = graph.getNodeAttributes(nodeId);
  const prizeText = formatPrize(attrs.prize_score);
  const sexText = getSexText(attrs.sex);

  // 社区信息
  let communityHtml = '';
  if (attrs.community !== null && attrs.community !== undefined) {
    const communityLabel = COMMUNITY_LABELS[attrs.community] ?? `Community #${attrs.community}`;
    communityHtml = `<br><span style="color: #cbd5e1;">派系:</span> <span style="color: ${attrs.color}; font-weight: 600;">${communityLabel}</span>`;
  }

  tooltipEl.innerHTML = `
    <strong>${attrs.name}</strong>
    <span style="font-size: 12px; color: #a0aec0; font-weight: normal;">(ID: ${nodeId})</span><br>
    <span style="color: #cbd5e1;">性别:</span> ${sexText}<br>
    <span style="color: #cbd5e1;">总奖金:</span> <span style="color: #ffd700;">${prizeText}</span>
    ${communityHtml}
  `;
  tooltipEl.style.opacity = '1';

  if (tooltipMode === 'follow') {
    tooltipEl.classList.remove('tooltip-fixed');
    tooltipEl.style.left = (event.pageX + 20) + 'px';
    tooltipEl.style.top = (event.pageY - 20) + 'px';
    tooltipEl.style.right = 'auto';
    tooltipEl.style.bottom = 'auto';
  } else if (tooltipMode === 'fixed') {
    tooltipEl.classList.add('tooltip-fixed');
    tooltipEl.style.left = 'auto';
    tooltipEl.style.top = 'auto';
    tooltipEl.style.right = '20px';
    tooltipEl.style.bottom = '20px';
  }
}
