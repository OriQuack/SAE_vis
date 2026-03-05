# SAE Preprocessing Pipeline

This pipeline transforms raw SAE experimental data into analysis-ready parquet files for the backend visualization system.

## Quick Start

```bash
# Run the full pipeline
python data/pipeline/run.py

# Run specific steps (automatically includes dependencies)
python data/pipeline/run.py --steps step_06_clustering step_10_activation_display

# Run specific steps (do not include dependencies)
python data/pipeline/run.py --steps step_06_clustering --no-deps

# Run from a specific step onwards
python data/pipeline/run.py --from step_06_clustering

# Dry run (show execution plan without running)
python data/pipeline/run.py --dry-run

# List all available steps
python data/pipeline/run.py --list

# Limit features for testing
python data/pipeline/run.py --limit 100
```

## Directory Structure

```
pipeline/
├── README.md           # This file
├── config.yaml         # Master configuration (paths, parameters, dependencies)
├── run.py              # Main orchestration script
├── core/               # Shared utilities
│   ├── base.py         # BaseProcessor class
│   ├── paths.py        # Path resolution
│   ├── logging.py      # Logging setup
│   ├── metadata.py     # Parquet metadata generation
│   ├── tokens.py       # Token normalization
│   ├── ngrams.py       # N-gram extraction
│   ├── sampling.py     # Quantile sampling
│   └── embeddings.py   # Embedding utilities
├── steps/              # Processing step implementations
│   ├── step_01_activations.py
│   ├── step_02_decoder_similarity.py
│   ├── ...
│   ├── step_13_explanation_consensus.py
│   └── step_14_svm_metrics.py
└── logs/               # Step execution logs
```

## Pipeline Steps

| Step | Description | Output |
|------|-------------|--------|
| 01 | Extract activation examples from raw data | `intermediate/activation_examples.parquet` |
| 02 | Compute decoder weight cosine similarities | `intermediate/decoder_similarity_matrix.npz` |
| 03 | Aggregate scoring metrics from LLM scorers | `intermediate/aggregated_scores.parquet` |
| 04 | Generate explanation embeddings | `intermediate/explanation_embeddings.parquet` |
| 05 | Pre-compute activation embeddings | `intermediate/activation_embeddings.parquet` |
| 06 | Hierarchical clustering of features (Ward's linkage) | `output/clustering_linkage.npy` |
| 07 | Create main features parquet | `output/features.parquet` |
| 08 | Calculate intra-feature activation similarity | `intermediate/activation_example_similarity.parquet` |
| 09 | Calculate inter-feature activation similarity | `intermediate/interfeature_similarity.parquet` |
| 10 | Create frontend-optimized activation display | `output/activation_display.parquet` |
| 11 | Process interfeature display data | `output/interfeature_similarity.parquet` |
| 12 | Generate cross-explainer phrase alignments | `output/explanation_alignment.parquet` |
| 13 | Explanation consensus (phrase clustering) | `output/explanation_consensus.parquet` |
| 14 | Pre-aggregate SVM metrics for classification | `output/svm_feature_metrics.parquet`, `output/svm_pair_metrics.parquet` |

## Output Files (Backend Required)

These files in `data/output/` are required by the backend:

| File | Size | Purpose |
|------|------|---------|
| `features.parquet` | ~4MB | Main feature dataset with scores and similarities |
| `activation_display.parquet` | ~64MB | Frontend-optimized activation examples |
| `interfeature_similarity.parquet` | ~69MB | Cross-feature similarity data |
| `svm_feature_metrics.parquet` | ~1MB | Pre-aggregated metrics for Stage 2/3 SVM |
| `svm_pair_metrics.parquet` | ~10MB | Pre-computed pair metrics for Stage 1 SVM |
| `explanation_alignment.parquet` | ~400KB | Aligned phrases across explainers |
| `clustering_linkage.npy` | ~500KB | Hierarchical clustering linkage matrix |

## Dependency Graph

```
step_01_activations ──────────────────────┬──► step_05_activation_embeddings
                                          │            │
step_02_decoder_similarity ──┬──► step_06_clustering   ├──► step_08_activation_similarity
                             │            │            │            │
                             │            ▼            │            ▼
step_03_scores ──────────────┼──► step_07_features     └──► step_10_activation_display
                             │            │                         │
step_04_explanation_embeddings            │                         │
                             │            │                         │
                             └──► step_09_interfeature_similarity   │
                                          │                         │
                                          ▼                         │
                                  step_11_interfeature_display      │
                                          │                         │
                                          └─────────┬───────────────┘
                                                    │
                                          step_07_features
                                                    │
                                                    ▼
                                          step_12_explanation_alignment
                                                    │
                                                    ▼
                                          step_13_explanation_consensus
                                                    │
                                                    ▼
                                          step_14_svm_metrics
```

## Configuration

All settings are in `config.yaml`:

- **Global settings**: SAE ID, paths, embedding model, data sources
- **Step configurations**: Inputs, outputs, and parameters per step
- **Dependencies**: Execution order based on data dependencies
- **Backend required**: List of output files needed by the backend

### Variable Interpolation

Config supports `${path.key}` syntax:
```yaml
inputs:
  features: "${output}/features.parquet"  # Resolves to data/output/features.parquet
```

## Logs

Each step writes logs to `pipeline/logs/{step_name}.log` for debugging.

## Adding a New Step

1. Create `steps/step_XX_name.py` with a processor class
2. Add configuration to `config.yaml` under `steps:`
3. Add dependencies to `dependencies:` section
4. Register the step in `steps/__init__.py`

## Common Operations

```bash
# Regenerate only SVM metrics (after schema changes)
python data/pipeline/run.py --steps step_14_svm_metrics

# Regenerate activation display and downstream
python data/pipeline/run.py --from step_10_activation_display

# Test with limited features
python data/pipeline/run.py --limit 100 --steps step_06_features

# Check what would run without executing
python data/pipeline/run.py --dry-run --from step_10_activation_display
```
