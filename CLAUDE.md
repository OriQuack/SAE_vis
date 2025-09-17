# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a visualization interface project for EuroVIS conference submission focused on "Visualizing SAE feature explanation reliability." The project aims to build a full-stack application to visualize the consistency between different interpretability scoring methods for Sparse Autoencoder (SAE) features.

## Architecture

The project follows a three-tier architecture designed to handle scalability concerns for 16,000+ features:

```
[Frontend: React + D3.js]
    ↕ REST API (JSON)
[Backend: Python + FastAPI]
    ↕ Data processing
[Data Storage: Parquet files + Polars]
```

### Key Design Principles
- **Backend-heavy processing**: All data aggregation and filtering happens server-side
- **Lightweight frontend**: React receives pre-computed visualization structures (nodes/links), not raw feature data
- **Pre-computed metrics**: Critical metrics are calculated during data preparation, not on-demand

## Directory Structure

- `backend/` - FastAPI server (currently empty, needs implementation)
- `frontend/` - React + TypeScript + D3.js client (currently empty, needs implementation)
- `data/lex-llama-1000/` - Sample dataset with SAE feature data
  - `explanations/` - Feature explanation data
  - `scores/` - Scoring method results (fuzz, detection, simulation)
  - `run_config.json` - Configuration for data processing pipeline

## Development Plan (from LLM.md)

The project is planned in 4 sprints:

1. **Sprint 0**: Data preprocessing and basic FastAPI setup
2. **Sprint 1**: Static Sankey diagram with React + D3
3. **Sprint 2**: Dynamic main view with threshold controls
4. **Sprint 3**: Comparison view with alluvial diagrams
5. **Sprint 4**: Debug view and polish

## Key API Endpoints (Planned)

- `POST /api/sankey` - Generate Sankey diagram data based on filtering thresholds
- `POST /api/comparison` - Compare two configurations with alluvial diagrams
- `POST /api/features` - Get feature lists for specific categories
- `GET /api/feature/{feature_id}` - Get detailed data for single feature

## Data Schema (Planned)

Master Parquet file structure with pre-computed metrics:
- `feature_id` - Unique feature identifier
- `llm_source` - Source LLM (e.g., "gpt-4")
- `semantic_distance_avg` - Average semantic distance between explanations
- `score_avg_*` - Average scores for each scoring method
- `score_consistency_*` - Consistency metrics for each scoring method

## Technologies

- **Backend**: Python, FastAPI, Polars for data processing
- **Frontend**: React, TypeScript, D3.js for visualizations
- **Data**: Parquet files for efficient columnar data storage
- **Visualization**: Sankey and alluvial diagrams using d3-sankey

## Development Status & Architecture

### ✅ Current State (Completed)
- **Data preprocessing pipeline**: Fully implemented with 824 features processed
- **Detailed JSON generation**: Complete feature data available in `/data/detailed_json/`
- **Data schema**: Established with explanations, scores, semantic distances per feature

### 🏗️ Recommended Architecture

**Three-tier scalable design for 16K+ features:**
```
Frontend (React + TypeScript + D3.js)
    ↕ REST API (JSON with pre-computed aggregations)
Backend (Python + FastAPI + Polars)
    ↕ Lazy loading and filtering
Data Storage (Master Parquet + Index files)
```

### 📊 Core API Endpoints (Planned)
- `POST /api/sankey` - Generate Sankey diagram with configurable thresholds
- `POST /api/comparison` - Generate alluvial diagrams between two Sankey configurations
- `GET /api/feature/{feature_id}` - Detailed feature data for debug view
- `GET /api/filters` - Available filter options (SAE IDs, LLM models)

### 🎯 Development Sprints
1. **Sprint 0**: Master parquet creation + FastAPI setup + React foundation
2. **Sprint 1**: Single Sankey implementation with threshold controls
3. **Sprint 2**: Dual Sankey + alluvial comparison view
4. **Sprint 3**: Debug view with feature drilling and category management
5. **Sprint 4**: Performance optimization and polish

### 🔧 Key Technical Decisions
- **Backend-heavy processing**: All aggregations server-side for scalability
- **D3 for calculations, React for DOM**: Optimal performance pattern
- **Polars lazy evaluation**: Handle large datasets efficiently
- **Progressive loading**: Support 16K+ features without performance degradation

## Development Commands

Backend commands (to be established):
```bash
cd backend && uvicorn main:app --reload  # Development server
pytest tests/                            # Run API tests
```

Frontend commands (to be established):
```bash
cd frontend && npm run dev               # Development server
npm run build && npm run test           # Build and test
```