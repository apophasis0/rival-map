import Graph from 'graphology';

// ============ 图算法 ============

/** 获取两跳邻居集合 */
export function getTwoHopNeighbors(graph: Graph, centerId: string): Set<string> {
  const result = new Set<string>();
  result.add(centerId); // 0 跳：自身

  const oneHop = new Set<string>();
  graph.forEachNeighbor(centerId, (neighbor) => {
    oneHop.add(neighbor);
    result.add(neighbor);
  });

  // 2 跳
  for (const neighborId of oneHop) {
    graph.forEachNeighbor(neighborId, (twoHopNeighbor) => {
      result.add(twoHopNeighbor);
    });
  }

  return result;
}
