// ============ 后端数据类型 ============

export interface BackendNode {
  id: string;
  name: string;
  sex: string;
  prize_score: number | null;
  active_year: number;
}

export interface BackendLink {
  source: string;
  target: string;
  weight: number;
}

export interface BackendGraphData {
  nodes: BackendNode[];
  links: BackendLink[];
}
