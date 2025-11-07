# Sort by Similarity Feature - Implementation Plan

## Overview
Add a "Sort by Similarity" button to the QualityTablePanel that sorts features based on user-labeled checkmarks (✓) and X-marks (✗) using weighted Euclidean distance across 9 metrics.

## Requirements Summary

### User Interface
- **Button Location**: Above the table in QualityTablePanel
- **Activation**: Button enabled only when more than 1 row is selected (checked or rejected)
- **Visual Feedback**: Show active state when similarity sort is applied

### Sorting Logic
1. **Top Section**: All ✓ (checked/selected) features
2. **Middle Section**: Unselected features sorted by similarity score (descending)
   - Score = avg_distance_to_✓_features - avg_distance_to_✗_features
3. **Bottom Section**: All ✗ (rejected) features

### Metrics Used (9 total)
1. **decoder_similarity** - SAE decoder weight similarity
2. **intra_ngram_jaccard** - Max of char_ngram and word_ngram jaccard
3. **intra_semantic_sim** - Intra-feature semantic similarity
4. **inter_ngram_jaccard** - Inter-feature ngram jaccard
5. **inter_semantic_sim** - Inter-feature semantic similarity
6. **embed_score** - Embedding alignment score
7. **fuzz_score** - Fuzzing robustness score
8. **detection_score** - Detection utility score
9. **llm_explainer_semantic_sim** - LLM explainer semantic similarity

### Weight Calculation
- For each metric: `weight = 1 / (std × 2)`
- Normalize weights so they sum to 1
- Use weighted Euclidean distance for similarity calculation

### Behavior
- **Persistence**: Sort order persists until user manually changes sort
- **No Auto-recalculation**: Changing checkboxes doesn't trigger re-sort
- **Manual Re-sort**: User can click button again to recalculate with new selections

---

## Architecture

### Data Flow
```
User selects features (✓/✗)
        ↓
User clicks "Sort by Similarity" button
        ↓
Frontend collects selected/rejected feature IDs
        ↓
POST /api/similarity-sort
        ↓
Backend:
  1. Extract 9 metrics for all features
  2. Calculate std for each metric
  3. Compute normalized weights
  4. For each unselected feature:
     - Calculate weighted distance to each ✓ feature → average
     - Calculate weighted distance to each ✗ feature → average
     - Score = similarity_to_checked - dissimilarity_to_rejected
  5. Return sorted list with scores
        ↓
Frontend:
  1. Store similarity scores in state
  2. Set tableSortBy = 'similarity'
  3. Apply three-tier sorting (✓, scored, ✗)
  4. Re-render table
```

### Backend Processing
```python
# Weighted Euclidean Distance Formula
def weighted_euclidean_distance(feature_a, feature_b, weights):
    distance = 0
    for i, metric in enumerate(metrics):
        diff = feature_a[metric] - feature_b[metric]
        distance += weights[i] * (diff ** 2)
    return sqrt(distance)

# Score Calculation
for feature in unselected_features:
    # Average distance to all checked features
    distances_to_checked = [
        weighted_euclidean_distance(feature, checked, weights)
        for checked in checked_features
    ]
    avg_dist_to_checked = mean(distances_to_checked)

    # Average distance to all rejected features
    distances_to_rejected = [
        weighted_euclidean_distance(feature, rejected, weights)
        for rejected in rejected_features
    ]
    avg_dist_to_rejected = mean(distances_to_rejected)

    # Final score (higher = more similar to checked, less similar to rejected)
    score = avg_dist_to_checked - avg_dist_to_rejected
```

---

## Implementation Phases

## Phase 1: Backend Implementation

### 1.1 Create Pydantic Models
**File**: `backend/app/models/similarity_sort.py` (NEW)

```python
from pydantic import BaseModel
from typing import List

class SimilaritySortRequest(BaseModel):
    selected_ids: List[int]    # Feature IDs marked with ✓
    rejected_ids: List[int]    # Feature IDs marked with ✗
    feature_ids: List[int]     # All feature IDs in current table view

class FeatureScore(BaseModel):
    feature_id: int
    score: float

class SimilaritySortResponse(BaseModel):
    sorted_features: List[FeatureScore]
```

### 1.2 Create Similarity Calculation Service
**File**: `backend/app/services/similarity_sort_service.py` (NEW)

**Key Functions**:
- `extract_metrics(df, feature_ids)` - Extract 9 metrics for specified features
- `calculate_weights(metrics_df)` - Compute normalized weights from std
- `weighted_euclidean_distance(vec_a, vec_b, weights)` - Distance calculation
- `calculate_similarity_scores(selected_ids, rejected_ids, all_features, weights)` - Main scoring logic
- `get_similarity_sorted_features(request)` - Entry point for API

**Metrics Extraction Logic**:
```python
# 1. decoder_similarity - need to convert to numeric (similarity count or score)
# 2. intra_ngram_jaccard - max(char_ngram_max_jaccard, word_ngram_max_jaccard)
# 3. intra_semantic_sim - from activation examples
# 4. inter_ngram_jaccard - need to extract from explainer data
# 5. inter_semantic_sim - from explainer semantic_similarity
# 6. embed_score - score_embedding
# 7. fuzz_score - average of fuzz scores across scorers
# 8. detection_score - average of detection scores across scorers
# 9. llm_explainer_semantic_sim - from explainer data
```

### 1.3 Create API Endpoint
**File**: `backend/app/api/similarity_sort.py` (NEW)

```python
from fastapi import APIRouter, HTTPException
from app.models.similarity_sort import SimilaritySortRequest, SimilaritySortResponse
from app.services.similarity_sort_service import get_similarity_sorted_features

router = APIRouter()

@router.post("/similarity-sort", response_model=SimilaritySortResponse)
async def similarity_sort(request: SimilaritySortRequest):
    try:
        return get_similarity_sorted_features(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

### 1.4 Register Router
**File**: `backend/app/api/__init__.py` (MODIFY)

Add import and include router:
```python
from app.api.similarity_sort import router as similarity_sort_router
app.include_router(similarity_sort_router, prefix="/api", tags=["similarity"])
```

---

## Phase 2: Frontend Type Definitions

### 2.1 Update TypeScript Types
**File**: `frontend/src/types.ts` (MODIFY)

```typescript
// Update SortBy type to include 'similarity'
export type SortBy =
  | 'featureId'
  | 'quality_score'
  | 'score_detection'
  | 'score_fuzz'
  | 'score_embedding'
  | 'decoder_similarity'
  | 'semantic_similarity'
  | 'similarity'  // NEW
  | null;

// Add new interfaces for similarity sort
export interface SimilaritySortRequest {
  selected_ids: number[];
  rejected_ids: number[];
  feature_ids: number[];
}

export interface FeatureScore {
  feature_id: number;
  score: number;
}

export interface SimilaritySortResponse {
  sorted_features: FeatureScore[];
}
```

---

## Phase 3: Frontend API Integration

### 3.1 Add API Function
**File**: `frontend/src/api.ts` (MODIFY)

```typescript
export const getSimilaritySort = async (
  selectedIds: number[],
  rejectedIds: number[],
  featureIds: number[]
): Promise<SimilaritySortResponse> => {
  const response = await axios.post<SimilaritySortResponse>(
    `${API_BASE_URL}/similarity-sort`,
    {
      selected_ids: selectedIds,
      rejected_ids: rejectedIds,
      feature_ids: featureIds
    }
  );
  return response.data;
};
```

---

## Phase 4: Frontend State Management

### 4.1 Update Zustand Store State
**File**: `frontend/src/store/index.ts` (MODIFY)

Add to `AppState` interface:
```typescript
interface AppState {
  // ... existing state ...

  // Similarity sort state
  similarityScores: Map<number, number>;
  isSimilaritySortLoading: boolean;

  // Actions
  setSimilarityScores: (scores: Map<number, number>) => void;
  clearSimilarityScores: () => void;
  setIsSimilaritySortLoading: (loading: boolean) => void;
}
```

Implement actions:
```typescript
setSimilarityScores: (scores) => {
  set({ similarityScores: scores });
},
clearSimilarityScores: () => {
  set({ similarityScores: new Map() });
},
setIsSimilaritySortLoading: (loading) => {
  set({ isSimilaritySortLoading: loading });
},
```

### 4.2 Add Table Action
**File**: `frontend/src/store/table-actions.ts` (MODIFY)

```typescript
export const tableActions = {
  // ... existing actions ...

  sortBySimilarity: async () => {
    const state = get();
    const { featureSelectionStates, tableData } = state;

    // Validate: need at least 1 selected or rejected feature
    if (featureSelectionStates.size < 1) {
      console.warn('No features selected for similarity sort');
      return;
    }

    // Extract selected and rejected IDs
    const selectedIds: number[] = [];
    const rejectedIds: number[] = [];

    featureSelectionStates.forEach((selectionState, featureId) => {
      if (selectionState === 'selected') {
        selectedIds.push(featureId);
      } else if (selectionState === 'rejected') {
        rejectedIds.push(featureId);
      }
    });

    // Need at least one of each for meaningful sort
    if (selectedIds.length === 0 && rejectedIds.length === 0) {
      console.warn('Need at least one selected or rejected feature');
      return;
    }

    // Get all feature IDs from table data
    const allFeatureIds = tableData?.features.map(f => f.feature_id) || [];

    try {
      set({ isSimilaritySortLoading: true });

      // Call API
      const response = await getSimilaritySort(
        selectedIds,
        rejectedIds,
        allFeatureIds
      );

      // Convert to Map for easy lookup
      const scoresMap = new Map<number, number>();
      response.sorted_features.forEach(fs => {
        scoresMap.set(fs.feature_id, fs.score);
      });

      // Store scores and set sort mode
      set({
        similarityScores: scoresMap,
        tableSortBy: 'similarity',
        tableSortDirection: 'desc',
        isSimilaritySortLoading: false
      });
    } catch (error) {
      console.error('Failed to calculate similarity sort:', error);
      set({ isSimilaritySortLoading: false });
    }
  },
};
```

---

## Phase 5: Frontend UI Implementation

### 5.1 Add Sort by Similarity Button
**File**: `frontend/src/components/QualityTablePanel.tsx` (MODIFY)

Add button in the controls section (around line 600, near sort controls):

```typescript
const QualityTablePanel: React.FC = () => {
  // ... existing hooks ...

  const featureSelectionStates = useVisualizationStore(state => state.featureSelectionStates);
  const sortBySimilarity = useVisualizationStore(state => state.sortBySimilarity);
  const isSimilaritySortLoading = useVisualizationStore(state => state.isSimilaritySortLoading);
  const tableSortBy = useVisualizationStore(state => state.tableSortBy);

  // Calculate if button should be enabled
  const canSortBySimilarity = useMemo(() => {
    return featureSelectionStates.size > 1;
  }, [featureSelectionStates]);

  // Count selected vs rejected
  const selectionCounts = useMemo(() => {
    let selected = 0;
    let rejected = 0;
    featureSelectionStates.forEach(state => {
      if (state === 'selected') selected++;
      else if (state === 'rejected') rejected++;
    });
    return { selected, rejected };
  }, [featureSelectionStates]);

  const handleSimilaritySort = useCallback(() => {
    sortBySimilarity();
  }, [sortBySimilarity]);

  return (
    <div className="table-panel">
      {/* ... existing header ... */}

      <div className="table-panel__controls">
        {/* ... existing controls ... */}

        {/* NEW: Sort by Similarity Button */}
        <button
          className={`table-panel__similarity-sort-btn ${
            tableSortBy === 'similarity' ? 'active' : ''
          }`}
          onClick={handleSimilaritySort}
          disabled={!canSortBySimilarity || isSimilaritySortLoading}
          title={
            !canSortBySimilarity
              ? 'Select at least 2 features to sort by similarity'
              : `Sort by similarity to ${selectionCounts.selected} checked and away from ${selectionCounts.rejected} rejected features`
          }
        >
          {isSimilaritySortLoading ? (
            <>
              <span className="spinner-small"></span>
              Calculating...
            </>
          ) : (
            <>
              <span className="icon-similarity">⚡</span>
              Sort by Similarity
              {tableSortBy === 'similarity' && <span className="active-indicator">●</span>}
            </>
          )}
        </button>
      </div>

      {/* ... rest of component ... */}
    </div>
  );
};
```

### 5.2 Update Table Sorting Logic
**File**: `frontend/src/components/QualityTablePanel.tsx` (MODIFY)

Update the `sortedFeatures` useMemo (around line 400-500):

```typescript
const sortedFeatures = useMemo(() => {
  if (!tableData?.features) return [];

  let features = [...tableData.features];

  // Special handling for similarity sort
  if (tableSortBy === 'similarity') {
    const selected: FeatureTableRow[] = [];
    const rejected: FeatureTableRow[] = [];
    const unselected: FeatureTableRow[] = [];

    // Separate into three groups
    features.forEach(feature => {
      const selectionState = featureSelectionStates.get(feature.feature_id);
      if (selectionState === 'selected') {
        selected.push(feature);
      } else if (selectionState === 'rejected') {
        rejected.push(feature);
      } else {
        unselected.push(feature);
      }
    });

    // Sort unselected by similarity score (descending - higher is better)
    unselected.sort((a, b) => {
      const scoreA = similarityScores.get(a.feature_id) ?? -Infinity;
      const scoreB = similarityScores.get(b.feature_id) ?? -Infinity;
      return scoreB - scoreA; // Descending
    });

    // Return three-tier structure
    return [...selected, ...unselected, ...rejected];
  }

  // ... existing sort logic for other sort types ...

  return features;
}, [tableData, tableSortBy, tableSortDirection, featureSelectionStates, similarityScores]);
```

### 5.3 Add CSS Styling
**File**: `frontend/src/styles/QualityTablePanel.css` (MODIFY)

```css
/* Sort by Similarity Button */
.table-panel__similarity-sort-btn {
  padding: 8px 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.table-panel__similarity-sort-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(102, 126, 234, 0.3);
}

.table-panel__similarity-sort-btn:active:not(:disabled) {
  transform: translateY(0);
}

.table-panel__similarity-sort-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
  opacity: 0.6;
}

.table-panel__similarity-sort-btn.active {
  background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
  box-shadow: 0 0 0 3px rgba(56, 239, 125, 0.3);
}

.table-panel__similarity-sort-btn .icon-similarity {
  font-size: 16px;
}

.table-panel__similarity-sort-btn .active-indicator {
  color: #fff;
  font-size: 12px;
  animation: pulse 2s infinite;
}

.table-panel__similarity-sort-btn .spinner-small {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Optional: Add visual indicator for similarity-sorted rows */
.table-panel--similarity-mode .table-panel__sub-row {
  transition: background-color 0.3s ease;
}

.table-panel--similarity-mode .table-panel__sub-row:not(.table-panel__sub-row--checkbox-selected):not(.table-panel__sub-row--checkbox-rejected) {
  position: relative;
}

/* Optional: Show similarity score in tooltip */
.table-panel__similarity-score-indicator {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 11px;
  color: #888;
  background: rgba(102, 126, 234, 0.1);
  padding: 2px 6px;
  border-radius: 3px;
}
```

---

## Phase 6: Testing & Validation

### 6.1 Backend Testing

Create test script: `backend/test_similarity_sort.py`

```python
import requests
import json

BASE_URL = "http://localhost:8003"

# Test 1: Basic similarity sort
def test_basic_similarity_sort():
    payload = {
        "selected_ids": [1, 5, 10],
        "rejected_ids": [50, 100],
        "feature_ids": list(range(1, 825))
    }

    response = requests.post(f"{BASE_URL}/api/similarity-sort", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert "sorted_features" in data
    assert len(data["sorted_features"]) > 0

    print("✓ Basic similarity sort works")

# Test 2: Edge case - only selected features
def test_only_selected():
    payload = {
        "selected_ids": [1, 2, 3],
        "rejected_ids": [],
        "feature_ids": list(range(1, 20))
    }

    response = requests.post(f"{BASE_URL}/api/similarity-sort", json=payload)
    assert response.status_code == 200
    print("✓ Only selected features works")

# Test 3: Verify weights sum to 1
# (Add to service directly)

if __name__ == "__main__":
    test_basic_similarity_sort()
    test_only_selected()
    print("\n✅ All backend tests passed!")
```

### 6.2 Frontend Testing

Manual testing checklist:
- [ ] Button disabled when 0 or 1 features selected
- [ ] Button enabled when 2+ features selected
- [ ] Loading spinner shows during API call
- [ ] Active state indicator shows when similarity sort applied
- [ ] Table correctly shows: ✓ features → scored features → ✗ features
- [ ] Tooltip shows selection counts
- [ ] Sort persists when changing filters
- [ ] Can switch to other sort modes and back
- [ ] Re-clicking button recalculates with new selections

---

## File Changes Summary

### NEW Files (4)
1. `backend/app/models/similarity_sort.py`
2. `backend/app/services/similarity_sort_service.py`
3. `backend/app/api/similarity_sort.py`
4. `SIMILARITY_SORT_PLAN.md` (this document)

### MODIFIED Files (7)
1. `backend/app/api/__init__.py` - Register similarity sort router
2. `frontend/src/types.ts` - Add similarity types
3. `frontend/src/api.ts` - Add getSimilaritySort function
4. `frontend/src/store/index.ts` - Add similarity state
5. `frontend/src/store/table-actions.ts` - Add sortBySimilarity action
6. `frontend/src/components/QualityTablePanel.tsx` - Add button and sorting logic
7. `frontend/src/styles/QualityTablePanel.css` - Add button styles

---

## Data Requirements

### Metrics Mapping to Dataset

Need to verify availability and extract these metrics from the dataset:

1. ✅ **decoder_similarity** - Available in `feature_analysis.parquet`
2. ✅ **char_ngram_max_jaccard** - In activation examples
3. ✅ **word_ngram_max_jaccard** - In activation examples
4. ✅ **semantic_similarity** (intra) - In activation examples
5. ❓ **inter_ngram_jaccard** - Need to verify availability
6. ✅ **inter_semantic_sim** - From explainer semantic_similarity
7. ✅ **score_embedding** - In feature_analysis
8. ✅ **score_fuzz** - In feature_analysis (avg of s1, s2, s3)
9. ✅ **score_detection** - In feature_analysis (avg of s1, s2, s3)

### Metric Extraction Strategy

```python
# For each feature:
metrics = {
    'decoder_similarity': len(feature.decoder_similarity) if feature.decoder_similarity else 0,
    'intra_ngram_jaccard': max(activation.char_ngram_max_jaccard, activation.word_ngram_max_jaccard),
    'intra_semantic_sim': activation.semantic_similarity,
    'inter_ngram_jaccard': calculate_max_inter_ngram_jaccard(feature),
    'inter_semantic_sim': calculate_avg_inter_semantic_sim(feature),
    'embed_score': feature.score_embedding,
    'fuzz_score': avg(feature.score_fuzz_s1, s2, s3),
    'detection_score': avg(feature.score_detection_s1, s2, s3),
    'llm_explainer_semantic_sim': calculate_explainer_semantic_sim(feature)
}
```

---

## Implementation Notes

### Performance Considerations
- Pre-load all metrics for all features (824 features)
- Cache std and weights calculation (only depends on dataset)
- Optimize numpy operations for distance calculations
- Consider caching results for same selection sets

### Error Handling
- Handle missing metrics gracefully (use 0 or median)
- Validate feature IDs exist in dataset
- Return meaningful errors for invalid requests
- Frontend should show error toast on API failure

### Future Enhancements
- Add option to show similarity scores in table column
- Allow user to adjust metric weights interactively
- Export sorted results to CSV
- Visualize feature similarity as heatmap
- Add "Find similar" action from right-click menu

---

## Timeline

1. **Backend (1-1.5 hours)**
   - Models: 15 min
   - Service: 45 min
   - API: 15 min
   - Testing: 15 min

2. **Frontend (1-1.5 hours)**
   - Types & API: 15 min
   - State & Actions: 30 min
   - UI Components: 30 min
   - Styling: 15 min

3. **Testing & Refinement (30 min)**
   - Integration testing
   - UI polish
   - Bug fixes

**Total Estimated Time**: 2-3 hours

---

## Success Criteria

- ✅ Button appears and enables/disables correctly
- ✅ API returns sorted features with scores
- ✅ Table displays three-tier sorting correctly
- ✅ Loading state shows during computation
- ✅ Active indicator shows when similarity sort applied
- ✅ Performance: API response < 500ms for 824 features
- ✅ No errors in console
- ✅ Sort persists until manually changed

---

**Status**: Ready for implementation
**Created**: 2025-11-08
**Author**: Claude Code
