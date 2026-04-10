import type { CommunityResult } from '../services/graphBuilder';

export const COMMUNITY_LABELS = [
  '派系 α', '派系 β', '派系 γ', '派系 δ', '派系 ε',
  '派系 ζ', '派系 η', '派系 θ', '派系 ι', '派系 κ',
  '派系 λ', '派系 μ', '派系 ν', '派系 ξ', '派系 ο',
  '派系 π', '派系 ρ', '派系 σ', '派系 τ', '派系 υ',
];

/**
 * 渲染社区图例到 DOM
 * 只有在检测到多个社区时才显示
 */
export function renderCommunityLegend(
  el: HTMLElement,
  communityResult: CommunityResult,
  totalNodes: number,
): void {
  if (!communityResult.stats || communityResult.stats.length <= 1) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }

  el.style.display = 'block';

  const items = communityResult.stats
    .map(
      (s) => {
        const label = COMMUNITY_LABELS[s.id] ?? `Community #${s.id}`;
        const pct = ((s.count / totalNodes) * 100).toFixed(1);
        return `<div class="legend-item">
          <span class="legend-color" style="background-color: ${s.color};"></span>
          <span class="legend-label">${label}</span>
          <span class="legend-count">${s.count}匹 (${pct}%)</span>
        </div>`;
      },
    )
    .join('');

  el.innerHTML = `
    <div class="legend-title">社区发现结果 — ${communityResult.stats.length} 个派系</div>
    ${items}
  `;
}
