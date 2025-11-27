# CLAUDE.md - SAE Feature Visualization Project

Professional guidance for working with the SAE Feature Visualization research prototype.

## Project Overview

**Purpose**: Research prototype for visualizing consistency between interpretability scoring methods for Sparse Autoencoder (SAE) features. Designed for EuroVIS conference demonstration.

**Status**: Conference-ready research prototype
**Dataset**: 16,000+ features with multiple LLM explainers and scorers
**Architecture**: Simplified backend (feature grouping + clustering) + smart frontend (tree building)

## Important Development Principles

### This is a Conference Prototype
- **Avoid over-engineering**: Prioritize working demonstrations over production-level architecture
- **Simple solutions first**: Use straightforward implementations suitable for research demonstrations
- **No premature optimization**: Focus on functionality and clarity over complex optimizations
- **Flexibility over robustness**: Easy modification for research exploration is more valuable than production hardening

### Code Quality Guidelines
1. **Clean up after modifications**: Always remove unused code, commented-out sections, and obsolete styles
2. **Analyze before adding**: Check existing code for similar functionality before implementing new features
3. **Reuse and modularize**: Extract common patterns into reusable functions/utilities when beneficial
4. **Keep it maintainable**: Code should be easy to understand and modify for research iterations

## Data Flow Architecture

### High-Level Data Flow
```
User Interaction → Frontend State Update → API Request → Backend Processing → Response → Frontend Tree Building → Visualization Update
```

### System Architecture
```
┌────────────────────────────────────────────────────────────────────────────┐
│                              USER INTERFACE                                │
│  Sankey Diagram │ Feature Split View │ Selection Panel │ Tag Workflow     │
└────────────────────────────────────────────────────────────────────────────┘
                                      ↕
┌────────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React + TypeScript)                      │
│                                                                            │
│  • Tree-Based Sankey Builder with Feature Group Cache                     │
│  • Set Intersection Algorithm for instant threshold updates               │
│  • Zustand State Management (modularized by feature)                      │
│  • D3.js Visualizations (Sankey, Histograms, Pair Viewer)                │
│  • 3-Stage Tag Workflow: Quality → Feature Splitting → Cause              │
│  • Commit History for tagging state snapshots                             │
└────────────────────────────────────────────────────────────────────────────┘
                                      ↕
                        POST /api/feature-groups
                        POST /api/cluster-candidates
                        POST /api/similarity-sort
                                      ↕
┌────────────────────────────────────────────────────────────────────────────┐
│                         BACKEND (FastAPI + Polars)                        │
│                                                                            │
│  • Feature Grouping Service (filter → group by thresholds)                │
│  • Hierarchical Clustering Service (decoder similarity)                   │
│  • Similarity Sort Service (pair scoring based on selections)             │
│  • Table Data Service (feature scores and metadata)                       │
└────────────────────────────────────────────────────────────────────────────┘
                                      ↕
┌────────────────────────────────────────────────────────────────────────────┐
│                              DATA STORAGE                                 │
│  • feature_analysis.parquet (16k+ features)                               │
│  • decoder_weights.npy (for clustering)                                   │
│  • Pre-computed statistics (JSON)                                         │
└────────────────────────────────────────────────────────────────────────────┘
```

## Core Architectural Principle: Simplicity + Performance

### The Key Innovation: Frontend Tree Building
```
Traditional Approach:
  Backend builds entire Sankey tree → Heavy computation → Slow threshold updates

Our Approach:
  Backend returns simple groups → Frontend builds tree → Instant threshold updates
```

### How It Works:

#### 1. Backend: Simple Feature Grouping
```python
Request: {filters: {...}, metric: "semdist_mean", thresholds: [0.3, 0.7]}
Response: {
  groups: [
    {group_index: 0, range_label: "< 0.30", feature_ids: [1,5,12,...], count: 245},
    {group_index: 1, range_label: "0.30-0.70", feature_ids: [2,8,15,...], count: 892},
    {group_index: 2, range_label: ">= 0.70", feature_ids: [3,9,18,...], count: 511}
  ]
}
```

#### 2. Frontend: Smart Tree Building
```typescript
// Cache feature groups globally
featureGroupCache["semdist_mean:0.3,0.7"] = response.groups

// Build Sankey tree using set intersection
function buildChildNodes(parent: SankeyTreeNode, groups: FeatureGroup[]) {
  for (const group of groups) {
    const childFeatures = intersection(parent.featureIds, group.feature_ids)
    if (childFeatures.size > 0) {
      createChildNode(parent, childFeatures, group.range_label)
    }
  }
}
// Result: Instant threshold updates without backend calls!
```

## Technology Stack

### Frontend
- **React 19** + **TypeScript 5.8**
- **Zustand** (modularized state management)
- **D3.js** (visualization suite)
- **Vite** (dev server)
- **Axios** (API client)

### Backend
- **FastAPI** (async web framework)
- **Polars** (data processing)
- **NumPy/SciPy** (clustering)
- **Uvicorn** (ASGI server)

### Data
- **Parquet** (columnar storage)
- **NPY** (decoder weights for clustering)
- **JSON** (statistics, metadata)
- **16k+ features** analyzed

## Project Structure

```
/home/dohyun/interface/
├── frontend/           # React application
│   ├── src/
│   │   ├── components/    # UI components
│   │   ├── lib/          # D3 utilities, helpers
│   │   ├── store/        # Zustand state (modularized)
│   │   ├── styles/       # CSS files
│   │   ├── types.ts      # TypeScript types
│   │   └── api.ts        # API client
│   └── CLAUDE.md         # Frontend docs
├── backend/            # FastAPI server
│   ├── app/
│   │   ├── api/          # Endpoints
│   │   ├── models/       # Pydantic schemas
│   │   └── services/     # Business logic
│   └── CLAUDE.md         # Backend docs
├── data/              # Data files
│   └── master/           # Parquet files, weights
└── CLAUDE.md          # This file
```

## Development Commands

### Quick Start
```bash
# Backend (port 8003)
cd backend
pip install -r requirements.txt
python start.py --reload --log-level debug

# Frontend (port 3003)
cd frontend
npm install
npm run dev -- --port 3003
```

### Current Active Servers
- **Backend**: http://localhost:8003 (API + Swagger docs)
- **Frontend**: http://localhost:3003 (React dev server)

## Key Features

### Visualization
- **Sankey Diagram**: Tree-based feature grouping with inline histograms
- **Feature Split View**: Pair similarity analysis with clustering
- **Selection Panel**: 4-category tagging (confirmed, expanded, rejected, unsure)
- **Tag Workflow**: 3-stage navigation (Quality → Feature Splitting → Cause)
- **Commit History**: Save and restore tagging state snapshots

### Feature Splitting Workflow
- **Hierarchical Clustering**: Backend clusters features by decoder weight similarity
- **Pair Generation**: All pairs within clusters available for analysis
- **Similarity Scoring**: Score pairs based on selected/rejected examples
- **Auto-Tagging**: Histogram-based threshold tagging with preview

### Performance
- **Feature Group Caching**: Instant threshold updates
- **Set Intersection**: Efficient tree building O(min(|A|,|B|))
- **Lazy Evaluation**: Polars query optimization
- **Memoization**: React.memo, useMemo, useCallback

## API Endpoints Summary

| Endpoint | Purpose |
|----------|---------|
| GET /api/filter-options | Filter choices |
| POST /api/feature-groups | Feature grouping by thresholds |
| POST /api/histogram-data | Histogram bins |
| POST /api/table-data | Feature scoring table |
| POST /api/cluster-candidates | Get all cluster pairs for features |
| POST /api/similarity-sort | Sort pairs by similarity to selections |
| POST /api/activation-examples | Activation data |

## Development Workflow

### Before Making Changes
1. **Search for existing patterns**: Use Grep/Glob to find similar implementations
2. **Check existing utilities**: Review lib/ and services/ directories first
3. **Understand the context**: Read related code to maintain consistency

### After Making Changes
1. **Remove dead code**: Delete unused functions, components, and imports
2. **Clean up styles**: Remove unused CSS classes
3. **Update types**: Ensure TypeScript definitions reflect changes
4. **Run linter**: `npm run lint` in frontend, check for errors

### Development Guidelines
1. **Type Safety**: Maintain TypeScript definitions in frontend
2. **State Management**: Use Zustand actions, not direct state updates
3. **API Changes**: Update both frontend api.ts and backend models
4. **Code Reuse**: Modularize common patterns

## Important Notes

### Data Dependencies
- **Master Data**: `/data/master/feature_analysis.parquet` (required)
- **Decoder Weights**: `/data/master/decoder_weights.npy` (for clustering)

### Common Tasks
```bash
# Check API health
curl http://localhost:8003/health

# View API docs
open http://localhost:8003/docs

# Run lint
cd frontend && npm run lint

# Type check
cd frontend && npx tsc --noEmit
```

---

## Remember

**This is a research prototype for conference demonstrations**

When working on this codebase:
- Prioritize simple, working solutions over production-level engineering
- Clean up unused code and styles after each modification
- Check existing code for reusable patterns before implementing new features
- Keep modifications focused on research demonstration needs
- Maintain code clarity for easy iteration and exploration

The goal is a flexible, maintainable research tool, not a production system.
