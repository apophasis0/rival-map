// ============ 后端数据类型 ============

export interface BackendNode {
  id: string;
  name: string;
  sex: string;
  prize_score: number | null;
  active_year: number;
}

export type LinkType = 'rival' | 'sire' | 'dam';

export interface BackendLink {
  source: string;
  target: string;
  weight: number;
  linkType?: LinkType;  // 'rival'=宿敌(实线), 'sire'=父系(虚线), 'dam'=母系(虚线)
}

export interface BackendGraphData {
  nodes: BackendNode[];
  links: BackendLink[];
}
