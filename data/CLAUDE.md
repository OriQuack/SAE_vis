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
│   └── gwen_e-llama_s/         # Gwen explanations + Llama scores
│       ├── explanations/        # Feature explanation text files (824 files)
│       ├── scores/              # Scoring method results
│       │   ├── fuzz/           # Fuzzing-based scores (binary correct/incorrect)
│       │   ├── detection/      # Detection-based scores (binary correct/incorrect)
│       │   └── simulation/     # Simulation-based scores (ev_correlation_score)
│       └── run_config.json     # SAE experiment configuration
├── preprocessing/               # Processing scripts and configurations
│   ├── scripts/                # Python processing scripts
│   │   ├── generate_embeddings.py           # Create embeddings from explanations
│   │   ├── process_scores.py                # Process scores from raw files
│   │   ├── calculate_semantic_distances.py  # Calculate distances between embeddings
│   │   ├── generate_detailed_json.py        # Consolidate all data per feature
│   │   └── create_master_parquet.py         # Create master parquet from detailed JSON ✅ NEW
│   ├── config/                 # Configuration files for processing
│   │   ├── embedding_config.json            # Embedding generation config
│   │   ├── score_config.json                # Score processing config
│   │   ├── gwen_score_config.json           # Gwen-specific score config
│   │   ├── semantic_distance_config.json    # Semantic distance config
│   │   ├── detailed_json_config.json        # Detailed JSON consolidation config
│   │   ├── feature_similarity_config.json   # Feature similarity calculation config ✅ NEW
│   │   └── master_parquet_config.json       # Master parquet creation config ✅ NEW
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
│       ├── ...                 # (824 feature files total)
│       └── config.json         # Consolidation config and statistics
└── master/                     # Master parquet files for analysis ✅ NEW
    ├── feature_analysis.parquet            # Master table with cosine similarity
    └── feature_analysis.metadata.json      # Processing metadata and statistics
```

## Data Flow Pipeline

### 1. Raw Data Input
- **Explanations**: Text files containing natural language explanations for SAE features (824 files per data source)
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
- Outputs: Individual detailed JSON file per feature

#### E. Feature Similarity Calculation ✅ NEW
- **SAE Feature Analysis**: Computes cosine similarities between SAE feature vectors
- **Closest Similarity Detection**: Finds minimum magnitude cosine similarity for each feature
- **Scalable Processing**: Handles large feature sets (1000+ features) efficiently
- **Memory Optimization**: Uses float16 precision and automatic device selection
- Outputs: Per-feature closest cosine similarity values for feature splitting analysis

#### F. Master Parquet Creation (`create_master_parquet.py`) ✅ NEW
- **Scalable Data Format**: Converts detailed JSON to optimized Polars DataFrame
- **Enhanced Feature Splitting**: Uses cosine similarity values instead of boolean
- **Professional Path Handling**: Generates portable relative paths without user-specific information
- **Robust Schema**: Proper data types with Float32 feature_splitting for continuous analysis
- **Smart Path Resolution**: Works from any directory with automatic project root detection
- Outputs: Master parquet file ready for high-performance analysis and visualization

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

## Configuration Management

All processing scripts use configuration files to ensure:
- **Reproducibility**: Config files are saved alongside outputs
- **Flexibility**: Easy to change data sources, models, or parameters
- **Traceability**: Full audit trail of processing parameters

## Current Data Sources

- **llama_e-llama_s**: Explanations generated by Llama, scored by Llama
- **gwen_e-llama_s**: Explanations generated by Gwen, scored by Llama

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

# 5. ✅ NEW: Create master parquet with cosine similarity
python create_master_parquet.py --config ../config/master_parquet_config.json
```

### Individual Script Usage:
```bash
# Validate existing master parquet
python create_master_parquet.py --config ../config/master_parquet_config.json --validate-only

# Run from project root (alternative)
cd /path/to/interface
python data/preprocessing/scripts/create_master_parquet.py --config data/preprocessing/config/master_parquet_config.json
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

### 🎯 Current Achievement
- **Complete End-to-End Pipeline**: From raw SAE data to analysis-ready parquet
- **Advanced Feature Analysis**: Cosine similarity-based feature splitting detection
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