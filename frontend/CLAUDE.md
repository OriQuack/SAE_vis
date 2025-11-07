# Frontend CLAUDE.md - SAE Feature Visualization React Application

This document provides comprehensive guidance for the React frontend of the SAE Feature Visualization project. This is the user interface for a research prototype designed for academic conference demonstrations.

## 🎯 Frontend Architecture Overview

**Purpose**: Interactive visualization interface for exploring SAE feature explanation reliability
**Status**: ✅ **ADVANCED RESEARCH PROTOTYPE** - All 8 phases complete, conference-ready
**Key Innovation**: Smart tree-based Sankey building with frontend-side set intersection

### 🔄 Recent Updates (November 2025)
**Component Refactoring:**
- `TablePanel.tsx` → `QualityTablePanel.tsx` - Renamed for clarity of purpose
- `DecoderSimilarityOverlay.tsx` → `FeatureSplitOverlay.tsx` - Better describes functionality
- `DecoderSimilarityTable.tsx` → `FeatureSplitTable.tsx` - Aligned with overlay naming
- **New**: `TagCategoryPanel.tsx` - Tag-based feature categorization
- **New**: `ActivationExample.tsx` - Display feature activation examples

## 🔄 Data Flow Through Frontend

### High-Level Component Flow
```mermaid
graph TD
    A[App.tsx] --> B[TagCategoryPanel]
    A --> C[Dual SankeyDiagram]
    A --> D[QualityTablePanel]
    C --> E[SankeyOverlay]
    C --> F[ThresholdHandles]
    C --> G[HistogramPopover]
    C --> H[AlluvialDiagram]
    C --> I[FeatureSplitOverlay]
    D --> J[HighlightedExplanation]
    D --> K[QualityScoreBreakdown]
    D --> L[FeatureSplitTable]
```

### Detailed Data Flow Architecture
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER INTERACTION                                  │
│  Click Node → Select Metric → Adjust Thresholds → View Results             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ZUSTAND STORE ACTION                               │
│  addStageToNode() → Check Cache → Fetch Groups → Build Tree                │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TREE BUILDING ALGORITHM                             │
│                                                                             │
│  1. Get parent node from Map<nodeId, SankeyTreeNode>                       │
│  2. For each feature group from backend:                                   │
│     - Compute: childFeatures = parent.featureIds ∩ group.feature_ids      │
│     - If childFeatures.size > 0: Create child node                         │
│  3. Store child nodes in tree Map                                         │
│  4. Recompute Sankey structure for D3                                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                         D3.JS VISUALIZATION                                 │
│  Transform tree to nodes/links → Calculate positions → Render SVG          │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 🏗️ Core Architecture Components

### 1. Tree-Based Sankey Building System

#### The Innovation
Instead of backend computing the entire tree, frontend builds it dynamically:

```typescript
// Traditional: Backend sends complete tree
{
  nodes: [{id, depth, parent, children, features}],
  links: [{source, target, value}]
}

// Our Approach: Backend sends simple groups, frontend builds tree
Backend: {groups: [{feature_ids, range_label}]}
Frontend: Tree Building with Set Intersection
```

#### Implementation Details

**Data Structures**:
```typescript
// Tree node structure (store/types.ts)
interface SankeyTreeNode {
  id: string                    // Unique identifier (e.g., "root", "stage0_group1")
  parentId: string | null       // Parent node reference
  metric: string | null         // Metric used for splitting
  thresholds: number[]          // Threshold values for this stage
  depth: number                 // Tree depth level
  children: string[]            // Child node IDs
  featureIds: Set<number>       // Feature IDs at this node
  featureCount: number          // Size of featureIds
  rangeLabel: string           // Display label (e.g., "< 0.30")
}

// Global feature group cache
featureGroupCache: Record<string, FeatureGroup[]>
// Key format: "metric:threshold1,threshold2,..."
// Example: "semdist_mean:0.3,0.7"
```

**Tree Building Algorithm** (store/sankey-actions.ts):
```typescript
async function addUnsplitStageToNode(nodeId: string, metric: string) {
  // 1. Generate cache key
  const cacheKey = `${metric}:${thresholds.join(',')}`

  // 2. Check cache or fetch
  let groups = featureGroupCache[cacheKey]
  if (!groups) {
    groups = await api.getFeatureGroups(filters, metric, thresholds)
    featureGroupCache[cacheKey] = groups
  }

  // 3. Build child nodes
  const parent = sankeyTree.get(nodeId)
  for (const group of groups) {
    // Set intersection: O(min(|A|,|B|))
    const childFeatures = intersection(parent.featureIds, group.feature_ids)

    if (childFeatures.size > 0) {
      const childNode: SankeyTreeNode = {
        id: `${nodeId}_${metric}_group${group.group_index}`,
        parentId: nodeId,
        featureIds: childFeatures,
        featureCount: childFeatures.size,
        metric,
        thresholds,
        rangeLabel: group.range_label,
        depth: parent.depth + 1,
        children: []
      }

      // Add to tree
      sankeyTree.set(childNode.id, childNode)
      parent.children.push(childNode.id)
    }
  }

  // 4. Recompute D3 structure
  recomputeSankeyTree()
}
```

**Performance Benefits**:
- **Cache Hit**: Instant tree rebuild (no backend call)
- **Cache Miss**: ~50ms for new feature groups
- **Set Intersection**: O(min(|A|,|B|)) complexity
- **Threshold Changes**: Local recomputation only

### 2. Zustand State Management

#### Store Architecture (Modularized)
```
store/
├── index.ts           # Main store composition
├── sankey-actions.ts  # Sankey tree operations
├── table-actions.ts   # Table data operations
└── utils.ts          # Helper functions
```

#### Key State Structure
```typescript
interface AppState {
  // Dual-panel architecture
  leftPanel: PanelState
  rightPanel: PanelState

  // Global state
  featureGroupCache: Record<string, FeatureGroup[]>
  currentMetric: MetricType
  showComparisonView: boolean

  // Visualization data
  alluvialFlows: AlluvialFlow[] | null
  tableData: FeatureTableDataResponse | null

  // Actions (from sankey-actions.ts)
  addUnsplitStageToNode: (nodeId, metric, panel?) => Promise<void>
  updateNodeThresholds: (nodeId, thresholds, panel?) => Promise<void>
  removeNodeStage: (nodeId, panel?) => void
  recomputeSankeyTree: (panel?) => void

  // Actions (from table-actions.ts)
  fetchTableData: () => Promise<void>
  setTableSort: (sortBy, direction) => void
  swapMetricDisplay: (metric) => void
}
```

### 3. Component Architecture

#### Major Components & Their Roles

**App.tsx** - Main Orchestrator
- Health check on startup
- View state management (empty → filtering → visualization)
- Error boundary integration
- Layout orchestration

**SankeyDiagram.tsx** - Tree Visualization
- D3-Sankey integration
- Inline histogram rendering
- Node click handling → SankeyOverlay
- Threshold handle integration

**SankeyOverlay.tsx** - Stage Addition UI
- Metric selection interface
- Threshold input/preset selection
- Calls `addUnsplitStageToNode()`

**AlluvialDiagram.tsx** - Cross-Panel Flows
- Visualizes feature flow between panels
- Calculates consistency between trees
- Overlay on comparison view

**QualityTablePanel.tsx** - Feature Scoring Table
- 824 rows of feature scores
- 5 consistency visualization modes
- Cell group selection
- Explanation highlighting

**FeatureSplitOverlay.tsx** - Feature Split Analysis
- Interactive overlay for analyzing feature splits
- Metric-based feature grouping interface
- Threshold configuration for splits

**FeatureSplitTable.tsx** - Feature Split Data Display
- Tabular view of feature split analysis
- Detailed breakdown of feature groups
- Interactive cell selection

**TagCategoryPanel.tsx** - Tag Category Management
- Tag-based feature categorization
- Category selection and filtering
- Stage category activation

**HistogramPopover.tsx** - Threshold Visualization
- Portal-based rendering
- Multi-histogram support
- Drag functionality
- Real-time updates

## 📊 Key Implementation Patterns

### React-D3 Integration Pattern
```typescript
// Proper separation of concerns
function SankeyDiagram() {
  const svgRef = useRef<SVGSVGElement>(null)
  const [dimensions, setDimensions] = useState({width: 0, height: 0})

  // Use ResizeObserver for responsive sizing
  useResizeObserver(containerRef, ({width, height}) => {
    setDimensions({width, height})
  })

  // D3 calculations in useMemo
  const {nodes, links} = useMemo(() => {
    if (!sankeyData) return {nodes: [], links: []}
    return calculateSankeyLayout(sankeyData, dimensions.width, dimensions.height)
  }, [sankeyData, dimensions])

  // React renders using D3-calculated positions
  return (
    <svg ref={svgRef}>
      {nodes.map(node => (
        <g key={node.id} transform={`translate(${node.x0},${node.y0})`}>
          {/* Node rendering */}
        </g>
      ))}
    </svg>
  )
}
```

### API Integration Pattern
```typescript
// api.ts - Centralized API client
const apiClient = axios.create({
  baseURL: 'http://localhost:8003',
  timeout: 10000,
  headers: {'Content-Type': 'application/json'}
})

// Type-safe API functions
export async function getFeatureGroups(
  filters: Filters,
  metric: string,
  thresholds: number[]
): Promise<FeatureGroup[]> {
  const response = await apiClient.post<FeatureGroupResponse>(
    '/api/feature-groups',
    {filters, metric, thresholds}
  )
  return response.data.groups
}
```

### Performance Optimization Patterns
```typescript
// Memoization for expensive calculations
const processedData = useMemo(() =>
  computeExpensiveData(rawData),
  [rawData]
)

// Debouncing for user interactions
const debouncedUpdate = useMemo(
  () => debounce(updateThresholds, 300),
  [updateThresholds]
)

// React.memo for expensive components
export const ExpensiveViz = React.memo(({data}) => {
  // Component implementation
}, (prevProps, nextProps) => {
  // Custom comparison
  return prevProps.data.id === nextProps.data.id
})
```

## 🛠️ Technology Stack Details

### Core Libraries
- **React 19.1.1**: Latest React with concurrent features
- **TypeScript 5.8.3**: Full type safety
- **Vite 7.1.6**: Lightning-fast dev server
- **Zustand 5.0.8**: Lightweight state management
- **Axios 1.12.2**: HTTP client with interceptors

### D3.js Ecosystem
- **d3-sankey 0.12.3**: Sankey layout algorithms
- **d3-scale 4.0.2**: Data scaling functions
- **d3-array 3.2.4**: Array manipulation utilities
- **d3-selection 3.0.0**: DOM manipulation
- **d3-transition 3.0.1**: Smooth animations
- **d3-interpolate 3.0.1**: Value interpolation
- **d3-polygon 3.0.1**: Convex hulls for UMAP
- **d3-zoom 3.0.0**: Pan and zoom interactions

## 📁 Frontend Project Structure

```
frontend/src/
├── components/                    # React Components
│   ├── SankeyDiagram.tsx         # Main Sankey visualization
│   ├── SankeyOverlay.tsx         # Stage addition interface
│   ├── AlluvialDiagram.tsx       # Cross-panel flows
│   ├── HistogramPopover.tsx      # Threshold histograms
│   ├── ThresholdHandles.tsx      # Interactive handles
│   ├── FlowPanel.tsx             # Flow container
│   ├── QualityTablePanel.tsx     # Feature scoring table
│   ├── FeatureSplitOverlay.tsx   # Feature split analysis overlay
│   ├── FeatureSplitTable.tsx     # Feature split data display
│   ├── TagCategoryPanel.tsx      # Tag category management
│   ├── ActivationExample.tsx     # Activation examples
│   ├── HighlightedExplanation.tsx # Syntax highlighting
│   └── QualityScoreBreakdown.tsx # Score details
├── lib/                          # Utilities
│   ├── constants.ts              # App constants
│   ├── d3-sankey-utils.ts        # Sankey calculations
│   ├── d3-sankey-histogram-utils.ts # Inline histograms
│   ├── d3-alluvial-utils.ts      # Alluvial flows
│   ├── d3-histogram-utils.ts     # Histogram calculations
│   ├── d3-table-utils.ts         # Table layout
│   ├── d3-flow-utils.ts          # Flow utilities
│   ├── threshold-utils.ts        # Tree building logic
│   └── utils.ts                  # General helpers
├── store/                        # State Management
│   ├── index.ts                  # Main store
│   ├── sankey-actions.ts         # Tree operations
│   ├── table-actions.ts          # Table operations
│   └── utils.ts                  # Store helpers
├── styles/                       # CSS Files
│   ├── base.css                  # Global styles
│   ├── App.css                   # App styles
│   └── [component].css           # Component styles
├── types.ts                      # TypeScript definitions
├── api.ts                        # API client
├── App.tsx                       # Main component
└── main.tsx                      # Entry point
```

## 🚀 Development Workflow

### Starting Development
```bash
cd frontend

# Install dependencies
npm install

# Start dev server (default port 3000)
npm run dev

# Start on specific port (currently 3003)
npm run dev -- --port 3003
```

### Build & Deploy
```bash
# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

### Development Features
- **Hot Module Replacement**: Instant updates without full reload
- **TypeScript Checking**: Real-time type validation
- **Error Overlay**: Clear error messages in browser
- **Source Maps**: Debug original source in DevTools
- **React DevTools**: Component tree inspection
- **Zustand DevTools**: State debugging support

## 📊 Implementation Status Details

### Phase Completion Summary
| Phase | Feature | Status | Key Components |
|-------|---------|--------|----------------|
| 1 | Dual Sankey | ✅ Complete | SankeyDiagram, TagCategoryPanel |
| 2 | Tree Building | ✅ Complete | sankey-actions, threshold-utils |
| 3 | Performance | ✅ Complete | Feature group cache, set intersection |
| 4 | Threshold Groups | ✅ Complete | HistogramPopover, ThresholdHandles |
| 5 | LLM Comparison | ✅ Complete | FeatureSplitOverlay, FeatureSplitTable |
| 6 | UMAP | ✅ Complete | Alluvial flows |
| 7 | Quality Table | ✅ Complete | QualityTablePanel, cell selection |
| 8 | Consistency | ✅ Complete | 8 metrics integrated |

### Current Active Features
- **Tree-Based Sankey**: Dynamic tree building with instant updates
- **Inline Histograms**: Embedded directly on Sankey nodes
- **Comparison Overlay**: Toggle between single/comparison view
- **Cell Group Selection**: Drag-to-select in QualityTablePanel
- **Feature Split Analysis**: Interactive overlays and tables for feature grouping
- **Tag Category Management**: Filter and categorize features by tags
- **Explanation Highlighting**: Semantic alignment-based coloring
- **Quality Score Breakdown**: Detailed metric contributions
- **Activation Examples**: Display feature activation examples

## 🎯 Performance Characteristics

### Optimization Metrics
- **Initial Load**: < 1 second
- **Tree Building**: ~50ms (new), instant (cached)
- **Threshold Update**: Instant (no backend call)
- **Sankey Render**: < 100ms for 1,648 features
- **Table Render**: < 200ms for 824 rows
- **Memory Usage**: ~50MB baseline

### Key Optimizations
1. **Feature Group Caching**: Eliminates redundant API calls
2. **Set Intersection**: O(min(|A|,|B|)) complexity
3. **React.memo**: Prevents unnecessary re-renders
4. **useMemo**: Caches expensive calculations
5. **Lazy Loading**: Components loaded on demand
6. **Debouncing**: 300ms for smooth interactions

## 🔧 Frontend-Specific Guidelines

### Code Standards
```typescript
// Always use TypeScript interfaces
interface ComponentProps {
  data: SankeyData
  onNodeClick: (nodeId: string) => void
}

// Prefer functional components with hooks
function MyComponent({data, onNodeClick}: ComponentProps) {
  // Implementation
}

// Use proper error handling
try {
  const result = await api.fetchData()
  // Handle success
} catch (error) {
  console.error('Failed to fetch:', error)
  // Show user-friendly error
}
```

### State Management Rules
1. **Never mutate state directly** - Use Zustand actions
2. **Keep derived state in useMemo** - Don't store in Zustand
3. **Use proper typing** - All state must be typed
4. **Action naming** - Use verb prefixes (set, update, fetch, etc.)

### Component Guidelines
1. **Single Responsibility** - One component, one purpose
2. **Props Interface** - Always define TypeScript interface
3. **Error Boundaries** - Wrap risky components
4. **Accessibility** - Include ARIA labels
5. **Responsive Design** - Use ResizeObserver

## 🐛 Common Issues & Solutions

### Issue: Sankey not updating after threshold change
**Solution**: Ensure `recomputeSankeyTree()` is called after tree modification

### Issue: API calls failing with CORS
**Solution**: Backend must include frontend port in CORS origins

### Issue: Performance degradation with large datasets
**Solution**: Implement virtualization for long lists, use React.memo (especially for QualityTablePanel with 824 rows)

### Issue: State updates not reflected
**Solution**: Check Zustand action is properly updating state

### Issue: Feature split overlays not displaying correctly
**Solution**: Ensure FeatureSplitOverlay and FeatureSplitTable components are properly receiving data from the store

## 📈 Future Enhancements

### Planned Features
- Export visualization as SVG/PNG
- Undo/redo for tree operations
- Keyboard shortcuts for common actions
- Advanced filtering UI with query builder
- Real-time collaboration support

### Performance Improvements
- Virtual scrolling for QualityTablePanel (824 rows)
- Web Workers for heavy calculations
- Progressive rendering for large trees
- IndexedDB for client-side persistence
- Optimized feature split calculations for large datasets

## 🎓 Key Takeaways

The frontend implements a **smart client architecture** where:
1. **Backend provides simple data** (feature groups)
2. **Frontend builds complex structures** (Sankey tree)
3. **Caching enables instant updates** (no backend calls for cached data)
4. **Set intersection ensures correctness** (proper feature filtering)
5. **Modular state management** (clean separation of concerns)

This architecture provides:
- ⚡ **Instant threshold updates** without backend calls
- 🎯 **Precise feature tracking** through set operations
- 📊 **Rich visualizations** with D3.js integration
- 🔄 **Real-time interactivity** for research exploration
- 🏆 **Conference-ready reliability** with error handling

---

**Remember**: This frontend is optimized for research demonstrations. The tree-building architecture prioritizes instant interactivity and exploration flexibility over traditional server-side processing.