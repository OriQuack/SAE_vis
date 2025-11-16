# Frontend Reload Flow

**Simple guide to what happens when the page reloads.**

**Total Time:** ~18 seconds (mostly backend API calls)

---

## Files Involved

1. `frontend/src/main.tsx` - Mounts the app
2. `frontend/src/App.tsx` - Lines 89-131 (3 useEffect hooks)
3. `frontend/src/store/index.ts` - Lines 773-855 (`initializeWithDefaultFilters`)
4. `frontend/src/store/sankey-actions.ts` - Lines 126-233 (`initializeFixedSankeyTree`)

---

## What Happens (Step by Step)

### 1. Health Check
**File:** `App.tsx:113-115`

```
GET /health
```

**Time:** ~2ms

### 2. Load Filter Options
**File:** `App.tsx:118-122`

```
GET /api/filter-options
```

**Response:**
- **LLM Explainers:**
  - `hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4`
  - `google/gemini-flash-2.5`
  - `openai/gpt-4o-mini`
- **LLM Scorers:**
  - `hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4`

**Time:** ~1ms

### 3. Initialize Default Filters
**File:** `index.ts:773-855`

- Left panel: ALL 3 explainers + scorer
- Right panel: NO explainers + scorer

### 4. Pre-load Table Data
**File:** `index.ts:848`

```
POST /api/table-data
{
  filters: {
    sae_id: [],
    explanation_method: [],
    llm_explainer: [
      "hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4",
      "google/gemini-flash-2.5",
      "openai/gpt-4o-mini"
    ],
    llm_scorer: ["hugging-quants/Meta-Llama-3.1-70B-Instruct-AWQ-INT4"]
  }
}
```

**Response:** 6,583 features with decoder_similarity and explainers data
**Time:** ~17,557ms (17.6 seconds) ⚠️ **SLOWEST**

**Why:** Enables local feature grouping without backend calls later

### 5. Load Root Features
**File:** `sankey-actions.ts:62-116`

```
POST /api/feature-groups
{
  filters: {...},
  metric: "",
  thresholds: []
}
```

**Response:** 6,583 features in 1 group ("All Features")
**Time:** ~44ms

### 6. Build Feature Splitting Stage
**File:** `sankey-actions.ts:151-168`

- **Metric:** `decoder_similarity`
- **Threshold:** `[0.4]`
- **Groups:** Low (<0.4), High (≥0.4)
- **Grouping:** LOCAL (uses pre-loaded table data)
- **Histogram:**

```
POST /api/histogram-data
{
  filters: {...},
  metric: "decoder_similarity"
}
```

**Time:** ~51ms

### 7. Build Quality Stage
**File:** `sankey-actions.ts:171-205`

- **Metric:** `quality_score`
- **Threshold:** `[0.65]`
- **Groups:** Low (<0.65), High (≥0.65)
- **Grouping:** LOCAL (no backend call)
- **Histogram:**

```
POST /api/histogram-data
{
  filters: {...},
  metric: "quality_score"
}
```

**Time:** ~47ms

### 8. Build Cause Stage
**File:** `sankey-actions.ts:208-222`

- **Groups:** Missed Context, Missed Lexicon, Noisy Activation, Unsure
- **All features start in "Unsure"**
- **Grouping:** LOCAL (no backend call)
- **Time:** ~1ms

### 9. Auto-activate Table
**File:** `sankey-actions.ts:374-391`

- Selects high similarity node
- Shows features with high decoder similarity in table

---

## Final Tree Structure

```
Root (6,583 features)
├─ Feature Splitting (decoder_similarity, threshold: 0.4)
│  ├─ Low (<0.4)
│  │  └─ Quality (quality_score, threshold: 0.65)
│  │     ├─ Low (<0.65)
│  │     │  └─ Cause (4 groups)
│  │     │     ├─ Missed Context: 0
│  │     │     ├─ Missed Lexicon: 0
│  │     │     ├─ Noisy Activation: 0
│  │     │     └─ Unsure: all features ← all start here
│  │     └─ High (≥0.65) [TERMINAL]
│  └─ High (≥0.4) [TERMINAL] ← auto-selected in table
```

---

## API Timing Summary

| API Call | Time | Purpose |
|----------|------|---------|
| GET /health | 2ms | Check backend |
| GET /api/filter-options | 1ms | Load LLM models |
| POST /api/table-data | **17,557ms** | Pre-load all features |
| POST /api/feature-groups | 44ms | Load root features |
| POST /api/histogram-data (decoder) | 51ms | Feature splitting histogram |
| POST /api/histogram-data (quality) | 47ms | Quality histogram |
| **TOTAL** | **17,702ms** | **~18 seconds** |

**Note:** Local processing (tree building, UI rendering) adds minimal time (~100-200ms).

---

## Key Optimization

**Pre-loading table data** (17.6s) is slow BUT enables:
- ✅ Instant threshold changes (no backend calls)
- ✅ Local feature grouping
- ✅ Smooth UI interactions

Without pre-loading: Every threshold change would require a backend call (~50ms + network latency).

---

**Last Updated:** 2025-11-17 (with actual tested timings)
