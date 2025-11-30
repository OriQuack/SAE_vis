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
  OKABE_ITO_PALETTE,
  UNSURE_GRAY,
  PAUL_TOL_BRIGHT
} from './constants'
import { HierarchicalColorAssigner } from './hierarchical-colors'
import type { SankeyTreeNode } from '../types'
import TreeColors from 'treecolors'
import chroma from 'chroma-js'

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
          colors[tag] = PAUL_TOL_BRIGHT.CYAN  // #009E73 - Green (good: single concept)
          break
        case 'Fragmented':
          colors[tag] = OKABE_ITO_PALETTE.ORANGE  // #EE6677 - Red (bad: split features)
          break

        // ========================================
        // Quality Category
        // ========================================
        case 'Need Revision':
          colors[tag] = OKABE_ITO_PALETTE.REDDISH_PURPLE  // #EE6677 - Red (bad: low quality)
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
          colors[tag] = OKABE_ITO_PALETTE.YELLOW  // #E69F00 - Orange
          break
        case 'Noisy Activation':
          colors[tag] = PAUL_TOL_BRIGHT.RED  // #CC79A7 - Purple
          break
        case 'Unsure':
          colors[tag] = UNSURE_GRAY  // Centralized unsure/untagged color
          break

        default:
          // Fallback: Use centralized unsure color
          colors[tag] = UNSURE_GRAY
          break
      }
    }

    // Store colors in TAG_CATEGORIES (mutate the object)
    ;(TAG_CATEGORIES[category.id] as any).tagColors = colors
  }
}

/**
 * Tree node structure for treecolors library
 */
interface TreeColorsNode {
  name: string
  children: TreeColorsNode[]
  color?: { h: number; c: number; l: number }
}

/**
 * Assign colors using treecolors library (TreeColors.js)
 * Uses subtractive color scheme for more saturated colors
 *
 * Algorithm: Divides hue range among children, maintaining parent-child color relationships
 * Color space: HCL (perceptually uniform)
 */
function assignTreeColors(): void {
  const categoriesInOrder = getTagCategoriesInOrder()

  // Build tree structure for treecolors
  const root: TreeColorsNode = {
    name: 'root',
    children: []
  }

  // Stage 1 tags are direct children of root
  const stage1Category = categoriesInOrder.find(c => c.stageOrder === 1)
  if (!stage1Category) return

  // Reorder stage 1 tags: Fragmented first (bad → red), Monosemantic second (→ green)
  // This controls hue assignment since treecolors assigns lower hues to earlier children
  const stage1TagsOrdered = ['Fragmented', 'Monosemantic']
    .filter(t => stage1Category.tags.includes(t))

  for (const tag of stage1TagsOrdered) {
    const stage1Node: TreeColorsNode = {
      name: `${stage1Category.id}:${tag}`,
      children: []
    }

    // Find stage 2 category that has this tag as parent
    const stage2Category = categoriesInOrder.find(
      c => c.stageOrder === 2 && c.parentTag === tag
    )

    if (stage2Category) {
      for (const stage2Tag of stage2Category.tags) {
        const stage2Node: TreeColorsNode = {
          name: `${stage2Category.id}:${stage2Tag}`,
          children: []
        }

        // Find stage 3 category that has this tag as parent
        const stage3Category = categoriesInOrder.find(
          c => c.stageOrder === 3 && c.parentTag === stage2Tag
        )

        if (stage3Category) {
          // Exclude Unsure from tree - it gets UNSURE_GRAY constant, doesn't need hue range
          const stage3TagsFiltered = stage3Category.tags.filter(t => t !== 'Unsure')
          for (const stage3Tag of stage3TagsFiltered) {
            stage2Node.children.push({
              name: `${stage3Category.id}:${stage3Tag}`,
              children: []
            })
          }
        }

        stage1Node.children.push(stage2Node)
      }
    }

    root.children.push(stage1Node)
  }

  // Apply treecolors algorithm (subtractive scheme for saturated colors)
  // - rootColor: neutral gray
  // - range: [280, 560] wraps around: 280°→360° (magenta/red) + 0°→200° (red→cyan), skips blue (200-280°)
  const colorize = TreeColors('sub')
    .rootColor({ h: 0, c: 0, l: 70 })
    .range([205, 565])
  colorize(root)

  // Extract colors and populate TAG_CATEGORIES
  function extractColors(node: TreeColorsNode) {
    if (node.color && node.name !== 'root') {
      // Parse category:tag from node name
      const [categoryId, tagName] = node.name.split(':')
      const category = TAG_CATEGORIES[categoryId]

      if (category) {
        // Use 6-character hex (no alpha) - opacity is applied later in rendering
        const hex = chroma.hcl(node.color.h, node.color.c, node.color.l).hex()
        ;(category.tagColors as Record<string, string>)[tagName] = hex
      }
    }

    // Recurse into children
    for (const child of node.children) {
      extractColors(child)
    }
  }

  extractColors(root)

  // Manually assign Unsure (excluded from tree to save hue range)
  const causeCategory = TAG_CATEGORIES['cause']
  if (causeCategory) {
    ;(causeCategory.tagColors as Record<string, string>)['Unsure'] = UNSURE_GRAY
  }
}

/**
 * Initialize tag colors by building virtual tree and assigning colors
 *
 * @param mode - Color assignment mode:
 *   - 'treecolors': Use treecolors library for hierarchical color assignment (default)
 *   - 'hierarchical': Use HierarchicalColorAssigner for perceptually-optimized colors
 *   - 'constant': Use predefined colors from Okabe-Ito and Paul Tol palettes
 */
function initializeTagColors(mode: TagColorMode = 'treecolors'): void {
  if (mode === 'constant') {
    // Use predefined constant colors
    assignConstantColors()
    return
  }

  if (mode === 'treecolors') {
    // Use treecolors library for hierarchical color assignment
    assignTreeColors()
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
// Modes: 'treecolors' (TreeColors.js library), 'constant' (Okabe-Ito/Paul Tol), 'hierarchical' (custom CIELAB)
initializeTagColors('treecolors')

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
