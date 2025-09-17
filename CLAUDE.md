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

### 🏗️ Architecture (Implemented)

**Three-tier scalable design:**
```
Frontend (React + TypeScript + D3.js) [TO BE IMPLEMENTED]
    ↕ REST API (JSON with pre-computed aggregations) ✅
Backend (Python + FastAPI + Polars) ✅
    ↕ Lazy loading and filtering ✅
Data Storage (Master Parquet + Index files) ✅
```

### 📊 Core API Endpoints (✅ Implemented)
- `GET /api/filter-options` - Available filter values for UI controls
- `POST /api/histogram-data` - Generate histogram data for threshold controls
- `POST /api/sankey-data` - Generate Sankey diagram with configurable thresholds
- `POST /api/comparison-data` - Generate alluvial diagrams (Phase 2 - structure ready)
- `GET /api/feature/{feature_id}` - Detailed feature data for debug view

### 🎯 Development Progress
1. **✅ Sprint 0 Complete**: Master parquet creation + FastAPI setup + comprehensive testing
2. **🔜 Sprint 1**: Frontend React foundation + Single Sankey implementation
3. **🔜 Sprint 2**: Dual Sankey + alluvial comparison view implementation
4. **🔜 Sprint 3**: Debug view with feature drilling and category management
5. **🔜 Sprint 4**: Performance optimization and polish

### 🔧 Key Technical Decisions
- **Backend-heavy processing**: All aggregations server-side for scalability
- **D3 for calculations, React for DOM**: Optimal performance pattern
- **Polars lazy evaluation**: Handle large datasets efficiently
- **Progressive loading**: Support 16K+ features without performance degradation

## Development Commands

### Backend (✅ Ready)
```bash
cd backend

# Start development server
python start.py --reload --log-level debug

# Start on different port
python start.py --port 8001 --reload

# Run comprehensive API tests
python test_api.py

# Install dependencies
pip install -r requirements.txt
```

### Current Server Status
- **Running on**: http://127.0.0.1:8001
- **API Documentation**: http://127.0.0.1:8001/docs
- **Health Check**: http://127.0.0.1:8001/health
- **All tests passing**: ✅ 5/5 endpoints functional

### Frontend (🔜 To be implemented)
```bash
cd frontend && npm run dev               # Development server
npm run build && npm run test           # Build and test
```

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