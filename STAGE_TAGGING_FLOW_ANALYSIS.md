# Stage 1 vs Stage 2 Tagging Flow Analysis

A detailed comparison of how tagging actions affect views and data flow between Stage 1 (Feature Splitting) and Stage 2 (Quality Assessment).

---

## Overview

| Aspect | Stage 1 (FeatureSplitView) | Stage 2 (QualityView) |
|--------|---------------------------|----------------------|
| **Mode** | `pair` | `feature` |
| **Items** | Feature pairs (pairKey: `"${id1}-${id2}"`) | Individual features (featureId: `number`) |
| **Tags** | Fragmented / Monosemantic | Well-Explained / Need Revision |
| **Selection State Store** | `pairSelectionStates` | `featureSelectionStates` |
| **Actions File** | `feature-split-actions.ts` | `quality-actions.ts` |

---

## 1. Selection State Management

### Store State Structures

**Stage 1 (Pairs):**
```typescript
// store/index.ts
pairSelectionStates: Map<string, 'selected' | 'rejected'>  // Key: "mainId-similarId"
pairSelectionSources: Map<string, 'manual' | 'auto'>
```

**Stage 2 (Features):**
```typescript
// store/index.ts
featureSelectionStates: Map<number, 'selected' | 'rejected'>  // Key: featureId
featureSelectionSources: Map<number, 'manual' | 'auto'>
```

### Toggle Selection Logic

Both stages use a 3-state cycle: `null → selected → rejected → null`

**Stage 1 - FeatureSplitPairViewer.tsx (lines 136-199):**
```typescript
const handleFragmentedClick = () => {
  if (pairSelectionState === 'selected') {
    // Toggle off: call togglePairSelection 3 times
    togglePairSelection(currentPair.mainFeatureId, currentPair.similarFeatureId)
    togglePairSelection(currentPair.mainFeatureId, currentPair.similarFeatureId)
    togglePairSelection(currentPair.mainFeatureId, currentPair.similarFeatureId)
  } else if (pairSelectionState === null) {
    togglePairSelection(...)  // null → selected
  } else if (pairSelectionState === 'rejected') {
    // rejected → null → selected (2 calls)
    togglePairSelection(...)
    togglePairSelection(...)
  }
  // Auto-advance if enabled
}
```

**Stage 2 - QualityView.tsx (lines 398-464):**
```typescript
const handleWellExplainedClick = () => {
  if (currentSelectionState === 'selected') {
    // Toggle off: selected → rejected → null (2 calls)
    toggleFeatureSelection(featureId)
    toggleFeatureSelection(featureId)
  } else if (currentSelectionState === null) {
    toggleFeatureSelection(featureId)  // null → selected
  } else if (currentSelectionState === 'rejected') {
    // rejected → null → selected (2 calls)
    toggleFeatureSelection(featureId)
    toggleFeatureSelection(featureId)
  }
  // Auto-advance if enabled
}
```

**Key Difference:** The toggle-off logic requires different number of calls due to different cycle handling for pairs vs features.

---

## 2. SVM Similarity Scoring

Both stages use SVM-based similarity scoring, but the data flow differs.

### API Calls

**Stage 1 - feature-split-actions.ts (sortPairsBySimilarity):**
```typescript
// Lines 92-202
sortPairsBySimilarity: async (allPairKeys: string[]) => {
  // Extract manual selections only
  pairSelectionStates.forEach((state, pairKey) => {
    const source = pairSelectionSources.get(pairKey)
    if (source === 'manual') {
      if (state === 'selected') selectedPairKeys.push(pairKey)
      else if (state === 'rejected') rejectedPairKeys.push(pairKey)
    }
  })

  // Call pair-specific API
  const response = await api.getPairSimilaritySort(
    selectedPairKeys,
    rejectedPairKeys,
    allPairKeys
  )

  // Store in pair-specific state
  set({
    pairSimilarityScores: scoresMap,  // Map<string, number>
    lastPairSortedSelectionSignature: selectionSignature
  })
}
```

**Stage 2 - quality-actions.ts (sortBySimilarity):**
```typescript
// Lines 15-122
sortBySimilarity: async () => {
  // Extract manual selections only
  featureSelectionStates.forEach((state, featureId) => {
    const source = featureSelectionSources.get(featureId)
    if (source === 'manual') {
      if (state === 'selected') selectedIds.push(featureId)
      else if (state === 'rejected') rejectedIds.push(featureId)
    }
  })

  // Get all feature IDs from table data
  const allFeatureIds = tableData.features.map(f => f.feature_id)

  // Call feature-specific API
  const response = await api.getSimilaritySort(
    selectedIds,
    rejectedIds,
    allFeatureIds
  )

  // Store in feature-specific state
  set({
    similarityScores: scoresMap,  // Map<number, number>
    lastSortedSelectionSignature: selectionSignature
  })
}
```

### Auto-Triggering Similarity Scores

Both views auto-compute scores when selection changes:

**Stage 1 - FeatureSplitView.tsx (lines 287-319):**
```typescript
useEffect(() => {
  if (isPairSimilaritySortLoading) return  // Prevent duplicate calls

  // Compute signature from manual selections
  const currentSignature = `selected:${currentSelectedKeys.sort().join(',')}|rejected:${currentRejectedKeys.sort().join(',')}`
  const scoresAreStale = lastPairSortedSelectionSignature !== currentSignature

  if (hasRequiredSelections && needsScores) {
    const allPairKeys = pairList.map(p => p.pairKey)
    sortPairsBySimilarity(allPairKeys)
  }
}, [pairList, pairSelectionStates, pairSelectionSources, ...])
```

**Stage 2 - QualityView.tsx (lines 169-195):**
```typescript
useEffect(() => {
  // Compute signature from manual selections
  const currentSignature = `selected:${currentSelectedIds.sort().join(',')}|rejected:${currentRejectedIds.sort().join(',')}`
  const scoresAreStale = lastSortedSelectionSignature !== currentSignature

  if (hasRequiredSelections && needsScores) {
    sortBySimilarity()
  }
}, [featureList, featureSelectionStates, featureSelectionSources, ...])
```

**Key Difference:** Stage 1 passes `allPairKeys` explicitly, Stage 2 gets feature IDs from `tableData` inside the action.

---

## 3. TagAutomaticPanel (Histogram) Behavior

The same `TagAutomaticPanel` component is used in both stages but with different `mode` prop.

### Histogram Data Fetching

**Stage 1 (mode='pair') - TagAutomaticPanel.tsx (lines 158-169):**
```typescript
if (mode === 'pair') {
  // Uses fetchSimilarityHistogram from store
  const result = await fetchSimilarityHistogram(filteredFeatureIds, threshold)
  // Backend generates pairs via clustering
}
```

**Stage 2 (mode='feature') - TagAutomaticPanel.tsx (lines 173-216):**
```typescript
if (mode === 'feature') {
  // Extract feature selections
  featureSelectionStates.forEach((state, featureId) => {
    if (filteredFeatureIds && !filteredFeatureIds.has(featureId)) return
    // Only count manual selections
  })

  // Call feature-specific API directly
  const histogramResponse = await api.getSimilarityScoreHistogram(
    selectedIds,
    rejectedIds,
    allFeatureIds
  )
}
```

### Category Breakdown per Bin

**TagAutomaticPanel.tsx (lines 278-363):**
```typescript
if (mode === 'feature') {
  const featureId = parseInt(id, 10)
  const selectionState = featureSelectionStates.get(featureId)
  const source = featureSelectionSources.get(featureId)
  // Categorize into: confirmed, expanded, rejected, autoRejected, unsure
} else {
  // Pair mode - only count pairs in availablePairs or filteredFeatureIds
  if (availablePairs) {
    const pairExists = availablePairs.some(p => p.pairKey === id)
    if (!pairExists) return  // Skip if not in cluster
  }
  const selectionState = pairSelectionStates.get(id)
  // Same categorization logic
}
```

---

## 4. Boundary Items Computation

### ThresholdTaggingPanel Integration

**Stage 1 - FeatureSplitView.tsx (lines 369-457):**
```typescript
const boundaryItems = useMemo(() => {
  // Build pairs from allClusterPairs
  const allPairs = allClusterPairs
    .filter(p => selectedFeatureIds.has(p.main_id) && selectedFeatureIds.has(p.similar_id))
    .map(p => ({
      mainFeatureId: p.main_id,
      similarFeatureId: p.similar_id,
      pairKey: p.pair_key,
      ...
    }))

  // Filter by SVM scores
  const pairsWithScores = allPairs.filter(pair => pairSimilarityScores.has(pair.pairKey))

  // REJECT: pairs < rejectThreshold, sorted descending
  const rejectBelow = pairsWithScores
    .filter(pair => pairSimilarityScores.get(pair.pairKey)! < thresholds.reject)
    .sort((a, b) => pairSimilarityScores.get(b.pairKey)! - pairSimilarityScores.get(a.pairKey)!)

  // SELECT: pairs >= selectThreshold, sorted ascending
  const selectAbove = pairsWithScores
    .filter(pair => pairSimilarityScores.get(pair.pairKey)! >= thresholds.select)
    .sort((a, b) => pairSimilarityScores.get(a.pairKey)! - pairSimilarityScores.get(b.pairKey)!)

  return { rejectBelow, selectAbove }
}, [pairList, tagAutomaticState, pairSimilarityScores, ...])
```

**Stage 2 - QualityView.tsx (lines 331-366):**
```typescript
const boundaryItems = useMemo(() => {
  // Filter features that have SVM scores
  const featuresWithScores = featureList.filter(f => similarityScores.has(f.featureId))

  // REJECT: features < rejectThreshold, sorted descending
  const rejectBelow = featuresWithScores
    .filter(f => similarityScores.get(f.featureId)! < rejectThreshold)
    .sort((a, b) => similarityScores.get(b.featureId)! - similarityScores.get(a.featureId)!)

  // SELECT: features >= selectThreshold, sorted ascending
  const selectAbove = featuresWithScores
    .filter(f => similarityScores.get(f.featureId)! >= selectThreshold)
    .sort((a, b) => similarityScores.get(a.featureId)! - similarityScores.get(b.featureId)!)

  return { rejectBelow, selectAbove }
}, [featureList, tagAutomaticState, similarityScores])
```

**Key Difference:** Stage 1 needs to build pairs from cluster data, Stage 2 works directly with feature list.

---

## 5. Apply Tags Flow

### applySimilarityTags Action

**Stage 1 - feature-split-actions.ts (lines 489-566):**
```typescript
applySimilarityTags: () => {
  const scores = histogramData.scores
  const newPairSelectionStates = new Map(pairSelectionStates)
  const newPairSelectionSources = new Map(pairSelectionSources)

  Object.entries(scores).forEach(([pairKey, score]) => {
    // Skip if already tagged
    if (pairSelectionStates.has(pairKey)) return

    if (score >= selectThreshold) {
      newPairSelectionStates.set(pairKey, 'selected')
      newPairSelectionSources.set(pairKey, 'manual')  // Treated as manual!
    } else if (score <= rejectThreshold) {
      newPairSelectionStates.set(pairKey, 'rejected')
      newPairSelectionSources.set(pairKey, 'manual')
    }
  })

  set({ pairSelectionStates: ..., pairSelectionSources: ... })

  // Clear histogram to trigger refetch (NOT set to null)
  set({ tagAutomaticState: { ...tagAutomaticState, histogramData: null } })
}
```

**Stage 2 - quality-actions.ts (lines 271-342):**
```typescript
applySimilarityTags: () => {
  const scores = histogramData.scores
  const newSelectionStates = new Map(featureSelectionStates)
  const newSelectionSources = new Map(featureSelectionSources)

  Object.entries(scores).forEach(([idStr, score]) => {
    const featureId = parseInt(idStr, 10)

    // Skip if already tagged
    if (featureSelectionStates.has(featureId)) return

    if (score >= selectThreshold) {
      newSelectionStates.set(featureId, 'selected')
      newSelectionSources.set(featureId, 'auto')  // Treated as auto!
    } else if (score <= rejectThreshold) {
      newSelectionStates.set(featureId, 'rejected')
      newSelectionSources.set(featureId, 'auto')
    }
  })

  set({ featureSelectionStates: ..., featureSelectionSources: ... })

  // Close popover after applying
  set({ tagAutomaticState: null })
}
```

**Critical Difference:**
- Stage 1 marks applied tags as `'manual'` (confirmed by user clicking Apply)
- Stage 2 marks applied tags as `'auto'` (distinguishes from direct user selection)

---

## 6. Commit History System

Both stages maintain commit history for undo/restore functionality.

### Commit Types

**Stage 1 - FeatureSplitView.tsx (lines 22-28):**
```typescript
export interface TagCommit {
  id: number
  type: 'initial' | 'apply' | 'tagAll'
  pairSelectionStates: Map<string, SelectionState>
  pairSelectionSources: Map<string, SelectionSource>
  counts: CommitCounts  // For hover preview
}
```

**Stage 2 - QualityView.tsx (lines 29-34):**
```typescript
export interface QualityTagCommit {
  id: number
  type: 'initial' | 'apply' | 'tagAll'
  featureSelectionStates: Map<number, SelectionState>
  featureSelectionSources: Map<number, SelectionSource>
  // No counts field
}
```

### Commit Creation on Apply Tags

**Stage 1 - FeatureSplitView.tsx (lines 535-593):**
```typescript
const handleApplyTags = useCallback(() => {
  // 1. Switch to decision margin sort mode
  setSortMode('decisionMargin')

  // 2. Save current state to current commit
  setTagCommitHistory(prev => { ... })

  // 3. Apply auto-tags
  applySimilarityTags()

  // 4. Create new commit with counts
  setTimeout(() => {
    const currentCounts = store.getFeatureSplittingCounts()
    const newCommit: TagCommit = {
      ...
      counts: {
        fragmented: currentCounts.fragmentedManual + currentCounts.fragmentedAuto,
        monosemantic: currentCounts.monosematicManual + currentCounts.monosematicAuto,
        unsure: currentCounts.unsure,
        total: currentCounts.total
      }
    }
  }, 0)

  // 5. Reset navigation
  setCurrentPairIndex(0)
  setActiveListSource('all')
}, [...])
```

**Stage 2 - QualityView.tsx (lines 513-555):**
```typescript
const handleApplyTags = useCallback(() => {
  // 1. Save current state to current commit
  setTagCommitHistory(prev => { ... })

  // 2. Apply auto-tags
  applySimilarityTags()

  // 3. Create new commit (no counts)
  setTimeout(() => {
    const newCommit: QualityTagCommit = {
      ...
      featureSelectionStates: new Map(store.featureSelectionStates),
      featureSelectionSources: new Map(store.featureSelectionSources)
    }
  }, 0)

  // 4. Switch sort mode and reset
  setSortMode('decisionMargin')
  setCurrentFeatureIndex(0)
  setActiveListSource('all')
}, [...])
```

---

## 7. Tag All Flow

### Tag All Options

Both stages provide two "Tag All" options:
1. **Tag remaining as left category** (Monosemantic / Need Revision)
2. **Tag by decision boundary** (score >= 0)

**Stage 1 - FeatureSplitView.tsx (handleTagAllMonosemantic, lines 638-708):**
```typescript
const handleTagAllMonosemantic = useCallback(() => {
  // Tag all untagged pairs as rejected
  pairList.forEach(pair => {
    if (!newStates.has(pair.pairKey)) {
      newStates.set(pair.pairKey, 'rejected')
      newSources.set(pair.pairKey, 'manual')
    }
  })

  // Create commit with counts
  // Save to global store for Stage 1 revisit
  setStage1FinalCommit({
    pairSelectionStates: new Map(newStates),
    pairSelectionSources: new Map(newSources),
    featureIds: selectedFeatureIds ? new Set(selectedFeatureIds) : new Set(),
    counts: commitCounts
  })
}, [...])
```

**Stage 2 - QualityView.tsx (handleTagAllNeedRevision, lines 597-641):**
```typescript
const handleTagAllNeedRevision = useCallback(() => {
  // Tag all untagged features as rejected
  featureList.forEach(f => {
    if (!newStates.has(f.featureId)) {
      newStates.set(f.featureId, 'rejected')
      newSources.set(f.featureId, 'manual')
    }
  })

  restoreFeatureSelectionStates(newStates, newSources)

  // Create commit (no counts, no global save)
}, [...])
```

**Key Difference:** Stage 1 saves final commit to global store (`setStage1FinalCommit`) for revisiting from Stage 2+.

---

## 8. Stage 1 Revisiting Flow

Stage 1 has special logic to restore state when returning from later stages.

**FeatureSplitView.tsx (lines 86-109):**
```typescript
// Restore from saved commit when revisiting Stage 1
useEffect(() => {
  if (isRevisitingStage1 && stage1FinalCommit) {
    // Initialize history with saved commit
    const restoredCommit: TagCommit = {
      id: 1,
      type: 'tagAll',
      pairSelectionStates: new Map(stage1FinalCommit.pairSelectionStates),
      pairSelectionSources: new Map(stage1FinalCommit.pairSelectionSources),
      counts: stage1FinalCommit.counts || { ... }
    }

    setTagCommitHistory([
      { id: 0, type: 'initial', ... },
      restoredCommit
    ])
    setCurrentCommitIndex(1)

    // Restore pair selection states to store
    restorePairSelectionStates(...)
  }
}, [isRevisitingStage1, stage1FinalCommit, ...])
```

**Stage 2 has no equivalent** - it doesn't save state for revisiting.

---

## 9. Feature ID Source Differences

### Stage 1 - Uses Cluster-Based Pairs

**FeatureSplitView.tsx (lines 116-131):**
```typescript
const selectedFeatureIds = useMemo(() => {
  // If revisiting, use stored feature IDs
  if (isRevisitingStage1 && stage1FinalCommit?.featureIds) {
    return stage1FinalCommit.featureIds
  }

  // Otherwise get from Sankey segment selection
  return getSelectedNodeFeatures()
}, [...])
```

**Then fetches pairs via clustering:**
```typescript
// Lines 176-192
useEffect(() => {
  if (selectedFeatureIds && selectedFeatureIds.size > 0 && !clusterGroups) {
    fetchAllClusterPairs(featureIdsArray, clusteringThreshold)
  }
}, [selectedFeatureIds, clusterGroups, clusterThreshold, ...])
```

### Stage 2 - Uses Table Data Directly

**QualityView.tsx (lines 92-111):**
```typescript
const selectedFeatureIds = useMemo(() => {
  const features = getSelectedNodeFeatures()
  return features
}, [...])

// Filter tableData to selected features
const filteredTableData = useMemo(() => {
  if (!tableData?.features || !selectedFeatureIds) return null

  return {
    rows: tableData.features.filter(row => selectedFeatureIds.has(row.feature_id))
  }
}, [tableData, selectedFeatureIds])
```

---

## 10. ThresholdTaggingPanel Props Differences

**Stage 1 - FeatureSplitView.tsx (lines 871-893):**
```typescript
<ThresholdTaggingPanel
  mode="pair"
  tagCategoryId={TAG_CATEGORY_FEATURE_SPLITTING}
  leftItems={boundaryItems.rejectBelow}      // PairItemWithMetadata[]
  rightItems={boundaryItems.selectAbove}     // PairItemWithMetadata[]
  leftListLabel="Monosemantic"
  rightListLabel="Fragmented"
  histogramProps={{
    availablePairs: pairList,                 // For filtering histogram
    filteredFeatureIds: selectedFeatureIds,
    threshold: clusteringThreshold
  }}
  nextStageName="Quality"
  nextStageNumber={2}
  ...
/>
```

**Stage 2 - QualityView.tsx (lines 942-962):**
```typescript
<ThresholdTaggingPanel
  mode="feature"
  tagCategoryId={TAG_CATEGORY_QUALITY}
  leftFeatures={boundaryItems.rejectBelow}   // FeatureItemWithMetadata[]
  rightFeatures={boundaryItems.selectAbove}  // FeatureItemWithMetadata[]
  leftListLabel="Need Revision"
  rightListLabel="Well-Explained"
  histogramProps={{
    filteredFeatureIds: selectedFeatureIds   // No availablePairs needed
  }}
  nextStageName="Root Cause"
  nextStageNumber={3}
  ...
/>
```

---

## 11. Feature Counts Computation

### Stage 1 - Derived from Pair States

**feature-split-actions.ts (getFeatureSplittingCounts, lines 21-87):**
```typescript
getFeatureSplittingCounts: () => {
  // Track features by examining ALL pairs
  for (const pair of allClusterPairs) {
    if (!filteredFeatureIds.has(pair.main_id) || !filteredFeatureIds.has(pair.similar_id)) continue

    const pairState = pairSelectionStates.get(pair.pair_key)
    const pairSource = pairSelectionSources.get(pair.pair_key)

    if (pairState === 'selected') {
      // Both features in pair are fragmented
      for (const id of [pair.main_id, pair.similar_id]) {
        fragmentedFeatures.set(id, pairSource)
      }
    } else if (pairState === 'rejected') {
      // Both features are monosemantic
      for (const id of [pair.main_id, pair.similar_id]) {
        monosematicFeatures.set(id, pairSource)
      }
    }
  }

  // Count with priority: fragmented > monosemantic > unsure
  for (const featureId of filteredFeatureIds) {
    if (fragmentedFeatures.has(featureId)) fragmented++
    else if (monosematicFeatures.has(featureId)) monosemantic++
    else unsure++
  }
}
```

### Stage 2 - Direct from Feature States

```typescript
// No equivalent complex computation - just count featureSelectionStates directly
```

---

## Summary: Key Architectural Differences

| Aspect | Stage 1 (Pairs) | Stage 2 (Features) |
|--------|-----------------|-------------------|
| **Item Type** | Pair (2 features) | Single feature |
| **Key Format** | String `"id1-id2"` | Number `featureId` |
| **Data Source** | Cluster-based pairs from API | Table data directly |
| **Count Computation** | Complex: derives from pairs | Simple: direct count |
| **Apply Tags Source** | `'manual'` | `'auto'` |
| **Global State Save** | Yes (`stage1FinalCommit`) | No |
| **Revisiting Support** | Yes | No |
| **Histogram Props** | Needs `availablePairs`, `threshold` | Only `filteredFeatureIds` |
| **Sort Trigger** | Needs explicit `allPairKeys` | Gets from `tableData` |
| **Commit Counts** | Yes (for hover preview) | No |

---

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        STAGE 1: FEATURE SPLITTING                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  selectedFeatureIds ──→ fetchAllClusterPairs() ──→ allClusterPairs         │
│                                    ↓                                        │
│                              rawPairList                                    │
│                                    ↓                                        │
│  Manual Tag ──→ pairSelectionStates ──→ sortPairsBySimilarity()            │
│                                              ↓                              │
│                                    pairSimilarityScores                     │
│                                              ↓                              │
│  TagAutomaticPanel (mode='pair') ←──────────┘                              │
│         ↓                                                                   │
│  Apply Tags ──→ applySimilarityTags() ──→ pairSelectionStates (manual)     │
│         ↓                                                                   │
│  Tag All ──→ setStage1FinalCommit() ──→ Global Store (for revisit)         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↓
                           Move to Next Step
                                    ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                        STAGE 2: QUALITY ASSESSMENT                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  selectedFeatureIds ──→ Filter tableData ──→ filteredTableData             │
│                                    ↓                                        │
│                              featureList                                    │
│                                    ↓                                        │
│  Manual Tag ──→ featureSelectionStates ──→ sortBySimilarity()              │
│                                                   ↓                         │
│                                         similarityScores                    │
│                                                   ↓                         │
│  TagAutomaticPanel (mode='feature') ←────────────┘                         │
│         ↓                                                                   │
│  Apply Tags ──→ applySimilarityTags() ──→ featureSelectionStates (auto)    │
│         ↓                                                                   │
│  Tag All ──→ (no global save)                                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Shared Components with Mode-Specific Behavior

### 1. ThresholdTaggingPanel
- Renders different item types based on `mode`
- Uses `leftItems`/`rightItems` for pairs, `leftFeatures`/`rightFeatures` for features
- Delegates to TagAutomaticPanel with correct mode

### 2. TagAutomaticPanel
- Fetches histogram differently per mode
- Filters scores per mode (pairs need cluster filtering)
- Uses different selection state stores per mode

### 3. ScrollableItemList
- Same component, different `renderItem` functions
- Stage 1: renders pair badges
- Stage 2: renders feature badges

### 4. SelectionPanel
- Same component with `mode` prop
- Reads from different selection state stores
- Shows different commit history types
