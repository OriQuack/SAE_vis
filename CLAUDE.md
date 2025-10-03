# CLAUDE.md

This file provides comprehensive guidance to Claude Code (claude.ai/code) when working with the SAE Feature Visualization project repository.

## Project Overview

This is a **research prototype visualization interface** for EuroVIS conference submission focused on "Visualizing SAE feature explanation reliability." The project is designed as a conference demonstration tool that visualizes the consistency between different interpretability scoring methods for Sparse Autoencoder (SAE) features with flexible, research-oriented architecture.

## Current Project Status: 🚀 ADVANCED RESEARCH PROTOTYPE

**Phase 1 Complete**: ✅ Dual-panel Sankey visualization with dynamic tree building system
**Phase 2 Complete**: ✅ Dynamic tree builder allowing runtime stage creation and modification
**Phase 3 Complete**: ✅ Performance optimization with ParentPath-based caching and filtering
**Phase 4 Complete**: ✅ Linear Set Diagram (UpSet-style visualization) for scoring metric agreement analysis
**Current State**: Advanced research prototype with multiple visualization types and optimized backend
**Active Usage**: Development servers for research demonstrations with multi-panel visualization control
**Technical Readiness**: Conference-ready prototype with production-grade performance optimizations

## Technology Stack & Architecture

### Core Technologies
- **Backend**: Python 3.x, FastAPI 0.104.1, Polars 0.19.19, Uvicorn 0.24.0
- **Frontend**: React 19.1.1, TypeScript 5.8.3, Vite 7.1.6, Zustand 5.0.8
- **Visualization**: D3.js ecosystem (d3-sankey, d3-scale, d3-array, d3-selection, d3-transition, d3-interpolate)
- **Advanced Visualizations**: Sankey diagrams, Alluvial diagrams, Linear Set diagrams (UpSet-style), dual-panel comparisons, threshold tree interactions
- **Data Processing**: Polars lazy evaluation with string cache optimization
- **HTTP Client**: Axios 1.12.2 with interceptors and error handling
- **Data Storage**: Parquet files for efficient columnar data storage (1,648 features processed)
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
│   │   ├── api/                    # Modular API endpoints (5 implemented)
│   │   │   ├── filters.py           # GET /api/filter-options
│   │   │   ├── histogram.py         # POST /api/histogram-data
│   │   │   ├── sankey.py           # POST /api/sankey-data
│   │   │   ├── comparison.py        # POST /api/comparison-data
│   │   │   └── feature.py          # GET /api/feature/{id}
│   │   ├── models/                 # Pydantic request/response models
│   │   │   ├── requests.py         # API request schemas
│   │   │   ├── responses.py        # API response schemas
│   │   │   └── common.py           # Shared models (Filters, Thresholds, etc.)
│   │   └── services/               # Business logic layer
│   │       ├── visualization_service.py  # High-performance Polars visualization service
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
│   │   │   ├── LinearSetDiagram.tsx # D3 Linear Set (UpSet-style) visualization
│   │   │   └── HistogramPopover.tsx # Advanced popover system
│   │   ├── lib/
│   │   │   ├── constants.ts         # Centralized constant definitions
│   │   │   ├── d3-sankey-utils.ts  # D3 Sankey calculations
│   │   │   ├── d3-alluvial-utils.ts # D3 Alluvial calculations
│   │   │   ├── d3-linear-set-utils.ts # D3 Linear Set (UpSet-style) calculations
│   │   │   ├── d3-histogram-utils.ts # D3 Histogram calculations
│   │   │   ├── threshold-utils.ts   # Threshold tree operations
│   │   │   ├── dynamic-tree-builder.ts # Dynamic stage creation/removal
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
│   ├── preprocessing/              # Data processing scripts
│   └── CLAUDE.md                  # Data layer documentation
└── CLAUDE.md                      # ✅ This file (Project overview)
```

## Development Status & Implementation Details

### ✅ BACKEND: Production-Ready FastAPI Application

**Core Features:**
- **FastAPI 0.104.1**: Modern async web framework with automatic OpenAPI documentation
- **High-Performance Data Service**: Polars-based lazy evaluation for efficient large dataset processing
- **Comprehensive API**: 5 core endpoints with sub-second response times
- **Advanced Error Handling**: Structured error responses with custom error codes
- **Health Monitoring**: Service availability and data connectivity validation
- **CORS Support**: Multi-port frontend development support
- **Production Servers**: Active on ports 8003 (primary) and 8001 (development)
- **Performance Optimizations (NEW)**: ParentPath-based caching and filtering (20-30% faster)

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
- **Linear Set Diagram (NEW)**: UpSet-style visualization for scoring metric agreement analysis with interactive metric selection
- **Advanced Filtering**: Multi-select dropdowns with dynamic options from backend
- **Histogram Popovers**: Interactive threshold setting with drag-and-drop positioning
- **Real-time Updates**: Live API integration with loading states and error boundaries
- **Responsive Design**: Adaptive layout with useResizeObserver hook for all visualizations

**Component Architecture:**
- **Modular Components**: Clear separation of concerns with reusable components
- **D3 Integration**: Proper React-D3 integration patterns
- **State Management**: Centralized store with efficient re-rendering
- **Error Handling**: Comprehensive error boundaries throughout

### 📊 API Endpoints (All Operational)

| Method | Endpoint | Purpose | Status | Performance |
|--------|----------|---------|--------|-------------|
| `GET` | `/api/filter-options` | Dynamic filter population | ✅ Active | ~50ms (cached) |
| `POST` | `/api/histogram-data` | Threshold visualization | ✅ Active | ~200ms (20 bins) |
| `POST` | `/api/sankey-data` | Multi-stage flow diagrams | ✅ Heavy Usage | ~300ms (full pipeline) |
| `POST` | `/api/comparison-data` | Alluvial comparisons | ✅ Ready | Phase 2 implementation |
| `GET` | `/api/feature/{id}` | Individual feature details | ✅ Active | ~10ms (direct lookup) |

**Additional System Endpoints:**
- `GET /health` - Service monitoring and data connectivity
- `GET /docs` - Interactive Swagger UI documentation
- `GET /redoc` - Alternative API documentation interface

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

### ✅ Phase 4: Linear Set Diagram (COMPLETE - January 2025)
- ✅ **UpSet-Style Visualization**: Linear set diagram showing scoring metric agreement patterns
- ✅ **Interactive Metric Selection**: Toggle metrics (Fuzz, Detection, Simulation, Embedding) to analyze different combinations
- ✅ **Set Size Visualization**: Column heights represent feature counts for each metric combination
- ✅ **Threshold-Based Classification**: Configurable thresholds for each scoring metric
- ✅ **Category Background Areas**: Color-coded regions showing semantic/feature splitting categories
- ✅ **Interactive Tooltips**: Hover tooltips showing feature counts and category labels
- ✅ **Responsive Layout**: useResizeObserver hook for automatic size adaptation

### 📝 Future Enhancements
- **UI for Tree Builder**: Visual interface for adding/removing stages (currently API-only)
- **Debug View**: Individual feature inspection and path visualization
- **Export Functionality**: Save/load custom tree configurations
- **Cross-Visualization Interactions**: Link selections between Sankey, Alluvial, and Linear Set diagrams
- **Dataset Scaling**: Further optimization for 16K+ feature datasets

## Important Development Notes

1. **Data Dependency**: Backend requires master parquet file at `/data/master/feature_analysis.parquet`
2. **Port Configuration**: Default backend port 8003, frontend port 3003
3. **Type Safety**: Comprehensive TypeScript integration - maintain type definitions
4. **Error Handling**: Use structured error codes for proper frontend error handling
5. **Performance**: All data operations use async patterns - maintain this architecture
6. **API Integration**: Frontend depends on all 5 backend endpoints being operational
7. **Testing**: Always run backend tests after changes to verify functionality

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