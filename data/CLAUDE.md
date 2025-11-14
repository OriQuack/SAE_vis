# Data CLAUDE.md - SAE Feature Data Processing & Storage

Professional guidance for the data layer of the SAE Feature Visualization research prototype.

## 🎯 Data Layer Overview

**Purpose**: Transform raw SAE experiments into analysis-ready parquet files
**Status**: Conference-ready research prototype - 9 core processing scripts complete
**Architecture**: Dual n-gram pattern matching (character + word level) with pre-computed embeddings
**Storage**: ~1.2GB compressed parquet files

## 🎯 Important Development Principles

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

## 📁 Directory Structure

```
data/
├── raw/                          # Raw SAE experimental data (read-only)
│   ├── llama_e-llama_s/         # Llama explainer + scorer (824 features)
│   ├── gwen_e-llama_s/          # Qwen explainer + scorer (824 features)
│   └── openai_e-llama_s/        # OpenAI explainer + scorer (824 features)
│
├── preprocessing/                # Processing scripts & configs
│   ├── scripts/                 # 10 Python processing scripts (0a, 0b, 1-9)
│   └── config/                  # JSON configuration files
│
├── master/                       # 🎯 PRIMARY DATA FILES (used by backend)
│   ├── features.parquet         # Main dataset (288KB, 2,472 rows)
│   ├── explanation_embeddings.parquet # Pre-computed (7.4MB)
│   ├── activation_examples.parquet # Activation data (246MB)
│   ├── activation_embeddings.parquet # Pre-computed (985MB)
│   ├── activation_example_similarity.parquet # Metrics (2.4MB)
│   ├── activation_display.parquet # Frontend-optimized (5-10MB)
│   ├── interfeature_similarity.parquet # Cross-feature analysis
│   ├── explanation_alignment.parquet # Phrase alignments
│   └── ex_act_pattern_matching.parquet # Pattern validation
│
├── scores/                       # Processed scoring data
├── feature_similarity/           # Decoder weight similarities
├── llm_comparison/              # LLM consistency stats
└── umap_*/                      # UMAP projections (various)
```

## 🏗️ Core Data Files (Master Directory)

### 1. features.parquet (PRIMARY - 288KB)
**The main dataset powering all visualizations**

**Key Fields**:
- `feature_id`, `sae_id`, `llm_explainer`, `explanation_text`
- `decoder_similarity`: List of top 10 similar features by decoder weights
- `semantic_similarity`: List of pairwise similarities with other explainers
- `scores`: Nested structure with all scorer evaluations

**Stats**: 2,472 rows (824 features × 3 explainers), nested structure

### 2. explanation_embeddings.parquet (7.4MB)
**Pre-computed 768-dim embeddings for all explanations**

**Purpose**: Used for on-the-fly similarity calculations in Script 3
**Model**: `google/embeddinggemma-300m`

### 3. activation_examples.parquet (246MB)
**Raw activation data with token windows**

**Stats**: 1M+ activation examples across 16,384 features

### 4. activation_embeddings.parquet (985MB)
**Pre-computed embeddings for quantile-sampled activations**

**Purpose**: Semantic similarity calculations
**Optimization**: Natural text reconstruction (strips '▁' prefix, joins subwords)

### 5. activation_example_similarity.parquet (2.4MB)
**Dual n-gram analysis with pattern metrics**

**Key Innovation**:
- **Character n-grams**: Morphology (suffixes, prefixes) with `char_offset` for precise highlighting
- **Word n-grams**: Semantics (reconstructed words) with `start_position`
- **Dual Jaccard**: Separate scores for char and word pattern consistency

### 6. activation_display.parquet (⭐ 5-10MB)
**Frontend-optimized display data**

**Purpose**: Reduce frontend load time from ~5s to ~20ms (250x faster)
**Structure**: 824 rows (feature-level) with pre-processed tokens, pattern classification, n-gram positions

### 7-9. Pattern Validation Files
- `interfeature_similarity.parquet`: Cross-feature activation comparisons
- `explanation_alignment.parquet`: Semantically aligned phrases across LLMs
- `ex_act_pattern_matching.parquet`: Dual lexical+semantic validation

## 🔧 Processing Pipeline (Scripts 0-9)

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

**Script 0a**: Create activation examples parquet (246MB)
**Script 0b**: Compute decoder weight similarities (top 10 neighbors)
**Script 1**: Aggregate scoring metrics from LLM scorers
**Script 2**: Generate explanation embeddings (multi-source consolidation)
**Script 3**: Create main features parquet with nested structure
**Script 4**: Pre-compute activation embeddings with natural text reconstruction
**Script 5**: Calculate dual n-gram similarity (char + word patterns)
**Script 6**: ⭐ Create frontend-optimized display data (250x faster load)
**Script 7**: Cross-feature activation pattern comparison
**Script 8**: Find aligned phrases across LLM explanations
**Script 9**: Dual lexical + semantic pattern validation

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
# Transform: 1M+ activation examples → 824 feature rows
# Pre-process: Remove '▁' prefix from tokens
# Pre-classify: Pattern type (semantic/lexical/both/none)
# Pre-structure: N-gram positions for direct highlighting
```

## 🔗 Backend Integration

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

## 📊 Dataset Statistics

- **Unique Features**: 824
- **Total Explanations**: 2,472 (824 × 3 LLM explainers)
- **Activation Examples**: 1M+
- **Embedding Dimensions**: 768
- **Total Storage**: ~1.2GB compressed
- **Master Files**: 9 parquet files
- **Processing Scripts**: 10 (0a, 0b, 1-9)

## 🔍 Key Design Decisions

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
- **Problem**: Loading 1M+ rows takes ~5 seconds on frontend
- **Solution**: Pre-aggregate to 824 feature-level rows
- **Result**: ~20ms load time (250x faster)
- **Trade-off**: Increased preprocessing time, but worth it for demo responsiveness

## 💡 Remember

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
**Last Updated**: November 2025
**Status**: Conference-ready research prototype
