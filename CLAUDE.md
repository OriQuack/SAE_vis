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
│  Selection Panel │ Flow Overlay │ Cause View │ Summary View               │
└────────────────────────────────────────────────────────────────────────────┘
                                      ↕
┌────────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React + TypeScript)                      │
│                                                                            │
│  • Tree-Based Sankey Builder with Feature Group Cache                     │
│  • Set Intersection Algorithm for instant threshold updates               │
│  • Zustand State Management (modularized by feature)                      │
│  • D3.js Visualizations (Sankey, Histograms, Flow Overlay)               │
│  • 4-Stage Tag Workflow: Feature Splitting → Quality → Cause → Summary   │
│  • SVM-Based Similarity Scoring with Bimodality Detection                 │
│  • Query by Committee (QBC) for Active Learning (RF + MLP + SVM)          │
│  • Decision Flip Rate Tracking for Convergence Monitoring                 │
│  • RadViz Visualization for Multi-class Cause Analysis                    │
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
│  • Committee Service (QBC: Random Forest + MLP for active learning)       │
│  • Bimodality Service (Hartigan's Dip + GMM analysis)                     │
│  • Alignment Service (semantic phrase matching)                           │
│  • Consensus Service (HDBSCAN phrase clustering)                          │
│  • Activation Cache Service (pre-computed msgpack+gzip)                   │
│  • Table Data Service (feature scores and metadata)                       │
└────────────────────────────────────────────────────────────────────────────┘
                                      ↕
┌────────────────────────────────────────────────────────────────────────────┐
│                              DATA STORAGE                                 │
│  • features.parquet (16k+ features with nested structure)                 │
│  • activation_display.parquet (frontend-optimized)                        │
│  • interfeature_similarity.parquet (cross-feature analysis)               │
│  • explanation_alignment.parquet (cross-explainer phrase matching)        │
│  • explanation_consensus.parquet (HDBSCAN phrase clustering)              │
│  • svm_feature_metrics.parquet (pre-aggregated feature SVM metrics)       │
│  • svm_pair_metrics.parquet (pre-computed pair SVM metrics)               │
│  • clustering_linkage.npy (hierarchical clustering)                       │
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
│   │   ├── components/    # UI components (30 files)
│   │   ├── lib/          # D3 utilities, helpers (21 files + 10 tagging hooks)
│   │   ├── store/        # Zustand state (8 files)
│   │   ├── styles/       # CSS files (29 files)
│   │   ├── types.ts      # TypeScript types
│   │   └── api.ts        # API client
│   └── CLAUDE.md         # Frontend docs
├── backend/            # FastAPI server
│   ├── app/
│   │   ├── api/          # Endpoints (10 files)
│   │   ├── models/       # Pydantic schemas
│   │   └── services/     # Business logic (17 files)
│   └── CLAUDE.md         # Backend docs
├── data/              # Data files
│   ├── input/            # Raw input data (run configs, activation examples)
│   ├── output/           # Backend-required parquet files (8 files)
│   ├── pipeline/         # Refactored preprocessing pipeline (14 steps)
│   ├── diagnostics/      # Analysis and diagnostic scripts
│   ├── Thematic-LM/      # Thematic analysis (WWW '25 paper impl.)
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
- **Feature Split View**: Stage 1 - Pair similarity analysis with clustering
- **Quality View**: Stage 2 - Feature quality assessment
- **Cause View**: Stage 3 - Root cause analysis with RadViz scatter and decision margin histogram
- **RadViz Scatter**: Softmax-weighted positioning using SVM decision scores toward category anchors
- **Flow Overlay**: Visualizes flows from Sankey segments to SelectionBar
- **Selection Panel**: 4-category tagging (confirmed, expanded, rejected, unsure)
- **Tag Stage Panel**: 4-stage navigation (Feature Splitting → Quality → Cause → Summary)
- **StageAccordionList**: Bootstrap → Learn → Apply workflow with sorting controls
- **ConvergenceIndicator**: Decision Flip Rate sparkline with stacked category bars
- **Commit History**: Save and restore tagging state snapshots

### 4-Stage Tagging Workflow

| Stage | View | Mode | Items | Tags |
|-------|------|------|-------|------|
| 1. Feature Splitting | `FeatureSplitView` | `pair` | Feature pairs | Fragmented / Monosemantic |
| 2. Quality Assessment | `QualityView` | `feature` | Individual features | Well-Explained / Need Revision |
| 3. Root Cause Analysis | `CauseView` | `cause` | Individual features | Pattern Miss / Context Miss / Noisy Activation |
| 4. Summary | `RegenerationView` | summary | Overview | Manual vs Auto breakdown |

### Stage 3: Root Cause Analysis
- **RadViz Scatter**: Softmax-weighted 2D positioning using SVM decision scores toward 3 category anchors
- **Metrics Used**: intra_feature_sim, score_embedding, score_fuzz, score_detection, explanation_semantic_sim, frac_nonzero
- **Initial State**: All features start as "unsure" (no pre-assignment)
- **Manual Tagging**: User tags features into cause categories (Pattern Miss / Context Miss / Noisy Activation)
- **SVM Classification**: One-vs-Rest SVM predicts categories for untagged features
- **Query by Committee (QBC)**: RF + MLP models trained alongside SVM to detect disagreement cases
- **Decision Flip Rate**: Tracks prediction stability across tagging iterations (convergence indicator)
- **Decision Margin Histogram**: CauseMarginHistogram shows SVM confidence distribution with filtering support
- **Contour Visualization**: Shows category distributions on RadViz after classification
- **Bootstrap → Learn → Apply Workflow**: StageAccordionList guides users through active learning stages
- **Representative Sampling**: Diversity-based sampling for cold start initialization

### Stage 4: Summary
- **OverviewSummary**: Manual vs auto tagging breakdown per tag across all stages
- **SankeyDiagram**: Final flow visualization with all completed stages
- **Tag Statistics**: Counts of manually tagged vs auto-tagged items per category

### SVM-Based Similarity Scoring
Both Stage 1 (pairs) and Stage 2 (features) use the same SVM-based scoring mechanism:
1. **Manual Tagging**: User tags 3+ items as selected and 3+ as rejected
2. **SVM Training**: Backend trains SVM on manual selections
3. **Query by Committee**: RF + MLP trained alongside SVM to detect disagreement (outliers)
4. **Scoring**: All items scored by distance from decision boundary
5. **Histogram**: Scores displayed with bimodality detection
6. **Decision Flip Rate**: Tracks prediction changes across iterations for convergence
7. **Auto-Tagging**: Items beyond thresholds auto-tagged on "Apply Threshold"
8. **Commit History**: Each apply creates a restorable state snapshot

### Tag Selection Sources
Items can be tagged via three mechanisms (tracked in SelectionSource type):
- **clicked**: User manually clicked to tag the item
- **threshold**: Auto-tagged by applying threshold boundaries
- **predicted**: SVM prediction accepted during batch tagging

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
| POST /api/cause-classification | SVM cause classification (Stage 3) |
| POST /api/cold-start/representative | Get representative features for cold start |
| GET /api/consensus/{feature_id} | Get consensus phrases for a feature |
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
All backend-required files are in `/data/output/`:
- **Features**: `features.parquet` (main dataset, required)
- **Activation Display**: `activation_display.parquet` (frontend-optimized)
- **Interfeature Similarity**: `interfeature_similarity.parquet` (cross-feature analysis)
- **Explanation Alignment**: `explanation_alignment.parquet` (phrase matching)
- **Explanation Consensus**: `explanation_consensus.parquet` (HDBSCAN phrase clustering)
- **SVM Feature Metrics**: `svm_feature_metrics.parquet` (pre-aggregated for Stage 2/3)
- **SVM Pair Metrics**: `svm_pair_metrics.parquet` (pre-computed for Stage 1)
- **Clustering**: `clustering_linkage.npy` (hierarchical clustering)

### Thematic-LM (Separate Tool)
Implementation of the WWW '25 paper "Thematic-LM: A LLM-based Multi-agent System for Large-scale Thematic Analysis" for analyzing SAE feature explanations.
- **Location**: `/data/Thematic-LM/`
- **Usage**: `python thematic_coding.py --limit 5` (requires OPENAI_API_KEY)
- **Output**: `thematic_codes.parquet`, `codebook.json`
- See `data/Thematic-LM/CLAUDE.md` for full documentation

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
cd frontend && npm run typecheck
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
