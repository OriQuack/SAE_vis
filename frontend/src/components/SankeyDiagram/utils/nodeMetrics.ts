import type { D3SankeyNode, MetricType } from '../../../services/types'

export function getParentNodeName(parentNodeId: string, allNodes: D3SankeyNode[]): string {
  const parentNode = allNodes.find(node => node.id === parentNodeId)
  return parentNode ? parentNode.name : parentNodeId
}

export function getMetricsForNode(node: D3SankeyNode): MetricType[] | null {
  switch (node.category) {
    case 'root':
      return null // No histogram for "All Features" - nothing to threshold yet

    case 'feature_splitting':
      return null // No histogram for feature splitting - it's a boolean field (true/false/null), not a continuous metric

    case 'semantic_distance':
      return ['semdist_mean'] // Single histogram for semantic distance classification

    case 'score_agreement':
      return ['score_detection', 'score_fuzz', 'score_simulation'] // Three stacked histograms for score agreement

    default:
      return null
  }
}