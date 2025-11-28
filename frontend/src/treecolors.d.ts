// Type declarations for treecolors npm package
// https://github.com/e-/TreeColors.js

declare module 'treecolors' {
  /** HCL color assigned to each node */
  export interface HCLColor {
    h: number  // Hue: 0-360
    c: number  // Chroma: 0-100
    l: number  // Luminance: 0-100
  }

  /** Tree node structure expected by treecolors */
  export interface TreeNode {
    name?: string
    children?: TreeNode[]
    color?: HCLColor
    [key: string]: unknown
  }

  /** Color scheme type */
  type ColorScheme = 'add' | 'sub'

  /** Colorizer function with chainable configuration methods */
  interface TreeColorizer {
    /** Apply colors to tree (mutates tree nodes by adding color property) */
    (tree: TreeNode): void

    /** Set root node color */
    rootColor(color: HCLColor): TreeColorizer

    /** Set hue range for children [start, end], default [0, 360] */
    range(range: [number, number]): TreeColorizer

    /** Set luminance [startValue, deltaPerLevel] */
    luminance(values: [number, number]): TreeColorizer

    /** Set luminance start value */
    luminanceStart(value: number): TreeColorizer

    /** Set luminance delta per level */
    luminanceDelta(value: number): TreeColorizer

    /** Set chroma [startValue, deltaPerLevel] */
    chroma(values: [number, number]): TreeColorizer

    /** Set chroma start value */
    chromaStart(value: number): TreeColorizer

    /** Set chroma delta per level */
    chromaDelta(value: number): TreeColorizer

    /** Set hue range reduction fraction, default 0.75 */
    fraction(value: number): TreeColorizer

    /** Randomize child hue ordering */
    permutate(value: boolean): TreeColorizer

    /** Reverse even-numbered hue ranges */
    reverse(value: boolean): TreeColorizer

    /** Set children accessor (property name or function) */
    children(accessor: string | ((node: TreeNode) => TreeNode[])): TreeColorizer

    /** Set color property name or setter function */
    color(accessor: string | ((node: TreeNode, color: HCLColor) => void)): TreeColorizer
  }

  /**
   * TreeColors factory function
   * @param scheme - 'add' for additive (brighter), 'sub' for subtractive (more saturated)
   * @returns Chainable colorizer function
   */
  function TreeColors(scheme: ColorScheme): TreeColorizer

  export default TreeColors
}
