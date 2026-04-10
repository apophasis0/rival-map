import Graph from 'graphology';
import Sigma from 'sigma';
import FA2Layout from 'graphology-layout-forceatlas2/worker';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import { appState } from '../state/appState';
import {
  FA2_WARMUP_CONFIG,
  FA2_FINETUNE_CONFIG,
  SIGMA_DEFAULT_SETTINGS,
} from '../config/sigmaConfig';

// ============ Sigma 渲染器管理 ============

/** 创建并启动 Sigma 渲染器 */
export function initSigma(graph: Graph): Sigma {
  // 只清理旧的渲染器和布局，不清理 graph
  if (appState.renderer) {
    appState.renderer.kill();
  }
  if (appState.fa2Layout) {
    appState.fa2Layout.kill();
    appState.fa2Layout = null;
  }

  const appContainer = document.getElementById('app') as HTMLElement;
  appContainer.innerHTML = '';

  const sigmaInstance = new Sigma(graph, appContainer, {
    ...SIGMA_DEFAULT_SETTINGS,
    // 自定义标签绘制：深色文字 + 浅色描边
    defaultDrawNodeLabel: (ctx: CanvasRenderingContext2D, data: any, settings: any) => {
      if (!data.label) return;
      const fontSize = settings.labelSize;
      ctx.font = `bold ${fontSize}px ${settings.labelFont}`;
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
  });

  // 同时设置 graph 和 renderer
  appState.graph = graph;
  appState.renderer = sigmaInstance;
  return sigmaInstance;
}

/** 计算 FA2 预热迭代次数 */
function calculateWarmupIterations(nodeCount: number): number {
  if (nodeCount > 5000) return 50;
  if (nodeCount > 1000) return 80;
  return 100;
}

/** 启动 ForceAtlas2 布局（Synchronous 预热 + Worker 微调） */
export function startLayout(graph: Graph): void {
  // 停止旧布局
  if (appState.fa2Layout) {
    appState.fa2Layout.kill();
    appState.fa2Layout = null;
  }

  const nodeCount = graph.order;

  // ---- 阶段 1：Synchronous FA2 预热 ----
  const warmupIterations = calculateWarmupIterations(nodeCount);
  console.log(`[FA2] 开始 synchronous 预热: ${warmupIterations} 迭代 (${nodeCount} 节点)`);
  const warmupStart = performance.now();

  forceAtlas2.assign(graph, {
    iterations: warmupIterations,
    getEdgeWeight: 'weight',
    settings: FA2_WARMUP_CONFIG,
  });

  const warmupElapsed = performance.now() - warmupStart;
  console.log(`[FA2] synchronous 预热完成: ${warmupElapsed.toFixed(0)}ms`);

  // ---- 阶段 2：Worker FA2 持续微调 ----
  const fineTuneSettings = {
    ...FA2_FINETUNE_CONFIG,
    barnesHutOptimize: nodeCount > 500,
    slowDown: Math.max(3, 1 + Math.log(nodeCount)),
  };

  const fa2Layout = new FA2Layout(graph, {
    settings: fineTuneSettings,
  });

  fa2Layout.start();
  appState.fa2Layout = fa2Layout;

  // 大数据量：运行固定时间后停止
  if (nodeCount > 2000) {
    setTimeout(() => {
      if (appState.fa2Layout && appState.fa2Layout.isRunning()) {
        appState.fa2Layout.stop();
      }
    }, 60000); // 60 秒后停止
  }
}
