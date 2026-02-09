# Stage 2: Explanation Faithfulness Assessment

## Overview

Stage 2 assesses whether LLM-generated explanations faithfully describe what an SAE feature actually does. It combines automated scoring metrics, cross-explainer agreement analysis, and an interactive SVM-based active learning loop where users tag features as "Well-Explained" or "Need Revision."

---

## Scoring Metrics (Per Feature, Per Explainer)

Three automated scoring methods evaluate how well an explanation matches feature behavior:

- **Fuzz score**: Binary correctness test using fuzzy string matching between explanation predictions and actual activation patterns; reported as accuracy (proportion correct)
- **Detection score**: Binary correctness test evaluating whether the explanation can distinguish activating from non-activating examples; reported as accuracy
- **Embedding score**: Embedding-based similarity between explanation predictions and actual activations; uses cosine similarity as the prediction score and computes AUC with distance-based labels (distance >= 0 = activating, distance == -1 = non-activating)

Each feature has scores from multiple LLM scorers (e.g., Llama). For the SVM, scores are averaged across the 3 explainers to produce a single value per feature.

---

## Explanation Embeddings

- Each LLM explanation text is embedded using a sentence-transformer model (EmbeddingGemma-300M)
- Embeddings are generated per (feature, explainer) combination
- Cross-explainer semantic similarity is computed as cosine similarity between explanation embeddings of different explainers for the same feature
- This measures whether different LLMs describe the same feature similarly

---

## Explanation Alignment (Cross-Explainer Phrase Matching)

- Explanation texts are chunked into phrases using a smart chunking method (period/comma-based splitting)
- Each phrase is embedded using the same sentence-transformer model
- For each feature, phrases from all explainers are compared pairwise
- Phrase pairs with cosine similarity >= 0.7 are grouped into aligned groups
- Aligned groups must span at least 2 different explainers
- The alignment service reconstructs full explanation text with highlighted aligned segments for visualization
- Highlighting uses bold styling; the frontend renders color intensity based on similarity score

---

## Explanation Consensus (HDBSCAN Phrase Clustering)

- Explanation texts are divided into phrases (smart chunking)
- Phrases are embedded using token-level embeddings + mean pooling + EmbeddingGemma projection layers (aligned with the activation embedding space from Stage 1)
- HDBSCAN clusters phrases per feature (min_cluster_size=2, min_samples=1, Euclidean metric)
- For each cluster:
  - The medoid (point closest to centroid) is identified as the representative phrase
  - Cluster coherence is computed as the mean pairwise cosine similarity within the cluster
  - Cluster score is the sum of phrase weights (each explanation contributes 1.0 total, divided equally among its phrases)
- Phrases not assigned to any cluster are flagged as outliers
- Each phrase (and medoid) is scored by cosine similarity to the feature's activation centroid (mean of activation-weighted embeddings from Stage 1)
- The consensus score for a feature is the sum of all cluster scores (maximum = number of explainers, e.g., 3.0)
- Higher consensus score indicates more agreement among explainers about what the feature does
- Per-cluster average quality score is computed from the explainer-level scoring metrics (mean of detection, fuzz, embedding scores)

---

## Features Parquet Assembly

The features.parquet file joins data from multiple pipeline steps into a single nested structure per (feature, explainer):

- **Scores**: Nested list of scorer results (fuzz, detection, embedding) per scorer
- **Decoder similarity**: Top-10 most similar features by decoder weight cosine similarity
- **Decoder merge threshold**: The distance at which a feature first merges in the hierarchical clustering (converted to similarity as 1 - distance)
- **Semantic similarity**: Pairwise cosine similarity of explanation embeddings between explainers for the same feature
- **frac_nonzero**: Fraction of non-zero activations from Neuronpedia (used as log-transformed feature in SVM)

---

## SVM Feature Vector (12 Dimensions)

Each feature is represented as a 12-dimensional vector for SVM classification:

**Mean metrics (7 dims):**
- `intra_ngram_jaccard` -- max of char/word n-gram Jaccard across activation examples (lexical consistency)
- `intra_semantic_sim` -- mean pairwise semantic similarity of activation-weighted embeddings (semantic consistency)
- `score_embedding` -- embedding-based AUC score (mean across explainers)
- `score_fuzz` -- fuzzy matching accuracy (mean across explainers)
- `score_detection` -- detection accuracy (mean across explainers)
- `explanation_semantic_sim` -- mean semantic similarity between explainer explanations
- `log_frac_nonzero` -- log(frac_nonzero + 1e-8), handling sparse activation distributions

**Std metrics (5 dims, capturing cross-explainer disagreement):**
- `intra_semantic_sim_std` -- variability in activation-level semantic consistency
- `explanation_semantic_sim_std` -- cross-explainer semantic disagreement
- `score_embedding_std` -- cross-explainer embedding score disagreement
- `score_fuzz_std` -- cross-explainer fuzz score disagreement
- `score_detection_std` -- cross-explainer detection score disagreement

---

## SVM-Based Feature Scoring

- Users manually tag features as "Well-Explained" (selected) or "Need Revision" (rejected)
- An SVM with RBF kernel (C=1.0, gamma=scale, balanced class weights) is trained on the 12-dimensional feature vectors
- Features are standardized (StandardScaler) before training
- Sample weights differentiate direct clicks (weight=1.0) from threshold-applied tags (weight=0.2)
- All untagged features are scored by signed distance from the SVM decision boundary
- Positive scores indicate similarity to "Well-Explained" features; negative scores indicate "Need Revision"

---

## Active Learning (Query by Committee)

- Alongside the SVM, a Random Forest (100 trees, max depth 5) and an MLP are trained on the same labeled data
- For each untagged feature, all three models predict a label
- Vote entropy across the committee identifies disagreement cases (high entropy = uncertain)
- Bimodality detection (Hartigan's Dip test + GMM BIC comparison) on the SVM score distribution guides threshold placement for batch tagging
- Decision Flip Rate tracks prediction changes across tagging iterations for convergence monitoring

---

## Stage 2 to Stage 3 Handoff

- Features tagged as "Need Revision" in Stage 2 are passed to Stage 3 (Root Cause Analysis)
- The Stage 2 SVM model can also be reused to score Stage 3 features by their proximity to the "Well-Explained" decision boundary, providing a quality baseline for cause diagnosis
