// ============================================================================
// TAG CATEGORY SYSTEM - Fixed 4-stage Sankey structure
// Central configuration for tag-based feature categorization
// ============================================================================

import {
  METRIC_DECODER_SIMILARITY,
  METRIC_QUALITY_SCORE,
  METRIC_SCORE_EMBEDDING,
  METRIC_SCORE_DETECTION,
  METRIC_SCORE_FUZZ,
  METRIC_SEMANTIC_SIMILARITY
} from './constants'
import { HierarchicalColorAssigner } from './hierarchical-colors'
import type { SankeyTreeNode } from '../types'

// ============================================================================
// TAG CATEGORY IDs
// ============================================================================
export const TAG_CATEGORY_FEATURE_SPLITTING = "feature_splitting" as const
export const TAG_CATEGORY_QUALITY = "quality" as const
export const TAG_CATEGORY_CAUSE = "cause" as const
export const TAG_CATEGORY_TEMP = "temp" as const

// ============================================================================
// TAG CATEGORY CONFIGURATION
// Single source of truth for all tag category metadata
// ============================================================================

export interface TagCategoryConfig {
  /** Unique identifier for this category */
  id: string

  /** Display name shown in UI */
  label: string

  /** Stage order in the fixed Sankey structure (1-3) */
  stageOrder: number

  /** Primary metric used for grouping features (null for pre-defined groups) */
  metric: string | null

  /** Default thresholds for metric-based splitting */
  defaultThresholds: number[]

  /** Whether to show histogram visualization on Sankey nodes */
  showHistogram: boolean

  /** Tag values for this category */
  tags: string[]

  /** Related metrics for reference and future analysis */
  relatedMetrics: string[]

  /** Description of what this category represents */
  description: string

  /** Which tag from this category is parent of all next stage tags (null if none) */
  parentTagForNextStage: string | null

  /** User-facing instruction text displayed in the UI */
  instruction: string

  /** Pre-computed colors for each tag (tag name → hex color) */
  tagColors: Record<string, string>

  /** Parent tag from previous stage (null for stage 1) */
  parentTag: string | null
}

/**
 * TAG CATEGORIES - Complete configuration for the 4-stage Sankey structure
 *
 * This is the single source of truth for:
 * - Stage order in Sankey (Root → Feature Splitting → Quality → Cause → Temp)
 * - Grouping metrics and thresholds
 * - Histogram visibility
 * - Tag assignments
 * - Related metrics for each category
 */
export const TAG_CATEGORIES: Record<string, TagCategoryConfig> = {
  [TAG_CATEGORY_FEATURE_SPLITTING]: {
    id: TAG_CATEGORY_FEATURE_SPLITTING,
    label: "Detect Feature Splitting",
    stageOrder: 1,
    metric: METRIC_DECODER_SIMILARITY,
    defaultThresholds: [0.4],
    showHistogram: true,
    tags: [
      "Monosemantic",       // Group 0 (< 0.4, LOW decoder similarity)
      "Fragmented"    // Group 1 (≥ 0.4, HIGH decoder similarity)
    ],
    relatedMetrics: [
      METRIC_DECODER_SIMILARITY,
      "inter_feature_similarity"  // Note: Not yet in backend data
    ],
    description: "Identifies whether a feature represents a single semantic concept or multiple overlapping concepts",
    parentTagForNextStage: "Monosemantic",
    instruction: "Fragmented or Monosemantic Feature?",
    tagColors: {},  // Populated by initializeTagColors()
    parentTag: null  // Stage 1 has no parent
  },

  [TAG_CATEGORY_QUALITY]: {
    id: TAG_CATEGORY_QUALITY,
    label: "Assess Quality",
    stageOrder: 2,
    metric: METRIC_QUALITY_SCORE,
    defaultThresholds: [0.7],
    showHistogram: true,
    tags: [
      "Need Revision",       // Group 0 (< 0.5, LOW quality score)
      "Well-Explained"       // Group 1 (≥ 0.5, HIGH quality score)
    ],
    relatedMetrics: [
      METRIC_SCORE_EMBEDDING,
      METRIC_SCORE_FUZZ,
      METRIC_SCORE_DETECTION,
      METRIC_QUALITY_SCORE
    ],
    description: "Assesses the overall quality of the feature explanation based on multiple scoring metrics",
    parentTagForNextStage: "Need Revision",
    instruction: "Assess LLM generated explanation quality",
    tagColors: {},  // Populated by initializeTagColors()
    parentTag: "Monosemantic"  // Children of Monosemantic from stage 1
  },

  [TAG_CATEGORY_CAUSE]: {
    id: TAG_CATEGORY_CAUSE,
    label: "Determine Cause",
    stageOrder: 3,
    metric: null,  // Pre-defined groups, not metric-based
    defaultThresholds: [],
    showHistogram: false,
    tags: [
      "Missed Context",
      "Missed Lexicon",
      "Noisy Activation",
      "Unsure"
    ],
    relatedMetrics: [
      // Missed Context indicators
      METRIC_SCORE_DETECTION,
      METRIC_SCORE_EMBEDDING,
      // Missed Lexicon indicators
      METRIC_SCORE_FUZZ,
      // Noisy Activation indicators
      "intra_feature_similarity",  // Note: Not yet in backend data
      METRIC_SEMANTIC_SIMILARITY
    ],
    description: "Categorizes the root cause of explanation issues for features that need revision",
    parentTagForNextStage: null,
    instruction: "Determine root cause for poor explanation quality",
    tagColors: {},  // Populated by initializeTagColors()
    parentTag: "Need Revision"  // Children of Need Revision from stage 2
  },

  [TAG_CATEGORY_TEMP]: {
    id: TAG_CATEGORY_TEMP,
    label: "Temp",
    stageOrder: 4,
    metric: null,  // Placeholder, no metric-based logic
    defaultThresholds: [],
    showHistogram: false,
    tags: [],  // No tags - only stage tab
    relatedMetrics: [],
    description: "Temporary placeholder stage for testing",
    parentTagForNextStage: null,
    instruction: "Placeholder stage",
    tagColors: {},  // Populated by initializeTagColors()
    parentTag: null  // Placeholder, no parent relationship
  }
} as const

// ============================================================================
// TAG CATEGORY HELPERS
// Utility functions for working with tag categories
// ============================================================================

/**
 * Get tag categories in stage order (1 → 2 → 3)
 */
export function getTagCategoriesInOrder(): TagCategoryConfig[] {
  return Object.values(TAG_CATEGORIES).sort((a, b) => a.stageOrder - b.stageOrder)
}

// ============================================================================
// TAG COLOR SYSTEM
// Pre-computed hierarchical colors based on parentTagForNextStage relationships
// ============================================================================

/**
 * Build virtual Sankey tree from tag category configuration
 * This tree mimics the real Sankey tree structure but is based purely on
 * parentTagForNextStage relationships for color generation
 */
function buildVirtualTagTree(): Map<string, SankeyTreeNode> {
  const tree = new Map<string, SankeyTreeNode>()

  // Create root node
  const root: SankeyTreeNode = {
    id: 'root',
    parentId: null,
    metric: null,
    thresholds: [],
    depth: 0,
    children: [],
    featureIds: new Set(),
    featureCount: 0,
    rangeLabel: 'All Features'
  }
  tree.set('root', root)

  // Get categories in stage order
  const categoriesInOrder = getTagCategoriesInOrder()

  // Build tree level by level
  for (const category of categoriesInOrder) {
    const depth = category.stageOrder

    // Find parent node(s) for this stage
    let parentNodes: SankeyTreeNode[] = []

    if (depth === 1) {
      // Stage 1: parent is root
      parentNodes = [root]
    } else {
      // Stages 2 & 3: find parent based on parentTag
      const prevCategory = categoriesInOrder.find(c => c.stageOrder === depth - 1)
      if (!prevCategory) continue

      // Find nodes from previous stage that match parentTag
      for (const [nodeId, node] of tree.entries()) {
        if (node.depth === depth - 1) {
          // Extract tag name from node ID
          const tagMatch = category.parentTag
          if (tagMatch && nodeId.includes(tagMatch.toLowerCase().replace(/\s+/g, '_'))) {
            parentNodes.push(node)
          }
        }
      }
    }

    // Create child nodes for each tag under each parent
    for (const parentNode of parentNodes) {
      category.tags.forEach((tag, _tagIndex) => {
        const childId = `${parentNode.id}_${category.id}_${tag.toLowerCase().replace(/\s+/g, '_')}`

        const childNode: SankeyTreeNode = {
          id: childId,
          parentId: parentNode.id,
          metric: category.metric,
          thresholds: category.defaultThresholds,
          depth,
          children: [],
          featureIds: new Set(),
          featureCount: 0,
          rangeLabel: tag
        }

        tree.set(childId, childNode)
        parentNode.children.push(childId)
      })
    }
  }

  return tree
}

/**
 * Initialize tag colors by building virtual tree and assigning colors
 * This runs once at module load time
 */
function initializeTagColors(): void {
  // Build virtual tree
  const virtualTree = buildVirtualTagTree()

  // Assign colors using hierarchical color assigner
  const colorAssigner = new HierarchicalColorAssigner(3)  // Use same seed as main tree
  colorAssigner.assignColors(virtualTree, 'root')

  // Extract colors and populate TAG_CATEGORIES
  const categoriesInOrder = getTagCategoriesInOrder()

  for (const category of categoriesInOrder) {
    const colors: Record<string, string> = {}

    for (const tag of category.tags) {
      // Find node in virtual tree that corresponds to this tag
      const tagKey = tag.toLowerCase().replace(/\s+/g, '_')

      for (const [nodeId, node] of virtualTree.entries()) {
        if (node.depth === category.stageOrder && nodeId.endsWith(`_${tagKey}`)) {
          if (node.colorHex) {
            colors[tag] = node.colorHex
          }
          break
        }
      }
    }

    // Store colors in TAG_CATEGORIES (mutate the object)
    ;(TAG_CATEGORIES[category.id] as any).tagColors = colors
  }
}

// Initialize colors at module load
initializeTagColors()

// ============================================================================
// TAG COLOR UTILITIES
// Simple lookup functions for pre-computed tag colors
// ============================================================================

/**
 * Get color for a specific tag
 *
 * @param categoryId - Category ID (e.g., 'quality', 'cause')
 * @param tagName - Tag name (e.g., 'Well-Explained', 'Missed Context')
 * @returns Hex color string or null if not found
 */
export function getTagColor(categoryId: string, tagName: string): string | null {
  const category = TAG_CATEGORIES[categoryId]
  if (!category) return null
  return category.tagColors[tagName] || null
}

/**
 * Get all colors for a category as a map
 *
 * @param categoryId - Category ID (e.g., 'quality', 'cause')
 * @returns Record of tag names to hex colors
 */
export function getBadgeColors(categoryId: string): Record<string, string> {
  const category = TAG_CATEGORIES[categoryId]
  if (!category) return {}
  return { ...category.tagColors }  // Return copy to prevent mutation
}

/**
 * Get all tag colors for all categories (useful for debugging)
 *
 * @returns Nested record of category IDs to tag name to hex color
 */
export function getAllTagColors(): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {}
  for (const [categoryId, category] of Object.entries(TAG_CATEGORIES)) {
    result[categoryId] = { ...category.tagColors }
  }
  return result
}
