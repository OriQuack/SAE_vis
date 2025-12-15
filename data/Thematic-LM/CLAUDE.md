# Thematic-LM Implementation

Implementation of the Thematic-LM paper (WWW '25) for SAE feature explanation analysis.

**Paper**: Qiao et al. "Thematic-LM: A LLM-based Multi-agent System for Large-scale Thematic Analysis" (WWW '25)
**DOI**: https://doi.org/10.1145/3696410.3714595

## Overview

This implementation adapts Thematic-LM for analyzing SAE (Sparse Autoencoder) feature explanations instead of social media data. We implement only the **Coding Stage** (no Theme Development stage).

## Architecture

```
Explanation → [Coder₁ + Coder₂ + ...] → Aggregator → Reviewer → Codebook
              (multiple identities)
```

### Agents (following paper Section 3.1)

| Agent | Role | Paper Reference |
|-------|------|-----------------|
| **CoderAgent** | Generates 1-3 codes per explanation with supporting quotes | Section 3.1, Appendix B |
| **AggregatorAgent** | Merges similar codes from multiple coders | Section 3.1, Appendix B |
| **ReviewerAgent** | Maintains codebook consistency, decides merge/new | Section 3.1, Appendix B |

### Coder Identities (following paper Section 3.2)

The paper emphasizes that coders should have different identity perspectives to encourage diverse interpretations. Our identities are adapted for SAE analysis:

- `linguist` - Focuses on grammatical structures, syntax, morphology
- `semanticist` - Focuses on meaning, conceptual relationships
- `pragmatist` - Focuses on language use in context, discourse functions
- `domain_expert` - Focuses on specialized terminology
- `cognitive` - Focuses on cognitive processes in language

## Configuration Parameters

Following paper Section 4 (Experimental Setup):

| Parameter | Paper Value | Config Key |
|-----------|-------------|------------|
| Top-k similar codes | 10 | `codebook_config.top_k_retrieval` |
| Max quotes per code | 20 | `processing_config.max_quotes_per_code` |
| Max codes per explanation | 3 | `processing_config.max_codes_per_explanation` |

## Prompts (following paper Appendix B)

All prompts follow the exact wording from the paper, adapted for SAE domain:

### Coder Prompt
> "You are a coder in thematic analysis of SAE feature explanations. When given a feature explanation, write 1-3 codes..."

### Aggregator Prompt
> "You are an aggregator coder... Your job is to take the codes and corresponding quotes from other coders, merge the similar codes and retain the different ones..."

### Reviewer Prompt
> "You are a review coder... Your job is to review the previously coded data with new codes, merge similar codes, and give them more representative codes..."

Key reviewer behavior (paper exact wording):
- "If the previous codes are all different or there are no similar codes, **leave the merge_codes empty** in the output"

## File Structure

```
data/Thematic-LM/
├── CLAUDE.md              # This file
├── config.json            # Configuration (paper parameters)
├── thematic_coding.py     # Main script
├── codebook_manager.py    # Adaptive codebook with embeddings
├── providers/             # LLM provider abstraction
│   ├── __init__.py
│   ├── base.py
│   └── openai_provider.py
└── agents/                # Multi-agent system
    ├── __init__.py
    ├── coder.py           # CoderAgent with identity support
    ├── aggregator.py      # AggregatorAgent
    └── reviewer.py        # ReviewerAgent
```

## Usage

```bash
cd /home/dohyun/interface/data/Thematic-LM

# Quick test (5 explanations, single coder)
OPENAI_API_KEY=<key> python thematic_coding.py --limit 5 --single-coder --no-reviewer

# Full multi-coder pipeline
OPENAI_API_KEY=<key> python thematic_coding.py

# Resume from checkpoint
python thematic_coding.py --resume
```

## Outputs

- `data/master/thematic_codes.parquet` - Coded explanations with code assignments
- `data/master/codebook.json` - Final codebook with all codes

## Key Differences from Paper

| Aspect | Paper | Our Implementation |
|--------|-------|-------------------|
| Domain | Social media posts | SAE feature explanations |
| Stage | Coding + Theme Development | Coding only |
| Identities | Climate change perspectives | SAE analysis perspectives |
| Embedding model | Sentence Transformer | google/embeddinggemma-300m |

## Paper Alignment Notes

This implementation follows the **Coding Stage** of Thematic-LM (Section 3.1), adapted for SAE feature explanations.

### Implemented (from paper)
- Multi-agent architecture: Coder → Aggregator → Reviewer → Codebook
- Adaptive codebook with embedding similarity (top-k=10)
- Multiple coder identities for diverse perspectives
- Reviewer logic: "merge_codes empty = new code" (paper Appendix B)
- Configuration: temperature=1.0, max 1-3 codes per explanation, max 20 quotes per code
- Prompts follow paper Appendix B structure (adapted for SAE domain)

### Prompt Differences from Paper
- **Domain adaptation**: "social media data" → "SAE feature explanations"
- **Coder prompt extended**: Added formatting guidelines and examples for code quality
- **Quote instruction**: Paper says "extract from a sentence", implementation says "exact extract from the text"
- **Core structure preserved**: Aggregator and Reviewer prompts match paper exactly (domain adapted)

### Intentionally Omitted
- **Theme Development Stage**: Not needed for our use case (only Coding Stage implemented)
- **Evaluation Framework**: Credibility/dependability/transferability metrics not applicable for demo

### Adaptations
- **Domain**: Social media → SAE feature explanations
- **Coder Identities**: Climate perspectives → SAE analysis perspectives (linguist, semanticist, pragmatist, domain_expert, cognitive)
- **Embedding Model**: Sentence Transformer → embeddinggemma-300m (functionally equivalent)
- **LLM Model**: GPT-4o → gpt-4o-mini (configurable, for testing)

## References

- Paper PDF: `/home/dohyun/interface/Themantic-LM.pdf`
- Paper notes: `/home/dohyun/interface/Themantic-LM.md`
