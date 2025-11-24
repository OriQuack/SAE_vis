# Feature-Pair Filtering Fix: Comprehensive Plan

## Problem Statement

The FeatureSplitView component has inconsistent filtering logic:
- Sankey segments select **features** above threshold
- Selection panel/bar shows **pairs**
- Mismatch occurs because pairs are not properly filtered by selected features
- Histogram and candidates show ALL pairs instead of filtered pairs

## Desired Behavior

1. **Sankey Selection** → Select features above threshold
2. **Clustering** → Each feature belongs to a cluster
   - Cluster size = 2: Create 1 pair
   - Cluster size > 2: Create all pairwise combinations
3. **Selection Bar** → Show number of pairs (with feature count in tooltip)
4. **Histogram** → Filter by pairs from selected features only
5. **Candidates** → Filter by pairs from selected features only

## Root Causes Identified

### 1. **Inconsistent Pair Filtering**
- `buildClusterPairs()` doesn't validate that all pair features are in selection
- `TagAutomaticPanel` counts ALL histogram pairs (no filtering)
- `SelectionPanel` preview DOES filter correctly
- Three different pair-counting methods conflict

### 2. **Multiple Sources of Truth**
- Cluster-based pairs (main display)
- Decoder-similarity pairs (selection bar counting)
- Histogram pairs (auto-tagging)
- No single source for "what pairs exist for this selection"

### 3. **Missing Validation**
- No check that cluster features are in `selectedFeatureIds`
- Pairs can reference features not in `filteredTableData`
- Histogram doesn't validate pair membership

## Solution Architecture

### Core Principle: Single Source of Truth for Pairs

```
selectedFeatureIds (from Sankey)
         ↓
   clusterGroups (from backend)
         ↓
   validClusterPairs (filtered frontend)
         ↓
   ├─→ pairList (display)
   ├─→ selectionBar (counts)
   └─→ histogram (binning)
```

All three consumers use the SAME filtered pair list.

## Implementation Plan: 5 Sub-Problems

---

## Sub-Problem 1: Create Centralized Pair Utilities

**Goal**: Eliminate redundant pair key generation and validation logic

### Files to Modify:
- `frontend/src/lib/pairUtils.ts` (NEW FILE)

### Tasks:
1. **Create utility functions**:
   ```typescript
   // Get canonical pair key (smaller ID first)
   export function getCanonicalPairKey(id1: number, id2: number): string

   // Parse pair key into [id1, id2]
   export function parsePairKey(pairKey: string): [number, number]

   // Check if both features in pair are in selection
   export function isPairInSelection(
     pairKey: string,
     selectedFeatureIds: Set<number>
   ): boolean

   // Generate all pairwise combinations from feature list
   export function generatePairwiseCombinations(
     featureIds: number[]
   ): Array<[number, number]>
   ```

2. **Add TypeScript types**:
   ```typescript
   export interface FeaturePair {
     mainFeatureId: number
     similarFeatureId: number
     pairKey: string
     clusterId?: number
     decoderSimilarity?: number
   }
   ```

### Success Criteria:
- All pair key generation uses `getCanonicalPairKey()`
- All pair validation uses `isPairInSelection()`
- No duplicate pair key logic anywhere

---

## Sub-Problem 2: Fix Cluster Pair Generation

**Goal**: Ensure `buildClusterPairs()` only generates pairs where BOTH features are in selection

### Files to Modify:
- `frontend/src/components/FeatureSplitView.tsx`

### Tasks:
1. **Update `buildClusterPairs()` signature**:
   ```typescript
   function buildClusterPairs(
     tableData: { rows: FeatureTableRow[] },
     clusterGroups: ClusterGroup[],
     selectedFeatureIds: Set<number>  // ← ADD THIS
   ): FeaturePairWithDetails[]
   ```

2. **Add filtering inside loop**:
   ```typescript
   for (const cluster of clusterGroups) {
     // FILTER: Only features in selection
     const validFeatures = cluster.feature_ids.filter(id =>
       selectedFeatureIds.has(id)
     )

     // Skip clusters with < 2 valid features
     if (validFeatures.length < 2) continue

     // Generate pairs only from valid features
     for (let i = 0; i < validFeatures.length; i++) {
       for (let j = i + 1; j < validFeatures.length; j++) {
         const id1 = validFeatures[i]
         const id2 = validFeatures[j]

         // Use utility function
         const pairKey = getCanonicalPairKey(id1, id2)

         // Verify both features have table rows
         const mainRow = rowMap.get(id1)
         const similarRow = rowMap.get(id2)
         if (!mainRow || !similarRow) continue

         pairs.push({ /* ... */ })
       }
     }
   }
   ```

3. **Update useMemo call**:
   ```typescript
   const pairList = useMemo(() => {
     if (!filteredTableData) return []
     if (clusterGroups && clusterGroups.length > 0) {
       return buildClusterPairs(
         filteredTableData,
         clusterGroups,
         selectedFeatureIds  // ← ADD THIS
       )
     }
     return []
   }, [filteredTableData, clusterGroups, selectedFeatureIds])
   ```

### Success Criteria:
- All pairs in `pairList` have both features in `selectedFeatureIds`
- Clusters with < 2 valid features are skipped
- No pairs reference missing table rows

---

## Sub-Problem 3: Fix Histogram Pair Filtering

**Goal**: Ensure histogram only counts pairs from selected features

### Files to Modify:
- `frontend/src/components/TagAutomaticPanel.tsx`

### Tasks:
1. **Add `filteredFeatureIds` prop**:
   ```typescript
   interface TagAutomaticPanelProps {
     // ... existing props ...
     filteredFeatureIds?: Set<number>  // ← ADD THIS
   }
   ```

2. **Update `categoryData` calculation** (lines 181-256):
   ```typescript
   const categoryData = useMemo(() => {
     // ... existing setup ...

     Object.entries(scores).forEach(([pairKey, score]) => {
       if (typeof score !== 'number') return

       // ADD FILTERING: Skip pairs outside selection
       if (filteredFeatureIds &&
           !isPairInSelection(pairKey, filteredFeatureIds)) {
         return
       }

       // ... rest of binning logic ...
     })

     return categoryMap
   }, [
     histogramChart,
     histogramData,
     mode,
     filteredFeatureIds,  // ← ADD DEPENDENCY
     // ... other deps ...
   ])
   ```

3. **Update parent component calls**:
   - In `SelectionPanel.tsx`:
     ```typescript
     <TagAutomaticPanel
       {...otherProps}
       filteredFeatureIds={filteredFeatureIds}  // ← ADD THIS
     />
     ```

### Success Criteria:
- Histogram bins only count pairs in selection
- Total histogram pair count matches filtered pair count
- Consistent with `SelectionPanel` preview filtering

---

## Sub-Problem 4: Unify Selection Bar Pair Counting

**Goal**: Make selection bar count cluster-based pairs (not decoder-similarity pairs)

### Files to Modify:
- `frontend/src/components/SelectionPanel.tsx`
- `frontend/src/store/index.ts`

### Current Problem:
Selection bar counts decoder-similarity pairs (top-4), but display shows cluster pairs.

### Decision Point: Which Pair Source Should Be Canonical?

**Option A: Cluster-based pairs** (RECOMMENDED)
- ✅ Matches what's displayed in FeatureSplitView
- ✅ Based on proper hierarchical clustering
- ✅ Configurable threshold
- ❌ Requires backend call

**Option B: Decoder-similarity pairs**
- ✅ Pre-computed in table data
- ✅ No backend call needed
- ❌ Doesn't match display
- ❌ Limited to top-4 per feature

**Recommendation**: Use cluster-based pairs as canonical source.

### Tasks:

#### Option 1: Pass cluster pairs to SelectionPanel
```typescript
// In FeatureSplitView.tsx
<SelectionPanel
  {...otherProps}
  mode="pair"
  availablePairs={pairList}  // ← ADD: Cluster-based pairs
/>

// In SelectionPanel.tsx
interface SelectionPanelProps {
  availablePairs?: FeaturePairWithDetails[]  // ← ADD THIS
}

// Update counting logic (lines 251-298)
if (mode === 'pair') {
  if (availablePairs) {
    // Count from cluster pairs (matches display)
    availablePairs.forEach(pair => {
      const selectionState = pairSelectionStates.get(pair.pairKey)
      // ... count logic ...
    })
  } else {
    // Fallback to decoder-similarity if no cluster pairs
    // ... existing logic ...
  }
}
```

#### Option 2: Store cluster pairs in global state
```typescript
// In store/index.ts
interface StoreState {
  // ... existing ...
  currentClusterPairs: FeaturePairWithDetails[] | null  // ← ADD
  setCurrentClusterPairs: (pairs: FeaturePairWithDetails[]) => void
}

// In FeatureSplitView.tsx
useEffect(() => {
  setCurrentClusterPairs(pairList)
}, [pairList, setCurrentClusterPairs])

// In SelectionPanel.tsx
const currentClusterPairs = useStore(state => state.currentClusterPairs)
// Use for counting...
```

**Recommendation**: Option 1 (prop-based) is simpler and more explicit.

### Success Criteria:
- Selection bar counts match displayed cluster pairs
- Tooltip shows feature count (unique features in pairs)
- Consistent with FeatureSplitView display

---

## Sub-Problem 5: Update Feature/Pair Count Display

**Goal**: Show pair count in selection bar with feature count in tooltip

### Files to Modify:
- `frontend/src/components/SelectionBar.tsx`

### Tasks:
1. **Calculate unique features from pairs**:
   ```typescript
   const uniqueFeatures = useMemo(() => {
     if (mode !== 'pair' || !availablePairs) return new Set<number>()

     const features = new Set<number>()
     availablePairs.forEach(pair => {
       features.add(pair.mainFeatureId)
       features.add(pair.similarFeatureId)
     })
     return features
   }, [mode, availablePairs])
   ```

2. **Update count display**:
   ```typescript
   // Main count: number of pairs
   const pairCount = availablePairs?.length ?? 0

   // Tooltip: "X pairs from Y features"
   const tooltipText = mode === 'pair'
     ? `${pairCount} pairs from ${uniqueFeatures.size} features`
     : `${selectedCount} features selected`
   ```

3. **Update visual indicator**:
   ```typescript
   <div className="selection-count" title={tooltipText}>
     {mode === 'pair' ? `${pairCount} pairs` : `${selectedCount} selected`}
   </div>
   ```

### Success Criteria:
- Shows "N pairs" in main display
- Tooltip shows "N pairs from M features"
- Updates correctly when selection changes

---

## Sub-Problem 6: Backend Optimization (OPTIONAL)

**Goal**: Remove unnecessary data from backend response

### Files to Modify:
- `backend/app/services/hierarchical_cluster_candidate_service.py`

### Tasks:
1. **Return only relevant feature_to_cluster mapping**:
   ```python
   # Instead of all 16k features, only return mapping for requested features
   feature_to_cluster = {
       feature_id: int(all_labels[feature_id])
       for feature_id in feature_ids  # ← Only requested features
   }
   ```

2. **Or remove feature_to_cluster entirely** if not used on frontend

### Success Criteria:
- Smaller response payload
- Faster JSON parsing
- No functional changes

**Note**: This is a minor optimization and can be done last.

---

## Implementation Order

### Phase 1: Foundation (Sub-Problems 1-2)
1. Create pair utilities (`lib/pairUtils.ts`)
2. Fix `buildClusterPairs()` filtering
3. Test: Verify pair list only contains selected features

### Phase 2: Histogram Filtering (Sub-Problem 3)
4. Add filtering to `TagAutomaticPanel`
5. Pass `filteredFeatureIds` from parent
6. Test: Verify histogram counts match filtered pairs

### Phase 3: Selection Bar Unification (Sub-Problems 4-5)
7. Pass cluster pairs to `SelectionPanel`
8. Update counting logic
9. Update display with feature count
10. Test: Verify counts match across all views

### Phase 4: Backend Optimization (Sub-Problem 6, OPTIONAL)
11. Optimize backend response
12. Test: Verify no regressions

---

## Testing Checklist

### Unit Tests
- [ ] `getCanonicalPairKey()` returns correct format
- [ ] `isPairInSelection()` validates correctly
- [ ] `generatePairwiseCombinations()` produces all pairs
- [ ] `buildClusterPairs()` filters by selection

### Integration Tests
- [ ] Sankey selection → correct pairs generated
- [ ] Histogram bins match filtered pairs
- [ ] Selection bar counts match displayed pairs
- [ ] Auto-tagging preview uses filtered pairs
- [ ] Tooltip shows correct feature count

### Edge Cases
- [ ] Single feature selected (no pairs)
- [ ] Cluster with only 1 valid feature after filtering
- [ ] All features in same cluster
- [ ] No clusters found (empty selection)
- [ ] Very large selection (performance test)

---

## Risk Assessment

### Low Risk
- Creating utility functions (no breaking changes)
- Adding optional props with fallbacks
- Backend optimization (purely internal)

### Medium Risk
- Changing pair counting logic (might affect existing tags)
- Modifying histogram filtering (changes displayed counts)

### High Risk
- None identified (all changes are additive with fallbacks)

---

## Rollback Plan

If issues occur:
1. **Utilities**: Can be removed without affecting existing code
2. **Filtering**: Can be made optional via feature flag
3. **Counting**: Can fall back to decoder-similarity method
4. **Backend**: Can revert to full `feature_to_cluster` mapping

---

## Success Metrics

### Correctness
- ✅ All pairs have both features in selection
- ✅ Histogram counts match pair list counts
- ✅ Selection bar counts match displayed pairs

### Consistency
- ✅ Single source of truth for pair generation
- ✅ No redundant filtering logic
- ✅ Unified pair key format

### Performance
- ✅ No regression in response times
- ✅ Filtering adds < 10ms overhead
- ✅ Smaller backend responses (if optimized)

### User Experience
- ✅ Pair counts make sense
- ✅ Tooltip provides clarity
- ✅ No confusing mismatches

---

## Next Steps

1. Review this plan with team
2. Confirm approach for Sub-Problem 4 (cluster pairs vs decoder-similarity)
3. Begin Phase 1 implementation
4. Test thoroughly at each phase
5. Monitor for edge cases in production use

---

## Notes

- This is a **research prototype**, not production code
- Focus on correctness over optimization
- Clean up any dead code encountered
- Document assumptions in comments
- Keep changes focused and testable

**Estimated Effort**: 4-6 hours across all sub-problems
**Recommended Approach**: Implement phase-by-phase with testing between phases
