/**
 * Export utilities - Pure functions for building export data and downloading JSON.
 * Used by CauseView (download) and OverviewSummary (display counts).
 */

import { deriveFeatureSetsFromPairSelections } from './sankey-builder'
import type { SimplifiedSankeyNode } from '../types'
import type { Stage1FinalCommit, Stage2FinalCommit } from '../store'

// ============================================================================
// TYPES
// ============================================================================

interface SourceBuckets {
  manual: number[]
  auto: number[]
}

interface SourceBucketsWithThreshold extends SourceBuckets {
  thresholded: number[]
}

export interface ExportData {
  exportedAt: string
  stage1_featureSplitting: {
    incoherentSplitting: SourceBuckets
    monosemantic: SourceBucketsWithThreshold
  }
  stage2_quality: {
    wellExplained: SourceBuckets
    needRevision: SourceBucketsWithThreshold
  }
  stage3_cause: {
    wellExplained: SourceBuckets
    missedSyntax: SourceBuckets
    missedContext: SourceBuckets
    noisyActivation: SourceBuckets
  }
  summary: {
    stage1_total: number
    stage2_total: number
    stage3_total: number
  }
}

export interface ExportDataParams {
  sankeyNodes: SimplifiedSankeyNode[] | undefined
  stage1FinalCommit: Stage1FinalCommit | null
  stage2FinalCommit: Stage2FinalCommit | null
  pairSelectionStates: Map<string, 'selected' | 'rejected'>
  pairSelectionSources: Map<string, string>
  featureSelectionStates: Map<number, 'selected' | 'rejected'>
  featureSelectionSources: Map<number, string>
  causeSelectionStates: Map<number, string>
  causeSelectionSources: Map<number, string>
}

// ============================================================================
// BUILD EXPORT DATA
// ============================================================================

export function buildExportData(params: ExportDataParams): ExportData {
  const {
    sankeyNodes,
    stage1FinalCommit,
    stage2FinalCommit,
    pairSelectionStates,
    pairSelectionSources,
    featureSelectionStates,
    featureSelectionSources,
    causeSelectionStates,
    causeSelectionSources
  } = params

  // ---- Stage 1: Feature Splitting (feature-level) ----
  const stage1 = {
    incoherentSplitting: { manual: [] as number[], auto: [] as number[] },
    monosemantic: { manual: [] as number[], auto: [] as number[], thresholded: [] as number[] }
  }

  // Root features = all features in the dataset
  const rootFeatureIds = sankeyNodes?.[0]?.featureIds ?? new Set<number>()

  // Active segment = features that entered pair analysis
  const stage1ActiveIds = stage1FinalCommit?.featureIds ?? new Set<number>()

  // Thresholded monosemantic = root - stage1Active (below Sankey cutoff, never reviewed)
  for (const fid of rootFeatureIds) {
    if (!stage1ActiveIds.has(fid)) {
      stage1.monosemantic.thresholded.push(fid)
    }
  }

  // Active features: derive from pair selections
  // Use current store's pairSelectionStates/Sources (not committed — committed sources
  // may have stale data from debounced sync). Current store persists across stage transitions.
  if (stage1FinalCommit?.clusterPairsState?.allClusterPairs) {
    const allClusterPairs = stage1FinalCommit.clusterPairsState.allClusterPairs

    const { fragmentedIds, monosematicIds } = deriveFeatureSetsFromPairSelections(
      allClusterPairs,
      pairSelectionStates,
      stage1ActiveIds
    )

    // Build featureId -> pair_keys index for source attribution
    const featureToPairs = new Map<number, string[]>()
    for (const pair of allClusterPairs) {
      if (!stage1ActiveIds.has(pair.main_id) || !stage1ActiveIds.has(pair.similar_id)) continue
      if (!featureToPairs.has(pair.main_id)) featureToPairs.set(pair.main_id, [])
      featureToPairs.get(pair.main_id)!.push(pair.pair_key)
      if (!featureToPairs.has(pair.similar_id)) featureToPairs.set(pair.similar_id, [])
      featureToPairs.get(pair.similar_id)!.push(pair.pair_key)
    }

    // Helper: determine source for a feature based on its pairs
    const getFeatureSource = (featureId: number, requireSelected: boolean): 'manual' | 'auto' => {
      const pairKeys = featureToPairs.get(featureId) || []
      for (const pk of pairKeys) {
        if (requireSelected && pairSelectionStates.get(pk) !== 'selected') continue
        if (pairSelectionSources.get(pk) === 'click') return 'manual'
      }
      return 'auto'
    }

    // Fragmented features -> incoherentSplitting
    for (const fid of fragmentedIds) {
      const source = getFeatureSource(fid, true) // check selected pairs only
      stage1.incoherentSplitting[source].push(fid)
    }

    // Active monosemantic features (in active segment but not fragmented)
    for (const fid of monosematicIds) {
      const source = getFeatureSource(fid, false) // any pair involvement
      stage1.monosemantic[source].push(fid)
    }
  } else {
    // Fallback: build pair list from current store when no cluster pairs in commit
    const featureToPairs = new Map<number, string[]>()
    pairSelectionStates.forEach((_state, key) => {
      const parts = key.split('-')
      const mainId = parseInt(parts[0], 10)
      const simId = parseInt(parts[1], 10)
      if (!featureToPairs.has(mainId)) featureToPairs.set(mainId, [])
      featureToPairs.get(mainId)!.push(key)
      if (!featureToPairs.has(simId)) featureToPairs.set(simId, [])
      featureToPairs.get(simId)!.push(key)
    })

    const { fragmentedIds, monosematicIds } = deriveFeatureSetsFromPairSelections(
      Array.from(pairSelectionStates.keys()).map(key => {
        const parts = key.split('-')
        return { main_id: parseInt(parts[0], 10), similar_id: parseInt(parts[1], 10), pair_key: key }
      }),
      pairSelectionStates,
      stage1ActiveIds.size > 0 ? stage1ActiveIds : rootFeatureIds
    )

    for (const fid of fragmentedIds) {
      const pairKeys = featureToPairs.get(fid) || []
      let source: 'manual' | 'auto' = 'auto'
      for (const pk of pairKeys) {
        if (pairSelectionStates.get(pk) === 'selected' && pairSelectionSources.get(pk) === 'click') {
          source = 'manual'; break
        }
      }
      stage1.incoherentSplitting[source].push(fid)
    }

    for (const fid of monosematicIds) {
      const pairKeys = featureToPairs.get(fid) || []
      let source: 'manual' | 'auto' = 'auto'
      for (const pk of pairKeys) {
        if (pairSelectionSources.get(pk) === 'click') { source = 'manual'; break }
      }
      stage1.monosemantic[source].push(fid)
    }
  }

  // ---- Stage 2: Quality (independent — no merging from Stage 3) ----
  const stage2 = {
    wellExplained: { manual: [] as number[], auto: [] as number[] },
    needRevision: { manual: [] as number[], auto: [] as number[], thresholded: [] as number[] }
  }

  // Find monosemantic node to get all monosemantic feature IDs
  const monosematicNode = sankeyNodes?.find(n => n.id === 'monosemantic')
  const monosematicFeatureIds = monosematicNode?.featureIds ?? new Set<number>()

  // Active segment = monosemantic features that entered quality review
  const stage2ActiveIds = stage2FinalCommit?.featureIds ?? new Set<number>()

  // Thresholded needRevision = monosemantic - stage2Active (below Sankey cutoff)
  for (const fid of monosematicFeatureIds) {
    if (!stage2ActiveIds.has(fid)) {
      stage2.needRevision.thresholded.push(fid)
    }
  }

  // Active features: always use current store states/sources (not committed —
  // committed sources may have stale data). Store persists across stage transitions.
  for (const fid of stage2ActiveIds) {
    const state = featureSelectionStates.get(fid)
    const source = featureSelectionSources.get(fid) === 'click' ? 'manual' : 'auto'
    if (state === 'selected') {
      stage2.wellExplained[source].push(fid)
    } else if (state === 'rejected') {
      stage2.needRevision[source].push(fid)
    } else {
      // Untagged features in active segment default to needRevision auto
      stage2.needRevision.auto.push(fid)
    }
  }

  // ---- Stage 3: Cause (4 categories, no thresholded) ----
  const stage3 = {
    wellExplained: { manual: [] as number[], auto: [] as number[] },
    missedSyntax: { manual: [] as number[], auto: [] as number[] },
    missedContext: { manual: [] as number[], auto: [] as number[] },
    noisyActivation: { manual: [] as number[], auto: [] as number[] }
  }

  causeSelectionStates.forEach((tag, id) => {
    const source = causeSelectionSources.get(id) === 'click' ? 'manual' : 'auto'
    switch (tag) {
      case 'well-explained':
        // Well-explained is always manual (user click only)
        stage3.wellExplained.manual.push(id)
        break
      case 'missed-N-gram':
        stage3.missedSyntax[source].push(id)
        break
      case 'missed-context':
        stage3.missedContext[source].push(id)
        break
      case 'noisy-activation':
        stage3.noisyActivation[source].push(id)
        break
    }
  })

  // ---- Summary ----
  const stage1Total = stage1.incoherentSplitting.manual.length +
    stage1.incoherentSplitting.auto.length +
    stage1.monosemantic.manual.length +
    stage1.monosemantic.auto.length +
    stage1.monosemantic.thresholded.length

  const stage2Total = stage2.wellExplained.manual.length +
    stage2.wellExplained.auto.length +
    stage2.needRevision.manual.length +
    stage2.needRevision.auto.length +
    stage2.needRevision.thresholded.length

  const stage3Total = stage3.wellExplained.manual.length +
    stage3.missedSyntax.manual.length + stage3.missedSyntax.auto.length +
    stage3.missedContext.manual.length + stage3.missedContext.auto.length +
    stage3.noisyActivation.manual.length + stage3.noisyActivation.auto.length

  return {
    exportedAt: new Date().toISOString(),
    stage1_featureSplitting: stage1,
    stage2_quality: stage2,
    stage3_cause: stage3,
    summary: {
      stage1_total: stage1Total,
      stage2_total: stage2Total,
      stage3_total: stage3Total
    }
  }
}

// ============================================================================
// DOWNLOAD
// ============================================================================

export function downloadExportJson(data: ExportData): string {
  const fileName = `tagging-results-${new Date().toISOString().slice(0, 10)}.json`
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return fileName
}
