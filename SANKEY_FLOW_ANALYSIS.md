# Sankey Building and Rendering Flow Analysis

This document provides a comprehensive flow analysis for the Sankey diagram building and rendering process in the SAE Feature Visualization project.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Flow 1: Page Load](#flow-1-page-load)
3. [Flow 2: Stage 1 → Stage 2 Transition](#flow-2-stage-1--stage-2-transition)
4. [Flow 3: Stage 2 → Stage 3 Transition](#flow-3-stage-2--stage-3-transition)
5. [Function Reference](#function-reference)

---

## Architecture Overview

### Fixed 3-Stage Sankey System

```
Stage 1: Feature Splitting (decoder_similarity)
    └── Segments: Monosemantic / Fragmented

Stage 2: Quality Assessment (quality_score)
    └── Segments: Well-Explained / Need Revision

Stage 3: Cause Determination (pre-defined groups)
    └── Segments: Noisy Activation / Missed Lexicon / Missed Context / Unsure
```

### Key Components

| File | Purpose |
|------|---------|
| `store/index.ts` | Zustand store - central state management |
| `store/sankey-actions.ts` | Stage building actions (initializeSankey, activateStage2, activateStage3) |
| `lib/sankey-builder.ts` | Core Sankey structure building (buildStage1, buildStage2, buildStage3) |
| `lib/sankey-utils.ts` | D3 layout calculations (calculateSankeyLayout, convertToD3Format) |
| `lib/sankey-stages.ts` | Stage configurations (getStageConfig) |
| `lib/sankey-histogram-utils.ts` | Histogram layout for nodes |
| `components/SankeyDiagram.tsx` | Main visualization component |
| `components/SankeyOverlay.tsx` | Histogram and threshold slider overlay |
| `components/SankeyHistogramPopover.tsx` | Histogram popover for threshold editing |

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER ACTION                                        │
│              (Page Load / Next Stage Button Click)                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        STORE ACTION DISPATCH                                 │
│    initializeWithDefaultFilters() / activateStage2() / activateStage3()    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SANKEY BUILDER                                       │
│           buildStage1() / buildStage2() / buildStage3()                     │
│                                                                              │
│  Creates: SankeyStructure { nodes, links, currentStage }                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       D3 CONVERSION                                          │
│                    convertToD3Format()                                       │
│                                                                              │
│  Converts: SankeyStructure → D3SankeyNode[] + D3SankeyLink[]               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       STATE UPDATE                                           │
│        set({ sankeyStructure, d3Layout }) → Zustand Store                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    REACT RE-RENDER                                           │
│               SankeyDiagram Component Updates                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     LAYOUT CALCULATION                                       │
│                   calculateSankeyLayout()                                    │
│                                                                              │
│  Uses D3-Sankey: positions nodes/links with coordinates                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       SVG RENDERING                                          │
│  SankeyNode / SankeyLink / VerticalBarSankeyNode / SankeyOverlay           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Flow 1: Page Load

### Overview
When the application loads, it initializes the Sankey diagram with Stage 1 (Feature Splitting).

### Sequence Diagram

```
┌─────────┐     ┌─────────────┐     ┌──────────────┐     ┌───────────────┐     ┌──────────────┐
│  App    │     │   Store     │     │ sankey-      │     │ sankey-       │     │ SankeyDiagram│
│.tsx     │     │  index.ts   │     │ actions.ts   │     │ builder.ts    │     │ .tsx         │
└────┬────┘     └──────┬──────┘     └──────┬───────┘     └───────┬───────┘     └──────┬───────┘
     │                 │                   │                     │                    │
     │ useEffect       │                   │                     │                    │
     │ (mount)         │                   │                     │                    │
     │─────────────────>                   │                     │                    │
     │                 │                   │                     │                    │
     │        initializeWithDefaultFilters()                     │                    │
     │                 │───────────────────>                     │                    │
     │                 │                   │                     │                    │
     │                 │    1. Fetch Feature IDs (API)           │                    │
     │                 │   ─────────────────────────────────>    │                    │
     │                 │                   │                     │                    │
     │                 │    2. buildSankeyFromFeatureIds()       │                    │
     │                 │                   │─────────────────────>                    │
     │                 │                   │                     │                    │
     │                 │                   │      buildStage1()  │                    │
     │                 │                   │─────────────────────>                    │
     │                 │                   │                     │                    │
     │                 │                   │  calculateSegments()│                    │
     │                 │                   │─────────────────────>                    │
     │                 │                   │                     │                    │
     │                 │                   │  SankeyStructure    │                    │
     │                 │                   │<────────────────────│                    │
     │                 │                   │                     │                    │
     │                 │    3. recomputeD3StructureV2()          │                    │
     │                 │                   │                     │                    │
     │                 │         convertToD3Format()             │                    │
     │                 │                   │─────────────────────────────────>        │
     │                 │                   │                                          │
     │                 │    4. set({ sankeyStructure, d3Layout })│                    │
     │                 │<──────────────────│                     │                    │
     │                 │                   │                     │                    │
     │                 │    5. Re-render triggered               │                    │
     │                 │─────────────────────────────────────────────────────────────>│
     │                 │                   │                     │                    │
     │                 │                   │                     │    useMemo:        │
     │                 │                   │                     │ calculateSankeyLayout()
     │                 │                   │                     │                    │
     │                 │                   │                     │    SVG Render      │
     │                 │                   │                     │                    │
```

### Detailed Function Flow

---

#### 1. `App.tsx` - Application Mount

**Location**: `frontend/src/components/App.tsx`

**Trigger**: React useEffect on component mount

**Purpose**: Initialize the application with default filters and load Sankey

```typescript
useEffect(() => {
  // Health check, then initialize
  await initializeWithDefaultFilters()
}, [])
```

---

#### 2. `initializeWithDefaultFilters()` - Store Initialization

**Location**: `store/index.ts:991-1099`

**Purpose**: Set default filters and trigger parallel initialization

**Flow**:
```
1. Get filterOptions from state
2. Extract llmExplainers and llmScorers
3. Set filters for leftPanel (all explainers + all scorers)
4. Initialize tree-based system with empty root node
5. Fetch all feature IDs via API (getFeatureGroups)
6. Run parallel initialization:
   - fetchTableData()
   - buildSankeyFromFeatureIds()
   - fetchAllActivationsCached()
7. Activate Feature Splitting category
```

**Key Code**:
```typescript
// Step 1: Fetch feature IDs
const rootResponse = await api.getFeatureGroups({
  filters,
  metric: 'root',
  thresholds: []
})
const groups = processFeatureGroupResponse(rootResponse)
const allFeatureIds = Array.from(groups[0].featureIds)

// Step 2: Parallel init
await Promise.all([
  get().fetchTableData(),
  get().buildSankeyFromFeatureIds(allFeatureIds, PANEL_LEFT),
  get().fetchAllActivationsCached()
])
```

---

#### 3. `buildSankeyFromFeatureIds()` - Sankey Action

**Location**: `store/sankey-actions.ts:89-159`

**Purpose**: Build Sankey structure from pre-fetched feature IDs

**Input**:
- `featureIds: number[]` - Array of all feature IDs
- `panel: PanelSide` - Which panel (left/right)

**Flow**:
```
1. Get panel state and filters
2. Set loading state to true
3. Convert featureIds array to Set
4. Call buildStage1(filters, allFeatures)
5. Store sankeyStructure in state
6. Call recomputeD3StructureV2(panel)
7. Fetch histogram data for Stage 1
8. Set loading state to false
```

**Output**: Updates store with `sankeyStructure` and triggers D3 recomputation

---

#### 4. `buildStage1()` - Stage 1 Builder

**Location**: `lib/sankey-builder.ts:164-220`

**Purpose**: Create Stage 1 Sankey structure (Feature Splitting)

**Input**:
- `filters: Filters` - Current filter settings
- `allFeatures: Set<number>` - All feature IDs
- `threshold?: number` - Optional custom threshold (default: 0.4)

**Flow**:
```
1. Get stage config from getStageConfig(1)
2. Create root node:
   {
     id: 'root',
     type: 'regular',
     featureIds: allFeatures,
     featureCount: allFeatures.size,
     tagName: 'All Features',
     color: '#d1d5db'
   }
3. Get tag colors from getTagColors(config.categoryId)
4. Call calculateSegments() to get feature groups:
   - Calls API: getFeatureGroups(filters, metric, [threshold])
   - Processes response to extract groups
   - Intersects groups with parent features
   - Maps to NodeSegment[] with colors and heights
5. Create segment node:
   {
     id: 'stage1_segment',
     type: 'segment',
     metric: 'decoder_similarity',
     threshold: 0.4,
     segments: [
       { tagName: 'Monosemantic', featureIds: Set, color: '#...' },
       { tagName: 'Fragmented', featureIds: Set, color: '#...' }
     ]
   }
6. Create link: root → stage1_segment
7. Return SankeyStructure { nodes, links, currentStage: 1 }
```

**Output**:
```typescript
SankeyStructure {
  nodes: [rootNode, segmentNode],
  links: [{ source: 'root', target: 'stage1_segment', value: N }],
  currentStage: 1
}
```

---

#### 5. `calculateSegments()` - Segment Calculator

**Location**: `lib/sankey-builder.ts:41-91`

**Purpose**: Calculate feature segments using API and set intersection

**Input**:
- `filters: Filters` - Current filters
- `parentFeatureIds: Set<number>` - Features from parent node
- `metric: string` - Metric for grouping
- `threshold: number` - Threshold value
- `tags: string[]` - Tag names for segments
- `tagColors: Record<string, string>` - Colors for each tag

**Flow**:
```
1. Call API: getFeatureGroups({ filters, metric, thresholds: [threshold] })
2. Process response to extract groups via processFeatureGroupResponse()
3. Calculate total features from parentFeatureIds
4. For each group:
   a. Intersect group.featureIds with parentFeatureIds
   b. Calculate proportional height
   c. Create NodeSegment:
      {
        tagName: 'Monosemantic' or 'Fragmented',
        featureIds: intersectedSet,
        featureCount: N,
        color: '#...',
        height: proportional (0-1),
        yPosition: cumulative (0-1)
      }
5. Return NodeSegment[]
```

---

#### 6. `recomputeD3StructureV2()` - D3 Conversion

**Location**: `store/sankey-actions.ts:509-541`

**Purpose**: Convert SankeyStructure to D3-compatible format

**Input**:
- `panel: PanelSide` - Which panel to recompute

**Flow**:
```
1. Get sankeyStructure from panel state
2. Call convertToD3Format(sankeyStructure, 800, 800)
3. Store d3Layout in panel state:
   set({ d3Layout: { nodes: D3SankeyNode[], links: D3SankeyLink[] } })
```

---

#### 7. `convertToD3Format()` - D3 Format Converter

**Location**: `lib/sankey-utils.ts:686-807`

**Purpose**: Convert simplified SankeyStructure to D3-compatible format

**Input**:
- `structure: SankeyStructure` - Simplified structure
- `width: number` - Layout width
- `height: number` - Layout height

**Flow**:
```
1. Calculate margins and inner dimensions
2. Convert nodes:
   For each node in structure.nodes:
   - Set stage based on node type and depth
   - Set node_type: 'vertical_bar' for segment/terminal, 'standard' otherwise
   - Copy featureIds, featureCount, colors
3. Create nodeIdMap for link resolution
4. Transform links: convert source/target IDs to indices
5. Create D3 sankey generator:
   sankey()
     .nodeWidth(15)
     .nodePadding(10)
     .extent([[1,1], [innerWidth-1, innerHeight-1]])
     .nodeAlign(node => node.stage || 0)
6. Process with D3: sankeyGenerator({ nodes, links })
7. Expand vertical_bar nodes (6x width)
8. Handle special 2-node case positioning
9. Return { nodes: D3SankeyNode[], links: D3SankeyLink[] }
```

**Output**:
```typescript
{
  nodes: D3SankeyNode[],  // With x0, x1, y0, y1 coordinates
  links: D3SankeyLink[]   // With source/target node references
}
```

---

#### 8. `SankeyDiagram.tsx` - Component Render

**Location**: `components/SankeyDiagram.tsx:413-1076`

**Purpose**: Render the Sankey visualization

**State Subscriptions**:
```typescript
const d3Layout = useVisualizationStore(state => state[panelKey].d3Layout)
const sankeyStructure = useVisualizationStore(state => state[panelKey].sankeyStructure)
const histogramData = useVisualizationStore(state => state[panelKey].histogramData)
```

**Data Processing Flow**:
```
1. useMemo: Create display data from d3Layout
   - Return null if no d3Layout or sankeyStructure
   - Format as SankeyData { nodes, links, metadata }

2. useEffect: Update displayData when loading completes
   - setDisplayData(data) when !loading && data

3. useMemo: Calculate layout
   - validateDimensions(width, height)
   - validateSankeyData(displayData)
   - calculateSankeyLayout(displayData, width, height, margin)
   - Apply right-to-left transform if needed
   - Return { layout, validationErrors }
```

---

#### 9. `calculateSankeyLayout()` - Layout Calculator

**Location**: `lib/sankey-utils.ts:141-421`

**Purpose**: Calculate D3 Sankey layout with proper node positioning

**Input**:
- `sankeyData: any` - { nodes, links }
- `layoutWidth?: number` - Container width
- `layoutHeight?: number` - Container height
- `customMargin?` - Custom margins

**Flow**:
```
1. Validate input data (nodes, links arrays exist)
2. Build node reference sets
3. Filter nodes (keep referenced or with features)
4. Create nodeIdMap for link resolution
5. Transform links to use node indices
6. Add originalIndex to nodes for sorting
7. Build parent-child relationships from links
8. Define smart sorting functions:
   - smartNodeSort: by stage, ancestor, depth, parent, category
   - linkSort: by source index, then target index
9. Create D3 sankey generator:
   sankey<D3SankeyNode, D3SankeyLink>()
     .nodeWidth(20)
     .nodePadding(10)
     .extent([[1,1], [width-1, height-1]])
     .nodeAlign(stageBasedAlign)
     .nodeSort(smartNodeSort)
     .linkSort(linkSort)
10. Process: sankeyGenerator({ nodes, links })
11. Expand vertical_bar nodes (3x nodeWidth)
12. Handle special cases (1-node, 2-node layouts)
13. Return SankeyLayout { nodes, links, width, height, margin }
```

---

#### 10. SVG Rendering

**Location**: `components/SankeyDiagram.tsx:759-1072`

**Purpose**: Render SVG elements for Sankey visualization

**Render Flow**:
```
1. <svg> container with dimensions
2. <defs> for patterns (terminal stripes)
3. <g> with margin transform
4. Links layer:
   For each link in layout.links:
   - <SankeyLink> component
   - Uses getSankeyPath() for path data
   - getLinkColor() for stroke color
5. Nodes layer:
   For each node in layout.nodes:
   - If vertical_bar: <VerticalBarSankeyNode>
     - Renders segments with colors
     - Shows stripe overlay for terminal segments
   - Else: <SankeyNode>
     - Simple rectangle with border
6. <SankeyOverlay>:
   - Node histograms on source nodes
   - Threshold sliders for segment control
7. Node labels layer:
   For each node:
   - Render segment labels with tag name, metric, threshold
   - <OutlinedLabel> for visibility
```

---

#### 11. `SankeyOverlay.tsx` - Histogram & Slider Overlay

**Location**: `components/SankeyOverlay.tsx:315-536`

**Purpose**: Render inline histograms and threshold sliders

**Render Flow**:
```
1. Node Histograms group:
   For each node with outgoing links:
   - Find target segment node
   - Get metric from target structure node
   - Look up histogram data: histogramData[`${metric}:${targetNodeId}`]
   - Render <SankeyNodeHistogram>

2. Threshold Sliders group:
   For each source node linking to segment:
   - Get target segment info (metric, threshold)
   - Get histogram data for min/max values
   - Render <ThresholdHandles>:
     - orientation: 'vertical'
     - bounds: node height
     - onUpdate: calls onThresholdUpdate
     - onDragUpdate: live preview with optimistic segments
```

---

#### 12. `SankeyNodeHistogram` - Inline Histogram

**Location**: `components/SankeyOverlay.tsx:51-295`

**Purpose**: Render horizontal histogram bars on source nodes

**Flow**:
```
1. Find target segment node from links
2. Get committed threshold and segment colors
3. Calculate layout via calculateNodeHistogramLayout()
4. Create yScale for metric values
5. Calculate bar segments for threshold coloring
6. Render:
   - Horizontal bars colored by threshold position
   - Stripe overlay for terminal segments
   - Y-axis ticks for metric values
   - "Random" baseline for quality_score
```

---

## Flow 2: Stage 1 → Stage 2 Transition

### Overview
When user clicks "Next Stage" button after completing Feature Splitting tagging.

### Sequence Diagram

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│ TagStage    │     │   Store     │     │ sankey-      │     │ sankey-       │
│ Panel.tsx   │     │  index.ts   │     │ actions.ts   │     │ builder.ts    │
└──────┬──────┘     └──────┬──────┘     └──────┬───────┘     └───────┬───────┘
       │                   │                   │                     │
       │ onClick           │                   │                     │
       │ "Next Stage"      │                   │                     │
       │───────────────────>                   │                     │
       │                   │                   │                     │
       │          activateStage2()             │                     │
       │                   │───────────────────>                     │
       │                   │                   │                     │
       │                   │   Get current sankeyStructure           │
       │                   │   Get pairSelectionStates               │
       │                   │   Get allClusterPairs                   │
       │                   │                   │                     │
       │                   │   buildStage2FromTaggedStates()         │
       │                   │                   │─────────────────────>
       │                   │                   │                     │
       │                   │                   │ deriveFeatureSetsFromPairSelections()
       │                   │                   │─────────────────────>
       │                   │                   │                     │
       │                   │                   │ { fragmentedIds, monosematicIds }
       │                   │                   │<────────────────────│
       │                   │                   │                     │
       │                   │                   │ calculateSegments(quality_score)
       │                   │                   │─────────────────────>
       │                   │                   │                     │
       │                   │                   │ SankeyStructure (Stage 2)
       │                   │                   │<────────────────────│
       │                   │                   │                     │
       │                   │   recomputeD3StructureV2()              │
       │                   │                   │                     │
       │                   │   Fetch histogram for stage2_segment    │
       │                   │                   │                     │
       │                   │   set({ sankeyStructure })              │
       │                   │<──────────────────│                     │
       │                   │                   │                     │
       │                   │   Re-render SankeyDiagram               │
       │<──────────────────│                   │                     │
```

### Detailed Function Flow

---

#### 1. TagStagePanel "Next Stage" Click

**Location**: `components/TagStagePanel.tsx`

**Trigger**: User clicks "Next Stage" button after Feature Splitting

**Action**: Calls store action to transition to Stage 2

---

#### 2. `activateStage2()` - Stage 2 Activation

**Location**: `store/sankey-actions.ts:261-353`

**Purpose**: Expand Stage 1 into Stage 2 structure

**Input**:
- `panel: PanelSide` - Which panel (default: PANEL_LEFT)

**Flow**:
```
1. Get state: sankeyStructure, filters, allClusterPairs, pairSelectionStates
2. Validate:
   - sankeyStructure exists
   - currentStage < 2 (not already at Stage 2)
3. Set loading state
4. Choose build method:
   - If allClusterPairs && pairSelectionStates.size > 0:
     → buildStage2FromTaggedStates() (uses actual user tags)
   - Else:
     → buildStage2() (uses threshold-based split)
5. Store updated sankeyStructure
6. Call recomputeD3StructureV2(panel)
7. Fetch histogram for stage2_segment
8. Clear loading state
```

---

#### 3. `buildStage2FromTaggedStates()` - Tagged State Builder

**Location**: `lib/sankey-builder.ts:350-465`

**Purpose**: Build Stage 2 using actual user tagging (not threshold)

**Input**:
- `filters: Filters` - Current filters
- `stage1Structure: SankeyStructure` - Previous structure
- `allClusterPairs: Array` - All pairs from clustering
- `pairSelectionStates: Map<string, 'selected' | 'rejected'>` - User tags
- `threshold?: number` - Quality threshold (default: 0.6)

**Flow**:
```
1. Get stage configs for Stage 1 and Stage 2
2. Get root features from Stage 1
3. Derive feature sets from pair selections:
   Call deriveFeatureSetsFromPairSelections()
   Returns: { fragmentedIds, monosematicIds }
4. Get tag colors for Feature Splitting
5. Create nodes array (keep root)
6. Create Monosemantic regular node:
   {
     id: 'monosemantic',
     type: 'regular',
     featureIds: monosematicIds,
     tagName: 'Monosemantic',
     color: from tag colors
   }
7. Create link: root → monosemantic
8. Create Fragmented terminal node:
   {
     id: 'fragmented_terminal',
     type: 'terminal',
     position: 'rightmost',
     featureIds: fragmentedIds,
     tagName: 'Fragmented'
   }
9. Create link: root → fragmented_terminal
10. Calculate Quality segments:
    Call calculateSegments(filters, monosematicIds, 'quality_score', threshold, ...)
11. Create Quality segment node:
    {
      id: 'stage2_segment',
      type: 'segment',
      metric: 'quality_score',
      threshold: 0.6,
      segments: [
        { tagName: 'Need Revision', ... },
        { tagName: 'Well-Explained', ... }
      ]
    }
12. Create link: monosemantic → stage2_segment
13. Return SankeyStructure { nodes, links, currentStage: 2 }
```

---

#### 4. `deriveFeatureSetsFromPairSelections()` - Feature Derivation

**Location**: `lib/sankey-builder.ts:114-146`

**Purpose**: Convert pair selections to feature sets

**Input**:
- `allClusterPairs: Array` - All pairs { main_id, similar_id, pair_key }
- `pairSelectionStates: Map<string, 'selected' | 'rejected'>` - User tags
- `parentFeatureIds: Set<number>` - Features to consider

**Flow**:
```
1. Initialize fragmentedIds = new Set()
2. For each pair in allClusterPairs:
   - Skip if either feature not in parentFeatureIds
   - Get pair state from pairSelectionStates
   - If state === 'selected':
     Add both main_id and similar_id to fragmentedIds
3. Initialize monosematicIds = new Set()
4. For each featureId in parentFeatureIds:
   - If NOT in fragmentedIds → add to monosematicIds
5. Return { fragmentedIds, monosematicIds }
```

**Logic**:
- **Fragmented**: Features with ANY pair tagged as "selected" (similar features)
- **Monosemantic**: ALL other features (including untagged/unsure)

---

#### 5. Stage 2 Structure Result

**Output**:
```typescript
SankeyStructure {
  nodes: [
    // Root (from Stage 1)
    { id: 'root', type: 'regular', featureCount: 16000 },

    // Monosemantic branch
    { id: 'monosemantic', type: 'regular', featureCount: 14000 },

    // Fragmented terminal
    { id: 'fragmented_terminal', type: 'terminal', featureCount: 2000 },

    // Quality segment on Monosemantic
    {
      id: 'stage2_segment',
      type: 'segment',
      metric: 'quality_score',
      segments: [
        { tagName: 'Need Revision', featureCount: 5000 },
        { tagName: 'Well-Explained', featureCount: 9000 }
      ]
    }
  ],
  links: [
    { source: 'root', target: 'monosemantic' },
    { source: 'root', target: 'fragmented_terminal' },
    { source: 'monosemantic', target: 'stage2_segment' }
  ],
  currentStage: 2
}
```

---

#### 6. Visual Result

```
          ┌──────────────────────────────────────┐
          │                                      │
          │        ┌─────────────────────────────┤ Fragmented (terminal)
          │        │                             │ (striped pattern)
          │        │                             │
┌─────────┤────────┤─────────────────────────────┤
│  Root   │ Mono-  │     Quality Segment         │
│  (All)  │semantic│ ┌─────────────────────────┐ │
│         │        │ │   Need Revision         │ │
│         │        │ │   (< 0.6 quality)       │ │
│         │        │ ├─────────────────────────┤ │
│         │        │ │   Well-Explained        │ │
│         │        │ │   (>= 0.6 quality)      │ │
│         │        │ │   (striped pattern)     │ │
└─────────┴────────┴─┴─────────────────────────┴─┘
   Stage 0   Stage 1        Stage 2
```

---

## Flow 3: Stage 2 → Stage 3 Transition

### Overview
When user clicks "Next Stage" button after completing Quality Assessment tagging.

### Sequence Diagram

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│ TagStage    │     │   Store     │     │ sankey-      │     │ sankey-       │
│ Panel.tsx   │     │  index.ts   │     │ actions.ts   │     │ builder.ts    │
└──────┬──────┘     └──────┬──────┘     └──────┬───────┘     └───────┬───────┘
       │                   │                   │                     │
       │ onClick           │                   │                     │
       │ "Next Stage"      │                   │                     │
       │───────────────────>                   │                     │
       │                   │                   │                     │
       │          activateStage3()             │                     │
       │                   │───────────────────>                     │
       │                   │                   │                     │
       │                   │   Validate currentStage >= 2            │
       │                   │                   │                     │
       │                   │   buildStage3()   │                     │
       │                   │                   │─────────────────────>
       │                   │                   │                     │
       │                   │                   │ Get stage2_segment  │
       │                   │                   │ Extract Need Revision│
       │                   │                   │ Extract Well-Explained
       │                   │                   │                     │
       │                   │                   │ Create Cause segments│
       │                   │                   │ (pre-defined, no API)│
       │                   │                   │                     │
       │                   │                   │ SankeyStructure (Stage 3)
       │                   │                   │<────────────────────│
       │                   │                   │                     │
       │                   │   recomputeD3StructureV2()              │
       │                   │                   │                     │
       │                   │   set({ sankeyStructure })              │
       │                   │<──────────────────│                     │
       │                   │                   │                     │
       │                   │   Re-render SankeyDiagram               │
       │<──────────────────│                   │                     │
```

### Detailed Function Flow

---

#### 1. `activateStage3()` - Stage 3 Activation

**Location**: `store/sankey-actions.ts:360-419`

**Purpose**: Expand Stage 2 into Stage 3 structure

**Input**:
- `panel: PanelSide` - Which panel (default: PANEL_LEFT)

**Flow**:
```
1. Get state: sankeyStructure
2. Validate:
   - sankeyStructure exists
   - currentStage >= 2 (Stage 2 must be active)
   - currentStage < 3 (not already at Stage 3)
3. Set loading state
4. Call buildStage3(sankeyStructure)
5. Store updated sankeyStructure
6. Call recomputeD3StructureV2(panel)
7. Clear loading state
```

**Note**: No histogram fetch - Stage 3 has pre-defined groups without metric threshold.

---

#### 2. `buildStage3()` - Stage 3 Builder

**Location**: `lib/sankey-builder.ts:477-582`

**Purpose**: Build Stage 3 with Cause determination segments

**Input**:
- `stage2Structure: SankeyStructure` - Previous structure

**Flow**:
```
1. Get stage config for Stage 3
2. Find stage2_segment in structure:
   const stage2Segment = nodes.find(n => n.id === 'stage2_segment')
3. Extract feature sets from Stage 2 segments:
   - needRevisionSegment = stage2Segment.segments[0] (< threshold)
   - wellExplainedSegment = stage2Segment.segments[1] (>= threshold)
4. Copy existing nodes (except stage2_segment)
5. Copy existing links (except those targeting stage2_segment)
6. Create Need Revision regular node:
   {
     id: 'need_revision',
     type: 'regular',
     featureIds: needRevisionSegment.featureIds,
     tagName: 'Need Revision',
     parentId: 'monosemantic'
   }
7. Create link: monosemantic → need_revision
8. Create Well-Explained terminal node:
   {
     id: 'well_explained_terminal',
     type: 'terminal',
     position: 'rightmost',
     featureIds: wellExplainedSegment.featureIds,
     tagName: 'Well-Explained'
   }
9. Create link: monosemantic → well_explained_terminal
10. Create Cause segments (pre-defined, initially all in "Unsure"):
    For each tag in ['Noisy Activation', 'Missed Lexicon', 'Missed Context', 'Unsure']:
    - If 'Unsure': featureIds = needRevision.featureIds, height = 1.0
    - Else: featureIds = empty, height = 0
11. Create Cause segment node:
    {
      id: 'stage3_segment',
      type: 'segment',
      metric: null,  // No metric threshold
      threshold: null,
      parentId: 'need_revision',
      segments: causeSegments
    }
12. Create link: need_revision → stage3_segment
13. Return SankeyStructure { nodes, links, currentStage: 3 }
```

---

#### 3. Stage 3 Structure Result

**Output**:
```typescript
SankeyStructure {
  nodes: [
    // From Stage 1
    { id: 'root', type: 'regular' },

    // From Stage 2
    { id: 'monosemantic', type: 'regular' },
    { id: 'fragmented_terminal', type: 'terminal' },

    // New in Stage 3
    { id: 'need_revision', type: 'regular' },
    { id: 'well_explained_terminal', type: 'terminal' },
    {
      id: 'stage3_segment',
      type: 'segment',
      metric: null,
      segments: [
        { tagName: 'Noisy Activation', featureCount: 0 },
        { tagName: 'Missed Lexicon', featureCount: 0 },
        { tagName: 'Missed Context', featureCount: 0 },
        { tagName: 'Unsure', featureCount: 5000 }  // All initially here
      ]
    }
  ],
  links: [
    { source: 'root', target: 'monosemantic' },
    { source: 'root', target: 'fragmented_terminal' },
    { source: 'monosemantic', target: 'need_revision' },
    { source: 'monosemantic', target: 'well_explained_terminal' },
    { source: 'need_revision', target: 'stage3_segment' }
  ],
  currentStage: 3
}
```

---

#### 4. Visual Result

```
                              ┌────────────────────────────────────┐
                              │                                    │
          ┌───────────────────┤         Fragmented (terminal)      │
          │                   │         (striped pattern)          │
          │                   │                                    │
          │   ┌───────────────┼────────────────────────────────────┤
          │   │               │                                    │
          │   │ ┌─────────────┤       Well-Explained (terminal)    │
          │   │ │             │       (striped pattern)            │
┌─────────┤───┤─┤─────────────┼────────────────────────────────────┤
│         │   │ │             │                                    │
│  Root   │Mono│Need│         Cause Segment                        │
│  (All)  │sem │Rev │  ┌──────────────────────────────────────────┐│
│         │   │    │  │ Noisy Activation  (initially 0)          ││
│         │   │    │  │ Missed Lexicon    (initially 0)          ││
│         │   │    │  │ Missed Context    (initially 0)          ││
│         │   │    │  │ Unsure            (all features here)    ││
│         │   │    │  │ (striped pattern)                        ││
└─────────┴───┴────┴──┴──────────────────────────────────────────┴─┘
  Stage 0   1    2              Stage 3
```

---

## Function Reference

### Store Actions (store/sankey-actions.ts)

| Function | Line | Purpose |
|----------|------|---------|
| `buildSankeyFromFeatureIds` | 89-159 | Build Sankey from pre-fetched feature IDs |
| `initializeSankey` | 166-250 | Initialize with API call + auto-build Stage 1 |
| `activateStage2` | 261-353 | Expand to Stage 2 (Quality Assessment) |
| `activateStage3` | 360-419 | Expand to Stage 3 (Cause Determination) |
| `updateStageThreshold` | 429-502 | Update threshold without rebuilding |
| `recomputeD3StructureV2` | 509-541 | Convert structure to D3 format |

### Sankey Builder (lib/sankey-builder.ts)

| Function | Line | Purpose |
|----------|------|---------|
| `calculateSegments` | 41-91 | Calculate feature segments via API |
| `getTagColors` | 96-102 | Get tag colors from category config |
| `deriveFeatureSetsFromPairSelections` | 114-146 | Convert pair tags to feature sets |
| `buildStage1` | 164-220 | Create Stage 1 structure |
| `buildStage2` | 234-333 | Create Stage 2 (threshold-based) |
| `buildStage2FromTaggedStates` | 350-465 | Create Stage 2 (tag-based) |
| `buildStage3` | 477-582 | Create Stage 3 structure |
| `updateStageThreshold` | 594-670 | Update threshold in structure |

### Sankey Utils (lib/sankey-utils.ts)

| Function | Line | Purpose |
|----------|------|---------|
| `applyOpacity` | 86-89 | Apply opacity to hex color |
| `stageBasedAlign` | 94-97 | D3 node alignment by stage |
| `calculateSankeyLayout` | 141-421 | Main D3 layout calculation |
| `getSankeyPath` | 424-426 | Get SVG path for link |
| `getNodeColor` | 428-444 | Get node fill color |
| `getLinkColor` | 450-453 | Get link stroke color |
| `validateDimensions` | 462-467 | Validate container size |
| `validateSankeyData` | 472-522 | Validate data structure |
| `applyRightToLeftTransform` | 531-568 | Mirror layout for right panel |
| `calculateVerticalBarNodeLayout` | 583-673 | Layout for vertical bar nodes |
| `convertToD3Format` | 686-807 | Convert structure to D3 format |

### Sankey Stages (lib/sankey-stages.ts)

| Function | Line | Purpose |
|----------|------|---------|
| `getStageConfig` | 80-82 | Get config for stage number |
| `getTagCategory` | 87-89 | Get tag category by ID |
| `isTerminalTag` | 94-97 | Check if tag is terminal |
| `getNextStage` | 102-106 | Get next stage number |

### Sankey Histogram Utils (lib/sankey-histogram-utils.ts)

| Function | Line | Purpose |
|----------|------|---------|
| `getHistogramColorForMetric` | 76-93 | Get histogram bar color |
| `hasOutgoingLinks` | 98-106 | Check if node has outgoing links |
| `getNodeHistogramMetric` | 113-120 | Get metric for node histogram |
| `calculateNodeHistogramBars` | 137-208 | Calculate horizontal bar layout |
| `calculateNodeHistogramLayout` | 224-287 | Full histogram layout calculation |
| `shouldDisplayNodeHistogram` | 297-324 | Check if histogram should show |
| `calculateHistogramYAxisTicks` | 337-358 | Calculate Y-axis tick positions |

### Components

| Component | File | Purpose |
|-----------|------|---------|
| `SankeyDiagram` | SankeyDiagram.tsx:413 | Main visualization |
| `SankeyNode` | SankeyDiagram.tsx:112 | Standard node renderer |
| `SankeyLink` | SankeyDiagram.tsx:176 | Link path renderer |
| `VerticalBarSankeyNode` | SankeyDiagram.tsx:210 | Vertical bar with segments |
| `OutlinedLabel` | SankeyDiagram.tsx:63 | Label with white outline |
| `SankeyOverlay` | SankeyOverlay.tsx:315 | Histogram and slider overlay |
| `SankeyNodeHistogram` | SankeyOverlay.tsx:51 | Inline histogram on nodes |
| `HistogramPopover` | SankeyHistogramPopover.tsx:316 | Draggable histogram popover |

---

## Summary

### Key Architectural Decisions

1. **Fixed 3-Stage Architecture**: Progression is always Stage 1 → 2 → 3, no dynamic stage addition
2. **Structure-First Design**: Build `SankeyStructure` first, then convert to D3 format
3. **Tag-Based Transitions**: Stage transitions use actual user tags, not threshold segments
4. **Optimistic Updates**: Threshold drag shows live preview before committing
5. **Histogram Per Stage**: Each stage has its own histogram with metric-specific thresholds

### Performance Optimizations

1. **Parallel Initialization**: Table, Sankey, and Activations load in parallel
2. **Pre-fetched Feature IDs**: Single API call provides IDs for all parallel operations
3. **Memoized Layouts**: `useMemo` prevents recalculation on every render
4. **Debounced Threshold Updates**: Live preview without overwhelming the store

### State Flow

```
User Action
    ↓
Store Action (sankey-actions.ts)
    ↓
Builder Function (sankey-builder.ts)
    ↓
SankeyStructure { nodes, links, currentStage }
    ↓
convertToD3Format() (sankey-utils.ts)
    ↓
D3Layout { nodes: D3SankeyNode[], links: D3SankeyLink[] }
    ↓
Store Update (set({ sankeyStructure, d3Layout }))
    ↓
React Re-render (SankeyDiagram.tsx)
    ↓
calculateSankeyLayout() (sankey-utils.ts)
    ↓
SVG Rendering
```
