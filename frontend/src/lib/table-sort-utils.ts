/**
 * Table Sorting Utilities (Simplified for new table structure)
 *
 * Shared sorting logic for table features that can be used across components
 */

import type { FeatureTableRow, FeatureTableDataResponse, SortBy, SortDirection } from '../types'
import { calculateOverallScore, calculateOverallConsistency, compareValues, getConsistencyValueForSorting } from './d3-table-utils'

/**
 * Sort features based on simplified sort configuration
 *
 * Supports sorting by:
 * - featureId: Sort by feature ID number
 * - overallScore: Sort by overall score across all explainers
 * - overallConsistency: Sort by overall consistency across all explainers
 * - llm_scorer_consistency: Sort by LLM Scorer consistency
 * - within_explanation_score: Sort by Within-explanation score consistency
 * - cross_explanation_score: Sort by Cross-explanation score consistency
 * - llm_explainer_consistency: Sort by LLM Explainer consistency
 *
 * @param features - Array of features to sort
 * @param sortBy - Sort key
 * @param sortDirection - Sort direction (asc/desc)
 * @param tableData - Full table data for context (global stats, explainer IDs)
 * @returns Sorted copy of features array
 */
export function sortFeatures(
  features: FeatureTableRow[],
  sortBy: SortBy | null,
  sortDirection: SortDirection | null,
  tableData: FeatureTableDataResponse | null
): FeatureTableRow[] {
  // If no sort config or no features, return as-is
  if (!sortBy || !sortDirection || !features || features.length === 0) {
    return features
  }

  // Create a copy to avoid mutating original
  const sortedFeatures = [...features]

  sortedFeatures.sort((a, b) => {
    if (sortBy === 'featureId') {
      // Sort by feature ID (numeric)
      return sortDirection === 'asc'
        ? a.feature_id - b.feature_id
        : b.feature_id - a.feature_id
    }

    if (sortBy === 'overallScore') {
      // Calculate overall score across all explainers
      const overallScoreA = calculateAvgOverallScore(a, tableData)
      const overallScoreB = calculateAvgOverallScore(b, tableData)
      return compareValues(overallScoreA, overallScoreB, sortDirection)
    }

    if (sortBy === 'overallConsistency') {
      // Calculate overall consistency across all explainers
      const overallConsistencyA = calculateMinOverallConsistency(a, tableData)
      const overallConsistencyB = calculateMinOverallConsistency(b, tableData)
      return compareValues(overallConsistencyA, overallConsistencyB, sortDirection)
    }

    // Individual consistency metric sorting
    if (sortBy === 'llm_scorer_consistency') {
      const explainerIds = tableData?.explainer_ids || []
      const consistencyA = getConsistencyValueForSorting(a, 'llm_scorer_consistency', explainerIds)
      const consistencyB = getConsistencyValueForSorting(b, 'llm_scorer_consistency', explainerIds)
      return compareValues(consistencyA, consistencyB, sortDirection)
    }

    if (sortBy === 'within_explanation_score') {
      const explainerIds = tableData?.explainer_ids || []
      const consistencyA = getConsistencyValueForSorting(a, 'within_explanation_score', explainerIds)
      const consistencyB = getConsistencyValueForSorting(b, 'within_explanation_score', explainerIds)
      return compareValues(consistencyA, consistencyB, sortDirection)
    }

    if (sortBy === 'cross_explanation_score') {
      const explainerIds = tableData?.explainer_ids || []
      const consistencyA = getConsistencyValueForSorting(a, 'cross_explanation_score', explainerIds)
      const consistencyB = getConsistencyValueForSorting(b, 'cross_explanation_score', explainerIds)
      return compareValues(consistencyA, consistencyB, sortDirection)
    }

    if (sortBy === 'llm_explainer_consistency') {
      const explainerIds = tableData?.explainer_ids || []
      const consistencyA = getConsistencyValueForSorting(a, 'llm_explainer_consistency', explainerIds)
      const consistencyB = getConsistencyValueForSorting(b, 'llm_explainer_consistency', explainerIds)
      return compareValues(consistencyA, consistencyB, sortDirection)
    }

    return 0
  })

  return sortedFeatures
}

/**
 * Calculate average overall score across all explainers for a feature
 *
 * @param feature - Feature row
 * @param tableData - Table data with global stats
 * @returns Average overall score or null
 */
function calculateAvgOverallScore(
  feature: FeatureTableRow,
  tableData: FeatureTableDataResponse | null
): number | null {
  if (!tableData?.global_stats) return null

  const explainerIds = Object.keys(feature.explainers)
  const scores: number[] = []

  for (const explainerId of explainerIds) {
    const explainerData = feature.explainers[explainerId]
    if (!explainerData) continue

    const score = calculateOverallScore(
      explainerData.embedding,
      explainerData.fuzz,
      explainerData.detection,
      tableData.global_stats
    )

    if (score !== null) {
      scores.push(score)
    }
  }

  if (scores.length === 0) return null
  return scores.reduce((sum, s) => sum + s, 0) / scores.length
}

/**
 * Calculate minimum overall consistency across all explainers for a feature
 *
 * @param feature - Feature row
 * @param tableData - Table data with explainer IDs
 * @returns Minimum overall consistency or null
 */
function calculateMinOverallConsistency(
  feature: FeatureTableRow,
  tableData: FeatureTableDataResponse | null
): number | null {
  if (!tableData) return null

  const explainerIds = Object.keys(feature.explainers)
  const consistencies: number[] = []

  for (const explainerId of explainerIds) {
    const overallConsistency = calculateOverallConsistency(feature, explainerId)
    if (overallConsistency !== null) {
      consistencies.push(overallConsistency)
    }
  }

  if (consistencies.length === 0) return null
  return Math.min(...consistencies)
}
