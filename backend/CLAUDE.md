# Backend CLAUDE.md

This file provides comprehensive guidance to Claude Code when working with the FastAPI backend for the SAE Feature Visualization project.

## Project Status: ✅ SIMPLIFIED RESEARCH PROTOTYPE

Production-ready FastAPI backend with 8 operational endpoints, simplified feature grouping architecture, and ConsistencyService for pre-computed consistency scores. Supports 7 visualization types through simple feature grouping API: Sankey, Alluvial, Histogram, LLM Comparison, UMAP, TablePanel, and feature details. Phase 8 complete: Consistency scores integrated with feature grouping.

## Architecture Overview

### 🏗️ Simplified Architecture (✅ FULLY IMPLEMENTED)

```
┌─────────────────────────────────────────────────────────────────┐
│                     FastAPI Application Layer                   │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │   API Router    │ │  Exception      │ │   CORS &        │   │
│  │ (8 Endpoints)   │ │  Handling       │ │   Lifespan      │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                 ↕
┌─────────────────────────────────────────────────────────────────┐
│                     Service Layer                               │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │FeatureGroupSvc  │ │   Async Init    │ │   Filter Mgr    │   │
│  │ Simple Grouping │ │   & Cleanup     │ │   Validation    │   │
│  │ N→N+1 Branches  │ │   Management    │ │   String Cache  │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                 ↕
┌─────────────────────────────────────────────────────────────────┐
│                       Data Layer                                │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │ Master Parquet  │ │   Consistency   │ │  UMAP + LLM     │   │
│  │ 1,648 features  │ │   Scores        │ │  Comparison     │   │
│  │ feature_analysis│ │   Pre-computed  │ │  JSON Data      │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Technology Stack

### Core Dependencies (Production Versions)
```
FastAPI 0.104.1          # High-performance async web framework
Uvicorn 0.24.0          # ASGI server with hot reload support
Polars 0.19.19          # Lightning-fast columnar data processing
Pydantic 2.5.0          # Data validation and serialization
NumPy 1.25.2            # Numerical computing foundation
```

### Development & Testing
```
pytest 7.4.3            # Testing framework
pytest-asyncio 0.21.1   # Async test support
httpx 0.25.2            # HTTP client for testing
python-multipart 0.0.6  # Form data support
```

## Project Structure

```
backend/
├── app/
│   ├── main.py                    # 🚀 FastAPI application with lifespan management
│   ├── api/
│   │   ├── __init__.py           # 📡 API router aggregation
│   │   ├── filters.py            # ✅ GET /api/filter-options
│   │   ├── histogram.py          # ✅ POST /api/histogram-data
│   │   ├── feature_groups.py     # ✅ POST /api/feature-groups (PRIMARY ENDPOINT)
│   │   ├── comparison.py         # ✅ POST /api/comparison-data (Phase 2)
│   │   ├── llm_comparison.py     # ✅ POST /api/llm-comparison (Phase 5)
│   │   ├── umap.py               # ✅ POST /api/umap-data (Phase 6)
│   │   ├── table.py              # ✅ POST /api/table-data (Phase 7)
│   │   └── feature.py            # ✅ GET /api/feature/{id}
│   ├── models/                   # 📋 Pydantic model definitions
│   │   ├── requests.py           # Request schemas with validation
│   │   ├── responses.py          # Response schemas with type safety
│   │   └── common.py             # Shared models (Filters, etc.)
│   └── services/
│       ├── feature_group_service.py  # 🏭 Feature grouping by threshold ranges
│       ├── visualization_service.py  # 📊 Histogram and visualization data
│       ├── table_data_service.py     # 📊 Table data processing (Phase 7)
│       ├── consistency_service.py    # 📈 Consistency score calculations (Phase 8)
│       └── data_constants.py         # 📊 Data schema constants
├── docs/                         # 📚 API documentation
├── start.py                      # 🔧 Production startup script with CLI args
├── test_api.py                   # 🧪 Comprehensive API testing suite
├── requirements.txt              # 📦 Dependency specifications
└── README.md                     # 📖 Complete API documentation
```

## Development Commands

### Quick Start (Development)
```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Start with auto-reload and debug logging (default port 8003)
python start.py --reload --log-level debug

# Start on custom port with specific logging
python start.py --port 8001 --reload --log-level info
```

### Production Deployment
```bash
# Production mode (all interfaces, no reload)
python start.py --host 0.0.0.0 --port 8000

# Multi-worker production (external ASGI server)
uvicorn app.main:app --workers 4 --host 0.0.0.0 --port 8000
```

### Testing & Validation
```bash
# Run comprehensive API tests
python test_api.py

# Test specific port
python test_api.py --port 8003

# Manual health check
curl http://localhost:8003/health
```

## API Endpoints (✅ ALL IMPLEMENTED & TESTED)

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

### 📊 LLM Comparison Endpoint (Phase 5 - IMPLEMENTED)

**Endpoint**: `POST /api/llm-comparison`
**Purpose**: Serves pre-calculated LLM consistency statistics for visualization
**Status**: ✅ Fully Implemented (October 2025)

**Implementation Details:**
```python
# Location: app/api/llm_comparison.py
@router.post("/llm-comparison", response_model=LLMComparisonResponse)
async def get_llm_comparison(request: LLMComparisonRequest):
    """
    Returns pre-calculated consistency scores for:
    - Explainer consistency: cosine similarity between explanation embeddings
    - Scorer consistency: RV coefficient between scoring vectors
    """
```

**Data Source:**
- **Location**: `/data/llm_comparison/llm_comparison_stats.json`
- **Format**: Pre-calculated JSON file with consistency scores
- **Loading**: Global cache loaded once at startup
- **Statistics**: Explainer consistency (cosine similarity) and scorer consistency (RV coefficient)

**Response Structure:**
```json
{
  "explainers": [
    {"id": "hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4", "name": "Llama"},
    {"id": "Qwen/Qwen3-30B-A3B-Instruct-2507-FP8", "name": "Qwen"},
    {"id": "openai/gpt-oss-20b", "name": "OpenAI"}
  ],
  "scorersForExplainer1": [...],  // 3 scorers for each explainer
  "scorersForExplainer2": [...],
  "scorersForExplainer3": [...],
  "explainerConsistencies": {
    "left-1": {"value": 0.85, "method": "cosine_similarity"},
    "left-3": {"value": 0.92, "method": "cosine_similarity"},
    "left-4": {"value": 0.88, "method": "cosine_similarity"}
  },
  "scorerConsistencies": {
    "top-right-1": {"value": 0.75, "method": "rv_coefficient"},
    "top-right-3": {"value": 0.82, "method": "rv_coefficient"},
    // ... 9 total scorer consistency scores
  }
}
```

**Key Features:**
- **Static Data Serving**: Pre-calculated statistics for fast response times
- **Triangle Cell Mapping**: Maps consistency scores to specific triangle cells in frontend visualization
- **Model Identification**: Uses actual filter values from master parquet (llm_explainer, llm_scorer)
- **Error Handling**: Proper 404 handling if stats file missing, 500 for unexpected errors
- **Performance**: Sub-10ms response time (cached data)

**Frontend Integration:**
- Powers `LLMComparisonSelection.tsx` component
- Visualizes consistency with green→yellow→red color gradient
- Diamond cells show consistency scores, triangle cells show model names
- Used for analyzing LLM explainer/scorer agreement patterns

**Current Limitations:**
- Serves global statistics (filter parameters not yet applied to LLM comparison)
- Requires pre-calculated statistics file (not real-time computation)
- Future enhancement: Real-time correlation calculation based on filter selection

**Data Source Requirements:**
- **Location**: `/data/llm_comparison/llm_comparison_stats.json`
- **Format**: JSON file with pre-calculated explainer/scorer consistency scores
- **Statistics**: Explainer consistency (cosine similarity), Scorer consistency (RV coefficient)

### 📊 UMAP Endpoint (Phase 6)
**Endpoint**: `POST /api/umap-data`
**Purpose**: UMAP projections with hierarchical clustering
**Status**: ✅ ~20ms (cached JSON)

**Key Features:**
- Feature and explanation UMAP projections
- Multi-level hierarchical clustering
- Cross-reference between features and explanations
- Pre-calculated data for fast response

**Data Sources:**
- `/data/umap_feature/.../umap_embeddings.json`
- `/data/umap_explanations/explanation_umap.json`
- `/data/umap_clustering/` hierarchy files

### 📊 Table Data Endpoint (Phase 7 - NEW)
**Endpoint**: `POST /api/table-data`
**Purpose**: Feature-level scoring table with consistency analysis
**Status**: ✅ Fully Implemented (Current)

**Implementation:**
```python
# Location: app/api/table.py
@router.post("/table-data", response_model=FeatureTableDataResponse)
async def get_table_data(request: TableDataRequest):
    """
    Returns 824 rows (one per feature) with:
    - All scores per explainer (embedding, fuzz, detection)
    - Consistency scores (LLM Scorer, Within-exp, Cross-exp, LLM Explainer)
    - Global min/max for normalization
    """
```

**Service Layer:**
```python
# Location: app/services/table_data_service.py
class TableDataService:
    """
    Processes feature-level scoring data with consistency calculations.

    Key Methods:
    - get_table_data(): Main entry point
    - _calculate_consistency_scores(): Compute all consistency types
    - _calculate_llm_scorer_consistency(): Scorer-level consistency
    - _calculate_within_explanation_score(): Metric-level consistency
    - _calculate_cross_explanation_score(): Cross-explainer consistency
    - _calculate_llm_explainer_consistency(): Explainer-level consistency
    """
```

**Response Structure:**
```json
{
  "features": [
    {
      "feature_id": 0,
      "scores": {
        "explainer_1": {
          "embedding": 0.85,
          "fuzz": {"scorer_1": 0.75, "scorer_2": 0.80, "scorer_3": 0.78},
          "detection": {"scorer_1": 0.65, "scorer_2": 0.70, "scorer_3": 0.68}
        }
      },
      "consistency": {
        "llm_scorer_consistency": {"explainer_1": {"fuzz": 0.92, "detection": 0.88}},
        "within_explanation_score": {"explainer_1": 0.85},
        "cross_explanation_score": {"embedding": 0.90, "fuzz": 0.87, "detection": 0.83},
        "llm_explainer_consistency": 0.88
      }
    }
  ],
  "explainer_ids": ["explainer_1", "explainer_2", "explainer_3"],
  "scorer_ids": ["scorer_1", "scorer_2", "scorer_3"],
  "is_averaged": false,
  "global_min": 0.0,
  "global_max": 1.0
}
```

**Consistency Types:**
1. **LLM Scorer Consistency**: Variance across scorers for same explainer+metric
2. **Within-explanation Score**: Variance across metrics within same explainer
3. **Cross-explanation Score**: Variance across explainers for same metric
4. **LLM Explainer Consistency**: Variance across explainers (requires multiple explainers)

**Key Features:**
- **Feature-Level Scoring**: 824 rows with all explainer × metric × scorer combinations
- **Real-time Consistency**: Calculates 4 types of consistency scores
- **Filtered Data**: Respects selected LLM explainers and scorers
- **Global Normalization**: Includes min/max for client-side color scaling
- **Averaged Mode**: Option to average scores across scorers
- **Performance**: ~300-500ms for full table with consistency calculations

**Frontend Integration:**
- Powers `TablePanel.tsx` with 824 rows
- Enables drag-to-select cell groups
- Supports 5 consistency visualization modes
- Real-time color gradient (green→yellow→red)

**Implementation Notes:**
- Uses Polars for efficient data aggregation
- Calculates consistency as (1 - coefficient_of_variation)
- Handles missing values and edge cases
- Returns structured error responses for invalid filters

### 📈 Consistency Service (Phase 8 - NEW)

**Purpose**: Centralized consistency score calculations for both real-time and pre-computed use cases

**Location**: `app/services/consistency_service.py` (1,174 lines)

**Key Features:**
- **Pre-computed Score Support**: Loads consistency_scores.parquet with 8 pre-computed metrics
- **Dynamic Calculation**: Falls back to real-time calculation when pre-computed data unavailable
- **Multiple Consistency Methods**:
  - Standard deviation-based consistency: `1 - (std / max_std_actual)`
  - Z-score normalization for cross-metric comparison
  - Semantic similarity aggregation for explainer consistency
- **Stateless Architecture**: All methods are static for pure functional calculations

**Consistency Types:**
1. **LLM Scorer Consistency** (fuzz, detection):
   - Measures consistency across different scorers for same explainer+metric
   - Formula: `1 - (std / max_std_actual)`
   - Separate calculations for fuzz and detection metrics

2. **Within-Explanation Metric Consistency**:
   - Measures consistency across metrics (embedding, fuzz, detection) within same explainer
   - Uses z-score normalization to account for different metric scales
   - Formula: `1 - (std_z_score / max_std_z_score)`

3. **Cross-Explanation Metric Consistency** (embedding, fuzz, detection):
   - Measures consistency of each metric across different explainers
   - Separate scores for embedding, fuzz, and detection
   - Formula: `1 - (std / max_std_actual)`

4. **Cross-Explanation Overall Score Consistency**:
   - Measures overall score consistency across explainers
   - Overall score = avg(z_score(embedding), z_score(avg(fuzz)), z_score(avg(detection)))
   - Formula: `1 - (std / max_std_actual)`

5. **LLM Explainer Consistency**:
   - Semantic similarity between explanations from different LLMs
   - Uses average pairwise cosine similarity from pairwise parquet
   - Formula: `avg_pairwise_cosine_similarity`

**Data Sources:**
- **Pre-computed**: `/data/master/consistency_scores.parquet` (2,471 rows)
- **Pairwise Similarity**: `/data/master/semantic_similarity_pairwise.parquet` (2,470 rows)
- **Feature Analysis**: `/data/master/feature_analysis.parquet` (for dynamic calculation)

**Key Methods:**
```python
class ConsistencyService:
    # Std-based consistency (main method)
    compute_std_consistency(scores, max_std) -> ConsistencyScore

    # Z-score normalization for within-explanation
    compute_normalized_std_consistency(values, global_stats, max_std) -> ConsistencyScore

    # Semantic similarity for explainer consistency
    compute_semantic_similarity_consistency(feature_id, explainers, pairwise_df) -> ConsistencyScore

    # Batch calculation for all consistency types
    calculate_all_consistency(df, explainer_ids, feature_ids, pairwise_df) -> DataFrame

    # Dynamic max_std computation
    compute_max_stds(df, explainer_ids, global_stats) -> Dict[str, float]

    # Cross-explainer consistency for all metrics
    compute_cross_explainer_consistency_all_metrics(...) -> Dict[int, Dict[str, ConsistencyScore]]
```

**Performance Characteristics:**
- **Pre-computed Mode**: Sub-10ms lookups from parquet
- **Dynamic Mode**: ~100-200ms for batch calculation (all consistency types)
- **Memory Efficient**: Uses Polars lazy evaluation
- **Scalable**: Handles 2,471 rows × 8 consistency metrics efficiently

**Integration Points:**
- **Sankey Visualization**: Consistency scores used for percentile-based classification stage
- **TablePanel**: Consistency overlay modes for feature-level analysis
- **Future**: Cross-visualization consistency filtering and highlighting

## Data Service Architecture

### 🏭 DataService Class Features

#### Initialization & Lifecycle
```python
# Async initialization with proper error handling
await data_service.initialize()

# Automatic data file validation
check_data_files()  # Built into start.py

# Graceful cleanup on shutdown
await data_service.cleanup()
```

#### Performance Optimizations
- **Lazy Frame Evaluation**: Queries planned before execution
- **String Cache Enabled**: Categorical data optimized
- **Filter Option Caching**: Pre-computed unique values
- **Async Operations**: Non-blocking I/O throughout
- **Memory Efficient**: Large datasets handled without loading full data

#### Data Processing Pipeline

**Feature Grouping Logic (Simplified)**
```
User Request: { filters, metric, thresholds: [0.3, 0.7] }
         ↓
Apply Filters: Filter features by sae_id, llm_explainer, etc.
         ↓
Group by Thresholds: N thresholds → N+1 groups
         ├── Group 0: metric < 0.3
         ├── Group 1: 0.3 ≤ metric < 0.7
         └── Group 2: metric ≥ 0.7
         ↓
Return Feature IDs: { groups: [{group_index, range_label, feature_ids, count}] }
```

**Key Features:**
- **Simple Grouping**: N thresholds always create N+1 groups
- **Range Labels**: Auto-generated (e.g., "< 0.30", "0.30 - 0.70", ">= 0.70")
- **Stateless**: No classification state, just filter + group + return
- **Consistency Support**: Works with both standard and consistency metrics

## Request/Response Architecture

### Type-Safe Request Models
```python
# Example: Sankey data request with full validation
@app.post("/api/sankey-data")
async def generate_sankey_data(request: SankeyDataRequest):
    # Automatic validation via Pydantic
    # Type hints ensure IDE support
    # Error handling with custom codes
```

### Consistent Error Responses
```json
{
  "error": {
    "code": "INVALID_FILTERS",
    "message": "One or more filter values are invalid",
    "details": {
      "sae_id": ["unknown_sae_id_value"]
    }
  }
}
```

### Error Code Catalog
- `INVALID_FILTERS` - Filter validation failed
- `INVALID_THRESHOLDS` - Threshold values out of range
- `INSUFFICIENT_DATA` - No features match criteria
- `FEATURE_NOT_FOUND` - Requested feature doesn't exist
- `SERVICE_UNAVAILABLE` - Data service not ready
- `INTERNAL_ERROR` - Unexpected server error

## CORS & Frontend Integration

### Multi-Port Frontend Support
```python
allow_origins=[
    "http://localhost:3000",   # React dev server default
    "http://localhost:3003",   # Current frontend port
    "http://localhost:3004",   # Frontend fallback port
    "http://localhost:5173",   # Vite default port
    "http://127.0.0.1:3000",   # IPv4 localhost variants
    "http://127.0.0.1:3003",
    "http://127.0.0.1:3004",
    "http://127.0.0.1:5173"
]
```

## Production Features

### 🚀 Advanced FastAPI Features
- **Lifespan Management**: Proper startup/shutdown hooks
- **Exception Handling**: Global error handlers with structured responses
- **Automatic Documentation**: OpenAPI 3.0 with interactive Swagger UI
- **Request Validation**: Pydantic models with detailed error messages
- **Logging Integration**: Structured logging with configurable levels

### 🔧 Startup Script (start.py)
- **CLI Argument Parsing**: Flexible host/port/logging configuration
- **Data File Validation**: Pre-startup data availability checks
- **Interactive Prompts**: Graceful handling of missing data files
- **Environment Detection**: Development vs production mode handling

### 🧪 Comprehensive Testing (test_api.py)
- **APITester Class**: Systematic endpoint validation
- **Health Monitoring**: Service availability verification
- **Data Pipeline Testing**: End-to-end request/response validation
- **Error Scenario Coverage**: Invalid inputs and edge cases

## Data Requirements & Schema

### Master Parquet File
- **Location**: `/data/master/feature_analysis.parquet`
- **Schema**: 2,471 rows covering 1,000 unique features with multiple LLM explainers
- **Columns**: feature_id, sae_id, explanation_method, llm_explainer, llm_scorer, feature_splitting, semdist_mean, score_fuzz, score_simulation, score_detection, score_embedding, details_path

### Detailed JSON Files
- **Location**: `/data/detailed_json/`
- **Format**: Individual feature files referenced by `details_path`
- **Content**: Complete feature analysis data for debug view
- **Dataset**: 1,000 feature files with comprehensive analysis data

### LLM Comparison Statistics
- **Location**: `/data/llm_comparison/llm_comparison_stats.json`
- **Purpose**: Pre-calculated consistency scores for LLM comparison visualization
- **Content**: Explainer consistency (cosine similarity) and scorer consistency (RV coefficient)

## Performance Characteristics

### Current Deployment Status
- **Dataset Size**: 2,471 rows (1,000 unique features × ~2.5 avg LLM explainers)
- **Response Times**: Sub-second for all endpoints (20-30% faster with ParentPath optimizations)
- **Memory Usage**: Efficient lazy loading with ~50% reduction in temporary allocations
- **Scalability**: Designed for 16K+ features with optimized filtering
- **Concurrency**: Async/await throughout for high throughput
- **Frontend Support**: Powers Sankey, Alluvial, Histogram, and LLM Comparison visualizations

### Performance Metrics (Optimized - January 2025)
```
Filter Options:     ~50ms    (cached)
Histogram Data:     ~150ms   (with 20 bins, path-based filtering)
Sankey Generation:  ~220ms   (full pipeline, 20-30% faster)
Feature Details:    ~10ms    (direct lookup)
Health Check:       ~5ms     (service status)
```

## Development Guidelines

### Code Quality Standards
1. **Type Safety**: All functions have complete type hints
2. **Async Patterns**: Proper async/await usage throughout
3. **Error Handling**: Comprehensive exception handling with user-friendly messages
4. **Documentation**: Docstrings for all public methods and classes
5. **Testing**: New endpoints require test coverage in test_api.py

### Adding New Endpoints
1. Create endpoint module in `app/api/endpoints/`
2. Define request/response models in `app/models/`
3. Add router import to `app/api/__init__.py`
4. Add test cases to `test_api.py`
5. Update API documentation

### Database Migration Path
For future scaling beyond Parquet:
- Index on filter columns (sae_id, explanation_method, etc.)
- Index on feature_id for direct lookups
- Consider partitioning by sae_id for large datasets
- Maintain Polars compatibility for existing queries

## Current Server Status

### 🟢 Production Deployments
- **Primary**: Port 8003 (matches frontend expectations)
- **Secondary**: Port 8001 (development/testing)
- **Status**: Multiple servers running simultaneously with active API traffic
- **Health**: All endpoints operational and tested with sub-second response times
- **Performance**: Handling hundreds of concurrent API requests

### 🔍 Monitoring & Observability
- **Health Endpoint**: `/health` shows data service connectivity and master file status
- **Structured Logging**: Configurable levels (debug/info/warning/error) with detailed classification logs
- **Error Tracking**: Full stack traces for debugging with structured error responses
- **Request Logging**: Automatic access log generation with API endpoint performance metrics
- **Feature Classification Logging**: Detailed logs for flexible threshold tree V2 processing and feature distribution changes
- **Performance Tracking**: ParentPath optimization metrics in debug logs (node lookups, filtering strategies)

## Advanced Implementation Details

### 🏭 Feature Grouping Service (Simplified Architecture)

The backend implements a **simple feature grouping service** for stateless operation:

#### Core Components:
- **ClassificationEngine** (`feature_classifier.py`): Main classification orchestrator
  - `classify_features()`: Complete feature classification using threshold tree
  - `filter_features_for_node()`: Node-specific feature filtering for histograms
  - `build_sankey_data()`: Sankey diagram data generation
- **SplitEvaluator** (`rule_evaluators.py`): Split rule evaluation
  - `evaluate_range_split()`: Range-based splits (N thresholds → N+1 branches)
  - `evaluate_pattern_split()`: Pattern-based splits (multi-metric conditions)
  - `evaluate_expression_split()`: Expression-based splits (logical conditions)
- **NodeDisplayNameGenerator** (`node_labeler.py`): Generates human-readable display names for Sankey nodes
- **Dynamic Tree Support**: Runtime stage creation/removal through threshold tree structure

#### Flexible Split Rule Types (New in V2):

**1. Range Rules (Single metric, multiple thresholds)**
```python
RangeSplitRule(
    type="range",
    metric="semdist_mean",
    thresholds=[0.1, 0.3, 0.6]  # Creates 4 branches automatically
)
```
- **Use Case**: Traditional threshold-based splitting
- **Flexibility**: N thresholds create N+1 branches automatically
- **Research Value**: Easy to modify thresholds for different experimental conditions

**2. Pattern Rules (Multi-metric pattern matching)**
```python
PatternSplitRule(
    type="pattern",
    conditions={
        "score_fuzz": PatternCondition(threshold=0.8),
        "score_simulation": PatternCondition(threshold=0.7),
        "score_detection": PatternCondition(threshold=0.8)
    },
    patterns=[
        Pattern(match={"score_fuzz": "high", "score_simulation": "high", "score_detection": "high"},
               child_id="all_high"),
        Pattern(match={"score_fuzz": "high", "score_simulation": "high"},
               child_id="two_high"),
        # ... configurable patterns for any number of metrics
    ]
)
```
- **Use Case**: Complex multi-metric conditions (replaces hardcoded "2 of 3 high" logic)
- **Flexibility**: Support any number of metrics and conditions
- **Research Value**: Create custom agreement patterns for different research scenarios

**3. Expression Rules (Logical expressions)**
```python
ExpressionSplitRule(
    type="expression",
    available_metrics=["score_fuzz", "score_simulation", "score_detection"],
    branches=[
        ExpressionBranch(
            condition="(score_fuzz > 0.8 && score_simulation > 0.7) || score_detection > 0.9",
            child_id="high_confidence"
        )
    ],
    default_child_id="low_confidence"
)
```
- **Use Case**: Advanced research scenarios with complex logical conditions
- **Flexibility**: Unlimited logical complexity
- **Research Value**: Express sophisticated research hypotheses as classification rules

#### Threshold Tree Structure V2:
```python
class ThresholdStructure(BaseModel):
    nodes: List[SankeyThreshold]  # All nodes with embedded split rules
    metrics: List[str]           # Available metrics

class SankeyThreshold(BaseModel):
    id: str                      # Node identifier
    stage: int                   # Stage in pipeline (configurable order)
    category: CategoryType       # Visualization category
    parent_path: List[ParentPathInfo]  # Complete path from root
    split_rule: Optional[SplitRule]    # Embedded split configuration
    children_ids: List[str]      # Child node references
```

#### Research-Oriented Implementation:

**Configurable Classification Pipeline**
```
Raw Features → Stage 1 (Configurable) → Stage 2 (Configurable) → ... → Stage N (Configurable) → Final Sankey Nodes

Example Current Configuration:
Raw Features → Feature Splitting (Range) → Semantic Distance (Range) → Score Agreement (Pattern) → Final Nodes

Example Alternative Configuration:
Raw Features → Score Agreement (Pattern) → Feature Splitting (Range) → Semantic Distance (Range) → Final Nodes

Note: Stage order is configurable through threshold tree structure - no code changes required
```

**Conference Demonstration Features:**
- **Real-time Reconfiguration**: Modify classification logic during presentations
- **Research Scenario Testing**: Switch between different research hypotheses instantly
- **Flexible Metrics**: Add/remove scoring methods through configuration
- **Maintainable**: Avoid over-engineering while supporting complex research needs


### 🔧 Service Architecture

#### Core Components
1. **DataService** (`visualization_service.py`): Research-optimized visualization data provider
   - Orchestrates histogram, Sankey, and Alluvial data generation
   - Handles filter caching and data lifecycle management
   - Integrates with ClassificationEngine for feature classification

2. **ClassificationEngine** (`feature_classifier.py`): Feature classification orchestrator
   - Configurable feature classification algorithms supporting all split rule types (Range, Pattern, Expression)
   - Dynamic threshold tree V2 processing and validation
   - Flexible Sankey diagram data structure building

3. **SplitEvaluator** (`rule_evaluators.py`): Rule evaluation engine
   - Evaluates range, pattern, and expression split rules
   - Returns child node selection and branch metadata

4. **NodeDisplayNameGenerator** (`node_labeler.py`): Display name generator
   - Generates human-readable labels for Sankey nodes
   - Supports dynamic and legacy naming patterns

#### Advanced Features
- **Lazy DataFrame Operations**: All operations use Polars LazyFrame for memory efficiency
- **String Cache Optimization**: Categorical data operations optimized with string cache
- **Flexible Split Rule Processing**: Dynamic handling of Range, Pattern, and Expression rules
- **Parent Path Tracking**: Complete path information from root to any node in threshold tree V2
- **Classification State Logging**: Detailed logs of feature distribution changes at each configurable stage
- **Error Context Preservation**: Comprehensive error handling with context information for research scenarios

### 📊 Performance Optimizations (✅ FULLY OPTIMIZED)

#### Memory Efficiency
- **Lazy Evaluation**: Queries planned and optimized before execution
- **Columnar Processing**: Polars columnar operations for vectorized computations
- **Selective Column Loading**: Only required columns loaded for each operation
- **Temporary Column Cleanup**: Intermediate classification columns dropped after use

#### ParentPath-Based Optimizations (NEW - January 2025)
The backend now fully leverages the `ParentPathInfo` structure for maximum performance:

**1. Node Lookup Caching** (`threshold.py:336-394`)
- **O(1) Node Access**: `_nodes_by_id` and `_nodes_by_stage` dictionaries cached in `ThresholdStructure`
- **Helper Methods**: `get_node_by_id()`, `get_children()`, `get_ancestors()`, `get_nodes_at_stage()`
- **Automatic Cache Building**: Caches built on initialization and reused throughout lifecycle
- **Eliminated Redundancy**: No more repeated dictionary rebuilding in hot paths

**2. Path Constraint Extraction** (`threshold.py:417-450`)
- **Direct Filtering**: `get_path_constraints()` extracts filtering logic from `parent_path`
- **Metric Constraints**: Extracts metric names, thresholds, and branch indices
- **Triggering Values**: Optional inclusion of actual metric values that triggered each branch
- **Use Case**: Enables filtering without full classification for leaf nodes

**3. Optimized Node Filtering** (`feature_classifier.py:409-532`)
The `filter_features_for_node()` method now uses two strategies based on node type:

**For Leaf Nodes** (`_filter_by_path_constraints`):
- Applies range filters directly from `parent_path` without classifying all features
- Example: For a node at stage 3, applies 3 sequential range filters based on parent path
- **Performance Gain**: Avoids classifying 1,648 features just to filter for one node
- **Complexity**: O(n × stages) instead of O(n × full_tree_depth × evaluations)

**For Intermediate Nodes** (`_filter_by_targeted_classification`):
- Performs classification but stops at target stage (early termination)
- Uses cached `get_node_by_id()` instead of rebuilding node dictionary
- Example: For stage 2 node, stops classification at stage 2 instead of going to stage 3
- **Performance Gain**: Reduces unnecessary split evaluations and tree traversal

**4. Classification Engine Optimization** (`feature_classifier.py:70-74`)
- `classify_features()` uses cached `_nodes_by_id` from `ThresholdStructure`
- Passes cached dictionary to `_classify_features_batch()` and `_classify_single_feature()`
- Eliminates redundant dictionary building on every classification call

**Performance Impact:**
- **Node Lookups**: O(1) instead of O(n) linear search
- **Memory**: ~50% reduction in temporary allocations for large datasets
- **Leaf Node Filtering**: 3-5x faster by avoiding full classification
- **Intermediate Node Filtering**: 2-3x faster with early termination
- **Overall Sankey Generation**: 20-30% faster for typical threshold trees

#### Query Optimization
- **Filter Pushdown**: Filters applied at the LazyFrame level for early elimination
- **Aggregation Optimization**: Group-by operations optimized for categorical data
- **Index Utilization**: String cache enables efficient categorical operations
- **Batch Processing**: Multiple histogram requests processed in batches

### 🏗️ Modular Service Architecture

#### Service Layer Architecture
```
API Endpoints → DataService (visualization_service.py)
                    ↓
                ClassificationEngine (feature_classifier.py)
                    ↓
                SplitEvaluator (rule_evaluators.py)
                    ↓
                NodeDisplayNameGenerator (node_labeler.py)
```

- **Endpoint Layer**: Request validation, response formatting, error handling
- **Service Layer**: DataService orchestrates visualization data generation
- **Classification Layer**: ClassificationEngine handles feature classification
- **Evaluation Layer**: SplitEvaluator evaluates split rules
- **Presentation Layer**: NodeDisplayNameGenerator formats node labels
- **Data Layer**: Polars operations, file I/O, caching

#### Key Design Patterns
- **Dependency Injection**: DataService injected into endpoints via FastAPI dependencies
- **Factory Pattern**: DataService methods construct complex data structures
- **Strategy Pattern**: Different threshold application strategies
- **Observer Pattern**: Logging and monitoring throughout classification pipeline

## Integration Points

### Frontend Compatibility
- **API Base URL**: Configurable via environment variables
- **CORS Headers**: Pre-configured for all common development ports
- **Error Responses**: Structured format matching frontend expectations
- **Data Format**: JSON responses optimized for React/D3.js consumption

### Data Pipeline Integration
- **Parquet Files**: Direct integration with preprocessing pipeline
- **JSON Details**: Linked detailed data for feature drilling
- **Metadata Files**: Schema validation and documentation
- **File Validation**: Startup checks for data availability

## Future Enhancement Roadmap

### ✅ Completed Features (October 2025)
- ✅ **V2 Classification Engine**: Modular classification with split evaluators
- ✅ **Dynamic Tree Support**: Runtime stage creation/removal
- ✅ **Comparison Endpoint**: Alluvial flow data generation (Phase 2)
- ✅ **LLM Comparison Endpoint**: Pre-calculated consistency statistics (Phase 5)
- ✅ **Threshold Features Endpoint**: Feature ID filtering for histogram panel (Phase 4)
- ✅ **TablePanel Endpoint**: Feature-level scoring table with consistency analysis (Phase 7)
- ✅ **Consistency Service**: Comprehensive consistency score calculations (Phase 8)
- ✅ **Pre-computed Consistency**: consistency_scores.parquet with 8 metrics for performance
- ✅ **Node Filtering**: Histogram data filtered by node path
- ✅ **ParentPath Optimizations**: O(1) node lookups, path-based filtering, early termination
- ✅ **Performance Validated**: 20-30% faster Sankey generation, 3-5x faster leaf filtering

### 📝 Future Enhancements
- **Consistency Stage**: Complete integration of consistency-based Sankey classification
- **Dynamic Consistency**: Real-time consistency calculation for custom filter combinations
- Redis caching for frequent queries
- Database backend for larger datasets
- API key authentication
- Enhanced monitoring and metrics

## Critical Notes for Development

1. **Data Dependencies**:
   - Master parquet: `/data/master/feature_analysis.parquet` (1,648 features)
   - Consistency scores: `/data/master/consistency_scores.parquet` (2,471 rows, 8 metrics)
   - Pairwise similarity: `/data/master/semantic_similarity_pairwise.parquet` (2,470 rows)
   - LLM stats: `/data/llm_comparison/llm_comparison_stats.json`
   - UMAP files: `/data/umap_feature/`, `/data/umap_explanations/`, `/data/umap_clustering/`
2. **Port Configuration**: Default 8003 (matches frontend)
3. **Testing**: Run `python test_api.py` after changes
4. **Current Branch**: `add_cons_stage` (Phase 8 development)

The backend represents a research prototype implementation with flexible, configurable architecture, reliable error handling, and demonstration optimizations suitable for academic conference presentations and SAE research scenarios.

**Key Implementation Features:**
- **V2 Classification Engine**: Modular classification with `ClassificationEngine` and `SplitEvaluator`
- **Dynamic Tree Support**: Runtime stage creation/removal through threshold tree structure
- **Three Split Rule Types**: Range, pattern, and expression-based splitting
- **Production-Ready**: Comprehensive error handling and logging
- **Research Flexibility**: Support diverse research scenarios through configuration
- **Conference Optimized**: Reliable performance for live academic demonstrations
- **Maintainable Architecture**: Clear separation of concerns with modular design