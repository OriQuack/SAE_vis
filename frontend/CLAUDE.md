# Frontend CLAUDE.md

This file provides comprehensive guidance to Claude Code when working with the React frontend for the SAE Feature Visualization project.

## Current Status: ✅ ADVANCED MULTI-VISUALIZATION RESEARCH PROTOTYPE

**Phase 1-7 Complete**: ✅ Sankey, Alluvial, Histogram, LLM Comparison, UMAP, TablePanel
**Phase 8 Active**: 🔨 Consistency Score Integration - Consistency-based Sankey classification stages
**Development Server**: http://localhost:3003 (active with hot reload)
**Technology**: React 19.1.1, TypeScript 5.8.3, Zustand, D3.js
**Status**: Conference-ready with 7 visualization types + consistency analysis

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
│   │   ├── FilterPanel.tsx      # Multi-select filter interface with dynamic options
│   │   ├── SankeyDiagram.tsx    # Advanced D3 Sankey visualization with interactions
│   │   ├── AlluvialDiagram.tsx  # D3 Alluvial flow visualization (Phase 2)
│   │   ├── HistogramPanel.tsx   # Histogram visualization with threshold selection (Phase 4)
│   │   ├── ThresholdGroupPanel.tsx # Threshold group management UI (Phase 4)
│   │   ├── HistogramPopover.tsx # Portal-based histogram popover with drag functionality
│   │   ├── ProgressBar.tsx      # Linear set visualization for feature overlap
│   │   ├── FlowPanel.tsx        # Flow visualization panel
│   │   ├── UMAPPanel.tsx        # Dual UMAP visualization with zoom and clustering (Phase 6)
│   │   ├── LLMComparisonSelection.tsx # Interactive LLM comparison with consistency (Phase 5)
│   │   └── LLMComparisonVisualization.tsx # Static variant (currently commented out)
│   ├── lib/                     # Utility Libraries
│   │   ├── constants.ts         # Centralized constant definitions
│   │   ├── d3-sankey-utils.ts  # D3 Sankey calculations
│   │   ├── d3-alluvial-utils.ts # D3 Alluvial calculations
│   │   ├── d3-histogram-utils.ts # D3 Histogram calculations with grid lines
│   │   ├── d3-llm-comparison-utils.ts # LLM comparison layout and color utilities (Phase 5)
│   │   ├── d3-umap-utils.ts    # UMAP calculations and cluster hulls (Phase 6)
│   │   ├── d3-linear-set-utils.ts # Linear set calculations
│   │   ├── d3-flow-utils.ts    # Flow visualization utilities
│   │   ├── d3-threshold-group-utils.ts # Threshold group utilities
│   │   ├── selection-utils.ts   # Threshold selection and calculation utilities
│   │   ├── threshold-utils.ts   # Threshold tree operations
│   │   ├── threshold-group-converter.ts # Threshold group conversion
│   │   ├── dynamic-tree-builder.ts # Dynamic stage creation/removal
│   │   ├── split-rule-builders.ts # Split rule construction helpers
│   │   └── utils.ts            # General utility functions (includes useResizeObserver hook)
│   ├── styles/                  # Styling
│   │   ├── globals.css         # Global styles
│   │   ├── App.css             # Application-level styles
│   │   ├── HistogramPanel.css  # Histogram styles
│   │   ├── ThresholdGroupPanel.css # Threshold group styles
│   │   ├── UMAPPanel.css       # UMAP styles
│   │   ├── TablePanel.css      # Table panel styles (Phase 7)
│   │   └── ... # Other component styles
│   ├── store.ts                # Consolidated Zustand store with threshold groups (Phase 4)
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

The frontend uses a **dual-panel Zustand store** with comprehensive state management:

```typescript
interface AppState {
  // Dual-panel architecture - Phase 2
  leftPanel: PanelState
  rightPanel: PanelState

  // Shared state
  filterOptions: FilterOptions | null
  currentMetric: MetricType
  popoverState: PopoverState
  loading: LoadingStates & { sankeyLeft?: boolean; sankeyRight?: boolean; histogramPanel?: boolean }
  errors: ErrorStates & { sankeyLeft?: string | null; sankeyRight?: string | null; histogramPanel?: string | null }

  // Histogram panel data (Phase 4)
  histogramPanelData: Record<string, HistogramData> | null

  // Threshold group management (Phase 4)
  thresholdGroups: ThresholdGroup[]
  pendingGroup: ThresholdSelection[]
  isCreatingGroup: boolean
  showGroupNameInput: boolean

  // Alluvial flows data (Phase 2)
  alluvialFlows: AlluvialFlow[] | null

  // Panel-aware API actions
  fetchSankeyData: (panel?: PanelSide) => Promise<void>
  fetchHistogramData: (metric?: MetricType, nodeId?: string, panel?: PanelSide) => Promise<void>
  fetchHistogramPanelData: () => Promise<void>
  updateThreshold: (nodeId: string, thresholds: number[], panel?: PanelSide) => void

  // Threshold group actions (Phase 4)
  startGroupCreation: () => void
  finishGroupCreation: (name: string) => void
  cancelGroupCreation: () => void
  toggleGroupVisibility: (groupId: string) => void
  deleteGroup: (groupId: string) => void
}

interface PanelState {
  filters: Filters
  thresholdTree: ThresholdTree  // Threshold tree system
  sankeyData: SankeyData | null
  histogramData: Record<string, HistogramData> | null
  viewState: ViewState
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
- **Dual-Panel Architecture**: Independent left/right panel state management with `PanelState` interface
- **Dynamic Tree Builder**: Runtime stage creation/removal through store actions
  - `addStageToTree()`: Add new classification stage to any node
  - `removeStageFromTree()`: Remove stage and collapse subtree
  - `resetToRootOnlyTree()`: Reset to root-only configuration
- **Threshold Tree System V2**: Flexible threshold tree with split rules
  - **Range Rules**: Single metric, multiple thresholds (N thresholds → N+1 branches)
  - **Pattern Rules**: Multi-metric pattern matching with flexible conditions
  - **Expression Rules**: Complex logical expressions for advanced scenarios
- **Split Rule Builders**: Helper functions in `split-rule-builders.ts` for easy rule construction
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
- **Interactive Nodes**: Click handlers for histogram popover activation
- **Advanced Animations**: Smooth transitions with d3-transition
- **Color Coding**: Sophisticated color scheme based on node categories
- **Hover Effects**: Interactive feedback with tooltips and highlighting
- **Error States**: Comprehensive error handling with user-friendly messages

**Node Interaction Logic:**
```typescript
function getMetricsForNode(node: D3SankeyNode): MetricType[] | null {
  switch (node.category) {
    case 'root': return null // No histogram for root
    case 'feature_splitting': return ['feature_splitting']
    case 'semantic_distance': return ['semdist_mean']
    case 'score_agreement': return ['score_detection', 'score_fuzz', 'score_simulation']
  }
}
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
- **Threshold Tree Operations**: Tree traversal and node lookup
- **Threshold Updates**: `updateNodeThreshold()` for modifying thresholds
- **Node Path Resolution**: Complete parent path tracking from root to any node
- **Default Tree**: `buildDefaultTree()` for standard three-stage configuration

**dynamic-tree-builder.ts (New)**
- **Root-Only Tree**: `createRootOnlyTree()` for starting with just root node
- **Add Stage**: `addStageToNode()` for runtime stage addition
- **Remove Stage**: `removeStageFromNode()` for stage removal and subtree collapse
- **Stage Configuration**: `AddStageConfig` interface for flexible stage creation

**split-rule-builders.ts (New)**
- **Range Rule Builder**: Helper for creating range-based split rules
- **Pattern Rule Builder**: Helper for creating pattern-based split rules
- **Expression Rule Builder**: Helper for creating expression-based split rules

**selection-utils.ts (Phase 4)**
- **Threshold Calculation**: `calculateThresholdFromMouseX()` for exact mouse-to-threshold conversion
- **Range Calculation**: `calculateThresholdRangeFromMouse()` for selection rectangles
- **Bar Selection**: `getBarsInSelection()` for histogram bar intersection detection
- **Color Utilities**: `getSelectionColor()` for consistent threshold group colors
- **Formatting**: `formatThresholdRange()` and `formatMetricName()` for display

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
// All backend endpoints integrated (7 defined, 7 operational) ✅
export const getFilterOptions = (): Promise<FilterOptions>
export const getHistogramData = (request: HistogramDataRequest): Promise<HistogramData>
export const getSankeyData = (request: SankeyDataRequest): Promise<SankeyData>
export const getComparisonData = (request: ComparisonDataRequest): Promise<ComparisonData>
export const getLLMComparisonData = (filters: Filters): Promise<LLMComparisonData>  // ✅ IMPLEMENTED
export const getFeatureData = (featureId: number): Promise<FeatureDetail>
export const getFeaturesInThreshold = (filters: Filters, metric: string, min: number, max: number): Promise<{feature_ids: number[]}>
export const healthCheck = (): Promise<boolean>
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

**Development Server**: http://localhost:3005 (development server active)
- ✅ Hot reload with React Fast Refresh
- ✅ TypeScript compilation with error reporting
- ✅ Vite development server with optimized bundling
- ✅ Backend API integration with automatic health checking (port 8003)
- ✅ Histogram panel with threshold group management (Phase 4)
- ✅ LLM Comparison visualization with consistency scoring (Phase 5)

**Performance Metrics**:
- **Bundle Size**: Optimized with code splitting and tree shaking
- **Load Time**: Sub-second initial load with progressive enhancement
- **Interaction Response**: Real-time updates with smooth D3 animations
- **Memory Usage**: Efficient with proper cleanup and garbage collection
- **Dataset Support**: 2,471 rows (1,000 unique features × ~2.5 avg LLM explainers)
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
- **Multi-Stage Sankey Diagrams**: Complex flow visualization with flexible stages (Phase 1)
- **Alluvial Flow Diagrams**: Cross-panel feature tracking and comparison (Phase 2)
- **Histogram Panels**: Multi-metric threshold visualization with selection mode (Phase 4)
- **LLM Comparison Triangles**: Consistency scoring with color gradients (Phase 5)
- **Interactive Nodes**: Click-to-expand histogram analysis
- **Smooth Animations**: D3-powered transitions with proper timing
- **Hover Effects**: Rich tooltips with detailed information
- **Color-Coded Categories**: Intuitive visual categorization

### 🔄 State Management
- **Dual-Panel Store**: Independent left/right panel state with `PanelState` interface (Phase 1)
- **Dynamic Tree Actions**: Store actions for runtime stage creation/removal (Phase 2)
- **Threshold Tree V2**: Support for range, pattern, and expression split rules (Phase 2)
- **Alluvial Flow Updates**: Automatic flow calculation after Sankey data changes (Phase 2)
- **Threshold Group Management**: Named groups with visibility toggles (Phase 4)
- **Multi-Histogram Data**: Batch loading and management for multiple metrics (Phase 4)
- **LLM Comparison Data**: Pre-calculated consistency statistics integration (Phase 5)
- **View State Management**: Three-state workflow (empty → filtering → visualization)
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

### ✅ Phase 2: Dynamic Tree Builder (COMPLETE)
- ✅ **Runtime Stage Creation**: `addStageToNode()` for dynamic tree building
- ✅ **Runtime Stage Removal**: `removeStageFromNode()` for tree simplification
- ✅ **Root-Only Mode**: `createRootOnlyTree()` for starting fresh
- ✅ **Split Rule Builders**: Helper functions for easy rule construction
- ✅ **Alluvial Flows**: Cross-panel feature tracking and flow visualization
- ✅ **Classification Engine**: V2 classification with split evaluators

### ✅ Phase 3: Performance Optimization (COMPLETE)
- ✅ **Node Lookup Caching**: O(1) node access with cached dictionaries
- ✅ **Path Constraint Extraction**: Direct filtering for leaf nodes
- ✅ **Path-Based Filtering**: 3-5x faster for leaf node operations
- ✅ **Early Termination**: 2-3x faster for intermediate nodes
- ✅ **Overall Performance**: 20-30% faster Sankey generation

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

### 🔨 Phase 8: Consistency Score Integration (ACTIVE - October 2025)

**Purpose**: Integrate pre-computed consistency scores into Sankey classification workflow

**Backend Integration:**
- ✅ **consistency_scores.parquet**: Pre-computed consistency data loaded by backend
- ✅ **ConsistencyService**: Backend service with 8 consistency metrics
- ✅ **Data Loading**: Visualization service loads consistency scores alongside feature data

**Consistency Metrics Available:**
1. **LLM Scorer Consistency** (fuzz, detection): Consistency across scorers for same explainer
2. **Within-Explanation Metric Consistency**: Consistency across metrics within explainer
3. **Cross-Explanation Metric Consistency** (embedding, fuzz, detection): Per-metric consistency across explainers
4. **Cross-Explanation Overall Score Consistency**: Overall score consistency across explainers
5. **LLM Explainer Consistency**: Semantic similarity between LLM explanations

**Frontend Work (In Progress):**
- 🔨 **Consistency Stage Addition**: Add consistency-based classification stage to Sankey
- 🔨 **Type Definitions**: Update types.ts with consistency score types
- 🔨 **Threshold Tree Updates**: Add consistency metrics to split rules
- 🔨 **Sankey Node Updates**: Display consistency percentile ranges in nodes
- 🔨 **Histogram Support**: Add consistency metric histograms for threshold selection

**Implementation Plan:**
1. Update `types.ts` with consistency-related types
2. Modify `constants.ts` to include consistency metrics
3. Add consistency stage support in `dynamic-tree-builder.ts`
4. Update `d3-sankey-utils.ts` for consistency node visualization
5. Integrate consistency histograms in `HistogramPanel.tsx`
6. Test end-to-end consistency-based classification

### 📝 Future Enhancements
- **TablePanel**: Export selected cell groups to CSV/JSON
- **UMAP**: Cross-visualization linking with TablePanel selections
- **Dynamic Consistency**: Real-time consistency calculation for custom filter combinations
- **Debug View**: Individual feature inspection with path visualization
- **Consistency Filters**: Filter features by consistency thresholds across visualizations

## Critical Development Notes

1. **Backend Dependency**: Requires backend on port 8003 with all 9 endpoints operational
2. **Type Safety**: Full TypeScript integration - maintain type definitions
3. **Performance**: D3 calculations with React.memo, useMemo, useCallback
4. **State Management**: Centralized Zustand store with dual-panel architecture
5. **Component Architecture**: Separation of concerns (components/lib/api/store)
6. **Current Branch**: `add_cons_stage` (Phase 8 development)

## Project Assessment

This React frontend represents a **conference-ready research prototype** with:

**Core Architecture:**
- ✅ **Modern React Architecture** with React 19.1.1 and TypeScript 5.8.3
- ✅ **Zustand State Management** with DevTools integration for debugging
- ✅ **Vite Development Server** with hot module replacement
- ✅ **Full TypeScript Coverage** with comprehensive type definitions

**Visualization Capabilities (All 5 Phases Complete):**
- ✅ **Phase 1 - Dual-Panel Sankey**: Independent left/right panel state management
- ✅ **Phase 2 - Dynamic Tree Builder**: Runtime stage creation/removal capabilities
- ✅ **Phase 3 - Performance**: 20-30% faster with ParentPath optimizations
- ✅ **Phase 4 - Threshold Groups**: Named groups with histogram-based selection
- ✅ **Phase 5 - LLM Comparison**: Triangle-based consistency visualization

**Advanced Features:**
- ✅ **D3.js Visualization Suite**: Sankey, Alluvial, Histogram, and LLM Comparison diagrams
- ✅ **Threshold Tree System V2**: Range, pattern, and expression split rules
- ✅ **Split Rule Builders**: Helper functions for easy rule construction
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
- **Dynamic Tree Building**: Add/remove classification stages at runtime through store actions
- **Three Split Rule Types**: Range, pattern, and expression-based splitting
- **Multiple Visualization Types**: Sankey and Alluvial diagrams for different analytical perspectives
- **Dual-Panel State**: Independent threshold trees and data for left/right panels
- **Responsive Layout**: useResizeObserver hook ensures all visualizations adapt to container size
- **Conference Ready**: Optimized for live demonstrations with reliable error handling

**Design Philosophy:**
- **Research Prototype**: Built for conference demonstration and research flexibility
- **Production-Ready Code**: Comprehensive error handling and type safety
- **Maintainable Architecture**: Clear separation of concerns with modular design
- **Flexibility Focus**: Dynamic tree building without requiring code changes

The application is ready for **academic conference presentation** with fully functional dynamic tree building designed for **SAE feature analysis research** demonstrations.