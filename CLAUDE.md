# CLAUDE.md

This file provides comprehensive guidance to Claude Code (claude.ai/code) when working with the SAE Feature Visualization project repository.

## Project Overview

This is a **research prototype visualization interface** for EuroVIS conference submission focused on "Visualizing SAE feature explanation reliability." The project is designed as a conference demonstration tool that visualizes the consistency between different interpretability scoring methods for Sparse Autoencoder (SAE) features with flexible, research-oriented architecture.

## Current Project Status: 🚀 ADVANCED RESEARCH PROTOTYPE

**Phase 1-8 Complete**: ✅ Sankey, Alluvial, Histogram, LLM Comparison, UMAP, TablePanel, Consistency Integration
**Current State**: Advanced research prototype with simplified architecture - feature grouping + frontend intersection
**Active Usage**: Development servers on ports 8003 (backend) and 3003 (frontend)
**Technical Readiness**: Conference-ready with instant threshold updates
**Architecture**: Simplified feature grouping API with tree-based frontend Sankey building

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

### Research Prototype Architecture (Feature Grouping + Frontend Intersection)

```
┌─────────────────────────────────────────────────────────────────┐
│                     React Frontend Layer                        │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │   React 19.1.1  │ │   Zustand       │ │   D3.js         │   │
│  │   TypeScript    │ │   State Store   │ │   Visualizations│   │
│  │   Tree Building │ │   Global Cache  │ │   (Advanced)    │   │
│  │   Set Intersect │ │   Feature Groups│ │   Sankey, UMAP  │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                 ↕ POST /api/feature-groups
                                   {metric, thresholds, filters}
                                 ↕ {groups: [{feature_ids, range_label}]}
┌─────────────────────────────────────────────────────────────────┐
│                     FastAPI Backend Layer                       │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │FeatureGroupSvc  │ │   Async Ops     │ │   Filter Mgr    │   │
│  │ Simple Grouping │ │   & Lifecycle   │ │   Validation    │   │
│  │ N→N+1 Branches  │ │   Management    │ │   String Cache  │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                 ↕ Polars LazyFrame Operations
┌─────────────────────────────────────────────────────────────────┐
│                       Data Storage Layer                        │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │ Master Parquet  │ │   Consistency   │ │  UMAP + LLM     │   │
│  │ 1,648 features  │ │   Scores        │ │  Comparison     │   │
│  │ feature_analysis│ │   Pre-computed  │ │  JSON Data      │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
/home/dohyun/interface/
├── backend/                          # ✅ FastAPI Backend (Production-Ready)
│   ├── app/
│   │   ├── main.py                  # FastAPI application with lifespan management
│   │   ├── api/                    # Modular API endpoints
│   │   │   ├── filters.py           # GET /api/filter-options
│   │   │   ├── histogram.py         # POST /api/histogram-data
│   │   │   ├── feature_groups.py    # POST /api/feature-groups (PRIMARY ENDPOINT)
│   │   │   ├── comparison.py        # POST /api/comparison-data
│   │   │   ├── llm_comparison.py    # POST /api/llm-comparison
│   │   │   ├── umap.py             # POST /api/umap-data
│   │   │   ├── table.py            # POST /api/table-data (Phase 7)
│   │   │   └── feature.py          # GET /api/feature/{id}
│   │   ├── models/                 # Pydantic request/response models
│   │   │   ├── requests.py         # API request schemas
│   │   │   ├── responses.py        # API response schemas
│   │   │   └── common.py           # Shared models (Filters, etc.)
│   │   └── services/               # Business logic layer
│   │       ├── feature_group_service.py  # Feature grouping by threshold ranges
│   │       ├── visualization_service.py  # Histogram and visualization data
│   │       ├── table_data_service.py     # Table data processing service (Phase 7)
│   │       ├── consistency_service.py    # Consistency score calculations (Phase 8)
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
│   │   │   ├── threshold-utils.ts   # Tree-based Sankey computation with set intersection
│   │   │   ├── selection-utils.ts   # Threshold selection utilities
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
│   │   ├── feature_analysis.parquet # Master data file (1,648 features)
│   │   └── consistency_scores.parquet # Pre-computed consistency scores (Phase 8)
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
- **8 API Endpoints**: All operational with sub-second response times
- **Production Servers**: Active on port 8003 (primary), 8001 (development)
- **Simplified Architecture**: Feature grouping with frontend-driven tree building

**Data Processing Pipeline:**
```
User Filters → Polars LazyFrame → Feature Grouping (N→N+1) → Feature IDs by Range → Frontend
```

**Feature Grouping Logic:**
```
Backend Endpoint: POST /api/feature-groups
Request: { filters, metric, thresholds: [0.3, 0.7] }
Response: {
  groups: [
    { group_index: 0, range_label: "< 0.30", feature_ids: [1,5,12,...], count: 245 },
    { group_index: 1, range_label: "0.30 - 0.70", feature_ids: [2,8,15,...], count: 892 },
    { group_index: 2, range_label: ">= 0.70", feature_ids: [3,9,18,...], count: 511 }
  ]
}

Frontend builds Sankey tree by:
1. Caching feature groups by metric+thresholds
2. Building tree structure level-by-level
3. Computing child nodes via set intersection: parent_features ∩ group_features
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
- **Tree-Based Sankey Building**: Frontend builds Sankey structure using set intersection algorithm
- **Feature Group Caching**: Global cache by metric+thresholds for instant threshold updates
- **Set Intersection Logic**: Efficient child node computation via parent ∩ group features
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
| `POST /api/feature-groups` | Feature IDs grouped by thresholds | ✅ ~50ms (PRIMARY) |
| `POST /api/comparison-data` | Alluvial comparisons | ✅ Active |
| `POST /api/llm-comparison` | LLM consistency stats | ✅ ~10ms |
| `POST /api/umap-data` | UMAP projections | ✅ ~20ms |
| `POST /api/table-data` | Feature-level scoring table | ✅ ~300ms (Phase 7) |
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

### Tree-Based Sankey System (Current Architecture)
- **Frontend Tree Building**: Sankey structure computed locally using feature group intersection
- **Feature Group Caching**: Global cache by `metric:thresholds` key for instant updates
- **Set Intersection Algorithm**: Child nodes created via `parent_features ∩ group_features`
- **Tree Structure**: Map-based tree with `SankeyTreeNode` containing feature IDs and metadata
- **Threshold Path Support**: Histogram requests include threshold path for accurate filtering
- **Dynamic Stage Management**: Runtime stage creation/removal via store actions
  - `loadRootFeatures()`: Initialize root node with all features
  - `addStageToNode()`: Add stage by fetching groups and computing intersections
  - `removeStageFromNode()`: Remove stage and collapse subtree
- **Research-Oriented Design**: Optimized for flexibility with instant threshold updates

### Data Processing Features
- **Polars Lazy Evaluation**: Efficient query processing for large datasets
- **String Cache Optimization**: Enhanced categorical data operations
- **Multi-column Filtering**: Boolean logic for complex filter combinations
- **Feature Grouping**: N thresholds → N+1 groups with range labels
- **Comprehensive Validation**: Data integrity checks and error reporting

## Key Technical Achievements

### 🚀 Performance Optimizations (✅ PRODUCTION-GRADE)
- **Sub-second API responses** across all endpoints
- **Lazy loading architecture** for efficient memory usage
- **String cache optimization** for categorical data processing
- **Client-side memoization** for expensive D3 calculations
- **Debounced interactions** for smooth user experience
- **Feature Group Caching**: Global cache by metric+thresholds prevents redundant backend calls
- **Set Intersection**: O(min(|A|, |B|)) complexity for child node computation
- **Instant Threshold Updates**: Cached groups enable local tree rebuilding without backend roundtrip
- **Stateless Backend**: Simple feature grouping scales horizontally
- **Overall Performance Gain**: Instant Sankey updates for threshold changes, ~50ms for new metric groups

### 🏗️ Research-Oriented Architecture
- **Modular component system** with clear separation of concerns (avoiding over-engineering)
- **Type-safe API integration** throughout the stack
- **Comprehensive error handling** with graceful degradation
- **Advanced state management** with centralized data flow
- **Conference demonstration** configuration

### 🎯 Advanced User Experience
- **Interactive Sankey diagrams** with dynamic tree building and instant threshold updates
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

### ✅ Phase 2: Tree-Based Sankey Building (COMPLETE)
- ✅ **Tree-Based Architecture**: Map-based tree structure with `SankeyTreeNode`
- ✅ **Feature Group Caching**: Global cache by metric+thresholds for instant updates
- ✅ **Set Intersection Algorithm**: Efficient child node computation
- ✅ **Runtime Stage Creation**: `addStageToNode()` fetches groups and computes intersections
- ✅ **Runtime Stage Removal**: `removeStageFromNode()` for tree simplification
- ✅ **Alluvial Flows**: Cross-panel feature tracking and flow visualization

### ✅ Phase 3: Performance Optimization (COMPLETE - January 2025)
- ✅ **Feature Group Caching**: Global cache prevents redundant API calls for same metric+thresholds
- ✅ **Set Intersection**: O(min(|A|, |B|)) algorithm for efficient child node computation
- ✅ **Instant Updates**: Threshold changes trigger local tree rebuild without backend roundtrip
- ✅ **Stateless Backend**: Simple grouping API enables horizontal scaling
- ✅ **Cache Invalidation**: Filter changes clear cache for fresh data
- ✅ **Performance Validation**: Instant Sankey updates, ~50ms for new groups

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

### ✅ Phase 7: TablePanel Visualization (COMPLETE - October 2025)
- ✅ **Feature-Level Scoring**: 824 rows with embedding/fuzz/detection scores per explainer
- ✅ **Consistency Types**: LLM Scorer, Within-explanation, Cross-explanation, LLM Explainer
- ✅ **Cell Group Selection**: Drag-to-select with union/difference modes
- ✅ **Saved Groups**: Persistent group management with color-coding
- ✅ **Sorting**: Multi-column sorting by score or consistency
- ✅ **Dynamic Headers**: 2-row (averaged) or 3-row (individual scorers) layouts
- ✅ **Scroll Indicator**: VerticalBar component for navigation feedback
- ✅ **Backend**: POST /api/table-data with consistency calculations
- ✅ **Real-time Coloring**: Green→yellow→red consistency gradient

### ✅ Phase 8: Consistency Score Integration (COMPLETE - October 2025)
- ✅ **Pre-computed Consistency Scores**: consistency_scores.parquet with 8 consistency metrics
- ✅ **Consistency Service**: Backend service for consistency calculations (consistency_service.py)
- ✅ **Consistency Types**:
  - LLM Scorer Consistency (fuzz, detection): Consistency across different scorers
  - Within-Explanation Metric Consistency: Consistency across metrics within same explainer
  - Cross-Explanation Metric Consistency (embedding, fuzz, detection): Consistency across explainers per metric
  - Cross-Explanation Overall Score Consistency: Overall score consistency across explainers
  - LLM Explainer Consistency: Semantic similarity between explanations from different LLMs
- ✅ **Feature Grouping**: Consistency metrics supported by POST /api/feature-groups
- ✅ **Preprocessing Script**: 8_precompute_consistency_scores.py for batch calculation
- ✅ **Performance Optimization**: Pre-computed values for fast feature grouping
- ✅ **Frontend Integration**: Consistency metrics available for Sankey stage creation

### 📝 Future Enhancements
- **TablePanel**: Export selected cell groups to CSV/JSON
- **UMAP**: Cross-visualization linking with TablePanel selections
- **Dynamic Consistency**: Real-time consistency calculation for custom filter combinations
- **Debug View**: Individual feature inspection with detailed path visualization
- **Advanced Tree Operations**: Tree serialization/deserialization for saving/loading configurations

## Important Development Notes

1. **Data Files**:
   - Master parquet: `/data/master/feature_analysis.parquet` (1,648 features)
   - Consistency scores: `/data/master/consistency_scores.parquet` (pre-computed, 8 metrics)
   - LLM stats: `/data/llm_comparison/llm_comparison_stats.json`
   - UMAP projections: `/data/umap_feature/`, `/data/umap_explanations/`, `/data/umap_clustering/`
2. **Port Configuration**: Backend 8003, Frontend 3003
3. **Type Safety**: Full TypeScript integration - maintain type definitions
4. **Testing**: Run `python test_api.py` after backend changes
5. **Architecture**: Simplified feature grouping + frontend intersection for maximum flexibility

## Project Maturity Assessment

This SAE Feature Visualization platform represents a **research prototype for conference demonstration** with:

- ✅ **Research-focused architecture** with modular, flexible design optimized for demonstrations
- ✅ **Interactive visualizations** with intuitive user experience for conference presentations
- ✅ **Efficient data processing** capable of handling research datasets
- ✅ **Reliable error handling** and graceful degradation for live demonstrations
- ✅ **Full-stack TypeScript integration** with excellent developer experience
- ✅ **Conference demonstration readiness** with stable local deployment
- ✅ **Simplified architecture** with feature grouping + frontend intersection for instant updates

**Important Design Philosophy:**
- **Research Prototype**: Designed for conference demonstration, not production deployment
- **Simplicity First**: Backend does simple feature grouping, frontend handles tree building
- **Maintainability**: Clean separation of concerns with minimal complexity
- **Flexibility**: Instant threshold updates without backend recomputation
- **Conference Ready**: Optimized for live academic presentations and research validation

The platform is ready for **academic conference presentation** and designed for **flexible SAE feature analysis research** at conference demonstration scale.
- Simplified architecture prioritizes clarity and instant updates over complex classification.