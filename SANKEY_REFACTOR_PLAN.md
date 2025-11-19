# Sankey Diagram Refactoring Plan
**Clean, Simple Progressive Reveal Architecture**

---

## Table of Contents
1. [Overview](#overview)
2. [Design Philosophy](#design-philosophy)
3. [Core Concepts](#core-concepts)
4. [Stage-by-Stage Behavior](#stage-by-stage-behavior)
5. [Data Structures](#data-structures)
6. [Implementation Strategy](#implementation-strategy)
7. [File Changes](#file-changes)
8. [Migration Path](#migration-path)
9. [Testing Strategy](#testing-strategy)

---

## Overview

### Problem with Current Implementation
- Over-complicated tree building logic with Set intersection
- Confusing maxVisibleStage filtering vs building
- Unnecessary caching and optimization for a fixed 3-stage structure
- Difficult to understand and maintain

### New Approach
- **Fixed 3-stage progression**: Feature Splitting → Quality → Cause
- **Simple building logic**: Only build what the user sees
- **Segment nodes**: Single vertical bars with colored segments representing hidden children
- **Progressive reveal**: Each stage click builds the next level
- **No going back** (for now - simplified logic)

### Key Improvement
Replace complex tree building with straightforward stage-based construction where each stage knows exactly what to render.

---

## Design Philosophy

### Simplicity First
- **No premature optimization**: Build only what's visible
- **Clear stage boundaries**: Each stage is self-contained
- **Predictable behavior**: Stage 1 → Stage 2 → Stage 3, always

### Research Prototype Principles
- Conference-ready reliability over production scalability
- Easy to modify for research iterations
- Straightforward to debug and understand

---

## Core Concepts

### 1. Segment Node (NEW)
A **segment node** is a single vertical bar that visually represents multiple hidden children through colored segments.

**Key Properties:**
```typescript
interface SegmentNode {
  id: string                      // Unique identifier
  type: 'segment'                 // Distinguishes from regular nodes
  featureIds: Set<number>         // All features in this node
  segments: NodeSegment[]         // Visual segments
  metric: string                  // Metric for threshold (e.g., 'decoder_similarity')
  threshold: number               // Current threshold value
  parentId: string | null         // Parent node ID
  depth: number                   // Depth in tree (1, 2, or 3)
}

interface NodeSegment {
  tagName: string                 // E.g., "Monosemantic", "Fragmented"
  featureIds: Set<number>         // Features in this segment
  featureCount: number            // Number of features
  color: string                   // Hex color for this tag
  height: number                  // Visual height (proportional to featureCount)
  yPosition: number               // Y position in the vertical bar
}
```

**Visual Representation:**
```
┌─────────────┐
│ Monosemantic│ ← Segment 1 (green)
│   450 feat  │
├─────────────┤ ← Threshold line
│ Fragmented  │ ← Segment 2 (yellow)
│   598 feat  │
└─────────────┘
```

**Behavior:**
- Segments resize dynamically as threshold changes
- Histogram overlay shows distribution
- Threshold handle allows visual dragging
- Clicking segments does nothing (purely visual)

### 2. Terminal Node
A **terminal node** is the end of a branch - no further expansion.

**Characteristics:**
- Rendered as solid vertical bar (single color)
- No segments (no hidden children)
- Examples: Fragmented (Stage 1), Well-Explained (Stage 2), Fragmented (Stage 2)

### 3. Regular Node
A **regular node** is a standard Sankey node (rectangle).

**Characteristics:**
- Rendered as rectangle with width
- Used for root node
- Will be used for split nodes in future stages

---

## Stage-by-Stage Behavior

### Initial State (Auto-activate Stage 1)
**When app loads:**
- Automatically activate Stage 1 (Feature Splitting)
- Show root node (left) + segment node (right)

### Stage 1: Feature Splitting (decoder_similarity)
**User sees:**
```
Root → Segment Node
       (Monosemantic / Fragmented)
```

**Data Structure:**
```typescript
{
  nodes: [
    {
      id: 'root',
      type: 'regular',
      featureIds: Set(1648),  // All features
      position: 'left'
    },
    {
      id: 'stage1_segment',
      type: 'segment',
      metric: 'decoder_similarity',
      threshold: 0.4,
      parentId: 'root',
      depth: 1,
      featureIds: Set(1648),
      segments: [
        {
          tagName: 'Monosemantic',
          featureIds: Set(450),   // Features < 0.4
          featureCount: 450,
          color: '#808080',        // Gray from tag-constants
          height: 450/1648 * totalHeight,
          yPosition: 0
        },
        {
          tagName: 'Fragmented',
          featureIds: Set(1198),  // Features >= 0.4
          featureCount: 1198,
          color: '#F0E442',        // Yellow from tag-constants
          height: 1198/1648 * totalHeight,
          yPosition: 450/1648 * totalHeight
        }
      ]
    }
  ],
  links: [
    {
      source: 'root',
      target: 'stage1_segment',
      value: 1648
    }
  ]
}
```

**Histogram:**
- Overlaid on the link between root and segment node
- Shows decoder_similarity distribution
- Threshold line at 0.4 (draggable)
- Tag labels: "↑ Monosemantic" and "↓ Fragmented"

**Threshold Interaction:**
1. User drags threshold handle up/down
2. Segments resize in real-time (live preview)
3. On release, feature grouping recalculates
4. Segments update with new heights

### Stage 2: Quality (quality_score)
**User clicks "Assess Quality" tag**

**Action:**
1. Split the segment node into 2 actual nodes
2. Monosemantic → extends to another segment node (for Quality)
3. Fragmented → extends to terminal node (rightmost position)

**User sees:**
```
Root → Monosemantic → Segment Node
                      (Need Revision / Well-Explained)
    ↘ Fragmented (terminal)
```

**Data Structure:**
```typescript
{
  nodes: [
    {id: 'root', type: 'regular', ...},
    {
      id: 'monosemantic',
      type: 'regular',
      featureIds: Set(450),
      parentId: 'root',
      depth: 1,
      tagName: 'Monosemantic',
      color: '#808080'
    },
    {
      id: 'fragmented_terminal',
      type: 'terminal',
      featureIds: Set(1198),
      parentId: 'root',
      depth: 1,
      tagName: 'Fragmented',
      color: '#F0E442',
      position: 'rightmost'  // No further expansion
    },
    {
      id: 'stage2_segment',
      type: 'segment',
      metric: 'quality_score',
      threshold: 0.7,
      parentId: 'monosemantic',
      depth: 2,
      featureIds: Set(450),  // All monosemantic features
      segments: [
        {
          tagName: 'Need Revision',
          featureIds: Set(200),   // Monosemantic with quality < 0.7
          featureCount: 200,
          color: '#808080',
          height: 200/450 * totalHeight,
          yPosition: 0
        },
        {
          tagName: 'Well-Explained',
          featureIds: Set(250),   // Monosemantic with quality >= 0.7
          featureCount: 250,
          color: '#009E73',
          height: 250/450 * totalHeight,
          yPosition: 200/450 * totalHeight
        }
      ]
    }
  ],
  links: [
    {source: 'root', target: 'monosemantic', value: 450},
    {source: 'root', target: 'fragmented_terminal', value: 1198},
    {source: 'monosemantic', target: 'stage2_segment', value: 450}
  ]
}
```

**Histogram:**
- Overlaid on link between Monosemantic → Stage 2 segment node
- Shows quality_score distribution
- Threshold line at 0.7 (draggable)

### Stage 3: Cause (pre-defined groups)
**User clicks "Determine Cause" tag**

**Action:**
1. Split Stage 2 segment node into actual nodes
2. Need Revision → extends to another segment node (for Cause)
3. Well-Explained → extends to terminal node (rightmost)

**User sees:**
```
Root → Monosemantic → Need Revision → Segment Node
                                      (4 cause segments)
                   ↘ Well-Explained (terminal)
    ↘ Fragmented (terminal)
```

**Data Structure:**
```typescript
{
  nodes: [
    {id: 'root', type: 'regular', ...},
    {id: 'monosemantic', type: 'regular', ...},
    {id: 'fragmented_terminal', type: 'terminal', ...},
    {
      id: 'need_revision',
      type: 'regular',
      featureIds: Set(200),
      parentId: 'monosemantic',
      depth: 2,
      tagName: 'Need Revision',
      color: '#808080'
    },
    {
      id: 'well_explained_terminal',
      type: 'terminal',
      featureIds: Set(250),
      parentId: 'monosemantic',
      depth: 2,
      tagName: 'Well-Explained',
      color: '#009E73',
      position: 'rightmost'
    },
    {
      id: 'stage3_segment',
      type: 'segment',
      metric: null,  // No metric (pre-defined groups)
      threshold: null,
      parentId: 'need_revision',
      depth: 3,
      featureIds: Set(200),
      segments: [
        {
          tagName: 'Missed Context',
          featureIds: Set(0),  // Initially all in Unsure
          featureCount: 0,
          color: '#0072B2',
          height: 0,
          yPosition: 0
        },
        {
          tagName: 'Missed Lexicon',
          featureIds: Set(0),
          featureCount: 0,
          color: '#E69F00',
          height: 0,
          yPosition: 0
        },
        {
          tagName: 'Noisy Activation',
          featureIds: Set(0),
          featureCount: 0,
          color: '#CC79A7',
          height: 0,
          yPosition: 0
        },
        {
          tagName: 'Unsure',
          featureIds: Set(200),  // All features start here
          featureCount: 200,
          color: '#999999',
          height: totalHeight,
          yPosition: 0
        }
      ]
    }
  ],
  links: [
    {source: 'root', target: 'monosemantic', value: 450},
    {source: 'root', target: 'fragmented_terminal', value: 1198},
    {source: 'monosemantic', target: 'need_revision', value: 200},
    {source: 'monosemantic', target: 'well_explained_terminal', value: 250},
    {source: 'need_revision', target: 'stage3_segment', value: 200}
  ]
}
```

**No Histogram:**
- Cause stage has no metric-based threshold
- No histogram overlay needed
- Segment heights will update when users manually move features between categories (future feature)

---

## Data Structures

### New Type System (types.ts)

```typescript
// ============================================================================
// SANKEY NODE TYPES (Simplified)
// ============================================================================

export type SankeyNodeType = 'regular' | 'segment' | 'terminal'

export interface BaseSankeyNode {
  id: string
  type: SankeyNodeType
  featureIds: Set<number>
  featureCount: number
  parentId: string | null
  depth: number
  tagName?: string
  color?: string
}

export interface RegularSankeyNode extends BaseSankeyNode {
  type: 'regular'
  // Standard rectangle node
}

export interface TerminalSankeyNode extends BaseSankeyNode {
  type: 'terminal'
  position: 'rightmost'
  // Solid vertical bar at rightmost position (no further expansion)
}

export interface NodeSegment {
  tagName: string
  featureIds: Set<number>
  featureCount: number
  color: string
  height: number        // Visual height (0-1, proportional)
  yPosition: number     // Y position (0-1, normalized)
}

export interface SegmentSankeyNode extends BaseSankeyNode {
  type: 'segment'
  metric: string | null
  threshold: number | null
  segments: NodeSegment[]
  // Single vertical bar with colored segments
}

export type SankeyNode = RegularSankeyNode | TerminalSankeyNode | SegmentSankeyNode

// ============================================================================
// SANKEY STRUCTURE
// ============================================================================

export interface SankeyLink {
  source: string
  target: string
  value: number
}

export interface SankeyStructure {
  nodes: SankeyNode[]
  links: SankeyLink[]
  currentStage: 1 | 2 | 3
}

// ============================================================================
// STAGE CONFIGURATION
// ============================================================================

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
```

### Stage Configuration (lib/sankey-stages.ts - NEW FILE)

```typescript
import { TAG_CATEGORIES } from './tag-constants'

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

export function getStageConfig(stageNumber: 1 | 2 | 3): StageConfig {
  return STAGE_CONFIGS[stageNumber - 1]
}
```

---

## Implementation Strategy

### Phase 1: Core Infrastructure (Clean Slate)
**Goal:** Create new simplified building logic

**Tasks:**
1. Create `lib/sankey-stages.ts` (stage configurations)
2. Update `types.ts` with new node types
3. Create `lib/sankey-builder.ts` (NEW) - core building logic:
   ```typescript
   // Main builder functions
   function buildStage1(): SankeyStructure
   function buildStage2(stage1Structure: SankeyStructure, threshold1: number): SankeyStructure
   function buildStage3(stage2Structure: SankeyStructure, threshold2: number): SankeyStructure

   // Segment calculation
   function calculateSegments(
     featureIds: Set<number>,
     metric: string,
     threshold: number,
     tags: string[],
     tagColors: Record<string, string>
   ): NodeSegment[]

   // Feature grouping (local, no backend)
   function groupFeaturesByThreshold(
     featureIds: Set<number>,
     metric: string,
     threshold: number,
     tableData: any
   ): {belowThreshold: Set<number>, aboveThreshold: Set<number>}
   ```

4. Create `lib/sankey-d3-converter.ts` (NEW) - converts simplified structure to D3:
   ```typescript
   function convertToD3Format(
     structure: SankeyStructure,
     width: number,
     height: number
   ): {nodes: D3SankeyNode[], links: D3SankeyLink[]}
   ```

### Phase 2: Store Actions (Simplified)
**Goal:** Replace complex tree actions with stage-based actions

**New Store Actions (store/sankey-actions-v2.ts):**
```typescript
export const createSankeyActions = (set, get) => ({
  // Initialization
  initializeSankey: async () => {
    // 1. Load root features from backend
    // 2. Build Stage 1 automatically
    // 3. Set currentStage = 1
  },

  // Stage progression
  activateStage2: async () => {
    // 1. Get current threshold from stage1_segment
    // 2. Call buildStage2()
    // 3. Set currentStage = 2
  },

  activateStage3: async () => {
    // 1. Get thresholds from stage1_segment and stage2_segment
    // 2. Call buildStage3()
    // 3. Set currentStage = 3
  },

  // Threshold updates
  updateStageThreshold: (stageNumber: 1 | 2 | 3, newThreshold: number) => {
    // 1. Update threshold in segment node
    // 2. Recalculate segments
    // 3. Rebuild D3 structure
    // No rebuilding downstream stages!
  },

  // D3 conversion
  recomputeD3Structure: () => {
    // Convert current SankeyStructure to D3 format
  }
})
```

**Store State:**
```typescript
interface SankeyState {
  // Core data
  rootFeatureIds: Set<number> | null
  sankeyStructure: SankeyStructure | null  // Current structure
  d3Layout: {nodes: D3SankeyNode[], links: D3SankeyLink[]} | null

  // Stage tracking
  currentStage: 1 | 2 | 3
  stage1Threshold: number
  stage2Threshold: number

  // Table data (for local feature grouping)
  tableData: any | null

  // Loading/error
  isLoading: boolean
  error: string | null
}
```

### Phase 3: Component Updates
**Goal:** Render new node types correctly

**SankeyDiagram.tsx Updates:**
```typescript
// Add new rendering logic for segment nodes
const SegmentNode: React.FC<{
  node: SegmentSankeyNode
  layout: D3SankeyNode
  onSegmentClick?: (tagName: string) => void
}> = ({ node, layout }) => {
  const totalHeight = layout.y1 - layout.y0

  return (
    <g className="segment-node">
      {node.segments.map((segment, i) => (
        <rect
          key={i}
          x={layout.x0}
          y={layout.y0 + (segment.yPosition * totalHeight)}
          width={layout.x1 - layout.x0}
          height={segment.height * totalHeight}
          fill={segment.color}
          opacity={0.85}
          stroke="#ffffff"
          strokeWidth={1}
        >
          <title>{`${segment.tagName}\n${segment.featureCount} features`}</title>
        </rect>
      ))}
    </g>
  )
}
```

**SankeyOverlay.tsx Updates:**
```typescript
// Simplify to only show histogram for segment nodes
// Remove complex stage detection logic
// Focus on threshold handles for segment nodes only

{layout.nodes.map(node => {
  if (node.type !== 'segment') return null
  if (!node.metric) return null  // Skip Cause stage (no histogram)

  return (
    <g key={node.id}>
      <SankeyNodeHistogram
        node={node}
        histogramData={histogramData[node.metric]}
        threshold={node.threshold}
      />
      <ThresholdHandle
        node={node}
        onUpdate={(newThreshold) => updateStageThreshold(node.depth, newThreshold)}
      />
    </g>
  )
})}
```

### Phase 4: Integration
**Goal:** Connect new system to existing components

**Tasks:**
1. Update `TagCategoryPanel` to call new stage activation actions
2. Update `QualityTable` to use new feature IDs from segment nodes
3. Ensure histogram data fetching works with new node structure
4. Test threshold updates and segment resizing

### Phase 5: Cleanup
**Goal:** Remove old code

**Files to Delete/Simplify:**
- `lib/threshold-utils.ts` - Remove tree building logic (keep percentile calculations)
- `store/sankey-actions.ts` - Replace with sankey-actions-v2.ts
- Remove all Set intersection code
- Remove featureGroupCache (not needed for fixed 3 stages)
- Remove complex maxVisibleStage filtering

---

## File Changes

### New Files
```
lib/sankey-stages.ts          - Stage configurations
lib/sankey-builder.ts         - Core building logic
lib/sankey-d3-converter.ts    - D3 conversion
store/sankey-actions-v2.ts    - Simplified actions
```

### Modified Files
```
types.ts                       - New node types
SankeyDiagram.tsx             - Segment node rendering
SankeyOverlay.tsx             - Simplified histogram/threshold logic
store/index.ts                - New state structure
```

### Deleted/Simplified Files
```
lib/threshold-utils.ts        - Remove tree building (keep percentile utils)
store/sankey-actions.ts       - Replace with v2
```

---

## Migration Path

### Step 1: Parallel Implementation
- Keep old code intact
- Implement new system alongside
- Use feature flag to switch between old/new

### Step 2: Testing
- Test Stage 1 rendering
- Test Stage 1→2 progression
- Test Stage 2→3 progression
- Test threshold updates
- Test histogram interactions

### Step 3: Cutover
- Switch to new system
- Remove old code
- Update documentation

---

## Testing Strategy

### Unit Tests (Optional for prototype)
```typescript
describe('Sankey Builder', () => {
  test('buildStage1 creates root + segment node', () => {
    const structure = buildStage1(allFeatures, 0.4)
    expect(structure.nodes).toHaveLength(2)
    expect(structure.nodes[1].type).toBe('segment')
    expect(structure.nodes[1].segments).toHaveLength(2)
  })

  test('Segment heights proportional to feature counts', () => {
    const structure = buildStage1(allFeatures, 0.4)
    const segmentNode = structure.nodes[1] as SegmentSankeyNode
    const totalFeatures = segmentNode.featureCount

    segmentNode.segments.forEach(seg => {
      expect(seg.height).toBeCloseTo(seg.featureCount / totalFeatures)
    })
  })

  test('buildStage2 splits segment node correctly', () => {
    const stage1 = buildStage1(allFeatures, 0.4)
    const stage2 = buildStage2(stage1, 0.7)

    // Should have 4 nodes: root, monosemantic, fragmented_terminal, stage2_segment
    expect(stage2.nodes).toHaveLength(4)
    expect(stage2.nodes.filter(n => n.type === 'terminal')).toHaveLength(1)
    expect(stage2.nodes.filter(n => n.type === 'segment')).toHaveLength(1)
  })
})
```

### Manual Testing Checklist
- [ ] App loads with Stage 1 visible
- [ ] Root node on left, segment node on right
- [ ] Segment heights correct (proportional to feature counts)
- [ ] Histogram displays on link
- [ ] Threshold handle draggable
- [ ] Segments resize as threshold changes
- [ ] Tag labels visible on segments
- [ ] Click "Assess Quality" → Stage 2 appears
- [ ] Monosemantic node created
- [ ] Fragmented terminal node at rightmost position
- [ ] Stage 2 segment node created
- [ ] Stage 2 histogram displays
- [ ] Stage 2 threshold adjustable
- [ ] Click "Determine Cause" → Stage 3 appears
- [ ] Need Revision node created
- [ ] Well-Explained terminal node at rightmost position
- [ ] Stage 3 segment node shows 4 cause segments
- [ ] No histogram for Stage 3 (no metric)
- [ ] All features initially in "Unsure" segment

---

## Success Criteria

### Functional Requirements
✅ Fixed 3-stage progression works
✅ Segment nodes render with correct colors and heights
✅ Histogram overlays work on segment nodes
✅ Threshold adjustments update segments in real-time
✅ Terminal nodes render as solid bars at rightmost position
✅ Auto-activates Stage 1 on app load

### Code Quality
✅ < 500 lines total for core building logic
✅ Clear separation: builder → D3 converter → renderer
✅ No complex tree data structures
✅ Easy to understand and modify
✅ Well-commented for conference demo adjustments

### Performance
✅ Stage transitions < 100ms
✅ Threshold updates < 50ms (local calculation, no backend)
✅ Initial load < 500ms

---

## Future Enhancements (Not in Scope)

1. **Going back in stages** - Allow clicking earlier stages to collapse later ones
2. **Cause category assignment** - UI for moving features between cause categories
3. **Animation** - Smooth transitions between stages
4. **Segment interactions** - Clicking segments to filter table
5. **Custom thresholds** - Input field for exact threshold values
6. **Multiple thresholds** - Support for 2+ thresholds per stage (creating 3+ segments)

---

## Questions for Review

1. Should we keep any of the old tree-building code as reference, or delete completely?
2. Should we implement animations for stage transitions, or keep it instant?
3. Do we need to support custom threshold input (text field), or only visual dragging?
4. Should segment node tooltips show anything beyond tag name and feature count?

---

**End of Refactoring Plan**
*Created: November 2025*
*Status: Draft for Review*
