# SAE Feature Visualization API Specification

## Overview

This RESTful API powers an interactive data visualization interface for analyzing Sparse Autoencoder (SAE) feature explanation reliability. The API is designed to support real-time interactive visualizations with near-instantaneous response times for datasets containing up to 50,000 feature records.

## Technology Stack

- **Backend**: FastAPI, Python 3.9+
- **Data Processing**: Polars for high-performance columnar operations
- **Data Storage**: Parquet files for efficient columnar data storage
- **Performance**: Lazy evaluation and caching for sub-second response times

## Base URL

```
http://localhost:8000/api
```

## Authentication

Currently no authentication is required. Future versions may implement API key authentication.

---

## Core Endpoints

### 1. GET /api/filter-options

**Description:** Returns all unique values for each filterable field to populate UI dropdown controls.

**Query Parameters:** None

**Success Response (200):**
```json
{
  "sae_id": [
    "gemma-scope-9b-pt-res/layer_30/width16k/average_l0_120",
    "gemma-scope-2b-pt-res/layer_20/width16k/average_l0_71",
    "pythia-70m-deduped/layer_4/width512/average_l0_90"
  ],
  "explanation_method": [
    "quantiles",
    "top-act",
    "random"
  ],
  "llm_explainer": [
    "claude-3-opus",
    "gpt-4-turbo",
    "gemini-1.5-pro"
  ],
  "llm_scorer": [
    "claude-3-opus",
    "gpt-4-turbo",
    "gemini-1.5-pro"
  ]
}
```

**Error Responses:**
- `500`: Server error during data retrieval

---

### 2. POST /api/histogram-data

**Description:** Returns histogram data for a specific metric to render distribution visualization with threshold controls.

**Request Body:**
```json
{
  "filters": {
    "sae_id": ["gemma-scope-9b-pt-res/layer_30/width16k/average_l0_120"],
    "explanation_method": ["quantiles", "top-act"],
    "llm_explainer": ["claude-3-opus"],
    "llm_scorer": ["gpt-4-turbo"]
  },
  "metric": "semdist_mean",
  "bins": 20
}
```

**Request Schema:**
- `filters` (object): Filter criteria for data subset
  - `sae_id` (array[string], optional): SAE model identifiers
  - `explanation_method` (array[string], optional): Explanation methods
  - `llm_explainer` (array[string], optional): LLM explainer models
  - `llm_scorer` (array[string], optional): LLM scorer models
- `metric` (string): Metric name to analyze (`semdist_mean`, `semdist_max`, `score_fuzz`, `score_simulation`, `score_detection`, `score_embedding`)
- `bins` (integer, optional): Number of histogram bins (default: 20, max: 100)

**Success Response (200):**
```json
{
  "metric": "semdist_mean",
  "histogram": {
    "bins": [0.0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5],
    "counts": [45, 123, 234, 456, 389, 287, 156, 89, 34, 12],
    "bin_edges": [0.0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55]
  },
  "statistics": {
    "min": 0.02,
    "max": 0.51,
    "mean": 0.18,
    "median": 0.16,
    "std": 0.09
  },
  "total_features": 2225
}
```

**Error Responses:**
- `400`: Invalid filters or metric name
- `500`: Server error during histogram calculation

---

### 3. POST /api/sankey-data

**Description:** Main endpoint that returns structured nodes and links data for rendering a Sankey diagram based on complete configuration.

**Request Body:**
```json
{
  "filters": {
    "sae_id": ["gemma-scope-9b-pt-res/layer_30/width16k/average_l0_120"],
    "explanation_method": ["quantiles"],
    "llm_explainer": ["claude-3-opus"],
    "llm_scorer": ["gpt-4-turbo"]
  },
  "thresholds": {
    "semdist_mean": 0.15,
    "score_high": 0.8
  }
}
```

**Request Schema:**
- `filters` (object): Filter criteria for data subset (same as histogram-data)
- `thresholds` (object): Threshold values for categorization
  - `semdist_mean` (float): Threshold for semantic distance classification (0.0-1.0)
  - `score_high` (float): Threshold for "high" score classification (0.0-1.0)

**Success Response (200):**
```json
{
  "nodes": [
    {
      "id": "root",
      "name": "All Features",
      "stage": 0,
      "feature_count": 1847,
      "category": "root"
    },
    {
      "id": "split_true",
      "name": "Feature Splitting: True",
      "stage": 1,
      "feature_count": 423,
      "category": "feature_splitting"
    },
    {
      "id": "split_false",
      "name": "Feature Splitting: False",
      "stage": 1,
      "feature_count": 1424,
      "category": "feature_splitting"
    },
    {
      "id": "split_true_semdist_high",
      "name": "High Semantic Distance",
      "stage": 2,
      "feature_count": 267,
      "category": "semantic_distance",
      "parent_path": ["split_true"]
    },
    {
      "id": "split_true_semdist_low",
      "name": "Low Semantic Distance",
      "stage": 2,
      "feature_count": 156,
      "category": "semantic_distance",
      "parent_path": ["split_true"]
    },
    {
      "id": "split_false_semdist_high",
      "name": "High Semantic Distance",
      "stage": 2,
      "feature_count": 892,
      "category": "semantic_distance",
      "parent_path": ["split_false"]
    },
    {
      "id": "split_false_semdist_low",
      "name": "Low Semantic Distance",
      "stage": 2,
      "feature_count": 532,
      "category": "semantic_distance",
      "parent_path": ["split_false"]
    },
    {
      "id": "split_true_semdist_high_agree_all",
      "name": "All 3 Scores High",
      "stage": 3,
      "feature_count": 89,
      "category": "score_agreement",
      "parent_path": ["split_true", "semdist_high"]
    },
    {
      "id": "split_true_semdist_high_agree_2of3",
      "name": "2 of 3 Scores High",
      "stage": 3,
      "feature_count": 124,
      "category": "score_agreement",
      "parent_path": ["split_true", "semdist_high"]
    },
    {
      "id": "split_true_semdist_high_agree_1of3",
      "name": "1 of 3 Scores High",
      "stage": 3,
      "feature_count": 43,
      "category": "score_agreement",
      "parent_path": ["split_true", "semdist_high"]
    },
    {
      "id": "split_true_semdist_high_agree_none",
      "name": "All 3 Scores Low",
      "stage": 3,
      "feature_count": 11,
      "category": "score_agreement",
      "parent_path": ["split_true", "semdist_high"]
    }
  ],
  "links": [
    {
      "source": "root",
      "target": "split_true",
      "value": 423
    },
    {
      "source": "root",
      "target": "split_false",
      "value": 1424
    },
    {
      "source": "split_true",
      "target": "split_true_semdist_high",
      "value": 267
    },
    {
      "source": "split_true",
      "target": "split_true_semdist_low",
      "value": 156
    },
    {
      "source": "split_true_semdist_high",
      "target": "split_true_semdist_high_agree_all",
      "value": 89
    },
    {
      "source": "split_true_semdist_high",
      "target": "split_true_semdist_high_agree_2of3",
      "value": 124
    }
  ],
  "metadata": {
    "total_features": 1847,
    "applied_filters": {
      "sae_id": ["gemma-scope-9b-pt-res/layer_30/width16k/average_l0_120"],
      "explanation_method": ["quantiles"],
      "llm_explainer": ["claude-3-opus"],
      "llm_scorer": ["gpt-4-turbo"]
    },
    "applied_thresholds": {
      "semdist_mean": 0.15,
      "score_high": 0.8
    }
  }
}
```

**Error Responses:**
- `400`: Invalid filters or thresholds
- `400`: Insufficient data after filtering
- `500`: Server error during Sankey calculation

---

### 4. POST /api/comparison-data

**Description:** Returns alluvial flow data connecting the final nodes of two Sankey configurations, tracking how the same features are categorized differently. **(Phase 2)**

**Request Body:**
```json
{
  "sankey_left": {
    "filters": {
      "sae_id": ["gemma-scope-9b-pt-res/layer_30/width16k/average_l0_120"],
      "explanation_method": ["quantiles"],
      "llm_explainer": ["claude-3-opus"],
      "llm_scorer": ["gpt-4-turbo"]
    },
    "thresholds": {
      "semdist_mean": 0.15,
      "score_high": 0.8
    }
  },
  "sankey_right": {
    "filters": {
      "sae_id": ["gemma-scope-9b-pt-res/layer_30/width16k/average_l0_120"],
      "explanation_method": ["top-act"],
      "llm_explainer": ["gpt-4-turbo"],
      "llm_scorer": ["claude-3-opus"]
    },
    "thresholds": {
      "semdist_mean": 0.12,
      "score_high": 0.85
    }
  }
}
```

**Request Schema:**
- `sankey_left` (object): Complete configuration for left Sankey diagram
- `sankey_right` (object): Complete configuration for right Sankey diagram
- Both objects follow the same schema as `/api/sankey-data` request

**Success Response (200):**
```json
{
  "flows": [
    {
      "source_node": "split_true_semdist_high_agree_all",
      "target_node": "split_false_semdist_low_agree_2of3",
      "feature_count": 23,
      "feature_ids": [1445, 2891, 3456, 4123]
    },
    {
      "source_node": "split_true_semdist_high_agree_2of3",
      "target_node": "split_true_semdist_high_agree_all",
      "feature_count": 67,
      "feature_ids": [891, 1234, 2456]
    },
    {
      "source_node": "split_false_semdist_low_agree_none",
      "target_node": "split_true_semdist_high_agree_1of3",
      "feature_count": 12,
      "feature_ids": [5678, 6789]
    }
  ],
  "summary": {
    "total_overlapping_features": 1456,
    "total_flows": 48,
    "consistency_metrics": {
      "same_final_category": 892,
      "different_final_category": 564,
      "consistency_rate": 0.613
    }
  }
}
```

**Error Responses:**
- `400`: Invalid Sankey configurations
- `400`: No overlapping features between configurations
- `500`: Server error during comparison calculation

---

### 5. GET /api/feature/{feature_id}

**Description:** Returns detailed information for a specific feature for debugging and drill-down views.

**Path Parameters:**
- `feature_id` (integer): The feature ID to retrieve

**Query Parameters:**
- `sae_id` (string, optional): Specific SAE context
- `explanation_method` (string, optional): Specific explanation method context
- `llm_explainer` (string, optional): Specific LLM explainer context
- `llm_scorer` (string, optional): Specific LLM scorer context

**Success Response (200):**
```json
{
  "feature_id": 1445,
  "sae_id": "gemma-scope-9b-pt-res/layer_30/width16k/average_l0_120",
  "explanation_method": "quantiles",
  "llm_explainer": "claude-3-opus",
  "llm_scorer": "gpt-4-turbo",
  "feature_splitting": true,
  "semdist_mean": 0.18,
  "semdist_max": 0.31,
  "scores": {
    "fuzz": 0.89,
    "simulation": 0.92,
    "detection": 0.85,
    "embedding": 0.95
  },
  "details_path": "/data/detailed_json/feature_1445_gemma-scope-9b-pt-res_layer_30_width16k_average_l0_120.json"
}
```

**Error Responses:**
- `404`: Feature not found with given parameters
- `400`: Invalid query parameters
- `500`: Server error during feature retrieval

---

## Error Response Format

All endpoints use consistent error formatting:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error description",
    "details": {
      "field_name": "additional_context"
    }
  }
}
```

### Common Error Codes

- `INVALID_FILTERS` (400): One or more filter values are invalid
- `INVALID_THRESHOLDS` (400): Threshold values are out of valid range
- `INVALID_METRIC` (400): Specified metric name is not supported
- `INSUFFICIENT_DATA` (400): Not enough data after filtering to generate visualization
- `FEATURE_NOT_FOUND` (404): Requested feature_id doesn't exist
- `INTERNAL_ERROR` (500): Unexpected server error

---

## Performance Considerations

### Caching Strategy
- Filter options are cached for 1 hour (refreshed when data updates)
- Histogram data is cached per unique filter+metric combination (15 minutes)
- Sankey calculations are cached per unique configuration (5 minutes)

### Rate Limiting
- 100 requests per minute per IP address
- 10 concurrent requests per IP address for computationally expensive endpoints

### Response Times
- **Target**: < 200ms for all endpoints under normal load
- **Optimization**: Polars lazy evaluation with column pruning
- **Scaling**: Horizontal scaling supported through stateless design

---

## Data Processing Pipeline

### Stage 1: Feature Splitting
Features are divided based on the `feature_splitting` boolean field:
- `true`: Features identified as candidates for feature splitting
- `false`: Features not identified for splitting

### Stage 2: Semantic Distance Classification
Features are classified based on `semdist_mean` relative to user threshold:
- **High**: `semdist_mean >= threshold`
- **Low**: `semdist_mean < threshold`

### Stage 3: Score Agreement Classification
Features are classified into 4 groups based on how many scores (`score_fuzz`, `score_simulation`, `score_detection`) exceed the "high" threshold:
- **Group 1**: All 3 scores ≥ threshold
- **Group 2**: Exactly 2 scores ≥ threshold
- **Group 3**: Exactly 1 score ≥ threshold
- **Group 4**: All 3 scores < threshold

---

## Development & Testing

### Local Development
```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

### API Testing
```bash
# Install dependencies
pip install httpx pytest

# Run tests
pytest tests/

# Manual testing
curl -X GET "http://localhost:8000/api/filter-options"
```

### Data Requirements
- Master Parquet file: `/data/master/feature_analysis.parquet`
- Detailed JSON directory: `/data/detailed_json/`
- Metadata file: `/data/master/feature_analysis.metadata.json`

---

## Changelog

### Version 1.0.0 (Initial Release)
- Core endpoints for Phase 1 and Phase 2
- Polars-based data processing
- Comprehensive error handling
- Performance optimization with caching