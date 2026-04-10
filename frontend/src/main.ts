import './style.css';
import Graph from 'graphology';
import { appState } from './state/appState';
import { panelService } from './services/panelService';
import { buildGraph } from './services/graphBuilder';
import { initSigma, startLayout } from './services/rendererService';
import { setHighlight, showTooltip } from './services/interactionService';
import type { BackendGraphData } from './types';
import type { SigmaNodeEventPayload } from 'sigma/types';
import { renderCommunityLegend } from './utils/communityUI';

// ============ 全局常量 ============

const API_BASE_URL = 'http://localhost:8000/api/network';

// ============ DOM 元素 ============

const appContainer = document.getElementById('app') as HTMLElement;
const showLabelsToggle = document.getElementById('showLabelsToggle') as HTMLInputElement;
const yearLayoutToggle = document.getElementById('yearLayoutToggle') as HTMLInputElement;
const strictRankToggle = document.getElementById('strictRankToggle') as HTMLInputElement;
const communityToggle = document.getElementById('communityToggle') as HTMLInputElement;
const communityLegendEl = document.getElementById('communityLegend') as HTMLElement;
const weightSlider = document.getElementById('weightSlider') as HTMLInputElement;
const weightValueDisplay = document.getElementById('weightValue') as HTMLSpanElement;
const prizeSlider = document.getElementById('prizeSlider') as HTMLInputElement;
const prizeValueDisplay = document.getElementById('prizeValue') as HTMLSpanElement;
const rankSlider = document.getElementById('rankSlider') as HTMLInputElement;
const rankValueDisplay = document.getElementById('rankValue') as HTMLSpanElement;
const collapseBtn = document.getElementById('collapsePanel') as HTMLButtonElement;
const fabToggle = document.getElementById('fabToggle') as HTMLButtonElement;

// ============ 主渲染函数 ============

async function renderNetwork(
  minWeight: number,
  minPrize: number,
  maxRank: number,
  strictMode: boolean,
  useCommunityMode: boolean,
): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}?minWeight=${minWeight}&minPrize=${minPrize}&maxRank=${maxRank}&strictMode=${strictMode}`);
    const data: BackendGraphData = await response.json();

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

  // 绑定 hover 事件
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
  console.log(`[UpdateGraph] minWeight=${minWeight}, minPrize=${minPrize}, maxRank=${maxRank}, strictMode=${strictMode}, communityMode=${useCommunityMode}`);
  renderNetwork(minWeight, minPrize, maxRank, strictMode, useCommunityMode);
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
updateGraph();
