# Current State Analysis - SAE Data Pipeline (Nov 2025)

## 📊 Executive Summary

**Pipeline Status**: ✅ **STREAMLINED & OPTIMIZED** (v2.0)
**Total Scripts**: 6 (down from 8+)
**Data Files**: 5 master parquet files
**Total Storage**: ~1.2GB (compressed parquet)
**Architecture**: Embedding-first with on-the-fly calculations

## 🔄 Current Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RAW SAE EXPERIMENTAL DATA                           │
│  • 2,472 explanations from 3 LLM explainers (Llama, Qwen, OpenAI)         │
│  • 824 unique SAE features                                                 │
│  • Multiple scoring methods (fuzz, detection, simulation, embedding)       │
│  • Activation examples with token windows                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                   STREAMLINED PROCESSING PIPELINE (V2.0)                    │
│                                                                             │
│  Script 0a: Activation Examples     → activation_examples.parquet          │
│  Script 0b: Feature Similarities    → feature_similarities.json            │
│  Script 1:  Scores Processing       → scores/*/scores.json                 │
│  Script 2:  Explanation Embeddings  → explanation_embeddings.parquet       │
│  Script 3:  Features Parquet        → features.parquet (nested)            │
│  Script 4:  Activation Embeddings   → activation_embeddings.parquet        │
│  Script 5:  Activation Similarity   → activation_example_similarity.parquet│
└─────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MASTER DATA FILES (5 PARQUETS)                      │
│                                                                             │
│  ✅ activation_examples.parquet           246MB  - Activation data          │
│  ✅ explanation_embeddings.parquet        7.4MB  - LLM explanation vectors  │
│  ✅ features.parquet                      288KB  - Main dataset (nested)    │
│  ✅ activation_embeddings.parquet         985MB  - Pre-computed activations │
│  ✅ activation_example_similarity.parquet 2.4MB  - Similarity metrics       │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 🎯 Key Changes from Previous Version

### Removed Components ❌

1. **Deleted Scripts**:
   - `3_semantic_similarities.py` - Replaced by on-the-fly calculation
   - `6_create_pairwise_similarity_parquet.py` - Data now nested in features.parquet
   - `7_create_explanations_parquet.py` - Text already in features.parquet
   - `8_precompute_consistency_scores.py` - Removed consistency pre-computation

2. **Deleted Data Files**:
   - `semantic_similarity_pairwise.parquet` - Nested in features.parquet now
   - `consistency_scores.parquet` - Removed
   - `semantic_similarities/` directory - All JSON files removed

3. **Deleted Config Files**:
   - `3_semantic_similarity_config.json`
   - `6_pairwise_similarity_config.json`
   - `7_explanations_parquet_config.json`
   - `8_consistency_config.json`

### New/Updated Components ✅

1. **Script 2 (ex_embeddings.py) - V2.0**:
   - Multi-source data processing
   - Consolidated parquet output
   - Removed Gemini API dependency
   - Only uses sentence-transformers
   - Output: `explanation_embeddings.parquet` with full LLM names

2. **Script 3 (features_parquet.py) - V2.0**:
   - On-the-fly semantic similarity calculation
   - Loads embeddings from parquet
   - Numpy-based cosine similarity
   - Nested List(Struct) schema
   - Removed `semsim_mean`/`semsim_max`
   - Added `semantic_similarity` list field

3. **Scripts 4-5 (Activation Pipeline)**:
   - Script 4: Pre-computes activation example embeddings
   - Script 5: Calculates activation-based similarity metrics
   - Quantile sampling strategy (4 quantiles × 5 examples)
   - 32-token context windows

## 📦 Current Data Schema

### features.parquet (Main Dataset)

```python
Schema:
  feature_id: Int64                # SAE feature index (0-16383)
  sae_id: Categorical              # SAE model identifier
  explanation_method: Categorical  # Explanation generation method
  llm_explainer: Categorical       # LLM explainer (Llama, Qwen, OpenAI)
  explanation_text: Utf8           # Explanation text

  # Nested structures (List of Structs):
  decoder_similarity: List(Struct([
    feature_id: UInt32,
    cosine_similarity: Float32
  ]))  # Top 10 similar features by decoder weights

  semantic_similarity: List(Struct([
    explainer: Categorical,
    cosine_similarity: Float32
  ]))  # Pairwise similarities with other explainers (NEW in v2.0)

  scores: List(Struct([
    scorer: Utf8,
    fuzz: Float64,
    simulation: Null,
    detection: Float64,
    embedding: Float64
  ]))  # Evaluation scores from all LLM scorers

Statistics:
  Total rows: 2,472
  Unique features: 824
  LLM explainers: 3 (Llama: 824, Qwen: 824, OpenAI: 824)
  File size: 288KB (compressed)
```

### explanation_embeddings.parquet

```python
Schema:
  feature_id: UInt32
  sae_id: Categorical
  data_source: Categorical          # e.g., "llama_e-llama_s"
  llm_explainer: Categorical        # Full model name
  embedding: List(Float32)          # 768-dim vector (embeddinggemma-300m)

Statistics:
  Total rows: 2,472
  Unique features: 824
  Embedding dimension: 768
  File size: 7.4MB
```

### activation_embeddings.parquet

```python
Schema:
  feature_id: UInt32
  sae_id: Categorical
  prompt_ids: List(UInt32)          # List of sampled prompt IDs
  embeddings: List(List(Float32))   # List of 768-dim embeddings

Statistics:
  Total rows: 16,384 features
  Embeddings per feature: ~20 (4 quantiles × 5 examples)
  Embedding dimension: 768
  File size: 985MB
```

### activation_examples.parquet

```python
Schema:
  feature_id: UInt32
  sae_id: Categorical
  prompt_id: UInt32
  prompt_tokens: List(Utf8)
  num_activations: UInt32
  max_activation: Float32
  activation_pairs: List(Struct([
    token_position: UInt32,
    activation_value: Float32
  ]))

Statistics:
  Total rows: ~1M+ activation examples
  File size: 246MB
```

### activation_example_similarity.parquet

```python
Schema:
  feature_id: UInt32
  sae_id: Categorical
  num_examples_sampled: UInt32
  mean_pairwise_similarity: Float32
  std_pairwise_similarity: Float32
  min_pairwise_similarity: Float32
  max_pairwise_similarity: Float32

Statistics:
  Total rows: 16,384 features
  File size: 2.4MB
```

## 🚀 Processing Scripts Details

### Script 0a: create_activation_examples_parquet.py
**Purpose**: Extract activation examples from raw prompt data
- Input: Raw activation data with prompts
- Output: `activation_examples.parquet` (246MB)
- Processing: Structures activation data with token windows

### Script 0b: feature_similarities.py
**Purpose**: Compute decoder weight similarities
- Input: SAE decoder weights
- Output: `feature_similarity/*/feature_similarities.json`
- Processing: Top 10 neighbors per feature

### Script 1: scores.py
**Purpose**: Process scoring metrics from LLM scorers
- Input: Raw score files from multiple scorers
- Output: `scores/*/scores.json` (9 scorer combinations)
- Processing: Statistical aggregation

### Script 2: ex_embeddings.py (V2.0)
**Purpose**: Generate embeddings for explanations from multiple sources
- Input:
  - `data/raw/llama_e-llama_s/explanations/*.txt`
  - `data/raw/gwen_e-llama_s/explanations/*.txt`
  - `data/raw/openai_e-llama_s/explanations/*.txt`
- Output: `explanation_embeddings.parquet` (7.4MB)
- Model: `google/embeddinggemma-300m` (768-dim)
- Processing:
  - Batch embedding generation
  - Float32 optimization
  - Multi-source consolidation
  - Full LLM explainer names

### Script 3: features_parquet.py (V2.0)
**Purpose**: Create main features parquet with nested structure
- Input:
  - `scores/*/scores.json`
  - `explanation_embeddings.parquet`
  - `feature_similarity/*/feature_similarities.json`
- Output: `features.parquet` (288KB)
- Processing:
  - On-the-fly semantic similarity calculation
  - Numpy cosine similarity
  - Nested List(Struct) aggregation
  - 2,472 rows with full schema

### Script 4: act_embeddings.py
**Purpose**: Pre-compute activation example embeddings
- Input: `activation_examples.parquet`
- Output: `activation_embeddings.parquet` (985MB)
- Model: `google/embeddinggemma-300m` (768-dim)
- Processing:
  - Quantile sampling (4 quantiles × 5 examples = 20 per feature)
  - 32-token symmetric/asymmetric window extraction
  - Batch processing
  - Float32 optimization

### Script 5: act_similarity.py
**Purpose**: Calculate activation example similarity metrics
- Input: `activation_embeddings.parquet`
- Output: `activation_example_similarity.parquet` (2.4MB)
- Processing:
  - Pairwise cosine similarity
  - Statistical aggregation (mean, std, min, max)
  - 16,384 features

## 📈 Performance Characteristics

### Storage Efficiency
- Total master data: ~1.2GB
- Parquet compression: ~70% reduction vs JSON
- Float32 optimization: ~50% reduction vs Float64

### Processing Times
- Script 2 (Explanation embeddings): ~2-3 minutes
- Script 3 (Features parquet): ~3-4 seconds
- Script 4 (Activation embeddings): ~10-15 minutes (16K features)
- Script 5 (Activation similarity): ~5-10 minutes

### Query Performance
- Feature lookup: <10ms
- Semantic similarity access: Instant (nested field)
- Decoder similarity: Instant (nested field)
- Full table scan: ~50ms (2,472 rows)

## 🎓 Key Architectural Decisions

### 1. Embedding-First Strategy
**Decision**: Pre-compute all embeddings, calculate similarities on-demand
**Rationale**:
- Embeddings are expensive to compute (GPU required)
- Similarities are cheap to calculate (CPU, numpy)
- More flexible for ad-hoc queries
- Easier to add new similarity metrics

### 2. Nested Structure Schema
**Decision**: Use List(Struct) instead of separate tables
**Rationale**:
- Single parquet file is easier to manage
- Natural grouping by feature + explainer
- Faster queries (no joins needed)
- Better for columnar compression

### 3. On-the-Fly Semantic Similarity
**Decision**: Calculate during parquet creation, not pre-computed
**Rationale**:
- Removed 3 preprocessing scripts
- No intermediate JSON files
- More maintainable
- Calculation is very fast (<5ms per feature)

### 4. Multi-Source Consolidation
**Decision**: Single explanation_embeddings.parquet for all sources
**Rationale**:
- Unified data model
- Easy to add new LLM explainers
- Categorical encoding saves space
- Better for cross-explainer analysis

## 🔮 Future Considerations

### Potential Enhancements
1. **Streaming Processing**: For larger datasets (100K+ features)
2. **Incremental Updates**: Update only changed features
3. **Additional Embeddings**: Different embedding models for comparison
4. **More Metrics**: Additional similarity/consistency metrics
5. **Compressed Formats**: Explore parquet compression options

### Scalability Notes
- Current design handles 16K features efficiently
- Bottleneck is activation embeddings (985MB)
- Could use quantization (int8) for 4x reduction
- Lazy loading supports larger datasets

## 📝 Migration Notes

### From v1.0 to v2.0

**Breaking Changes**:
- `semsim_mean` and `semsim_max` fields removed
- `semantic_similarity` now List(Struct) instead of aggregated stats
- Config files renamed/consolidated

**Data Migration**:
1. Re-run script 2 to generate `explanation_embeddings.parquet`
2. Re-run script 3 to generate new `features.parquet` schema
3. Delete old files:
   - `semantic_similarity_pairwise.parquet`
   - `semantic_similarities/` directory

**Code Updates Required**:
- Backend queries: Access `semantic_similarity` list instead of mean/max
- Frontend: Handle nested structure for semantic similarity display

## 🎯 Pipeline Health

**Status Indicators**:
- ✅ All scripts run successfully
- ✅ All data files generated
- ✅ Schema validation passes
- ✅ Metadata tracking complete
- ✅ No deprecated dependencies

**Last Updated**: November 4, 2025
**Pipeline Version**: 2.0
**Total Processing Time**: ~20-30 minutes (full pipeline)
