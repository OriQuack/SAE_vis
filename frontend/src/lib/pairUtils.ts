/**
 * Pair Utilities
 *
 * Simple utilities for working with feature pairs.
 * Provides canonical pair key generation to avoid duplication across the codebase.
 */

/**
 * Generate canonical pair key with smaller ID first.
 *
 * @param id1 First feature ID
 * @param id2 Second feature ID
 * @returns Canonical pair key in format "{smaller}-{larger}"
 *
 * @example
 * getCanonicalPairKey(5, 3)   // Returns "3-5"
 * getCanonicalPairKey(10, 20) // Returns "10-20"
 */
export function getCanonicalPairKey(id1: number, id2: number): string {
  return id1 < id2 ? `${id1}-${id2}` : `${id2}-${id1}`
}

/**
 * Parse pair key into individual feature IDs.
 *
 * @param pairKey Pair key in format "{id1}-{id2}"
 * @returns Tuple of [id1, id2] where id1 < id2
 *
 * @example
 * parsePairKey("3-5")   // Returns [3, 5]
 * parsePairKey("10-20") // Returns [10, 20]
 */
export function parsePairKey(pairKey: string): [number, number] {
  const [id1Str, id2Str] = pairKey.split('-')
  const id1 = parseInt(id1Str, 10)
  const id2 = parseInt(id2Str, 10)
  return [id1, id2]
}

/**
 * Check if both features in a pair are in the selected feature set.
 *
 * @param pairKey Pair key to check
 * @param selectedFeatureIds Set of selected feature IDs
 * @returns true if both features are in selection, false otherwise
 *
 * @example
 * isPairInSelection("3-5", new Set([3, 5, 10])) // Returns true
 * isPairInSelection("3-5", new Set([3, 10]))    // Returns false
 */
export function isPairInSelection(
  pairKey: string,
  selectedFeatureIds: Set<number>
): boolean {
  const [id1, id2] = parsePairKey(pairKey)
  return selectedFeatureIds.has(id1) && selectedFeatureIds.has(id2)
}
