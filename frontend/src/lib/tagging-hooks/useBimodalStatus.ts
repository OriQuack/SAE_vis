import { useMemo } from 'react'
import { calculateBimodalityScore, getScoreLevel, isBimodalScore } from '../modality-utils'
import type { BimodalityInfo } from '../../types'

// ============================================================================
// useBimodalStatus - Bimodality status from histogram data
// ============================================================================
// Extracts the isBimodal calculation pattern used in FeatureSplitView and QualityView

interface UseBimodalStatusOptions {
  /** Bimodality info from histogram data */
  bimodality: BimodalityInfo | null | undefined
}

interface UseBimodalStatusReturn {
  /** True if distribution is strongly bimodal (level >= 5) */
  isBimodal: boolean
  /** Bimodality level (0-6) */
  bimodalityLevel: number
  /** Composite bimodality score (0-1) */
  bimodalityScore: number
  /** Mean separation in standard deviations */
  meanSeparation: number
  /** BIC difference between 2-component and 1-component models */
  bicDiff: number
}

export function useBimodalStatus(options: UseBimodalStatusOptions): UseBimodalStatusReturn {
  const { bimodality } = options

  return useMemo(() => {
    // Check if strongly bimodal using existing utility
    const isBimodal = isBimodalScore(bimodality)

    // Calculate detailed metrics
    if (!bimodality || bimodality.sample_size < 10) {
      return {
        isBimodal: false,
        bimodalityLevel: bimodality ? 1 : 0, // Level 1 = Unimodal, 0 = no data
        bimodalityScore: 0,
        meanSeparation: 0,
        bicDiff: 0
      }
    }

    const result = calculateBimodalityScore(bimodality)

    return {
      isBimodal,
      bimodalityLevel: getScoreLevel(result.score),
      bimodalityScore: result.score,
      meanSeparation: result.meanSeparation,
      bicDiff: result.bicDiff
    }
  }, [bimodality])
}

export default useBimodalStatus
