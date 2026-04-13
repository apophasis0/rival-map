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

/** 血统边样式配置（颜色区分） */
export const PEDIGREE_EDGE_CONFIG = {
  sire: {
    color: '#4f46e5',   // 父系：靛蓝色（比宿敌边深）
    size: 1.0,
    alpha: 0.5,
  },
  dam: {
    color: '#ec4899',   // 母系：粉色
    size: 1.0,
    alpha: 0.5,
  },
} as const;

/** 默认边配置 */
export const DEFAULT_EDGE_CONFIG = {
  color: '#d0d0d0',
  alphaBase: 0.008,       // 降低透明度基数（原 0.03），减少边的整体可见度
  alphaScale: 0.5,        // 降低缩放因子（原 0.77），使边的透明度范围更保守
  alphaExponent: 0.6,
  alphaMax: 0.6,          // 降低最大透明度（原 0.8）
  sizeBase: 0.08,         // 降低尺寸基数（原 0.2），使边更细
  sizeScale: 1.2,         // 降低缩放因子（原 1.8），减少尺寸对比
} as const;

/** 节点初始化配置 */
export const NODE_INIT_CONFIG = {
  initSpreadRatio: 0.1,       // 初始分布为屏幕最小维度的 10%
  yearLayoutPadding: 0.1,     // 年份布局左右各留 10% 边距
  yearLayoutJitter: 0.06,     // 年份布局随机偏移为可用宽度的 6%
} as const;

/** 场地布局配置 */
export const TRACK_LAYOUT_CONFIG = {
  yPadding: 0.05,             // Y 轴上下各留 5% 边距
  gaussianStdDev: 0.06,       // 高斯分布标准差（相对于可用高度的比例）
  hurdZoneRatio: 0.15,        // 跳栏区域占底部 15%
  dirtZoneRatio: 0.35,        // 泥地区域占中间 35%
  turfZoneRatio: 0.45,        // 草地区域占上方 45%
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
  defaultNodeColor: '#63b3ed',  // 更亮的节点颜色（原 #4a5568），提高可视性
  defaultEdgeColor: '#dddddd',
  defaultEdgeType: 'line',
  defaultNodeType: 'circle',
  itemSizesReference: 'positions',
  // 节点描边配置：增强节点边界，使其在密集边中更醒目
  nodeBorderColor: '#ffffff',
  nodeBorderSize: 0.5,
  nodeBorderSizeMultiplier: 1.5,  // 节点越大，描边越粗
} as const;
