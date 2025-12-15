# Thematic-LM Implementation

Implementation of the Thematic-LM paper (WWW '25) for SAE feature explanation analysis using AutoGen framework.

**Paper**: Qiao et al. "Thematic-LM: A LLM-based Multi-agent System for Large-scale Thematic Analysis" (WWW '25)
**DOI**: https://doi.org/10.1145/3696410.3714595

## Overview

This implementation adapts Thematic-LM for analyzing SAE (Sparse Autoencoder) feature explanations. We implement only the **Coding Stage** (no Theme Development stage) using the **AutoGen framework** as specified in the paper.

## Architecture (Paper Section 3.1)

```
For each explanation:
    Text → [Coder₁ + Coder₂ + ...] → Aggregator → Reviewer → Codebook
           (analyze same item)       (merge codes)  (update codebook)
```

### Data Flow Per Paper

1. **Coders** independently analyze the SAME text item, outputting 1-3 codes + quotes each
2. **Aggregator** merges similar codes from ALL coders for that item, retains differences
3. **Reviewer** retrieves top-k similar codes from codebook, decides merge/new
4. **Codebook** stores codes with embeddings AND quotes WITH quote_ids

## Key Paper-Compliant Behaviors

| Paper Requirement | Implementation | Reference |
|-------------------|----------------|-----------|
| AutoGen framework | Uses `ConversableAgent` | Section 3.1 |
| ALL codes through reviewer | No threshold-based skipping | Section 3.1 |
| `merge_codes: []` = new code | Reviewer decision logic | Appendix B |
| `merge_codes: [names]` = merge | Merge by code NAME | Appendix B |
| temperature=1.0, top_p=1.0 | LLM config | Section 4 |
| JSON mode enabled | `response_format: json_object` | Section 4 |
| Top-k=10 similar codes | `top_k_retrieval: 10` | Section 4 |
| Max 20 quotes per code | `max_quotes_per_code: 20` | Section 4 |
| Quotes stored WITH quote_ids | `[{"quote": "...", "quote_id": "..."}]` | Section 3.1 |
| Per-item processing | `process_explanation()` method | Section 3.1 |
| Aggregator always called | Even with single coder | Section 3.1 |

## File Structure

```
data/Thematic-LM/
├── CLAUDE.md                 # This file
├── config.json               # Configuration (paper parameters)
├── thematic_coding.py        # Main script (per-item processing)
├── autogen_pipeline.py       # AutoGen orchestration class
├── codebook_manager.py       # Embedding-based codebook with quote_ids
└── autogen_agents/           # AutoGen agent factories
    ├── __init__.py
    ├── coder.py              # CoderAgent with identity support
    ├── aggregator.py         # AggregatorAgent
    └── reviewer.py           # ReviewerAgent
```

## Agents (Paper Section 3.1, Appendix B)

| Agent | Role | Paper Reference |
|-------|------|-----------------|
| **CoderAgent** | Generates 1-3 codes per explanation with supporting quotes | Appendix B |
| **AggregatorAgent** | Merges similar codes from multiple coders | Appendix B |
| **ReviewerAgent** | Maintains codebook consistency, decides merge/new | Appendix B |

### Coder Identities (Paper Section 3.2)

**Default: SAE-specific coder** (`identity: "sae"`)
- Domain-guided prompt for identifying specific pattern types
- Focuses on: lexical, morphological, syntactic, semantic, contextual, domain-specific patterns
- Emphasizes specificity over generic codes

**Optional identities** (adapted from paper's climate change perspectives):
- `linguist` - Grammatical structures, syntax, morphology
- `semanticist` - Meaning, conceptual relationships
- `pragmatist` - Language use in context, discourse functions
- `domain_expert` - Specialized terminology
- `cognitive` - Cognitive processes in language

## Prompts (Paper Appendix B - Exact Wording)

### Coder Prompt
> "You are a coder in thematic analysis of SAE feature explanations. When given a feature explanation, write 1-3 codes for the explanation. The code should capture concepts or ideas with the most analytical **interests**. For each code, extract a quote from the explanation corresponding to the code. The quote needs to be an extract from a sentence."

### Aggregator Prompt
> "Your job is to take the codes and corresponding quotes from other coders, merge the similar codes and retain the different ones. Store the quotes under the merged codes, and keep the top 20 most relevant quotes. Output the codes and quotes in JSON format. Don't output anything else. **Quote_id is the same as data_id.**"

### Reviewer Prompt (CRITICAL)
> "You will be given two items. The first contains new codes and quotes; the second contains similar codes and corresponding quotes to each new code. Decide if there are previously similar coded data with the same meaning that can be merged with the new codes. Update the new code according to the previous code if needed. **If the previous codes are all different or there are no similar codes, leave the merge_codes empty in the output.**"

## Codebook Structure (Paper Section 3.1)

Per paper: "This codebook stores previous codes, their corresponding quotes, **and quote IDs** in JSON format. Each entry in the codebook is a code, and its associated **quotes are nested below each code along with their quote IDs**."

```python
CodebookEntry:
    code_id: int
    code_text: str
    embedding: np.ndarray          # Sentence Transformer embedding
    frequency: int
    variants: List[str]
    example_quotes: List[Dict]     # [{"quote": "...", "quote_id": "..."}]
    merged_from: List[int]
```

## Configuration Parameters (Paper Section 4)

| Parameter | Paper Value | Config Key |
|-----------|-------------|------------|
| LLM Model | GPT-4o | `llm_config.model` (default: gpt-4o-mini) |
| Temperature | 1.0 | `llm_config.temperature` |
| Top-p | 1.0 | `llm_config.top_p` |
| Top-k similar codes | 10 | `codebook_config.top_k_retrieval` |
| Max quotes per code | 20 | `processing_config.max_quotes_per_code` |
| Max codes per explanation | 3 | `processing_config.max_codes_per_explanation` |

## Usage

```bash
cd /home/dohyun/interface/data/Thematic-LM

# Install dependencies (including AutoGen)
pip install pyautogen sentence-transformers polars tqdm

# Quick test (5 features)
OPENAI_API_KEY=<key> python thematic_coding.py --limit 5

# Full processing
OPENAI_API_KEY=<key> python thematic_coding.py

# Resume from checkpoint
OPENAI_API_KEY=<key> python thematic_coding.py --resume
```

## Per-Item Processing (Paper Section 3.1)

The implementation follows the paper's per-item processing architecture:

```
For each explanation:
  1. ALL coders process the SAME item independently
     → Each coder generates 1-3 codes with quotes

  2. Aggregator receives ALL codes from ALL coders for this item
     → Merges similar codes from different coders
     → Retains different codes
     → Organizes into JSON with quote_ids

  3. Reviewer processes EACH aggregated code
     → Retrieves top-10 similar codes from codebook
     → Decides: merge with existing OR add as new
     → Uses code NAMES for merge_codes output

  4. Codebook updated with all decisions
     → Quotes stored WITH quote_ids for traceability
```

This per-item approach ensures the aggregator merges codes from multiple coders analyzing the same text, maintaining consistency with the paper's methodology.

## Outputs

- `data/master/thematic_codes.parquet` - Coded explanations with code assignments
- `data/master/codebook.json` - Final codebook with all codes and quote_ids

## Key Differences from Paper

| Aspect | Paper | Our Implementation |
|--------|-------|-------------------|
| Domain | Social media posts | SAE feature explanations |
| Stage | Coding + Theme Development | Coding only |
| Identities | Climate change perspectives | SAE analysis perspectives |
| Embedding model | Sentence Transformer | google/embeddinggemma-300m |
| Default model | GPT-4o | gpt-4o-mini (configurable) |

## Paper Alignment Checklist

### Implemented from Paper
- [x] Multi-agent architecture: Coder → Aggregator → Reviewer → Codebook
- [x] AutoGen framework (paper requirement, Section 3.1)
- [x] Per-item processing (each item through full pipeline)
- [x] Aggregator ALWAYS called (even with single coder)
- [x] ALL codes go through reviewer (no threshold-based skipping)
- [x] Reviewer logic: `merge_codes empty = new code` (Appendix B)
- [x] Reviewer uses code NAMES for merge_codes (not IDs)
- [x] Top-k=10 similar codes for reviewer (Section 4)
- [x] Configuration: temperature=1.0, top_p=1.0 (Section 4)
- [x] JSON mode enabled for consistent output (Section 4)
- [x] Max 20 quotes per code (Section 4)
- [x] Max 1-3 codes per explanation (Appendix B)
- [x] Multiple coder identities for diverse perspectives (Section 3.2)
- [x] Prompts follow paper Appendix B exact wording
- [x] Quotes stored WITH quote_ids for traceability (Section 3.1)
- [x] "Quote_id is the same as data_id" in aggregator prompt (Appendix B)
- [x] "analytical interests" (plural) in coder prompt (Appendix B)
- [x] Single-shot agent calls via generate_reply() (proper AutoGen usage)

### Intentionally Omitted
- **Theme Development Stage**: Not needed for our use case
- **Evaluation Framework**: Credibility/dependability/transferability metrics not applicable

### Domain Adaptations
- **Domain**: Social media → SAE feature explanations
- **Coder Identities**: Climate perspectives → SAE analysis perspectives
- **Default Model**: GPT-4o → gpt-4o-mini (cost efficiency, configurable)

## References

- Paper PDF: `/home/dohyun/interface/Themantic-LM.pdf`
- Paper notes: `/home/dohyun/interface/Themantic-LM.md`
- Implementation plan: `/home/dohyun/interface/THEMATIC_LM_CODEBOOK_IMPLEMENTATION_PLAN.md`
