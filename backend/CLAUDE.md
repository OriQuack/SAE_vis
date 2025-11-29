# Backend CLAUDE.md - SAE Feature Visualization FastAPI Server

Professional guidance for the FastAPI backend of the SAE Feature Visualization research prototype.

## Backend Architecture Overview

**Purpose**: Provide stateless feature grouping, clustering, and similarity APIs for frontend visualization
**Status**: Conference-ready research prototype
**Dataset**: 16,000+ features
**Key Innovation**: Simplified grouping service + hierarchical clustering for pair analysis

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

### 2. Clustering Service
Hierarchical clustering of features by decoder weight similarity:

```python
# services/clustering_service.py
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

### 3. Similarity Sort Service
Score and sort pairs based on similarity to user selections:

```python
# services/similarity_sort_service.py
def get_pair_similarity_sort(selected_pairs, rejected_pairs, all_pairs):
    # 1. Build feature vectors from selected/rejected pairs
    selected_vectors = get_pair_vectors(selected_pairs)
    rejected_vectors = get_pair_vectors(rejected_pairs)

    # 2. Train simple classifier or compute weighted score
    # 3. Score all pairs
    # 4. Return sorted by score (high = similar to selected)
    return sorted_pairs
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

#### POST /api/cluster-candidates
Get all cluster-based pairs for features

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
    {"pair_key": "1-2", "main_feature_id": 1, "similar_feature_id": 2, "similarity": 0.85}
  ],
  "clusters": [
    {"cluster_id": 0, "feature_ids": [1, 2, 3]}
  ],
  "total_pairs": 10,
  "total_clusters": 3
}
```

#### POST /api/similarity-sort
Sort pairs by similarity to selections

**Request**:
```json
{
  "selected_pair_keys": ["1-2", "3-4"],
  "rejected_pair_keys": ["5-6"],
  "all_pair_keys": ["1-2", "3-4", "5-6", "7-8"]
}
```

**Response**:
```json
{
  "sorted_pairs": [
    {"pair_key": "7-8", "score": 0.85},
    {"pair_key": "1-2", "score": 0.75}
  ],
  "total_pairs": 4
}
```

### Supporting Endpoints

| Endpoint | Purpose |
|----------|---------|
| GET /api/filter-options | Available filter choices |
| POST /api/histogram-data | Histogram bins for visualization |
| POST /api/table-data | Feature scoring table |
| POST /api/activation-examples | Activation data |
| GET /health | Health check |

## Project Structure

```
backend/
├── app/
│   ├── main.py                    # FastAPI application
│   ├── api/                       # API endpoints
│   │   ├── feature_groups.py     # Feature grouping
│   │   ├── cluster_candidates.py # Clustering endpoint
│   │   ├── similarity_sort.py    # Similarity sorting
│   │   ├── filters.py            # Filter options
│   │   ├── histogram.py          # Histogram data
│   │   ├── table.py              # Table data
│   │   └── activation_examples.py # Activation data
│   ├── models/                    # Pydantic schemas
│   │   ├── requests.py           # Request models
│   │   └── responses.py          # Response models
│   └── services/                  # Business logic
│       ├── feature_group_service.py  # Feature grouping
│       ├── clustering_service.py     # Hierarchical clustering
│       ├── similarity_sort_service.py # Similarity scoring
│       ├── data_service.py           # Data loading
│       └── table_data_service.py     # Table processing
├── data/                          # Data files
│   └── master/
│       ├── feature_analysis.parquet  # Main dataset (16k+ features)
│       └── decoder_weights.npy       # Decoder weights for clustering
├── start.py                       # Startup script
└── requirements.txt               # Dependencies
```

## Data Requirements

### Primary Data Files

#### feature_analysis.parquet
- **Location**: `/data/master/feature_analysis.parquet`
- **Size**: 16,000+ features
- **Key Columns**:
  - feature_id (int)
  - sae_id (str)
  - llm_explainer (str)
  - llm_scorer (str)
  - semdist_mean, semdist_max (float)
  - Various score columns

#### decoder_weights.npy
- **Location**: `/data/master/decoder_weights.npy`
- **Purpose**: Feature decoder weights for clustering
- **Shape**: (num_features, embedding_dim)

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

# Test clustering
curl -X POST http://localhost:8003/api/cluster-candidates \
  -H "Content-Type: application/json" \
  -d '{"feature_ids": [1, 2, 3, 4, 5], "threshold": 0.5}'
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
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["*"]
)
```

## Common Issues & Solutions

### Issue: Slow response times
**Solution**: Use lazy evaluation with scan_parquet, not read_parquet

### Issue: CORS errors
**Solution**: Ensure frontend port is in allowed origins

### Issue: Memory issues
**Solution**: Use scan_parquet instead of read_parquet for lazy evaluation

### Issue: Clustering slow for large feature sets
**Solution**: Consider pre-computing clusters or using approximate methods

---

## Remember

**This is a research prototype for conference demonstrations**

When working on backend code:
- **Keep it simple**: Straightforward FastAPI + Polars patterns
- **Avoid over-engineering**: Don't add complex auth, caching unless needed
- **Clean up after changes**: Remove unused services, endpoints, models
- **Test with curl**: Ensure endpoints respond correctly

The goal is a simple, stateless API that enables frontend exploration, not a production system.
