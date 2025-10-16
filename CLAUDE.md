# CLAUDE.md

This file provides comprehensive guidance to Claude Code (claude.ai/code) when working with the SAE Feature Visualization project repository.

## Project Overview

This is a **research prototype visualization interface** for EuroVIS conference submission focused on "Visualizing SAE feature explanation reliability." The project is designed as a conference demonstration tool that visualizes the consistency between different interpretability scoring methods for Sparse Autoencoder (SAE) features with flexible, research-oriented architecture.

## Current Project Status: 🚀 ADVANCED RESEARCH PROTOTYPE

**Phase 1-6 Complete**: ✅ Sankey, Alluvial, Histogram, LLM Comparison, UMAP visualizations
**Phase 7 Active**: 🔨 TablePanel with feature-level scoring and consistency analysis
**Current State**: Advanced research prototype with 7 visualization types
**Active Usage**: Development servers on ports 8003 (backend) and 3003 (frontend)
**Technical Readiness**: Conference-ready with production-grade performance
**New Features**: Feature-level table with cell selection, consistency scoring, and saved groups

## Technology Stack & Architecture

### Core Technologies
- **Backend**: Python 3.x, FastAPI 0.104.1, Polars 0.19.19, Uvicorn 0.24.0
- **Frontend**: React 19.1.1, TypeScript 5.8.3, Vite 7.1.6, Zustand 5.0.8
- **Visualization**: D3.js ecosystem (d3-sankey, d3-scale, d3-array, d3-selection, d3-transition, d3-interpolate, d3-polygon, d3-zoom)
- **Advanced Visualizations**: Sankey, Alluvial, Histogram, LLM Comparison, UMAP, TablePanel (feature-level scoring)
- **Data Processing**: Polars lazy evaluation with string cache optimization
- **HTTP Client**: Axios 1.12.2 with interceptors and error handling
- **Data Storage**: Parquet files for efficient columnar data storage (1,648 features processed), JSON files for UMAP embeddings and cluster hierarchies
- **Design Philosophy**: Research prototype optimized for flexibility and conference demonstration, avoiding over-engineering

### Research Prototype Architecture (Three-Tier Design)

```
┌─────────────────────────────────────────────────────────────────┐
│                     React Frontend Layer                        │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │   React 19.1.1  │ │   Zustand       │ │   D3.js         │   │
│  │   TypeScript    │ │   State Store   │ │   Visualizations│   │
│  │   Components    │ │   (Slice-based) │ │   (Advanced)    │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                 ↕ REST API (JSON/HTTP)
┌─────────────────────────────────────────────────────────────────┐
│                     FastAPI Backend Layer                       │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │   DataService   │ │   Async Ops     │ │   ThresholdMgr  │   │
│  │   (Polars)      │ │   & Lifecycle   │ │   SankeyBuilder │   │
│  │   Lazy Loading  │ │   Management    │ │   Classification│   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                 ↕ Lazy Loading & String Cache
┌─────────────────────────────────────────────────────────────────┐
│                       Data Storage Layer                        │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │ Master Parquet  │ │   Detailed      │ │  String Cache   │   │
│  │ 1,648 features  │ │   JSON Files    │ │   Optimization  │   │
│  │ feature_analysis│ │   Individual    │ │   Categorical   │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
/home/dohyun/interface/
├── backend/                          # ✅ FastAPI Backend (Production-Ready)
│   ├── app/
│   │   ├── main.py                  # FastAPI application with lifespan management
│   │   ├── api/                    # Modular API endpoints (8 defined, 8 implemented)
│   │   │   ├── filters.py           # GET /api/filter-options
│   │   │   ├── histogram.py         # POST /api/histogram-data
│   │   │   ├── sankey.py           # POST /api/sankey-data
│   │   │   ├── comparison.py        # POST /api/comparison-data
│   │   │   ├── llm_comparison.py    # POST /api/llm-comparison
│   │   │   ├── threshold_features.py # POST /api/threshold-features
│   │   │   ├── umap.py             # POST /api/umap-data
│   │   │   ├── table.py            # POST /api/table-data (Phase 7)
│   │   │   └── feature.py          # GET /api/feature/{id}
│   │   ├── models/                 # Pydantic request/response models
│   │   │   ├── requests.py         # API request schemas
│   │   │   ├── responses.py        # API response schemas
│   │   │   └── common.py           # Shared models (Filters, Thresholds, etc.)
│   │   └── services/               # Business logic layer
│   │       ├── visualization_service.py  # High-performance Polars visualization service
│   │       ├── table_data_service.py     # Table data processing service (Phase 7)
│   │       ├── feature_classifier.py     # V2 feature classification engine
│   │       ├── rule_evaluators.py        # Split rule evaluation logic
│   │       ├── node_labeler.py           # Sankey node display name generation
│   │       └── data_constants.py         # Data schema constants
│   ├── docs/                       # API documentation
│   ├── start.py                    # Production startup script
│   ├── test_api.py                # Comprehensive API testing
│   └── CLAUDE.md                  # ✅ Backend-specific documentation
├── frontend/                        # ✅ React Frontend (Production-Ready)
│   ├── src/
│   │   ├── components/             # React components
│   │   │   ├── FilterPanel.tsx     # Multi-select filter interface
│   │   │   ├── SankeyDiagram.tsx   # D3 Sankey visualization
│   │   │   ├── AlluvialDiagram.tsx # D3 Alluvial flow visualization
│   │   │   ├── HistogramPanel.tsx  # Multi-histogram visualization
│   │   │   ├── ThresholdGroupPanel.tsx # Threshold group management
│   │   │   ├── HistogramPopover.tsx # Advanced popover system
│   │   │   ├── ProgressBar.tsx     # Linear set visualization
│   │   │   ├── FlowPanel.tsx       # Flow visualization panel
│   │   │   ├── UMAPPanel.tsx       # Dual UMAP visualization with zoom
│   │   │   ├── TablePanel.tsx      # Feature-level scoring table (Phase 7)
│   │   │   ├── SavedGroupsPanel.tsx # Saved group management
│   │   │   ├── VerticalBar.tsx     # Scroll indicator
│   │   │   ├── LLMComparisonSelection.tsx # Interactive LLM comparison
│   │   │   └── LLMComparisonVisualization.tsx # Static LLM comparison display
│   │   ├── lib/
│   │   │   ├── constants.ts         # Centralized constant definitions
│   │   │   ├── d3-sankey-utils.ts  # D3 Sankey calculations
│   │   │   ├── d3-alluvial-utils.ts # D3 Alluvial calculations
│   │   │   ├── d3-histogram-utils.ts # D3 Histogram calculations
│   │   │   ├── d3-llm-comparison-utils.ts # LLM comparison layout and color utilities
│   │   │   ├── d3-umap-utils.ts    # UMAP calculations and cluster hulls
│   │   │   ├── d3-table-utils.ts   # Table layout and consistency calculations (Phase 7)
│   │   │   ├── table-selection-utils.ts # Cell group selection logic (Phase 7)
│   │   │   ├── table-sort-utils.ts # Table sorting utilities (Phase 7)
│   │   │   ├── d3-linear-set-utils.ts # Linear set calculations
│   │   │   ├── d3-flow-utils.ts    # Flow visualization utilities
│   │   │   ├── d3-threshold-group-utils.ts # Threshold group utilities
│   │   │   ├── threshold-utils.ts   # Threshold tree operations
│   │   │   ├── threshold-group-converter.ts # Threshold group conversion
│   │   │   ├── dynamic-tree-builder.ts # Dynamic stage creation/removal
│   │   │   ├── selection-utils.ts   # Threshold selection utilities
│   │   │   ├── split-rule-builders.ts # Split rule construction helpers
│   │   │   └── utils.ts            # General helper functions (includes useResizeObserver hook)
│   │   ├── store.ts                # Zustand state management with dual panels
│   │   ├── types.ts               # TypeScript type definitions
│   │   ├── api.ts                 # HTTP client and API integration
│   │   ├── App.tsx                # Main application component
│   │   └── main.tsx               # Application entry point
│   ├── package.json               # Dependencies and scripts
│   └── CLAUDE.md                  # ✅ Frontend-specific documentation
├── data/                           # ✅ Data Processing Pipeline
│   ├── master/
│   │   └── feature_analysis.parquet # Master data file (1,648 features)
│   ├── detailed_json/              # Individual feature JSON files
│   ├── umap_feature/               # Feature UMAP embeddings and visualizations
│   ├── umap_explanations/          # Explanation UMAP embeddings
│   ├── umap_clustering/            # Hierarchical cluster data
│   ├── llm_comparison/             # LLM comparison statistics
│   ├── preprocessing/              # Data processing scripts
│   └── CLAUDE.md                  # Data layer documentation
└── CLAUDE.md                      # ✅ This file (Project overview)
```

## Development Status & Implementation Details

### ✅ BACKEND: Production-Ready FastAPI Application

**Core Features:**
- **FastAPI 0.104.1**: Modern async web framework with automatic documentation
- **Polars Data Processing**: High-performance lazy evaluation
- **9 API Endpoints**: All operational with sub-second response times
- **Production Servers**: Active on port 8003 (primary), 8001 (development)
- **Performance**: 20-30% faster with ParentPath-based optimizations

**Data Processing Pipeline:**
```
Raw Data → Polars LazyFrame → Feature Classification → Hierarchical Thresholds → Sankey Response
```

**Flexible Classification Pipeline Example (Current Configuration):**
```
Stage 0: Root (All Features: 1,648)
         ↓ [Range Rule: feature_splitting threshold]
Stage 1: Feature Splitting (True/False based on configurable threshold)
         ↓ [Range Rule: semdist_mean threshold]
Stage 2: Semantic Distance (High/Low based on configurable threshold)
         ↓ [Pattern Rule: Multi-metric scoring agreement]
Stage 3: Score Agreement (Flexible N-way classification)
         ├── All N High (all scores ≥ threshold)
         ├── N-1 High (exactly N-1 scores ≥ threshold)
         ├── ... (configurable patterns)
         └── All N Low (all scores < threshold)

Note: Stage order and scoring methods are fully configurable through
threshold tree structure. Not limited to 3 scores or fixed pipeline.
```

### ✅ FRONTEND: Advanced React Application

**Architecture Features:**
- **React 19.1.1**: Modern React with advanced component patterns
- **TypeScript 5.8.3**: Full type safety throughout application
- **Zustand State Management**: Centralized store with data flow management
- **D3.js Visualization**: Complex Sankey diagrams with interactive elements
- **Portal-Based UI**: Advanced popover system with positioning and drag functionality
- **Comprehensive Error Handling**: Error boundaries and graceful degradation

**Current Implementation:**
- **Dual-Panel Architecture**: Left/right panel system for comparison visualization with independent state
- **Dynamic Tree Builder**: Runtime stage creation/removal with `dynamic-tree-builder.ts`
- **Threshold Tree System V2**: Flexible threshold tree with configurable split rules (range, pattern, expression)
- **Sankey Flow Visualization**: Multi-stage hierarchical flow diagrams
- **Alluvial Flow Visualization**: Cross-panel flow comparison with feature ID tracking
- **Advanced Filtering**: Multi-select dropdowns with dynamic options from backend
- **Histogram Popovers**: Interactive threshold setting with drag-and-drop positioning
- **Real-time Updates**: Live API integration with loading states and error boundaries
- **Responsive Design**: Adaptive layout with useResizeObserver hook for visualizations

**Component Architecture:**
- **Modular Components**: Clear separation of concerns with reusable components
- **D3 Integration**: Proper React-D3 integration patterns
- **State Management**: Centralized store with efficient re-rendering
- **Error Handling**: Comprehensive error boundaries throughout

### 📊 API Endpoints (All Operational)

| Endpoint | Purpose | Status |
|----------|---------|--------|
| `GET /api/filter-options` | Dynamic filter options | ✅ ~50ms |
| `POST /api/histogram-data` | Threshold visualization | ✅ ~200ms |
| `POST /api/sankey-data` | Multi-stage flow diagrams | ✅ ~300ms |
| `POST /api/comparison-data` | Alluvial comparisons | ✅ Active |
| `POST /api/llm-comparison` | LLM consistency stats | ✅ ~10ms |
| `POST /api/threshold-features` | Feature IDs by threshold | ✅ ~50ms |
| `POST /api/umap-data` | UMAP projections | ✅ ~20ms |
| `POST /api/table-data` | Feature-level scoring table | ✅ NEW (Phase 7) |
| `GET /api/feature/{id}` | Individual feature details | ✅ ~10ms |
| `GET /health` | Service health check | ✅ ~5ms |

## Development Commands

### Backend Development
```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Start development server with debug logging
python start.py --reload --log-level debug

# Start on custom port
python start.py --port 8001 --reload

# Run comprehensive API tests
python test_api.py

# Production mode
python start.py --host 0.0.0.0 --port 8000
```

### Frontend Development
```bash
cd frontend

# Install dependencies
npm install

# Start development server (default: http://localhost:3000)
npm run dev

# Start on specific port (currently running on 3003)
npm run dev -- --port 3003

# Build for production
npm run build

# Preview production build
npm run preview
```

### Current Server Status (🟢 ACTIVE)

**Backend Servers:**
- **Primary**: Port 8003 - Production API server with heavy traffic
- **Development**: Port 8001 - Development and testing server
- **Health Status**: All endpoints operational with sub-second response times
- **API Documentation**: http://localhost:8003/docs (Interactive Swagger UI)

**Frontend Server:**
- **Development**: http://localhost:3003 - React development server with hot reload
- **Status**: Active with enhanced UX and advanced component interactions

**Performance Metrics:**
- **Dataset Size**: 1,648 features processed and analyzed
- **API Response Times**: Sub-second across all endpoints
- **Memory Efficiency**: Lazy loading prevents large memory footprint
- **Scalability**: Architecture designed to handle 16K+ features

## Data Schema & Processing

### Master Data File
- **Location**: `/data/master/feature_analysis.parquet`
- **Format**: Polars-optimized Parquet with string cache
- **Schema**: feature_id, sae_id, explanation_method, llm_explainer, llm_scorer, feature_splitting, semdist_mean, semdist_max, scores (fuzz, simulation, detection, embedding), details_path
- **Size**: 1,648 features with complete metadata

### Dynamic Threshold Tree System (Current Architecture)
- **Dynamic Tree Builder**: Runtime stage creation and removal through `dynamic-tree-builder.ts`
  - `createRootOnlyTree()`: Initialize with root-only tree
  - `addStageToNode()`: Add new classification stage to any node at runtime
  - `removeStageFromNode()`: Remove stage and collapse subtree
- **Split Rule Types**: Three types of split rules for maximum flexibility:
  - **Range Rules**: Single metric with N threshold values creating N+1 branches
  - **Pattern Rules**: Multi-metric pattern matching with configurable conditions
  - **Expression Rules**: Complex logical expressions for advanced splitting logic
- **Split Rule Builders**: Helper functions in `split-rule-builders.ts` for easy rule construction
- **Flexible Scoring Methods**: Support for any number of scoring methods (not limited to 3)
- **Parent Path Tracking**: Complete path information from root to any node
- **Research-Oriented Design**: Optimized for conference demonstration with live tree modification


### Data Processing Features
- **Polars Lazy Evaluation**: Efficient query processing for large datasets
- **String Cache Optimization**: Enhanced categorical data operations
- **Multi-column Filtering**: Boolean logic for complex filter combinations
- **Hierarchical Aggregation**: Three-stage Sankey data generation
- **Comprehensive Validation**: Data integrity checks and error reporting

## Key Technical Achievements

### 🚀 Performance Optimizations (✅ PRODUCTION-GRADE)
- **Sub-second API responses** across all endpoints
- **Lazy loading architecture** for efficient memory usage
- **String cache optimization** for categorical data processing
- **Client-side memoization** for expensive D3 calculations
- **Debounced interactions** for smooth user experience
- **ParentPath-Based Caching (NEW)**: O(1) node lookups with cached dictionaries
- **Path-Based Filtering (NEW)**: Direct filtering for leaf nodes without full classification (3-5x faster)
- **Early Termination (NEW)**: Stops classification at target stage for intermediate nodes (2-3x faster)
- **Memory Optimization (NEW)**: ~50% reduction in temporary allocations
- **Overall Performance Gain**: 20-30% faster Sankey generation for typical threshold trees

### 🏗️ Research-Oriented Architecture
- **Modular component system** with clear separation of concerns (avoiding over-engineering)
- **Type-safe API integration** throughout the stack
- **Comprehensive error handling** with graceful degradation
- **Advanced state management** with centralized data flow
- **Conference demonstration** configuration

### 🎯 Advanced User Experience
- **Interactive Sankey diagrams** with flexible threshold tree V2 management
- **Portal-based popovers** with advanced positioning and drag functionality
- **Real-time data updates** with loading states and error handling
- **Responsive design** with adaptive layouts
- **Comprehensive accessibility** with proper ARIA labels

### 🔧 Developer Experience
- **Hot reload development** with automatic port conflict resolution
- **Comprehensive TypeScript** integration with excellent tooling
- **Interactive API documentation** with Swagger UI
- **Comprehensive testing suite** for API validation
- **Structured logging** with configurable levels

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

### ✅ Phase 3: Performance Optimization (COMPLETE - January 2025)
- ✅ **Node Lookup Caching**: O(1) node access with `_nodes_by_id` and `_nodes_by_stage` caches
- ✅ **Path Constraint Extraction**: `get_path_constraints()` method for direct filtering
- ✅ **Path-Based Filtering**: Optimized `_filter_by_path_constraints()` for leaf nodes
- ✅ **Early Termination**: `_filter_by_targeted_classification()` stops at target stage
- ✅ **Cache Utilization**: All methods use cached lookups from `ThresholdStructure`
- ✅ **Performance Validation**: 20-30% faster Sankey generation, 3-5x faster leaf node filtering

### ✅ Phase 4: Threshold Group Management (COMPLETE - January 2025)
- ✅ **HistogramPanel Component**: Multi-histogram visualization with 5 metrics (Feature Splitting, Semantic Similarity, Embedding/Fuzz/Detection Scores)
- ✅ **ThresholdGroupPanel Component**: Group management UI with + button workflow
- ✅ **Named Threshold Groups**: User-defined groups with auto-generated default names ("group 1", "group 2", etc.)
- ✅ **Interactive Selection**: Drag-to-select on histograms with exact mouse position calculation
- ✅ **Group Visibility Toggle**: Click group nodes to show/hide threshold visualizations
- ✅ **Visual Indicators**: Color-coded status (gray=hidden, green=visible) with subtle glow effect
- ✅ **Threshold Display**: 30-degree rotated labels showing exact min/max values on histogram
- ✅ **Selection Mode**: Dimmed histogram bars (0.3 opacity) with full-opacity selected bars
- ✅ **Merged Score Histograms**: Common 0-1 x-axis for score metrics with single bottom axis
- ✅ **Professional Styling**: Gray dotted threshold lines, black value labels, color-coded selection areas
- ✅ **Store Integration**: Zustand state management with `thresholdGroups`, `pendingGroup`, group actions
- ✅ **Selection Utilities**: `selection-utils.ts` with threshold calculation and formatting functions

### ✅ Phase 5: LLM Comparison Visualization (COMPLETE - January 2025)
- ✅ **LLMComparisonSelection Component**: Interactive triangle-based visualization with hover/click interactions
- ✅ **LLMComparisonVisualization Component**: Static display variant for reference
- ✅ **Triangle Layout System**: Four triangles (1 left explainer, 3 right scorers) with 6 cells each (3 diamonds + 3 triangles)
- ✅ **Fixed ViewBox Architecture**: Consistent positioning with absolute coordinates (viewBox: 0 0 800 350)
- ✅ **Consistency Scoring**: Green→yellow→red gradient visualization (0=inconsistent, 1=consistent)
- ✅ **Diamond Cell Coloring**: Consistency scores mapped to color gradient on diamond cells
- ✅ **Model Name Labels**: GPT-4, Claude, Gemini labels centered on triangle cells
- ✅ **Gradient Legend**: Visual reference bar showing consistency score scale (0 Low to 1 High)
- ✅ **Color Utilities**: `getConsistencyColor()` and `getGradientStops()` in d3-llm-comparison-utils.ts
- ✅ **Layout Calculations**: `calculateLLMComparisonLayout()` with triangle cell positioning
- ✅ **Type Definitions**: LLMComparisonData, LLMExplainerModel, LLMScorerModel, ConsistencyScore types
- ✅ **API Function**: `getLLMComparisonData()` in api.ts with backend endpoint IMPLEMENTED
- ✅ **Backend Implementation**: POST /api/llm-comparison serves pre-calculated consistency statistics
- ✅ **Real Data Integration**: Uses pre-calculated explainer consistency (cosine similarity) and scorer consistency (RV coefficient)
- ✅ **Correlation Methods**: Cosine similarity (explainers), RV coefficient (scorers)

### ✅ Phase 6: UMAP Visualization (COMPLETE - October 2025)
- ✅ **Dual-Panel UMAP**: Feature and explanation projections with interactive zoom/pan
- ✅ **Hierarchical Clustering**: Multi-level cluster hierarchy with zoom-based level switching
- ✅ **Convex Hull Overlays**: Cluster boundaries with d3-polygon
- ✅ **Cross-Panel Linking**: Feature-explanation cluster highlighting
- ✅ **Backend**: POST /api/umap-data with pre-calculated projections

### 🔨 Phase 7: TablePanel Visualization (ACTIVE - Current)
- ✅ **Feature-Level Scoring**: 824 rows with embedding/fuzz/detection scores per explainer
- ✅ **Consistency Types**: LLM Scorer, Within-explanation, Cross-explanation, LLM Explainer
- ✅ **Cell Group Selection**: Drag-to-select with union/difference modes
- ✅ **Saved Groups**: Persistent group management with color-coding
- ✅ **Sorting**: Multi-column sorting by score or consistency
- ✅ **Dynamic Headers**: 2-row (averaged) or 3-row (individual scorers) layouts
- ✅ **Scroll Indicator**: VerticalBar component for navigation feedback
- ✅ **Backend**: POST /api/table-data with consistency calculations
- ✅ **Real-time Coloring**: Green→yellow→red consistency gradient

### 📝 Future Enhancements
- **TablePanel**: Export selected cell groups to CSV/JSON
- **UMAP**: Cross-visualization linking with TablePanel selections
- **Dynamic LLM Computation**: Real-time consistency calculation instead of pre-calculated stats
- **Debug View**: Individual feature inspection with detailed path visualization

## Important Development Notes

1. **Data Files**:
   - Master parquet: `/data/master/feature_analysis.parquet` (1,648 features)
   - LLM stats: `/data/llm_comparison/llm_comparison_stats.json`
   - UMAP projections: `/data/umap_feature/`, `/data/umap_explanations/`, `/data/umap_clustering/`
2. **Port Configuration**: Backend 8003, Frontend 3003
3. **Type Safety**: Full TypeScript integration - maintain type definitions
4. **Testing**: Run `python test_api.py` after backend changes
5. **Current Branch**: `table` (Phase 7 development)

## Project Maturity Assessment

This SAE Feature Visualization platform represents a **research prototype for conference demonstration** with:

- ✅ **Research-focused architecture** with modular, flexible design optimized for demonstrations
- ✅ **Interactive visualizations** with intuitive user experience for conference presentations
- ✅ **Efficient data processing** capable of handling research datasets
- ✅ **Reliable error handling** and graceful degradation for live demonstrations
- ✅ **Full-stack TypeScript integration** with excellent developer experience
- ✅ **Conference demonstration readiness** with stable local deployment
- ✅ **Flexible threshold system** supporting dynamic stage ordering and variable scoring methods

**Important Design Philosophy:**
- **Research Prototype**: Designed for conference demonstration, not production deployment
- **Flexibility Over Enterprise Features**: Prioritizes research flexibility over enterprise-grade scalability
- **Maintainability**: Avoids over-engineering to ensure readability and ease of modification
- **Conference Ready**: Optimized for live academic presentations and research validation

The platform is ready for **academic conference presentation** and designed for **flexible SAE feature analysis research** at conference demonstration scale.
- Avoid over-engineering and reuse existing logic if possible.