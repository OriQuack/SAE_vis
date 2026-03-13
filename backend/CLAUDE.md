# Backend CLAUDE.md - SAE Feature Visualization FastAPI Server

Professional guidance for the FastAPI backend of the SAE Feature Visualization research prototype.

## Backend Architecture Overview

**Purpose**: Provide stateless feature grouping, clustering, and SVM-based classification APIs for frontend visualization
**Status**: Conference-ready research prototype
**Dataset**: 16,000+ features
**Key Innovation**: SVM-based classification (binary + OvO multi-class) + Query by Committee (QBC) active learning + hierarchical clustering + action logging

## Important Development Principles

### This is a Conference Prototype
- **Keep it simple**: Straightforward data processing for research demonstrations
- **Stateless design**: No complex session management needed
- **Avoid over-engineering**: Use Polars for data processing; don't add unnecessary layers
- **Research-focused**: Easy data manipulation more important than optimization

### Code Quality Guidelines

**Before Making Changes:**
1. **Search existing services**: Check services/ directory for similar functionality
2. **Review data processing patterns**: Look at existing Polars usage
3. **Check API patterns**: Review existing endpoints for consistent request/response
4. **Ask about data**: Check if columns/metrics already exist in parquet files

**After Making Changes:**
1. **Remove dead code**: Delete unused service functions, endpoints, imports
2. **Clean up models**: Remove unused Pydantic models
3. **Test with basic curl**: Ensure demo functionality works

## Core Services

### 1. Feature Grouping Service
Groups features by metric thresholds (N thresholds → N+1 groups):

```python
# services/feature_group_service.py
async def get_feature_groups(filters, metric, thresholds):
    # 1. Apply filters
    df = df.filter(build_filter_expression(filters))

    # 2. Group by thresholds
    groups = []
    for i, (min_val, max_val) in enumerate(get_ranges(thresholds)):
        group_df = df.filter(
            (pl.col(metric) >= min_val) & (pl.col(metric) < max_val)
        )
        groups.append({
            "group_index": i,
            "range_label": format_range(min_val, max_val),
            "feature_ids": group_df["feature_id"].to_list(),
            "count": len(group_df)
        })
    return groups
```

### 2. Hierarchical Clustering Service
Hierarchical clustering of features by decoder weight similarity with multi-criteria pair filtering:

```python
# services/hierarchical_cluster_candidate_service.py
# Builds three data structures from interfeature_similarity.parquet:
# 1. pair_data: {f1: {f2: {decoder_sim, semantic_sim}}} - all pair similarities
# 2. top_semantic: {f1: set(f2, ...)} - top 10 semantic-similar features per feature
# 3. top_lexical: {f1: set(f2, ...)} - top 10 lexical-similar (max(char_ngram, word_ngram))
#
# Pair filtering: C1 (decoder_sim > threshold) AND (C2_semantic OR C2_lexical)
# Fallback: best decoder pair per feature if no pairs pass filtering
```

### 3. Classification Service (SVM-Based)
Unified SVM-based classification for binary (Stage 2) and OvO multi-class (Stage 3):

```python
# services/classification_service.py
class ClassificationService:
    # Binary SVM (Stage 2): similarity sorting, histograms, quality scores
    # OvO-based SVC (Stage 3): cause classification (libsvm internally OvO, OvR-shaped output)
    # Shared metric extraction (svm_feature_metrics fast path + legacy fallback)
    # Single CommitteeService instance for QBC

    async def get_similarity_sorted_features(request)     # Stage 2 binary
    async def get_similarity_score_histogram(request)      # Stage 2 histogram
    async def get_stage3_quality_scores(request)           # Stage 2→3 bridge
    async def get_cause_classification(request)            # Stage 3 multi-class
```

Shared SVM train/score functions are in `svm_utils.py`:
```python
# services/svm_utils.py
compute_balanced_sample_weights(y, sample_weights)        # Balance by weighted class mass
train_svm_model(selected_vectors, rejected_vectors, ...)  # RBF kernel SVM (supports pre-fit scaler)
score_with_svm(model, scaler, feature_vectors)            # Decision function scoring
build_similarity_histogram_response(scores, ...)          # Histogram response builder
```

**Key SVM patterns:**
- **Balanced sample weights**: `compute_balanced_sample_weights()` replaces sklearn's `class_weight='balanced'`, balancing by effective class mass instead of raw counts
- **Pre-fit scaler**: SVM training supports optional pre-fit scaler from full prediction pool for stable feature statistics
- **OvO for multi-class**: Stage 3 uses `SVC(decision_function_shape='ovr')` which is internally OvO via libsvm but outputs OvR-shaped (N, K) decision matrix

### 4. Committee Service (QBC)
Query by Committee approach using RF + PyTorch MLP alongside SVM with majority voting:

```python
# services/committee_service.py
class CommitteeService:
    """Train RF + PyTorch MLP committee for active learning disagreement detection."""

    MIN_SAMPLES_PER_CLASS = 3

    def train_committee(self, X_train, y_train, sample_weights=None, skip_scaling=False):
        # 1. Train Random Forest (with balanced sample weights)
        rf = RandomForestClassifier(n_estimators=100, max_depth=5)
        rf.fit(X_train, y_train, sample_weight=balanced_weights)

        # 2. Train PyTorch MLP (WeightedMLPClassifier, architecture: (16, 16))
        mlp = WeightedMLPClassifier(hidden_sizes=[16, 16])
        mlp.fit(X_train_scaled, y_train, sample_weight=sample_weights)

        return rf, mlp, scaler

    def get_committee_predictions(self, X, svm_preds, rf, mlp):
        # Returns CommitteePrediction for each sample (svm/rf/mlp predictions)
        # Disagreement = majority voting differs from SVM (potential outlier)
        # Note: vote_entropy removed — uses simple majority voting instead
```

**Key details**:
- Uses `WeightedMLPClassifier` (PyTorch-based, from `pytorch_mlp.py`) — not sklearn's MLPClassifier
- Supports `skip_scaling=True` when data is already standardized
- Balances sample weights via `compute_balanced_sample_weights()` for RF training
- Detect cases where SVM is confident but RF/MLP disagree
- Guide users toward uncertain samples during active learning
- Support both binary (Stage 1/2) and multi-class (Stage 3) classification

### 5. Alignment Service
Find semantically aligned phrases across LLM explanations:

```python
# services/alignment_service.py
async def get_highlighted_explanations(feature_id):
    # 1. Load pre-computed alignments from explanation_alignment.parquet
    # 2. Apply semantic highlighting to explanation text
    # 3. Return segments with highlight metadata
```

### 6. Activation Cache Service
Pre-computed activation data using MessagePack + gzip:

```python
# services/activation_cache_service.py
async def get_cached_activation_blob():
    # Returns pre-computed msgpack+gzip blob
    # ~15-25s load vs ~100s for chunked JSON
```

### 7. Cold Start Service
Diversity-based representative sampling for initializing tagging:

```python
# services/cold_start_service.py
async def get_representative_features(feature_ids, n_samples, method):
    # Kennard-Stone algorithm for diversity-based sampling
    # Features: Uses SVM_FEATURE_METRICS (11D) from data_constants.py
    # Pairs: Uses 8D vectors (4 min/max intra + 4 inter from svm_pair_metrics)
    # Returns representative feature/pair IDs for cold start
```

### 8. Consensus Service
HDBSCAN-based phrase clustering for explanation consensus analysis:

```python
# services/consensus_service.py
def get_feature_consensus(feature_id):
    # Load pre-computed phrase clusters from explanation_consensus.parquet
    # Return medoid phrases + outliers sorted by activation similarity
    # Includes cluster coherence, phrase weights, and consensus scores
    # Multi-range char offsets: char_offsets: [{start, end}, ...] for disjoint phrase highlighting
    # Backward compatible: also provides legacy start_char/end_char (from first offset)
    # Recomputes consensus_score normalized by num_explainers
    # Maps raw explainer names to display names via MODEL_NAME_MAP
```

### 9. Action Log Endpoint
Receives batches of frontend action log entries and appends to JSONL file:

```python
# api/action_log.py
@router.post("/action-log")
async def append_action_log(entries: list[dict]):
    # Appends entries to backend/logs/action-log.jsonl
    # Frontend buffers events and flushes every 5 seconds
    # Uses sendBeacon for guaranteed delivery on tab close
```

## Project Structure

```
backend/
├── app/
│   ├── main.py                    # FastAPI application + lifespan
│   ├── api/                       # API endpoints (11 files)
│   │   ├── __init__.py           # Router aggregation
│   │   ├── action_log.py         # Frontend action log (JSONL append)
│   │   ├── activation_examples.py # Activation data
│   │   ├── classification.py     # SVM classification (binary + multi-class, 6 endpoints)
│   │   ├── cluster_candidates.py # Clustering endpoint
│   │   ├── cold_start.py         # Cold start representative sampling
│   │   ├── consensus.py          # Consensus phrase clustering
│   │   ├── feature_groups.py     # Feature grouping
│   │   ├── filters.py            # Filter options
│   │   ├── histogram.py          # Histogram data
│   │   └── table.py              # Table data
│   ├── models/                    # Pydantic schemas (11 files)
│   │   ├── activation_examples.py # Activation example models
│   │   ├── classification.py     # SVM classification models (binary + cause)
│   │   ├── cluster_candidates.py # Clustering models
│   │   ├── cold_start.py         # Cold start models
│   │   ├── common.py             # Shared base models (Filters, HistogramData)
│   │   ├── consensus.py          # Consensus models
│   │   ├── feature_groups.py     # Feature group models
│   │   ├── filters.py            # Filter option models
│   │   ├── histogram.py          # Histogram models
│   │   └── table.py              # Table data models
│   └── services/                  # Business logic (15 files)
│       ├── activation_cache_service.py # Cached activation data (msgpack+gzip)
│       ├── alignment_service.py      # Explanation alignment
│       ├── classification_service.py # Unified SVM classification (binary + multi-class)
│       ├── cold_start_service.py     # Diversity-based representative sampling
│       ├── committee_service.py      # QBC: RF + MLP committee
│       ├── consensus_service.py      # HDBSCAN phrase clustering
│       ├── data_constants.py         # Metric definitions, SVM weights
│       ├── data_service.py           # Data loading + initialization
│       ├── feature_group_service.py  # Feature grouping
│       ├── hierarchical_cluster_candidate_service.py # Clustering
│       ├── histogram_service.py      # Histogram generation
│       ├── pair_similarity_service.py # SVM scoring for pairs
│       ├── pytorch_mlp.py            # PyTorch MLP with sample weighting
│       ├── svm_utils.py              # Shared SVM train/score/histogram functions
│       └── table_data_service.py     # Table processing
├── data/                          # Symlink to ../data
├── start.py                       # Startup script
└── requirements.txt               # Dependencies
```

## API Endpoints

### Primary Endpoints

#### POST /api/feature-groups
Group features by metric thresholds

**Request**:
```json
{
  "filters": {"sae_id": ["sae_1"]},
  "metric": "semdist_mean",
  "thresholds": [0.3, 0.7]
}
```

**Response**:
```json
{
  "groups": [
    {"group_index": 0, "range_label": "< 0.30", "feature_ids": [1,5,12,...], "count": 245},
    {"group_index": 1, "range_label": "0.30-0.70", "feature_ids": [2,8,...], "count": 892},
    {"group_index": 2, "range_label": ">= 0.70", "feature_ids": [3,9,...], "count": 511}
  ]
}
```

#### POST /api/filtered-cluster-pairs
Get cluster-based pairs filtered by decoder similarity + ranking

**Request**:
```json
{
  "feature_ids": [1, 2, 3, 4, 5],
  "threshold": 0.5
}
```

**Response**:
```json
{
  "pairs": [
    {"main_id": 1, "similar_id": 2, "pair_key": "1-2", "cluster_id": 0}
  ],
  "clusters": [
    {"cluster_id": 0, "feature_ids": [1, 2, 3], "pair_count": 3}
  ],
  "total_pairs": 10,
  "total_clusters": 3,
  "filtering_stats": {}
}
```

#### POST /api/similarity-sort
Sort features by SVM similarity

**Request**:
```json
{
  "selected_ids": [1, 2, 3],
  "rejected_ids": [4, 5, 6],
  "feature_ids": [1, 2, 3, 4, 5, 6, 7, 8]
}
```

**Response**:
```json
{
  "sorted_features": [
    {"feature_id": 7, "score": 0.85},
    {"feature_id": 8, "score": 0.42}
  ],
  "total_features": 8,
  "weights_used": [0.1, 0.2, ...]
}
```

#### POST /api/pair-similarity-sort
Sort pairs by SVM similarity (8-dimensional vectors)

**Request**:
```json
{
  "selected_pair_keys": ["1-2", "3-4"],
  "rejected_pair_keys": ["5-6"],
  "pair_keys": ["1-2", "3-4", "5-6", "7-8"]
}
```

**Response**:
```json
{
  "sorted_pairs": [
    {"pair_key": "7-8", "score": 0.85}
  ],
  "total_pairs": 4,
  "weights_used": [...]
}
```

#### POST /api/similarity-score-histogram
Get similarity histogram with committee votes

**Request**:
```json
{
  "selected_items": [{"id": 1, "source": "click"}, {"id": 2, "source": "click"}],
  "rejected_items": [{"id": 4, "source": "click"}, {"id": 5, "source": "threshold"}],
  "feature_ids": [1, 2, 3, 4, 5, 6, 7, 8]
}
```

**Response**:
```json
{
  "scores": {"1": 0.9, "2": 0.8, ...},
  "histogram": {"bins": [...], "counts": [...], "bin_edges": [...]},
  "statistics": {"min": -1.2, "max": 1.5, "mean": 0.3, "median": 0.2},
  "total_items": 8,
  "committee_votes": {
    "1": {"svm_prediction": 1, "rf_prediction": 1, "mlp_prediction": 0},
    "2": {"svm_prediction": 1, "rf_prediction": 1, "mlp_prediction": 1}
    // Note: vote_entropy field removed — uses majority voting instead
  }
}
```

#### POST /api/pair-similarity-score-histogram
Get pair similarity histogram (simplified flow)

**Request**:
```json
{
  "selected_pair_keys": ["1-2"],
  "rejected_pair_keys": ["3-4"],
  "feature_ids": [1, 2, 3, 4, 5],
  "threshold": 0.5
}
```

#### POST /api/cause-classification
SVM cause classification for features (Stage 3) with QBC

**Request**:
```json
{
  "feature_ids": [1, 2, 3, 4, 5],
  "cause_selections": {
    "1": {"category": "noisy-activation", "source": "click"},
    "2": {"category": "missed-N-gram", "source": "click"},
    "3": {"category": "missed-context", "source": "threshold"}
  }
}
```

**Response**:
```json
{
  "results": [
    {
      "feature_id": 4,
      "predicted_category": "noisy-activation",
      "decision_margin": 0.123,
      "decision_scores": {
        "noisy-activation": 0.589,
        "missed-N-gram": 0.035,
        "missed-context": -0.999
      }
    }
  ],
  "total_features": 5,
  "category_counts": {"noisy-activation": 2, "missed-N-gram": 2, "missed-context": 1},
  "committee_votes": {
    "4": {"svm_category": "noisy-activation", "rf_category": "noisy-activation", "mlp_category": "missed-context"}
  }
}
```

#### POST /api/cold-start-suggestions
Get representative features for cold start initialization using diversity sampling

**Request**:
```json
{
  "feature_ids": [1, 2, 3, 4, 5, ...],
  "n_samples": 10,
  "method": "weighted_diversity"
}
```

**Response**:
```json
{
  "representative_ids": [42, 156, 789, ...],
  "total_features": 1000,
  "method_used": "weighted_diversity"
}
```

#### POST /api/feature-consensus
Get consensus phrases for a feature (HDBSCAN clustering results)

**Response**:
```json
{
  "feature_id": 123,
  "consensus_score": 2.5,
  "num_clusters": 3,
  "num_outliers": 2,
  "items": [
    {
      "cluster_id": 0,
      "phrase": "dates and times",
      "explainer": "gemini",
      "activation_similarity": 0.85,
      "is_outlier": false,
      "start_char": 0,
      "end_char": 15,
      "char_offsets": [{"start": 0, "end": 15}],
      "cluster_size": 3,
      "cluster_score": 1.2,
      "cluster_coherence": 0.92,
      "cluster_phrases": [...]
    }
  ]
}
```

### Supporting Endpoints

| Endpoint | Purpose |
|----------|---------|
| GET /api/filter-options | Available filter choices |
| POST /api/histogram-data | Histogram bins for visualization (with threshold path) |
| POST /api/table-data | Feature scoring table |
| POST /api/stage3-quality-scores | Score Need Revision features for Stage 3 entry |
| POST /api/activation-examples | Activation data (on-demand) |
| GET /api/activation-examples-cached | Pre-computed activation blob |
| POST /api/action-log | Append frontend action log entries (JSONL) |
| GET /health | Health check |

## Data Requirements

### Primary Data Files (in `/data/output/`)

#### features.parquet
- **Location**: `/data/output/features.parquet`
- **Size**: 16,000+ features (~4.7MB)
- **Key Columns**:
  - feature_id (int)
  - sae_id (str)
  - llm_explainer (str)
  - llm_scorer (str)
  - semdist_mean, semdist_max (float)
  - quality_score (float)
  - Various score columns (embedding, fuzz, detection)
  - decoder_similarity (nested)
  - semantic_similarity (nested)
  - frac_nonzero (fraction of non-zero activations)

#### activation_display.parquet
- **Location**: `/data/output/activation_display.parquet`
- **Purpose**: Frontend-optimized activation data
- **Size**: ~128MB (pre-aggregated)

#### explanation_alignment.parquet
- **Location**: `/data/output/explanation_alignment.parquet`
- **Purpose**: Cross-explainer phrase alignments for highlighting

#### explanation_consensus.parquet
- **Location**: `/data/output/explanation_consensus.parquet`
- **Purpose**: HDBSCAN phrase clustering with activation similarity scoring
- **Size**: ~4.1MB
- **Key Columns**: feature_id, consensus_score, num_clusters, num_outliers, clusters (nested with char_offsets: list of {start, end} for multi-range highlighting)
- **Used by**: consensus_service.py for phrase clustering visualization, table_data_service.py for consensus_score lookup

#### interfeature_similarity.parquet
- **Location**: `/data/output/interfeature_similarity.parquet`
- **Purpose**: Cross-feature activation pattern similarity for diversity sampling
- **Size**: ~8MB
- **Used by**: Cold start service for representative sampling

#### svm_feature_metrics.parquet
- **Location**: `/data/output/svm_feature_metrics.parquet`
- **Purpose**: Pre-aggregated feature-level metrics for SVM (Stage 2/3)
- **Size**: ~569KB
- **Key Columns**: Mean metrics across explainers (score_embedding, score_fuzz, score_detection, consensus_score, etc.)
- **Used by**: classification_service.py (11D SVM feature vectors), pair_similarity_service.py (4D intra-feature vectors)

#### svm_pair_metrics.parquet
- **Location**: `/data/output/svm_pair_metrics.parquet`
- **Purpose**: Pre-computed pair-level metrics for SVM (Stage 1)
- **Size**: ~4.9MB
- **Key Columns**: feature_a, feature_b, inter_ngram_jaccard, inter_semantic_sim, decoder_sim
- **Used by**: pair_similarity_service.py

#### clustering_linkage.npy
- **Location**: `/data/output/clustering_linkage.npy`
- **Purpose**: Hierarchical clustering linkage matrix for decoder similarity
- **Size**: ~512KB

## Development Workflow

### Starting Development
```bash
cd backend
pip install -r requirements.txt
python start.py --reload --log-level debug
```

### Logs
- **Backend Log**: `/home/dohyun/interface/backend.log` - All server output is logged here
- View logs: `tail -f /home/dohyun/interface/backend.log`

### Testing
```bash
# Health check
curl http://localhost:8003/health

# Test feature groups
curl -X POST http://localhost:8003/api/feature-groups \
  -H "Content-Type: application/json" \
  -d '{"filters": {}, "metric": "semdist_mean", "thresholds": [0.3, 0.7]}'

# Test similarity sort
curl -X POST http://localhost:8003/api/similarity-sort \
  -H "Content-Type: application/json" \
  -d '{"selected_ids": [1,2,3], "rejected_ids": [4,5,6], "feature_ids": [1,2,3,4,5,6,7,8]}'

# Test pair similarity histogram
curl -X POST http://localhost:8003/api/pair-similarity-score-histogram \
  -H "Content-Type: application/json" \
  -d '{"selected_pair_keys": [], "rejected_pair_keys": [], "feature_ids": [1,2,3,4,5], "threshold": 0.5}'
```

## Implementation Patterns

### Polars Best Practices
```python
# Lazy evaluation
df = pl.scan_parquet("data.parquet")  # Lazy
df = df.filter(conditions)            # Still lazy
result = df.collect()                 # Execute here

# String cache for categoricals
with pl.StringCache():
    df = pl.read_parquet("data.parquet")
```

### SVM Training Pattern
```python
from sklearn.svm import SVC
from sklearn.preprocessing import StandardScaler

# Shared functions in svm_utils.py:
def compute_balanced_sample_weights(y, sample_weights):
    """Balance by weighted class mass (not raw counts like sklearn's class_weight='balanced')."""
    # balanced_weight[i] = sample_weight[i] * total_mass / (n_classes * class_mass[c])
    ...

def train_svm_model(selected_vectors, rejected_vectors, selected_weights, rejected_weights, scaler=None):
    X = np.vstack([selected_vectors, rejected_vectors])
    y = np.array([1] * len(selected_vectors) + [0] * len(rejected_vectors))
    sample_weights = compute_balanced_sample_weights(y, np.concatenate([selected_weights, rejected_weights]))

    # Use pre-fit scaler if provided (fit on full prediction pool), else fit new
    if scaler is None:
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
    else:
        X_scaled = scaler.transform(X)

    model = SVC(kernel='rbf', C=1.0, gamma='scale')
    model.fit(X_scaled, y, sample_weight=sample_weights)
    return model, scaler

def score_with_svm(model, scaler, feature_vectors):
    X_scaled = scaler.transform(feature_vectors)
    return model.decision_function(X_scaled)
```

### Error Handling
```python
from fastapi import HTTPException

@router.post("/api/endpoint")
async def endpoint(request: RequestModel):
    try:
        result = await service.process(request)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error: {e}")
        raise HTTPException(status_code=500, detail="Internal error")
```

### CORS Configuration
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3003",
        "http://localhost:3004",
        "http://localhost:5173",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["*"]
)
```

## Service Initialization Order

Services are initialized in `main.py` lifespan in this order:
1. **DataService** - Load parquet files
2. **AlignmentService** - Load explanation alignments
3. **TableDataService** - Table data (depends on DataService + AlignmentService)
4. **FeatureGroupService** - Initialize grouping
5. **HistogramService** - Histogram generation
6. **HierarchicalClusterCandidateService** - Load decoder weights
7. **ClassificationService** - Unified SVM classification (binary + multi-class)
8. **PairSimilarityService** - SVM scoring for pairs (depends on cluster service)
9. **ColdStartService** - Diversity-based representative sampling
10. **ActivationCacheService** - Pre-compute msgpack blob
11. **ConsensusService** - Load phrase clustering data

## Common Issues & Solutions

### Issue: Slow response times
**Solution**: Use lazy evaluation with scan_parquet, not read_parquet

### Issue: CORS errors
**Solution**: Ensure frontend port is in allowed origins

### Issue: Memory issues
**Solution**: Use scan_parquet instead of read_parquet for lazy evaluation

### Issue: SVM not converging
**Solution**: Increase max_iter, check for sufficient training examples

---

## Remember

**This is a research prototype for conference demonstrations**

When working on backend code:
- **Keep it simple**: Straightforward FastAPI + Polars patterns
- **Avoid over-engineering**: Don't add complex auth, caching unless needed
- **Clean up after changes**: Remove unused services, endpoints, models
- **Test with curl**: Ensure endpoints respond correctly

The goal is a simple, stateless API that enables frontend exploration, not a production system.
