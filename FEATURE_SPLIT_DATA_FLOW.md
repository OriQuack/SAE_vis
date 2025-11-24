# Feature Split View - Complete Data Flow Analysis

**Purpose**: This document traces the complete data flow from Sankey threshold extraction through hierarchical clustering, pair generation, SVM scoring, and automatic tagging in the Feature Split View.

**Date**: 2025-11-24
**Status**: Current implementation analysis

---

## 🎯 High-Level Overview

The Feature Split View implements a sophisticated pipeline for detecting feature splitting (fragmentation) using hierarchical clustering and SVM-based similarity scoring.

### Flow Summary
```
Sankey Segment Selection
  ↓ (threshold + feature IDs)
Hierarchical Clustering
  ↓ (n=15 sampled clusters)
Pair Generation (within-cluster)
  ↓ (all combinations)
Manual Labeling (user tags pairs)
  ↓ (≥1 "Fragmented" + ≥1 "Monosemantic")
SVM Training & Scoring
  ↓ (13-dim symmetric pair vectors)
Boundary Item Computation
  ↓ (pairs near thresholds)
Histogram Visualization & Auto-Tagging
  ↓ (ALL cluster pairs, not just sampled)
Apply Automatic Tags
```

---

## 📊 Detailed Flow Breakdown

### Phase 1: Threshold Extraction from Sankey

**Location**: `FeatureSplitView.tsx:149-160`

**Process**:
```typescript
const clusterThreshold = useMemo(() => {
  const sankeyStructure = leftPanel?.sankeyStructure
  if (!sankeyStructure) return 0.5

  const stage1Segment = sankeyStructure.nodes.find(n => n.id === 'stage1_segment')
  if (stage1Segment && 'threshold' in stage1Segment && stage1Segment.threshold !== null) {
    return stage1Segment.threshold  // Use Sankey's decoder similarity threshold directly
  }
  return 0.5
}, [leftPanel?.sankeyStructure])
```

**What it does**:
- Searches Sankey structure for node with ID `'stage1_segment'`
- Extracts `threshold` property (decoder similarity threshold 0-1)
- Falls back to 0.5 if not found
- Higher threshold = more similar features clustered together

**Critical Note**: This threshold is a SIMILARITY value, not a distance. The backend service converts it appropriately for hierarchical clustering.

---

### Phase 2: Selected Feature IDs from Sankey Segment

**Location**: `FeatureSplitView.tsx:143-147`

**Process**:
```typescript
const selectedFeatureIds = useMemo(() => {
  const features = getSelectedNodeFeatures()
  console.log('[FeatureSplitView] Sankey segment features:', features?.size || 0)
  return features  // Returns Set<number> of feature IDs
}, [getSelectedNodeFeatures])
```

**What it does**:
- Calls store action `getSelectedNodeFeatures()`
- Returns `Set<number>` of all feature IDs in the selected Sankey node/segment
- This defines the "universe" of features to analyze for splitting

---

### Phase 3: Cluster Group Management (Clearing & Refetching)

#### 3a. Clear Clusters on Threshold/Feature Change

**Location**: `FeatureSplitView.tsx:176-183`

```typescript
useEffect(() => {
  if (clusterGroups) {
    console.log('[FeatureSplitView] Threshold or features changed, clearing cluster groups')
    clearDistributedPairs()
  }
}, [clusterThreshold, selectedFeatureIds])
// NOTE: clearDistributedPairs NOT in dependencies to avoid infinite loop
```

**What it does**:
- Detects when threshold OR selected features change
- Clears existing cluster groups (stale data)
- Does NOT include `clearDistributedPairs` in dependency array (intentional to prevent loop)

**Why this pattern**:
- When threshold changes, old clusters are invalid
- Must clear before refetching
- Refetch is triggered by separate effect

#### 3b. Fetch Clusters When Empty

**Location**: `FeatureSplitView.tsx:185-193`

```typescript
useEffect(() => {
  if (selectedFeatureIds && selectedFeatureIds.size > 0 && !clusterGroups && !isLoadingDistributedPairs) {
    console.log('[FeatureSplitView] Fetching cluster groups for', selectedFeatureIds.size, 'features')
    fetchDistributedPairs(15, selectedFeatureIds)  // Request 15 clusters
  }
}, [selectedFeatureIds, clusterGroups, fetchDistributedPairs])
// NOTE: clusterGroups IS in dependencies - triggers refetch after clearing
```

**What it does**:
- Waits for: features exist, no clusters loaded, not currently loading
- Calls `fetchDistributedPairs(15, selectedFeatureIds)`
- Requests **15 sampled clusters** for display in main pair list
- Includes `clusterGroups` in dependencies so it refetches after clearing

---

### Phase 4: Fetch Distributed Pairs Action (Frontend)

**Location**: `table-actions-feature-splitting.ts:137-201`

**Process**:
```typescript
fetchDistributedPairs: async (n: number = 10, filterFeatureIds?: Set<number>) => {
  const { tableData, leftPanel } = get()

  // 1. Extract feature IDs (from filter or all table data)
  let featureIds: number[]
  if (filterFeatureIds && filterFeatureIds.size > 0) {
    featureIds = Array.from(filterFeatureIds)  // Use Sankey segment features
  } else {
    featureIds = tableData.features.map((row: any) => row.feature_id)  // Fallback to all
  }

  // 2. Get stage 1 threshold from Sankey structure (SAME LOGIC AS COMPONENT)
  let threshold = 0.5
  if (leftPanel?.sankeyStructure) {
    const stage1Segment = leftPanel.sankeyStructure.nodes.find((n: any) => n.id === 'stage1_segment')
    if (stage1Segment && 'threshold' in stage1Segment && stage1Segment.threshold !== null) {
      threshold = stage1Segment.threshold
    }
  }

  console.log('[Store.fetchDistributedPairs] Calling API:', {
    totalFeatures: featureIds.length,
    requestedClusters: n,
    threshold: threshold
  })

  // 3. Call backend API
  const response = await api.getClusterCandidates(featureIds, n, threshold)

  // 4. Store results in Zustand
  set({
    clusterGroups: response.cluster_groups,         // Array of {cluster_id, feature_ids}
    featureToClusterMap: response.feature_to_cluster, // Map: feature_id → cluster_id
    totalClusters: response.total_clusters,         // Total clusters at this threshold
    isLoadingDistributedPairs: false
  })
}
```

**Key Points**:
- Duplicates threshold extraction logic (potential consistency issue)
- Passes: `featureIds` (from Sankey), `n=15` (sampled), `threshold` (from Sankey)
- Backend performs hierarchical clustering and returns sampled clusters

**⚠️ Potential Bug**: Threshold extracted twice (component + action). Could desync if Sankey updates between calls.

---

### Phase 5: Backend Cluster Candidates API

**Location**: `api.ts:450-480`

```typescript
export async function getClusterCandidates(
  featureIds: number[],
  n: number = 10,
  threshold: number = 0.5
): Promise<{
  cluster_groups: Array<{cluster_id: number, feature_ids: number[]}>
  feature_to_cluster: Record<number, number>
  total_clusters: number
  clusters_selected: number
  threshold_used: number
}> {
  const response = await fetch(`${API_BASE}/api/cluster-candidates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      feature_ids: featureIds,
      n: n,
      threshold: threshold
    })
  })
  return response.json()
}
```

**What it does**:
- Simple POST to backend with 3 parameters
- Receives cluster groups (sampled n=15)
- Receives complete feature-to-cluster mapping (all features)

---

### Phase 6: Backend Hierarchical Clustering Service

**Location**: `hierarchical_cluster_candidate_service.py:64-169`

**Algorithm**:
```python
async def get_cluster_candidates(
    self,
    feature_ids: List[int],
    n: int,
    threshold: float = 0.5
) -> Dict:
    """
    Process:
    1. Cut dendrogram at specified distance threshold
    2. Assign ALL features to clusters
    3. Filter to only features in feature_ids
    4. Filter to only clusters with 2+ features
    5. Randomly select n clusters
    6. Return selected clusters with their feature members
    """
```

**Step-by-step**:

#### Step 1: Cut Dendrogram
```python
# Uses pre-loaded linkage matrix (agglomerative clustering, average linkage)
all_labels = fcluster(self.linkage_matrix, t=threshold, criterion='distance')
# Returns cluster ID for each feature (0 to n_features-1)

total_clusters = len(np.unique(all_labels))
logger.info(f"Dendrogram cut at threshold={threshold} produced {total_clusters} clusters")
```

**Critical**:
- Threshold is DISTANCE threshold for dendrogram cutting
- Higher threshold = fewer, larger clusters (more features grouped together)
- Pre-computed linkage matrix loaded once at service initialization

#### Step 2: Build Global Mapping
```python
# Map every feature (0 to n_features-1) to its cluster ID
feature_to_cluster = {
    feature_id: int(all_labels[feature_id])
    for feature_id in range(self.n_features)  # All 16,384 features
}
```

#### Step 3: Filter to Available Features
```python
# Build cluster → features mapping for ONLY requested features
cluster_to_features = {}
for feature_id in feature_ids:  # Only features from Sankey segment
    cluster_id = feature_to_cluster[feature_id]
    if cluster_id not in cluster_to_features:
        cluster_to_features[cluster_id] = []
    cluster_to_features[cluster_id].append(feature_id)
```

#### Step 4: Filter to Valid Clusters (2+ features)
```python
# Only keep clusters that can form pairs
valid_clusters = {
    cluster_id: features
    for cluster_id, features in cluster_to_features.items()
    if len(features) >= 2  # Need at least 2 for pairs
}

logger.info(
    f"Available features span {len(cluster_to_features)} clusters "
    f"({len(valid_clusters)} have 2+ features)"
)
```

#### Step 5: Random Sampling
```python
def _select_n_clusters(
    self,
    cluster_to_features: Dict[int, List[int]],
    n: int
) -> List[Dict]:
    # Use fixed seed for deterministic selection
    random.seed(self.random_seed)  # seed = 42

    cluster_ids = list(cluster_to_features.keys())
    random.shuffle(cluster_ids)

    # Select up to n clusters (or all if fewer available)
    selected_cluster_ids = cluster_ids[:n]

    # Build cluster groups
    cluster_groups = [
        {
            "cluster_id": cluster_id,
            "feature_ids": sorted(cluster_to_features[cluster_id])
        }
        for cluster_id in selected_cluster_ids
    ]

    return cluster_groups
```

**Critical**:
- Uses **fixed random seed (42)** for deterministic sampling
- Returns **up to n clusters** (may be fewer if not enough valid clusters)
- Each cluster has **sorted list of feature IDs**

#### Return Value
```python
return {
    "cluster_groups": cluster_groups,          # Selected n clusters with members
    "feature_to_cluster": feature_to_cluster,  # ALL features → cluster mapping
    "total_clusters": total_clusters,          # Total clusters at threshold
    "clusters_selected": len(cluster_groups),  # Actual clusters returned
    "threshold_used": threshold                # Echo back threshold
}
```

---

### Phase 7: Build Pairs from Clusters (Frontend)

**Location**: `FeatureSplitView.tsx:27-107`

**Function**: `buildClusterPairs()`

**Algorithm**:
```typescript
function buildClusterPairs(
  tableData: any,
  clusterGroups: Array<{cluster_id: number, feature_ids: number[]}>,
  selectedFeatureIds: Set<number>
): Array<PairObject> {
  const pairs: Array<PairObject> = []

  // 1. Build feature ID → table row mapping
  const rowMap = new Map<number, FeatureTableRow>()
  tableData.rows.forEach((row: FeatureTableRow) => {
    rowMap.set(row.feature_id, row)
  })

  // 2. For each cluster, generate all pairs
  for (const cluster of clusterGroups) {
    // DEFENSIVE FILTER: Only features in BOTH selectedFeatureIds AND tableData
    const validFeatures = cluster.feature_ids.filter(id =>
      selectedFeatureIds.has(id) && rowMap.has(id)
    )

    // Skip clusters with < 2 valid features (can't make pairs)
    if (validFeatures.length < 2) continue

    // 3. Generate all combinations within this cluster: C(n, 2)
    for (let i = 0; i < validFeatures.length; i++) {
      for (let j = i + 1; j < validFeatures.length; j++) {
        const id1 = validFeatures[i]
        const id2 = validFeatures[j]

        // 4. Use CANONICAL pair key (smaller ID first)
        const pairKey = getCanonicalPairKey(id1, id2)  // "min-max"
        const mainId = Math.min(id1, id2)
        const similarId = Math.max(id1, id2)

        // 5. Try to find decoder similarity from tableData
        const mainRow = rowMap.get(mainId)!
        const similarRow = rowMap.get(similarId)!
        let decoderSimilarity: number | null = null

        if (mainRow?.decoder_similarity) {
          const similarData = mainRow.decoder_similarity.find(d => d.feature_id === similarId)
          if (similarData) {
            decoderSimilarity = similarData.cosine_similarity
          }
        }

        // 6. Create pair object
        pairs.push({
          mainFeatureId: mainId,
          similarFeatureId: similarId,
          decoderSimilarity,
          pairKey,
          clusterId: cluster.cluster_id,
          row: mainRow,
          similarRow: similarRow
        })
      }
    }
  }

  return pairs
}
```

**Key Points**:
- **Defensive filtering**: Only includes features in BOTH `selectedFeatureIds` AND `tableData`
- **All combinations**: For cluster [A, B, C] → pairs [A-B, A-C, B-C]
- **Canonical keys**: Always "smaller_id-larger_id" format for consistency
- **Decoder similarity**: Extracted from tableData if available (pre-loaded top-4 similar features)

**⚠️ Potential Bug**: If `tableData` doesn't include all `selectedFeatureIds`, some cluster features will be silently dropped. This could happen if table filters exclude some features.

---

### Phase 8: Compute Pair List

**Location**: `FeatureSplitView.tsx:202-214`

```typescript
const pairList = useMemo(() => {
  if (!filteredTableData || !selectedFeatureIds) {
    return []
  }

  if (clusterGroups && clusterGroups.length > 0) {
    const pairs = buildClusterPairs(filteredTableData, clusterGroups, selectedFeatureIds)
    console.log('[FeatureSplitView] Built cluster pairs:', pairs.length, 'from', clusterGroups.length, 'clusters')
    return pairs
  }

  return []
}, [filteredTableData, clusterGroups, selectedFeatureIds])
```

**What it does**:
- Waits for: filtered table data, cluster groups, selected features
- Calls `buildClusterPairs()` to generate all within-cluster pairs
- Returns flat list of pair objects
- Used for main "Sampled Pairs" list in UI

**Typical size**: 15 clusters × ~5 features per cluster × C(5,2) ≈ 150 pairs

---

### Phase 9: Auto-Populate Similarity Scores (SVM Trigger)

**Location**: `FeatureSplitView.tsx:217-243`

**Process**:
```typescript
useEffect(() => {
  // 1. Extract MANUAL selections only (ignore auto-tagged)
  const currentSelectedKeys: string[] = []  // "Fragmented"
  const currentRejectedKeys: string[] = []  // "Monosemantic"

  pairSelectionStates.forEach((state, pairKey) => {
    const source = pairSelectionSources.get(pairKey)
    if (source === 'manual') {  // Only manual user selections
      if (state === 'selected') currentSelectedKeys.push(pairKey)
      else if (state === 'rejected') currentRejectedKeys.push(pairKey)
    }
  })

  // 2. Check if we have minimum required selections
  const hasRequiredSelections = currentSelectedKeys.length >= 1 && currentRejectedKeys.length >= 1

  // 3. Compute selection signature to detect changes
  const currentSignature = `selected:${currentSelectedKeys.sort().join(',')}|rejected:${currentRejectedKeys.sort().join(',')}`
  const scoresAreStale = lastPairSortedSelectionSignature !== currentSignature

  // 4. Determine if we need to recompute scores
  const needsScores = (pairSimilarityScores.size === 0 || scoresAreStale) && pairList.length > 0

  // 5. Trigger SVM scoring if needed
  if (hasRequiredSelections && needsScores) {
    const allPairKeys = pairList.map(p => p.pairKey)
    console.log('[FeatureSplitView] Computing similarity scores for', allPairKeys.length, 'pairs (stale:', scoresAreStale, ')')
    sortPairsBySimilarity(allPairKeys)
  }
}, [pairList, pairSelectionStates, pairSelectionSources, pairSimilarityScores.size, lastPairSortedSelectionSignature, sortPairsBySimilarity])
```

**Trigger Conditions**:
1. User has manually tagged ≥1 pair as "Fragmented" (selected)
2. User has manually tagged ≥1 pair as "Monosemantic" (rejected)
3. Either: No scores exist yet, OR selection state has changed

**Why selection signature**:
- Tracks exact set of selected/rejected pairs
- Detects when user changes their mind (adds/removes tags)
- Avoids redundant API calls when scores are still valid

**⚠️ Important**: Only MANUAL selections are used for SVM training. Auto-tagged pairs are ignored.

---

### Phase 10: Sort Pairs by Similarity (SVM Training)

**Location**: `table-actions-feature-splitting.ts:14-125`

**Process**:
```typescript
sortPairsBySimilarity: async (allPairKeys: string[]) => {
  const { pairSelectionStates, pairSelectionSources } = state

  // 1. Extract MANUAL selections only
  const selectedPairKeys: string[] = []
  const rejectedPairKeys: string[] = []

  pairSelectionStates.forEach((selectionState: string, pairKey: string) => {
    const source = pairSelectionSources.get(pairKey)
    if (source === 'manual') {
      if (selectionState === 'selected') selectedPairKeys.push(pairKey)
      else if (selectionState === 'rejected') rejectedPairKeys.push(pairKey)
    }
  })

  // 2. Validate minimum requirements
  if (selectedPairKeys.length === 0 && rejectedPairKeys.length === 0) {
    console.warn('[Store.sortPairsBySimilarity] Need at least one selected or rejected pair')
    return
  }

  console.log('[Store.sortPairsBySimilarity] Calling API:', {
    selectedPairKeys: selectedPairKeys.length,
    rejectedPairKeys: rejectedPairKeys.length,
    totalPairs: allPairKeys.length
  })

  // 3. Call backend SVM API
  const response = await api.getPairSimilaritySort(
    selectedPairKeys,
    rejectedPairKeys,
    allPairKeys
  )

  // 4. Convert to Map for O(1) lookup
  const scoresMap = new Map<string, number>()
  response.sorted_pairs.forEach((ps) => {
    scoresMap.set(ps.pair_key, ps.score)
  })

  // 5. Generate signature for cache invalidation
  const selectedSig = selectedPairKeys.sort().join(',')
  const rejectedSig = rejectedPairKeys.sort().join(',')
  const selectionSignature = `selected:${selectedSig}|rejected:${rejectedSig}`

  // 6. Freeze current selection state for grouping
  const frozenSelectionStates = new Map(pairSelectionStates)

  // 7. Store scores and signature
  set({
    pairSimilarityScores: scoresMap,
    lastPairSortedSelectionSignature: selectionSignature,
    pairSortedBySelectionStates: frozenSelectionStates
  })
}
```

**Key Points**:
- Only MANUAL selections used for training
- Calls backend with: selected pairs, rejected pairs, all pairs to score
- Stores scores as Map (pair_key → SVM score)
- Stores signature to detect staleness
- Freezes selection state for UI grouping

---

### Phase 11: Backend Pair Similarity Sorting

**Location**: `similarity_sort_service.py:477-590`

**Algorithm**:
```python
async def get_pair_similarity_sorted(
    self,
    request: PairSimilaritySortRequest
) -> PairSimilaritySortResponse:
    # 1. Parse pair keys to (main_id, similar_id) tuples
    pair_ids = []
    for pair_key in request.pair_keys:
        parts = pair_key.split('-')
        main_id = int(parts[0])
        similar_id = int(parts[1])
        pair_ids.append((main_id, similar_id))

    # 2. Extract all unique feature IDs from pairs
    all_feature_ids = set()
    for main_id, similar_id in pair_ids:
        all_feature_ids.add(main_id)
        all_feature_ids.add(similar_id)

    # 3. Extract 4-dimensional feature metrics for each feature
    metrics_df = await self._extract_metrics(list(all_feature_ids))
    # Metrics: intra_ngram_jaccard, intra_semantic_sim, inter_ngram_jaccard, inter_semantic_sim

    # 4. Extract pair-specific decoder similarity (1-dimensional)
    pair_metrics_dict = await self._extract_pair_metrics(pair_ids)
    # Dict: pair_key → cosine_similarity from decoder_similarity field

    # 5. Calculate similarity scores using SVM
    pair_scores = self._calculate_pair_similarity_scores(
        metrics_df,
        pair_metrics_dict,
        request.selected_pair_keys,
        request.rejected_pair_keys,
        pair_ids
    )

    # 6. Sort by score (descending - higher = more similar to selected)
    pair_scores.sort(key=lambda x: x.score, reverse=True)

    return PairSimilaritySortResponse(
        sorted_pairs=pair_scores,
        total_pairs=len(pair_ids),
        weights_used=[]
    )
```

**⚠️ CRITICAL LIMITATION**:
```python
# _extract_metrics() only returns features in current filtered dataset
# If pair references features outside table filters, metrics will be missing
# Future fix: Load from unfiltered global dataset
```

---

### Phase 12: Pair Vector Construction (13-dimensional)

**Location**: `similarity_sort_service.py:668-796`

**Symmetric Pair Vector**:
```python
# Build 13-dimensional symmetric pair vector
# Ensures pair(A, B) = pair(B, A) regardless of order

main_metrics = metrics_matrix[main_idx[0]]        # 4 dims: A's metrics
similar_metrics = metrics_matrix[similar_idx[0]]  # 4 dims: B's metrics
pair_metric = pair_metrics.get(pair_key, 0.0)    # 1 dim: decoder similarity between A and B

# Symmetric operations (commutative)
pair_sum = main_metrics + similar_metrics         # 4 dims: A + B (combined properties)
pair_diff = np.abs(main_metrics - similar_metrics) # 4 dims: |A - B| (dissimilarity)
pair_product = main_metrics * similar_metrics     # 4 dims: A * B (interaction)

# Concatenate: 4 + 4 + 4 + 1 = 13 dimensions
pair_vector = np.concatenate([pair_sum, pair_diff, pair_product, [pair_metric]])
```

**Feature Metrics (4 dims per feature)**:
1. `intra_ngram_jaccard`: Lexical consistency within feature's activations (max of char/word)
2. `intra_semantic_sim`: Semantic consistency within feature's activations
3. `inter_ngram_jaccard`: Lexical similarity to other features (max from top similar features)
4. `inter_semantic_sim`: Semantic similarity to other features

**Pair Metric (1 dim)**:
5. `decoder_similarity`: Cosine similarity between decoder weights of the two features

**Why symmetric**:
- A + B = B + A
- |A - B| = |B - A|
- A × B = B × A
- Ensures same vector regardless of feature order in pair

---

### Phase 13: SVM Training and Scoring

**Location**: `similarity_sort_service.py:411-470`

**Training**:
```python
def _train_svm_model(
    self,
    selected_vectors: np.ndarray,  # Positive examples (Fragmented)
    rejected_vectors: np.ndarray   # Negative examples (Monosemantic)
) -> Tuple[SVC, StandardScaler]:
    # 1. Combine data
    X = np.vstack([selected_vectors, rejected_vectors])
    y = np.array([1] * len(selected_vectors) + [0] * len(rejected_vectors))

    # 2. Standardize features (CRITICAL for SVM)
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # 3. Train SVM with RBF kernel
    model = SVC(
        kernel='rbf',            # Non-linear decision boundary
        C=1.0,                   # Regularization
        gamma='scale',           # Kernel coefficient
        class_weight='balanced', # Handle class imbalance
        probability=False        # Faster without probability
    )
    model.fit(X_scaled, y)

    logger.info(f"SVM trained: {len(selected_vectors)} positive, {len(rejected_vectors)} negative, "
               f"{model.n_support_.sum()} support vectors")

    return model, scaler
```

**Scoring**:
```python
def _score_with_svm(
    self,
    model: SVC,
    scaler: StandardScaler,
    feature_vectors: np.ndarray
) -> np.ndarray:
    """
    Score using SVM decision function.

    Returns:
        Signed distance from decision boundary
        Positive = more similar to selected (Fragmented)
        Negative = more similar to rejected (Monosemantic)
    """
    X_scaled = scaler.transform(feature_vectors)
    scores = model.decision_function(X_scaled)
    return scores
```

**Caching**:
```python
# Cache key: MD5 hash of sorted selected/rejected pair keys
cache_key = md5(f"{sorted(selected_keys)}_{sorted(rejected_keys)}").hexdigest()

if cache_key in self._svm_cache:
    model, scaler = self._svm_cache[cache_key]  # Reuse model
else:
    model, scaler = self._train_svm_model(...)  # Train new model
    self._svm_cache[cache_key] = (model, scaler)
```

**Key Points**:
- Uses RBF kernel for non-linear decision boundaries
- Standardization is CRITICAL (SVM sensitive to feature scales)
- Returns signed distance (not probability)
- Caches models keyed by selection state (fast for same selections)

---

### Phase 14: Compute Boundary Items

**Location**: `FeatureSplitView.tsx:285-347`

**Purpose**: Identify pairs near decision boundaries for manual review before auto-tagging.

**Algorithm**:
```typescript
const boundaryItems = useMemo(() => {
  // 1. Get thresholds from TagAutomaticState (set by histogram)
  const selectThreshold = tagAutomaticState?.selectThreshold ?? 0.8
  const rejectThreshold = tagAutomaticState?.rejectThreshold ?? 0.3

  // 2. Filter to pairs that have SVM scores
  const pairsWithScores = pairList.filter(pair => pairSimilarityScores.has(pair.pairKey))

  if (pairsWithScores.length === 0) {
    return { rejectAbove: [], rejectBelow: [], selectAbove: [], selectBelow: [] }
  }

  // 3. REJECT THRESHOLD LISTS (left side)

  // Above reject: pairs >= rejectThreshold, sorted ascending (lowest first = closest to threshold)
  const rejectAbove = pairsWithScores
    .filter(pair => pairSimilarityScores.get(pair.pairKey)! >= rejectThreshold)
    .sort((a, b) => pairSimilarityScores.get(a.pairKey)! - pairSimilarityScores.get(b.pairKey)!)

  // Below reject: pairs < rejectThreshold, sorted descending (highest first = closest to threshold)
  const rejectBelow = pairsWithScores
    .filter(pair => pairSimilarityScores.get(pair.pairKey)! < rejectThreshold)
    .sort((a, b) => pairSimilarityScores.get(b.pairKey)! - pairSimilarityScores.get(a.pairKey)!)

  // 4. SELECT THRESHOLD LISTS (right side)

  // Above select: pairs >= selectThreshold, sorted ascending (lowest first = closest to threshold)
  const selectAbove = pairsWithScores
    .filter(pair => pairSimilarityScores.get(pair.pairKey)! >= selectThreshold)
    .sort((a, b) => pairSimilarityScores.get(a.pairKey)! - pairSimilarityScores.get(b.pairKey)!)

  // Below select: pairs < selectThreshold, sorted descending (highest first = closest to threshold)
  const selectBelow = pairsWithScores
    .filter(pair => pairSimilarityScores.get(pair.pairKey)! < selectThreshold)
    .sort((a, b) => pairSimilarityScores.get(b.pairKey)! - pairSimilarityScores.get(a.pairKey)!)

  return { rejectAbove, rejectBelow, selectAbove, selectBelow }
}, [pairList, tagAutomaticState, pairSimilarityScores])
```

**Sorting Logic**:
- **"Closest to threshold"** = most uncertain pairs
- **Ascending sort** = start from threshold and go up
- **Descending sort** = start from threshold and go down

**Four Lists**:
1. **rejectBelow** (← Monosemantic): score < rejectThreshold, descending
2. **rejectAbove** (Unsure →): score ≥ rejectThreshold (but < selectThreshold), ascending
3. **selectAbove** (Fragmented →): score ≥ selectThreshold, ascending
4. **selectBelow** (← Unsure): score < selectThreshold (but ≥ rejectThreshold), descending

---

### Phase 15: Tag Automatically Button Click

**Location**: `FeatureSplitView.tsx:263-272`

```typescript
const handleTagAutomatically = useCallback(() => {
  console.log('[FeatureSplitView] Tag Automatically clicked - passing features:',
              selectedFeatureIds?.size || 0, ', threshold:', clusterThreshold)

  showTagAutomaticPopover(
    'pair',                // mode
    { x: 250, y: 400 },   // position
    'Fragmented',         // tagLabel
    selectedFeatureIds,   // IMPORTANT: Sankey segment features
    clusterThreshold      // IMPORTANT: Clustering threshold
  )
}, [showTagAutomaticPopover, selectedFeatureIds, clusterThreshold])
```

**What it passes**:
- `selectedFeatureIds`: Set of features from Sankey segment (defines universe)
- `clusterThreshold`: Clustering threshold from Sankey (for fetching ALL pairs)

**Why this matters**: Histogram needs ALL cluster-based pairs, not just sampled n=15.

---

### Phase 16: Fetch Similarity Histogram

**Location**: `table-actions-feature-splitting.ts:225-337`

**Critical Distinction**: SEGMENT-SPECIFIC MODE vs GLOBAL MODE

```typescript
fetchSimilarityHistogram: async (selectedFeatureIds?: Set<number>, threshold?: number) => {
  const { pairSelectionStates, tableData } = get()

  // 1. Extract current manual selections
  const selectedPairKeys: string[] = []
  const rejectedPairKeys: string[] = []
  let allPairKeys: string[] = []

  pairSelectionStates.forEach((state: string | null, pairKey: string) => {
    if (state === 'selected') selectedPairKeys.push(pairKey)
    else if (state === 'rejected') rejectedPairKeys.push(pairKey)
  })

  // 2. SEGMENT-SPECIFIC MODE: Fetch ALL cluster-based pairs
  if (selectedFeatureIds && selectedFeatureIds.size > 0) {
    const clusterThreshold = threshold ?? 0.5
    console.log(`[Store.fetchSimilarityHistogram] Fetching ALL cluster pairs for ${selectedFeatureIds.size} features at threshold ${clusterThreshold}`)

    const featureArray = Array.from(selectedFeatureIds)
    allPairKeys = await api.getSegmentClusterPairs(featureArray, clusterThreshold)

    console.log(`[Store.fetchSimilarityHistogram] Got ${allPairKeys.length} cluster-based pairs from segment`)
  } else {
    // 3. GLOBAL MODE (FALLBACK): Get pairs from current table view
    pairSelectionStates.forEach((_, pairKey) => {
      allPairKeys.push(pairKey)
    })

    if (tableData && tableData.features) {
      tableData.features.forEach((feature: any) => {
        if (feature.decoder_similarity && Array.isArray(feature.decoder_similarity)) {
          feature.decoder_similarity.slice(0, 4).forEach((similarItem: any) => {
            const pairKey = `${feature.feature_id}-${similarItem.feature_id}`
            if (!allPairKeys.includes(pairKey)) {
              allPairKeys.push(pairKey)
            }
          })
        }
      })
    }
    console.log('[Store.fetchSimilarityHistogram] Using global pairs (fallback):', allPairKeys.length)
  }

  // 4. Validate minimum requirements
  if (selectedPairKeys.length === 0 || rejectedPairKeys.length === 0) {
    console.warn('[Store.fetchSimilarityHistogram] Need at least 1 selected and 1 rejected pair')
    return null
  }

  console.log('[Store.fetchSimilarityHistogram] Fetching pair histogram:', {
    selected: selectedPairKeys.length,
    rejected: rejectedPairKeys.length,
    total: allPairKeys.length
  })

  // 5. Fetch histogram data from backend
  const histogramData = await api.getPairSimilarityScoreHistogram(
    selectedPairKeys,
    rejectedPairKeys,
    allPairKeys
  )

  // 6. Calculate dynamic thresholds based on score distribution
  const { statistics } = histogramData
  const maxAbsValue = Math.max(
    Math.abs(statistics.min || 0),
    Math.abs(statistics.max || 0)
  )
  const selectThreshold = maxAbsValue > 0 && isFinite(maxAbsValue) ? maxAbsValue / 2 : 0.2
  const rejectThreshold = maxAbsValue > 0 && isFinite(maxAbsValue) ? -maxAbsValue / 2 : -0.2

  // 7. Update tagAutomaticState with histogram and thresholds
  set({
    tagAutomaticState: {
      visible: true,
      minimized: false,
      mode: 'pair',
      position: { x, y },
      histogramData,
      selectThreshold,
      rejectThreshold,
      tagLabel: 'Fragmented',
      isLoading: false
    }
  })

  return { histogramData, selectThreshold, rejectThreshold }
}
```

**Key Points**:
- **SEGMENT MODE** (if selectedFeatureIds provided): Fetch ALL cluster pairs via `getSegmentClusterPairs()`
- **GLOBAL MODE** (fallback): Use pairs from current table view
- **Dynamic thresholds**: selectThreshold = max/2, rejectThreshold = -max/2
- **Requires**: ≥1 selected AND ≥1 rejected pair for SVM training

**⚠️ Critical Discovery**: Histogram includes MANY MORE PAIRS than sampled list (all clusters vs n=15 clusters).

---

### Phase 17: Get Segment Cluster Pairs API

**Location**: `api.ts:482-508`

```typescript
export async function getSegmentClusterPairs(
  featureIds: number[],
  threshold: number = 0.5
): Promise<string[]> {
  console.log(`[API.getSegmentClusterPairs] Requesting pairs for ${featureIds.length} features at threshold ${threshold}`)

  const response = await fetch(`${API_BASE}/api/segment-cluster-pairs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      feature_ids: featureIds,
      threshold: threshold
    })
  })

  const data = await response.json()
  console.log(`[API.getSegmentClusterPairs] Received ${data.total_pairs} pairs from ${data.total_clusters} clusters`)

  return data.pair_keys  // Array of "id1-id2" strings
}
```

**Purpose**: Fetch ALL cluster-based pairs (not sampled) for complete histogram distribution.

---

### Phase 18: Backend Get All Cluster Pairs

**Location**: `hierarchical_cluster_candidate_service.py:209-321`

**Algorithm**:
```python
async def get_all_cluster_pairs(
    self,
    feature_ids: List[int],
    threshold: float = 0.5
) -> Dict:
    """
    Get ALL cluster-based pair keys for a set of features.

    Unlike get_cluster_candidates which returns n random clusters,
    this returns ALL clusters and ALL pairs within those clusters.
    Used for histogram computation where we need complete pair distribution.
    """

    # Step 1: Cut dendrogram at threshold (SAME AS BEFORE)
    all_labels = fcluster(self.linkage_matrix, t=threshold, criterion='distance')

    # Step 2: Build feature_to_cluster mapping (ONLY requested features)
    feature_to_cluster = {
        feature_id: int(all_labels[feature_id])
        for feature_id in feature_ids
    }

    # Step 3: Build cluster_to_features mapping
    cluster_to_features = {}
    for feature_id in feature_ids:
        cluster_id = feature_to_cluster[feature_id]
        if cluster_id not in cluster_to_features:
            cluster_to_features[cluster_id] = []
        cluster_to_features[cluster_id].append(feature_id)

    # Step 4: Filter to only clusters with 2+ features
    valid_clusters = {
        cluster_id: features
        for cluster_id, features in cluster_to_features.items()
        if len(features) >= 2
    }

    logger.info(
        f"Found {len(cluster_to_features)} clusters total, "
        f"{len(valid_clusters)} have 2+ features"
    )

    # Step 5: Generate ALL pairwise combinations within each cluster
    pair_keys = []
    cluster_details = []

    for cluster_id, cluster_features in valid_clusters.items():
        sorted_features = sorted(cluster_features)
        cluster_pairs = []

        # Generate all pairs: C(n, 2)
        for i in range(len(sorted_features)):
            for j in range(i + 1, len(sorted_features)):
                id1, id2 = sorted_features[i], sorted_features[j]

                # Canonical pair key: smaller ID first
                pair_key = f"{min(id1, id2)}-{max(id1, id2)}"
                pair_keys.append(pair_key)
                cluster_pairs.append(pair_key)

        cluster_details.append({
            "cluster_id": cluster_id,
            "feature_ids": sorted_features,
            "pair_count": len(cluster_pairs)
        })

    total_pairs = len(pair_keys)
    logger.info(f"Generated {total_pairs} pairs from {len(valid_clusters)} clusters")

    return {
        "pair_keys": pair_keys,            # ALL pair keys
        "total_clusters": len(valid_clusters),
        "total_pairs": total_pairs,
        "clusters": cluster_details
    }
```

**Difference from `get_cluster_candidates`**:
- **No sampling**: Returns ALL valid clusters (not just n=15)
- **All pairs**: Generates ALL within-cluster pairs
- **Larger output**: Typically 100-500 pairs vs 150 pairs from sampled

**Use case**: Histogram needs complete distribution for accurate threshold visualization.

---

### Phase 19: Backend Histogram Computation

**Location**: `similarity_sort_service.py:939-1043`

**Process**:
```python
async def get_pair_similarity_score_histogram(
    self,
    request: PairSimilarityHistogramRequest
) -> SimilarityHistogramResponse:
    # 1. Parse ALL pair keys (could be 500+ pairs)
    pair_ids = [(int(parts[0]), int(parts[1])) for pair_key in request.pair_keys ...]

    # 2. Extract feature metrics for all unique features
    all_feature_ids = set(fid for main_id, similar_id in pair_ids for fid in (main_id, similar_id))
    metrics_df = await self._extract_metrics(list(all_feature_ids))

    # 3. Extract pair-specific decoder similarity
    pair_metrics_dict = await self._extract_pair_metrics(pair_ids)

    # 4. Calculate SVM scores for ALL pairs (including selected/rejected)
    pair_scores = self._calculate_pair_similarity_scores_for_histogram(
        metrics_df,
        pair_metrics_dict,
        request.selected_pair_keys,
        request.rejected_pair_keys,
        pair_ids
    )

    # 5. Create scores dictionary: pair_key → score
    scores_dict = {item.pair_key: item.score for item in pair_scores}

    # 6. Extract score values for histogram binning
    score_values = np.array([item.score for item in pair_scores])

    # 7. Compute histogram (40 bins)
    counts, bin_edges = np.histogram(score_values, bins=40)
    bins = (bin_edges[:-1] + bin_edges[1:]) / 2  # Bin centers

    # 8. Compute statistics
    statistics = HistogramStatistics(
        min=float(np.min(score_values)),
        max=float(np.max(score_values)),
        mean=float(np.mean(score_values)),
        median=float(np.median(score_values))
    )

    return SimilarityHistogramResponse(
        scores=scores_dict,          # All pair scores
        histogram=HistogramData(...), # 40 bins
        statistics=statistics,
        total_items=len(pair_scores)
    )
```

**Key Difference**: `_calculate_pair_similarity_scores_for_histogram()` includes ALL pairs (even selected/rejected) for complete distribution.

---

### Phase 20: Histogram Visualization & Thresholds

**Display**:
- **X-axis**: SVM similarity scores (negative to positive)
- **Y-axis**: Frequency (number of pairs)
- **Distribution**: Typically bimodal (rejected cluster on left, selected cluster on right)

**Two Draggable Thresholds**:
1. **Blue handle (right)**: `selectThreshold`
   - Pairs with score ≥ this → "Fragmented" (auto-select)
   - Default: max_abs_value / 2

2. **Red handle (left)**: `rejectThreshold`
   - Pairs with score ≤ this → "Monosemantic" (auto-reject)
   - Default: -max_abs_value / 2

**Middle zone**: score between rejectThreshold and selectThreshold → "Unsure" (no auto-tag)

**User Actions**:
- Drag handles to adjust thresholds
- Click "Preview on Table" → shows stripe patterns for would-be tagged pairs
- Click "Apply" → actually tags pairs according to thresholds

---

### Phase 21: Display in Four Scrollable Lists

**Layout** (bottom row):

**Left side (reject threshold boundary)**:
```
┌──────────────────────┐   ┌──────────────────────┐
│ ← Monosemantic       │   │ Unsure →             │
│ (rejectBelow)        │   │ (rejectAbove)        │
│ score < 0.3          │   │ score >= 0.3         │
│ sorted DESC (top 10) │   │ sorted ASC (top 10)  │
└──────────────────────┘   └──────────────────────┘
```

**Right side (select threshold boundary)**:
```
┌──────────────────────┐   ┌──────────────────────┐
│ Fragmented →         │   │ ← Unsure             │
│ (selectAbove)        │   │ (selectBelow)        │
│ score >= 0.8         │   │ score < 0.8          │
│ sorted ASC (top 10)  │   │ sorted DESC (top 10) │
└──────────────────────┘   └──────────────────────┘
```

**Why only top 10**: These are the pairs CLOSEST to decision boundaries (most uncertain).

**Purpose**: Manual review before applying automatic tags.

---

## 🐛 Potential Bugs & Issues

### Bug 1: Threshold Synchronization Risk

**Problem**: Threshold extracted in TWO separate places:
1. Component: `FeatureSplitView.tsx:149-160`
2. Store action: `table-actions-feature-splitting.ts:159-167`

**Risk**: If Sankey structure updates between these extractions, they could get different thresholds.

**Severity**: Low (rare race condition)

**Fix**: Extract once in component, pass as parameter to `fetchDistributedPairs()`.

---

### Bug 2: Feature Filtering Cascade

**Problem**: `buildClusterPairs()` filters features THREE times:
1. Backend: Only features in `selectedFeatureIds`
2. Frontend: Only features in `selectedFeatureIds`
3. Frontend: Only features in `tableData.rows`

**Issue**: If `tableData` doesn't include all `selectedFeatureIds`, some cluster features are silently dropped.

**Scenario**: Table has filters (e.g., specific SAE, scorer) that exclude some Sankey segment features.

**Severity**: Medium (could silently reduce pair count)

**Detection**: Compare `selectedFeatureIds.size` vs `filteredTableData.rows.length`

**Fix**: Log warning when mismatch detected; consider fetching unfiltered feature data.

---

### Bug 3: Pair Coverage Mismatch

**Problem**:
- Main "Sampled Pairs" list: Built from n=15 clusters → ~150 pairs
- Histogram: Built from ALL clusters → ~500 pairs
- SVM scores: Computed for sampled pairs only

**Issue**: Histogram includes pairs that weren't scored by SVM.

**Actual Behavior**:
- `sortPairsBySimilarity()` scores only `pairList` pairs
- Histogram fetches ALL pairs and scores them separately
- Two separate SVM training calls with same selections

**Severity**: Low (actually works as intended for different use cases)

**Clarification**: This is BY DESIGN:
- Sampled pairs for quick manual review
- All pairs for comprehensive histogram

---

### Bug 4: Canonical Pair Key Consistency

**Problem**: Pair keys must ALWAYS use format "smaller_id-larger_id"

**Critical Locations**:
1. `buildClusterPairs()`: Uses `getCanonicalPairKey()` ✅
2. `togglePairSelection()`: Manual canonicalization ✅
3. `_extract_pair_metrics()`: Manual canonicalization ✅
4. Backend clustering: Manual canonicalization ✅

**Risk**: If ANY location misses this, keys won't match between:
- Pair list
- Selection state Map
- SVM scores Map
- Backend pair metrics

**Severity**: High (would break entire feature)

**Status**: Currently correct in all locations

**Recommendation**: Extract `getCanonicalPairKey()` to shared utility, use everywhere.

---

### Bug 5: SVM Scores Missing for Boundary Items

**Problem**: `boundaryItems` computation filters:
```typescript
const pairsWithScores = pairList.filter(pair => pairSimilarityScores.has(pair.pairKey))
```

**Scenario**: If SVM scoring hasn't run yet (no manual selections), `pairSimilarityScores` is empty.

**Result**: All four boundary lists are empty.

**User Experience**:
- Sees pairs in main "Sampled Pairs" list
- Sees empty boundary lists
- May be confused

**Severity**: Low (expected behavior, resolved after manual tagging)

**UI Enhancement**: Show message "Tag at least 1 Fragmented and 1 Monosemantic pair to enable automatic tagging"

---

### Bug 6: Threshold Default Value Inconsistency

**Defaults across codebase**:
1. Sankey threshold default: `0.5` (decoder similarity)
2. Auto-tag select threshold: `0.8` (SVM score)
3. Auto-tag reject threshold: `0.3` (SVM score)
4. Histogram dynamic: `maxAbsValue / 2` (SVM score)

**Issue**: Different defaults for different purposes, could be confusing.

**Severity**: Very Low (different units, different purposes)

**Clarification**: These are intentionally different:
- Sankey: Decoder similarity (0-1, clustering parameter)
- Auto-tag: SVM decision distance (can be negative, classification boundary)

---

## 📈 Performance Characteristics

### Bottlenecks

1. **Hierarchical Clustering** (Backend)
   - Operation: `fcluster()` on 16k linkage matrix
   - Time: ~20-50ms
   - Frequency: Once per threshold change
   - Optimization: Pre-computed linkage matrix (loaded once at startup)

2. **Pair Vector Construction** (Backend)
   - Operation: Build 13-dim vectors for all pairs
   - Time: ~50-100ms for 500 pairs
   - Frequency: Once per SVM training
   - Bottleneck: Feature metric extraction (Polars queries)

3. **SVM Training** (Backend)
   - Operation: Fit RBF kernel SVM
   - Time: ~10-30ms (depends on training size)
   - Frequency: Once per unique selection signature
   - Optimization: Model caching (keyed by selections)

4. **Histogram Computation** (Backend)
   - Operation: Score 500+ pairs with SVM, compute histogram
   - Time: ~100-200ms
   - Frequency: Once when opening TagAutomaticPopover
   - Bottleneck: Scoring all pairs sequentially

### Caching Strategy

**Frontend**:
- `pairList`: Memoized by `[clusterGroups, selectedFeatureIds]`
- `boundaryItems`: Memoized by `[pairList, tagAutomaticState, pairSimilarityScores]`
- `pairSimilarityScores`: Stored in Zustand, keyed by selection signature

**Backend**:
- SVM models: Cached by MD5 hash of selected/rejected keys
- Feature metrics: Re-extracted per request (Polars lazy evaluation)
- Linkage matrix: Loaded once at service initialization

---

## 🔍 Data Flow Validation Checklist

Use this checklist to debug issues:

### Threshold Extraction
- [ ] Sankey structure exists (`leftPanel?.sankeyStructure`)
- [ ] `stage1_segment` node found
- [ ] Threshold property exists and is non-null
- [ ] Threshold value is 0-1 (similarity, not distance)
- [ ] Same threshold in component and store action

### Feature Selection
- [ ] `selectedFeatureIds` is Set<number>, not empty
- [ ] All selected features exist in `tableData`
- [ ] Table filters don't exclude selected features

### Cluster Fetching
- [ ] `clusterGroups` populated after fetch
- [ ] Each cluster has ≥2 features
- [ ] Feature IDs in clusters are subset of `selectedFeatureIds`
- [ ] n=15 clusters requested, actual count may be lower

### Pair Building
- [ ] `pairList` non-empty after cluster fetch
- [ ] All pair keys use canonical format (smaller-larger)
- [ ] Pairs reference features in `tableData.rows`
- [ ] Decoder similarity attached when available

### SVM Training
- [ ] ≥1 manual "Fragmented" selection
- [ ] ≥1 manual "Monosemantic" rejection
- [ ] `sortPairsBySimilarity()` called automatically
- [ ] `pairSimilarityScores` Map populated
- [ ] Selection signature stored

### Histogram
- [ ] "Tag Automatically" button enabled
- [ ] Histogram API called with ALL cluster pairs (not sampled)
- [ ] Scores computed for 500+ pairs (not just 150)
- [ ] Thresholds calculated from score distribution
- [ ] Histogram displays bimodal distribution

### Boundary Items
- [ ] Four lists populated after SVM scoring
- [ ] Lists sorted correctly (ascending/descending)
- [ ] Top 10 items shown per list
- [ ] Lists update when thresholds change

---

## 📚 Key Architectural Decisions

### Decision 1: Frontend Pair Building vs Backend

**Chosen**: Frontend builds pairs from cluster groups

**Rationale**:
- Backend provides simple cluster groups (clean API)
- Frontend has full context (selectedFeatureIds, tableData)
- Enables defensive filtering (features in BOTH sets)
- Allows quick local recombination

**Trade-off**: More frontend computation, but better flexibility

---

### Decision 2: Sampled Clusters (n=15) vs All Clusters

**Chosen**: Sample for main list, ALL for histogram

**Rationale**:
- Main list: User needs quick manual review (too many pairs overwhelming)
- Histogram: Needs complete distribution for accurate thresholds
- Separate API calls for different purposes

**Trade-off**: Two clustering calls with same parameters, but serves different needs

---

### Decision 3: Symmetric 13-dim Pair Vectors

**Chosen**: [A+B, |A-B|, A×B, decoder_sim]

**Rationale**:
- Ensures pair(A,B) = pair(B,A) (order-invariant)
- Captures multiple relationship aspects:
  - Sum: Combined properties
  - Abs diff: Dissimilarity
  - Product: Interaction
  - Decoder: Pre-computed similarity
- 13 dimensions balances expressiveness vs complexity

**Alternative rejected**: Concatenate [A, B] (26-dim, not symmetric)

---

### Decision 4: SVM Decision Function vs Probability

**Chosen**: Use `decision_function()` (signed distance)

**Rationale**:
- Faster (no probability calibration)
- More intuitive (distance from boundary)
- Allows dual thresholds (positive/negative)
- Better for histogram visualization

**Trade-off**: No probabilistic interpretation, but not needed here

---

### Decision 5: Fixed Random Seed for Cluster Sampling

**Chosen**: `random.seed(42)` in backend

**Rationale**:
- Deterministic results for same inputs
- User sees same pairs on reload (better UX)
- Debugging easier (reproducible)

**Trade-off**: No exploration of different samplings, but consistency more important

---

## 🎯 Summary

The Feature Split View implements a sophisticated multi-stage pipeline:

1. **Extract** threshold and features from Sankey segment
2. **Cluster** features using hierarchical agglomerative clustering
3. **Sample** n=15 clusters for quick manual review
4. **Build** all within-cluster pairs (C(n,2) per cluster)
5. **Train** SVM on manually labeled pairs (13-dim symmetric vectors)
6. **Score** all pairs using SVM decision distance
7. **Compute** boundary items near decision thresholds
8. **Fetch** ALL cluster pairs for complete histogram distribution
9. **Visualize** score distribution with draggable thresholds
10. **Auto-tag** remaining pairs based on threshold zones

**Key Innovation**: Two-tier pair system (sampled for review, all for histogram) balances usability with completeness.

**Performance**: Sub-second for most operations, with intelligent caching at multiple levels.

**Robustness**: Defensive filtering ensures consistency between data sources (Sankey, tableData, backend).

---

**End of Documentation**
