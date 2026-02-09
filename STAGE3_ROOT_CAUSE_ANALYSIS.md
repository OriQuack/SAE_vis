# Stage 3: Root Cause Analysis

## Overview

Stage 3 diagnoses *why* features were flagged as "Need Revision" in Stage 2. It classifies each problematic feature into one of three root cause categories using an interactive One-vs-Rest SVM with active learning, visualized through a RadViz scatter plot. Users follow a Bootstrap → Learn → Apply workflow to iteratively label and classify features.

---

## Cause Categories

Three mutually exclusive root cause categories explain why an explanation fails to faithfully describe a feature:

- **Noisy Activation**: The feature fires on heterogeneous, unrelated inputs; no coherent explanation is possible because the feature itself lacks a clear pattern
- **Missed N-gram**: The feature has a consistent lexical/surface pattern (e.g., shared subwords, morphological patterns) that the LLM explanation failed to capture
- **Missed Context**: The feature has a consistent semantic/contextual pattern (e.g., topic, syntactic role) that the LLM explanation failed to capture

---

## Feature Vector (12 Dimensions)

Stage 3 reuses the same 12-dimensional feature representation as Stage 2:

**Mean metrics (7 dims):**
- `intra_ngram_jaccard` -- max of char/word n-gram Jaccard across activation examples
- `intra_semantic_sim` -- mean pairwise semantic similarity of activation-weighted embeddings
- `score_embedding` -- embedding-based AUC score (mean across explainers)
- `score_fuzz` -- fuzzy matching accuracy (mean across explainers)
- `score_detection` -- detection accuracy (mean across explainers)
- `explanation_semantic_sim` -- mean semantic similarity between explainer explanations
- `log_frac_nonzero` -- log(frac_nonzero + 1e-8)

**Std metrics (5 dims):**
- `intra_semantic_sim_std` -- variability in activation-level semantic consistency
- `explanation_semantic_sim_std` -- cross-explainer semantic disagreement
- `score_embedding_std` -- cross-explainer embedding score disagreement
- `score_fuzz_std` -- cross-explainer fuzz score disagreement
- `score_detection_std` -- cross-explainer detection score disagreement

---

## One-vs-Rest SVM Classification

- One SVM per cause category (3 binary SVMs total), each with RBF kernel (C=1.0, gamma=scale, balanced class weights)
- Features are standardized (StandardScaler) before training
- Sample weights differentiate direct clicks (weight=1.0) from threshold-applied tags (weight=0.2)
- Each SVM produces a signed decision score per feature
- **Decision vector**: For each feature, the 3 OvR decision scores form a 3D vector
- **Predicted category**: argmax of the 3 decision scores
- **Decision margin**: min(|scores|) across the 3 dimensions; low margin indicates the feature sits near a decision boundary (high uncertainty)

---

## Cold Start: Diversity Sampling

- Before any user labels exist, representative features are selected via Kennard-Stone algorithm
- Computes pairwise Euclidean distance matrix over the 12-dimensional feature vectors (subset: 6 key metrics for efficiency)
- Initialization: selects the 2 features with maximum pairwise distance
- Greedy expansion: iteratively adds the feature that maximizes the minimum distance to all already-selected features
- Produces a diverse initial set that spans the feature space, avoiding redundant examples

---

## RadViz Visualization

- Three cause categories are placed as anchors on an equilateral triangle
- For each feature, the 3 OvR decision scores are passed through softmax to produce weights summing to 1.0
- The feature's 2D position is the weighted sum of the three anchor coordinates
- Features near a single anchor have high confidence for that category; features near the center are uncertain
- **Contour overlay**: After classification, kernel density estimation (KDE) via d3-contour shows the distribution of each category on the RadViz plane
- Untagged features are shown as small dots; tagged features use category-specific colors and larger markers

---

## Decision Margin Histogram

- Displays the distribution of SVM decision margins (min |score|) across all features
- 40 bins, with bars colored by predicted cause category
- Draggable threshold line allows users to set a confidence cutoff
- Features with margin above the threshold are candidates for auto-tagging
- Helps users identify confident predictions vs. uncertain boundary cases

---

## Active Learning (Query by Committee)

- Alongside the 3 OvR SVMs, a multi-class Random Forest and a multi-class MLP are trained on the same labeled data
- **Random Forest**: 10–100 estimators (scaled by sample count), max depth 2–5
- **MLP**: PyTorch-based WeightedMLPClassifier with hidden layers (16 or 32→16, scaled by feature count); applies sample weights directly in the loss function
- Minimum samples per class: 2 for multi-class mode
- For each untagged feature, all three models predict a category label
- **Vote entropy**: −Σ(p · log₂(p)) where p is the fraction of committee members voting for each category; high entropy = high disagreement
- Disagreement cases (outliers) are surfaced to the user as high-value labeling candidates

---

## Bootstrap → Learn → Apply Workflow

The Stage 3 UI guides users through three phases:

1. **Bootstrap**: Cold-start phase using Kennard-Stone diversity sampling; presents representative features for initial labeling; requires minimum 2 labels per category to proceed
2. **Learn**: Active learning phase; user tags features informed by RadViz positions, committee disagreement markers, and SVM predictions; the model retrains after each batch of labels
3. **Apply**: Threshold application phase; user sets a decision margin threshold on the histogram; features with margin above the threshold are auto-tagged with their predicted category

---

## Effective Category Resolution

Each feature's displayed category follows a 3-level priority system:

1. **User-confirmed** (clicked): Highest priority; the user manually assigned this category
2. **Threshold-checked predicted**: Medium priority; the SVM predicted this category and the user accepted it via threshold application
3. **Unsure**: Default state; no label assigned yet

---

## Convergence Monitoring

- **Decision Flip Rate**: Tracks how many features change their predicted category between successive tagging iterations
- Displayed as a sparkline in the ConvergenceIndicator with stacked category bars
- A decreasing flip rate signals that the model is stabilizing and fewer labels are needed
- Helps users decide when to stop the active learning loop

---

## Stage 3 Output

- Each "Need Revision" feature from Stage 2 receives a root cause label (noisy-activation, missed-N-gram, or missed-context)
- Labels are either manually assigned or auto-tagged via the SVM threshold
- Results feed into Stage 4 (Summary), which provides an overview of manual vs. auto tagging breakdown across all stages
