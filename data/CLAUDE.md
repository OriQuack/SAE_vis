# Data Directory Structure and Processing Pipeline

This directory contains the complete data processing pipeline for SAE (Sparse Autoencoder) feature analysis and interpretability evaluation.

## Directory Structure

```
data/
├── raw/                          # Raw input data from SAE experiments
│   ├── llama_e-llama_s/         # Llama explanations + Llama scores
│   │   ├── explanations/        # Feature explanation text files (824 files)
│   │   ├── scores/              # Scoring method results
│   │   │   ├── fuzz/           # Fuzzing-based scores (binary correct/incorrect)
│   │   │   ├── detection/      # Detection-based scores (binary correct/incorrect)
│   │   │   └── simulation/     # Simulation-based scores (ev_correlation_score)
│   │   └── run_config.json     # SAE experiment configuration
│   ├── gwen_e-llama_s/         # Gwen explanations + Llama scores
│   │   ├── explanations/        # Feature explanation text files (824 files)
│   │   ├── scores/              # Scoring method results
│   │   │   ├── fuzz/           # Fuzzing-based scores (binary correct/incorrect)
│   │   │   ├── detection/      # Detection-based scores (binary correct/incorrect)
│   │   │   └── simulation/     # Simulation-based scores (ev_correlation_score)
│   │   └── run_config.json     # SAE experiment configuration
│   └── openai_e-llama_s/       # OpenAI explanations + Llama scores
│       ├── explanations/        # Feature explanation text files (823 files)
│       ├── scores/              # Scoring method results
│       └── run_config.json     # SAE experiment configuration
├── preprocessing/               # Processing scripts and configurations
│   ├── scripts/                # Python processing scripts
│   │   ├── generate_embeddings.py           # Create embeddings from explanations
│   │   ├── process_scores.py                # Process scores from raw files
│   │   ├── calculate_semantic_distances.py  # Calculate distances between embeddings
│   │   ├── generate_detailed_json.py        # Consolidate all data per feature
│   │   ├── create_master_parquet.py         # Create master parquet from detailed JSON ✅
│   │   ├── create_pairwise_similarity_parquet.py # Create pairwise similarity parquet ✅ NEW
│   │   └── 8_precompute_consistency_scores.py # Pre-compute consistency scores ✅ Phase 8
│   ├── config/                 # Configuration files for processing
│   │   ├── embedding_config.json            # Embedding generation config
│   │   ├── score_config.json                # Score processing config
│   │   ├── gwen_score_config.json           # Gwen-specific score config
│   │   ├── semantic_distance_config.json    # Semantic distance config
│   │   ├── detailed_json_config.json        # Detailed JSON consolidation config
│   │   ├── feature_similarity_config.json   # Feature similarity calculation config ✅
│   │   ├── master_parquet_config.json       # Master parquet creation config ✅
│   │   └── pairwise_similarity_config.json  # Pairwise similarity config ✅ NEW
│   └── logs/                   # Processing logs (if any)
├── embeddings/                 # Processed embedding vectors
│   ├── llama_e-llama_s/        # Embeddings from Llama explanations
│   │   ├── embeddings.json     # Embedding vectors and metadata (824 latents)
│   │   └── config.json         # Config used for generation (includes sae_id)
│   └── gwen_e-llama_s/         # Embeddings from Gwen explanations
│       ├── embeddings.json     # Embedding vectors and metadata (824 latents)
│       └── config.json         # Config used for generation (includes sae_id)
├── scores/                     # Processed scoring results
│   ├── llama_e-llama_s/        # Processed scores from Llama data
│   │   ├── scores.json         # Aggregated scores with statistics (824 latents)
│   │   └── config.json         # Config used for processing (includes sae_id)
│   └── gwen_e-llama_s/         # Processed scores from Gwen data
│       ├── scores.json         # Aggregated scores with statistics (824 latents)
│       └── config.json         # Config used for processing (includes sae_id)
├── semantic_distances/         # Pairwise semantic distance calculations
│   └── llama_e-llama_s_vs_gwen_e-llama_s/  # Distance between explanation sources
│       ├── semantic_distances.json         # Distance metrics and comparisons (824 pairs)
│       └── config.json                     # Config used for calculation (includes sae_ids)
├── feature_similarity/         # SAE feature cosine similarity calculations ✅ NEW
│   └── google--gemma-scope-9b-pt-res--layer_30--width_16k--average_l0_120/
│       ├── feature_similarities.json       # Closest cosine similarities (1000 features)
│       └── config.json                     # Config used for similarity calculation
├── detailed_json/              # Final consolidated data per feature ✅ IMPLEMENTED
│   └── google--gemma-scope-9b-pt-res--layer_30--width_16k--average_l0_120/
│       ├── feature_0.json      # Detailed JSON for feature 0
│       ├── feature_1.json      # Detailed JSON for feature 1
│       ├── ...                 # (1,000 feature files total)
│       └── config.json         # Consolidation config and statistics
├── master/                     # Master parquet files for analysis ✅ NEW
│   ├── features.parquet            # Master table with 2,471 rows (1,648 features)
│   ├── feature_analysis.metadata.json      # Processing metadata and statistics
│   ├── semantic_similarity_pairwise.parquet # Pairwise LLM similarity (2,470 rows) ✅ NEW
│   ├── semantic_similarity_pairwise.parquet.metadata.json # Pairwise similarity metadata ✅ NEW
│   ├── consistency_scores.parquet          # Pre-computed consistency scores (2,471 rows) ✅ Phase 8
│   ├── consistency_scores.parquet.metadata.json # Consistency scores metadata ✅ Phase 8
│   ├── analyze_features.py                 # Simplified analysis script (103 lines)
│   └── analysis_results_<timestamp>.json   # Analysis output with timestamp
├── llm_comparison/             # LLM comparison statistics ✅ NEW (Phase 5)
│   └── llm_comparison_stats.json           # Pre-calculated consistency scores
├── umap_feature/               # Feature UMAP projections ✅ NEW (Phase 6)
│   └── google--gemma-scope-9b-pt-res--layer_30--width_16k--average_l0_120/
│       ├── umap_embeddings.json            # Feature UMAP coordinates (1000 features)
│       ├── umap_visualization.png          # Static visualization image
│       └── config.json                     # UMAP generation config
├── umap_explanations/          # Explanation UMAP projections ✅ NEW (Phase 6)
│   ├── explanation_umap.json               # Explanation UMAP coordinates (2471 explanations)
│   ├── umap_visualization.png              # Static visualization image
│   └── config.json                         # UMAP generation config
├── umap_clustering/            # Hierarchical cluster data ✅ NEW (Phase 6)
│   ├── feature_clustering.json             # Feature cluster hierarchy (levels 1-4+)
│   ├── explanation_clustering.json         # Explanation cluster hierarchy (levels 1-4+)
│   └── config.json                         # Clustering configuration
└── cluster_labels/             # Cluster labeling data ✅ NEW
    ├── cluster_labels.json                 # Cluster label definitions
    └── labeled_explanation_clusters.json   # Labeled cluster data
```

## Data Flow Pipeline

### 1. Raw Data Input
- **Explanations**: Text files containing natural language explanations for SAE features
  - llama_e-llama_s: 824 files
  - gwen_e-llama_s: 824 files
  - openai_e-llama_s: 823 files
  - **Total**: 2,471 explanations across 1,000 unique features
- **Scores**: JSON files with evaluation scores from different scoring methods
  - `fuzz`: Binary correct/incorrect scores from fuzzing tests
  - `detection`: Binary correct/incorrect scores from detection tests
  - `simulation`: Numerical correlation scores from simulation tests
- **Run Config**: `run_config.json` containing SAE experiment metadata and model configurations

### 2. Processing Steps (All Implemented ✅)

#### A. Embedding Generation (`generate_embeddings.py`)
- Converts explanation text to vector embeddings using configurable models
- Default: Gemini embedding model with semantic similarity task type
- **SAE ID Integration**: Automatically extracts SAE ID from `run_config.json`
- **Enhanced Metadata**: Includes `llm_explainer` and `explanation_method` from config
- **Processed Data**: 2,471 embeddings across 3 LLM explainers (Llama, Qwen, OpenAI)
- Outputs: Vector embeddings with metadata and configuration tracking

#### B. Score Processing (`process_scores.py`)
- Aggregates raw scores into statistical summaries per feature
- Different logic for binary vs numerical scores:
  - **Binary (fuzz/detection)**: Calculates accuracy rates, no variance
  - **Numerical (simulation)**: Calculates mean correlation and variance
- **SAE ID Integration**: Automatically extracts SAE ID from `run_config.json`
- **Enhanced Metadata**: Includes `llm_scorer` from config
- Outputs: Per-feature score statistics with success/failure counts

#### C. Semantic Distance Calculation (`calculate_semantic_distances.py`)
- Computes pairwise distances between embeddings from different sources
- Supports multiple distance metrics (cosine, euclidean)
- **SAE ID Integration**: Tracks SAE IDs from both data sources
- Outputs: Distance matrices with original explanations for comparison

#### D. Detailed JSON Consolidation (`generate_detailed_json.py`) ✅
- **Comprehensive Data Merging**: Combines all processed data per feature
- **Automatic Discovery**: Finds all data sources matching specified SAE ID
- **Explanation ID Generation**: Creates unique IDs (exp_001, exp_002, etc.)
- **Complete Integration**: Merges embeddings, scores, and semantic distances
- **Dataset Size**: 1,000 feature files with complete analysis data
- Outputs: Individual detailed JSON file per feature

#### E. Feature Similarity Calculation ✅ NEW
- **SAE Feature Analysis**: Computes cosine similarities between SAE feature vectors
- **Closest Similarity Detection**: Finds minimum magnitude cosine similarity for each feature
- **Scalable Processing**: Handles large feature sets (1000+ features) efficiently
- **Memory Optimization**: Uses float16 precision and automatic device selection
- Outputs: Per-feature closest cosine similarity values for feature splitting analysis

#### F. Master Parquet Creation (`create_master_parquet.py`) ✅
- **Scalable Data Format**: Converts detailed JSON to optimized Polars DataFrame
- **Enhanced Feature Splitting**: Uses cosine similarity values instead of boolean
- **Professional Path Handling**: Generates portable relative paths without user-specific information
- **Robust Schema**: Proper data types with Float32 feature_splitting for continuous analysis
- **Smart Path Resolution**: Works from any directory with automatic project root detection
- Outputs: Master parquet file ready for high-performance analysis and visualization

#### G. Pairwise Similarity Parquet Creation (`create_pairwise_similarity_parquet.py`) ✅ NEW
- **Normalized Schema**: Extracts pairwise semantic similarities from detailed JSON files
- **LLM Explainer Mapping**: Maps internal explanation IDs to full LLM model names (exact match with master parquet)
- **Consistent Ordering**: Alphabetically sorts explainer pairs to prevent duplicates
- **Research-Optimized**: Scalable to any number of LLM explainers (not hardcoded to 3)
- **Statistical Metadata**: Generates comprehensive pairwise statistics per LLM combination
- Outputs: Normalized parquet file with 2,470 rows (824 features × 3 pairwise combinations average)

#### H. Consistency Score Pre-computation (`8_precompute_consistency_scores.py`) ✅ Phase 8 - NEW
- **Comprehensive Consistency Calculation**: Pre-computes 8 consistency metrics for all features
- **Performance Optimization**: Batch calculation reduces Sankey generation time by avoiding runtime computation
- **Consistency Types**:
  - LLM Scorer Consistency (fuzz, detection): Consistency across scorers for same explainer+metric
  - Within-Explanation Metric Consistency: Consistency across metrics within same explainer (z-score normalized)
  - Cross-Explanation Metric Consistency (embedding, fuzz, detection): Per-metric consistency across explainers
  - Cross-Explanation Overall Score Consistency: Overall score consistency across explainers
  - LLM Explainer Consistency: Semantic similarity between explanations from different LLMs
- **Data-Driven max_std Values**: Computes actual max standard deviation from data for normalization
- **Z-score Normalization**: Uses global statistics for fair cross-metric comparison
- **Metadata Generation**: Comprehensive metadata with column descriptions, statistics, and consistency methods
- Outputs: consistency_scores.parquet (2,471 rows × 8 consistency columns) with metadata JSON

### 3. Completed Output Formats ✅

#### A. Detailed JSON Format ✅
The pipeline produces comprehensive per-feature JSON files with this structure:

```json
{
  "feature_id": 123,
  "sae_id": "google/gemma-scope-9b-pt-res/layer_30/width_16k/average_l0_120",
  "explanations": [
    {
      "explanation_id": "exp_001",
      "text": "This feature seems to activate on concepts related to network security protocols...",
      "explanation_method": "quantiles",
      "llm_explainer": "claude-3-opus",
      "data_source": "llama_e-llama_s"
    }
  ],
  "semantic_distance_pairs": [
    {
      "pair": ["exp_001", "exp_002"],
      "cosine_distance": 0.08
    }
  ],
  "scores": [
    {
      "llm_scorer": "gpt-4-turbo",
      "data_source": "llama_e-llama_s",
      "score_fuzz": 0.89,
      "score_simulation": 0.92,
      "score_detection": 0.85,
      "score_embedding": 0.95
    }
  ]
}
```

#### B. Master Parquet Schema ✅ NEW
High-performance columnar format optimized for analysis with this schema:

| Column | Type | Description |
|--------|------|-------------|
| `feature_id` | UInt32 | SAE feature index (0-823) |
| `sae_id` | Categorical | SAE model identifier |
| `explanation_method` | Categorical | Method used for explanation generation |
| `llm_explainer` | Categorical | LLM model used for explanations |
| `llm_scorer` | Categorical | LLM model used for scoring |
| `feature_splitting` | **Float32** | **Closest cosine similarity magnitude** |
| `semdist_mean` | Float32 | Average semantic distance between explanations |
| `semdist_max` | Float32 | Maximum semantic distance between explanations |
| `score_fuzz` | Float32 | Fuzzing evaluation score |
| `score_simulation` | Float32 | Simulation evaluation score |
| `score_detection` | Float32 | Detection evaluation score |
| `score_embedding` | Float32 | Embedding evaluation score |
| `details_path` | Utf8 | Portable relative path to detailed JSON |

**Key Enhancement**: `feature_splitting` now contains **continuous cosine similarity values** instead of boolean, enabling more nuanced analysis of feature separation characteristics.

#### C. Pairwise Similarity Parquet Schema ✅ NEW
Normalized schema for querying semantic similarity between specific LLM explainers:

| Column | Type | Description |
|--------|------|-------------|
| `feature_id` | UInt32 | SAE feature index (0-823) |
| `sae_id` | Categorical | SAE model identifier |
| `explainer_1` | Categorical | First LLM explainer (full model name) |
| `explainer_2` | Categorical | Second LLM explainer (full model name) |
| `cosine_similarity` | Float32 | Cosine similarity between explanations |
| `euclidean_similarity` | Float32 | Euclidean similarity (nullable, currently null) |

**LLM Explainer Values (matching master parquet):**
- `hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4`
- `Qwen/Qwen3-30B-A3B-Instruct-2507-FP8`
- `openai/gpt-oss-20b`

**Example Queries:**
```python
import polars as pl

# Load parquet
df = pl.read_parquet("data/master/semantic_similarity_pairwise.parquet")

# Get Llama-Qwen similarities
llama_qwen = df.filter(
    (pl.col("explainer_1") == "Qwen/Qwen3-30B-A3B-Instruct-2507-FP8") &
    (pl.col("explainer_2") == "hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4")
)

# Average similarity per explainer pair
pair_stats = df.group_by(["explainer_1", "explainer_2"]).agg([
    pl.col("cosine_similarity").mean().alias("mean_similarity"),
    pl.col("cosine_similarity").std().alias("std_similarity")
])
```

**Pairwise Statistics (824 features):**
- **Qwen vs Llama**: mean=0.926, range=[0.776-1.0], std=0.052 (824 pairs)
- **Llama vs OpenAI**: mean=0.862, range=[0.763-0.952], std=0.039 (823 pairs)
- **Qwen vs OpenAI**: mean=0.867, range=[0.757-0.949], std=0.040 (823 pairs)

#### D. Consistency Scores Parquet Schema ✅ Phase 8 - NEW
Pre-computed consistency scores for performance optimization:

| Column | Type | Description |
|--------|------|-------------|
| `feature_id` | UInt32 | SAE feature index (0-823) |
| `llm_explainer` | Categorical | LLM model used for explanations |
| `llm_scorer_consistency_fuzz` | Float32 | Consistency across scorers for fuzz metric: `1 - (std / max_std_actual)` |
| `llm_scorer_consistency_detection` | Float32 | Consistency across scorers for detection metric: `1 - (std / max_std_actual)` |
| `within_explanation_metric_consistency` | Float32 | Consistency across 3 metrics within explainer (z-score normalized): `1 - (std_z / max_std_z)` |
| `cross_explanation_metric_consistency_embedding` | Float32 | Embedding consistency across explainers: `1 - (std / max_std_actual)` |
| `cross_explanation_metric_consistency_fuzz` | Float32 | Fuzz consistency across explainers: `1 - (std / max_std_actual)` |
| `cross_explanation_metric_consistency_detection` | Float32 | Detection consistency across explainers: `1 - (std / max_std_actual)` |
| `cross_explanation_overall_score_consistency` | Float32 | Overall score consistency across explainers: `1 - (std / max_std_actual)` |
| `llm_explainer_consistency` | Float32 | Semantic similarity between explanations: `avg_pairwise_cosine_similarity` |

**Consistency Formulas:**
- **Std-based consistency**: `1 - (std / max_std_actual)` where max_std_actual is data-driven
- **Z-score normalization**: For within-explanation, uses `(value - global_mean) / global_std`
- **Semantic similarity**: Average pairwise cosine similarity from pairwise parquet

**Statistics (2,471 rows):**
- **LLM Scorer Consistency (fuzz)**: mean=0.771, std=0.142, range=[0.0-1.0]
- **LLM Scorer Consistency (detection)**: mean=0.791, std=0.144, range=[0.0-1.0]
- **Within-Explanation Metric Consistency**: mean=0.738, std=0.155, range=[0.0-0.998]
- **Cross-Explanation Embedding**: mean=0.818, std=0.131, range=[0.0-0.994]
- **Cross-Explanation Fuzz**: mean=0.798, std=0.151, range=[0.0-0.996]
- **Cross-Explanation Detection**: mean=0.782, std=0.172, range=[0.0-1.0]
- **Cross-Explanation Overall Score**: mean=0.807, std=0.147, range=[0.0-0.992]
- **LLM Explainer Consistency**: mean=0.877, std=0.030, range=[0.801-0.954]

**Usage:**
- **Sankey Classification**: Use consistency scores for percentile-based feature classification
- **TablePanel**: Overlay consistency values on feature-level scoring table
- **Performance**: Pre-computed values eliminate runtime calculation overhead

## Configuration Management

All processing scripts use configuration files to ensure:
- **Reproducibility**: Config files are saved alongside outputs
- **Flexibility**: Easy to change data sources, models, or parameters
- **Traceability**: Full audit trail of processing parameters

## Current Data Sources

- **llama_e-llama_s**: Explanations generated by Llama (hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4), scored by Llama - 824 features
- **gwen_e-llama_s**: Explanations generated by Qwen (Qwen/Qwen3-30B-A3B-Instruct-2507-FP8), scored by Llama - 824 features
- **openai_e-llama_s**: Explanations generated by OpenAI (openai/gpt-oss-20b), scored by Llama - 823 features

**Total Dataset**: 2,471 rows covering 1,000 unique features (some features have up to 3 LLM explanations)

Additional data sources can be added by:
1. Creating new directories under `raw/`
2. Adding corresponding config files
3. Running processing scripts with new configs

## Usage Examples

### Complete Pipeline Execution:
```bash
cd data/preprocessing/scripts

# 1. Generate embeddings for explanations
python generate_embeddings.py --config ../config/embedding_config.json

# 2. Process raw scores into statistics
python process_scores.py --config ../config/score_config.json

# 3. Calculate semantic distances between explanation sources
python calculate_semantic_distances.py --config ../config/semantic_distance_config.json

# 4. Consolidate all data into detailed JSON per feature
python generate_detailed_json.py --config ../config/detailed_json_config.json

# 5. Create master parquet with cosine similarity
python create_master_parquet.py --config ../config/master_parquet_config.json

# 6. Create pairwise similarity parquet
python create_pairwise_similarity_parquet.py --config ../config/pairwise_similarity_config.json

# 7. ✅ Phase 8: Pre-compute consistency scores
python 8_precompute_consistency_scores.py
```

### Individual Script Usage:
```bash
# Validate existing master parquet
python create_master_parquet.py --config ../config/master_parquet_config.json --validate-only

# Create pairwise similarity parquet
python create_pairwise_similarity_parquet.py --config ../config/pairwise_similarity_config.json

# Pre-compute consistency scores (Phase 8)
python 8_precompute_consistency_scores.py

# Run from project root (alternative)
cd /path/to/interface
python data/preprocessing/scripts/create_master_parquet.py --config data/preprocessing/config/master_parquet_config.json
python data/preprocessing/scripts/create_pairwise_similarity_parquet.py --config data/preprocessing/config/pairwise_similarity_config.json
python data/preprocessing/scripts/8_precompute_consistency_scores.py
```

## Pipeline Status & Next Steps

### ✅ Completed (Production Ready)
1. **Raw Data Processing**: Complete extraction and normalization ✅
2. **Embedding Generation**: Vector embeddings with metadata ✅
3. **Score Processing**: Statistical aggregation with proper typing ✅
4. **Semantic Distance Calculation**: Multi-metric distance computation ✅
5. **Detailed JSON Consolidation**: Comprehensive per-feature data ✅
6. **Feature Similarity Analysis**: Cosine similarity computation ✅
7. **Master Parquet Creation**: High-performance columnar format ✅
8. **Pairwise Similarity Parquet**: Normalized LLM explainer comparison data ✅
9. **Consistency Score Pre-computation**: 8 consistency metrics for Sankey classification ✅ Phase 8

### 🎯 Current Achievement
- **Complete End-to-End Pipeline**: From raw SAE data to analysis-ready parquet with pre-computed consistency
- **Advanced Feature Analysis**: Cosine similarity-based feature splitting detection
- **Consistency Pre-computation**: 8 consistency metrics for performance-optimized Sankey classification
- **Production-Grade Code**: Professional path handling, robust error handling, portable configuration
- **Optimized Performance**: Polars DataFrame with proper schema and categorical types
- **Full Documentation**: Comprehensive usage examples and schema documentation

### 🔮 Future Enhancements (Optional)
1. **Additional Similarity Metrics**: Euclidean, Manhattan distance for feature comparison
2. **Advanced Aggregations**: Feature clustering based on similarity patterns
3. **Performance Monitoring**: Processing time and memory usage tracking
4. **Multi-SAE Support**: Batch processing across different SAE models
5. **Visualization Integration**: Direct integration with plotting libraries

The data processing pipeline is now **complete and production-ready** for comprehensive SAE feature interpretability analysis!

## Integration with Visualization System

The master parquet file (`features.parquet`) is the primary data source for the FastAPI backend:

### Backend Integration (✅ ACTIVE)
- **Location**: `/data/master/features.parquet` and `/data/master/consistency_scores.parquet`
- **Backend Service**: Loaded by `DataService` (`backend/app/services/visualization_service.py`) and `ConsistencyService`
- **Lazy Loading**: Polars LazyFrame with string cache optimization
- **Dataset Size**: 1,648 features processed (824 from llama_e-llama_s + 824 from gwen_e-llama_s)
- **Consistency Scores**: 2,471 rows × 8 pre-computed consistency metrics for optimal performance
- **Usage**: Powers all visualization endpoints (Sankey, Histogram, Alluvial, Linear Set, LLM Comparison, TablePanel)

### Visualization Support
The parquet schema is optimized for multiple visualization types:

1. **Sankey Diagrams**: Multi-stage feature classification using threshold trees
   - Uses: `feature_splitting`, `semdist_mean`, scoring metrics

2. **Histogram Visualizations**: Distribution analysis for threshold setting
   - Uses: All numeric columns with bin-based aggregation

3. **Alluvial Flows**: Cross-panel feature tracking and comparison
   - Uses: Full feature set with classification metadata

4. **Linear Set Diagrams** (Phase 4): Scoring metric agreement analysis
   - Uses: `score_fuzz`, `score_detection`, `score_simulation`, `score_embedding`
   - Category metadata: `semdist_mean`, `feature_splitting`

5. **LLM Comparison** (Phase 5 - ✅ COMPLETE): Model consistency analysis and correlation visualization
   - Uses: `llm_explainer`, `llm_scorer` metadata for model identification
   - **Data Source**: `/data/llm_comparison/llm_comparison_stats.json` with pre-calculated statistics
   - **Explainer Consistency**: Cosine similarity between explanation embeddings
   - **Scorer Consistency**: RV coefficient between scoring vectors
   - Frontend: Triangle-based visualization with green→yellow→red color gradient

6. **UMAP Visualization** (Phase 6 - ✅ COMPLETE): Interactive dimensionality reduction with hierarchical clustering
   - Uses: Pre-calculated UMAP projections for features and explanations
   - **Data Sources**:
     - `/data/umap_feature/.../umap_embeddings.json`: Feature coordinates (1000 features)
     - `/data/umap_explanations/explanation_umap.json`: Explanation coordinates (2471 explanations)
     - `/data/umap_clustering/`: Hierarchical cluster metadata (levels 1-4+)
   - **Features**: Interactive zoom/pan, multi-level clustering, cross-panel linking
   - Frontend: Dual-panel visualization with d3-zoom and d3-polygon convex hulls

### Performance Characteristics
- **Response Times**: Sub-second for all visualization queries
- **Dataset Size**: 2,471 rows (1,000 unique features × ~2.5 avg LLM explainers)
- **Optimization**: ParentPath-based caching for 20-30% faster Sankey generation
- **Memory Efficiency**: Lazy evaluation prevents loading full dataset into memory
- **Scalability**: Designed to handle 16K+ features with same architecture

## Analysis Tools

### analyze_features.py (Simplified - January 2025)

**Purpose**: Quick data inspection and validation for features.parquet

**Features**:
- **Compact Design**: 103 lines (simplified from 593 lines, ~83% reduction)
- **Column Analysis**: Shows data type, unique count, null count for each column
- **Categorical Display**: Lists all values with counts for columns with ≤20 unique values
- **Numerical Ranges**: Shows min, max, mean for numerical columns
- **JSON Export**: Saves results to timestamped JSON file

**Usage**:
```bash
cd /home/dohyun/interface/data/master
python analyze_features.py

# Output: analysis_results_YYYYMMDD_HHMMSS.json
```

**Output Format**:
```json
{
  "timestamp": "20251010_024207",
  "dataset_info": {
    "total_rows": 2471,
    "total_columns": 13,
    "unique_features": 824
  },
  "columns": {
    "feature_id": {
      "dtype": "UInt32",
      "n_unique": 824,
      "n_nulls": 0,
      "range": {"min": 0.0, "max": 999.0, "mean": 499.64}
    },
    "llm_explainer": {
      "dtype": "Categorical",
      "n_unique": 3,
      "n_nulls": 0,
      "values": {
        "Qwen/Qwen3-30B-A3B-Instruct-2507-FP8": 824,
        "hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4": 824,
        "openai/gpt-oss-20b": 823
      }
    }
  }
}
```

**Key Metrics Validated**:
- 2,471 total rows (1,000 unique features with multiple LLM explainers)
- 13 columns with proper data types
- **LLM Explainers**:
  - Qwen/Qwen3-30B-A3B-Instruct-2507-FP8: 824 rows
  - hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4: 824 rows
  - openai/gpt-oss-20b: 823 rows
- **LLM Scorers**: Llama 3.1 70B (all 2,471 rows)
- Score metrics with null handling (simulation: 1,022 nulls, embedding: 1,472 nulls)