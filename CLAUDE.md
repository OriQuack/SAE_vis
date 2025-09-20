# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a visualization interface project for EuroVIS conference submission focused on "Visualizing SAE feature explanation reliability." The project aims to build a full-stack application to visualize the consistency between different interpretability scoring methods for Sparse Autoencoder (SAE) features.

## Technologies

- **Backend**: Python, FastAPI, Polars for data processing
- **Frontend**: React, TypeScript, D3.js for visualizations
- **Data**: Parquet files for efficient columnar data storage
- **Visualization**: Sankey and alluvial diagrams using d3-sankey

## Development Status & Architecture

### ✅ Current State (Completed)
- **Data preprocessing pipeline**: Fully implemented with 1,648 features processed
- **Master Parquet file**: Available at `/data/master/feature_analysis.parquet`
- **Detailed JSON generation**: Complete feature data available in `/data/detailed_json/`
- **Data schema**: Established with explanations, scores, semantic distances per feature
- **FastAPI Backend**: Complete implementation with all core endpoints
- **Data service**: High-performance Polars-based data processing layer
- **API testing**: Comprehensive test suite with all endpoints validated
- **React Frontend**: Full TypeScript implementation with D3.js visualizations
- **Single Sankey View**: Complete implementation with interactive filtering and thresholds
- **UI Components**: Modular architecture with FilterPanel, HistogramSlider, HistogramPopover/, SankeyDiagram/, LoadingSpinner, shared/ components

### 🏗️ Architecture (Implemented)

**Three-tier scalable design:**
```
Frontend (React + TypeScript + D3.js) ✅
    ↕ REST API (JSON with pre-computed aggregations) ✅
Backend (Python + FastAPI + Polars) ✅
    ↕ Lazy loading and filtering ✅
Data Storage (Master Parquet + Index files) ✅
```

### 📊 Core API Endpoints 8001 Implemented)
- `GET /api/filter-options` - Available filter values for UI controls
- `POST /api/histogram-data` - Generate histogram data for threshold controls
- `POST /api/sankey-data` - Generate Sankey diagram with configurable thresholds
- `POST /api/comparison-data` - Generate alluvial diagrams (Phase 2 - structure ready)
- `GET /api/feature/{feature_id}` - Detailed feature data for debug view

### 🎯 Development Progress
1. **✅ Sprint 0 Complete**: Master parquet creation + FastAPI setup + comprehensive testing
2. **✅ Sprint 1 Complete**: Frontend React foundation + Single Sankey implementation
3. **🔄 Sprint 2 In Progress**: Component refactoring + modular architecture + advanced histogram interactions
4. **🔜 Sprint 3**: Dual Sankey + alluvial comparison view implementation
5. **🔜 Sprint 4**: Debug view with feature drilling and category management
6. **🔜 Sprint 5**: Performance optimization and polish

### 🔧 Key Technical Decisions
- **Backend-heavy processing**: All aggregations server-side for scalability
- **D3 for calculations, React for DOM**: Optimal performance pattern
- **Polars lazy evaluation**: Handle large datasets efficiently
- **Progressive loading**: Support 16K+ features without performance degradation

### 🏗️ Sprint 2 Architectural Improvements (🔄 In Progress)
- **Modular Component Design**: Refactored complex components into organized subdirectories
  - HistogramPopover split into specialized sub-components for better maintainability
  - SankeyDiagram decomposed into logical UI pieces (Header, Legend, Node, Link, StageLabels)
  - Shared component library for common UI patterns
- **Slice-based State Management**: Migrated from monolithic to modular Zustand architecture
  - Separate slices for filters, thresholds, popover, and API state
  - Centralized selectors for efficient state access patterns
  - Type-safe constants and utilities for consistent state operations
- **Custom Hook Library**: Added specialized hooks for advanced user interactions
  - useClickOutside for modal/popover outside-click handling
  - useDragHandler for drag-based UI interactions
  - useResizeObserver for responsive component behavior
- **Enhanced Development Experience**: Improved code organization and maintainability
  - Clear separation of concerns between UI, state, and business logic
  - Better TypeScript integration with modular type definitions
  - Foundation for Phase 2 dual visualization implementation

## Development Commands

### Backend (✅ Ready)
```bash
cd backend

# Start development server
python start.py --reload --log-level debug

# Start on different port
python start.py --port 8003 --reload

# Run comprehensive API tests
python test_api.py

# Install dependencies
pip install -r requirements.txt
```

### Current Server Status
- **Backend**: Multiple servers running (ports 8003)
- **Frontend**: Development server on http://localhost:3003
- **API Documentation**: http://127.0.0.1:8003/docs
- **Health Check**: http://127.0.0.1:8003/health
- **All tests passing**: ✅ 5/5 endpoints functional
- **Application Status**: ✅ Fully functional Phase 1 (Single Sankey visualization)

### Frontend (✅ Implemented)
```bash
cd frontend && npm run dev               # Development server (http://localhost:3000)
npm run dev -- --port 3003             # Alternative port (currently running)
npm run build && npm run test           # Build and test
```

### Frontend Implementation Details
- **Modular Components**: FilterPanel, HistogramSlider, LoadingSpinner + modular components in subdirectories
  - `HistogramPopover/`: Advanced popover with IndividualHistogram, MultiHistogramView, SingleHistogramView, PopoverFooter, PopoverHeader
  - `SankeyDiagram/`: Modular Sankey with SankeyHeader, SankeyLegend, SankeyLink, SankeyNode, SankeyStageLabels
  - `shared/`: Reusable components (ErrorMessage, FilterDropdown, MetricSelector, Tooltip)
- **Views**: SankeyView (Phase 1 complete)
- **State Management**: Slice-based Zustand architecture with modular stores
  - `visualization/slices/`: filterSlice, thresholdSlice, popoverSlice, apiSlice
  - `visualization/`: selectors, constants, types, utils for organized state management
- **Custom Hooks**: useClickOutside, useDragHandler, useResizeObserver for advanced interactions
- **API Integration**: Full integration with all backend endpoints
- **Health Checking**: Automatic backend connectivity validation
- **Error Handling**: Comprehensive error states and user feedback

## API Implementation Details

### Data Processing Features
- **Polars lazy evaluation**: Efficient query processing for large datasets
- **String cache enabled**: Optimized categorical data operations
- **Smart filtering**: Multi-column filter combinations with boolean logic
- **Hierarchical aggregation**: Three-stage Sankey data generation
- **Error handling**: Comprehensive validation and error responses

### Performance Characteristics
- **Dataset size**: 1,648 features currently processed
- **Response times**: Sub-second for all endpoints
- **Memory efficiency**: Lazy loading prevents large memory footprint
- **Scalability**: Designed to handle 16K+ features

### API Response Examples
- **Filter options**: 1 SAE ID, 1 explanation method available
- **Histogram data**: 20-bin distributions with statistics
- **Sankey generation**: 9 nodes, 8 links with real feature flows
- **Feature details**: Complete metadata with scores and paths