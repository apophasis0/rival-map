import './style.css';
import Graph from 'graphology';
import { appState } from './state/appState';
import { panelService } from './services/panelService';
import { buildGraph } from './services/graphBuilder';
import { initSigma, startLayout } from './services/rendererService';
import { setHighlight, showTooltip, showEdgeTooltip, hideEdgeTooltip, setTooltipMode } from './services/interactionService';
import type { BackendGraphData } from './types';
import type { SigmaNodeEventPayload } from 'sigma/types';
import { renderCommunityLegend } from './utils/communityUI';

// ============ 全局常量 ============

// 开发模式：连接后端 API（需要启动 FastAPI）
// 生产模式：加载静态 JSON 文件（无需后端）
const API_URL = import.meta.env.DEV
  ? 'http://localhost:8000/api/network'
  : '/rival-map/data/network';

/** 统一的数据获取函数 */
async function fetchNetworkData(
  minWeight: number,
  minPrize: number,
  maxRank: number,
  strictMode: boolean,
  includeSire: boolean,
  includeDam: boolean,
): Promise<BackendGraphData> {
  if (import.meta.env.DEV) {
    // 开发模式：调用后端 API
    const response = await fetch(
      `${API_URL}?minWeight=${minWeight}&minPrize=${minPrize}&maxRank=${maxRank}&strictMode=${strictMode}&includeSire=${includeSire}&includeDam=${includeDam}`,
    );
    if (!response.ok) {
      throw new Error(`后端请求失败: ${response.status} ${response.statusText}`);
    }
    return response.json();
  } else {
    // 生产模式：加载静态 JSON（暂不支持血统数据）
    const filename = `${minWeight}_${minPrize}_${maxRank}_${strictMode}.json`;
    const response = await fetch(`${API_URL}/${filename}`);
    if (!response.ok) {
      throw new Error(`未找到数据文件: ${filename} (${response.status})`);
    }
    return response.json();
  }
}

// ============ DOM 元素 ============

const appContainer = document.getElementById('app') as HTMLElement;
const showLabelsToggle = document.getElementById('showLabelsToggle') as HTMLInputElement;
const yearLayoutToggle = document.getElementById('yearLayoutToggle') as HTMLInputElement;
const strictRankToggle = document.getElementById('strictRankToggle') as HTMLInputElement;
const communityToggle = document.getElementById('communityToggle') as HTMLInputElement;
const sireToggle = document.getElementById('sireToggle') as HTMLInputElement;
const damToggle = document.getElementById('damToggle') as HTMLInputElement;
const communityLegendEl = document.getElementById('communityLegend') as HTMLElement;
const weightSlider = document.getElementById('weightSlider') as HTMLInputElement;
const weightValueDisplay = document.getElementById('weightValue') as HTMLSpanElement;
const prizeSlider = document.getElementById('prizeSlider') as HTMLInputElement;
const prizeValueDisplay = document.getElementById('prizeValue') as HTMLSpanElement;
const rankSlider = document.getElementById('rankSlider') as HTMLInputElement;
const rankValueDisplay = document.getElementById('rankValue') as HTMLSpanElement;
const collapseBtn = document.getElementById('collapsePanel') as HTMLButtonElement;
const fabToggle = document.getElementById('fabToggle') as HTMLButtonElement;
const tooltipModeSelect = document.getElementById('tooltipModeSelect') as HTMLSelectElement;

// ============ 主渲染函数 ============

async function renderNetwork(
  minWeight: number,
  minPrize: number,
  maxRank: number,
  strictMode: boolean,
  useCommunityMode: boolean,
  includeSire: boolean,
  includeDam: boolean,
): Promise<void> {
  try {
    const data = await fetchNetworkData(minWeight, minPrize, maxRank, strictMode, includeSire, includeDam);

    const width = window.innerWidth;
    const height = window.innerHeight;
    const useYearLayout = yearLayoutToggle.checked;

    // 构建图（initRenderer 内部会设置 appState.graph）
    const { graph, communityResult } = buildGraph(data, width, height, useYearLayout, useCommunityMode);

    if (graph.order === 0) {
      appState.cleanup();
      appContainer.innerHTML = '';
      communityLegendEl.style.display = 'none';
      console.log('空图谱数据，无节点可渲染');
      return;
    }

    // 渲染社区图例（如果适用）
    renderCommunityLegend(communityLegendEl, communityResult, graph.order);

    // 初始化渲染器（包含事件绑定）
    initRenderer(graph);

    // 启动布局
    startLayout(graph);

    console.log(`Graph rendered: ${graph.order} nodes, ${graph.size} edges`);
  } catch (error) {
    console.error('加载图谱数据失败:', error);
  }
}

/** 初始化渲染器（每次重新渲染时都需要绑定事件） */
function initRenderer(graph: Graph): void {
  const renderer = initSigma(graph);

  // 绑定节点 hover 事件
  renderer.on('enterNode', (event: SigmaNodeEventPayload) => {
    setHighlight(event.node);
    const originalEvent = event.event.original;
    if (originalEvent instanceof MouseEvent) {
      showTooltip(event.node, originalEvent);
    }
  });

  renderer.on('leaveNode', () => {
    setHighlight(null);
  });

  // 绑定边 hover 事件（显示权重）
  renderer.on('enterEdge', (event: { edge: string; event: { original?: Event } }) => {
    const originalEvent = event.event.original;
    if (originalEvent instanceof MouseEvent) {
      showEdgeTooltip(event.edge, originalEvent);
    }
  });

  renderer.on('leaveEdge', () => {
    hideEdgeTooltip();
  });
}

// ============ 事件绑定 ============

// 标签显示开关
showLabelsToggle.addEventListener('change', () => {
  const renderer = appState.renderer;
  if (!renderer) return;

  const labelDensity = showLabelsToggle.checked ? 0.15 : 0;
  renderer.setSetting('labelDensity', labelDensity);
  renderer.refresh();
});

// 滑块输入反馈
weightSlider.addEventListener('input', (e) => {
  weightValueDisplay.innerText = (e.target as HTMLInputElement).value;
});

prizeSlider.addEventListener('input', (e) => {
  prizeValueDisplay.innerText = (e.target as HTMLInputElement).value;
});

// 更新图谱
function updateGraph(): void {
  const minWeight = parseInt(weightSlider.value, 10);
  const minPrize = parseInt(prizeSlider.value, 10);
  const maxRank = parseInt(rankSlider.value, 10) || 18;
  const strictMode = strictRankToggle.checked;
  const useCommunityMode = communityToggle.checked;
  const includeSire = sireToggle.checked;
  const includeDam = damToggle.checked;
  console.log(`[UpdateGraph] minWeight=${minWeight}, minPrize=${minPrize}, maxRank=${maxRank}, strictMode=${strictMode}, communityMode=${useCommunityMode}, sireMode=${includeSire}, damMode=${includeDam}`);
  renderNetwork(minWeight, minPrize, maxRank, strictMode, useCommunityMode, includeSire, includeDam);
}

weightSlider.addEventListener('change', updateGraph);
prizeSlider.addEventListener('change', updateGraph);

// 滑块输入反馈
rankSlider.addEventListener('input', (e) => {
  const val = parseInt((e.target as HTMLInputElement).value, 10);
  rankValueDisplay.innerText = val >= 18 ? '不限' : String(val);
});

rankSlider.addEventListener('change', updateGraph);
strictRankToggle.addEventListener('change', updateGraph);
communityToggle.addEventListener('change', updateGraph);
sireToggle.addEventListener('change', updateGraph);
damToggle.addEventListener('change', updateGraph);

// Tooltip 显示模式切换
tooltipModeSelect.addEventListener('change', () => {
  const mode = tooltipModeSelect.value as 'follow' | 'fixed' | 'hidden';
  setTooltipMode(mode);
  localStorage.setItem('tooltipMode', mode);
});

// 面板折叠/展开
collapseBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  panelService.toggle();
});

fabToggle.addEventListener('click', () => {
  panelService.toggle();
});

// 年份布局
function restoreYearLayoutState(): void {
  const savedState = localStorage.getItem('yearLayout');
  if (savedState === 'true') {
    yearLayoutToggle.checked = true;
  }
}

yearLayoutToggle.addEventListener('change', () => {
  localStorage.setItem('yearLayout', String(yearLayoutToggle.checked));
  updateGraph();
});

// 窗口大小变化
window.addEventListener('resize', () => {
  const renderer = appState.renderer;
  if (renderer) {
    renderer.resize();
  }
});

// ============ 初始化 ============

panelService.restore();
restoreYearLayoutState();
restoreTooltipModeState();
updateGraph();

/** 恢复保存的 tooltip 模式 */
function restoreTooltipModeState(): void {
  const savedMode = localStorage.getItem('tooltipMode') as 'follow' | 'fixed' | 'hidden' | null;
  if (savedMode && ['follow', 'fixed', 'hidden'].includes(savedMode)) {
    setTooltipMode(savedMode);
    tooltipModeSelect.value = savedMode;
  }
}
