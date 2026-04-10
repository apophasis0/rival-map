// ============ 侧边栏状态管理 ============

class PanelService {
  private sidebarContent: HTMLElement;
  private sidebarToggle: HTMLElement;
  private infoTabBtn: HTMLElement;
  private settingsPanel: HTMLElement;
  private infoPanel: HTMLElement;
  private activeTab: 'settings' | 'info' = 'settings';

  constructor() {
    this.sidebarContent = document.getElementById('sidebarContent') as HTMLElement;
    this.sidebarToggle = document.getElementById('sidebarToggle') as HTMLElement;
    this.infoTabBtn = document.getElementById('infoTabBtn') as HTMLElement;
    this.settingsPanel = document.getElementById('settingsPanel') as HTMLElement;
    this.infoPanel = document.getElementById('infoPanel') as HTMLElement;
  }

  /** 切换侧边栏展开/收起 */
  toggle(): void {
    this.sidebarContent.classList.toggle('open');
    const isOpen = this.sidebarContent.classList.contains('open');

    if (isOpen) {
      this.sidebarToggle.classList.add('active');
      this.infoTabBtn.classList.remove('active');
      this.showPanel(this.activeTab);
    } else {
      this.sidebarToggle.classList.remove('active');
      this.infoTabBtn.classList.remove('active');
    }
  }

  /** 切换到信息面板 */
  showInfo(): void {
    if (!this.sidebarContent.classList.contains('open')) {
      this.sidebarContent.classList.add('open');
    }
    this.activeTab = 'info';
    this.infoTabBtn.classList.add('active');
    this.sidebarToggle.classList.remove('active');
    this.showPanel('info');
  }

  /** 切换到设置面板 */
  showSettings(): void {
    if (!this.sidebarContent.classList.contains('open')) {
      this.sidebarContent.classList.add('open');
    }
    this.activeTab = 'settings';
    this.sidebarToggle.classList.add('active');
    this.infoTabBtn.classList.remove('active');
    this.showPanel('settings');
  }

  /** 关闭侧边栏 */
  close(): void {
    this.sidebarContent.classList.remove('open');
    this.sidebarToggle.classList.remove('active');
    this.infoTabBtn.classList.remove('active');
  }

  private showPanel(tab: 'settings' | 'info'): void {
    if (tab === 'settings') {
      this.settingsPanel.classList.remove('hidden');
      this.infoPanel.classList.add('hidden');
    } else {
      this.settingsPanel.classList.add('hidden');
      this.infoPanel.classList.remove('hidden');
    }
  }

  /** 恢复状态 */
  restore(): void {
    const savedState = localStorage.getItem('sidebarOpen');
    if (savedState === 'true') {
      this.sidebarContent.classList.add('open');
      this.showPanel('settings');
      this.sidebarToggle.classList.add('active');
    }
  }

  /** 保存状态 */
  saveState(): void {
    const isOpen = this.sidebarContent.classList.contains('open');
    localStorage.setItem('sidebarOpen', String(isOpen));
  }

  get isOpen(): boolean {
    return this.sidebarContent.classList.contains('open');
  }
}

export const panelService = new PanelService();
