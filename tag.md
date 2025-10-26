  Understanding Your Available Metrics & Their Semantic Meanings

  Reference: https://arxiv.org/pdf/2410.13928 (Automated SAE Feature Interpretation)

  SCORING STRUCTURE:
  - 1 Feature → 3 Explanations (from 3 LLM Explainers: Llama, Qwen, OpenAI)
  - 1 Explanation → 3 Scoring Metrics (Embedding, Fuzz, Detection)
  - Embedding Score: 1 value per explanation (no LLM scorers)
  - Fuzz & Detection Scores: 3 values each (from 3 LLM Scorers per metric)
  - Quality Score: 1 per feature = average of z-scores across metrics and explainers
    (each metric averaged over scorers first, then z-score computed per explainer)

  Core Metrics (What They Actually Measure)

  1. Feature Splitting (Cosine Similarity of SAE Decoder Directions)
    - Measures: Whether feature is OVER-SPLIT (multiple SAE features for same concept)
    - Tests: Cosine similarity between SAE decoder directions
    - High (> 0.7): PROBLEM - Feature suspected of over-splitting (noisy, unreliable)
    - Low (< 0.3): GOOD - Feature is a single coherent concept (not over-split)
    - Interpretation: Lower is better - indicates feature is not fragmented across multiple SAE features
    - Note: Feature over-splitting is a common SAE problem that reduces interpretability

  2. Embedding Score
    - Measures: Alignment between feature activation pattern and explanation text embeddings
    - Tests: Similarity between where feature activates vs. what explanation describes
    - High (> 0.7): Explanation accurately captures feature's actual behavior in data
    - Low (< 0.3): Explanation doesn't match where/how feature actually activates
    - Interpretation: Accuracy of explanation relative to ground-truth activations
    - Note: 1 score per explanation (no multiple scorers)

  3. Fuzz Score
    - Measures: Explanation ROBUSTNESS under input perturbations
    - Tests: When input text is perturbed, do feature activations remain consistent?
    - High (> 0.7): Explanation captures genuinely predictive patterns (robust)
    - Low (< 0.3): Explanation based on spurious correlations (fragile)
    - Interpretation: Stability and generalizability of explanation
    - Note: 3 scores per explanation (from 3 LLM Scorers)

  4. Detection Score
    - Measures: PREDICTIVE UTILITY of explanation
    - Tests: Can classifier trained on explanation-relevant tokens predict activations?
    - High (> 0.7): Explanation provides actionable, predictive information
    - Low (< 0.3): Explanation has low predictive power for feature behavior
    - Interpretation: Usefulness of explanation for predicting feature activations
    - Note: 3 scores per explanation (from 3 LLM Scorers)

  5. Semantic Similarity (Between LLM Explanations)
    - Measures: Agreement between different LLM explainers
    - Computed: Pairwise cosine similarity of explanation embeddings
    - High (> 0.7): LLMs agree on interpretation → unambiguous feature
    - Low (< 0.3): LLMs disagree → multiple valid interpretations or confusion
    - Interpretation: Inter-explainer consensus

  6. Quality Score (Composite Metric)
    - Computed: Average of z-scores across Embedding, Fuzz, Detection per explainer
      1. For Fuzz & Detection: Average over 3 LLM Scorers first
      2. Compute z-score for each metric per explainer
      3. Average z-scores across all metrics for final quality score
    - High (> 0.8): High-quality, reliable explanation across all dimensions
    - Low (< 0.4): Poor explanation quality overall
    - Interpretation: Overall explanation reliability

  7. Range-Based Consistency Metrics (Simple Variability Measures)
    - Semantic Similarity Range: Spread of pairwise semantic similarity between LLM Explainers
      - Low range (< 0.2): Explainers agree on interpretation → consistent feature
      - High range (> 0.5): Explainers disagree significantly → ambiguous feature
    - Quality Score Range: Spread of quality scores across different LLM Explainers
      - Low range (< 0.2): Consistent quality assessment → stable explanation
      - High range (> 0.5): Some explainers much better than others → explainer-dependent
    - Detection Score Range: Spread of detection scores across different LLM Scorers
      - Low range (< 0.2): Scorers agree on predictive utility → robust metric
      - High range (> 0.5): Scorers disagree on usefulness → scorer-dependent
    - Fuzz Score Range: Spread of fuzz scores across different LLM Scorers
      - Low range (< 0.2): Scorers agree on robustness → stable pattern
      - High range (> 0.5): Scorers disagree on stability → scorer-dependent
    - Interpretation: Range = max - min across LLMs
      - Smaller range → more reliable, consistent across different LLM perspectives
      - Larger range → less reliable, interpretation varies by which LLM is used

  ---
  Tag Examples & Metric Signatures (CORRECTED)

  Based on corrected metric understanding, here are meaningful tag patterns:

  1. "Well-Explained Coherent Feature" (Gold Standard)

  Metric Pattern:
  - Feature Splitting: LOW (< 0.3) — NOT over-split, single coherent feature
  - Embedding Score: HIGH (> 0.7) — explanation matches actual activation patterns
  - Fuzz Score: HIGH (> 0.7) — explanation robust to input perturbations
  - Detection Score: HIGH (> 0.7) — explanation has predictive utility
  - Semantic Similarity: HIGH (> 0.7) — all explainers agree on interpretation
  - Quality Score: HIGH (> 0.8) — high overall reliability
  - All Range Metrics: LOW (< 0.2) — consistent across LLMs

  Interpretation: Feature is coherent (not over-split), well-understood, and reliably explained.
  All metrics agree that the explanation accurately captures feature behavior.

  Real Example: Feature detecting a specific, well-defined linguistic pattern with consistent,
  predictable activations across all LLM explainers.

  ---
  2. "Over-Split Feature" (Fragmented Concept)

  Metric Pattern:
  - Feature Splitting: HIGH (> 0.7) — PROBLEM: feature is over-split across multiple SAE features
  - Quality Score: LOW-MEDIUM (0.3-0.6) — fragmentation reduces quality
  - Embedding Score: MEDIUM (0.4-0.6) — partial alignment due to fragmentation
  - Fuzz Score: LOW-MEDIUM — less robust due to splitting
  - Detection Score: MEDIUM — reduced predictive power
  - Quality Score Range: HIGH (> 0.4) — different explainers capture different fragments

  Interpretation: Feature suffers from SAE over-splitting problem. Single concept fragmented
  across multiple features, making individual features noisy and less interpretable.

  Real Example: Concept like "negation" split across multiple features, each capturing partial
  aspect (e.g., "not", "never", "no" as separate features instead of unified "negation").

  ---
  3. "Spurious/Fragile Feature" (Unreliable Pattern)

  Metric Pattern:
  - Fuzz Score: LOW (< 0.3) — explanation NOT robust to perturbations
  - Detection Score: LOW (< 0.3) — poor predictive utility
  - Embedding Score: LOW-MEDIUM (< 0.5) — weak alignment with activations
  - Feature Splitting: VARIABLE — may or may not be over-split
  - Quality Score: LOW (< 0.4) — poor overall explanation quality
  - Detection/Fuzz Range: HIGH (> 0.5) — scorers disagree significantly

  Interpretation: Feature based on spurious correlations rather than genuine patterns.
  Explanations don't generalize or provide predictive value.

  Real Example: Feature overfitting to training data artifacts, noise patterns,
  or context-specific quirks that don't generalize.

  ---
  4. "Multi-Interpretation Feature" (Ambiguous)

  Metric Pattern:
  - Semantic Similarity: LOW (< 0.3) — explainers disagree on interpretation
  - Semantic Similarity Range: HIGH (> 0.5) — high variation in agreement
  - Quality Score Range: HIGH (> 0.4) — some explainers much better than others
  - Embedding/Fuzz/Detection: MEDIUM (0.4-0.6) — partial success
  - Feature Splitting: LOW-MEDIUM — may not be over-split, just ambiguous

  Interpretation: Feature has multiple valid interpretations or captures overlapping concepts.
  Different LLMs understand it differently.

  Real Example: Feature activating for both "questions" and "uncertainty" language,
  or mixing syntactic and semantic patterns without clear distinction.

  ---
  5. "Robust Specialized Feature" (High Precision)

  Metric Pattern:
  - Feature Splitting: LOW (< 0.3) — coherent, not over-split
  - Fuzz Score: HIGH (> 0.7) — very robust to perturbations
  - Detection Score: HIGH (> 0.7) — highly predictive
  - Embedding Score: MEDIUM-HIGH (0.6-0.8) — good alignment
  - Semantic Similarity: HIGH (> 0.7) — explainers agree
  - All Range Metrics: LOW (< 0.2) — consistent across LLMs

  Interpretation: Feature captures robust, predictive pattern with clear boundary,
  consistently explained by all LLMs.

  Real Example: Feature detecting specific syntactic structures, formatting patterns,
  or domain-specific terminology with high precision.

  ---
  6. "Noisy/Dead Feature" (Complete Failure)

  Metric Pattern:
  - All core metrics: LOW (< 0.3)
  - Quality Score: LOW (< 0.3)
  - Feature Splitting: VARIABLE — could be over-split or just dead
  - All Range Metrics: HIGH (> 0.5) — high disagreement due to noise

  Interpretation: Feature is fundamentally noisy, incoherent, or uninterpretable.
  No explanation works reliably.

  Real Example: Random activation patterns, dead features with minimal activation,
  or features capturing noise rather than signal.

  ---
  Research Questions for VIS Conference

  Your workflow addresses key challenges in ML interpretability:

  1. Scalability: How do analysts go from inspecting 10 features to understanding patterns across
  1,000+ features?
  2. Pattern Discovery: How do users discover interpretable patterns in high-dimensional metric
  spaces?
  3. Verification: How do users validate that similar features truly share semantic properties?
  4. Iterative Refinement: How do tag definitions evolve as users learn more about the data?

  This is visual analytics for interpretable ML — a hot VIS topic!

  ---
  Conceptual Approach: Three-Phase Workflow

  Phase 1: Tag Definition & Seed Selection

  User Actions:
  1. Filter features via Sankey (narrow to interesting subset)
  2. Inspect feature in TablePanel (view scores, explanations)
  3. Assign tag with semantic label (e.g., "syntactic feature")
  4. Define metric signature (which metrics matter, thresholds)

  System Actions:
  - Store tag definition: { name, metricSignature, seedFeatures }
  - Metric signature can be:
    - Threshold-based: "embedding < 0.3 AND fuzz > 0.7"
    - Range-based: "embedding in [0.2, 0.4], fuzz in [0.7, 0.9]"
    - Relative: "embedding is lowest metric, fuzz is highest metric"

  Design Decisions:
  - Template-based tags: Pre-defined patterns (syntactic, semantic, unreliable) vs. custom tags
  - Visual tag builder: Interactive interface for defining metric constraints
  - Explanation-driven tagging: User can tag based on reading explanations, system infers metric
  signature

  ---
  Phase 2: Similarity-Based Candidate Discovery

  User Actions:
  1. Select a tagged feature or tag category
  2. Request candidate features that match the pattern
  3. Review ranked list of similar features

  System Actions:
  - Similarity computation in metric space:
    - Euclidean distance: Distance in 6D metric space (feature_splitting, embedding, fuzz,
  detection, semantic_sim, quality_score)
    - Cosine similarity: Direction-based similarity in metric space
    - Pattern matching: Logical rule evaluation (does feature satisfy metric signature?)
    - Weighted distance: User-adjustable weights per metric (e.g., weight embedding 2x for semantic
   tags)

  Ranking Strategies:
  1. Distance-based: Closest features in metric space (k-NN style)
  2. Confidence-based: Features satisfying metric signature with confidence score
  3. Hybrid: Combine distance + pattern matching

  Design Decisions:
  - Number of candidates: Top-k (e.g., 10, 50, 100) vs. threshold-based (all within distance d)
  - Similarity threshold: Confidence cutoff (e.g., only show 90%+ matches)
  - Multi-metric weighting: Which metrics are most important for this tag?

  ---
  Phase 3: Verification & Tag Propagation

  User Actions:
  1. Review candidate features (see scores, explanations)
  2. Verify true positives (correctly matching tag)
  3. Reject false positives (incorrectly suggested)
  4. Bulk tag verified candidates
  5. Refine tag definition based on feedback

  System Actions:
  - Apply tags to verified features
  - Metric signature refinement: Adjust thresholds based on false positives/negatives
    - If false positive has "embedding = 0.35", tighten threshold to "< 0.3"
  - Active learning: Suggest boundary cases for user verification
  - Track tag evolution history (how definitions changed over time)

  Design Decisions:
  - Verification interface: Compact list view vs. detailed inspection
  - Bulk operations: Select multiple candidates at once vs. one-by-one
  - Tag conflicts: What if feature matches multiple tags? (allow multi-tagging, priority system, or
   exclusive tags)
  - Refinement automation: Manual threshold adjustment vs. automated learning from feedback

  ---
  Visualization Approaches (Non-Code Directions)

  1. Tag Management Panel (New Component)

  Purpose: Central hub for tag creation, management, and exploration

  Visual Elements:
  - Tag List: Shows all defined tags with counts (e.g., "Syntactic (23 features)")
  - Metric Signature Visualizer: Radar chart or bar chart showing metric thresholds per tag
  - Tag Creation Interface: Interactive builder for defining metric constraints
  - Tag Statistics: Distribution of features across tags, tag overlap analysis

  Interactions:
  - Click tag → filter TablePanel to show only tagged features
  - Edit tag → adjust metric signature, re-run candidate discovery
  - Delete tag → remove tag from all features

  ---
  2. Similarity Explorer Panel

  Purpose: Discover and verify candidate features for tag propagation

  Visual Elements:
  - Candidate List: Ranked list with similarity scores and metric values
  - Metric Comparison View: Side-by-side comparison of seed feature vs. candidate
    - Radar chart: Overlay seed (blue) and candidate (orange) metric profiles
    - Parallel coordinates: Show metric trajectories for seed + top-k candidates
  - Explanation Preview: Hover to see explanation text (check semantic similarity)
  - Verification Buttons: ✓ Verify (add tag), ✗ Reject (exclude), ? Unsure (skip)

  Interactions:
  - Adjust similarity threshold slider → update candidate list
  - Select multiple candidates → bulk verify/reject
  - Click candidate → jump to TablePanel for detailed inspection

  ---
  3. Metric Signature Builder (Interactive)

  Purpose: Visual interface for defining tag metric signatures

  Visual Elements:
  - Metric Threshold Sliders: One per metric (embedding, fuzz, detection, etc.)
  - Live Preview: Show histogram with selected range highlighted
  - Feature Count: Real-time count of features matching current signature
  - Signature Summary: Visual encoding of thresholds (e.g., bar chart with ranges)

  Interactions:
  - Drag threshold handles on histogram → adjust range
  - Toggle metrics on/off (e.g., only use embedding + fuzz for this tag)
  - Preview matching features before finalizing tag

  ---
  4. Tag Propagation Visualization

  Purpose: Show how tags spread across feature space

  Visual Elements:
  - Scatter Plot: Features in 2D projection (e.g., PCA/UMAP of metric space)
    - Seed features: Large circles
    - Tagged features: Colored by tag
    - Candidates: Outlined or semi-transparent
  - Tag Propagation Timeline: Show evolution of tag over verification iterations
  - Confusion Matrix: True positives, false positives after verification

  Interactions:
  - Click feature → inspect in TablePanel
  - Lasso select → bulk tag/verify candidates
  - Color by tag, size by similarity score

  ---
  5. Integration with Existing Views

  Sankey Diagram:
  - Tag-based coloring: Color nodes by dominant tag in group
  - Tag filtering: Filter Sankey to show only features with specific tag
  - Tag legend: Show tag distribution in each node (e.g., "30% syntactic, 70% semantic")

  TablePanel:
  - Tag Column: Add column showing tags as badges (multi-tag support)
  - Tag Filtering: Filter table to show tagged/untagged features
  - Tag Sorting: Sort by tag name, tag count
  - Inline tagging: Right-click row → assign tag

  FlowPanel:
  - Unchanged (focuses on LLM selection, not feature-level tags)

  ---
  Similarity Computation Strategies

  You need to choose how to define "similar features":

  Option 1: Euclidean Distance in Metric Space

  Approach: Treat each feature as a point in 6D space (6 metrics)

  Formula:
  distance(A, B) = sqrt(
    (embedding_A - embedding_B)² +
    (fuzz_A - fuzz_B)² +
    (detection_A - detection_B)² +
    (feature_splitting_A - feature_splitting_B)² +
    (semantic_sim_A - semantic_sim_B)² +
    (quality_score_A - quality_score_B)²
  )

  Pros:
  - Simple, interpretable
  - Well-defined notion of closeness
  - Easy to implement k-NN

  Cons:
  - All metrics weighted equally (may need weighting)
  - Doesn't capture logical patterns (e.g., "embedding < 0.3 AND fuzz > 0.7")

  ---
  Option 2: Pattern Matching (Logical Rules)

  Approach: Define tag as logical constraint, find all features satisfying it

  Formula:
  Tag "Syntactic" = {
    embedding < 0.3 AND
    fuzz > 0.7 AND
    detection > 0.7 AND
    feature_splitting > 0.5
  }

  Pros:
  - Explicit, interpretable rules
  - Captures complex patterns
  - Clear inclusion/exclusion criteria

  Cons:
  - Hard boundaries (no notion of "almost matching")
  - Requires manual threshold tuning
  - No ranking (all matches are equal)

  ---
  Option 3: Hybrid (Distance + Pattern)

  Approach: Combine both approaches

  Formula:
  1. Apply pattern filter (must satisfy basic constraints)
  2. Rank remaining features by distance in metric space

  Pros:
  - Combines interpretability (patterns) with flexibility (distance)
  - Natural ranking of candidates
  - Handles both hard constraints and fuzzy similarity

  Cons:
  - More complex to design
  - May need two-step UI (pattern builder + similarity tuning)

  ---
  Option 4: Weighted Distance (User-Adjustable)

  Approach: Let users weight which metrics matter more

  Formula:
  distance(A, B) = sqrt(
    w_embedding * (embedding_A - embedding_B)² + 
    w_fuzz * (fuzz_A - fuzz_B)² + 
    w_detection * (detection_A - detection_B)² +
    ...
  )

  For "Syntactic" tag: High weight on embedding + fuzz, low weight on others

  Pros:
  - Flexible, user-controlled
  - Captures domain knowledge (user knows which metrics matter)
  - Smooth ranking

  Cons:
  - Requires UI for weight adjustment
  - May be cognitively demanding

  ---
  Recommended Approach (Multi-Stage)

  Stage 1: Tag Creation (Pattern-Based)
  - User defines tag with explicit metric ranges/thresholds
  - Visual metric signature builder (sliders on histograms)
  - Clear, interpretable rules

  Stage 2: Candidate Discovery (Hybrid)
  - Apply pattern filter (must meet basic criteria)
  - Rank by weighted distance (user can adjust weights)
  - Show top-k candidates with similarity scores

  Stage 3: Verification & Refinement (Active Learning)
  - User verifies candidates (yes/no/unsure)
  - System refines metric signature based on feedback
  - Iteratively improve tag definition

  This gives you:
  - Interpretability (explicit patterns)
  - Flexibility (distance-based ranking)
  - User control (adjustable weights)
  - Iterative refinement (active learning)

  ---
  Key Research Contributions for VIS

  1. Metric Signature Visualization: Novel way to visualize and interact with multi-metric
  constraints for pattern discovery
  2. Iterative Tag Refinement: Active learning approach where user feedback improves tag
  definitions over time
  3. Scalable Feature Interpretation: Going from individual feature inspection (current) to
  pattern-based bulk analysis
  4. Human-in-the-Loop ML Interpretability: Combining computational similarity with human semantic
  judgment
  5. Multi-Level Analysis: Sankey (groups) → Table (individuals) → Tags (patterns) — three levels
  of abstraction

  ---
  Next Steps (Discussion Points)

  Research Questions to Resolve:
  1. Tag Scope: Pre-defined templates vs. fully custom user-defined tags?
  2. Similarity Definition: Which computational approach resonates with domain experts?
  3. Verification Workflow: How much verification is acceptable? (1-by-1 vs. bulk with sampling)
  4. Tag Conflicts: Can features have multiple tags, or mutually exclusive?
  5. Evaluation: How will you measure success? (User study, expert validation, case study)

  Design Priorities:
  1. Simplicity: Start with simple pattern matching, add complexity if needed
  2. Transparency: Always show why a feature was suggested (metric comparison)
  3. Iteration: Allow refinement without starting over
  4. Integration: Tag system should enhance, not replace, existing workflow