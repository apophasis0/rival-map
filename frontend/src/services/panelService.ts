// ============ 面板状态管理 ============

class PanelService {
  private isPanelCollapsed = false;
  private controlPanel: HTMLElement;
  private fabToggle: HTMLButtonElement;

  constructor() {
    this.controlPanel = document.getElementById('control-panel') as HTMLElement;
    this.fabToggle = document.getElementById('fabToggle') as HTMLButtonElement;
  }

  toggle(): void {
    this.isPanelCollapsed = !this.isPanelCollapsed;
    this.applyState();
    this.saveState();
  }

  restore(): void {
    const savedState = localStorage.getItem('panelCollapsed');
    if (savedState === 'true') {
      this.isPanelCollapsed = true;
      this.applyState();
    }
  }

  private applyState(): void {
    if (this.isPanelCollapsed) {
      this.controlPanel.classList.add('collapsed');
      this.fabToggle.classList.add('visible');
    } else {
      this.controlPanel.classList.remove('collapsed');
      this.fabToggle.classList.remove('visible');
    }
  }

  private saveState(): void {
    localStorage.setItem('panelCollapsed', String(this.isPanelCollapsed));
  }

  get collapsed(): boolean {
    return this.isPanelCollapsed;
  }
}

export const panelService = new PanelService();
