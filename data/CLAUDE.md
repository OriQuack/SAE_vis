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
│   │   └── generate_detailed_json.py        # Consolidate all data per feature
│   ├── config/                 # Configuration files for processing
│   │   ├── embedding_config.json            # Embedding generation config
│   │   ├── score_config.json                # Score processing config
│   │   ├── gwen_score_config.json           # Gwen-specific score config
│   │   ├── semantic_distance_config.json    # Semantic distance config
│   │   └── detailed_json_config.json        # Detailed JSON consolidation config
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
└── detailed_json/              # Final consolidated data per feature ✅ IMPLEMENTED
    └── google--gemma-scope-9b-pt-res--layer_30--width_16k--average_l0_120/
        ├── feature_0.json      # Detailed JSON for feature 0
        ├── feature_1.json      # Detailed JSON for feature 1
        ├── ...                 # (824 feature files total)
        └── config.json         # Consolidation config and statistics
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

### 3. Completed Output Format: Detailed JSON ✅

The pipeline now produces comprehensive per-feature JSON files with this structure:

```json
{
  "feature_id": 123,
  "sae_id": "gemma-scope-9b-pt-res/layer_30/width16k/average_l0_120",
  "explanations": [
    {
      "explanation_id": "exp_001",
      "text": "This feature seems to activate on concepts related to network security protocols...",
      "explanation_method": "quantiles",
      "llm_explainer": "claude-3-opus"
    }
  ],
  "semantic_distance_pairs": [
    {
      "pair": ["exp_001", "exp_002"],
      "distance": 0.08
    }
  ],
  "scores": [
    {
      "llm_scorer": "gpt-4-turbo",
      "score_fuzz": 0.89,
      "score_simulation": 0.92,
      "score_detection": 0.85,
      "score_embedding": 0.95
    }
  ],
  "activating_examples": [
    {
      "text": "...the implementation of the SSL/TLS handshake protocol...",
      "activation_values": [0.05, 0.12, 0.45, 0.98, 0.85, 0.60, 0.21]
    }
  ]
}
```

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

### Generate embeddings for a data source:
```bash
cd data/preprocessing/scripts
python generate_embeddings.py --config ../config/embedding_config.json
```

### Process scores for evaluation:
```bash
python process_scores.py --config ../config/score_config.json
```

### Calculate semantic distances between sources:
```bash
python calculate_semantic_distances.py --config ../config/semantic_distance_config.json
```

## Next Steps

To complete the pipeline, implement:
1. **Detailed JSON consolidation script** that combines all processed data
2. **SAE ID mapping** from current data source names to proper SAE identifiers
3. **Activating examples extraction** from raw data files
4. **Multi-scorer support** for different LLM scoring systems

This will enable comprehensive analysis of SAE feature interpretability across different explanation methods and evaluation metrics.