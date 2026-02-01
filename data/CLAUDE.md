# Data CLAUDE.md - SAE Feature Data Processing & Storage

Professional guidance for the data layer of the SAE Feature Visualization research prototype.

## Data Layer Overview

**Purpose**: Transform raw SAE experiments into analysis-ready parquet files
**Status**: Conference-ready research prototype
**Architecture**: Dual n-gram pattern matching (character + word level) with pre-computed embeddings
**Storage**: ~300MB compressed parquet files (output directory only)

## Important Development Principles

### This is a Conference Prototype
- **Keep data processing simple**: Straightforward parquet generation suitable for research demonstrations
- **Avoid over-engineering**: Don't add complex data pipelines, validation layers, or monitoring unless needed
- **Research-focused**: Easy data manipulation and re-processing more important than production-level optimization
- **Reproducible but flexible**: Config files for tracking, but prioritize easy modification

### Using the New Pipeline (Recommended)

The preprocessing pipeline has been refactored with a single master config and master script.

```bash
# Run full pipeline
python data/pipeline/run.py

# Run specific steps (automatically includes dependencies)
python data/pipeline/run.py --steps step_07_features step_10_activation_display

# Run from a specific step onwards
python data/pipeline/run.py --from step_07_features

# Dry run (show execution plan)
python data/pipeline/run.py --dry-run

# List all available steps
python data/pipeline/run.py --list

# Limit features for testing
python data/pipeline/run.py --limit 100
```

Configuration is in `data/pipeline/config.yaml` - a single YAML file containing all settings.

### Legacy Scripts (Still Supported)

The old numbered scripts in `data/preprocessing/scripts/` still work and are used by the master script during transition.

```bash
# Legacy: Run with --config flag
python 5_act_similarity.py --config ../config/5_act_similarity.json
```

### Code Quality Guidelines

**Before Processing Data:**
1. **Check existing scripts**: Review pipeline/steps/ or preprocessing/scripts/ directories
2. **Understand dependencies**: Check config.yaml dependencies section
3. **Verify data exists**: Ensure raw data files are present before running

**After Processing:**
1. **Remove obsolete files**: Delete old parquet files when schema changes
2. **Clean up intermediate data**: Remove temporary processing files
3. **Update metadata**: Parquet files auto-generate metadata, but verify correctness
4. **Test basic queries**: Use simple Polars queries to verify data structure

## Directory Structure

```
data/
├── input/                        # Input data for pipeline
│   ├── activation_examples/      # Raw activation data (activations.jsonl, prompts.json)
│   ├── gemini_e-llama_s-16k-v2/  # Gemini explainer run config
│   ├── llama_e-llama_s-16k-v2/   # Llama explainer run config
│   ├── openai_e-llama_s-16k-v2/  # OpenAI explainer run config
│   └── neuronpedia_frac_nonzero/ # Neuronpedia fraction nonzero data
│
├── raw/                          # Raw SAE experimental data (explanations, scores)
│
├── pipeline/                     # Refactored preprocessing pipeline
│   ├── config.yaml              # Single master configuration file
│   ├── run.py                   # Master script with dependency resolution
│   ├── core/                    # Shared utilities
│   │   ├── base.py              # BaseProcessor class
│   │   ├── paths.py             # Path resolution utilities
│   │   ├── logging.py           # Logging configuration
│   │   ├── metadata.py          # Metadata generation
│   │   ├── tokens.py            # Token normalization, window extraction
│   │   ├── ngrams.py            # N-gram extraction, Jaccard similarity
│   │   ├── sampling.py          # Quantile-based sampling
│   │   └── embeddings.py        # Embedding loading and similarity
│   └── steps/                   # Processing step implementations (14 steps)
│       ├── step_01_activations.py
│       ├── step_02_decoder_similarity.py
│       ├── step_03_scores.py
│       ├── step_04_explanation_embeddings.py
│       ├── step_05_activation_embeddings.py
│       ├── step_06_clustering.py
│       ├── step_07_features.py
│       ├── step_08_activation_similarity.py
│       ├── step_09_interfeature_similarity.py
│       ├── step_10_activation_display.py
│       ├── step_11_interfeature_display.py
│       ├── step_12_explanation_alignment.py
│       ├── step_13_svm_metrics.py
│       └── step_14_explanation_consensus.py
│
├── diagnostics/                 # Diagnostic and analysis scripts
│   ├── diagnose_token_extraction.py
│   ├── analyze_clustering.py
│   ├── visualize_clustering_distribution.py
│   ├── visualize_decoder_similarity_distribution.py
│   └── visualize_similarity_distributions.py
│
├── utilities/                   # Utility scripts (not part of pipeline)
│   └── export_assembled_explanations.py
│
├── intermediate/                # Intermediate processing files
│
├── output/                      # BACKEND-REQUIRED FILES (used by backend)
│   ├── features.parquet         # Main dataset (~4.7MB)
│   ├── activation_display.parquet # Frontend-optimized (~128MB)
│   ├── interfeature_similarity.parquet # Cross-feature (~30MB)
│   ├── svm_feature_metrics.parquet # Feature-level SVM metrics (~569KB)
│   ├── svm_pair_metrics.parquet # Pair-level SVM metrics (~4.1MB)
│   ├── explanation_alignment.parquet # Phrase alignments (~293KB)
│   ├── explanation_consensus.parquet # HDBSCAN phrase clustering (~4.1MB)
│   └── clustering_linkage.npy   # Hierarchical clustering (~512KB)
│
├── Thematic-LM/                 # Thematic analysis (WWW '25 paper)
│   ├── thematic_coding.py       # Main processing script
│   ├── autogen_pipeline.py      # AutoGen orchestration
│   ├── codebook_manager.py      # Embedding-based codebook
│   ├── autogen_agents/          # Agent implementations
│   ├── codebook_history/        # Processing checkpoints
│   └── CLAUDE.md                # Thematic-LM docs
│
└── CLAUDE.md                    # This file
```

## Core Data Files (Output Directory)

All backend-required files are in `/data/output/`.

### 1. features.parquet (PRIMARY - ~4.7MB)
**The main dataset powering all visualizations**

**Key Fields**:
- `feature_id`, `sae_id`, `llm_explainer`, `explanation_text`
- `decoder_similarity`: List of top similar features by decoder weights
- `semantic_similarity`: List of pairwise similarities with other explainers
- `quality_score`: Computed quality metric
- `scores`: Nested structure with all scorer evaluations (embedding, fuzz, detection)
- `frac_nonzero`: Fraction of non-zero activations (used in Stage 3 SVM)

**Usage**: Feature grouping, table display, similarity calculations

### 2. activation_display.parquet (~128MB)
**Frontend-optimized display data**

**Purpose**: Reduce frontend load time (~250x faster than raw data)
**Structure**: Feature-level rows with pre-processed tokens, pattern classification, n-gram positions

**Key Pre-computed Fields**:
- `pattern_type`: Categorical ("Semantic", "Lexical", "Both", "None")
- `best_ngram_type`: "word" or "char" (unified selection, word preferred)
- `best_ngram_text`: The selected n-gram text
- `best_ngram_size`: N-gram size (k value)
- `quantile_examples`: Pre-organized examples with n-gram positions

**Generated by**: `data/pipeline/steps/step_10_activation_display.py`

### 3. interfeature_similarity.parquet (~30MB)
**Cross-feature activation pattern comparison**

**Purpose**: Analyze pattern similarities between decoder-similar features
**Used by**: Cold start service for diversity-based representative sampling, table_data_service for pair display

**Key Pre-computed Fields**:
- `pattern_type`: Categorical ("Semantic", "Lexical", "Both", "None")
- `best_ngram_type`: "word" or "char" (unified selection)
- `best_ngram_text`: The selected n-gram text
- `best_ngram_main_positions`: Positions in main feature (unified format)
- `best_ngram_similar_positions`: Positions in similar feature (unified format)

**Generated by**: `data/pipeline/steps/step_11_interfeature_display.py`

### 4. explanation_alignment.parquet (~293KB)
**Semantically aligned phrases across LLM explanations**

**Purpose**: Highlight shared concepts between different explainers

### 5. svm_feature_metrics.parquet (~569KB)
**Pre-aggregated feature-level SVM metrics**

**Purpose**: Eliminate runtime aggregation for backend SVM-based classification (Stage 2 Quality and Stage 3 Cause)

**Key Columns** (1 row per feature):
- `feature_id` (UInt32)
- Mean metrics across 3 explainers:
  - `score_embedding`, `score_fuzz`, `score_detection`
  - `explanation_semantic_sim`, `frac_nonzero`
- Activation-level metrics (from activation_display):
  - `intra_ngram_jaccard` (max of char/word ngram)
  - `intra_semantic_sim`
- Cross-explainer disagreement (std):
  - `score_embedding_std`, `score_fuzz_std`, `score_detection_std`
  - `explanation_semantic_sim_std`, `intra_semantic_sim_std`

**Note**: `log_frac_nonzero` is computed at runtime during SVM training

**Generated by**: `data/pipeline/steps/step_13_svm_metrics.py`

**Usage**:
- Backend cause_service.py uses for Stage 3 One-vs-Rest SVM classification
- Backend similarity_sort_service.py uses for Stage 2 Quality SVM scoring
- Backend pair_similarity_service.py uses for intra-feature metrics in pair vectors
- No runtime aggregation needed - data is pre-aggregated to 1 row per feature

### 6. svm_pair_metrics.parquet (~4.9MB)
**Pre-computed pair-level SVM metrics**

**Purpose**: Eliminate runtime joins for backend pair similarity scoring (Stage 1 Feature Splitting)

**Key Columns** (1 row per pair):
- `feature_a` (UInt32) - smaller feature ID
- `feature_b` (UInt32) - larger feature ID
- `inter_ngram_jaccard` (Float32) - max(char_jaccard, word_jaccard) from interfeature_similarity
- `inter_semantic_sim` (Float32) - semantic similarity between feature activations
- `decoder_sim` (Float32) - cosine similarity from decoder weights

**Generated by**: `data/pipeline/steps/step_13_svm_metrics.py`

**Usage**:
- Backend pair_similarity_service.py uses for pair-specific metrics in 9-dim pair vectors
- Eliminates complex runtime joins across features.parquet and interfeature_similarity.parquet

### 7. explanation_consensus.parquet (~4.1MB)
**HDBSCAN-based phrase clustering for explanation consensus**

**Purpose**: Analyze consensus of explanations across LLM explainers using phrase clustering

**Key Columns** (1 row per feature):
- `feature_id` (UInt32)
- `consensus_score` (Float32) - Sum of cluster scores (max = num_explainers)
- `num_clusters` (UInt16) - Number of phrase clusters found
- `num_outliers` (UInt16) - Number of outlier phrases
- `clusters` (List[Struct]) - Nested cluster data with:
  - `cluster_id` (-1 for outliers)
  - `medoid_phrase`, `medoid_explainer`
  - `medoid_activation_similarity` - Cosine similarity with activation centroid
  - `cluster_score`, `cluster_coherence`
  - `phrases` - List of all phrases in cluster

**Generated by**: `data/pipeline/steps/step_14_explanation_consensus.py`

**Usage**:
- Backend consensus_service.py serves pre-computed clusters
- Frontend ConsensusSection displays ranked phrases by activation similarity
- Supports phrase-level activation alignment analysis

### 8. clustering_linkage.npy (~512KB)
**Hierarchical clustering linkage matrix**

**Purpose**: Pre-computed hierarchical clustering for decoder weight similarity
**Used by**: HierarchicalClusterCandidateService for feature pair clustering

## Processing Pipeline (13 Steps)

The preprocessing pipeline has been refactored with a single master config (`config.yaml`) and master script (`run.py`).

### Running the Pipeline

```bash
# Run full pipeline
python data/pipeline/run.py

# Run specific steps (automatically includes dependencies)
python data/pipeline/run.py --steps step_07_features step_10_activation_display

# Run from a specific step onwards
python data/pipeline/run.py --from step_07_features

# Dry run (show execution plan)
python data/pipeline/run.py --dry-run

# List all available steps
python data/pipeline/run.py --list

# Limit features for testing
python data/pipeline/run.py --limit 100
```

### Pipeline Steps

| Step | Purpose | Output |
|------|---------|--------|
| step_01_activations | Create activation examples | activation_examples.parquet |
| step_02_decoder_similarity | Compute decoder weight similarities | decoder_similarity/ |
| step_03_scores | Aggregate scoring metrics | scores/ |
| step_04_explanation_embeddings | Generate explanation embeddings | explanation_embeddings.parquet |
| step_05_activation_embeddings | Pre-compute activation embeddings | activation_embeddings.parquet |
| step_06_clustering | Hierarchical clustering (Ward's) | clustering_linkage.npy |
| step_07_features | Create main features parquet | features.parquet |
| step_08_activation_similarity | Dual n-gram similarity | activation_similarity.parquet |
| step_09_interfeature_similarity | Cross-feature similarity | interfeature_similarity.parquet |
| step_10_activation_display | Frontend-optimized display | activation_display.parquet |
| step_11_interfeature_display | Interfeature display data | (processed interfeature) |
| step_12_explanation_alignment | Cross-explainer phrase alignment | explanation_alignment.parquet |
| step_13_svm_metrics | Pre-compute SVM metrics | svm_feature_metrics.parquet, svm_pair_metrics.parquet |
| step_14_explanation_consensus | HDBSCAN phrase clustering | explanation_consensus.parquet |

### Key Processing Patterns

**Natural Text Reconstruction** (Steps 4, 5):
```python
# Input:  ['▁the', '▁service', 's', '▁of', '▁a']
# Output: "the services of a"
# Result: ~40% size reduction, readable text for embedding models
```

**Dual N-gram Architecture** (Step 8, 9):
```python
# Character-level (morphology):
char_ngrams = extract_per_token(['playing', 'services'])
# → 'ing' at char_offset=4 in 'playing'

# Word-level (semantics):
word_ngrams = reconstruct_and_extract(['machine', 'learning'])
# → 'machine learning' at start_position=15
```

**Two-Tier N-gram Threshold Logic** (Steps 10, 11):
```python
# Tier 1 (lexical_threshold): Gate - does this feature/pair have a lexical pattern?
# Tier 2 (ngram_jaccard_threshold): Selection - pick longest n-gram above this threshold

# Step 10 (intra-feature): lexical=0.2, ngram_jaccard=0.15
# Step 11 (inter-feature): lexical=0.15, ngram_jaccard=0.10

# Pre-filter uses Tier 1 to identify candidates
might_have_ngram = max_jaccard >= lexical_threshold

# Selection uses Tier 2 to pick the longest n-gram
best = select_longest_ngram_above_threshold(per_k_jaccard, ngram_jaccard_threshold)
```

**Unified N-gram Position Format** (Steps 9, 10, 11):
```python
# Both char and word n-grams use the same position format:
# {token_position: int, char_offset: int|None}
# char_offset is None for word n-grams (highlight entire token)
# This enables consistent handling in frontend highlighting
```

**Feature-Level Aggregation** (Step 10):
```python
# Transform: activation examples → feature-level rows
# Pre-process: Remove '▁' prefix from tokens
# Pre-classify: Pattern type (semantic/lexical/both/none)
# Pre-structure: N-gram positions for direct highlighting
```

## Core Utilities (pipeline/core/)

The refactored pipeline extracts shared functionality into reusable modules:

### tokens.py - Token Processing
```python
from core.tokens import normalize_token, extract_token_window, reconstruct_words_with_positions

# Strip SentencePiece '▁' prefix
token = normalize_token('▁hello')  # -> 'hello'

# Extract window around position
window = extract_token_window(tokens, center_pos=50, window_size=11)

# Reconstruct words with positions for n-gram extraction
words = reconstruct_words_with_positions(['▁machine', '▁learning'])
# -> [('machine', 0), ('learning', 1)]
```

### ngrams.py - N-gram Extraction
```python
from core.ngrams import extract_token_char_ngrams, extract_word_ngrams, compute_jaccard_similarity

# Character n-grams from tokens (morphological patterns)
char_ngrams = extract_token_char_ngrams(tokens, ngram_sizes=[2, 3, 4])
# -> {'ing': [(5, 'playing', 4)], 'lay': [(5, 'playing', 1)], ...}

# Word n-grams from reconstructed words (semantic patterns)
word_ngrams = extract_word_ngrams(tokens, ngram_sizes=[1, 2, 3])
# -> {'machine learning': [0], 'learning': [1], ...}

# Jaccard similarity between sets
jaccard = compute_jaccard_similarity(set_a, set_b)
```

### sampling.py - Quantile Sampling
```python
from core.sampling import select_top_k_per_quantile_tuples

# Select representative examples across activation range
examples = select_top_k_per_quantile_tuples(
    all_examples, k=2, num_quantiles=4, value_index=1
)
# Selects 2 examples per quartile, 8 total
```

### embeddings.py - Embedding Utilities
```python
from core.embeddings import compute_intra_feature_semantic_similarity

# Compute pairwise semantic similarity within a feature
mean_sim, std_sim = compute_intra_feature_semantic_similarity(
    embeddings_df, feature_id, prompt_ids
)
```

### phrases.py - Phrase Extraction
```python
from core.phrases import extract_all_phrases, chunk_text

# Extract phrases from explanations using smart chunking
phrases = extract_all_phrases(explanations, method="smart")
# -> [(phrase_text, explanation_idx, phrase_idx), ...]

# Chunk text into phrases (period/comma-based or smart)
chunks = chunk_text(text, method="smart")
# -> ["phrase 1", "phrase 2", ...]
```

## Backend Integration

### Basic Data Loading
```python
import polars as pl

# Lazy loading for efficiency
df = pl.scan_parquet("data/output/features.parquet")
df = df.filter(filters).collect()

# Load SVM metrics (pre-aggregated)
svm_features = pl.read_parquet("data/output/svm_feature_metrics.parquet")
svm_pairs = pl.read_parquet("data/output/svm_pair_metrics.parquet")
```

### Common Patterns
```python
# Join multiple files on feature_id
features = pl.read_parquet("data/output/features.parquet")
display = pl.read_parquet("data/output/activation_display.parquet")
full = features.join(display, on=["feature_id", "sae_id"])

# Access nested fields
similarities = row["semantic_similarity"]  # List of structs
scores = row["scores"]  # Nested scoring data
```

### Performance
- Feature grouping: ~50ms
- Table load: ~100ms
- Activation display: ~20ms (thanks to step_10 optimization)
- Cached activation blob: ~15-25s (vs ~100s for chunked JSON)
- SVM scoring: Fast (no runtime aggregation due to pre-computed metrics)

## Dataset Statistics

- **Unique Features**: ~16,000+
- **Explainers**: 3 (Llama, Gemini, OpenAI)
- **Embedding Dimensions**: 768
- **Total Output Storage**: ~178MB
- **Output Files**: 8 parquet/npy files
- **Pipeline Steps**: 14 steps with single config.yaml

### File Size Breakdown (output/ directory):
| File | Size | Purpose |
|------|------|---------|
| activation_display.parquet | ~128MB | Frontend-optimized |
| interfeature_similarity.parquet | ~30MB | Cross-feature analysis |
| features.parquet | ~4.6MB | Main dataset |
| explanation_consensus.parquet | ~4.1MB | HDBSCAN phrase clustering |
| svm_pair_metrics.parquet | ~4.1MB | Pre-computed pair-level SVM metrics |
| svm_feature_metrics.parquet | ~569KB | Pre-aggregated feature SVM metrics |
| clustering_linkage.npy | ~512KB | Hierarchical clustering |
| explanation_alignment.parquet | ~293KB | Phrase alignments |

## Key Design Decisions

### Why Nested Parquet Structure?
- Single file instead of multiple joins
- Better columnar compression
- Faster queries for visualization use cases
- Simpler data management for research

### Why Pre-compute Embeddings?
- Embeddings expensive (GPU), similarities cheap (CPU)
- Enables flexible on-the-fly similarity calculations
- Easy to add new metrics without re-embedding
- Scripts 2 and 4 pre-compute, Script 3 calculates on-demand

### Why Dual N-gram Architecture?
- **Character-level**: Captures morphological patterns (suffixes, prefixes)
- **Word-level**: Captures semantic patterns (phrases, concepts)
- **Both needed**: Different features show different pattern types
- **Precise positioning**: `char_offset` enables character-accurate highlighting

### Why activation_display.parquet?
- **Problem**: Loading raw activation data takes several seconds on frontend
- **Solution**: Pre-aggregate to feature-level rows
- **Result**: ~20ms load time (~250x faster)
- **Trade-off**: Increased preprocessing time, but worth it for demo responsiveness

## Remember

**This is a research prototype for conference demonstrations**

When working on data processing:
- **Keep it simple**: Use straightforward Polars transformations suitable for research
- **Avoid over-engineering**: Don't add complex validation pipelines unless clearly needed
- **Reuse patterns**: Check existing scripts before implementing new processing logic
- **Clean up after changes**: Remove old parquet files when schemas change
- **Document major changes**: Update this file if you significantly change the pipeline
- **Focus on demos**: Ensure data loads quickly and reliably for conference presentations

The goal is efficient, reproducible data processing for a research visualization tool, not a production ETL system.

---

**Pipeline Version**: 5.1 (Two-tier N-gram Threshold Logic + Unified Position Format)
**Last Updated**: February 2026
**Status**: Conference-ready research prototype
