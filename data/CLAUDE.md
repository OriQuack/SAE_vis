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
python data/pipeline/run.py --steps step_06_features step_10_activation_display

# Run from a specific step onwards
python data/pipeline/run.py --from step_06_features

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
├── raw/                          # Raw SAE experimental data (read-only)
│   ├── llama_e-llama_s-16k-v2/  # Llama explainer + scorer
│   ├── gemini_e-llama_s-16k-v2/ # Gemini explainer + scorer
│   └── openai_e-llama_s-16k-v2/ # OpenAI explainer + scorer
│
├── pipeline/                     # Refactored preprocessing pipeline
│   ├── config.yaml              # Single master configuration file
│   ├── run.py                   # Master script with dependency resolution
│   ├── core/                    # Shared utilities (~730 lines)
│   │   ├── __init__.py          # Module exports
│   │   ├── base.py              # BaseProcessor class
│   │   ├── paths.py             # Path resolution utilities
│   │   ├── logging.py           # Logging configuration
│   │   ├── metadata.py          # Metadata generation
│   │   ├── tokens.py            # Token normalization, window extraction
│   │   ├── ngrams.py            # N-gram extraction, Jaccard similarity
│   │   ├── sampling.py          # Quantile-based sampling
│   │   └── embeddings.py        # Embedding loading and similarity
│   └── steps/                   # Processing step implementations
│       ├── __init__.py          # Step registry
│       ├── step_08_activation_similarity.py   # Refactored (uses core/)
│       ├── step_09_interfeature_similarity.py # Refactored (uses core/)
│       └── step_10_activation_display.py      # Refactored (uses core/)
│
├── diagnostics/                 # Diagnostic and analysis scripts
│   ├── diagnose_token_extraction.py   # Token edge case detection
│   ├── analyze_clustering.py          # Clustering analysis
│   └── visualize_clustering_distribution.py
│
├── utilities/                   # Utility scripts (not part of pipeline)
│   └── export_assembled_explanations.py
│
├── preprocessing/               # LEGACY: Old processing scripts
│   ├── scripts/                 # Python processing scripts (numbered 0-10)
│   └── config/                  # JSON configuration files
│
├── output/                      # BACKEND-REQUIRED FILES (used by backend)
│   ├── features.parquet         # Main dataset (~3.9MB)
│   ├── activation_display.parquet # Frontend-optimized (~64MB)
│   ├── interfeature_similarity.parquet # Cross-feature (~69MB)
│   ├── svm_feature_metrics.parquet # Feature-level SVM metrics (~1MB)
│   ├── svm_pair_metrics.parquet # Pair-level SVM metrics (~10MB)
│   ├── explanation_alignment.parquet # Phrase alignments (~403KB)
│   └── clustering_linkage.npy   # Hierarchical clustering (~513KB)
│
├── Thematic-LM/                 # Thematic analysis (WWW '25 paper)
│   ├── thematic_coding.py       # Main processing script
│   ├── autogen_pipeline.py      # AutoGen orchestration
│   ├── codebook_manager.py      # Embedding-based codebook
│   ├── autogen_agents/          # Agent implementations
│   ├── codebook_history/        # Processing checkpoints
│   └── CLAUDE.md                # Thematic-LM docs
│
├── scores/                      # Processed scoring data
├── feature_similarity/          # Decoder weight similarities
├── llm_comparison/              # LLM consistency stats
└── CLAUDE.md                    # This file
```

## Core Data Files (Output Directory)

### 1. features.parquet (PRIMARY - ~3.8MB)
**The main dataset powering all visualizations**

**Key Fields**:
- `feature_id`, `sae_id`, `llm_explainer`, `explanation_text`
- `decoder_similarity`: List of top similar features by decoder weights
- `semantic_similarity`: List of pairwise similarities with other explainers
- `quality_score`: Computed quality metric
- `scores`: Nested structure with all scorer evaluations (embedding, fuzz, detection)
- `frac_nonzero`: Fraction of non-zero activations (used in Stage 3 SVM)

**Usage**: Feature grouping, table display, similarity calculations

### 2. explanation_embeddings.parquet (~146MB)
**Pre-computed 768-dim embeddings for all explanations**

**Purpose**: Used for on-the-fly similarity calculations
**Model**: Embedding model for semantic comparisons

### 3. activation_examples.parquet (~258MB)
**Raw activation data with token windows**

**Stats**: Activation examples across features with 127-token context windows

### 4. activation_embeddings.parquet (~848MB - largest file)
**Pre-computed embeddings for quantile-sampled activations**

**Purpose**: Semantic similarity calculations between activation contexts
**Optimization**: Natural text reconstruction (strips '▁' prefix, joins subwords)

### 5. activation_example_similarity.parquet (~5.9MB)
**Dual n-gram analysis with pattern metrics**

**Key Innovation**:
- **Character n-grams**: Morphology (suffixes, prefixes) with `char_offset` for precise highlighting
- **Word n-grams**: Semantics (reconstructed words) with `start_position`
- **Dual Jaccard**: Separate scores for char and word pattern consistency

### 6. activation_display.parquet (~67MB)
**Frontend-optimized display data**

**Purpose**: Reduce frontend load time (~250x faster than raw data)
**Structure**: Feature-level rows with pre-processed tokens, pattern classification, n-gram positions

### 7. interfeature_activation_similarity.parquet (~3MB)
**Cross-feature activation pattern comparison (processed)**

**Purpose**: Analyze pattern similarities between decoder-similar features
**Used by**: Cold start service for diversity-based representative sampling

### 7b. interfeature_activation_similarity_raw.parquet (~2MB)
**Cross-feature activation pattern comparison (raw)**

**Purpose**: Raw similarity data before aggregation and filtering

### 8. explanation_alignment.parquet (~406KB)
**Semantically aligned phrases across LLM explanations**

**Purpose**: Highlight shared concepts between different explainers

### 9. ex_act_pattern_matching.parquet (~81KB)
**Dual lexical + semantic pattern validation**

**Purpose**: Validate explanation-activation pattern consistency

### 10. svm_feature_metrics.parquet (Stage 2 & 3 SVM Metrics)
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

### 10b. svm_pair_metrics.parquet (Stage 1 Pair SVM Metrics)
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

### 11. thematic_codes.parquet (~6KB)
**Thematic-LM analysis output**

**Purpose**: Thematic codes assigned to feature explanations using multi-agent LLM system
**Generated by**: `data/Thematic-LM/thematic_coding.py`
**See**: `data/Thematic-LM/CLAUDE.md` for full documentation

## Processing Pipeline (Scripts 0-10)

### IMPORTANT: Config Files Required

**All numbered preprocessing scripts MUST be run with their corresponding config file using the `--config` flag.**

Config files are located in `data/preprocessing/config/` and contain:
- Input/output paths
- Processing parameters
- Schema definitions
- Documentation notes

### Quick Reference
```bash
cd data/preprocessing/scripts

# Core pipeline (run in order with --config flag):
python 0_create_activation_examples_parquet.py --config ../config/0_activation_examples_config.json
python 0_feature_similarities.py --config ../config/0_feature_similarity_config.json
python 1_scores.py --config ../config/1_score_config.json
python 2_ex_embeddings.py --config ../config/2_ex_embeddings_config.json
python 2_feature_clustering.py --config ../config/2_feature_clustering.json
python 3_features_parquet.py --config ../config/3_create_features_parquet.json
python 4_act_embeddings.py --config ../config/4_act_embeddings.json
python 5_act_similarity.py --config ../config/5_act_similarity.json
python 5_interfeature_similarity.py --config ../config/5_interfeature_similarity.json
python 6_activation_display.py --config ../config/6_activation_display.json
python 6_interfeature_display.py --config ../config/6_interfeature_display.json

# Pattern validation (optional for basic demos):
python 7_explanation_alignment.py --config ../config/7_explanation_alignment.json
python 8_ex_act_pattern_matching.py --config ../config/8_ex_act_pattern_matching.json
python 9_explanation_embedding_barycentric.py --config ../config/9_explanation_embedding_barycentric.json
python 10_assembled_explanations.py --config ../config/10_assembled_explanations.json
```

### Script Descriptions

| Script | Purpose | Output | Config |
|--------|---------|--------|--------|
| 0_create_activation_examples_parquet | Create activation examples parquet | activation_examples.parquet | 0_activation_examples_config.json |
| 0_feature_similarities | Compute decoder weight similarities | feature_similarity/ | 0_feature_similarity_config.json |
| 1_scores | Aggregate scoring metrics from LLM scorers | scores/ | 1_score_config.json |
| 2_ex_embeddings | Generate explanation embeddings | explanation_embeddings.parquet | 2_ex_embeddings_config.json |
| 2_feature_clustering | Cluster features by decoder similarity | clustering data | 2_feature_clustering.json |
| 3_features_parquet | Create main features parquet with nested structure | features.parquet | 3_create_features_parquet.json |
| 4_act_embeddings | Pre-compute activation embeddings | activation_embeddings.parquet | 4_act_embeddings.json |
| 5_act_similarity | Calculate dual n-gram similarity | activation_example_similarity.parquet | 5_act_similarity.json |
| 5_interfeature_similarity | Cross-feature activation similarity | interfeature_activation_similarity.parquet | 5_interfeature_similarity.json |
| 6_activation_display | Create frontend-optimized display data | activation_display.parquet | 6_activation_display.json |
| 6_interfeature_display | Process interfeature data for display | interfeature display data | 6_interfeature_display.json |
| 7_explanation_alignment | Find aligned phrases across LLM explanations | explanation_alignment.parquet | 7_explanation_alignment.json |
| 8_ex_act_pattern_matching | Dual lexical + semantic pattern validation | ex_act_pattern_matching.parquet | 8_ex_act_pattern_matching.json |
| 9_explanation_embedding_barycentric | Compute barycentric UMAP positions | explanation_barycentric.parquet | 9_explanation_embedding_barycentric.json |
| 10_assembled_explanations | Assemble explanations | assembled explanations | 10_assembled_explanations.json |

### Key Processing Patterns

**Natural Text Reconstruction** (Scripts 4, 5):
```python
# Input:  ['▁the', '▁service', 's', '▁of', '▁a']
# Output: "the services of a"
# Result: ~40% size reduction, readable text for embedding models
```

**Dual N-gram Architecture** (Script 5):
```python
# Character-level (morphology):
char_ngrams = extract_per_token(['playing', 'services'])
# → 'ing' at char_offset=4 in 'playing'

# Word-level (semantics):
word_ngrams = reconstruct_and_extract(['machine', 'learning'])
# → 'machine learning' at start_position=15
```

**Feature-Level Aggregation** (Script 6):
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

## Refactored Steps

The following steps have been refactored to use core utilities:
- **step_08_activation_similarity.py**: ~500 lines (from 1147)
- **step_09_interfeature_similarity.py**: ~600 lines (from 1358)
- **step_10_activation_display.py**: ~430 lines (from legacy)

Run refactored steps with:
```bash
python data/pipeline/run.py --no-legacy --steps step_08_activation_similarity
```

## Backend Integration

### Basic Data Loading
```python
import polars as pl

# Lazy loading for efficiency
df = pl.scan_parquet("data/output/features.parquet")
df = df.filter(filters).collect()
```

### Common Patterns
```python
# Join multiple files on feature_id
features = pl.read_parquet("features.parquet")
display = pl.read_parquet("activation_display.parquet")
full = features.join(display, on=["feature_id", "sae_id"])

# Access nested fields
similarities = row["semantic_similarity"]  # List of structs
scores = row["scores"]  # Nested scoring data
```

### Performance
- Feature grouping: ~50ms
- Table load: ~100ms
- Activation display: ~20ms (thanks to Script 6 optimization)
- Cached activation blob: ~15-25s (vs ~100s for chunked JSON)

## Dataset Statistics

- **Unique Features**: ~16,000+
- **Explainers**: 3 (Llama, Qwen, OpenAI)
- **Embedding Dimensions**: 768
- **Total Output Storage**: ~150MB compressed
- **Output Files**: 7 parquet/npy files
- **Processing Scripts**: 15 numbered scripts (0-10) with corresponding config files
- **Config Files**: 15 JSON configuration files

### File Size Breakdown (output/ directory):
| File | Size | Purpose |
|------|------|---------|
| interfeature_similarity.parquet | ~69MB | Cross-feature analysis |
| activation_display.parquet | ~64MB | Frontend-optimized |
| svm_pair_metrics.parquet | ~10MB | Pre-computed pair-level SVM metrics |
| features.parquet | ~3.8MB | Main dataset |
| svm_feature_metrics.parquet | ~1MB | Pre-aggregated feature SVM metrics |
| clustering_linkage.npy | ~513KB | Hierarchical clustering |
| explanation_alignment.parquet | ~406KB | Phrase alignments |

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

**Pipeline Version**: 4.0 (Unified SVM Metrics: Feature + Pair Pre-computation)
**Last Updated**: January 2026
**Status**: Conference-ready research prototype
