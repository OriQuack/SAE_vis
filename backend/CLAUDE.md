# Backend CLAUDE.md - SAE Feature Visualization FastAPI Server

Professional guidance for the FastAPI backend of the SAE Feature Visualization research prototype.

## Backend Architecture Overview

**Purpose**: Provide stateless feature grouping, clustering, similarity scoring, and bimodality detection APIs for frontend visualization
**Status**: Conference-ready research prototype
**Dataset**: 16,000+ features
**Key Innovation**: SVM-based similarity scoring + hierarchical clustering + bimodality detection

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
Hierarchical clustering of features by decoder weight similarity:

```python
# services/hierarchical_cluster_candidate_service.py
def get_all_cluster_pairs(feature_ids, threshold):
    # 1. Get decoder weights for features
    weights = decoder_weights[feature_ids]

    # 2. Compute cosine similarity
    similarity_matrix = cosine_similarity(weights)

    # 3. Hierarchical clustering
    clusters = fcluster(linkage(1 - similarity_matrix), threshold)

    # 4. Generate all pairs within clusters
    pairs = []
    for cluster_id in unique_clusters:
        cluster_features = features_in_cluster[cluster_id]
        for i, j in combinations(cluster_features, 2):
            pairs.append({
                "pair_key": f"{min(i,j)}-{max(i,j)}",
                "similarity": similarity_matrix[i, j]
            })
    return pairs
```

### 3. Similarity Sort Service (SVM-Based)
Score and sort items based on SVM distance from decision boundary:

```python
# services/similarity_sort_service.py
def get_similarity_scores(selected_ids, rejected_ids, all_ids):
    # 1. Build feature vectors
    X_train = build_feature_vectors(selected_ids + rejected_ids)
    y_train = [1] * len(selected_ids) + [0] * len(rejected_ids)

    # 2. Train LinearSVC
    svm = LinearSVC(C=1.0, max_iter=10000)
    svm.fit(X_train, y_train)

    # 3. Score all items by distance from decision boundary
    X_all = build_feature_vectors(all_ids)
    scores = svm.decision_function(X_all)

    return sorted_by_score(all_ids, scores)
```

### 4. Bimodality Service
Detect bimodal distributions using Hartigan's Dip test and GMM:

```python
# services/bimodality_service.py
def detect_bimodality(scores):
    # 1. Hartigan's Dip test
    dip_stat, dip_pvalue = diptest.diptest(scores)

    # 2. Fit GMM with 1 and 2 components
    gmm_1 = GaussianMixture(n_components=1).fit(scores)
    gmm_2 = GaussianMixture(n_components=2).fit(scores)

    # 3. Compare BIC scores
    bic_k1 = gmm_1.bic(scores)
    bic_k2 = gmm_2.bic(scores)

    return {
        "dip_pvalue": dip_pvalue,
        "bic_k1": bic_k1,
        "bic_k2": bic_k2,
        "gmm_components": extract_components(gmm_2)
    }
```

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

### 7. UMAP Service (Stage 3)
Barycentric projections and SVM-based cause classification:

```python
# services/umap_service.py
async def get_umap_projection(feature_ids):
    # Returns precomputed 2D positions from explanation_barycentric.parquet
    # Mean position across 3 explainers per feature
    # Includes explainer_positions for detail view

async def get_cause_classification(feature_ids, cause_selections):
    # Trains One-vs-Rest SVMs for each cause category
    # Uses mean metric vectors per feature (averaged across 3 explainers)
    # Returns predicted_category and decision_scores per feature
```

## Project Structure

```
backend/
├── app/
│   ├── main.py                    # FastAPI application + lifespan
│   ├── api/                       # API endpoints (11 files)
│   │   ├── __init__.py           # Router aggregation
│   │   ├── feature_groups.py     # Feature grouping
│   │   ├── cluster_candidates.py # Clustering endpoint
│   │   ├── similarity_sort.py    # SVM similarity sorting
│   │   ├── filters.py            # Filter options
│   │   ├── histogram.py          # Histogram data
│   │   ├── table.py              # Table data
│   │   ├── activation_examples.py # Activation data
│   │   ├── comparison.py         # Comparison view data
│   │   ├── llm_comparison.py     # LLM comparison
│   │   └── umap.py               # UMAP projections
│   ├── models/                    # Pydantic schemas
│   │   ├── requests.py           # Request models
│   │   └── responses.py          # Response models
│   └── services/                  # Business logic (11 files)
│       ├── data_service.py           # Data loading + initialization
│       ├── data_constants.py         # Metric definitions
│       ├── feature_group_service.py  # Feature grouping
│       ├── hierarchical_cluster_candidate_service.py # Clustering
│       ├── similarity_sort_service.py # SVM scoring
│       ├── bimodality_service.py     # Bimodality detection
│       ├── histogram_service.py      # Histogram generation
│       ├── table_data_service.py     # Table processing
│       ├── alignment_service.py      # Explanation alignment
│       ├── activation_cache_service.py # Cached activation data
│       ├── umap_service.py           # Barycentric projection + SVM classification
│       └── consistency_service.py    # Consistency metrics
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

#### POST /api/segment-cluster-pairs
Get ALL cluster-based pairs for features (simplified flow)

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
  "total_clusters": 3
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
Sort pairs by SVM similarity (19-dimensional vectors)

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
Get similarity histogram with bimodality detection

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
  "scores": {"1": 0.9, "2": 0.8, ...},
  "histogram": {"bins": [...], "counts": [...], "bin_edges": [...]},
  "statistics": {"min": -1.2, "max": 1.5, "mean": 0.3, "median": 0.2},
  "total_items": 8,
  "bimodality": {
    "dip_pvalue": 0.02,
    "bic_k1": 1234.5,
    "bic_k2": 1200.3,
    "gmm_components": [
      {"mean": -0.5, "variance": 0.2, "weight": 0.4},
      {"mean": 0.8, "variance": 0.3, "weight": 0.6}
    ],
    "sample_size": 100
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

#### POST /api/umap-projection
Get barycentric 2D positions for features (Stage 3 UMAP)

**Request**:
```json
{
  "feature_ids": [1, 2, 3, 4, 5]
}
```

**Response**:
```json
{
  "points": [
    {
      "feature_id": 1,
      "x": 0.45,
      "y": 0.32,
      "nearest_anchor": "noisy-activation",
      "explainer_positions": [
        {"explainer": "llama", "x": 0.44, "y": 0.31, "nearest_anchor": "noisy-activation"},
        {"explainer": "qwen", "x": 0.46, "y": 0.33, "nearest_anchor": "noisy-activation"},
        {"explainer": "openai", "x": 0.45, "y": 0.32, "nearest_anchor": "missed-context"}
      ]
    }
  ],
  "total_features": 5,
  "params_used": {"source": "barycentric_precomputed", "aggregation": "mean"}
}
```

#### POST /api/cause-classification
SVM cause classification for features (Stage 3)

**Request**:
```json
{
  "feature_ids": [1, 2, 3, 4, 5],
  "cause_selections": {"1": "noisy-activation", "2": "missed-N-gram", "3": "missed-context"}
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
  "category_counts": {"noisy-activation": 2, "missed-N-gram": 2, "missed-context": 1}
}
```

### Supporting Endpoints

| Endpoint | Purpose |
|----------|---------|
| GET /api/filter-options | Available filter choices |
| POST /api/histogram-data | Histogram bins for visualization (with threshold path) |
| POST /api/table-data | Feature scoring table |
| POST /api/activation-examples | Activation data (on-demand) |
| GET /api/activation-examples-cached | Pre-computed activation blob |
| GET /health | Health check |

## Data Requirements

### Primary Data Files

#### features.parquet
- **Location**: `/data/master/features.parquet`
- **Size**: 16,000+ features
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

#### activation_display.parquet
- **Location**: `/data/master/activation_display.parquet`
- **Purpose**: Frontend-optimized activation data
- **Size**: 64MB (pre-aggregated from 246MB raw)

#### explanation_alignment.parquet
- **Location**: `/data/master/explanation_alignment.parquet`
- **Purpose**: Cross-explainer phrase alignments for highlighting

#### explanation_barycentric.parquet
- **Location**: `/data/master/explanation_barycentric.parquet`
- **Purpose**: Precomputed 2D positions for Stage 3 UMAP
- **Key Columns**:
  - feature_id, llm_explainer
  - position_x, position_y (barycentric 2D coordinates)
  - nearest_anchor (closest cause category anchor)
  - Metric scores: intra_feature_sim, score_embedding, score_fuzz, score_detection, explanation_semantic_sim

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
from sklearn.svm import LinearSVC
from sklearn.preprocessing import StandardScaler

def train_and_score(selected, rejected, all_items):
    # Build feature vectors
    X_train = np.vstack([get_vector(id) for id in selected + rejected])
    y_train = [1] * len(selected) + [0] * len(rejected)

    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)

    # Train SVM
    svm = LinearSVC(C=1.0, max_iter=10000)
    svm.fit(X_train_scaled, y_train)

    # Score all items
    X_all = np.vstack([get_vector(id) for id in all_items])
    X_all_scaled = scaler.transform(X_all)
    scores = svm.decision_function(X_all_scaled)

    return scores
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
3. **FeatureGroupService** - Initialize grouping
4. **HierarchicalClusterCandidateService** - Load decoder weights
5. **SimilaritySortService** - Initialize with cluster service
6. **ActivationCacheService** - Pre-compute msgpack blob

## Common Issues & Solutions

### Issue: Slow response times
**Solution**: Use lazy evaluation with scan_parquet, not read_parquet

### Issue: CORS errors
**Solution**: Ensure frontend port is in allowed origins

### Issue: Memory issues
**Solution**: Use scan_parquet instead of read_parquet for lazy evaluation

### Issue: SVM not converging
**Solution**: Increase max_iter, check for sufficient training examples

### Issue: Bimodality detection failing
**Solution**: Ensure minimum sample size (typically 10+)

---

## Remember

**This is a research prototype for conference demonstrations**

When working on backend code:
- **Keep it simple**: Straightforward FastAPI + Polars patterns
- **Avoid over-engineering**: Don't add complex auth, caching unless needed
- **Clean up after changes**: Remove unused services, endpoints, models
- **Test with curl**: Ensure endpoints respond correctly

The goal is a simple, stateless API that enables frontend exploration, not a production system.
