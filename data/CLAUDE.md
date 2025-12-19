# Data CLAUDE.md - SAE Feature Data Processing & Storage

Professional guidance for the data layer of the SAE Feature Visualization research prototype.

## Data Layer Overview

**Purpose**: Transform raw SAE experiments into analysis-ready parquet files
**Status**: Conference-ready research prototype
**Architecture**: Dual n-gram pattern matching (character + word level) with pre-computed embeddings
**Storage**: ~1.3GB compressed parquet files in master directory

## Important Development Principles

### This is a Conference Prototype
- **Keep data processing simple**: Straightforward parquet generation suitable for research demonstrations
- **Avoid over-engineering**: Don't add complex data pipelines, validation layers, or monitoring unless needed
- **Research-focused**: Easy data manipulation and re-processing more important than production-level optimization
- **Reproducible but flexible**: Config files for tracking, but prioritize easy modification

### Code Quality Guidelines

**Before Processing Data:**
1. **Check existing scripts**: Review scripts/ directory before creating new processing logic
2. **Understand the pipeline**: Scripts 0-9 form a sequential pipeline - understand dependencies
3. **Review configs**: Check config/ directory for existing configuration patterns
4. **Verify data exists**: Ensure raw data files are present before running scripts

**After Processing:**
1. **Remove obsolete files**: Delete old parquet files when schema changes
2. **Clean up intermediate data**: Remove temporary processing files
3. **Update metadata**: Parquet files auto-generate metadata, but verify correctness
4. **Test basic queries**: Use simple Polars queries to verify data structure

**Code Reuse:**
- **Embedding patterns**: Scripts 2 and 4 use similar embedding logic - reuse patterns
- **N-gram extraction**: Scripts 5 and 9 share n-gram logic - check before duplicating
- **Quantile sampling**: Consistent across scripts - use existing patterns
- **Modularize when needed**: If you write the same Polars transformation twice, extract to a function

## Directory Structure

```
data/
├── raw/                          # Raw SAE experimental data (read-only)
│   ├── llama_e-llama_s/         # Llama explainer + scorer
│   ├── gwen_e-llama_s/          # Qwen explainer + scorer
│   └── openai_e-llama_s/        # OpenAI explainer + scorer
│
├── preprocessing/                # Processing scripts & configs
│   ├── scripts/                 # Python processing scripts (0a, 0b, 1-9)
│   └── config/                  # JSON configuration files
│
├── master/                       # PRIMARY DATA FILES (used by backend)
│   ├── features.parquet         # Main dataset (~3.8MB)
│   ├── explanation_embeddings.parquet # Pre-computed (~146MB)
│   ├── activation_examples.parquet # Activation data (~258MB)
│   ├── activation_embeddings.parquet # Pre-computed (~848MB)
│   ├── activation_example_similarity.parquet # Metrics (~5.9MB)
│   ├── activation_display.parquet # Frontend-optimized (~67MB)
│   ├── interfeature_activation_similarity.parquet # Cross-feature (~3MB)
│   ├── explanation_alignment.parquet # Phrase alignments (~406KB)
│   ├── ex_act_pattern_matching.parquet # Pattern validation (~81KB)
│   ├── explanation_barycentric.parquet # Stage 3 UMAP positions
│   ├── thematic_codes.parquet   # Thematic-LM output (~6KB)
│   └── codebook.json            # Thematic-LM codebook
│
├── Thematic-LM/                  # Thematic analysis (WWW '25 paper)
│   ├── thematic_coding.py       # Main processing script
│   ├── autogen_pipeline.py      # AutoGen orchestration
│   ├── codebook_manager.py      # Embedding-based codebook
│   ├── autogen_agents/          # Agent implementations
│   ├── codebook_history/        # Processing checkpoints
│   └── CLAUDE.md                # Thematic-LM docs
│
├── scores/                       # Processed scoring data
├── feature_similarity/           # Decoder weight similarities
├── llm_comparison/              # LLM consistency stats
└── CLAUDE.md                    # This file
```

## Core Data Files (Master Directory)

### 1. features.parquet (PRIMARY - ~3.8MB)
**The main dataset powering all visualizations**

**Key Fields**:
- `feature_id`, `sae_id`, `llm_explainer`, `explanation_text`
- `decoder_similarity`: List of top similar features by decoder weights
- `semantic_similarity`: List of pairwise similarities with other explainers
- `quality_score`: Computed quality metric
- `scores`: Nested structure with all scorer evaluations (embedding, fuzz, detection)

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
**Cross-feature activation pattern comparison**

**Purpose**: Analyze pattern similarities between decoder-similar features

### 8. explanation_alignment.parquet (~406KB)
**Semantically aligned phrases across LLM explanations**

**Purpose**: Highlight shared concepts between different explainers

### 9. ex_act_pattern_matching.parquet (~81KB)
**Dual lexical + semantic pattern validation**

**Purpose**: Validate explanation-activation pattern consistency

### 10. explanation_barycentric.parquet (Stage 3 UMAP)
**Precomputed 2D positions for cause analysis UMAP**

**Purpose**: Enable instant UMAP visualization without runtime dimensionality reduction

**Key Columns**:
- `feature_id`, `llm_explainer` (3 rows per feature, one per explainer)
- `position_x`, `position_y` (barycentric 2D coordinates)
- `nearest_anchor` (closest cause category: noisy-activation, missed-N-gram, missed-context)
- Metric scores: `intra_feature_sim`, `score_embedding`, `score_fuzz`, `score_detection`, `explanation_semantic_sim`

**Algorithm**: Barycentric projection from 5D metric space to 2D using inverse distance weighting to 3 anchor points

**Usage**:
- Frontend displays mean position across 3 explainers per feature
- Detail view shows individual explainer positions when feature selected
- SVM classification uses metric scores for One-vs-Rest prediction

### 11. thematic_codes.parquet (~6KB)
**Thematic-LM analysis output**

**Purpose**: Thematic codes assigned to feature explanations using multi-agent LLM system
**Generated by**: `data/Thematic-LM/thematic_coding.py`
**See**: `data/Thematic-LM/CLAUDE.md` for full documentation

## Processing Pipeline (Scripts 0-9)

### Quick Reference
```bash
cd data/preprocessing/scripts

# Core pipeline (run in order):
python 0_create_activation_examples_parquet.py --config ../config/0_activation_examples_config.json
python 0_feature_similarities.py --config ../config/0_feature_similarity_config.json
python 1_scores.py --config ../config/1_score_config.json
python 2_ex_embeddings.py --config ../config/2_ex_embeddings_config.json
python 3_features_parquet.py --config ../config/3_create_features_parquet.json
python 4_act_embeddings.py --config ../config/4_act_embeddings.json
python 5_act_similarity.py --config ../config/5_act_similarity.json
python 6_activation_display.py --config ../config/6_activation_display.json

# Pattern validation (optional for basic demos):
python 7_interfeature_similarity.py --config ../config/7_interfeature_similarity.json
python 8_explanation_alignment.py --config ../config/8_explanation_alignment.json
python 9_ex_act_pattern_matching.py --config ../config/9_ex_act_pattern_matching.json
```

### Script Descriptions

| Script | Purpose | Output |
|--------|---------|--------|
| 0a | Create activation examples parquet | activation_examples.parquet |
| 0b | Compute decoder weight similarities | feature_similarity/ |
| 1 | Aggregate scoring metrics from LLM scorers | scores/ |
| 2 | Generate explanation embeddings | explanation_embeddings.parquet |
| 3 | Create main features parquet with nested structure | features.parquet |
| 4 | Pre-compute activation embeddings | activation_embeddings.parquet |
| 5 | Calculate dual n-gram similarity | activation_example_similarity.parquet |
| 6 | Create frontend-optimized display data | activation_display.parquet |
| 7 | Cross-feature activation pattern comparison | interfeature_activation_similarity.parquet |
| 8 | Find aligned phrases across LLM explanations | explanation_alignment.parquet |
| 9 | Dual lexical + semantic pattern validation | ex_act_pattern_matching.parquet |

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

## Backend Integration

### Basic Data Loading
```python
import polars as pl

# Lazy loading for efficiency
df = pl.scan_parquet("data/master/features.parquet")
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
- **Total Master Storage**: ~1.3GB compressed
- **Master Files**: 11 parquet files + 1 JSON
- **Processing Scripts**: 10 (0a, 0b, 1-9) + Thematic-LM + Barycentric

### File Size Breakdown:
| File | Size | Purpose |
|------|------|---------|
| activation_embeddings.parquet | ~848MB | Largest - pre-computed embeddings |
| activation_examples.parquet | ~258MB | Raw activation data |
| explanation_embeddings.parquet | ~146MB | Explanation embeddings |
| activation_display.parquet | ~67MB | Frontend-optimized |
| activation_example_similarity.parquet | ~5.9MB | N-gram metrics |
| features.parquet | ~3.8MB | Main dataset |
| interfeature_activation_similarity.parquet | ~3MB | Cross-feature analysis |
| explanation_barycentric.parquet | ~1MB | Stage 3 UMAP positions |
| explanation_alignment.parquet | ~406KB | Phrase alignments |
| ex_act_pattern_matching.parquet | ~81KB | Pattern validation |
| thematic_codes.parquet | ~6KB | Thematic-LM output |

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

**Pipeline Version**: 3.0 (Dual N-gram Architecture)
**Last Updated**: December 2025
**Status**: Conference-ready research prototype
