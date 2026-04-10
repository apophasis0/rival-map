// ============ Sigma 渲染器配置 ============

/** ForceAtlas2 预热阶段配置 */
export const FA2_WARMUP_CONFIG = {
  gravity: 0.05,
  scalingRatio: 15,
  strongGravityMode: true,
  barnesHutOptimize: true,
  barnesHutTheta: 0.8,
  edgeWeightInfluence: 1,
  slowDown: 1,
} as const;

/** ForceAtlas2 微调阶段配置 */
export const FA2_FINETUNE_CONFIG = {
  gravity: 0.05,
  scalingRatio: 15,
  strongGravityMode: true,
  barnesHutTheta: 0.6,
  edgeWeightInfluence: 1,
  adjustSizes: true,
} as const;

/** 高亮颜色配置 */
export const HIGHLIGHT_COLORS = {
  centerNode: '#f59e0b',    // 琥珀色
  oneHopNode: '#3b82f6',    // 蓝色
  twoHopNode: '#9ca3af',    // 灰色
  oneHopEdge: '#1e40af',    // 深蓝色
  twoHopEdge: '#e5e7eb',    // 浅灰色
} as const;

/** 节点大小乘数配置 */
export const NODE_SIZE_MULTIPLIERS = {
  centerNode: 2.0,
  oneHopNode: 1.4,
  twoHopNode: 1.0,
} as const;

/** 边粗细配置 */
export const EDGE_SIZE_CONFIG = {
  oneHopEdge: { base: 3.0, scale: 25.0 },  // 范围 3.0 ~ 28.0（加大对比度）
  twoHopEdge: { base: 0.5, scale: 0.3 },   // 范围 0.5 ~ 0.8
} as const;

/** 默认边配置 */
export const DEFAULT_EDGE_CONFIG = {
  color: '#d0d0d0',
  alphaBase: 0.03,
  alphaScale: 0.77,
  alphaExponent: 0.6,
  alphaMax: 0.8,
  sizeBase: 0.2,
  sizeScale: 1.8,
} as const;

/** 节点初始化配置 */
export const NODE_INIT_CONFIG = {
  initSpreadRatio: 0.1,       // 初始分布为屏幕最小维度的 10%
  yearLayoutPadding: 0.1,     // 年份布局左右各留 10% 边距
  yearLayoutJitter: 0.06,     // 年份布局随机偏移为可用宽度的 6%
} as const;

/** 边过滤配置 */
export const EDGE_FILTER_CONFIG = {
  edgeBudgetMultiplier: 5,    // 边预算 = 节点数 * 5
  edgeBudgetMin: 500,         // 最小边预算 500
} as const;

/** Sigma 渲染器默认设置 */
export const SIGMA_DEFAULT_SETTINGS = {
  renderEdgeLabels: false,
  labelDensity: 0.15,
  labelGridCellSize: 60,
  labelRenderedSizeThreshold: 8,
  labelFont: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  labelSize: 12,
  labelWeight: 'bold',
  labelColor: { color: '#1a202c' },
  enableCameraZooming: true,
  enableCameraPanning: true,
  enableEdgeEvents: true,  // 启用边 hover 事件
  defaultNodeColor: '#4a5568',
  defaultEdgeColor: '#dddddd',
  defaultEdgeType: 'line',
  defaultNodeType: 'circle',
  itemSizesReference: 'positions',
} as const;
