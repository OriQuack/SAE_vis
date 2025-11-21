// ============================================================================
// TAG SYSTEM - Tag color initialization and utility functions
// Extracted from tag-constants.ts for clear separation of logic
// ============================================================================

import {
  TAG_CATEGORIES,
  TAG_CATEGORY_QUALITY,
  TAG_CATEGORY_FEATURE_SPLITTING,
  type TagCategoryConfig,
  type TagColorMode,
  OKABE_ITO_PALETTE
} from './constants'
import { HierarchicalColorAssigner } from './hierarchical-colors'
import type { SankeyTreeNode } from '../types'

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
 * Assign colors using predefined constants from constants.ts
 * Maps each tag to a specific color from Okabe-Ito and Paul Tol palettes
 *
 * Color Semantics:
 * - GREEN: Positive quality (Monosemantic, Well-Explained)
 * - RED: Needs attention (Fragmented, Need Revision)
 * - BLUE/ORANGE/PURPLE: Categorical distinctions (Cause tags)
 * - GRAY: Uncertain/Unclassified (Unsure)
 *
 * All colors are colorblind-friendly (Okabe-Ito and Paul Tol palettes)
 */
function assignConstantColors(): void {
  const categoriesInOrder = getTagCategoriesInOrder()

  for (const category of categoriesInOrder) {
    const colors: Record<string, string> = {}

    // Map tags to constant colors based on semantic meaning
    for (const tag of category.tags) {
      switch (tag) {
        // ========================================
        // Feature Splitting Category
        // ========================================
        case 'Monosemantic':
          colors[tag] = OKABE_ITO_PALETTE.GRAY  // #009E73 - Green (good: single concept)
          break
        case 'Fragmented':
          colors[tag] = OKABE_ITO_PALETTE.YELLOW  // #EE6677 - Red (bad: split features)
          break

        // ========================================
        // Quality Category
        // ========================================
        case 'Need Revision':
          colors[tag] = OKABE_ITO_PALETTE.GRAY  // #EE6677 - Red (bad: low quality)
          break
        case 'Well-Explained':
          colors[tag] = OKABE_ITO_PALETTE.BLUISH_GREEN  // #009E73 - Green (good: high quality)
          break

        // ========================================
        // Cause Category (Categorical colors)
        // ========================================
        case 'Missed Context':
          colors[tag] = OKABE_ITO_PALETTE.VERMILLION  // #0072B2 - Blue
          break
        case 'Missed Lexicon':
          colors[tag] = OKABE_ITO_PALETTE.ORANGE  // #E69F00 - Orange
          break
        case 'Noisy Activation':
          colors[tag] = OKABE_ITO_PALETTE.REDDISH_PURPLE  // #CC79A7 - Purple
          break
        case 'Unsure':
          colors[tag] = OKABE_ITO_PALETTE.GRAY  // #999999 - Gray (uncertain)
          break

        default:
          // Fallback: Use first available color from palette
          colors[tag] = OKABE_ITO_PALETTE.GRAY
          break
      }
    }

    // Store colors in TAG_CATEGORIES (mutate the object)
    ;(TAG_CATEGORIES[category.id] as any).tagColors = colors
  }
}

/**
 * Initialize tag colors by building virtual tree and assigning colors
 *
 * @param mode - Color assignment mode:
 *   - 'hierarchical': Use HierarchicalColorAssigner for perceptually-optimized colors (default)
 *   - 'constant': Use predefined colors from Okabe-Ito and Paul Tol palettes
 */
function initializeTagColors(mode: TagColorMode = 'hierarchical'): void {
  if (mode === 'constant') {
    // Use predefined constant colors
    assignConstantColors()
    return
  }
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
// Switch between 'constant' (predefined Okabe-Ito/Paul Tol colors) and 'hierarchical' (perceptually-optimized)
initializeTagColors('constant')

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

// Re-export tag category constants for convenience
export { TAG_CATEGORY_QUALITY, TAG_CATEGORY_FEATURE_SPLITTING }
