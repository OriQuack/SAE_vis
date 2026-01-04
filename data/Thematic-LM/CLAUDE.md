# Thematic-LM Implementation (Simplified)

Simplified implementation based on the Thematic-LM paper (WWW '25) for SAE feature explanation analysis.

**Paper**: Qiao et al. "Thematic-LM: A LLM-based Multi-agent System for Large-scale Thematic Analysis" (WWW '25)
**DOI**: https://doi.org/10.1145/3696410.3714595

## Overview

This implementation adapts Thematic-LM for decomposing SAE (Sparse Autoencoder) feature explanations into codes.

**Key Simplification**: We use **Coder only** - no Aggregator, no Reviewer, no merging. Each explanation is decomposed into 1-3 codes that are stored per-explanation, allowing codes to be traced back to their source explanations and associated scores (Fuzz, Detection, etc.).

**Code Categories** (aligned with interpretability score semantics):
- `token-level`: Patterns for identifying **which tokens** activate (aligns with Fuzz score)
- `context-level`: Patterns for identifying **what situations** activate (aligns with Detection score)

## Architecture (Simplified)

```
For each explanation:
    Text → Coder → Codes (stored per-explanation, no merging)
```

### Why No Merging?

The original Thematic-LM merges codes to build a consolidated codebook. However, for our use case:
- We need to **trace codes back to source explanations** and their scores
- Merging loses the connection between a specific code and its source
- Each explanation's codes should be attributable to that explanation's Fuzz/Detection scores

### Data Flow

1. **Coder** analyzes the explanation, outputs 1-3 codes with categories and quotes
2. **Codes stored per-explanation** in parquet file (no deduplication)
3. **Downstream analysis** can aggregate/group codes as needed while preserving score attribution

## Comparison with Original Paper

| Paper Approach | Our Simplified Approach | Rationale |
|----------------|-------------------------|-----------|
| Coder → Aggregator → Reviewer → Codebook | Coder only | Need score attribution |
| Codes merged into codebook | Codes stored per-explanation | Preserve source traceability |
| Shared codebook with deduplication | Allow duplicates | Each explanation independent |
| Multiple coders with different identities | Single coder | Simpler, sufficient for decomposition |

### What We Keep from Paper
- AutoGen framework with `ConversableAgent`
- Coder agent prompt structure (adapted for SAE)
- Category classification (token-level / context-level)
- temperature=1.0, top_p=1.0 LLM config
- JSON mode for structured output

### What We Removed from Flow (code still exists)
- Aggregator agent (not called)
- Reviewer agent (not called)
- Codebook merging logic (not used)
- Embedding-based similarity search (not needed)

## File Structure

```
data/Thematic-LM/
├── CLAUDE.md                 # This file
├── config.json               # Configuration (paper parameters + run settings)
├── thematic_coding.py        # Main script (per-item processing)
├── autogen_pipeline.py       # AutoGen orchestration class
├── codebook_manager.py       # Embedding-based codebook with category support
├── parquet_to_json.py        # Convert parquet output to JSON
├── codebook_history/         # Processing checkpoints (auto-saved per run)
└── autogen_agents/           # AutoGen agent factories
    ├── __init__.py
    ├── coder.py              # CoderAgent with SAE-specific prompt + category output
    ├── aggregator.py         # AggregatorAgent with category-aware merging
    └── reviewer.py           # ReviewerAgent with same-category merge constraint
```

## Agents (Paper Section 3.1, Appendix B)

| Agent | Role | Key Behavior |
|-------|------|--------------|
| **CoderAgent** | Generates 1-3 codes per explanation | Outputs `category` field (token-level/context-level) |
| **AggregatorAgent** | Merges similar codes from multiple coders | Only merges within SAME category |
| **ReviewerAgent** | Maintains codebook consistency | Only merges within SAME category |

### Category Classification (SAE Extension)

Each code is classified into one of two categories, aligned with interpretability score semantics:

| Category | Score Alignment | Description | Examples |
|----------|-----------------|-------------|----------|
| **token-level** | Fuzz score | Patterns that identify **which specific tokens** activate | "tokens starting with 'un-'", "punctuation marks", "verb phrases" |
| **context-level** | Detection score | Patterns that identify **what situations** activate | "formal writing context", "legal documents", "chemistry terminology" |

**Classification Guide:**
- Part-of-speech alone (verbs, nouns) → token-level
- Domain vocabulary (legal terms, medical words) → context-level
- Specific token patterns (starts with X, contains Y) → token-level
- Semantic themes (about travel, expressing emotion) → context-level

## Prompts (Adapted from Paper Appendix B)

### Coder Prompt
```
PURPOSE: Faithfully decompose what the explanation claims. Vague explanations should produce vague codes—do not infer or improve.

TASK: Decompose the explanation into 1-3 codes. Each code must be classified into exactly ONE category.

TOKEN-LEVEL: What the explanation says about WHICH TOKENS activate.
  - Ask: "Does this describe a pattern to identify specific tokens?"
  - Examples: "tokens starting with 'un-'", "punctuation marks", "verb phrases"

CONTEXT-LEVEL: What the explanation says about WHAT SITUATIONS activate.
  - Ask: "Does this describe a type of text or situation?"
  - Examples: "formal writing context", "legal documents", "chemistry terminology"
```

### Aggregator Prompt
```
MERGE RULES:
- Merge codes with similar meaning AND same category
- Do NOT merge codes from different categories (token-level vs context-level)
- When merging, keep the more descriptive code name
```

### Reviewer Prompt
```
PURPOSE: Maintain codebook consistency by merging duplicate concepts and adding genuinely new ones.

TASK: Compare the new code against existing codebook codes. Decide: merge or add as new.

WHEN TO MERGE (set merge_codes to existing code name):
- Same underlying concept with different wording
- Same pattern type with different phrasing
- Only merge within SAME category (token-level ↔ token-level, context-level ↔ context-level)

WHEN TO ADD AS NEW (leave merge_codes empty):
- Genuinely different concept not covered by existing codes
```

## Codebook Structure (Extended from Paper Section 3.1)

```python
CodebookEntry:
    code_id: int
    code_text: str
    embedding: np.ndarray          # Sentence Transformer embedding
    category: str                  # "token-level" | "context-level" | "unknown"
    frequency: int
    variants: List[str]
    example_quotes: List[Dict]     # [{"quote": "...", "quote_id": "..."}]
    merged_from: List[int]
```

## Configuration Parameters

### config.json Structure

```json
{
  "run_config": {
    "start_feature": null,     // Starting feature ID (inclusive)
    "end_feature": null,       // Ending feature ID (inclusive)
    "limit": 50,               // Max features to process
    "mode": "overwrite",       // "overwrite" or "continue"
    "load_codebook": "..."     // Path to existing codebook (for continue mode)
  },
  "llm_config": {...},
  "embedding_config": {...},
  "coder_config": {...},
  "codebook_config": {...},
  "processing_config": {...}
}
```

### Key Parameters

| Parameter | Paper Value | Our Value | Config Key |
|-----------|-------------|-----------|------------|
| LLM Model | GPT-4o | gpt-5-mini | `llm_config.model` |
| Temperature | 1.0 | 1.0 | `llm_config.temperature` |
| Top-p | 1.0 | 1.0 | `llm_config.top_p` |
| Top-k similar codes | 10 | 10 | `codebook_config.top_k_retrieval` |
| Min similarity threshold | N/A | 0.3 | `codebook_config.min_similarity` |
| Max quotes per code | 20 | 100 | `processing_config.max_quotes_per_code` |
| Max codes per explanation | 3 | 3 | `processing_config.max_codes_per_explanation` |
| Embedding model | N/A | all-MiniLM-L6-v2 | `embedding_config.model` |

## Usage

```bash
cd /home/dohyun/interface/data/Thematic-LM

# Install dependencies
pip install pyautogen polars tqdm

# Quick test (5 features, overwrite mode)
OPENAI_API_KEY=<key> python thematic_coding.py --limit 5

# Process feature range
OPENAI_API_KEY=<key> python thematic_coding.py --start 0 --end 100

# Full processing (set mode in config.json)
OPENAI_API_KEY=<key> python thematic_coding.py
```

### Run Modes

| Mode | Behavior |
|------|----------|
| `overwrite` | Deletes existing output parquet before processing |
| `continue` | Skips already processed explanations, appends to existing parquet |

### Checkpointing
- Progress is auto-saved every N items (`processing_config.save_every`)

## Per-Item Processing (Simplified)

```
For each explanation:
  1. Coder analyzes the explanation text
     → Generates 1-3 codes with category and supporting quote

  2. Codes stored directly to results
     → No aggregation, no review, no merging
     → Each code preserves link to source explanation

  3. Periodic save to parquet
     → Cumulative append for continue mode
```

## Output

- `data/master/thematic_codes.parquet` - Coded explanations with code assignments

### Output Schema (thematic_codes.parquet)

| Column | Type | Description |
|--------|------|-------------|
| `feature_id` | UInt32 | Feature identifier |
| `llm_explainer` | Categorical | Explainer model name |
| `explanation_text` | String | Original explanation text |
| `codes` | JSON String | Array of codes (see below) |
| `coding_metadata` | JSON String | Processing metadata |

### Codes JSON Structure

```json
[
  {
    "code_text": "prepositions and conjunctions",
    "category": "token-level",
    "quote": "Prepositions like 'of', 'in', 'to'..."
  },
  {
    "code_text": "formal writing context",
    "category": "context-level",
    "quote": "often appears in formal documents"
  }
]
```

### Coding Metadata Structure

```json
{
  "coder_model": "gpt-4o-mini",
  "coder_id": "coder_default",
  "timestamp": "2024-12-24T10:30:00",
  "framework": "autogen"
}
```

## Key Differences from Paper

### Simplifications
| Aspect | Paper | Our Implementation | Rationale |
|--------|-------|-------------------|-----------|
| Pipeline | Coder → Aggregator → Reviewer → Codebook | Coder only | Need score attribution |
| Merging | Codes merged by semantic similarity | No merging | Preserve source traceability |
| Codebook | Shared, deduplicated | Not used | Each explanation independent |
| Multiple coders | Different identities for diversity | Single coder | Simpler, sufficient |

### Domain Adaptations
| Aspect | Paper | Our Implementation |
|--------|-------|-------------------|
| Domain | Social media posts | SAE feature explanations |
| Stage | Coding + Theme Development | Coding only (simplified) |
| Default model | GPT-4o | gpt-4o-mini (configurable) |

### SAE-Specific Extensions
- **Category classification**: Codes tagged as token-level (Fuzz) or context-level (Detection)
- **Score attribution**: Each code traceable to source explanation's scores
- **Run modes**: Overwrite vs continue for iterative processing

## Code Still Available (Not Used in Flow)

The following components exist in the codebase but are **not called** in the simplified flow:
- `create_aggregator_agent()` - Merges codes from multiple coders
- `create_reviewer_agent()` - Decides merge/new against codebook
- `CodebookManager` - Embedding-based codebook with similarity search

These can be re-enabled if merging is needed in the future.

## References

- Paper PDF: `/home/dohyun/interface/Themantic-LM.pdf`
- Paper notes: `/home/dohyun/interface/Themantic-LM.md`
