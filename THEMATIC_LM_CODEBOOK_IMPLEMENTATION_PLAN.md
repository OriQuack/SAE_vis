# Thematic-LM Codebook Creation Implementation Plan

## Overview

This document provides a detailed implementation plan for the **Codebook Creation** component of Thematic-LM, an LLM-based multi-agent system for large-scale thematic analysis. This plan covers the **Coding Stage** only (not evaluation or theme analysis).

**Reference**: Qiao et al. "Thematic-LM: A LLM-based Multi-agent System for Large-scale Thematic Analysis" (WWW '25)

---

## 1. System Architecture

### 1.1 High-Level Data Flow

```
Text Data
    │
    ▼
┌─────────────────────────────────────────┐
│         CODING STAGE                     │
│                                          │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  │
│  │ Coder 1 │  │ Coder 2 │  │ Coder N │  │
│  └────┬────┘  └────┬────┘  └────┬────┘  │
│       │            │            │        │
│       └────────────┼────────────┘        │
│                    ▼                     │
│            ┌──────────────┐              │
│            │    Code      │              │
│            │  Aggregator  │              │
│            └──────┬───────┘              │
│                   │                      │
│                   ▼                      │
│            ┌──────────────┐              │
│            │   Reviewer   │◄────┐        │
│            └──────┬───────┘     │        │
│                   │             │        │
│                   ▼             │        │
│            ┌──────────────┐     │        │
│            │   Codebook   │─────┘        │
│            │  (Adaptive)  │   Retrieve   │
│            └──────────────┘   Similar    │
│                                Codes     │
└─────────────────────────────────────────┘
    │
    ▼
Final Codebook (JSON)
```

### 1.2 Agent Types

| Agent | Role | Count | Stage |
|-------|------|-------|-------|
| Coder Agent | Generate codes and quotes from text data | N (configurable, default 2) | Coding |
| Code Aggregator | Merge similar codes, organize output | 1 | Coding |
| Reviewer Agent | Maintain and update adaptive codebook | 1 | Coding |

---

## 2. Data Structures

### 2.1 Input Data Format

```typescript
interface InputDataItem {
  data_id: string;           // Unique identifier for the text item
  text: string;              // The actual text content to analyze
  metadata?: {               // Optional metadata
    source?: string;
    timestamp?: string;
    [key: string]: any;
  };
}

type InputDataset = InputDataItem[];
```

### 2.2 Code Output Format (from Coder Agents)

```typescript
interface CodeOutput {
  code: string;              // The short-phrase code label
  quote: string;             // Representative quote extracted from text
  quote_id: string;          // Same as data_id - links back to source
}

interface CoderOutput {
  data_id: string;
  codes: CodeOutput[];       // 1-3 codes per data item
}
```

### 2.3 Aggregated Codes Format (from Aggregator)

```typescript
interface AggregatedCode {
  code: string;                    // Merged/refined code
  quotes: {
    quote: string;
    quote_id: string;
  }[];                             // Up to K most relevant quotes (K=20 default)
}

interface AggregatorOutput {
  codes: AggregatedCode[];
}
```

### 2.4 Codebook Format (Maintained by Reviewer)

```typescript
interface CodebookEntry {
  code: string;                    // The code text
  code_embedding: number[];        // Vector embedding from Sentence Transformer
  quotes: {
    quote: string;
    quote_id: string;
  }[];                             // Associated quotes (max 20 per code)
  created_at: string;              // Timestamp
  updated_at: string;              // Last update timestamp
  merge_history?: string[];        // Optional: track merged codes
}

interface Codebook {
  entries: CodebookEntry[];
  metadata: {
    total_codes: number;
    total_quotes: number;
    last_updated: string;
    embedding_model: string;
  };
}
```

### 2.5 Reviewer Input/Output Format

**Input to Reviewer** (two items as per prompt):
```typescript
// Item 1: New codes from aggregator
interface NewCodeInput {
  code: string;
  quotes: { quote: string; quote_id: string; }[];
}

// Item 2: Similar codes retrieved from codebook (via embeddings)
interface SimilarCodeInput {
  code: string;
  quotes: { quote: string; quote_id: string; }[];
}
```

**Output from Reviewer** (per paper's prompt: "leave the merge_codes empty"):
```typescript
interface ReviewerOutput {
  codes: {
    code: string;                         // Code name (possibly refined)
    merge_codes: string[];                // Existing codes to merge with (empty [] if no merge)
    quotes: {
      quote: string;
      quote_id: string;
    }[];
  }[];
}
```

**Key distinction:**
- `merge_codes: []` (empty) → Add as new code to codebook
- `merge_codes: ["existing_code"]` → Merge with existing code in codebook

---

## 3. Agent Implementations (AutoGen Framework)

**IMPORTANT**: The paper explicitly states: *"The agents are implemented with conversational agents from AutoGen"* (Section 3.1). AutoGen is the required framework, not optional.

### 3.1 Coder Agent

#### 3.1.1 System Prompt (Exact from Paper Appendix B)

```
You are a coder in thematic analysis of social media data. When given a social media post, write 1-3 codes for the post. The code should capture concepts or ideas with the most analytical interests. For each code, extract a quote from the post corresponding to the code. The quote needs to be an extract from a sentence. Output the codes and quotes in the following format...
```

**Full prompt with output format:**
```
You are a coder in thematic analysis of social media data. When given a social media post, write 1-3 codes for the post. The code should capture concepts or ideas with the most analytical interests. For each code, extract a quote from the post corresponding to the code. The quote needs to be an extract from a sentence. Output the codes and quotes in the following format:

{
  "data_id": "<data_id>",
  "codes": [
    {
      "code": "<short phrase code>",
      "quote": "<exact extract from the text>",
      "quote_id": "<data_id>"
    }
  ]
}
```

#### 3.1.2 Identity-Enhanced Coder Prompt (Optional)

When assigning identity perspectives to promote diverse viewpoints, the identity is assigned to the **system message** of each agent:

```
You are a coder in thematic analysis of social media data.

[IDENTITY PERSPECTIVE]
{identity_description}

When analyzing the data, reflect on how someone with your background and perspective would interpret the information. Consider what aspects would be most meaningful or significant from your viewpoint.

When given a social media post, write 1-3 codes for the post. The code should capture concepts or ideas with the most analytical interests from your perspective. For each code, extract a quote from the post corresponding to the code. The quote needs to be an extract from a sentence. Output the codes and quotes in the following format...
```

#### 3.1.3 Example Identity Perspectives (From Paper Section 4.3)

| Identity | Description |
|----------|-------------|
| Human-Driven Climate Change | Adopts the widely accepted scientific view that human activities are the primary drivers of climate change. Focuses on the role of industrialization, fossil fuel emissions, deforestation, and other anthropogenic activities in accelerating global warming. |
| Natural Climate Change | Approaches climate change from the viewpoint that it is a natural phenomenon, part of Earth's long-term climatic cycles. Reflects arguments that climate fluctuations have occurred over millennia due to factors like solar radiation, volcanic activity, and ocean currents. |
| Progressive View | Rooted in environmental justice, equity, and sustainability, advocating for systemic changes that address not only environmental issues but also social inequalities exacerbated by climate impacts. Emphasizes green technologies, grassroots activism, and policies ensuring vulnerable communities are not disproportionately affected. |
| Conservative View | Reflects the conservative perspective on climate change, focusing on gradual, market-driven solutions rather than large-scale regulatory interventions. Prioritizes economic stability, energy independence, and limited government involvement in climate policies. |
| Indigenous View | Operates from the perspective that climate change is deeply intertwined with human relationships with nature and the environment. Emphasizes traditional ecological knowledge, the interconnectedness of all living beings, and the sacred responsibility to care for the land. Highlights cultural, spiritual, and community-based dimensions. |

#### 3.1.4 AutoGen Implementation

```python
from autogen import ConversableAgent

# LLM Configuration (Section 4 Experimental Setup)
LLM_CONFIG = {
    "model": "gpt-4o",
    "temperature": 1.0,      # Default value per paper
    "top_p": 1.0,            # Default value per paper
    "response_format": {"type": "json_object"}  # JSON mode MUST be enabled
}

# System prompt from Appendix B
CODER_SYSTEM_PROMPT = """You are a coder in thematic analysis of social media data. When given a social media post, write 1-3 codes for the post. The code should capture concepts or ideas with the most analytical interests. For each code, extract a quote from the post corresponding to the code. The quote needs to be an extract from a sentence. Output the codes and quotes in the following format:

{
  "data_id": "<data_id>",
  "codes": [
    {
      "code": "<short phrase code>",
      "quote": "<exact extract from the text>",
      "quote_id": "<data_id>"
    }
  ]
}
"""

def create_coder_agent(
    agent_id: str,
    identity: Optional[str] = None
) -> ConversableAgent:
    """
    Create a coder agent using AutoGen's ConversableAgent.

    Args:
        agent_id: Unique identifier for the agent (e.g., "coder_1")
        identity: Optional identity perspective to assign

    Returns:
        ConversableAgent configured as a coder
    """

    # Build system message with optional identity
    if identity:
        system_message = f"""You are a coder in thematic analysis of social media data.

[IDENTITY PERSPECTIVE]
{identity}

When analyzing the data, reflect on how someone with your background and perspective would interpret the information. Consider what aspects would be most meaningful or significant from your viewpoint.

When given a social media post, write 1-3 codes for the post. The code should capture concepts or ideas with the most analytical interests from your perspective. For each code, extract a quote from the post corresponding to the code. The quote needs to be an extract from a sentence. Output the codes and quotes in the following format:

{{
  "data_id": "<data_id>",
  "codes": [
    {{
      "code": "<short phrase code>",
      "quote": "<exact extract from the text>",
      "quote_id": "<data_id>"
    }}
  ]
}}
"""
    else:
        system_message = CODER_SYSTEM_PROMPT

    # Create AutoGen ConversableAgent
    coder_agent = ConversableAgent(
        name=agent_id,
        system_message=system_message,
        llm_config=LLM_CONFIG,
        human_input_mode="NEVER",  # Fully automated
    )

    return coder_agent


def code_data_item(
    coder_agent: ConversableAgent,
    data_id: str,
    text: str
) -> dict:
    """
    Have a coder agent generate codes for a single data item.

    Args:
        coder_agent: The AutoGen coder agent
        data_id: Unique identifier for the data item
        text: The text content to analyze

    Returns:
        Parsed JSON response with codes and quotes
    """

    user_message = f"""Data ID: {data_id}
Text: {text}

Generate 1-3 codes for this text. Output in JSON format."""

    # Generate response using AutoGen's chat mechanism
    response = coder_agent.generate_reply(
        messages=[{"role": "user", "content": user_message}]
    )

    # Parse JSON response
    import json
    return json.loads(response)
```

---

### 3.2 Code Aggregator Agent

#### 3.2.0 Role Clarification

**IMPORTANT**: The Aggregator and Reviewer have DIFFERENT roles:

| Agent | What it merges | Purpose |
|-------|---------------|---------|
| **Aggregator** | Codes from **multiple coders** (same batch) | Reconcile different coder perspectives on same data |
| **Reviewer** | New codes with **existing codebook** | Maintain consistency with previously coded data |

The Aggregator handles **within-batch** merging (multiple coders → single organized output).
The Reviewer handles **across-batch** merging (new codes → existing codebook).

#### 3.2.1 System Prompt (Exact from Paper Appendix B)

```
You are an aggregator coder in the thematic analysis of social media data. Your job is to take the codes and corresponding quotes from other coders, merge the similar codes and retain the different ones. Store the quotes under the merged codes, and keep the top {K} most relevant quotes. Output the codes and quotes in JSON format. Don't output anything else. Quote_id is the same as data_id. Example...
```

**Full prompt with K=20 (per Section 4 Experimental Setup):**
```
You are an aggregator coder in the thematic analysis of social media data. Your job is to take the codes and corresponding quotes from other coders, merge the similar codes and retain the different ones. Store the quotes under the merged codes, and keep the top 20 most relevant quotes. Output the codes and quotes in JSON format. Don't output anything else. Quote_id is the same as data_id.

Output Format:
{
  "codes": [
    {
      "code": "<merged or retained code>",
      "quotes": [
        {
          "quote": "<quote text>",
          "quote_id": "<data_id>"
        }
      ]
    }
  ]
}

Example:
Input codes from coders:
- Coder 1: "financial stress" with quote "struggling to pay bills"
- Coder 2: "economic hardship" with quote "can't afford rent"
- Coder 1: "mental health concerns" with quote "feeling anxious"

Output:
{
  "codes": [
    {
      "code": "Financial and Economic Stress",
      "quotes": [
        {"quote": "struggling to pay bills", "quote_id": "001"},
        {"quote": "can't afford rent", "quote_id": "002"}
      ]
    },
    {
      "code": "Mental Health Concerns",
      "quotes": [
        {"quote": "feeling anxious", "quote_id": "001"}
      ]
    }
  ]
}
```

#### 3.2.2 AutoGen Implementation

```python
from autogen import ConversableAgent

# Maximum quotes per code (Section 4: "agents save up to 20 of the most relevant quotes")
MAX_QUOTES_PER_CODE = 20

AGGREGATOR_SYSTEM_PROMPT = f"""You are an aggregator coder in the thematic analysis of social media data. Your job is to take the codes and corresponding quotes from other coders, merge the similar codes and retain the different ones. Store the quotes under the merged codes, and keep the top {MAX_QUOTES_PER_CODE} most relevant quotes. Output the codes and quotes in JSON format. Don't output anything else. Quote_id is the same as data_id.

Output Format:
{{
  "codes": [
    {{
      "code": "<merged or retained code>",
      "quotes": [
        {{
          "quote": "<quote text>",
          "quote_id": "<data_id>"
        }}
      ]
    }}
  ]
}}
"""

def create_aggregator_agent() -> ConversableAgent:
    """
    Create a code aggregator agent using AutoGen's ConversableAgent.

    Returns:
        ConversableAgent configured as a code aggregator
    """

    aggregator_agent = ConversableAgent(
        name="code_aggregator",
        system_message=AGGREGATOR_SYSTEM_PROMPT,
        llm_config=LLM_CONFIG,  # Same config: gpt-4o, temp=1.0, top_p=1.0, JSON mode
        human_input_mode="NEVER",
    )

    return aggregator_agent


def aggregate_codes(
    aggregator_agent: ConversableAgent,
    coder_outputs: List[dict]
) -> dict:
    """
    Aggregate codes from multiple coders.

    Args:
        aggregator_agent: The AutoGen aggregator agent
        coder_outputs: List of coder output dictionaries

    Returns:
        Aggregated codes in JSON format
    """

    # Format all codes for the prompt
    codes_text = format_codes_for_aggregation(coder_outputs)

    user_message = f"""Here are the codes and quotes from the coders:

{codes_text}

Merge similar codes and organize them. Output in JSON format."""

    response = aggregator_agent.generate_reply(
        messages=[{"role": "user", "content": user_message}]
    )

    import json
    return json.loads(response)


def format_codes_for_aggregation(coder_outputs: List[dict]) -> str:
    """Format coder outputs for the aggregator prompt."""
    lines = []
    for output in coder_outputs:
        for code in output.get("codes", []):
            lines.append(
                f"- Code: \"{code['code']}\" | "
                f"Quote: \"{code['quote']}\" | "
                f"Quote ID: {code['quote_id']}"
            )
    return "\n".join(lines)
```

---

### 3.3 Reviewer Agent

#### 3.3.0 Role Clarification

The Reviewer Agent's role is to **maintain consistency with previously coded data**:

From Section 3.1: *"The reviewer compares the new codes and quotes with existing codes and quotes to determine whether these codes can be updated and whether similar existing codes can be merged."*

Key responsibilities:
1. Receive aggregated codes (from current batch)
2. Retrieve similar codes from codebook (via embeddings + cosine similarity)
3. Compare new codes with existing codes
4. Decide: update code names, merge with existing, or add as new
5. Update the codebook

#### 3.3.1 System Prompt (Exact from Paper Appendix B)

```
You are a review coder in the thematic analysis of social media data. Your job is to review the previously coded data with new codes, merge similar codes, and give them more representative codes. You will be given two items. The first contains new codes and quotes; the second contains similar codes and corresponding quotes to each new code. Decide if there are previously similar coded data with the same meaning that can be merged with the new codes. Update the new code according to the previous code if needed. If the previous codes are all different or there are no similar codes, leave the merge_codes empty in the output. Output the updated codes and quotes in JSON format...
```

**Key points from the prompt:**
- Input 1: New codes and quotes (from aggregator)
- Input 2: Similar codes and quotes (retrieved from codebook via embeddings)
- Decision: Can new codes be merged with existing similar codes?
- Output: `merge_codes` field (empty if no merge needed)

**Full prompt with output format:**
```
You are a review coder in the thematic analysis of social media data. Your job is to review the previously coded data with new codes, merge similar codes, and give them more representative codes. You will be given two items. The first contains new codes and quotes; the second contains similar codes and corresponding quotes to each new code. Decide if there are previously similar coded data with the same meaning that can be merged with the new codes. Update the new code according to the previous code if needed. If the previous codes are all different or there are no similar codes, leave the merge_codes empty in the output. Output the updated codes and quotes in JSON format.

Output Format:
{
  "codes": [
    {
      "code": "<the code (updated name if refined, original if not)>",
      "merge_codes": ["<existing code to merge with>"] or [],
      "quotes": [
        {"quote": "<quote text>", "quote_id": "<id>"}
      ]
    }
  ]
}
```

**Output interpretation:**
- `code`: The code name (may be updated to be more representative)
- `merge_codes`: List of existing codebook codes to merge with (empty `[]` if no merge)
- `quotes`: Associated quotes for this code

#### 3.3.2 Similarity Retrieval (Key Component)

From Section 3.1: *"Codes are represented both as texts and as embeddings, generated using a Sentence Transformer model. The reviewer agent processes new codes and quotes from the aggregator and retrieves the top-k similar codes and quotes from the codebook by computing the cosine similarity between their code embeddings."*

From Section 4: *"The reviewer retrieves the top 10 most similar codes for each new code."*

```python
from sentence_transformers import SentenceTransformer
import numpy as np

# Embedding model for code similarity
EMBEDDING_MODEL = SentenceTransformer('all-MiniLM-L6-v2')

# Top-k similar codes to retrieve (Section 4: "top 10 most similar codes")
SIMILARITY_TOP_K = 10


def get_code_embedding(code_text: str) -> np.ndarray:
    """Generate embedding for a code using Sentence Transformer."""
    return EMBEDDING_MODEL.encode(code_text)


def cosine_similarity(vec1: np.ndarray, vec2: np.ndarray) -> float:
    """Compute cosine similarity between two vectors."""
    return np.dot(vec1, vec2) / (np.linalg.norm(vec1) * np.linalg.norm(vec2))


def retrieve_similar_codes(
    new_code: str,
    codebook: dict,
    top_k: int = SIMILARITY_TOP_K
) -> List[dict]:
    """
    Retrieve top-k similar codes from the codebook using cosine similarity.

    Args:
        new_code: The new code text to find similar codes for
        codebook: The current codebook with entries
        top_k: Number of similar codes to retrieve (default: 10)

    Returns:
        List of top-k similar codebook entries
    """
    if not codebook.get("entries"):
        return []

    # Get embedding for new code
    new_embedding = get_code_embedding(new_code)

    # Compute similarity with all existing codes
    similarities = []
    for entry in codebook["entries"]:
        existing_embedding = np.array(entry["code_embedding"])
        sim = cosine_similarity(new_embedding, existing_embedding)
        similarities.append((sim, entry))

    # Sort by similarity (descending) and return top-k
    similarities.sort(key=lambda x: x[0], reverse=True)
    return [entry for sim, entry in similarities[:top_k]]
```

#### 3.3.3 AutoGen Implementation

```python
from autogen import ConversableAgent
from datetime import datetime

REVIEWER_SYSTEM_PROMPT = """You are a review coder in the thematic analysis of social media data. Your job is to review the previously coded data with new codes, merge similar codes, and give them more representative codes. You will be given two items. The first contains new codes and quotes; the second contains similar codes and corresponding quotes to each new code. Decide if there are previously similar coded data with the same meaning that can be merged with the new codes. Update the new code according to the previous code if needed. If the previous codes are all different or there are no similar codes, leave the merge_codes empty in the output. Output the updated codes and quotes in JSON format.

Output Format:
{
  "codes": [
    {
      "code": "<the code (updated name if refined, original if not)>",
      "merge_codes": ["<existing code to merge with>"] or [],
      "quotes": [
        {"quote": "<quote text>", "quote_id": "<id>"}
      ]
    }
  ]
}
"""


def create_reviewer_agent() -> ConversableAgent:
    """
    Create a reviewer agent using AutoGen's ConversableAgent.

    Returns:
        ConversableAgent configured as a reviewer
    """

    reviewer_agent = ConversableAgent(
        name="reviewer",
        system_message=REVIEWER_SYSTEM_PROMPT,
        llm_config=LLM_CONFIG,  # Same config: gpt-4o, temp=1.0, top_p=1.0, JSON mode
        human_input_mode="NEVER",
    )

    return reviewer_agent


def review_and_update_codebook(
    reviewer_agent: ConversableAgent,
    aggregated_codes: dict,
    codebook: dict
) -> dict:
    """
    Review new codes and update the codebook.

    Process (per Section 3.1):
    1. For each new code from aggregator
    2. Retrieve top-10 similar codes from codebook via cosine similarity (embeddings)
    3. Ask reviewer LLM to compare and decide whether to merge
    4. Apply decision to codebook

    Args:
        reviewer_agent: The AutoGen reviewer agent
        aggregated_codes: Output from aggregator (codes from current batch)
        codebook: Current codebook state (previously coded data)

    Returns:
        Updated codebook
    """

    for new_code_entry in aggregated_codes.get("codes", []):
        new_code = new_code_entry["code"]
        new_quotes = new_code_entry["quotes"]

        # Step 1: Retrieve similar codes (top-10) using embeddings
        # This is the "retrieval" part - done programmatically
        similar_codes = retrieve_similar_codes(new_code, codebook, top_k=10)

        # Step 2: Format for reviewer (two items as per prompt)
        # Item 1: New codes and quotes
        # Item 2: Similar codes and corresponding quotes from codebook
        similar_codes_text = format_similar_codes_for_review(similar_codes)

        # Step 3: Ask reviewer LLM to compare and decide
        user_message = f"""Item 1 - NEW CODE AND QUOTES:
Code: "{new_code}"
Quotes:
{format_quotes(new_quotes)}

Item 2 - SIMILAR EXISTING CODES FROM CODEBOOK:
{similar_codes_text if similar_codes_text else "No similar codes found in codebook."}

Decide if the new code can be merged with any existing codes. Output in JSON format."""

        response = reviewer_agent.generate_reply(
            messages=[{"role": "user", "content": user_message}]
        )

        import json
        decision = json.loads(response)

        # Step 4: Apply decision to codebook
        codebook = apply_reviewer_decision(codebook, decision)

    return codebook


def apply_reviewer_decision(
    codebook: dict,
    decision: dict
) -> dict:
    """
    Apply the reviewer's decision to the codebook.

    Based on the reviewer output format:
    - code: The code name (possibly updated)
    - merge_codes: List of existing codes to merge with (empty if no merge)
    - quotes: Associated quotes
    """

    for code_item in decision.get("codes", []):
        code = code_item.get("code")
        merge_codes = code_item.get("merge_codes", [])
        quotes = code_item.get("quotes", [])

        if merge_codes:
            # MERGE: Combine with existing code(s)
            for merge_target in merge_codes:
                for entry in codebook["entries"]:
                    if entry["code"] == merge_target:
                        # Update code name to the (possibly refined) name
                        entry["code"] = code
                        entry["code_embedding"] = get_code_embedding(code).tolist()
                        # Add new quotes (avoiding duplicates, up to max 20)
                        existing_ids = {q["quote_id"] for q in entry["quotes"]}
                        for quote in quotes:
                            if quote["quote_id"] not in existing_ids:
                                entry["quotes"].append(quote)
                        entry["quotes"] = entry["quotes"][:MAX_QUOTES_PER_CODE]
                        entry["updated_at"] = datetime.now().isoformat()
                        # Track merge history
                        if "merge_history" not in entry:
                            entry["merge_history"] = []
                        entry["merge_history"].append(merge_target)
                        break
        else:
            # ADD: No merge, add as new entry
            new_entry = {
                "code": code,
                "code_embedding": get_code_embedding(code).tolist(),
                "quotes": quotes[:MAX_QUOTES_PER_CODE],
                "created_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat()
            }
            codebook["entries"].append(new_entry)

    # Update metadata
    codebook["metadata"]["total_codes"] = len(codebook["entries"])
    codebook["metadata"]["total_quotes"] = sum(
        len(e["quotes"]) for e in codebook["entries"]
    )
    codebook["metadata"]["last_updated"] = datetime.now().isoformat()

    return codebook


def format_similar_codes_for_review(similar_codes: List[dict]) -> str:
    """
    Format similar codes for the reviewer prompt.
    Shows code name and associated quotes as evidence.
    """
    if not similar_codes:
        return ""

    lines = []
    for entry in similar_codes:
        quotes_text = "\n    ".join([f"- \"{q['quote']}\" (ID: {q['quote_id']})" for q in entry["quotes"][:5]])
        lines.append(f"Code: \"{entry['code']}\"\n  Quotes:\n    {quotes_text}")
    return "\n\n".join(lines)


def format_quotes(quotes: List[dict]) -> str:
    """Format quotes for display in prompts."""
    return "\n".join([f"- \"{q['quote']}\" (ID: {q['quote_id']})" for q in quotes])
```

---

## 4. Orchestration Pipeline (AutoGen-based)

### 4.1 Experimental Setup Parameters (From Section 4)

| Parameter | Value | Source |
|-----------|-------|--------|
| LLM Model | GPT-4o | "We use GPT-4o to serve as the LLM agents" |
| Temperature | 1.0 | "The temperature and top_p are set at the default value of one" |
| top_p | 1.0 | "The temperature and top_p are set at the default value of one" |
| JSON Mode | Enabled | "JSON mode needs to be enabled for the agents" |
| Max Quotes per Code | 20 | "agents save up to 20 of the most relevant quotes" |
| Similar Codes Retrieved | 10 | "The reviewer retrieves the top 10 most similar codes" |
| Number of Coders | 2 | "We assign two coder agents" (Section 4.1) |

### 4.2 Main Pipeline Implementation

```python
from autogen import ConversableAgent
from sentence_transformers import SentenceTransformer
from datetime import datetime
from typing import List, Optional, Callable
import json

# ==============================================================================
# CONFIGURATION (Section 4 Experimental Setup)
# ==============================================================================

LLM_CONFIG = {
    "model": "gpt-4o",
    "temperature": 1.0,
    "top_p": 1.0,
    "response_format": {"type": "json_object"}  # JSON mode MUST be enabled
}

MAX_QUOTES_PER_CODE = 20      # "agents save up to 20 of the most relevant quotes"
SIMILARITY_TOP_K = 10         # "The reviewer retrieves the top 10 most similar codes"
NUM_CODERS = 2                # "We assign two coder agents" (Section 4.1)
EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"  # Sentence Transformer model

# ==============================================================================
# PIPELINE CLASS
# ==============================================================================

class ThematicLMCodebookPipeline:
    """
    Main orchestration class for Thematic-LM codebook creation.

    Implements the Coding Stage from Section 3.1:
    - Multiple coder agents independently analyze text data
    - Code aggregator refines and organizes codes
    - Reviewer maintains adaptive codebook with similarity retrieval
    """

    def __init__(
        self,
        num_coders: int = NUM_CODERS,
        coder_identities: Optional[List[str]] = None,
        llm_config: dict = None
    ):
        """
        Initialize the pipeline with AutoGen agents.

        Args:
            num_coders: Number of coder agents (default: 2 per paper)
            coder_identities: Optional list of identity perspectives for coders
            llm_config: LLM configuration (defaults to paper's setup)
        """
        self.llm_config = llm_config or LLM_CONFIG

        # Initialize embedding model for similarity retrieval
        self.embedding_model = SentenceTransformer(EMBEDDING_MODEL_NAME)

        # Create coder agents (AutoGen ConversableAgent)
        self.coders = []
        for i in range(num_coders):
            identity = None
            if coder_identities and i < len(coder_identities):
                identity = coder_identities[i]

            self.coders.append(
                create_coder_agent(f"coder_{i}", identity)
            )

        # Create aggregator agent
        self.aggregator = create_aggregator_agent()

        # Create reviewer agent
        self.reviewer = create_reviewer_agent()

        # Initialize empty codebook
        self.codebook = {
            "entries": [],
            "metadata": {
                "total_codes": 0,
                "total_quotes": 0,
                "last_updated": datetime.now().isoformat(),
                "embedding_model": EMBEDDING_MODEL_NAME,
                "llm_model": self.llm_config["model"],
                "num_coders": num_coders
            }
        }

    def process_dataset(
        self,
        dataset: List[dict],
        batch_size: int = 10,
        progress_callback: Optional[Callable] = None
    ) -> dict:
        """
        Process entire dataset and build codebook.

        Implements the data flow from Figure 2:
        Text Data → Coders → Aggregator → Reviewer → Codebook

        Args:
            dataset: List of {"data_id": str, "text": str} items
            batch_size: Number of items per batch
            progress_callback: Optional callback(processed, total)

        Returns:
            Final codebook dictionary
        """
        total_items = len(dataset)
        processed = 0

        # Process in batches
        for batch_start in range(0, total_items, batch_size):
            batch_end = min(batch_start + batch_size, total_items)
            batch = dataset[batch_start:batch_end]

            # Step 1: Multiple coders independently analyze each item
            all_coder_outputs = self._run_coders(batch)

            # Step 2: Aggregator merges similar codes
            aggregated = aggregate_codes(self.aggregator, all_coder_outputs)

            # Step 3: Reviewer updates codebook with similarity retrieval
            self.codebook = review_and_update_codebook(
                self.reviewer,
                aggregated,
                self.codebook
            )

            # Progress update
            processed += len(batch)
            if progress_callback:
                progress_callback(processed, total_items)

        return self.codebook

    def _run_coders(self, batch: List[dict]) -> List[dict]:
        """
        Run all coder agents on the batch.

        Each coder independently processes each data item,
        generating 1-3 codes per item.
        """
        all_outputs = []

        for item in batch:
            for coder in self.coders:
                output = code_data_item(
                    coder,
                    item["data_id"],
                    item["text"]
                )
                all_outputs.append(output)

        return all_outputs

    def save_codebook(self, filepath: str):
        """Save codebook to JSON file."""
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(self.codebook, f, indent=2, ensure_ascii=False)

    def load_codebook(self, filepath: str):
        """Load existing codebook from JSON file."""
        with open(filepath, 'r', encoding='utf-8') as f:
            self.codebook = json.load(f)
```

### 4.2 Batch Processing Flow

```
For each batch of N data items:
┌────────────────────────────────────────────────────────┐
│                                                        │
│  1. PARALLEL CODING                                    │
│     ┌─────────┐ ┌─────────┐     ┌─────────┐          │
│     │ Coder 1 │ │ Coder 2 │ ... │ Coder K │          │
│     │ codes   │ │ codes   │     │ codes   │          │
│     │ item 1  │ │ item 1  │     │ item 1  │          │
│     │ item 2  │ │ item 2  │     │ item 2  │          │
│     │ ...     │ │ ...     │     │ ...     │          │
│     │ item N  │ │ item N  │     │ item N  │          │
│     └────┬────┘ └────┬────┘     └────┬────┘          │
│          │           │               │                │
│          └───────────┴───────────────┘                │
│                      │                                │
│                      ▼                                │
│  2. AGGREGATION                                       │
│     ┌──────────────────────────┐                     │
│     │    Code Aggregator       │                     │
│     │  - Merge similar codes   │                     │
│     │  - Organize quotes       │                     │
│     └────────────┬─────────────┘                     │
│                  │                                    │
│                  ▼                                    │
│  3. REVIEW & UPDATE                                  │
│     ┌──────────────────────────┐                     │
│     │      Reviewer            │                     │
│     │  For each new code:      │                     │
│     │  - Generate embedding    │                     │
│     │  - Find similar codes    │                     │
│     │  - Decide: add/merge     │                     │
│     │  - Update codebook       │                     │
│     └────────────┬─────────────┘                     │
│                  │                                    │
│                  ▼                                    │
│     ┌──────────────────────────┐                     │
│     │   Updated Codebook       │                     │
│     └──────────────────────────┘                     │
│                                                        │
└────────────────────────────────────────────────────────┘

Repeat for next batch...
```

---

## 5. Configuration & Parameters

### 5.1 LLM Configuration

| Parameter | Value | Notes |
|-----------|-------|-------|
| Model | GPT-4o (or compatible) | Paper uses GPT-4o |
| Temperature | 1.0 | Default value |
| top_p | 1.0 | Default value |
| response_format | JSON mode | Required for consistent output |

### 5.2 System Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `num_coders` | 2 | Number of coder agents |
| `max_quotes_per_code` | 20 | Maximum quotes stored per code |
| `similarity_top_k` | 10 | Number of similar codes retrieved for review |
| `batch_size` | 10 | Items processed per batch |
| `embedding_model` | "all-MiniLM-L6-v2" | Sentence Transformer model |

### 5.3 Configuration File Format

```json
{
  "llm": {
    "model": "gpt-4o",
    "temperature": 1.0,
    "top_p": 1.0,
    "api_key_env": "OPENAI_API_KEY"
  },
  "pipeline": {
    "num_coders": 2,
    "batch_size": 10,
    "max_quotes_per_code": 20,
    "similarity_top_k": 10
  },
  "embedding": {
    "model": "all-MiniLM-L6-v2"
  },
  "coder_identities": null,
  "output": {
    "codebook_path": "./output/codebook.json",
    "save_intermediate": true,
    "intermediate_dir": "./output/intermediate"
  }
}
```

---

## 6. File Structure

```
thematic_lm/
├── __init__.py
├── agents/
│   ├── __init__.py
│   ├── coder.py              # CoderAgent implementation
│   ├── aggregator.py         # CodeAggregatorAgent implementation
│   └── reviewer.py           # ReviewerAgent implementation
├── models/
│   ├── __init__.py
│   ├── data_types.py         # TypedDict/dataclass definitions
│   └── codebook.py           # Codebook class
├── pipeline/
│   ├── __init__.py
│   └── orchestrator.py       # ThematicLMCodebookPipeline
├── embeddings/
│   ├── __init__.py
│   └── sentence_transformer.py  # Embedding utilities
├── utils/
│   ├── __init__.py
│   ├── llm_client.py         # LLM API wrapper
│   └── json_utils.py         # JSON parsing utilities
├── prompts/
│   ├── __init__.py
│   ├── coder_prompts.py      # Coder system prompts
│   ├── aggregator_prompts.py # Aggregator prompts
│   └── reviewer_prompts.py   # Reviewer prompts
├── config/
│   └── default_config.json
└── main.py                   # Entry point
```

---

## 7. Implementation Steps

### Phase 1: Core Data Types (1-2 days)
1. [ ] Define all TypeScript/Python data types in `models/data_types.py`
2. [ ] Implement `Codebook` class with serialization methods
3. [ ] Create JSON schema validators

### Phase 2: Embedding Service (1 day)
1. [ ] Set up Sentence Transformer integration
2. [ ] Implement embedding generation
3. [ ] Implement cosine similarity computation
4. [ ] Add embedding caching for performance

### Phase 3: Agent Implementations (3-4 days)
1. [ ] Implement `CoderAgent`
   - System prompt construction
   - Identity perspective handling
   - Response parsing
2. [ ] Implement `CodeAggregatorAgent`
   - Code merging logic
   - Quote organization
3. [ ] Implement `ReviewerAgent`
   - Similar code retrieval
   - LLM decision integration
   - Codebook update operations

### Phase 4: Pipeline Orchestration (2 days)
1. [ ] Implement `ThematicLMCodebookPipeline`
2. [ ] Add batch processing
3. [ ] Implement parallel coder execution
4. [ ] Add progress tracking and callbacks

### Phase 5: Configuration & CLI (1 day)
1. [ ] Configuration file parsing
2. [ ] Command-line interface
3. [ ] Logging and monitoring

### Phase 6: Testing & Validation (2 days)
1. [ ] Unit tests for each agent
2. [ ] Integration tests for pipeline
3. [ ] Test with sample dataset

---

## 8. Dependencies

**Note**: AutoGen is REQUIRED, not optional. The paper explicitly states: *"The agents are implemented with conversational agents from AutoGen"* (Section 3.1).

```
# Core dependencies (REQUIRED)
pyautogen>=0.2.0                # Microsoft AutoGen - REQUIRED per paper Section 3.1
sentence-transformers>=2.2.0    # For code embeddings (Sentence Transformer model)
numpy>=1.24.0                   # Numerical operations (cosine similarity)
openai>=1.0.0                   # OpenAI API (GPT-4o per Section 4)

# Utility
tqdm>=4.65.0                    # Progress bars
```

### Installation

```bash
pip install pyautogen sentence-transformers numpy openai tqdm
```

### OpenAI API Key Setup

```bash
export OPENAI_API_KEY="your-api-key-here"
```

Or in code:
```python
import os
os.environ["OPENAI_API_KEY"] = "your-api-key-here"
```

---

## 9. API Usage Examples

### 9.1 Basic Usage

```python
import asyncio
from thematic_lm import ThematicLMCodebookPipeline

# Initialize pipeline
pipeline = ThematicLMCodebookPipeline(
    llm_client=OpenAIClient(api_key="..."),
    num_coders=2,
    batch_size=10
)

# Load dataset
dataset = [
    {"data_id": "001", "text": "I've been feeling so anxious about work lately..."},
    {"data_id": "002", "text": "The rent increase is really stressing me out..."},
    # ... more items
]

# Process and build codebook
codebook = asyncio.run(pipeline.process_dataset(dataset))

# Save codebook
pipeline.save_codebook("output/codebook.json")
```

### 9.2 With Identity Perspectives

```python
identities = [
    "You believe climate change is primarily driven by human activities...",
    "You approach climate change from a conservative economic perspective..."
]

pipeline = ThematicLMCodebookPipeline(
    llm_client=client,
    num_coders=2,
    coder_identities=identities
)
```

### 9.3 Progress Tracking

```python
def on_progress(processed, total):
    print(f"Processed {processed}/{total} items ({processed/total*100:.1f}%)")

codebook = await pipeline.process_dataset(
    dataset,
    progress_callback=on_progress
)
```

---

## 10. Output Format

### 10.1 Final Codebook JSON

```json
{
  "entries": [
    {
      "code": "Financial and Economic Stress",
      "code_embedding": [0.123, -0.456, ...],
      "quotes": [
        {
          "quote": "I can barely afford to pay my bills this month",
          "quote_id": "post_001"
        },
        {
          "quote": "The rent increase is making life impossible",
          "quote_id": "post_042"
        }
      ],
      "created_at": "2025-01-15T10:30:00Z",
      "updated_at": "2025-01-15T14:22:00Z",
      "merge_history": ["economic hardship", "financial struggles"]
    },
    {
      "code": "Mental Health Challenges",
      "code_embedding": [0.789, -0.012, ...],
      "quotes": [
        {
          "quote": "My anxiety has been through the roof lately",
          "quote_id": "post_003"
        }
      ],
      "created_at": "2025-01-15T10:35:00Z",
      "updated_at": "2025-01-15T10:35:00Z"
    }
  ],
  "metadata": {
    "total_codes": 45,
    "total_quotes": 892,
    "last_updated": "2025-01-15T16:00:00Z",
    "embedding_model": "all-MiniLM-L6-v2",
    "pipeline_config": {
      "num_coders": 2,
      "batch_size": 10
    }
  }
}
```

---

## 11. Key Design Decisions from Paper

### 11.1 Adaptive Codebook (vs. Predefined)
- Codebook continuously updates during coding process
- Accommodates new data and insights
- Contrast with traditional predefined codebook approach

### 11.2 Similarity Retrieval for Review
- Uses cosine similarity on Sentence Transformer embeddings
- Top-k retrieval (k=10) for context in review decisions
- Enables comparison with semantically similar previous codes

### 11.3 Code Merging Logic
- Merge only when codes capture the SAME underlying meaning
- Preserve nuances - don't over-merge distinct concepts
- Create representative merged code names

### 11.4 Quote Evidence
- Quotes serve as evidence linking codes to source data
- Maximum 20 quotes per code for manageability
- Quote IDs enable traceability back to original data

### 11.5 Multiple Coders for Diversity
- Independent coding promotes broader perspective
- Different identities can be assigned for viewpoint diversity
- Aggregation step reconciles different interpretations

---

## 12. Notes

### 12.1 Not Included (Per Requirements)
- Theme development stage
- Theme aggregation
- Evaluation framework (credibility, dependability, transferability)
- LLMLingua compression (used only for theme stage)

### 12.2 AutoGen Framework (REQUIRED)

The paper explicitly states in Section 3.1: *"The agents are implemented with conversational agents from AutoGen"*

AutoGen is the required framework for implementing Thematic-LM. All agents (coders, aggregator, reviewer) are implemented as `ConversableAgent` instances:

```python
from autogen import ConversableAgent

# All agents use ConversableAgent with:
# - name: unique identifier
# - system_message: role-specific prompt from Appendix B
# - llm_config: GPT-4o with temperature=1.0, top_p=1.0, JSON mode
# - human_input_mode: "NEVER" for full automation

coder_agent = ConversableAgent(
    name="coder_1",
    system_message=CODER_SYSTEM_PROMPT,
    llm_config={
        "model": "gpt-4o",
        "temperature": 1.0,
        "top_p": 1.0,
        "response_format": {"type": "json_object"}
    },
    human_input_mode="NEVER"
)
```

### 12.3 Scalability Considerations
- Batch processing enables handling large datasets
- Async/parallel execution for coders
- Embedding caching reduces redundant computation
- Incremental codebook saves prevent data loss

---

## Summary

This implementation plan covers the complete codebook creation pipeline for Thematic-LM, following the paper's specifications from **Section 3.1** (Multi-agent System) and **Section 4** (Experimental Setup).

### Framework
- **AutoGen** is the REQUIRED framework (Section 3.1: "agents are implemented with conversational agents from AutoGen")
- All agents use `ConversableAgent` with `human_input_mode="NEVER"` for full automation

### Agents (Section 3.1)
1. **Coder Agents** (2 by default): Generate 1-3 codes per data item with supporting quotes
2. **Code Aggregator**: Merge similar codes, retain differences, organize into JSON
3. **Reviewer Agent**: Maintain adaptive codebook using semantic similarity retrieval

### Configuration (Section 4 Experimental Setup)
- **LLM**: GPT-4o with temperature=1.0, top_p=1.0
- **JSON mode**: MUST be enabled for consistent output
- **Max quotes per code**: 20
- **Similar codes retrieved**: Top 10 via cosine similarity
- **Embedding model**: Sentence Transformer

### Key Innovation: Adaptive Codebook
The codebook continuously updates during the coding process:
- Codes stored as text + embeddings (Sentence Transformer)
- Reviewer retrieves top-10 similar codes via cosine similarity
- Decides to add, merge, or update codes based on semantic comparison
- Maintains quote evidence for traceability
