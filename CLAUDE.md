# CLAUDE.md - SAE Feature Visualization Project

Professional guidance for working with the SAE Feature Visualization research prototype.

## Project Overview

**Purpose**: Research prototype for visualizing consistency between interpretability scoring methods for Sparse Autoencoder (SAE) features. Designed for EuroVIS conference demonstration.

**Status**: Conference-ready research prototype
**Dataset**: 16,000+ features with multiple LLM explainers and scorers
**Architecture**: Simplified backend (feature grouping + clustering + similarity scoring) + smart frontend (tree building + interactive tagging)

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
│  Sankey Diagram │ Feature Split View │ Quality View │ Tag Stage Panel     │
│  Alluvial Diagram │ Selection Panel │ Flow Overlay │ Comparison View      │
└────────────────────────────────────────────────────────────────────────────┘
                                      ↕
┌────────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React + TypeScript)                      │
│                                                                            │
│  • Tree-Based Sankey Builder with Feature Group Cache                     │
│  • Set Intersection Algorithm for instant threshold updates               │
│  • Zustand State Management (modularized by feature)                      │
│  • D3.js Visualizations (Sankey, Histograms, Alluvial, Flow Overlay)     │
│  • 3-Stage Tag Workflow: Feature Splitting → Quality → Cause              │
│  • SVM-Based Similarity Scoring with Bimodality Detection                 │
│  • Commit History for tagging state snapshots                             │
└────────────────────────────────────────────────────────────────────────────┘
                                      ↕
                        POST /api/feature-groups
                        POST /api/cluster-candidates
                        POST /api/similarity-sort
                        POST /api/pair-similarity-sort
                        POST /api/similarity-score-histogram
                        POST /api/pair-similarity-score-histogram
                        POST /api/cause-similarity-sort
                                      ↕
┌────────────────────────────────────────────────────────────────────────────┐
│                         BACKEND (FastAPI + Polars)                        │
│                                                                            │
│  • Feature Grouping Service (filter → group by thresholds)                │
│  • Hierarchical Clustering Service (decoder similarity)                   │
│  • Similarity Sort Service (SVM-based scoring for features and pairs)     │
│  • Bimodality Service (Hartigan's Dip + GMM analysis)                     │
│  • Alignment Service (semantic phrase matching)                           │
│  • Activation Cache Service (pre-computed msgpack+gzip)                   │
│  • Table Data Service (feature scores and metadata)                       │
└────────────────────────────────────────────────────────────────────────────┘
                                      ↕
┌────────────────────────────────────────────────────────────────────────────┐
│                              DATA STORAGE                                 │
│  • features.parquet (16k+ features with nested structure)                 │
│  • activation_display.parquet (frontend-optimized)                        │
│  • activation_embeddings.parquet (pre-computed embeddings)                │
│  • explanation_alignment.parquet (cross-explainer phrase matching)        │
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
- **msgpack-lite** + **pako** (binary data handling)

### Backend
- **FastAPI** (async web framework)
- **Polars** (data processing)
- **NumPy/SciPy** (clustering, SVM)
- **scikit-learn** (SVM for similarity scoring)
- **Uvicorn** (ASGI server)

### Data
- **Parquet** (columnar storage)
- **NPY** (decoder weights for clustering)
- **JSON** (statistics, metadata)
- **MessagePack + gzip** (cached activation data)
- **16k+ features** analyzed

## Project Structure

```
/home/dohyun/interface/
├── frontend/           # React application
│   ├── src/
│   │   ├── components/    # UI components (26 files)
│   │   ├── lib/          # D3 utilities, helpers (19 files)
│   │   ├── store/        # Zustand state (8 files)
│   │   ├── styles/       # CSS files (23 files)
│   │   ├── types.ts      # TypeScript types
│   │   └── api.ts        # API client
│   └── CLAUDE.md         # Frontend docs
├── backend/            # FastAPI server
│   ├── app/
│   │   ├── api/          # Endpoints (11 files)
│   │   ├── models/       # Pydantic schemas
│   │   └── services/     # Business logic (11 files)
│   └── CLAUDE.md         # Backend docs
├── data/              # Data files
│   ├── master/           # Primary parquet files
│   ├── preprocessing/    # Processing scripts
│   └── CLAUDE.md         # Data docs
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
- **Sankey Diagram**: Tree-based feature grouping with inline histograms and hierarchical coloring
- **Alluvial Diagram**: Cross-explainer flow comparison (comparison overlay)
- **Feature Split View**: Stage 1 - Pair similarity analysis with clustering
- **Quality View**: Stage 2 - Feature quality assessment
- **Flow Overlay**: Visualizes flows from Sankey segments to SelectionBar
- **Selection Panel**: 4-category tagging (confirmed, expanded, rejected, unsure)
- **Tag Stage Panel**: 3-stage navigation (Feature Splitting → Quality → Cause)
- **Commit History**: Save and restore tagging state snapshots

### 3-Stage Tagging Workflow

| Stage | View | Mode | Items | Tags |
|-------|------|------|-------|------|
| 1. Feature Splitting | `FeatureSplitView` | `pair` | Feature pairs | Fragmented / Monosemantic |
| 2. Quality Assessment | `QualityView` | `feature` | Individual features | Well-Explained / Need Revision |
| 3. Root Cause Analysis | (coming soon) | `cause` | Individual features | TBD |

### SVM-Based Similarity Scoring
Both Stage 1 (pairs) and Stage 2 (features) use the same SVM-based scoring mechanism:
1. **Manual Tagging**: User tags 3+ items as selected and 3+ as rejected
2. **SVM Training**: Backend trains SVM on manual selections
3. **Scoring**: All items scored by distance from decision boundary
4. **Histogram**: Scores displayed with bimodality detection
5. **Auto-Tagging**: Items beyond thresholds auto-tagged on "Apply Threshold"
6. **Commit History**: Each apply creates a restorable state snapshot

### Performance
- **Feature Group Caching**: Instant threshold updates
- **Set Intersection**: Efficient tree building O(min(|A|,|B|))
- **Activation Cache**: Pre-computed msgpack+gzip (~15-25s vs ~100s)
- **Lazy Evaluation**: Polars query optimization
- **Memoization**: React.memo, useMemo, useCallback

## API Endpoints Summary

| Endpoint | Purpose |
|----------|---------|
| GET /api/filter-options | Filter choices |
| POST /api/feature-groups | Feature grouping by thresholds |
| POST /api/histogram-data | Histogram bins with threshold path filtering |
| POST /api/table-data | Feature scoring table |
| POST /api/cluster-candidates | Get cluster-based pairs for features |
| POST /api/segment-cluster-pairs | Get ALL cluster pairs (simplified flow) |
| POST /api/similarity-sort | Sort features by SVM similarity |
| POST /api/pair-similarity-sort | Sort pairs by SVM similarity |
| POST /api/similarity-score-histogram | Feature similarity histogram with bimodality |
| POST /api/pair-similarity-score-histogram | Pair similarity histogram with bimodality |
| POST /api/cause-similarity-sort | Multi-class cause sorting |
| POST /api/cause-similarity-score-histogram | Cause category histograms |
| POST /api/activation-examples | Activation data (on-demand) |
| GET /api/activation-examples-cached | Pre-computed activation blob |
| GET /health | Health check |

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
- **Master Data**: `/data/master/features.parquet` (required)
- **Activation Display**: `/data/master/activation_display.parquet` (frontend-optimized)
- **Activation Embeddings**: `/data/master/activation_embeddings.parquet` (similarity calculations)

### Logs
- **Backend Log**: `/home/dohyun/interface/backend.log` - All backend server output is logged here

### Common Tasks
```bash
# Check API health
curl http://localhost:8003/health

# View API docs
open http://localhost:8003/docs

# View backend logs
tail -f /home/dohyun/interface/backend.log

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
