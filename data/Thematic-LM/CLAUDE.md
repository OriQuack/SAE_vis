# Thematic-LM Implementation

Implementation of the Thematic-LM paper (WWW '25) for SAE feature explanation analysis using AutoGen framework.

**Paper**: Qiao et al. "Thematic-LM: A LLM-based Multi-agent System for Large-scale Thematic Analysis" (WWW '25)
**DOI**: https://doi.org/10.1145/3696410.3714595

## Overview

This implementation adapts Thematic-LM for analyzing SAE (Sparse Autoencoder) feature explanations. We implement only the **Coding Stage** (no Theme Development stage) using the **AutoGen framework** as specified in the paper.

**Key Extension**: Codes are classified into two categories - `linguistic` (token patterns, morphology, syntax) and `contextual` (semantic meaning, domain, usage context).

## Architecture (Paper Section 3.1)

```
For each explanation:
    Text → [Coder₁ + Coder₂ + ...] → Aggregator → Reviewer → Codebook
           (analyze same item)       (merge codes)  (update codebook)
```

### Data Flow Per Paper

1. **Coders** independently analyze the SAME text item, outputting 1-3 codes + quotes + category each
2. **Aggregator** merges similar codes from ALL coders for that item (within same category), retains differences
3. **Reviewer** retrieves top-k similar codes from codebook, decides merge/new
4. **Codebook** stores codes with embeddings, categories, AND quotes WITH quote_ids

## Key Paper-Compliant Behaviors

| Paper Requirement | Implementation | Reference |
|-------------------|----------------|-----------|
| AutoGen framework | Uses `ConversableAgent` | Section 3.1 |
| ALL codes through reviewer | No threshold-based skipping | Section 3.1 |
| `merge_codes: []` = new code | Reviewer decision logic | Appendix B |
| `merge_codes: [names]` = merge | Merge by code NAME | Appendix B |
| temperature=1.0, top_p=1.0 | LLM config | Section 4 |
| JSON mode enabled | `response_format: json_object` | Section 4 |
| Top-k similar codes retrieval | `top_k_retrieval: 10` (filtered by min_similarity) | Section 4 |
| Quote storage with limit | 100 quotes (paper: 20), random replacement | Section 4 |
| Quotes stored WITH quote_ids | `[{"quote": "...", "quote_id": "..."}]` | Section 3.1 |
| Per-item processing | `process_explanation()` method | Section 3.1 |
| Aggregator always called | Even with single coder (skipped if only 1) | Section 3.1 |

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
| **CoderAgent** | Generates 1-3 codes per explanation | Outputs `category` field (linguistic/contextual) |
| **AggregatorAgent** | Merges similar codes from multiple coders | Only merges within SAME category |
| **ReviewerAgent** | Maintains codebook consistency | Only merges within SAME category |

### Category Classification (SAE Extension)

Each code is classified into one of two categories:

| Category | Description | Examples |
|----------|-------------|----------|
| **linguistic** | Token patterns, part-of-speech, morphology, syntax, punctuation | "prepositions", "tokens starting with 'Hor'", "verb phrases" |
| **contextual** | Semantic meaning, domain, usage context, topic | "formal writing context", "sports terminology", "programming domain" |

## Prompts (Adapted from Paper Appendix B)

### Coder Prompt (SAE-Specific)
```
You are a coder in thematic analysis of neuron explanations.

TASK: Generate 1-3 codes for each explanation. Each code must be classified into ONE category:
- LINGUISTIC: Describes token pattern, part-of-speech, morphology, syntax, punctuation
- CONTEXTUAL: Describes semantic meaning, domain, usage context, topic

IMPORTANT RULES:
- Generate SEPARATE codes for linguistic and contextual aspects
- Do NOT combine both aspects in one code
- Each code should be 1-6 words, noun phrase style
```

### Aggregator Prompt
```
MERGE RULES:
- Merge codes with similar meaning AND same category
- Do NOT merge codes from different categories (linguistic vs contextual)
- When merging, keep the more descriptive code name
```

### Reviewer Prompt
```
WHEN TO MERGE (set merge_codes to existing code name):
- New code describes the same underlying concept as an existing code
- CRITICAL: Only merge codes within the SAME category
```

## Codebook Structure (Extended from Paper Section 3.1)

```python
CodebookEntry:
    code_id: int
    code_text: str
    embedding: np.ndarray          # Sentence Transformer embedding
    category: str                  # "linguistic" | "contextual" | "unknown"
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
| LLM Model | GPT-4o | gpt-4o-mini | `llm_config.model` |
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

# Install dependencies (including AutoGen)
pip install pyautogen sentence-transformers polars tqdm

# Quick test (5 features, overwrite mode)
OPENAI_API_KEY=<key> python thematic_coding.py --limit 5

# Process feature range
OPENAI_API_KEY=<key> python thematic_coding.py --start 0 --end 100

# Continue from existing codebook (set mode: "continue" in config.json)
OPENAI_API_KEY=<key> python thematic_coding.py --load-codebook ../master/codebook.json

# Convert parquet output to JSON
python parquet_to_json.py
```

### Run Modes

| Mode | Behavior |
|------|----------|
| `overwrite` | Deletes existing output files before processing |
| `continue` | Skips already processed explanations, appends to existing parquet |

### Checkpointing
- Progress is auto-saved every N items (`processing_config.save_every`)
- Codebook history saved to `codebook_history/<timestamp>/codebook.json`
- Use `--load-codebook` to continue from a specific codebook state

## Per-Item Processing (Paper Section 3.1)

```
For each explanation:
  1. ALL coders process the SAME item independently
     → Each coder generates 1-3 codes with quotes + category

  2. Aggregator receives ALL codes from ALL coders for this item
     → Merges similar codes WITHIN SAME CATEGORY
     → Retains different codes
     → Organizes into JSON with quote_ids

  3. Pre-check: Exact code name match → auto-merge (optimization)
     → Skips reviewer for duplicate code names

  4. Reviewer processes EACH aggregated code
     → Retrieves top-10 similar codes from codebook
     → Decides: merge with existing (SAME CATEGORY) OR add as new
     → Uses code NAMES for merge_codes output

  5. Codebook updated with all decisions
     → Quotes stored WITH quote_ids for traceability
     → Category preserved through merge operations
```

## Outputs

- `data/master/thematic_codes.parquet` - Coded explanations with code assignments
- `data/master/codebook.json` - Final codebook with all codes, categories, and quote_ids

### Output Schema (thematic_codes.parquet)

| Column | Type | Description |
|--------|------|-------------|
| `feature_id` | UInt32 | Feature identifier |
| `llm_explainer` | Categorical | Explainer model name |
| `explanation_text` | String | Original explanation text |
| `codes` | JSON String | Array of assigned codes with category |
| `coding_metadata` | JSON String | Processing metadata (model, timestamp, etc.) |

### Codebook JSON Structure

```json
{
  "metadata": {
    "created_at": "2024-12-24T...",
    "total_codes": 42,
    "version": 123,
    "paper": "Qiao et al. Thematic-LM (WWW '25)"
  },
  "entries": [
    {
      "code_id": 0,
      "code_text": "prepositions and conjunctions",
      "category": "linguistic",
      "frequency": 5,
      "variants": ["prepositions"],
      "example_quotes": [{"quote": "...", "quote_id": "f7_llama"}],
      "merged_from": []
    }
  ]
}
```

## Key Differences from Paper

### Domain Adaptations
| Aspect | Paper | Our Implementation |
|--------|-------|-------------------|
| Domain | Social media posts | SAE feature explanations |
| Stage | Coding + Theme Development | Coding only |
| Identities | Climate change perspectives | SAE analysis (single coder) |
| Default model | GPT-4o | gpt-4o-mini (configurable) |

### Technical Extensions
| Aspect | Paper | Our Implementation | Rationale |
|--------|-------|-------------------|-----------|
| Category classification | N/A | linguistic/contextual | Separate token patterns from semantic meaning |
| Category-aware merging | N/A | Same-category constraint | Prevent mixing different code types |
| Embedding model | Sentence Transformer | all-MiniLM-L6-v2 (22M params) | Faster, sufficient for code similarity |
| Max quotes per code | 20 | 100 | Better representation without token cost |
| Quote storage | First N | Random replacement when full | Representative sampling over time |
| Quote display to reviewer | First 5 | Even spread sample of 5 | Show diversity across all stored quotes |
| Similar codes filter | All top-k shown | Only similarity >= 0.3 | Reduce noise, save tokens |
| Exact name match | N/A | Auto-merge optimization | Skip reviewer for duplicate code names |

## Paper Alignment Checklist

### Implemented from Paper
- [x] Multi-agent architecture: Coder → Aggregator → Reviewer → Codebook
- [x] AutoGen framework (paper requirement, Section 3.1)
- [x] Per-item processing (each item through full pipeline)
- [x] Aggregator ALWAYS called (skipped if only 1 coder for efficiency)
- [x] ALL codes go through reviewer (no threshold-based skipping)
- [x] Reviewer logic: `merge_codes empty = new code` (Appendix B)
- [x] Reviewer uses code NAMES for merge_codes (not IDs)
- [x] Top-k=10 similar codes for reviewer (Section 4)
- [x] Configuration: temperature=1.0, top_p=1.0 (Section 4)
- [x] JSON mode enabled for consistent output (Section 4)
- [x] Quote storage with max limit (Section 4) - increased to 100 for better sampling
- [x] Max 1-3 codes per explanation (Appendix B)
- [x] Multiple coder identities supported (Section 3.2)
- [x] Prompts based on paper Appendix B - adapted for SAE domain
- [x] Quotes stored WITH quote_ids for traceability (Section 3.1)
- [x] "Quote_id is the same as data_id" logic (Appendix B)
- [x] Single-shot agent calls via generate_reply() (proper AutoGen usage)

### Intentionally Omitted
- **Theme Development Stage**: Not needed for our use case
- **Evaluation Framework**: Credibility/dependability/transferability metrics not applicable

### SAE-Specific Extensions
- **Category classification**: Codes tagged as linguistic or contextual
- **Category-aware processing**: Merging only within same category
- **Exact name auto-merge**: Optimization to skip reviewer for duplicate names
- **Run modes**: Overwrite vs continue for iterative processing

## References

- Paper PDF: `/home/dohyun/interface/Themantic-LM.pdf`
- Paper notes: `/home/dohyun/interface/Themantic-LM.md`
