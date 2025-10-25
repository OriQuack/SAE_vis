# Frontend CLAUDE.md

This file provides comprehensive guidance to Claude Code when working with the React frontend for the SAE Feature Visualization project.

## Current Status: ✅ ADVANCED MULTI-VISUALIZATION RESEARCH PROTOTYPE

**Core Features Complete**: ✅ Dual Sankey with Comparison Overlay, Alluvial, TablePanel with Explanations, Inline Histograms
**Development Server**: http://localhost:3003 (active with hot reload)
**Technology**: React 19.1.1, TypeScript 5.8.3, Modularized Zustand, D3.js
**Architecture**: Modularized store with tree-based Sankey, inline histograms, and explanation highlighting
**Status**: Conference-ready with real-time threshold updates and semantic text highlighting

## Technology Stack & Architecture

### Core Technologies
- **React 19.1.1**: Latest React with modern component patterns and concurrent features
- **TypeScript 5.8.3**: Full type safety throughout the application
- **Vite 7.1.6**: Lightning-fast development server with hot module replacement
- **D3.js Ecosystem**: Complete visualization suite
  - d3-sankey 0.12.3: Sankey diagram layout calculations
  - d3-scale 4.0.2: Data scaling and transformations
  - d3-array 3.2.4: Data manipulation utilities
  - d3-selection 3.0.0: DOM selection and manipulation
  - d3-transition 3.0.1: Smooth animations and transitions
  - d3-interpolate 3.0.1: Value interpolation for animations
  - d3-polygon 3.0.1: Convex hull calculations for cluster visualization
  - d3-zoom 3.0.0: Interactive zoom and pan functionality
- **Zustand 5.0.8**: Lightweight state management with DevTools integration
- **Axios 1.12.2**: HTTP client with interceptors and comprehensive error handling

### Application Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     React Application Layer                     │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │   Components    │ │   Zustand       │ │   API Client    │   │
│  │   (Functional)  │ │   Store         │ │   (Axios)       │   │
│  │   + Hooks       │ │   + DevTools    │ │   + Interceptors│   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                 ↕ D3.js Integration
┌─────────────────────────────────────────────────────────────────┐
│                     D3.js Visualization Layer                   │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │   Sankey +      │ │   Histogram +   │ │   LLM Compare + │   │
│  │   Alluvial      │ │   Calculations  │ │   Interactive   │   │
│  │   Calculations  │ │   + Statistics  │ │   Popovers      │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                 ↕ Event Handling & State Updates
┌─────────────────────────────────────────────────────────────────┐
│                     UI Interaction Layer                        │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │   Click         │ │   Hover         │ │   Drag & Drop   │   │
│  │   Handlers      │ │   Effects       │ │   Interactions  │   │
│  │   + Navigation  │ │   + Tooltips    │ │   + Positioning │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Current Project Structure (Actual Implementation)

```
frontend/
├── src/
│   ├── components/              # React Components (Production-Ready)
│   │   ├── SankeyDiagram.tsx    # Advanced D3 Sankey visualization with inline histograms
│   │   ├── SankeyOverlay.tsx    # Sankey node overlay with stage selection interface
│   │   ├── AlluvialDiagram.tsx  # D3 Alluvial flow visualization between dual Sankey panels
│   │   ├── HistogramPopover.tsx # Portal-based histogram popover with drag functionality
│   │   ├── ThresholdHandles.tsx # Interactive threshold handles for inline histogram manipulation
│   │   ├── FlowPanel.tsx        # Flow visualization panel for metrics display
│   │   ├── TablePanel.tsx       # Feature-level scoring table with explanation highlighting
│   │   ├── HighlightedExplanation.tsx # Syntax-highlighted explanation text display
│   │   └── QualityScoreBreakdown.tsx # Quality score breakdown visualization
│   ├── lib/                     # Utility Libraries
│   │   ├── constants.ts         # Centralized constant definitions
│   │   ├── d3-sankey-utils.ts  # D3 Sankey calculations
│   │   ├── d3-sankey-histogram-utils.ts # Inline histogram calculations for Sankey nodes
│   │   ├── d3-alluvial-utils.ts # D3 Alluvial calculations
│   │   ├── d3-histogram-utils.ts # D3 Histogram calculations with grid lines
│   │   ├── d3-table-utils.ts    # Table layout and consistency calculations
│   │   ├── d3-flow-utils.ts    # Flow visualization utilities
│   │   ├── threshold-utils.ts   # Tree-based Sankey computation with set intersection
│   │   └── utils.ts            # General utility functions (includes useResizeObserver hook)
│   ├── styles/                  # Styling
│   │   ├── base.css            # Global base styles
│   │   ├── App.css             # Application-level styles
│   │   ├── SankeyDiagram.css   # Sankey diagram styles
│   │   ├── AlluvialDiagram.css # Alluvial flow styles
│   │   ├── HistogramPopover.css # Histogram popover styles
│   │   ├── FlowPanel.css       # Flow panel styles
│   │   ├── TablePanel.css      # Table panel styles
│   │   └── ProgressBar.css     # Progress bar styles
│   ├── store/                  # Modularized Zustand State Management
│   │   ├── index.ts            # Main store with state composition
│   │   ├── sankey-actions.ts   # Sankey tree management actions
│   │   ├── table-actions.ts    # Table data and sorting actions
│   │   └── utils.ts            # Store utility functions
│   ├── types.ts                # Comprehensive TypeScript type definitions
│   ├── api.ts                  # HTTP client and API integration layer
│   ├── App.tsx                 # Main application component with routing and error boundaries
│   ├── main.tsx                # Application entry point with React 19 setup
│   └── vite-env.d.ts          # Vite environment type declarations
├── public/                     # Static Assets
├── package.json               # Dependencies and build scripts
├── tsconfig.json              # TypeScript configuration
├── tsconfig.node.json         # Node-specific TypeScript config
├── vite.config.ts             # Vite build configuration
└── index.html                 # HTML template
```

## Implementation Details

### ✅ Advanced State Management

The frontend uses a **modularized dual-panel Zustand store** with comprehensive state management:

```typescript
// Main store (store/index.ts)
interface AppState {
  // Dual-panel architecture
  leftPanel: PanelState
  rightPanel: PanelState

  // Shared state
  filterOptions: FilterOptions | null
  currentMetric: MetricType
  popoverState: PopoverState
  loading: LoadingStates
  errors: ErrorStates

  // Comparison view state
  showComparisonView: boolean
  toggleComparisonView: () => void

  // Alluvial flows data
  alluvialFlows: AlluvialFlow[] | null

  // Table data
  tableData: any | null
  tableScrollState: { scrollTop: number; scrollHeight: number; clientHeight: number } | null
  tableSortBy: SortBy | null
  tableSortDirection: SortDirection | null
  scoreColumnDisplay: typeof METRIC_QUALITY_SCORE | typeof METRIC_SCORE_EMBEDDING | typeof METRIC_SCORE_FUZZ | typeof METRIC_SCORE_DETECTION

  // Tree-based threshold system actions (from sankey-actions.ts)
  addUnsplitStageToNode: (nodeId: string, metric: string, panel?: PanelSide) => Promise<void>
  updateNodeThresholds: (nodeId: string, thresholds: number[], panel?: PanelSide) => Promise<void>
  recomputeSankeyTree: (panel?: PanelSide) => void
  removeNodeStage: (nodeId: string, panel?: PanelSide) => void

  // Table actions (from table-actions.ts)
  fetchTableData: () => Promise<void>
  setTableScrollState: (state: { scrollTop: number; scrollHeight: number; clientHeight: number } | null) => void
  setTableSort: (sortBy: SortBy | null, sortDirection: SortDirection | null, skipSankeySync?: boolean) => void
  swapMetricDisplay: (newMetric: typeof METRIC_QUALITY_SCORE | typeof METRIC_SCORE_EMBEDDING | typeof METRIC_SCORE_FUZZ | typeof METRIC_SCORE_DETECTION) => void
}

interface PanelState {
  filters: Filters
  sankeyTree: Map<string, SankeyTreeNode>  // Tree-based Sankey structure
  computedSankey?: TreeBasedSankeyStructure // Computed D3-compatible structure
  histogramData: Record<string, HistogramData> | null
  viewState: ViewState
}

interface SankeyTreeNode {
  id: string                    // e.g., "root", "stage0_group1"
  parentId: string | null
  metric: string | null         // Metric used for this stage
  thresholds: number[]          // Threshold values
  depth: number                 // Tree depth (0 for root)
  children: string[]            // Child node IDs
  featureIds: Set<number>       // Feature IDs at this node
  featureCount: number
  rangeLabel: string            // e.g., "< 0.50", "0.50 - 0.80"
}

interface ThresholdGroup {
  id: string
  name: string
  selections: ThresholdSelection[]
  visible: boolean
  timestamp: number
}
```

**Key Features:**
- **Modularized Store**: Separated into index.ts, sankey-actions.ts, table-actions.ts, and utils.ts
- **Dual-Panel Architecture**: Independent left/right panel state management with `PanelState` interface
- **Tree-Based Sankey Building**: Map-based tree structure with `SankeyTreeNode` containing feature IDs
- **Comparison View Toggle**: Show/hide comparison overlay with Alluvial + Right Sankey
- **Runtime Stage Management**: Store actions for dynamic tree modification from sankey-actions.ts
  - `addUnsplitStageToNode()`: Add new stage to node without splitting
  - `updateNodeThresholds()`: Update thresholds and recompute tree
  - `removeNodeStage()`: Remove stage and collapse subtree
  - `recomputeSankeyTree()`: Convert tree to D3-compatible flat structure
- **Table Management**: Store actions for table data and sorting from table-actions.ts
  - `fetchTableData()`: Load table data with explanations and scores
  - `setTableSort()`: Update sort column and direction
  - `swapMetricDisplay()`: Switch between quality/embedding/fuzz/detection score displays
- **Alluvial Flow Support**: Cross-panel flow visualization with feature ID tracking
- **Panel-Aware Operations**: All store actions support panel-specific targeting (leftPanel/rightPanel)
- **Production-Ready Error Handling**: Comprehensive error boundaries and graceful degradation

### ✅ Advanced Component Architecture

#### App Component (Production-Grade Orchestrator)
- **Health Check System**: Automatic backend connectivity validation on startup
- **Three-State View Management**: Empty → Filtering → Visualization workflow
- **Comprehensive Error Boundaries**: Graceful error handling with user guidance
- **Hot-Reload Development**: Automatic server reconnection and port conflict resolution
- **Responsive Layout**: Adaptive design for different screen sizes

**View States:**
```typescript
type ViewState = 'empty' | 'filtering' | 'visualization'

// empty: Shows add visualization button
// filtering: Shows FilterPanel for configuration
// visualization: Shows complete Sankey diagram with interactions
```

#### FilterPanel Component
- **Dynamic Filter Options**: Real-time loading from backend `/api/filter-options`
- **Multi-select Dropdowns**: Advanced selection interface for multiple filter types
- **Filter Categories**: sae_id, explanation_method, llm_explainer, llm_scorer
- **Validation & Error Handling**: User-friendly error messages for invalid selections
- **State Synchronization**: Automatic store updates with filter changes

#### SankeyDiagram Component (Advanced D3 Integration)
- **D3-Sankey Integration**: Professional Sankey layout calculations with d3-sankey
- **Inline Histograms**: Histograms rendered directly on Sankey nodes
- **Threshold Handles**: Interactive threshold manipulation with ThresholdHandles component
- **Interactive Nodes**: Click handlers for stage addition via SankeyOverlay
- **Advanced Animations**: Smooth transitions with d3-transition
- **Color Coding**: Sophisticated color scheme based on node metrics
- **Hover Effects**: Interactive feedback with tooltips and highlighting
- **Error States**: Comprehensive error handling with user-friendly messages

**Inline Histogram Features:**
```typescript
// Histograms displayed directly on nodes with:
- Node-specific histogram data fetched via threshold path
- Interactive threshold handles for real-time updates
- Automatic layout calculation via d3-sankey-histogram-utils.ts
- Display only for leaf nodes and nodes with outgoing links
```

#### AlluvialDiagram Component (Phase 2 - Advanced Flow Visualization)
- **Cross-Panel Flow Visualization**: Displays alluvial flows between left and right Sankey diagrams
- **D3 Alluvial Calculations**: Advanced flow layout calculations with proper flow positioning
- **Interactive Flow Elements**: Hover effects and flow highlighting for enhanced user experience
- **Dynamic Flow Data**: Real-time flow updates based on panel state changes
- **Consistency Statistics**: Flow consistency analysis and visualization
- **Performance Optimized**: Efficient rendering with React.memo and useMemo optimizations

**Alluvial Flow Calculation Logic:**
```typescript
const layout = useMemo(
  () => calculateAlluvialLayout(
    alluvialFlows,
    width,
    height,
    leftSankeyData?.nodes,
    rightSankeyData?.nodes
  ),
  [alluvialFlows, width, height, leftSankeyData?.nodes, rightSankeyData?.nodes]
)
```

#### HistogramPopover Component (Portal-Based Advanced UI)
- **Portal-Based Rendering**: Proper z-index layering for complex layouts
- **Multi-Histogram Support**: Simultaneous display of multiple metric histograms
- **Advanced Positioning**: Right-side positioning with collision detection
- **Drag & Drop Functionality**: Interactive popover repositioning
- **Threshold Interaction**: Real-time threshold adjustment with visual feedback
- **Performance Optimization**: Efficient D3 calculations with React integration

### 🎯 Advanced D3.js Integration

#### D3 Utility Functions (Modular Architecture)

**d3-sankey-utils.ts**
- **Sankey Layout Calculations**: Complete sankey diagram layout with positioning
- **Node Classification**: Advanced node categorization and color coding
- **Link Positioning**: Proper link calculations for complex flow diagrams

**d3-alluvial-utils.ts (Phase 2)**
- **Alluvial Flow Calculations**: Cross-panel flow layout and positioning
- **Flow Consistency Analysis**: Statistical analysis of flow patterns
- **Interactive Flow Elements**: Hover states and flow highlighting logic

**d3-histogram-utils.ts**
- **Histogram Generation**: Advanced histogram calculations with statistics
- **Threshold Line Calculations**: Visual threshold indicators on histograms
- **Statistical Analysis**: Mean, median, quartile calculations

**threshold-utils.ts**
- **Tree-Based Sankey Computation**: `computeSankeyStructure()` builds Sankey from tree + feature groups
- **Set Intersection**: Efficient `intersection()` function with O(min(|A|, |B|)) complexity
- **Feature Group Processing**: `processFeatureGroupResponse()` handles standard and consistency metrics
- **Tree Conversion**: Converts Map-based tree to D3-compatible flat nodes/links structure
- **Node ID Generation**: `buildNodeId()` creates hierarchical node identifiers
- **Threshold Path Utilities**: `getNodeThresholdPath()` extracts constraint path for histogram filtering

**d3-sankey-histogram-utils.ts**
- **Inline Histogram Layout**: `calculateNodeHistogramLayout()` positions histograms on Sankey nodes
- **Node Display Logic**: `shouldDisplayNodeHistogram()` determines which nodes show histograms
- **Metric Selection**: `getNodeHistogramMetric()` selects appropriate metric for node
- **Link Detection**: `hasOutgoingLinks()` checks if node has outgoing connections
- **Threshold Extraction**: `getNodeThresholds()` retrieves threshold values from node tree

#### D3-React Integration Patterns
```typescript
// Proper React-D3 integration
useEffect(() => {
  if (!sankeyData) return

  // D3 calculations
  const { nodes, links } = calculateSankeyLayout(sankeyData, width, height)

  // React rendering with calculated positions
  setProcessedData({ nodes, links })
}, [sankeyData, width, height])
```

### 📊 API Integration Architecture

#### HTTP Client (api.ts)
- **Axios Configuration**: Advanced interceptors for request/response handling
- **Environment-Aware URLs**: Automatic backend URL detection and configuration
- **Structured Error Handling**: Comprehensive error parsing and user-friendly messages
- **Request/Response Types**: Full TypeScript integration with backend API schema
- **Health Check System**: Automatic connectivity validation

**API Endpoints Integration:**
```typescript
// Core API functions ✅
export const getFilterOptions = (): Promise<FilterOptions>
export const getFeatureGroups = (filters: Filters, metric: string, thresholds: number[]): Promise<FeatureGroupResponse>
export const getHistogramData = (request: HistogramDataRequest): Promise<HistogramData>
export const getComparisonData = (request: ComparisonDataRequest): Promise<ComparisonData>
export const getTableData = (request: TableDataRequest): Promise<FeatureTableDataResponse>
export const healthCheck = (): Promise<boolean>

// AlignmentService integration
- Table data includes highlighted_explanation field with semantic alignment
- Explanation text highlighting based on cross-explainer semantic matches
- Color-coded highlighting based on similarity scores
```

#### Backend Integration Features
- **Default Backend URL**: http://localhost:8003 (configurable via environment)
- **CORS Handling**: Proper cross-origin request configuration
- **Error Code Mapping**: Backend error codes mapped to user-friendly messages
- **Retry Logic**: Automatic retry for transient network errors
- **Performance Monitoring**: Request timing and error rate tracking

### 🚀 Performance Optimizations

#### React Optimizations
- **React.memo**: Expensive visualization components memoized
- **useMemo/useCallback**: D3 calculations and event handlers optimized
- **Efficient Re-rendering**: Precise dependency arrays for optimal performance
- **Proper Cleanup**: D3 event listeners and timers properly cleaned up

#### D3 Performance
- **Lazy Calculations**: D3 operations only triggered when necessary
- **Efficient Updates**: Minimal DOM manipulation with data binding
- **Animation Optimization**: Smooth 60fps animations with proper timing
- **Memory Management**: Proper cleanup of D3 selections and scales

#### API Performance
- **Debounced Interactions**: 300ms debounce for threshold slider interactions
- **Batch Requests**: Multiple histogram data requests batched together
- **Intelligent Caching**: Avoid redundant API calls with state caching
- **Progressive Loading**: Load critical data first, then enhance with additional data

### 🔧 Development Features

#### TypeScript Integration
- **Comprehensive Type Safety**: All components, hooks, and API calls fully typed
- **Type Definitions**: Complete type definitions in types.ts covering all data structures
- **IDE Support**: Excellent autocomplete and error detection
- **Type Guards**: Runtime type validation for API responses

#### Error Handling
- **Error Boundaries**: React error boundaries for graceful component failure handling
- **API Error Mapping**: Backend error codes mapped to user-friendly messages
- **Fallback UI**: Comprehensive fallback interfaces for error states
- **Debug Information**: Detailed error information for development

#### Development Experience
- **Hot Module Replacement**: Instant updates during development
- **Comprehensive Logging**: Detailed console logging for debugging
- **DevTools Integration**: Zustand DevTools for state debugging
- **Port Conflict Resolution**: Automatic fallback ports for development

## Development Commands

### Quick Start
```bash
cd frontend

# Install dependencies
npm install

# Start development server (default: http://localhost:3000)
npm run dev

# Start on specific port (currently active: 3003)
npm run dev -- --port 3003

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

### Current Development Status (🟢 ACTIVE)

**Development Server**: http://localhost:3003 (development server active)
- ✅ Hot reload with React Fast Refresh
- ✅ TypeScript compilation with error reporting
- ✅ Vite development server with optimized bundling
- ✅ Backend API integration with automatic health checking (port 8003)
- ✅ Modularized Zustand store with sankey-actions and table-actions
- ✅ Inline histogram visualization with threshold handles
- ✅ Explanation text highlighting with semantic alignment

**Performance Metrics**:
- **Bundle Size**: Optimized with code splitting and tree shaking
- **Load Time**: Sub-second initial load with progressive enhancement
- **Interaction Response**: Real-time threshold updates with smooth D3 animations
- **Memory Usage**: Efficient with proper cleanup and garbage collection via modularized store
- **Dataset Support**: 1,000 unique features with multiple LLM explainers and scorers
- **API Performance**: Sub-second response times for all visualization endpoints

## Backend Integration

### API Endpoints (All Functional) ✅
| Endpoint | Frontend Component |
|----------|-------------------|
| `GET /api/filter-options` | FilterPanel |
| `POST /api/histogram-data` | HistogramPopover |
| `POST /api/sankey-data` | SankeyDiagram |
| `POST /api/comparison-data` | AlluvialDiagram |
| `POST /api/llm-comparison` | LLMComparisonSelection |
| `POST /api/threshold-features` | HistogramPanel |
| `POST /api/umap-data` | UMAPPanel |
| `POST /api/table-data` | TablePanel (Phase 7) |
| `GET /api/feature/{id}` | Future debug view |
| `GET /health` | App startup health check |

### Error Handling Integration
- **INVALID_FILTERS**: User-friendly filter validation messages
- **INSUFFICIENT_DATA**: Helpful guidance for filter adjustment
- **INTERNAL_ERROR**: Generic error with retry functionality
- **SERVICE_UNAVAILABLE**: Backend connection status with retry

### Real-time Data Flow
```
User Interaction → State Update → API Request → Data Processing → UI Update
```

## Advanced Features

### 🎨 Interactive Visualizations
- **Dual Sankey Diagrams**: Left panel + comparison overlay with right panel
- **Inline Histograms**: Histograms rendered directly on Sankey nodes
- **Threshold Handles**: Interactive threshold manipulation on inline histograms
- **Stage Selection Overlay**: SankeyOverlay component for adding new stages
- **Alluvial Flow Diagrams**: Cross-panel feature tracking between dual Sankey panels
- **TablePanel with Explanations**: Feature-level scoring table with syntax-highlighted explanations
- **Quality Score Breakdown**: Component showing quality score metric contributions
- **Smooth Animations**: D3-powered transitions with proper timing
- **Hover Effects**: Rich tooltips with detailed information
- **Color-Coded Categories**: Intuitive visual categorization based on metrics

### 🔄 State Management
- **Modularized Store**: Separated into index.ts, sankey-actions.ts, table-actions.ts, and utils.ts
- **Dual-Panel State**: Independent left/right panel state with `PanelState` interface
- **Comparison View Toggle**: Show/hide comparison overlay with Alluvial + Right Sankey
- **Dynamic Tree Actions**: Store actions for runtime stage creation/removal via sankey-actions.ts
- **Alluvial Flow Updates**: Automatic flow calculation after Sankey data changes
- **Table Management Actions**: Table data fetching, sorting, and metric display via table-actions.ts
- **Production Error Handling**: Comprehensive error boundaries and recovery

### 📱 User Experience
- **Responsive Design**: Adaptive layout for different screen sizes
- **Accessibility**: Proper ARIA labels and keyboard navigation
- **Error Recovery**: User-friendly error states with clear recovery paths
- **Performance Feedback**: Loading indicators and progress feedback
- **Intuitive Navigation**: Clear workflow from filtering to visualization

## Implementation Status

### ✅ Phase 1: Dual-Panel Sankey Visualization (COMPLETE)
- ✅ **Dual-Panel Architecture**: Independent left/right panel state management
- ✅ **Sankey Diagrams**: D3-based visualization with interactive nodes
- ✅ **Filter System**: Multi-select filters with backend integration
- ✅ **Histogram Popovers**: Interactive threshold visualization

### ✅ Phase 2: Tree-Based Sankey Building (COMPLETE)
- ✅ **Tree-Based Architecture**: Map-based tree structure with `SankeyTreeNode`
- ✅ **Feature Group Caching**: Global cache by metric+thresholds for instant updates
- ✅ **Set Intersection Algorithm**: Efficient child node computation
- ✅ **Runtime Stage Creation**: `addStageToNode()` fetches groups and computes intersections
- ✅ **Runtime Stage Removal**: `removeStageFromNode()` for tree simplification
- ✅ **Alluvial Flows**: Cross-panel feature tracking and flow visualization

### ✅ Phase 3: Performance Optimization (COMPLETE)
- ✅ **Feature Group Caching**: Global cache prevents redundant API calls for same metric+thresholds
- ✅ **Set Intersection**: O(min(|A|, |B|)) algorithm for efficient child node computation
- ✅ **Instant Updates**: Threshold changes trigger local tree rebuild without backend roundtrip
- ✅ **Stateless Backend**: Simple grouping API enables horizontal scaling
- ✅ **Cache Invalidation**: Filter changes clear cache for fresh data
- ✅ **Performance Validation**: Instant Sankey updates, ~50ms for new groups

### ✅ Phase 4: Threshold Group Management (COMPLETE - January 2025)
- ✅ **HistogramPanel Component**: Multi-histogram visualization with selection mode
- ✅ **ThresholdGroupPanel Component**: Group management UI with + button interface
- ✅ **Named Threshold Groups**: User-defined groups with custom names
- ✅ **Visual Indicators**: Color-coded visibility status (gray/green)
- ✅ **Exact Threshold Display**: Rotated labels showing precise threshold values
- ✅ **Histogram Selection**: Drag-to-select with exact mouse position calculation
- ✅ **Selection Mode**: Dimmed bars with highlighted selections
- ✅ **Group Visibility Toggle**: Click to show/hide threshold visualizations on histogram
- ✅ **Merged Score Histograms**: Common 0-1 x-axis for embedding, fuzz, detection scores
- ✅ **Professional Styling**: Gray dotted threshold lines, black labels, color-coded areas

### ✅ Phase 5: LLM Comparison Visualization (COMPLETE - January 2025)

**Purpose**: Visualize consistency between different LLM explainers and scorers using triangle-based layout with color-coded consistency scores

**Components:**
- ✅ **LLMComparisonSelection Component**: Interactive triangle visualization with hover/click
- ✅ **LLMComparisonVisualization Component**: Static display variant (currently commented out)

**Visualization Architecture:**
- ✅ **Triangle Layout System**: 4 triangles (1 left explainer + 3 right scorers), 6 cells each (3 diamonds + 3 triangles)
- ✅ **Fixed ViewBox Architecture**: Absolute positioning (800x350) following FlowPanel pattern
- ✅ **Consistency Color Gradient**: Green→yellow→red (d3-scale) for scores 0-1
- ✅ **Diamond Cell Coloring**: Consistency scores visualized on diamond cells
- ✅ **Triangle Cell Labels**: Model names (Llama, Qwen, OpenAI/GPT) centered on triangle cells
- ✅ **Gradient Legend Bar**: Visual reference showing consistency scale (0 Low to 1 High)

**Technical Implementation:**
- ✅ **d3-llm-comparison-utils.ts**: Layout calculation and color utility functions
- ✅ **Type Definitions**: LLMComparisonData, LLMExplainerModel, LLMScorerModel, ConsistencyScore
- ✅ **API Integration**: getLLMComparisonData() with backend endpoint IMPLEMENTED
- ✅ **Backend Endpoint**: POST /api/llm-comparison serves consistency scores from pre-calculated JSON
- ✅ **Data Source**: `/data/llm_comparison/llm_comparison_stats.json`
- ✅ **Statistics Methods**:
  - Explainer consistency: Cosine similarity between explanation embeddings
  - Scorer consistency: RV coefficient between scoring vectors
- ✅ **Interactive Features**: Full hover/selection/click interaction logic with model filtering
- ✅ **FlowPanel Updates**: ViewBox adjusted to 0 0 600 175 with 0.1rem top margin

**Current Limitations:**
- Uses pre-calculated global statistics (not filtered by user's current selection)
- Future enhancement: Real-time correlation calculation based on active filters

### ✅ Phase 6: UMAP Visualization (COMPLETE - October 2025)
- ✅ **Dual-Panel UMAP**: Feature and explanation projections with zoom/pan
- ✅ **Hierarchical Clustering**: Multi-level clusters with zoom-based level switching
- ✅ **Convex Hull Overlays**: Cluster boundaries with d3-polygon
- ✅ **Cross-Panel Linking**: Feature-explanation cluster highlighting
- ✅ **Backend**: POST /api/umap-data with pre-calculated projections

### ✅ Phase 7: TablePanel Visualization (COMPLETE - October 2025)

**Purpose**: Feature-level scoring table with consistency analysis and cell group selection

**Components:**
- ✅ **TablePanel Component**: Main table with 824 rows (one per feature)
- ✅ **SavedGroupsPanel Component**: Manage saved cell group selections
- ✅ **VerticalBar Component**: Scroll position indicator for table navigation

**Key Features:**
- ✅ **Feature-Level Scoring**: All features × all explainers × all metrics (embedding, fuzz, detection)
- ✅ **Consistency Types**: 5 modes
  - None: Raw scores without consistency overlay
  - LLM Scorer: Consistency across different scorers for same explainer/metric
  - Within-explanation: Consistency across metrics within same explainer
  - Cross-explanation: Consistency across explainers for same metric
  - LLM Explainer: Consistency across explainers (requires multiple explainers)
- ✅ **Cell Group Selection**: Drag-to-select with union/difference modes
  - Click: Toggle single group
  - Drag: Select multiple groups at once
  - Union mode (blue): Add groups to selection
  - Difference mode (red): Remove groups from selection
- ✅ **Saved Groups**: Persistent group management
  - Name and save cell group selections
  - Color-coded borders for active saved group
  - Update existing saved groups
  - Multiple saved groups with auto-generated colors
- ✅ **Sorting**: Multi-column sorting
  - Sort by consistency type (LLM Scorer, Within-exp, Cross-exp, LLM Explainer)
  - Sort by individual columns (explainer + metric + scorer)
  - Three-state cycle: null → asc → desc → null
- ✅ **Dynamic Headers**: Adapts to data
  - 2-row header: When averaged scores (explainer → metric)
  - 3-row header: When individual scorers (explainer → metric → scorer)
  - Metric-first reordering for cross-explanation consistency
- ✅ **Real-time Coloring**: Green→yellow→red gradient based on consistency scores
- ✅ **Scroll Tracking**: Advanced scroll position tracking for VerticalBar indicator

**Technical Implementation:**
- ✅ **d3-table-utils.ts**: Table layout calculations
  - `buildHeaderStructure()`: Standard explainer-first header
  - `buildMetricFirstHeaderStructure()`: Metric-first header for cross-explanation
  - `calculateColorBarLayout()`: Consistency legend SVG layout
  - `getConsistencyColor()`: Maps consistency score to color gradient
  - `extractRowScores()` / `extractRowScoresMetricFirst()`: Extract scores from response
- ✅ **table-selection-utils.ts**: Cell group selection logic
  - `createCellGroup()`: Create group from feature+explainer
  - `getCellGroup()`: Check if cell belongs to a group
  - `findGroupsInRectangle()`: Find all groups in drag selection
  - `getExplainerForColumnIndex()`: Map column index to explainer
- ✅ **table-sort-utils.ts**: Sorting logic
  - `sortFeatures()`: Sort features by consistency or column value
  - `getConsistencyValueForSorting()`: Extract consistency for sorting
  - `getScoreValue()`: Extract score for sorting
- ✅ **Backend Integration**: POST /api/table-data
  - Filtered by selected LLM explainers and scorers
  - Returns 824 rows with all scores and consistency values
  - Includes global min/max for normalization
- ✅ **Store Integration**: Zustand state management
  - `tableData`: FeatureTableDataResponse
  - `cellSelection`: Groups, start/end positions
  - `savedCellGroupSelections`: Persistent saved groups
  - `tableSortBy` / `tableSortDirection`: Sorting state

**User Interactions:**
- ✅ **Consistency Type Selection**: Click buttons to change consistency overlay
- ✅ **Cell Click**: Toggle single group selection
- ✅ **Cell Drag**: Select multiple groups with visual preview
- ✅ **Column Sort**: Click headers to cycle through sort states
- ✅ **Save Selection**: Name and save current cell group selection
- ✅ **Update Saved Group**: Modify existing saved group without renaming
- ✅ **Scroll Tracking**: Real-time scroll position feedback via VerticalBar

**Performance Features:**
- ✅ **ResizeObserver**: Track table height changes for scroll indicator
- ✅ **MutationObserver**: Detect table element appearance for initial measurement
- ✅ **RequestAnimationFrame**: Debounced scroll measurements
- ✅ **Memoized Calculations**: useMemo for sorted features, color layouts, group calculations

### ✅ Phase 8: Consistency Score Integration (COMPLETE - October 2025)

**Purpose**: Integrate pre-computed consistency scores into Sankey visualization workflow

**Backend Integration:**
- ✅ **consistency_scores.parquet**: Pre-computed consistency data loaded by backend
- ✅ **ConsistencyService**: Backend service with 8 consistency metrics
- ✅ **Data Loading**: Visualization service loads consistency scores alongside feature data
- ✅ **Feature Grouping**: Consistency metrics supported by POST /api/feature-groups

**Consistency Metrics Available:**
1. **LLM Scorer Consistency** (fuzz, detection): Consistency across scorers for same explainer
2. **Within-Explanation Metric Consistency**: Consistency across metrics within explainer
3. **Cross-Explanation Metric Consistency** (embedding, fuzz, detection): Per-metric consistency across explainers
4. **Cross-Explanation Overall Score Consistency**: Overall score consistency across explainers
5. **LLM Explainer Consistency**: Semantic similarity between LLM explanations

**Frontend Integration:**
- ✅ **Consistency Stage Support**: Consistency metrics available for Sankey stage creation via `addStageToNode()`
- ✅ **Type Definitions**: Consistency score types integrated into types.ts
- ✅ **Constants**: Consistency metrics added to metric definitions
- ✅ **Histogram Support**: Consistency metric histograms available for threshold selection
- ✅ **Feature Grouping**: Backend returns consistency-based feature groups for tree building

### 📝 Future Enhancements
- **TablePanel**: Export selected cell groups to CSV/JSON
- **UMAP**: Cross-visualization linking with TablePanel selections
- **Dynamic Consistency**: Real-time consistency calculation for custom filter combinations
- **Debug View**: Individual feature inspection with path visualization
- **Tree Serialization**: Save/load tree configurations for research reproducibility

## Critical Development Notes

1. **Backend Dependency**: Requires backend on port 8003 with POST /api/feature-groups operational
2. **Type Safety**: Full TypeScript integration - maintain type definitions
3. **Performance**: D3 calculations with React.memo, useMemo, useCallback
4. **State Management**: Tree-based Zustand store with feature group caching
5. **Component Architecture**: Separation of concerns (components/lib/api/store)
6. **Architecture**: Simplified feature grouping + frontend intersection for instant updates

## Project Assessment

This React frontend represents a **conference-ready research prototype** with:

**Core Architecture:**
- ✅ **Modern React Architecture** with React 19.1.1 and TypeScript 5.8.3
- ✅ **Zustand State Management** with DevTools integration for debugging
- ✅ **Vite Development Server** with hot module replacement
- ✅ **Full TypeScript Coverage** with comprehensive type definitions

**Visualization Capabilities (All 8 Phases Complete):**
- ✅ **Phase 1 - Dual-Panel Sankey**: Independent left/right panel state management
- ✅ **Phase 2 - Tree-Based Building**: Feature group caching + set intersection
- ✅ **Phase 3 - Performance**: Instant threshold updates with ~50ms for new groups
- ✅ **Phase 4 - Threshold Groups**: Named groups with histogram-based selection
- ✅ **Phase 5 - LLM Comparison**: Triangle-based consistency visualization
- ✅ **Phase 6 - UMAP**: Dual-panel projection with hierarchical clustering
- ✅ **Phase 7 - TablePanel**: Feature-level scoring with cell group selection
- ✅ **Phase 8 - Consistency Integration**: Pre-computed consistency scores

**Advanced Features:**
- ✅ **D3.js Visualization Suite**: Sankey, Alluvial, Histogram, UMAP, Table, and LLM Comparison
- ✅ **Tree-Based Sankey Building**: Set intersection algorithm for instant updates
- ✅ **Feature Group Caching**: Global cache by metric+thresholds
- ✅ **LLM Comparison Visualization**: Consistency scoring with green→yellow→red gradients
- ✅ **Production Error Handling**: Comprehensive error boundaries
- ✅ **Alluvial Flow Tracking**: Feature ID-based cross-panel comparison
- ✅ **Responsive Design**: useResizeObserver hook and fixed viewBox patterns
- ✅ **Developer Experience**: Hot reload and TypeScript tooling

**Dataset Support:**
- ✅ **2,471 rows** covering 1,000 unique features with multiple LLM explainers
- ✅ **3 LLM Explainers**: Llama, Qwen, OpenAI (GPT)
- ✅ **Multiple Scoring Methods**: Fuzz, simulation, detection, embedding

**Key Implementation Features:**
- **Tree-Based Sankey Building**: Frontend builds Sankey structure using feature group intersection
- **Feature Group Caching**: Global cache by metric+thresholds for instant threshold updates
- **Set Intersection Algorithm**: O(min(|A|, |B|)) complexity for efficient child node computation
- **Multiple Visualization Types**: Sankey, Alluvial, UMAP, Table, Histogram, LLM Comparison
- **Dual-Panel State**: Independent tree structures and data for left/right panels
- **Responsive Layout**: useResizeObserver hook ensures all visualizations adapt to container size
- **Conference Ready**: Optimized for live demonstrations with reliable error handling

**Design Philosophy:**
- **Research Prototype**: Built for conference demonstration and research flexibility
- **Simplicity First**: Frontend handles tree building, backend does simple feature grouping
- **Production-Ready Code**: Comprehensive error handling and type safety
- **Maintainable Architecture**: Clear separation of concerns with minimal complexity
- **Instant Updates**: Cached feature groups enable threshold changes without backend calls

The application is ready for **academic conference presentation** with simplified architecture designed for **SAE feature analysis research** demonstrations.