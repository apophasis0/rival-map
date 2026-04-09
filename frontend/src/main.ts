import './style.css';
import Graph from 'graphology';
import Sigma from 'sigma';
import FA2Layout from 'graphology-layout-forceatlas2/worker';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import type { NodeDisplayData, EdgeDisplayData, SigmaNodeEventPayload } from 'sigma/types';
import type { Settings } from 'sigma/settings';

// ============ 类型定义 ============

interface BackendNode {
  id: string;
  name: string;
  sex: string;
  prize_score: number | null;
  active_year: number;
}

interface BackendLink {
  source: string;
  target: string;
  weight: number;
}

interface BackendGraphData {
  nodes: BackendNode[];
  links: BackendLink[];
}

// ============ 全局常量 ============

const API_BASE_URL = 'http://localhost:8000/api/network';

// ============ DOM 元素 ============

const appContainer = document.getElementById('app') as HTMLElement;
const tooltipEl = document.getElementById('tooltip') as HTMLElement;
const showLabelsToggle = document.getElementById('showLabelsToggle') as HTMLInputElement;
const weightSlider = document.getElementById('weightSlider') as HTMLInputElement;
const weightValueDisplay = document.getElementById('weightValue') as HTMLSpanElement;
const prizeSlider = document.getElementById('prizeSlider') as HTMLInputElement;
const prizeValueDisplay = document.getElementById('prizeValue') as HTMLSpanElement;

// ============ 工具函数 ============

/** 根据奖金计算节点大小（Sigma 的 size 属性） */
function getNodeSize(prize: number | null): number {
  if (!prize) return 4;
  return Math.max(4, Math.sqrt(prize) * 0.1);
}

/** 根据奖金计算节点颜色（靛蓝 → 亮紫 → 橘橙 三段式），柔和明亮适配浅色背景 */
function getNodeColorHex(prize: number | null, maxPrize: number): string {
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

/** 线性插值颜色，返回 #rrggbb */
function lerpColorHex(a: [number, number, number], b: [number, number, number], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

/** 获取两跳邻居集合 */
function getTwoHopNeighbors(graph: Graph, centerId: string): Set<string> {
  const result = new Set<string>();
  result.add(centerId); // 0 跳：自身

  const oneHop = new Set<string>();
  graph.forEachNeighbor(centerId, (neighbor) => {
    oneHop.add(neighbor);
    result.add(neighbor);
  });

  // 2 跳
  for (const neighborId of oneHop) {
    graph.forEachNeighbor(neighborId, (twoHopNeighbor) => {
      result.add(twoHopNeighbor);
    });
  }

  return result;
}

/** 根据性别代码返回中文描述 */
function getSexText(sex: string): string {
  if (sex === 'male') return '牡马 (公)';
  if (sex === 'female') return '牝马 (母)';
  if (sex === 'gelding') return '骟马 (阉)';
  return sex;
}

/** 格式化奖金文本 */
function formatPrize(prize: number | null): string {
  if (!prize) return '无数据';
  return `约 ${Math.round(prize)} 万日元`;
}

// ============ 图数据构建 ============

/** 将后端返回的数据转换为 graphology Graph 实例 */
function buildGraph(data: BackendGraphData, width: number, height: number): Graph {
  const graph = new Graph();

  if (data.nodes.length === 0) return graph;

  // 计算全局映射参数
  const maxPrize = Math.max(...data.nodes.map((n) => n.prize_score ?? 0), 1000);
  const nodeCount = data.nodes.length;

  // 添加节点 — 初始位置以屏幕中心为基点的小范围随机
  // synchronous FA2 预热会重新分配位置，这里只需要避免全零导致算法异常
  const centerX = width / 2;
  const centerY = height / 2;
  const initSpread = Math.min(width, height) * 0.1;
  for (const node of data.nodes) {
    const x = centerX + (Math.random() - 0.5) * initSpread;
    const y = centerY + (Math.random() - 0.5) * initSpread;

    graph.addNode(node.id, {
      x,
      y,
      size: getNodeSize(node.prize_score),
      color: getNodeColorHex(node.prize_score, maxPrize),
      label: node.name,
      // 业务属性
      name: node.name,
      sex: node.sex,
      prize_score: node.prize_score,
      active_year: node.active_year,
    });
  }

  // 添加边 — 动态过滤 + 自适应透明度/粗细
  const maxWeight = Math.max(...data.links.map((l) => l.weight), 1);

  // 计算动态过滤阈值：边数过多时只保留重要边
  const edgeBudget = Math.max(nodeCount * 5, 500); // 边的"预算"
  let edgeVisibilityThreshold = 1;
  if (data.links.length > edgeBudget) {
    // 按 weight 降序排序，取前 edgeBudget 条边的最小 weight 作为阈值
    const sortedWeights = [...data.links].map((l) => l.weight).sort((a, b) => b - a);
    edgeVisibilityThreshold = sortedWeights[Math.min(edgeBudget - 1, sortedWeights.length - 1)];
    console.log(`[Edge] 边数 ${data.links.length} 超过预算 ${edgeBudget}，动态过滤阈值: ${edgeVisibilityThreshold}`);
  }

  let visibleEdgeCount = 0;
  for (const link of data.links) {
    if (link.weight < edgeVisibilityThreshold) continue;
    if (!graph.hasNode(link.source) || !graph.hasNode(link.target)) continue;

    visibleEdgeCount++;
    // 自适应透明度：weight 越高越不透明，使用幂函数使低 weight 边更淡
    const normalizedWeight = link.weight / maxWeight;
    const alpha = 0.03 + 0.77 * Math.pow(normalizedWeight, 0.6);
    // 自适应粗细：低 weight 边几乎看不见
    const size = 0.2 + 1.8 * normalizedWeight;

    graph.addEdge(link.source, link.target, {
      weight: link.weight,
      size,
      color: '#2c5282',
      alpha: Math.min(0.8, alpha),
    });
  }

  console.log(`[Edge] 可见边数: ${visibleEdgeCount} / ${data.links.length} (阈值: ${edgeVisibilityThreshold})`);

  return graph;
}

// ============ Sigma 渲染器 ============

let currentGraph: Graph | null = null;
let renderer: Sigma | null = null;
let fa2Layout: FA2Layout | null = null;

/** 创建并启动 Sigma 渲染器 */
function initSigma(graph: Graph): Sigma {
  // 销毁旧渲染器
  if (renderer) {
    renderer.kill();
  }

  // 停止旧布局
  if (fa2Layout) {
    fa2Layout.kill();
    fa2Layout = null;
  }

  // 清空容器
  appContainer.innerHTML = '';

  const sigmaInstance = new Sigma(graph, appContainer, {
    // 隐藏边标签
    renderEdgeLabels: false,
    // 节点标签密度（0-1，值越大显示越多标签）
    labelDensity: 0.15,
    labelGridCellSize: 60,
    labelRenderedSizeThreshold: 8,
    // 节点标签样式
    labelFont: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    labelSize: 12,
    labelWeight: 'bold',
    labelColor: { color: '#1a202c' },
    // 自定义标签绘制：深色文字 + 浅色描边，确保在浅色背景下清晰可读
    defaultDrawNodeLabel: (ctx, data, _settings) => {
      if (!data.label) return;
      const fontSize = _settings.labelSize;
      ctx.font = `bold ${fontSize}px ${_settings.labelFont}`;
      const x = data.x + data.size + 3;
      const y = data.y + fontSize / 3;
      // 白色描边
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeText(data.label, x, y);
      // 深色文字
      ctx.fillStyle = '#1a202c';
      ctx.fillText(data.label, x, y);
    },
    // 缩放/平移
    enableCameraZooming: true,
    enableCameraPanning: true,
    // 默认节点颜色
    defaultNodeColor: '#4a5568',
    defaultEdgeColor: '#dddddd',
    defaultEdgeType: 'line',
    defaultNodeType: 'circle',
    // 节点大小参考
    itemSizesReference: 'positions',
  });

  return sigmaInstance;
}

/** 启动 ForceAtlas2 布局（Synchronous 预热 + Worker 微调） */
function startLayout(graph: Graph): void {
  if (fa2Layout) {
    fa2Layout.kill();
  }

  const nodeCount = graph.order;

  // ---- 阶段 1：Synchronous FA2 预热 ----
  // 根据节点数量动态决定迭代次数
  const warmupIterations = nodeCount > 5000 ? 50 : nodeCount > 1000 ? 80 : 100;
  const warmupSettings: Record<string, unknown> = {
    gravity: 0.05,
    scalingRatio: 15,
    strongGravityMode: true,
    barnesHutOptimize: true,       // 大规模图必须开启
    barnesHutTheta: 0.8,           // 预热阶段用更大的 theta 加速
    edgeWeightInfluence: 1,
    slowDown: 1,                   // 预热不需要 slowDown
  };

  console.log(`[FA2] 开始 synchronous 预热: ${warmupIterations} 迭代 (${nodeCount} 节点)`);
  const warmupStart = performance.now();

  // forceAtlas2.assign 直接修改图上的 x/y 属性
  forceAtlas2.assign(graph, {
    iterations: warmupIterations,
    getEdgeWeight: 'weight',
    settings: warmupSettings,
  });

  const warmupElapsed = performance.now() - warmupStart;
  console.log(`[FA2] synchronous 预热完成: ${warmupElapsed.toFixed(0)}ms`);

  // ---- 阶段 2：Worker FA2 持续微调 ----
  const fineTuneSettings: Record<string, unknown> = {
    gravity: 0.05,
    scalingRatio: 15,
    strongGravityMode: true,
    barnesHutOptimize: nodeCount > 500,
    barnesHutTheta: 0.6,
    edgeWeightInfluence: 1,
    slowDown: Math.max(3, 1 + Math.log(nodeCount)),
    adjustSizes: true,
  };

  fa2Layout = new FA2Layout(graph, {
    settings: fineTuneSettings,
  });

  fa2Layout.start();

  // 大数据量：运行固定时间后停止，避免无限运行
  // 小数据量：保持运行以允许用户拖拽后重新稳定
  if (nodeCount > 2000) {
    setTimeout(() => {
      if (fa2Layout && fa2Layout.isRunning()) {
        fa2Layout.stop();
      }
    }, 60000); // 60 秒后停止
  }
}

// ============ 交互逻辑 ============

/** 设置高亮状态 */
function setHighlight(centerNodeId: string | null): void {
  if (!renderer || !currentGraph) return;

  if (centerNodeId === null) {
    // 清除高亮
    renderer.setSetting('nodeReducer', null);
    renderer.setSetting('edgeReducer', null);
    tooltipEl.style.opacity = '0';

    // 如果标签开关未勾选，恢复低密度模式（隐藏所有标签）
    if (!showLabelsToggle.checked) {
      renderer.setSetting('labelDensity', 0);
    } else {
      renderer.setSetting('labelDensity', 0.15);
    }
    return;
  }

  const twoHop = getTwoHopNeighbors(currentGraph, centerNodeId);

  // 分离 1-hop 节点（直接与中心节点相连）和边
  const oneHopNodes = new Set<string>();
  const oneHopEdges = new Set<string>();
  const twoHopEdges = new Set<string>();

  currentGraph.forEachNeighbor(centerNodeId, (neighbor) => {
    if (twoHop.has(neighbor)) {
      oneHopNodes.add(neighbor);
    }
  });

  // 预计算所有边的最大 weight，用于归一化
  let maxEdgeWeight = 1;
  currentGraph.forEachEdge((edge) => {
    const weight = currentGraph!.getEdgeAttributes(edge).weight ?? 1;
    if (weight > maxEdgeWeight) maxEdgeWeight = weight;
  });

  currentGraph.forEachEdge((edge, _attrs, source, target) => {
    if (!twoHop.has(source) || !twoHop.has(target)) return;
    if (source === centerNodeId || target === centerNodeId) {
      oneHopEdges.add(edge);
    } else {
      twoHopEdges.add(edge);
    }
  });

  // 如果标签开关未勾选，hover 时动态显示相关标签
  if (!showLabelsToggle.checked) {
    renderer.setSetting('labelDensity', 1); // 允许显示所有标签
  }

  // 创建 nodeReducer 闭包：为不同层级的节点添加大小区分
  const nodeReducer = (node: string, data: Parameters<NonNullable<Settings['nodeReducer']>>[1]): Partial<NodeDisplayData> => {
    const isVisible = twoHop.has(node);
    
    if (!isVisible) {
      return { ...data, hidden: true };
    }
    
    // 节点可见，计算基础结果
    let baseResult: Partial<NodeDisplayData> = { ...data, hidden: false };
    
    // 标签开关未勾选时，控制标签显示
    if (!showLabelsToggle.checked) {
      baseResult = {
        ...baseResult,
        forceLabel: node === centerNodeId ? true : data.forceLabel,
      };
    }
    
    // 为不同层级添加大小区分（在原始 size 基础上放大）
    const originalSize = data.size;
    if (node === centerNodeId) {
      // 中心节点：放大 2 倍
      return {
        ...baseResult,
        size: originalSize * 2.0,
        color: '#f59e0b', // 琥珀色
      };
    } else if (oneHopNodes.has(node)) {
      // 1-hop 邻居：放大 1.4 倍
      return {
        ...baseResult,
        size: originalSize * 1.4,
      };
    } else {
      // 2-hop 邻居：保持原大小
      return baseResult;
    }
  };

  // 创建 edgeReducer 闭包：1-hop 和 2-hop 边使用多通道视觉区分
  // 方案：极大的粗细差异 + 颜色对比
  const edgeReducer = (edge: string, data: Parameters<NonNullable<Settings['edgeReducer']>>[1]): Partial<EdgeDisplayData> => {
    // 获取边的原始 weight 属性并归一化
    const edgeWeight = currentGraph!.getEdgeAttributes(edge).weight ?? 1;
    const normalizedWeight = edgeWeight / maxEdgeWeight;

    if (oneHopEdges.has(edge)) {
      // 1-hop 边：深蓝色，非常粗
      const size = 6.0 + 10.0 * normalizedWeight; // 范围约 6.0 ~ 16.0
      return {
        ...data,
        hidden: false,
        color: '#1e40af', // 深蓝
        size,
      };
    }
    if (twoHopEdges.has(edge)) {
      // 2-hop 边：浅灰色，极细（让它几乎融入背景）
      const size = 0.4 + 0.2 * normalizedWeight; // 范围约 0.4 ~ 0.6
      return {
        ...data,
        hidden: false,
        color: '#e5e7eb', // 浅灰（接近背景色）
        size,
      };
    }
    return { ...data, hidden: true };
  };

  renderer.setSetting('nodeReducer', nodeReducer);
  renderer.setSetting('edgeReducer', edgeReducer);
  renderer.refresh();
}

/** 显示 Tooltip */
function showTooltip(nodeId: string, event: MouseEvent): void {
  if (!currentGraph) return;
  const attrs = currentGraph.getNodeAttributes(nodeId);
  const prizeText = formatPrize(attrs.prize_score);
  const sexText = getSexText(attrs.sex);

  tooltipEl.style.opacity = '1';
  tooltipEl.innerHTML = `
    <strong>${attrs.name}</strong>
    <span style="font-size: 12px; color: #a0aec0; font-weight: normal;">(ID: ${nodeId})</span><br>
    <span style="color: #cbd5e1;">性别:</span> ${sexText}<br>
    <span style="color: #cbd5e1;">总奖金:</span> <span style="color: #ffd700;">${prizeText}</span>
  `;
  tooltipEl.style.left = (event.pageX + 20) + 'px';
  tooltipEl.style.top = (event.pageY - 20) + 'px';
}

// ============ 主渲染函数 ============

async function renderNetwork(minWeight: number, minPrize: number): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}?minWeight=${minWeight}&minPrize=${minPrize}`);
    const data: BackendGraphData = await response.json();

    const width = window.innerWidth;
    const height = window.innerHeight;

    // 构建 graphology 图
    currentGraph = buildGraph(data, width, height);

    if (currentGraph.order === 0) {
      // 空图：清理渲染器和布局
      if (renderer) {
        renderer.kill();
        renderer = null;
      }
      if (fa2Layout) {
        fa2Layout.kill();
        fa2Layout = null;
      }
      appContainer.innerHTML = '';
      console.log('空图谱数据，无节点可渲染');
      return;
    }

    // 初始化 Sigma 渲染器
    renderer = initSigma(currentGraph);

    // 绑定 hover 事件
    renderer.on('enterNode', (event: SigmaNodeEventPayload) => {
      setHighlight(event.node);
      // 从 original 事件获取真实的 MouseEvent 以获取 page 坐标
      const originalEvent = event.event.original;
      if (originalEvent instanceof MouseEvent) {
        showTooltip(event.node, originalEvent);
      }
    });

    renderer.on('leaveNode', () => {
      setHighlight(null);
    });

    // 启动 ForceAtlas2 布局
    startLayout(currentGraph);

    console.log(`Graph rendered: ${currentGraph.order} nodes, ${currentGraph.size} edges`);
  } catch (error) {
    console.error('加载图谱数据失败:', error);
  }
}

// ============ 标签显示开关 ============

showLabelsToggle.addEventListener('change', () => {
  if (!renderer) return;
  if (showLabelsToggle.checked) {
    // 显示所有标签
    renderer.setSetting('labelDensity', 0.15);
  } else {
    // 隐藏所有标签（等待 hover 触发）
    renderer.setSetting('labelDensity', 0);
  }
  renderer.refresh();
});

// ============ 滑块事件绑定 ============

weightSlider.addEventListener('input', (e) => {
  weightValueDisplay.innerText = (e.target as HTMLInputElement).value;
});

prizeSlider.addEventListener('input', (e) => {
  prizeValueDisplay.innerText = (e.target as HTMLInputElement).value;
});

function updateGraph(): void {
  const minWeight = parseInt(weightSlider.value, 10);
  const minPrize = parseInt(prizeSlider.value, 10);
  renderNetwork(minWeight, minPrize);
}

weightSlider.addEventListener('change', updateGraph);
prizeSlider.addEventListener('change', updateGraph);

// 窗口大小变化时重新渲染
window.addEventListener('resize', () => {
  if (renderer) {
    renderer.resize();
  }
});

// 首次加载
updateGraph();
