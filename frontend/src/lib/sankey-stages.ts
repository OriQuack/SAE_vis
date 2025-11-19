/**
 * Fixed 3-Stage Sankey Configuration
 *
 * Defines the fixed progression:
 * Stage 1: Feature Splitting (decoder_similarity)
 * Stage 2: Quality Assessment (quality_score)
 * Stage 3: Cause Determination (pre-defined groups)
 */

import { TAG_CATEGORIES } from './tag-constants'

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

/**
 * Fixed stage configurations for the 3-stage Sankey progression
 */
export const STAGE_CONFIGS: StageConfig[] = [
  {
    stageNumber: 1,
    categoryId: 'feature_splitting',
    label: 'Detect Feature Splitting',
    metric: 'decoder_similarity',
    defaultThreshold: 0.4,
    tags: ['Monosemantic', 'Fragmented'],
    parentTag: null,  // Stage 1 starts from root
    terminalTags: ['Fragmented']  // Fragmented doesn't continue
  },
  {
    stageNumber: 2,
    categoryId: 'quality',
    label: 'Assess Quality',
    metric: 'quality_score',
    defaultThreshold: 0.7,
    tags: ['Need Revision', 'Well-Explained'],
    parentTag: 'Monosemantic',  // Only Monosemantic continues from stage 1
    terminalTags: ['Well-Explained']  // Well-Explained doesn't continue
  },
  {
    stageNumber: 3,
    categoryId: 'cause',
    label: 'Determine Cause',
    metric: null,  // No metric (pre-defined groups)
    defaultThreshold: null,
    tags: ['Missed Context', 'Missed Lexicon', 'Noisy Activation', 'Unsure'],
    parentTag: 'Need Revision',  // Only Need Revision continues from stage 2
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
