# Aspect Phrase Extraction Rules

Dependency-based phrase decomposition used to split LLM-generated feature explanations into semantically coherent aspect phrases for downstream embedding and HDBSCAN clustering.

## Parser

spaCy `en_core_web_sm` dependency parser.

## Algorithm

The extraction proceeds in five stages, operating on token-index sets derived from the dependency parse.

### Stage 1: Noun Chunk Seeding

Each noun chunk identified by spaCy's `doc.noun_chunks` (determiner through head noun) becomes an initial token-index set. Each chunk's root token anchors subsequent modifier absorption.

### Stage 2: Modifier Absorption

For each chunk root, children with dependency labels `prep`, `acl`, `relcl`, `appos`, or `agent` are candidates for absorption. The candidate's full subtree (all transitive dependents) is collected as a token-index set. Two rules apply:

1. **Subtree size cap**: If the subtree exceeds 10 tokens, it is skipped entirely. Its nouns will still surface as independent phrases through their own noun chunks in Stage 1. This prevents runaway absorption of large relative clauses and adverbial clause subtrees that produce phrases too long (15--48 words) for meaningful clustering.

2. **Trailing punctuation stripping**: Before merging, any trailing tokens with dependency label `cc` or `punct` are removed from the subtree set to prevent dangling commas or conjunctions.

Absorbed subtree indices are unioned into the chunk's index set. A chunk is marked "simple" if no modifier subtrees were absorbed (its final index set equals the original `[chunk.start, chunk.end)` range).

### Stage 3: Coordination Merging

Chunks whose roots are linked by `conj` dependency chains are grouped by tracing each root to its ultimate head (the non-`conj` ancestor). Within each group, if **all** chunks are simple (no modifiers absorbed) and all gap tokens between them have POS tags in {`PUNCT`, `CCONJ`, `SCONJ`, `SPACE`}, the group is merged into a single contiguous span. This preserves coordinated noun phrases like "tokens and words" as a single phrase while leaving modified chunks independent.

### Stage 4: Overlap Resolution

Any chunk spans that share token indices (due to overlapping subtrees from different chunk roots) are merged using a union-find algorithm, producing disjoint index sets.

### Stage 5: Gap Recovery

Tokens not covered by any phrase span are grouped into contiguous runs. A run is retained as an additional phrase if it contains at least one `NOUN` or `PROPN` token, or a token with `dep=conj` whose head belongs to a covered span. Leading and trailing `PUNCT`/`CCONJ`/`SCONJ`/`SPACE` tokens are stripped from recovered runs.

## Output

All phrases are sorted by their position in the original text, deduplicated, and returned. If no noun chunks are found (e.g., verb-only explanations), the full input text is returned as a single phrase.

## Design Rationale

The algorithm is noun-centric by design: LLM feature explanations describe *what a feature responds to*, which is predominantly expressed through noun phrases and their modifiers. Verbal connectors ("denotes", "indicating", "representing") link concepts but do not themselves constitute cluster-worthy content. The subtree size cap of 10 tokens was determined empirically: on 2,000 sampled explanations, all well-formed phrases had maximum modifier subtrees of 1--10 tokens, while over-long phrases (>15 words, affecting 18.2% of texts) were caused by subtrees of 9--25+ tokens. The threshold of 10 preserves 100% of well-formed phrases while eliminating 90.6% of over-long cases.
