import Graph from 'graphology';
import Sigma from 'sigma';
import FA2Layout from 'graphology-layout-forceatlas2/worker';

// ============ 全局状态管理 ============

class AppState {
  private _graph: Graph | null = null;
  private _renderer: Sigma | null = null;
  private _fa2Layout: FA2Layout | null = null;

  get graph(): Graph | null {
    return this._graph;
  }

  set graph(value: Graph | null) {
    this._graph = value;
  }

  get renderer(): Sigma | null {
    return this._renderer;
  }

  set renderer(value: Sigma | null) {
    this._renderer = value;
  }

  get fa2Layout(): FA2Layout | null {
    return this._fa2Layout;
  }

  set fa2Layout(value: FA2Layout | null) {
    this._fa2Layout = value;
  }

  /** 清理所有状态 */
  cleanup(): void {
    if (this._renderer) {
      this._renderer.kill();
      this._renderer = null;
    }
    if (this._fa2Layout) {
      this._fa2Layout.kill();
      this._fa2Layout = null;
    }
    this._graph = null;
  }
}

// 单例导出
export const appState = new AppState();
