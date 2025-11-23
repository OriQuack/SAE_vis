import type {
  SankeySegmentSelection,
  SankeyToSelectionFlow,
  FlowPathData,
  SelectionCategory,
  SimplifiedSankeyNode,
  SegmentSankeyNode
} from '../types'

// ============================================================================
// CONSTANTS
// ============================================================================

const FLOW_OPACITY = {
  default: 0.3,
  hover: 0.6,
  inactive: 0.15
} as const

const MIN_STROKE_WIDTH = 2
const MAX_STROKE_WIDTH = 40

// ============================================================================
// POSITION CALCULATION UTILITIES
// ============================================================================

/**
 * Get the screen position of a Sankey segment
 * @param segmentRef - DOM reference to the segment SVG element
 * @param containerRect - Bounding rect of the overlay container
 * @returns Position in overlay coordinate space
 */
export function getSankeySegmentPosition(
  segmentRef: SVGRectElement | null,
  containerRect: DOMRect
): { x: number; y: number; width: number; height: number } | null {
  if (!segmentRef) return null

  const segmentRect = segmentRef.getBoundingClientRect()

  return {
    x: segmentRect.left - containerRect.left,
    y: segmentRect.top - containerRect.top,
    width: segmentRect.width,
    height: segmentRect.height
  }
}

/**
 * Get the screen position of a SelectionBar category segment
 * @param categoryRef - DOM reference to the category div element
 * @param containerRect - Bounding rect of the overlay container
 * @returns Position in overlay coordinate space
 */
export function getSelectionBarCategoryPosition(
  categoryRef: HTMLDivElement | null,
  containerRect: DOMRect
): { x: number; y: number; width: number; height: number } | null {
  if (!categoryRef) return null

  const categoryRect = categoryRef.getBoundingClientRect()

  return {
    x: categoryRect.left - containerRect.left,
    y: categoryRect.top - containerRect.top,
    width: categoryRect.width,
    height: categoryRect.height
  }
}

// ============================================================================
// PATH GENERATION UTILITIES
// ============================================================================

/**
 * Generate SVG path data for a flow band using smooth cubic bezier curves
 * Creates a simple filled area between two parallel curves
 * @param sourceX - Source X coordinate (right edge)
 * @param sourceTopY - Source top Y coordinate
 * @param sourceBottomY - Source bottom Y coordinate
 * @param targetX - Target X coordinate (left edge)
 * @param targetTopY - Target top Y coordinate
 * @param targetBottomY - Target bottom Y coordinate
 * @returns SVG path data string for filled band
 */
export function generateFlowPath(
  sourceX: number,
  sourceTopY: number,
  sourceBottomY: number,
  targetX: number,
  targetTopY: number,
  targetBottomY: number
): string {
  // Horizontal distance for smooth curves
  const dx = targetX - sourceX
  const cp1X = sourceX + dx / 3  // Control point 1/3 along
  const cp2X = targetX - dx / 3  // Control point 2/3 along

  // Create smooth flow band with simple bezier curves
  return [
    `M${sourceX},${sourceTopY}`,                                              // Start at segment top
    `C${cp1X},${sourceTopY} ${cp2X},${targetTopY} ${targetX},${targetTopY}`, // Smooth curve to bar top
    `L${targetX},${targetBottomY}`,                                           // Straight line down bar edge
    `C${cp2X},${targetBottomY} ${cp1X},${sourceBottomY} ${sourceX},${sourceBottomY}`, // Smooth curve back to segment bottom
    'Z'                                                                       // Close path
  ].join(' ')
}

/**
 * Calculate stroke width based on feature count
 * @param featureCount - Number of features in the flow
 * @param maxFeatureCount - Maximum feature count across all flows
 * @returns Stroke width in pixels
 */
export function calculateStrokeWidth(
  featureCount: number,
  maxFeatureCount: number
): number {
  if (maxFeatureCount === 0) return MIN_STROKE_WIDTH

  const ratio = featureCount / maxFeatureCount
  return MIN_STROKE_WIDTH + ratio * (MAX_STROKE_WIDTH - MIN_STROKE_WIDTH)
}

// ============================================================================
// FLOW CALCULATION
// ============================================================================

/**
 * Calculate flow from a Sankey segment to the entire SelectionBar
 * Creates a single flow connecting to the whole bar height
 * @param selection - Selected segment information
 * @param segmentRef - DOM reference to the segment
 * @param categoryRefs - Map of category to DOM reference (used to calculate bar bounds)
 * @param sankeyNodes - Sankey node data
 * @param selectionState - Not used (kept for compatibility)
 * @param containerRect - Container bounding rect
 * @returns Array with single flow path data for rendering
 */
export function calculateSankeyToSelectionFlows(
  selection: SankeySegmentSelection | null,
  segmentRef: SVGRectElement | null,
  categoryRefs: Map<SelectionCategory, HTMLDivElement>,
  sankeyNodes: SimplifiedSankeyNode[],
  _selectionState: {
    confirmed: Set<number>
    expanded: Set<number>
    rejected: Set<number>
    autoRejected: Set<number>
    unsure: Set<number>
  },
  containerRect: DOMRect
): FlowPathData[] {
  if (!selection || !segmentRef || categoryRefs.size === 0) return []

  // Find the selected node and segment
  const selectedNode = sankeyNodes.find(node => node.id === selection.nodeId)
  if (!selectedNode || selectedNode.type !== 'segment') return []

  const segmentNode = selectedNode as SegmentSankeyNode
  const segment = segmentNode.segments[selection.segmentIndex]
  if (!segment) return []

  // Get segment position
  const segmentPos = getSankeySegmentPosition(segmentRef, containerRect)
  if (!segmentPos) return []

  // Calculate source positions (right edge)
  const sourceX = segmentPos.x + segmentPos.width
  const sourceTopY = segmentPos.y
  const sourceBottomY = segmentPos.y + segmentPos.height

  // Get the entire SelectionBar bounds by finding min/max of all categories
  let barTop = Infinity
  let barBottom = -Infinity
  let barLeft = Infinity

  for (const categoryRef of categoryRefs.values()) {
    if (!categoryRef) continue
    const rect = categoryRef.getBoundingClientRect()
    const relativeTop = rect.top - containerRect.top
    const relativeBottom = rect.bottom - containerRect.top
    const relativeLeft = rect.left - containerRect.left

    barTop = Math.min(barTop, relativeTop)
    barBottom = Math.max(barBottom, relativeBottom)
    barLeft = Math.min(barLeft, relativeLeft)
  }

  // If no valid bar position found, return empty
  if (barTop === Infinity || barBottom === -Infinity || barLeft === Infinity) return []

  // Calculate target positions (left edge of bar)
  const targetX = barLeft
  const targetTopY = barTop
  const targetBottomY = barBottom

  // Create single flow to the whole bar
  const flow: SankeyToSelectionFlow = {
    id: `${selection.nodeId}_${selection.segmentIndex}_to_bar`,
    sourceNodeId: selection.nodeId,
    sourceSegmentIndex: selection.segmentIndex,
    targetCategory: 'confirmed', // Dummy value, not used for whole bar flow
    featureCount: segment.featureCount,
    featureIds: Array.from(segment.featureIds),
    color: segment.color,
    opacity: FLOW_OPACITY.default
  }

  // Generate path for flow band (filled area between two curves)
  const pathD = generateFlowPath(
    sourceX,
    sourceTopY,
    sourceBottomY,
    targetX,
    targetTopY,
    targetBottomY
  )

  const flowPath: FlowPathData = {
    ...flow,
    pathD,
    strokeWidth: 0, // No stroke, using fill instead
    sourceX,
    sourceY: (sourceTopY + sourceBottomY) / 2, // Center for reference
    targetX,
    targetY: (targetTopY + targetBottomY) / 2  // Center for reference
  }

  return [flowPath]
}

// ============================================================================
// INTERACTION UTILITIES
// ============================================================================

/**
 * Calculate flow opacity based on hover state
 * @param flowId - ID of the flow
 * @param hoveredFlowId - ID of the currently hovered flow (null if none)
 * @returns Opacity value (0-1)
 */
export function getFlowOpacity(
  flowId: string,
  hoveredFlowId: string | null
): number {
  if (hoveredFlowId === null) {
    return FLOW_OPACITY.default
  }

  return flowId === hoveredFlowId ? FLOW_OPACITY.hover : FLOW_OPACITY.inactive
}

/**
 * Get flows connected to a specific category
 * @param flows - All flows
 * @param category - Category to check
 * @returns Array of flow IDs connected to the category
 */
export function getConnectedFlowIds(
  flows: FlowPathData[],
  category: SelectionCategory
): string[] {
  return flows
    .filter(flow => flow.targetCategory === category)
    .map(flow => flow.id)
}
