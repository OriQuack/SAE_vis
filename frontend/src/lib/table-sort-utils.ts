/**
 * Table Sorting Utilities
 *
 * Shared sorting logic for table features that can be used across components
 */

import type { FeatureTableRow, FeatureTableDataResponse, SortBy, SortDirection } from '../types'
import { getConsistencyValueForSorting, getScoreValue, compareValues } from './d3-table-utils'

/**
 * Sort features based on sort configuration
 *
 * @param features - Array of features to sort
 * @param sortBy - Sort configuration
 * @param sortDirection - Sort direction (asc/desc)
 * @param tableData - Full table data for context (explainer IDs, etc.)
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
    let valueA: number | null = null
    let valueB: number | null = null

    if (sortBy.type === 'consistency') {
      // Sort by consistency value
      valueA = getConsistencyValueForSorting(a, sortBy.consistencyType, tableData?.explainer_ids || [])
      valueB = getConsistencyValueForSorting(b, sortBy.consistencyType, tableData?.explainer_ids || [])
    } else if (sortBy.type === 'column') {
      // Sort by column score value
      valueA = getScoreValue(a, sortBy.explainerId, sortBy.metricType, sortBy.scorerId)
      valueB = getScoreValue(b, sortBy.explainerId, sortBy.metricType, sortBy.scorerId)
    }

    return compareValues(valueA, valueB, sortDirection)
  })

  return sortedFeatures
}
