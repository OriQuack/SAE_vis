# Data Processing Pipeline Guide

This guide explains how to use the automated pipeline runner for SAE feature analysis data preprocessing.

## Quick Start

### Run Full Pipeline
```bash
cd /home/dohyun/interface/data/preprocessing
python run_pipeline.py
```

### List Available Steps
```bash
python run_pipeline.py --list
```

### Run Specific Steps Only
```bash
# Run only scores and embeddings
python run_pipeline.py --steps scores_llama,embeddings_llama

# Run final consolidation steps
python run_pipeline.py --steps detailed_json,master_parquet

# Run multiple specific steps
python run_pipeline.py --steps feature_similarities,master_parquet
```

## Pipeline Architecture

### Dependency Graph
```
┌─────────────────────────────────────────────────────────────────┐
│                      INDEPENDENT STEPS                           │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│ │ scores_llama    │  │ embeddings_llama│  │ feature_        │  │
│ │ scores_gwen     │  │ embeddings_gwen │  │ similarities    │  │
│ └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│         │                    │                      │            │
│         │                    ├──────────────────────┤            │
│         │                    │                      │            │
├─────────┼────────────────────┼──────────────────────┼────────────┤
│         │                    │                      │            │
│         │            ┌───────▼───────┐              │            │
│         │            │   distances   │              │            │
│         │            └───────┬───────┘              │            │
│         │                    │                      │            │
├─────────┼────────────────────┼──────────────────────┼────────────┤
│         │                    │                      │            │
│         └────────────────────┴──────┐               │            │
│                                     │               │            │
│                            ┌────────▼──────┐        │            │
│                            │ detailed_json │        │            │
│                            └────────┬──────┘        │            │
│                                     │               │            │
│                                     └───────────────┤            │
│                                                     │            │
│                                            ┌────────▼──────┐     │
│                                            │ master_parquet│     │
│                                            └───────────────┘     │
└─────────────────────────────────────────────────────────────────┘

Optional (Visualization):
  - umap_features (independent)
  - umap_explanations (depends on embeddings)
```

## Pipeline Steps Reference

### 1. Score Processing (`scores_llama`, `scores_gwen`)
- **Script**: `process_scores.py`
- **Dependencies**: None (reads from `data/raw/`)
- **Output**: `data/scores/{data_source}/scores.json`
- **Config**: `config/score_config.json` or `config/gwen_score_config.json`

**What it does**: Aggregates raw scoring results (fuzz, detection, simulation) into statistical summaries per feature.

### 2. Embedding Generation (`embeddings_llama`, `embeddings_gwen`)
- **Script**: `generate_embeddings.py`
- **Dependencies**: None (reads from `data/raw/`)
- **Output**: `data/embeddings/{data_source}/embeddings.json`
- **Config**: `config/embedding_config.json` or `config/gwen_embedding_config.json`
- **Note**: Requires `GOOGLE_API_KEY` in `.env` file

**What it does**: Converts explanation text to vector embeddings using Gemini embedding model.

### 3. Semantic Distance Calculation (`distances`)
- **Script**: `calculate_semantic_distances.py`
- **Dependencies**: `embeddings_llama`, `embeddings_gwen`
- **Output**: `data/semantic_distances/llama_e-llama_s_vs_gwen_e-llama_s/semantic_distances.json`
- **Config**: `config/semantic_distance_config.json`

**What it does**: Computes pairwise distances (cosine, euclidean) between embeddings from different sources.

### 4. Feature Similarity Calculation (`feature_similarities`)
- **Script**: `calculate_feature_similarities.py`
- **Dependencies**: None (downloads SAE from HuggingFace)
- **Output**: `data/feature_similarity/{sae_id}/feature_similarities.json`
- **Config**: `config/feature_similarity_config.json`
- **Note**: May require GPU for large feature sets

**What it does**: Computes cosine similarities between SAE feature decoder vectors to detect feature splitting.

### 5. UMAP Generation (Optional)
- **Scripts**: `generate_umap_features.py`, `generate_umap_explanations.py`
- **Dependencies**:
  - `umap_features`: None
  - `umap_explanations`: `embeddings_llama`, `embeddings_gwen`
- **Output**: `data/umap/` or `data/umap_explanations/`
- **Config**: `config/umap_config.json` or `config/umap_explanations_config.json`
- **Status**: DISABLED by default (optional visualization)

**What it does**: Creates 2D UMAP visualizations of feature or explanation embeddings.

### 6. Detailed JSON Consolidation (`detailed_json`)
- **Script**: `generate_detailed_json.py`
- **Dependencies**: `scores_llama`, `embeddings_llama`, `distances`
- **Output**: `data/detailed_json/{sae_id}/feature_*.json` (one per feature)
- **Config**: `config/detailed_json_config.json`

**What it does**: Merges all processed data (embeddings, scores, distances) into comprehensive per-feature JSON files.

### 7. Master Parquet Creation (`master_parquet`)
- **Script**: `create_master_parquet.py`
- **Dependencies**: `detailed_json`, `feature_similarities`
- **Output**: `data/master/feature_analysis.parquet`
- **Config**: `config/master_parquet_config.json`

**What it does**: Converts detailed JSON into optimized Polars parquet format for high-performance analysis and visualization.

## Customizing the Pipeline

### Enable/Disable Steps

Edit `run_pipeline.py` and modify the `PIPELINE_STEPS` list:

```python
{
    "name": "step_name",
    "script": "script.py",
    "config": "../config/config.json",
    "description": "Description",
    "enabled": True,  # Change to False to disable
    "depends_on": [],  # List of dependency step names
    "required_for": []  # List of steps that need this
}
```

### Common Customizations

#### 1. Process Only One Data Source
If you only have `llama_e-llama_s` data:

```python
# In run_pipeline.py, set enabled=False for gwen steps:
{
    "name": "scores_gwen",
    # ...
    "enabled": False,
},
{
    "name": "embeddings_gwen",
    # ...
    "enabled": False,
},
```

#### 2. Skip UMAP Visualizations
UMAP steps are already disabled by default. They're optional and only needed for visualization purposes.

#### 3. Run Only Final Steps
If you've already run earlier steps and want to regenerate only the final output:

```bash
python run_pipeline.py --steps detailed_json,master_parquet
```

This will skip already-completed steps but check dependencies.

#### 4. Add New Data Sources
To add a new data source (e.g., `claude_e-gpt_s`):

1. Create new config files:
   - `config/claude_embedding_config.json`
   - `config/claude_score_config.json`

2. Add new steps to `PIPELINE_STEPS`:
```python
{
    "name": "scores_claude",
    "script": "process_scores.py",
    "config": "../config/claude_score_config.json",
    "description": "Process scores for claude_e-gpt_s data source",
    "enabled": True,
    "required_for": ["detailed_json"]
},
{
    "name": "embeddings_claude",
    "script": "generate_embeddings.py",
    "config": "../config/claude_embedding_config.json",
    "description": "Generate embeddings for claude_e-gpt_s explanations",
    "enabled": True,
    "required_for": ["distances", "detailed_json"]
},
```

3. Update dependencies in `distances` and `detailed_json` steps.

## Troubleshooting

### Missing Dependencies
If a step fails due to missing dependencies:
```bash
# Install Python dependencies
pip install -r requirements.txt

# For UMAP steps, you may need:
pip install umap-learn

# For feature similarities, you may need:
pip install torch transformers huggingface_hub
```

### Config File Not Found
Make sure all config files exist in `data/preprocessing/config/`:
```bash
ls -la data/preprocessing/config/
```

### API Key Issues (Embeddings)
The embedding generation requires Google API key:
```bash
# Create .env file in project root
echo "GOOGLE_API_KEY=your_api_key_here" > .env
```

### Out of Memory (Feature Similarities or UMAP)
For large feature sets, these steps may require substantial memory:

**Option 1**: Reduce feature range in config
```json
{
  "feature_range": {
    "start": 0,
    "end": 1000  // Reduce from 16384 to smaller number
  }
}
```

**Option 2**: Use CPU with float16
```json
{
  "device": "cpu",
  "use_float16": true
}
```

### Step Failed Mid-Pipeline
The pipeline stops at the first failure. To resume:
1. Fix the issue that caused the failure
2. Re-run with `--steps` to skip completed steps:
```bash
# If detailed_json failed, resume from there:
python run_pipeline.py --steps detailed_json,master_parquet
```

## Validation

After running the pipeline, validate the output:

```bash
# Check master parquet file
python scripts/create_master_parquet.py --config config/master_parquet_config.json --validate-only

# Check row counts
cd ../..
python -c "import polars as pl; df = pl.read_parquet('data/master/feature_analysis.parquet'); print(f'Rows: {len(df)}'); print(df.head())"
```

Expected output:
- **Rows**: 1,648 (824 features × 2 explanations per feature)
- **Columns**: 13 (feature_id, sae_id, explanation_method, llm_explainer, llm_scorer, feature_splitting, semdist_mean, semdist_max, score_fuzz, score_simulation, score_detection, score_embedding, details_path)

## Performance Tips

### Parallel Processing
Currently, the pipeline runs steps sequentially. For faster processing:

1. Run independent steps manually in parallel:
```bash
# Terminal 1
python scripts/process_scores.py --config config/score_config.json

# Terminal 2
python scripts/generate_embeddings.py --config config/embedding_config.json

# Terminal 3
python scripts/calculate_feature_similarities.py --config config/feature_similarity_config.json
```

2. Then run dependent steps:
```bash
python run_pipeline.py --steps distances,detailed_json,master_parquet
```

### Batch Processing
For multiple SAE IDs, create separate config files and run in sequence:
```bash
for sae_id in sae1 sae2 sae3; do
    python scripts/create_master_parquet.py --config config/master_parquet_${sae_id}.json
done
```

## Output Locations

After successful pipeline execution:

```
data/
├── scores/
│   ├── llama_e-llama_s/scores.json
│   └── gwen_e-llama_s/scores.json
├── embeddings/
│   ├── llama_e-llama_s/embeddings.json
│   └── gwen_e-llama_s/embeddings.json
├── semantic_distances/
│   └── llama_e-llama_s_vs_gwen_e-llama_s/semantic_distances.json
├── feature_similarity/
│   └── {sae_id}/feature_similarities.json
├── detailed_json/
│   └── {sae_id}/
│       ├── feature_0.json
│       ├── feature_1.json
│       └── ...
└── master/
    ├── feature_analysis.parquet  ← Final output
    └── feature_analysis.metadata.json
```

## Integration with Visualization

The final output (`data/master/feature_analysis.parquet`) is ready for use with the FastAPI backend:

```bash
# Start backend server
cd backend
python start.py

# The backend automatically loads the parquet file and serves visualization endpoints
```

See `backend/CLAUDE.md` for backend integration details.
