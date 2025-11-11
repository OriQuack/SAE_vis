/**
 * Hierarchical Color Assignment for Sankey Tree Visualization
 *
 * Based on perceptually-optimized color palette generation using:
 * - Blue noise sampling for top-level colors
 * - Sphere-based color assignment for child nodes
 * - CIEDE2000 perceptual distance metrics
 *
 * Color space: CIELAB (perceptually uniform)
 * Distance metric: CIEDE2000 (industry standard)
 */

import chroma from 'chroma-js'
import type { SankeyTreeNode } from '../types'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface LABColor {
  L: number  // Lightness: 0 (black) to 100 (white)
  a: number  // Green-Red: -128 to 127
  b: number  // Blue-Yellow: -128 to 127
}

interface ColorSphere {
  center: LABColor
  radius: number
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Default sampling range for top-level colors
const DEFAULT_LIGHTNESS_MIN = 40
const DEFAULT_LIGHTNESS_MAX = 85
const DEFAULT_CHROMA_MIN = 40
const DEFAULT_CHROMA_MAX = 85

// Exclude muddy zone (olive/brownish colors): L in [40,75] AND H in [85°,114°]
const MUDDY_ZONE_L_MIN = 40
const MUDDY_ZONE_L_MAX = 75
const MUDDY_ZONE_H_MIN = 85
const MUDDY_ZONE_H_MAX = 114

// Minimum perceptual distance between colors (CIEDE2000)
const MIN_PERCEPTUAL_DIFF = 10

// Base radius calculation factor (empirical)
const BASE_RADIUS_PER_CHILD = 8

// Maximum sampling attempts
const MAX_SAMPLING_ATTEMPTS = 1000

// Fixed seed for consistent color generation across page loads
const DEFAULT_SEED = 15

// ============================================================================
// SEEDED RANDOM NUMBER GENERATOR
// ============================================================================

/**
 * Mulberry32 - Fast seeded PRNG
 * Returns values in [0, 1) range like Math.random()
 */
class SeededRandom {
  private state: number

  constructor(seed: number = DEFAULT_SEED) {
    this.state = seed
  }

  /**
   * Generate next random number in [0, 1) range
   */
  next(): number {
    let t = this.state += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }

  /**
   * Reset to initial seed
   */
  reset(seed: number = DEFAULT_SEED): void {
    this.state = seed
  }
}

// ============================================================================
// MAIN CLASS
// ============================================================================

export class HierarchicalColorAssigner {
  private rng: SeededRandom

  constructor(seed: number = DEFAULT_SEED) {
    this.rng = new SeededRandom(seed)
  }

  /**
   * Assign colors to entire Sankey tree
   *
   * @param tree - Map of node IDs to tree nodes
   * @param rootId - ID of root node (default: 'root')
   */
  assignColors(tree: Map<string, SankeyTreeNode>, rootId: string = 'root'): void {
    // Reset RNG to ensure consistent colors across multiple calls
    this.rng.reset()

    const root = tree.get(rootId)
    if (!root) {
      console.error('[HierarchicalColorAssigner] Root node not found:', rootId)
      return
    }

    // Step 0: Assign dark grey color to root node
    const darkGreyColor: LABColor = {
      L: 40,  // Dark lightness
      a: 0,   // Neutral (no red/green)
      b: -5    // Neutral (no blue/yellow)
    }
    this.setNodeColor(root, darkGreyColor)

    // Get top-level nodes (root's children)
    const topLevelNodes = root.children
      .map(childId => tree.get(childId))
      .filter((node): node is SankeyTreeNode => node !== undefined)

    if (topLevelNodes.length === 0) {
      console.warn('[HierarchicalColorAssigner] No top-level nodes to color')
      return
    }

    // Step 1: Assign colors to top-level nodes within sphere around root
    this.assignTopLevelColors(topLevelNodes, root)

    // Step 2: Recursively assign colors to children
    for (const node of topLevelNodes) {
      if (node.children.length > 0) {
        this.assignChildColorsRecursive(node, tree)
      }
    }
  }

  /**
   * Assign colors to top-level nodes within sphere around root node
   * This makes root's children get grey-ish variations of root's dark grey
   */
  private assignTopLevelColors(nodes: SankeyTreeNode[], root: SankeyTreeNode): void {
    // Create sphere around root's color
    // Use a large radius since these are top-level colors
    const sphere: ColorSphere = {
      center: root.color!,
      radius: Math.sqrt(nodes.length) * BASE_RADIUS_PER_CHILD * 2  // 2x radius for more spread
    }

    // Sample colors within sphere
    const colors = this.blueNoiseSampling(nodes.length, sphere)

    nodes.forEach((node, i) => {
      this.setNodeColor(node, colors[i])
    })
  }

  /**
   * Recursively assign colors to child nodes
   */
  private assignChildColorsRecursive(
    parentNode: SankeyTreeNode,
    tree: Map<string, SankeyTreeNode>
  ): void {
    const children = parentNode.children
      .map(childId => tree.get(childId))
      .filter((node): node is SankeyTreeNode => node !== undefined)

    if (children.length === 0) return

    // Get parent's siblings for sphere gap calculation
    const siblings = this.getNodeSiblings(parentNode, tree)

    // Calculate color sphere for this parent
    const sphere = this.calculateColorSphere(parentNode, siblings)

    // Assign colors to children within sphere
    const childColors = this.blueNoiseSampling(children.length, sphere)

    children.forEach((child, i) => {
      this.setNodeColor(child, childColors[i])
    })

    // Recurse for grandchildren
    for (const child of children) {
      if (child.children.length > 0) {
        this.assignChildColorsRecursive(child, tree)
      }
    }
  }

  /**
   * Calculate color sphere for a parent node
   * Formula: r ∝ √(number of children)
   * Constraint: distance between siblings' spheres must exceed max(r1, r2)
   */
  private calculateColorSphere(
    parentNode: SankeyTreeNode,
    siblings: SankeyTreeNode[]
  ): ColorSphere {
    const n = parentNode.children.length

    // Base radius: r = √n × base_factor
    let radius = Math.sqrt(n) * BASE_RADIUS_PER_CHILD

    // Adjust radius to maintain gap between sibling spheres
    for (const sibling of siblings) {
      if (!sibling.color || sibling.children.length === 0) continue

      const nSibling = sibling.children.length
      const rSibling = Math.sqrt(nSibling) * BASE_RADIUS_PER_CHILD

      // Distance between parent colors
      const distance = this.ciede2000(parentNode.color!, sibling.color)

      // Constraint: d - r1 - r2 > max(r1, r2)
      // Solve for r1 (our radius)
      if (radius >= rSibling) {
        // max(r1, r2) = r1
        // d - r1 - r2 > r1  →  d - r2 > 2*r1  →  r1 < (d - r2) / 2
        const maxRadius = (distance - rSibling) / 2
        if (maxRadius > 0) {
          radius = Math.min(radius, maxRadius)
        }
      } else {
        // max(r1, r2) = r2
        // d - r1 - r2 > r2  →  d - 2*r2 > r1  →  r1 < d - 2*r2
        const maxRadius = distance - 2 * rSibling
        if (maxRadius > 0) {
          radius = Math.min(radius, maxRadius)
        }
      }
    }

    // Ensure minimum radius
    radius = Math.max(radius, MIN_PERCEPTUAL_DIFF)

    return {
      center: parentNode.color!,
      radius
    }
  }

  /**
   * Blue noise sampling: generate evenly distributed colors
   * Either in default range or within a sphere
   */
  private blueNoiseSampling(
    count: number,
    sphere: ColorSphere | null
  ): LABColor[] {
    const colors: LABColor[] = []
    let attempts = 0
    const maxAttempts = MAX_SAMPLING_ATTEMPTS * count

    while (colors.length < count && attempts < maxAttempts) {
      attempts++

      // Generate candidate color
      const candidate = sphere
        ? this.randomColorInSphere(sphere)
        : this.randomColorInDefaultRange()

      // Check minimum distance to existing colors
      let valid = true
      for (const existing of colors) {
        if (this.ciede2000(candidate, existing) < MIN_PERCEPTUAL_DIFF) {
          valid = false
          break
        }
      }

      if (valid) {
        colors.push(candidate)
      }
    }

    // If we couldn't generate enough colors with strict distance constraint,
    // fill in the remaining with relaxed or no constraint
    if (colors.length < count) {
      console.warn(
        `[HierarchicalColorAssigner] Could only generate ${colors.length}/${count} colors with distance constraint, filling remaining with fallback colors`
      )

      while (colors.length < count) {
        // Generate fallback color without distance constraint
        const fallbackColor = sphere
          ? this.randomColorInSphere(sphere)
          : this.randomColorInDefaultRange()
        colors.push(fallbackColor)
      }
    }

    return colors
  }

  /**
   * Generate random color in default range
   * Excludes muddy zone: L in [40,75] AND H in [85°,114°]
   */
  private randomColorInDefaultRange(): LABColor {
    let L: number, a: number, b: number
    let attempts = 0

    do {
      attempts++
      L = this.random(DEFAULT_LIGHTNESS_MIN, DEFAULT_LIGHTNESS_MAX)

      // Generate random a, b values
      a = this.random(-128, 127)
      b = this.random(-128, 127)

      const chroma = Math.sqrt(a * a + b * b)
      const hue = (Math.atan2(b, a) * 180 / Math.PI + 360) % 360

      // Check if in muddy zone
      if (
        L >= MUDDY_ZONE_L_MIN &&
        L <= MUDDY_ZONE_L_MAX &&
        hue >= MUDDY_ZONE_H_MIN &&
        hue <= MUDDY_ZONE_H_MAX
      ) {
        continue
      }

      // Check if chroma in range
      if (chroma >= DEFAULT_CHROMA_MIN && chroma <= DEFAULT_CHROMA_MAX) {
        break
      }
    } while (attempts < MAX_SAMPLING_ATTEMPTS)

    return { L, a, b }
  }

  /**
   * Generate random color within sphere
   * Uses uniform sampling in 3D sphere
   */
  private randomColorInSphere(sphere: ColorSphere): LABColor {
    let L: number, a: number, b: number
    let attempts = 0

    do {
      attempts++

      // Uniform random point in sphere using rejection sampling
      const r = sphere.radius * Math.cbrt(this.rng.next())
      const theta = this.rng.next() * 2 * Math.PI
      const phi = Math.acos(2 * this.rng.next() - 1)

      const dx = r * Math.sin(phi) * Math.cos(theta)
      const dy = r * Math.sin(phi) * Math.sin(theta)
      const dz = r * Math.cos(phi)

      L = sphere.center.L + dx
      a = sphere.center.a + dy
      b = sphere.center.b + dz

      // Check CIELAB bounds
      if (L >= 0 && L <= 100 && a >= -128 && a <= 127 && b >= -128 && b <= 127) {
        break
      }
    } while (attempts < MAX_SAMPLING_ATTEMPTS)

    return { L, a, b }
  }

  /**
   * Calculate CIEDE2000 perceptual color difference
   * Uses chroma-js deltaE implementation
   */
  private ciede2000(c1: LABColor, c2: LABColor): number {
    const color1 = chroma.lab(c1.L, c1.a, c1.b)
    const color2 = chroma.lab(c2.L, c2.a, c2.b)
    return chroma.deltaE(color1, color2)
  }

  /**
   * Get sibling nodes at the same level
   */
  private getNodeSiblings(
    node: SankeyTreeNode,
    tree: Map<string, SankeyTreeNode>
  ): SankeyTreeNode[] {
    if (!node.parentId) return []

    const parent = tree.get(node.parentId)
    if (!parent) return []

    return parent.children
      .filter(childId => childId !== node.id)
      .map(childId => tree.get(childId))
      .filter((sibling): sibling is SankeyTreeNode =>
        sibling !== undefined && sibling.color !== undefined
      )
  }

  /**
   * Set color on node (both LAB and hex)
   */
  private setNodeColor(node: SankeyTreeNode, labColor: LABColor): void {
    node.color = labColor

    // Convert to hex for rendering
    const chromaColor = chroma.lab(labColor.L, labColor.a, labColor.b)
    node.colorHex = chromaColor.hex()
  }

  /**
   * Random number in range [min, max] using seeded RNG
   */
  private random(min: number, max: number): number {
    return this.rng.next() * (max - min) + min
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get node color as hex string
 * @param nodeId - Node ID
 * @param tree - Tree map
 * @returns Hex color string or null if not found
 */
export function getNodeColor(
  nodeId: string,
  tree: Map<string, SankeyTreeNode> | null
): string | null {
  if (!tree) return null
  const node = tree.get(nodeId)
  return node?.colorHex || null
}

/**
 * Convert LAB color to hex
 */
export function labToHex(lab: LABColor): string {
  return chroma.lab(lab.L, lab.a, lab.b).hex()
}

/**
 * Convert hex to LAB color
 */
export function hexToLab(hex: string): LABColor {
  const [L, a, b] = chroma(hex).lab()
  return { L, a, b }
}
