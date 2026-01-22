# Preprocessing Pipeline Documentation

Complete documentation of data preprocessing scripts and their connection to the backend services.

## Pipeline Overview

```
Raw SAE Data → Preprocessing Scripts (0-10) → Parquet Files → Backend Services → Frontend
```

The preprocessing pipeline transforms raw SAE experimental data into optimized parquet files consumed by the FastAPI backend. Scripts are numbered 0-10 and must run sequentially with their corresponding config files.

---

## Script Reference

### Script 0: `0_create_activation_examples_parquet.py`

**Purpose**: Creates activation examples parquet from raw JSONL scorer output

**Input**:
- Raw JSONL files from `data/raw/{explainer}_e-llama_s/` directories
- Contains activation examples with 127-token context windows

**Output**:
- `data/master/activation_examples.parquet` (~258MB)

**Schema**:
```
feature_id: UInt32
sae_id: Categorical
prompt_id: UInt32
prompt_tokens: List[Utf8]
activation_pairs: List[Struct{token_position, activation_value}]
max_activation: Float32
```

**Backend Usage**:
- `DataService._activation_examples_lazy` - Loaded as fallback when `activation_display.parquet` not available
- Used by `DataService._get_activation_examples_legacy()` for activation data retrieval

**Config**: `config/0_activation_examples_config.json`

---

### Script 0: `0_feature_similarities.py`

**Purpose**: Computes decoder weight cosine similarities between SAE features

**Input**:
- Decoder weight matrices from SAE model (`.npy` files)

**Output**:
- `data/feature_similarity/{sae_id}/`
  - `decoder_similarity.parquet` - Pairwise cosine similarities
  - `clustering_linkage.npy` - Pre-computed agglomerative clustering linkage matrix
  - `first_merge_clustering.parquet` - Feature ID to matrix index mapping

**Backend Usage**:
- `HierarchicalClusterCandidateService` loads `clustering_linkage.npy` at initialization
- Used for hierarchical clustering to generate feature pairs in Stage 1
- `get_cluster_candidates()` and `get_all_cluster_pairs()` use linkage matrix with `fcluster()`

**Config**: `config/0_feature_similarity_config.json`

---

### Script 1: `1_scores.py`

**Purpose**: Aggregates scoring metrics from different LLM scorers

**Input**:
- Raw scoring files from scorer output

**Output**:
- `data/scores/` directory with aggregated metrics
- Structured scores with: fuzz, detection, embedding, simulation

**Backend Usage**:
- Consumed by Script 3 to build `features.parquet`
- Not directly loaded by backend (intermediate processing step)

**Config**: `config/1_score_config.json`

---

### Script 2: `2_ex_embeddings.py`

**Purpose**: Generates 768-dimensional embeddings for explanation texts

**Input**:
- Explanation texts from features

**Output**:
- `data/master/explanation_embeddings.parquet` (~146MB)

**Schema**:
```
feature_id: UInt32
sae_id: Categorical
llm_explainer: Categorical
embedding: List[Float32] (768-dim)
```

**Backend Usage**:
- Used by Script 3 for computing semantic similarity between explanations
- Used by Script 7 for explanation alignment

**Model**: sentence-transformers (768-dim embeddings)

**Config**: `config/2_ex_embeddings_config.json`

---

### Script 2: `2_feature_clustering.py`

**Purpose**: Performs agglomerative clustering on features

**Input**:
- Decoder weight similarities

**Output**:
- Clustering assignments in `data/feature_similarity/`

**Backend Usage**:
- Part of hierarchical clustering pipeline used by `HierarchicalClusterCandidateService`

**Config**: `config/2_feature_clustering.json`

---

### Script 3: `3_features_parquet.py`

**Purpose**: Creates main features parquet with nested structure

**Input**:
- Score data from Script 1
- Decoder similarities from Script 0
- Explanation embeddings from Script 2

**Output**:
- `data/master/features.parquet` (~3.8MB) - **PRIMARY DATASET**

**Schema**:
```
feature_id: UInt32
sae_id: Categorical
llm_explainer: Categorical
explanation_text: Utf8
explanation_method: Categorical
frac_nonzero: Float32
decoder_similarity: List[Struct{feature_id, cosine_similarity}]
semantic_similarity: List[Struct{explainer, cosine_similarity}]
scores: List[Struct{scorer, fuzz, simulation, detection, embedding}]
quality_score: Float32
```

**Backend Usage**:
- `DataService._df_lazy` - Primary data source loaded at initialization
- `DataService._transform_to_flat_schema()` explodes nested structure for queries
- `FeatureGroupService` - Groups features by metric thresholds (N thresholds → N+1 groups)
- `HistogramService` - Generates histogram data with threshold path filtering
- `TableDataService` - Primary data source for table view, vectorized lookups
- `SimilaritySortService` - Fallback for decoder_similarity when barycentric unavailable
- `PairSimilarityService` - Gets decoder_similarity for 9D pair vectors
- Provides: score_embedding, score_fuzz, score_detection, semsim_mean, frac_nonzero, decoder_similarity

**Config**: `config/3_create_features_parquet.json`

---

### Script 4: `4_act_embeddings.py`

**Purpose**: Pre-computes embeddings for quantile-sampled activation contexts

**Input**:
- `activation_examples.parquet`

**Output**:
- `data/master/activation_embeddings.parquet` (~848MB) - **LARGEST FILE**

**Schema**:
```
feature_id: UInt32
sae_id: Categorical
prompt_id: UInt32
embedding: List[Float32] (768-dim)
```

**Processing**:
- Natural text reconstruction (strips '▁' prefix, joins subwords)
- Quantile-based sampling (2 examples per quantile × 4 quantiles = 8 per feature)

**Backend Usage**:
- Not directly loaded by backend
- Used by Script 5 for semantic similarity calculations

**Config**: `config/4_act_embeddings.json`

---

### Script 4_1: `4_1_activation_semantic_similarity.py`

**Purpose**: Computes pairwise semantic similarity between activation contexts

**Input**:
- `activation_embeddings.parquet`

**Output**:
- Semantic similarity metrics for activation examples

**Backend Usage**:
- Intermediate step consumed by Script 5

---

### Script 5: `5_act_similarity.py`

**Purpose**: Calculates dual n-gram similarity (character + word level)

**Input**:
- `activation_examples.parquet`
- `activation_embeddings.parquet`

**Output**:
- `data/master/activation_example_similarity.parquet` (~5.9MB)

**Schema**:
```
feature_id: UInt32
sae_id: Categorical
avg_pairwise_semantic_similarity: Float32
char_ngram_max_jaccard: Float32
word_ngram_max_jaccard: Float32
prompt_ids_analyzed: List[UInt32]
quantile_boundaries: List[Float32]
ngram_jaccard_similarity: List[Float32]
```

**Key Innovation**:
- **Character n-grams**: Captures morphology (suffixes, prefixes) with `char_offset` for precise highlighting
- **Word n-grams**: Captures semantics (phrases, concepts) with `start_position`
- **Dual Jaccard**: Separate scores for char and word pattern consistency

**Backend Usage**:
- `DataService._activation_similarity_lazy` - Fallback when `activation_display.parquet` not available
- Used by `DataService._get_activation_examples_legacy()` for similarity metrics

**Config**: `config/5_act_similarity.json`

---

### Script 5: `5_interfeature_similarity.py`

**Purpose**: Computes cross-feature activation pattern comparison

**Input**:
- `activation_embeddings.parquet`
- Decoder similarity data

**Output**:
- `data/master/interfeature_activation_similarity_raw.parquet` (~2MB)

**Schema**:
```
feature_id: UInt32
sae_id: Categorical
all_pairs: List[Struct{
  similar_feature_id,
  decoder_similarity,
  semantic_similarity,
  char_jaccard,
  word_jaccard,
  main_prompt_ids,
  similar_prompt_ids,
  num_comparisons,
  max_char_ngram, max_char_ngram_size, max_char_ngram_jaccard,
  max_word_ngram, max_word_ngram_size, max_word_ngram_jaccard,
  main_char_ngram_positions, similar_char_ngram_positions,
  main_word_ngram_positions, similar_word_ngram_positions
}]
```

**Backend Usage**:
- Raw data consumed by Script 6_interfeature_display for classification

**Config**: `config/5_interfeature_similarity.json`

---

### Script 6: `6_activation_display.py`

**Purpose**: Creates frontend-optimized activation display data

**Input**:
- `activation_example_similarity.parquet`
- `activation_examples.parquet`

**Output**:
- `data/master/activation_display.parquet` (~67MB)

**Schema**:
```
feature_id: UInt32
sae_id: Categorical
quantile_examples: List[Struct{quantile_index, prompt_id, prompt_tokens, activation_pairs, max_activation, max_activation_position}]
semantic_similarity: Float32
semantic_similarity_std: Float32
char_ngram_max_jaccard: Float32
word_ngram_max_jaccard: Float32
top_word_ngram_text: Utf8
pattern_type: Utf8  # "Semantic" | "Lexical" | "Both" | "None"
```

**Key Optimization**:
- Pre-aggregates to feature-level rows (~250x faster than raw data)
- Pre-classifies pattern type using thresholds
- Removes '▁' prefix from tokens for display

**Backend Usage**:
- `DataService._activation_display_lazy` - **Primary path** for activation data
- `DataService._get_activation_examples_optimized()` - Fast path (~20ms)
- `SimilaritySortService._extract_activation_metrics()` - Gets intra_ngram_jaccard, intra_semantic_sim
- `CauseService._extract_metrics_from_barycentric()` - Joins activation metrics
- `ColdStartService._extract_pair_feature_metrics()` - Gets pair metrics
- `PairSimilarityService._extract_pair_metrics()` - Gets 3 intra-feature metrics per feature for 9D pair vectors
- `ActivationCacheService` - Pre-computes MessagePack+gzip blob at startup for fast frontend loading

**Config**: `config/6_activation_display.json`

---

### Script 6: `6_interfeature_display.py`

**Purpose**: Classifies inter-feature similarity pairs by pattern type

**Input**:
- `interfeature_activation_similarity_raw.parquet`

**Output**:
- `data/master/interfeature_activation_similarity.parquet` (~3MB)

**Schema**: Same as raw + `pattern_type` field in each pair struct

**Processing**:
- Classifies each pair as "Semantic", "Lexical", "Both", or "None" based on thresholds
- No filtering - all pairs included with classification

**Backend Usage**:
- `DataService._interfeature_similarity_lazy` - Loaded at initialization
- `ColdStartService._extract_pair_feature_metrics()` - Extracts inter_ngram_jaccard, inter_semantic_sim for Kennard-Stone sampling
- `PairSimilarityService._extract_pair_metrics()` - Gets inter_ngram_jaccard, inter_semantic_sim, decoder_similarity for 9D pair vectors
- `TableDataService` - Extracts similar feature data for table display

**Config**: `config/6_interfeature_display.json`

---

### Script 7: `7_explanation_alignment.py`

**Purpose**: Finds semantically aligned phrases across LLM explanations

**Input**:
- `explanation_embeddings.parquet`
- Explanation texts

**Output**:
- `data/master/explanation_alignment.parquet` (~406KB)

**Schema**:
```
feature_id: UInt32
sae_id: Categorical
num_aligned_groups: UInt16
aligned_groups: List[Struct{
  aligned_group_id,
  similarity_score,
  phrases: List[Struct{explainer_name, text, chunk_index}]
}]
```

**Processing**:
- Chunks explanation text into phrases
- Computes embedding similarity between phrases across explainers
- Groups aligned phrases with similarity >= 0.7

**Backend Usage**:
- `AlignmentService` loads at initialization via `_load_alignment_file()`
- `AlignmentService.get_highlighted_explanation()` - Returns highlighted segments for table display
- `TableDataService` - Uses alignment data for explanation highlighting in table view
- Builds 3-level cache: semantic segments → text → reconstructed

**Config**: `config/7_explanation_alignment.json`

---

### Script 8: `8_ex_act_pattern_matching.py`

**Purpose**: Dual lexical + semantic pattern validation

**Input**:
- Explanation texts
- Activation examples

**Output**:
- `data/master/ex_act_pattern_matching.parquet` (~81KB)

**Backend Usage**:
- Not directly loaded by backend services (optional validation data)

**Config**: `config/8_ex_act_pattern_matching.json`

---

### Script 9: `9_explanation_embedding_barycentric.py`

**Purpose**: Generates barycentric 2D positions for Stage 3 UMAP visualization

**Input**:
- `features.parquet` - scores and frac_nonzero
- `activation_display.parquet` - intra_feature_sim metrics
- `explanation_embeddings.parquet` - semantic similarities

**Output**:
- `data/master/explanation_barycentric.parquet` (~1MB)

**Schema**:
```
feature_id: UInt32
sae_id: Categorical
llm_explainer: Categorical
position_x: Float32
position_y: Float32
nearest_anchor: Utf8  # "noisy-activation" | "missed-N-gram" | "missed-context"
cluster_id: Int32  # HDBSCAN cluster assignment
intra_feature_sim: Float32
score_embedding: Float32
score_fuzz: Float32
score_detection: Float32
explanation_semantic_sim: Float32
explanation_semantic_sim_std: Float32
score_embedding_std: Float32
score_fuzz_std: Float32
score_detection_std: Float32
frac_nonzero: Float32
```

**Algorithm**:
1. Builds 6D metric vectors per (feature, explainer)
2. Barycentric projection using inverse distance weighting to 3 anchor points
3. HDBSCAN clustering (min_cluster_size=10, min_samples=5, cluster_selection_epsilon=0.2)

**Backend Usage**:
- `DataService._barycentric_lazy` - Loaded at initialization
- `CauseService._extract_metrics_from_barycentric()` - Primary metric source for Stage 3 SVM
- `SimilaritySortService._extract_metrics_from_barycentric()` - Fast metric extraction path
- `ColdStartService._extract_feature_metrics()` - 6D metrics for Kennard-Stone sampling

**Metrics Used** (12 total for SVM):
```python
# Mean metrics (7)
'intra_ngram_jaccard',       # From activation_display
'intra_semantic_sim',        # From activation_display
'score_embedding',           # From barycentric
'score_fuzz',                # From barycentric
'score_detection',           # From barycentric
'explanation_semantic_sim',  # From barycentric
'log_frac_nonzero',          # Computed from frac_nonzero

# Std metrics (5)
'intra_semantic_sim_std',    # From activation_display
'explanation_semantic_sim_std',  # From barycentric
'score_embedding_std',       # From barycentric
'score_fuzz_std',            # From barycentric
'score_detection_std',       # From barycentric
```

**Config**: `config/9_explanation_embedding_barycentric.json`

---

### Script 10: `10_assembled_explanations.py`

**Purpose**: Combines thematic codes from multiple explainers

**Input**:
- `thematic_codes.parquet`
- Feature scores

**Output**:
- `data/master/assembled_explanations.parquet`

**Processing**:
- Selects best explanation per feature based on fuzz/detection scores
- Assembles thematic codes across explainers

**Backend Usage**:
- Not directly loaded by backend (display/export use case)

**Config**: `config/10_assembled_explanations.json`

---

## Backend Service → Data File Mapping

| Service | Primary Data Files |
|---------|-------------------|
| `DataService` | features.parquet, activation_display.parquet, activation_examples.parquet, activation_example_similarity.parquet, interfeature_activation_similarity.parquet, explanation_barycentric.parquet |
| `AlignmentService` | explanation_alignment.parquet |
| `HierarchicalClusterCandidateService` | feature_similarity/clustering_linkage.npy, first_merge_clustering.parquet |
| `FeatureGroupService` | features.parquet (via DataService) |
| `HistogramService` | features.parquet (via DataService) |
| `TableDataService` | features.parquet, explanation_alignment.parquet, interfeature_activation_similarity.parquet |
| `SimilaritySortService` | barycentric + activation_display (via DataService) |
| `PairSimilarityService` | activation_display + interfeature_similarity + features.parquet (via DataService) |
| `CauseService` | barycentric + activation_display (via DataService) |
| `ColdStartService` | barycentric + interfeature_similarity (via DataService) |
| `ActivationCacheService` | activation_display.parquet (via DataService) |

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RAW DATA (data/raw/)                                │
│   JSONL files from LLM scorers + decoder weights                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            ┌───────────┐   ┌───────────┐   ┌───────────┐
            │ Script 0  │   │ Script 0  │   │ Script 1  │
            │ activation│   │ feature   │   │ scores    │
            │ examples  │   │ similarity│   │           │
            └─────┬─────┘   └─────┬─────┘   └─────┬─────┘
                  │               │               │
                  ▼               ▼               ▼
          activation_      clustering_        scores/
          examples.pq      linkage.npy        (dir)
                  │               │               │
                  │               │   ┌───────────┘
                  │               │   │
                  ▼               │   ▼
            ┌───────────┐        │ ┌───────────┐
            │ Script 4  │        │ │ Script 2  │
            │ act_embed │        │ │ ex_embed  │
            └─────┬─────┘        │ └─────┬─────┘
                  │              │       │
                  ▼              │       ▼
          activation_            │ explanation_
          embeddings.pq          │ embeddings.pq
                  │              │       │
          ┌───────┴───────┐      │       │
          │               │      │       │
          ▼               ▼      │       ▼
    ┌───────────┐  ┌───────────┐ │ ┌───────────┐
    │ Script 5  │  │ Script 5  │ │ │ Script 3  │
    │ act_sim   │  │ interf_sim│ │ │ features  │←─────────┐
    └─────┬─────┘  └─────┬─────┘ │ └─────┬─────┘          │
          │              │       │       │                │
          ▼              ▼       │       ▼                │
    activation_    interfeature_ │ features.pq ───────────┤
    example_sim.pq raw.pq        │       │                │
          │              │       │       │                │
          ▼              ▼       │       │                │
    ┌───────────┐  ┌───────────┐ │       │                │
    │ Script 6  │  │ Script 6  │ │       │                │
    │ act_disp  │  │ interf_   │ │       │                │
    └─────┬─────┘  │ display   │ │       │                │
          │        └─────┬─────┘ │       │                │
          ▼              ▼       │       │                │
    activation_    interfeature_ │       │                │
    display.pq     similarity.pq │       │                │
          │              │       │       │                │
          │              │       ▼       │                │
          │              │ ┌───────────┐ │                │
          │              │ │ Script 7  │ │                │
          │              │ │ ex_align  │ │                │
          │              │ └─────┬─────┘ │                │
          │              │       │       │                │
          │              │       ▼       │                │
          │              │ explanation_  │                │
          │              │ alignment.pq  │                │
          │              │       │       │                │
          └──────────────┴───────┼───────┘                │
                                 │                        │
                                 ▼                        │
                           ┌───────────┐                  │
                           │ Script 9  │                  │
                           │barycentric│                  │
                           └─────┬─────┘                  │
                                 │                        │
                                 ▼                        │
                           explanation_                   │
                           barycentric.pq ────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         BACKEND SERVICES                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  DataService (initialization)                                              │
│  ├── features.parquet → _df_lazy                                           │
│  ├── activation_display.parquet → _activation_display_lazy                 │
│  ├── interfeature_activation_similarity.parquet → _interfeature_sim_lazy   │
│  └── explanation_barycentric.parquet → _barycentric_lazy                   │
│                                                                             │
│  AlignmentService                                                          │
│  └── explanation_alignment.parquet → _semantic_cache                       │
│                                                                             │
│  HierarchicalClusterCandidateService                                       │
│  └── clustering_linkage.npy → linkage_matrix                               │
│                                                                             │
│  SimilaritySortService / CauseService / ColdStartService                   │
│  └── Use DataService's lazy frames for metric extraction                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Running the Pipeline

All scripts must be run from `data/preprocessing/scripts/` with their config files:

```bash
cd data/preprocessing/scripts

# Core pipeline (run in order)
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

# Pattern validation (optional)
python 7_explanation_alignment.py --config ../config/7_explanation_alignment.json
python 8_ex_act_pattern_matching.py --config ../config/8_ex_act_pattern_matching.json
python 9_explanation_embedding_barycentric.py --config ../config/9_explanation_embedding_barycentric.json
python 10_assembled_explanations.py --config ../config/10_assembled_explanations.json
```

---

## File Size Summary

| File | Size | Purpose |
|------|------|---------|
| activation_embeddings.parquet | ~848MB | Pre-computed activation embeddings |
| activation_examples.parquet | ~258MB | Raw activation data |
| explanation_embeddings.parquet | ~146MB | Explanation embeddings |
| activation_display.parquet | ~67MB | Frontend-optimized |
| activation_example_similarity.parquet | ~5.9MB | N-gram metrics |
| features.parquet | ~3.8MB | Main dataset |
| interfeature_activation_similarity.parquet | ~3MB | Cross-feature (processed) |
| interfeature_activation_similarity_raw.parquet | ~2MB | Cross-feature (raw) |
| explanation_barycentric.parquet | ~1MB | Stage 3 UMAP positions |
| explanation_alignment.parquet | ~406KB | Phrase alignments |
| ex_act_pattern_matching.parquet | ~81KB | Pattern validation |
| clustering_linkage.npy | ~2MB | Hierarchical clustering |

**Total**: ~1.3GB compressed

---

## Key Design Patterns

### 1. Dual N-gram Architecture (Script 5)
```python
# Character-level: morphological patterns
char_ngrams = extract_per_token(['playing', 'services'])
# → 'ing' at char_offset=4 in 'playing'

# Word-level: semantic patterns
word_ngrams = reconstruct_and_extract(['machine', 'learning'])
# → 'machine learning' at start_position=15
```

### 2. Natural Text Reconstruction (Script 4)
```python
# Input:  ['▁the', '▁service', 's', '▁of', '▁a']
# Output: "the services of a"
# Result: ~40% size reduction, readable text for embedding models
```

### 3. Feature-Level Aggregation (Script 6)
```python
# Transform: activation examples → feature-level rows
# Pre-process: Remove '▁' prefix from tokens
# Pre-classify: Pattern type (semantic/lexical/both/none)
# Result: ~250x faster frontend load
```

### 4. Barycentric Projection (Script 9)
```python
# 6D metric vectors → 2D visualization
# Uses inverse distance weighting to 3 anchor points:
# - noisy-activation
# - missed-N-gram
# - missed-context
```

---

**Pipeline Version**: 3.4
**Last Updated**: January 2026
