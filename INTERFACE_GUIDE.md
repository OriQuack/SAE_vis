# InSAEght Interface Guide

## Purpose

InSAEght is a visual analytics tool for evaluating the reliability of Sparse Autoencoder (SAE) feature explanations. When multiple LLMs generate explanations for the same SAE feature, their outputs often disagree. This tool helps researchers identify which explanations are trustworthy and diagnose why others fail.

The interface guides users through a 4-stage workflow to systematically categorize 16,000+ features based on explanation quality and consistency.

## Interface Layout

The interface has three main regions:

- **Top**: Stage navigation bar showing the 4-stage workflow
- **Left**: Sankey diagram (feature flow visualization) and Selection Panel (tagging summary)
- **Right**: Stage-specific view for detailed analysis and tagging

## Stage Navigation Bar

Four clickable tabs representing the analysis stages:

1. **Feature Splitting**: Identify fragmented features (concepts split across multiple features)
2. **Quality**: Assess whether explanations accurately describe feature behavior
3. **Cause**: Diagnose why explanations fail
4. **Summary**: Review final categorization results

Each tab shows tag counts and completion status. Clicking a tab switches the right panel to that stage's view.

## Sankey Diagram

A flow visualization showing how features distribute across metric thresholds.

**Reading the diagram**:
- Features flow from left to right through threshold-based segments
- Each column represents a quality metric (semantic distance, detection score, etc.)
- Segment height indicates feature count
- Color indicates the dominant tag category within that segment

**Interactions**:
- Click a segment to select its features for detailed analysis
- Hover for exact counts
- Inline histograms show score distributions within segments

## Selection Panel

Displays the current tagging state for selected features.

**Components**:
- **Category bars**: Visual breakdown of how many features are tagged in each category
- **Commit history**: Timeline of tagging actions with undo capability

Clicking a commit restores that tagging state.

## Stage 1: Feature Splitting View

**Goal**: Find feature pairs that represent the same concept (fragmented) vs. distinct concepts (monosemantic).

**What you see**:
- **Left list**: Feature pairs sorted by decoder similarity
- **Right panel**: Side-by-side comparison of two features
  - Activation examples showing what triggers each feature
  - Explanations from all three LLMs for each feature

**Tagging workflow**:
1. Review pairs with high decoder similarity (they activate on similar patterns)
2. Compare their explanations and activation contexts
3. Tag as **Fragmented** if they describe the same concept, **Monosemantic** if distinct
4. After enough manual tags, the system suggests batch classifications

**Bottom panel**: Histogram of SVM similarity scores with adjustable thresholds for batch tagging.

## Stage 2: Quality View

**Goal**: Determine which features have accurate explanations vs. those needing revision.

**What you see**:
- **Left list**: Individual features from the "Monosemantic" segment
- **Right panel**: Feature detail view
  - Activation examples with highlighted patterns
  - Explainer comparison triangle showing agreement between LLM pairs
  - All three explanations with semantic similarity highlighting

**Tagging workflow**:
1. Review activation examples to understand what the feature actually detects
2. Check if explanations match the observed patterns
3. Compare agreement across explainers (high agreement suggests reliability)
4. Tag as **Well-Explained** or **Need Revision**

**Bottom panel**: Score histogram for batch operations.

## Stage 3: Cause View

**Goal**: Diagnose why certain explanations fail.

**What you see**:
- **Left list**: Features tagged "Need Revision" from Stage 2
- **Right panel**:
  - Activation examples
  - Best explanation with quality metrics
  - Parallel coordinates showing feature metrics vs. well-explained baseline

**Cause categories**:
- **Pattern Miss**: Explanation misses the actual activation pattern (e.g., describes "numbers" but feature fires on punctuation)
- **Context Miss**: Explanation captures pattern but misses contextual constraints (e.g., describes "the" but feature only fires on sentence-initial "the")
- **Noisy Activation**: Feature activates inconsistently, making explanation impossible
- **Well-Explained**: Incorrectly flagged in Stage 2; actually well-explained

**Tagging workflow**:
1. Compare activation patterns against the explanation
2. Look for systematic mismatches (pattern vs. context issues)
3. Check activation consistency across examples
4. Assign the most appropriate cause category

**Bottom panel**: Decision margin histogram showing SVM confidence for each category.

## Stage 4: Summary View

**Goal**: Review and export final categorizations.

**What you see**:
- Overview statistics: Manual vs. automatic tag counts per category
- Final Sankey diagram showing complete feature flow
- Breakdown by stage and tag type

This stage is read-only; return to previous stages to modify tags.

## Shared Interface Elements

### StageAccordionList (Left List in Each View)

Three-phase workflow control:
- **Bootstrap**: View representative samples to understand the data
- **Learn**: Manual tagging trains the SVM classifier
- **Apply**: Review and accept SVM predictions

Toggle "Hide Tagged" to focus on remaining items.

### ThresholdTaggingPanel (Bottom Panel)

Histogram showing score distribution with draggable threshold handles.

- **Left threshold**: Items below this are candidates for rejection
- **Right threshold**: Items above this are candidates for selection
- **Convergence indicator**: Shows prediction stability across tagging iterations

Batch action buttons apply tags to all items beyond thresholds.

### Activation Examples

Token sequences with two highlight types:
- **Yellow gradient**: Activation strength (darker = stronger activation)
- **Blue underline**: Feature-specific pattern (tokens that consistently co-occur with this feature)

### Explanation Highlighting

Colored backgrounds on explanation phrases indicate cross-explainer agreement:
- **Green**: High semantic similarity with other explainers (≥0.85)
- **Yellow**: Medium similarity (≥0.70)
- **Orange**: Low similarity (≥0.60)

Unhighlighted text is unique to that explainer.

## Workflow Summary

1. **Start**: Select a Sankey segment to analyze
2. **Stage 1**: Tag feature pairs as Fragmented or Monosemantic
3. **Stage 2**: Tag Monosemantic features as Well-Explained or Need Revision
4. **Stage 3**: Diagnose causes for Need Revision features
5. **Stage 4**: Review results

Each stage uses active learning: initial manual tags train an SVM that suggests batch classifications, reducing manual effort while maintaining accuracy.
