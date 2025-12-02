/**
 * Fixed 3-Stage Sankey Configuration
 *
 * Defines the fixed progression:
 * Stage 1: Feature Splitting (decoder_similarity)
 * Stage 2: Quality Assessment (quality_score)
 * Stage 3: Cause Determination (pre-defined groups)
 *
 * NOTE: This file derives values from TAG_CATEGORIES in constants.ts
 * to maintain a single source of truth for metrics, thresholds, and tags.
 */

import {
  TAG_CATEGORIES,
  TAG_CATEGORY_FEATURE_SPLITTING,
  TAG_CATEGORY_QUALITY,
  TAG_CATEGORY_CAUSE
} from './constants'

export interface StageConfig {
  stageNumber: 1 | 2 | 3
  categoryId: string
  label: string
  metric: string | null
  defaultThreshold: number | null
  tags: string[]
  parentTag: string | null  // Which tag from previous stage continues
  terminalTags: string[]     // Which tags terminate (don't continue to next stage)
}

// Helper to get default threshold from TAG_CATEGORIES
const getDefaultThreshold = (categoryId: string): number | null => {
  const category = TAG_CATEGORIES[categoryId]
  if (!category || !category.defaultThresholds || category.defaultThresholds.length === 0) {
    return null
  }
  return category.defaultThresholds[0]
}

/**
 * Fixed stage configurations for the 3-stage Sankey progression
 * Values derived from TAG_CATEGORIES in constants.ts
 */
export const STAGE_CONFIGS: StageConfig[] = [
  {
    stageNumber: 1,
    categoryId: TAG_CATEGORY_FEATURE_SPLITTING,
    label: TAG_CATEGORIES[TAG_CATEGORY_FEATURE_SPLITTING].label,
    metric: TAG_CATEGORIES[TAG_CATEGORY_FEATURE_SPLITTING].metric,
    defaultThreshold: getDefaultThreshold(TAG_CATEGORY_FEATURE_SPLITTING),
    tags: TAG_CATEGORIES[TAG_CATEGORY_FEATURE_SPLITTING].tags as unknown as string[],
    parentTag: TAG_CATEGORIES[TAG_CATEGORY_FEATURE_SPLITTING].parentTag,
    terminalTags: ['Fragmented']  // Fragmented doesn't continue
  },
  {
    stageNumber: 2,
    categoryId: TAG_CATEGORY_QUALITY,
    label: TAG_CATEGORIES[TAG_CATEGORY_QUALITY].label,
    metric: TAG_CATEGORIES[TAG_CATEGORY_QUALITY].metric,
    defaultThreshold: getDefaultThreshold(TAG_CATEGORY_QUALITY),
    tags: TAG_CATEGORIES[TAG_CATEGORY_QUALITY].tags as unknown as string[],
    parentTag: TAG_CATEGORIES[TAG_CATEGORY_QUALITY].parentTag,
    terminalTags: ['Well-Explained']  // Well-Explained doesn't continue
  },
  {
    stageNumber: 3,
    categoryId: TAG_CATEGORY_CAUSE,
    label: TAG_CATEGORIES[TAG_CATEGORY_CAUSE].label,
    metric: TAG_CATEGORIES[TAG_CATEGORY_CAUSE].metric,
    defaultThreshold: getDefaultThreshold(TAG_CATEGORY_CAUSE),
    tags: TAG_CATEGORIES[TAG_CATEGORY_CAUSE].tags as unknown as string[],
    parentTag: TAG_CATEGORIES[TAG_CATEGORY_CAUSE].parentTag,
    terminalTags: []  // All cause tags are terminal (no stage 4)
  }
]

/**
 * Get configuration for a specific stage
 */
export function getStageConfig(stageNumber: 1 | 2 | 3): StageConfig {
  return STAGE_CONFIGS[stageNumber - 1]
}

/**
 * Get tag category for a stage's categoryId
 */
export function getTagCategory(categoryId: string) {
  return TAG_CATEGORIES[categoryId]
}

/**
 * Check if a tag is terminal for a given stage
 */
export function isTerminalTag(stageNumber: 1 | 2 | 3, tagName: string): boolean {
  const config = getStageConfig(stageNumber)
  return config.terminalTags.includes(tagName)
}

/**
 * Get the next stage number, or null if at final stage
 */
export function getNextStage(currentStage: 1 | 2 | 3): 2 | 3 | null {
  if (currentStage === 1) return 2
  if (currentStage === 2) return 3
  return null
}
