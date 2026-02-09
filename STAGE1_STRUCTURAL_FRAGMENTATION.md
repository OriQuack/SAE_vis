# Stage 1: Structural Fragmentation Detection

## Overview

Stage 1 identifies structurally fragmented SAE features -- features that have been split across multiple latents that should conceptually be one. It pairs features via hierarchical clustering on decoder weights, then uses an interactive SVM-based active learning loop to classify pairs as fragmented or monosemantic.

---

## Activation-Weighted Embedding

- Each feature's activation examples are sampled via quantile-based sampling (4 quantiles, 4 examples per quantile) to ensure representation across the activation range
- For each example, a 32-token window centered on the max-activated position is extracted and reconstructed into natural text
- The text is encoded using a sentence-transformer (EmbeddingGemma-300M) to obtain per-token embeddings
- Activation values from the original Gemma 9B model are mapped onto the embedding model's token positions via character-span alignment between the two tokenizers
- Softmax-weighted pooling aggregates token embeddings using activation values as weights (temperature = 40.0), emphasizing tokens the feature actually fires on
- The pooled embedding is then passed through EmbeddingGemma's projection layers (Dense + Normalize) to produce the final L2-normalized embedding
- If no activations exist, mean pooling is used as a fallback

---

## Activation Similarity (Intra-Feature)

Per-feature metrics computed from activation examples:

- **Intra-semantic similarity**: Mean pairwise cosine similarity of activation-weighted embeddings across a feature's examples (+ std for variability)
- **Intra-ngram Jaccard**: Max of character-level and word-level n-gram Jaccard similarity across activation examples
  - Character n-grams: extracted from 3-token windows (captures morphological patterns like suffixes/prefixes)
  - Word n-grams: extracted from 11-token windows of reconstructed text (captures semantic phrases)

---

## Inter-Feature Similarity

For each candidate pair (A, B), computed from their activation examples:

- **Inter-semantic similarity**: Cosine similarity between activation-weighted embeddings of the two features
- **Inter-ngram Jaccard**: Max of character-level and word-level n-gram Jaccard similarity between activation examples of the two features
- **Decoder similarity**: Cosine similarity between L2-normalized decoder weight vectors

---

## Hierarchical Clustering

- Decoder weights are extracted from the SAE model (JumpReLU SAE, Gemma Scope 9B)
- Pairwise cosine similarity is computed across all decoder weight vectors
- Cosine distance matrix is derived as (1 - cosine similarity)
- The condensed distance matrix is passed to agglomerative clustering with average linkage
- The resulting linkage matrix (scipy format) is stored and reused at runtime
- At query time, the dendrogram is cut at a user-specified distance threshold T using `scipy.cluster.hierarchy.fcluster`

---

## Pair Candidate Building Logic

- The dendrogram is cut at threshold T, producing clusters of features with similar decoder weights
- Only clusters with 2+ features are retained (singletons cannot form pairs)
- All pairwise combinations within each cluster are generated as candidate pairs
- Filtered pair generation applies additional criteria:
  - **Condition 1 (required)**: decoder similarity > (1 - T)
  - **Condition 2**: Either feature appears in the other's top-20 semantic-similar neighbors
  - **Condition 3**: Either feature appears in the other's top-10 decoder-similar neighbors
  - Pairs must pass Condition 1 AND (Condition 2 OR Condition 3)
- **Fallback guarantee**: For any feature left without pairs after filtering, the best decoder-similar pair is added to ensure every feature has at least one pair
- A global cap of 32,768 pairs prevents memory issues

---

## SVM-Based Pair Scoring

- Each pair is represented as a 9-dimensional vector:
  - **Dims 1-3**: A + B (element-wise sum of intra-feature metrics)
  - **Dims 4-6**: |A - B| (element-wise absolute difference of intra-feature metrics)
  - **Dim 7**: inter-ngram Jaccard(A, B)
  - **Dim 8**: inter-semantic similarity(A, B)
  - **Dim 9**: decoder similarity(A, B)
- The 3 intra-feature metrics used are:
  - `intra_ngram_jaccard` (max of char/word n-gram Jaccard)
  - `intra_semantic_sim` (mean semantic similarity within activations)
  - `intra_semantic_sim_std` (std of semantic similarity)
- Users manually tag pairs as "fragmented" (selected) or "monosemantic" (rejected)
- An SVM with RBF kernel (C=1.0, gamma=scale, balanced class weights) is trained on tagged pairs
- Features are standardized (StandardScaler) before training
- Sample weights differentiate direct clicks (weight=1.0) from threshold-applied tags (weight=0.2)
- All untagged pairs are scored by signed distance from the SVM decision boundary
- Positive scores indicate similarity to fragmented pairs; negative scores indicate monosemantic

---

## Active Learning (Query by Committee)

- Alongside the SVM, a Random Forest (100 trees, max depth 5) and an MLP are trained on the same labeled data
- For each untagged pair, all three models predict a label
- Vote entropy across the committee identifies disagreement cases (high entropy = uncertain)
- Bimodality detection (Hartigan's Dip test + GMM BIC comparison) on the SVM score distribution guides threshold placement for batch tagging
- Decision Flip Rate tracks prediction changes across tagging iterations for convergence monitoring
