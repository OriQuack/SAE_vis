FeatureSplitTable.tsx - Detailed Code Summary

  Overview

  Purpose: Displays a specialized table for analyzing feature pairs with high decoder similarity
  (Feature Splitting stage). Shows feature pairs side-by-side with activation examples and similarity
  scores to identify "fragmented" vs "monosemantic" features.

  Component Name: DecoderSimilarityTable (exported as default)

  ---
  🏗️ Architecture

  Component Type

  - React Functional Component with TypeScript
  - Virtual Scrolling enabled via @tanstack/react-virtual for performance
  - Zustand State Management integration

  Key Dependencies

  | Import                   | Purpose                                                  |
  |--------------------------|----------------------------------------------------------|
  | ScoreCircle              | Centralized circle rendering (decoder similarity)        |
  | ActivationExample        | Shows feature activation with inter-feature highlighting |
  | TableSelectionPanel      | Header with selection controls & "Done" button           |
  | SimilarityTaggingPopover | Automatic tagging interface                              |
  | useVirtualizer           | Efficient rendering of large row counts                  |

  ---
  📊 State Management

  Zustand Store State (Lines 23-36)

  // Core data
  activeStageNodeId       // Current decoder stage node
  leftPanel              // Sankey tree for feature filtering
  tableData              // Raw table data
  pairSelectionStates    // Map<pairKey, 'selected' | 'rejected'>
  pairSelectionSources   // Map<pairKey, 'manual' | 'auto'>
  activationExamples     // Cached activation data

  // Sorting & filtering
  pairSimilarityScores   // ML-based similarity scores for sorting
  tableSortBy            // Current sort mode
  loading.table          // Loading state

  // Actions
  togglePairSelection    // Toggle pair selection state
  setTableScrollState    // Update scroll indicator
  moveToNextStep         // Navigate to next stage

  Local Component State (Lines 55-76)

  // Sorting
  sortBy: 'id' | 'decoder_similarity' | null
  sortDirection: 'asc' | 'desc' | null

  // Interaction tracking
  hoveredPairKey: string | null  // Currently hovered pair
  activationColumnWidth: number  // Measured width for ActivationExample

  // Inter-feature pattern highlighting
  interFeatureHighlights: Map<pairKey, {
    mainFeatureId, similarFeatureId,
    type: 'char' | 'word',
    mainPositions, similarPositions
  }>  // Clicked pairs (persistent)

  hoverHighlight: {...} | null  // Temporary hover highlight

  ---
  🔑 Key Features & Logic

  1. Badge Configuration (Lines 39-53)

  Maps selection states to tag labels and colors:
  - Selected → "fragmented" (HIGH decoder similarity) - Green #10b981
  - Rejected → "monosemantic" (LOW decoder similarity) - Red #ef4444

  2. Inter-Feature Pattern Highlighting (Lines 78-167)

  handleBadgeInteraction() - Core Highlighting Logic

  Parameters: (mainFeatureId, similarFeatureId, interfeatureData, isClick)

  Click Behavior (Toggle):
  - Extracts char/word n-gram positions from inter_feature_similarity data
  - Chooses pattern type based on Jaccard similarity: max(charJaccard, wordJaccard)
  - Stores in interFeatureHighlights Map for persistent highlighting
  - Toggles off if already selected

  Hover Behavior (Temporary):
  - Sets hoverHighlight state for temporary green highlighting
  - Skips if no pattern data available
  - Cleared on mouse leave via handleBadgeLeave()

  getInterFeaturePositionsForFeature() - Position Merger (Lines 172-252)

  Purpose: Computes merged highlighting positions for a specific feature

  Key Algorithm:
  1. Collects clicked highlights (from interFeatureHighlights)
  2. Adds hover highlight (from hoverHighlight)
  3. Row-Specific Filtering: Only highlights if currentPairKey matches
    - Prevents highlighting all rows containing the same feature
  4. Normalizes char/word positions to unified format
  5. Merges positions by prompt_id (deduplicates by token_position)

  Return: { type: 'char', positions: [...] }

  3. Stage Context & Feature Processing (Lines 267-374)

  Stage Context (Lines 268-284)

  Computes current stage metadata:
  {
    nodeId: activeStageNodeId,
    metric: METRIC_DECODER_SIMILARITY,
    rangeLabel: node.rangeLabel,  // e.g., ">= 0.70"
    featureCount: node.featureCount
  }

  Stage Features (Lines 287-315)

  Filters features belonging to current decoder similarity stage:
  - Collects feature IDs from child nodes (if present)
  - Falls back to parent node's features
  - Filters tableData.features by collected IDs

  Stage Rows (Lines 318-374) - CORE DATA TRANSFORMATION

  Transformation Pipeline:
  1. Extract Pairs: For each feature, extract top 4 similar features from decoder_similarity array
  2. Canonical Keys: Create pair keys with smaller ID first: ${min(id1,id2)}-${max(id1,id2)}
  3. Build Row Objects:
  {
    pairKey: "123-456",
    mainFeature: { feature_id, pattern_type },
    similarFeature: {
      feature_id, cosine_similarity, pattern_type,
      inter_feature_similarity: {...}  // Pattern data
    }
  }
  4. Deduplication: Remove symmetric pairs - only keep one of (A,B) and (B,A)

  4. Sorting Logic (Lines 380-480)

  Three Sorting Modes:

  A. Pair Similarity Sort (tableSortBy === 'pair_similarity') - Lines 389-454
  - Three-tier grouping: Selected → Unselected (sorted) → Rejected
  - Uses FROZEN states (pairSortedBySelectionStates) to prevent re-grouping on selection changes
  - Sorts unselected by ML similarity scores (descending)
  - Extensive debug logging for missing scores

  B. Regular Column Sorting (Lines 458-479)
  - ID: Sort by mainFeature.feature_id
  - Decoder Similarity: Sort by similarFeature.cosine_similarity
  - 3-state cycle: null → asc → desc → null

  C. Default: No sorting applied

  5. Virtual Scrolling (Lines 483-488)

  useVirtualizer({
    count: sortedRows.length,
    estimateSize: () => 60,  // ~60px per row
    overscan: 5              // Render 5 extra items
  })
  Benefit: Efficient rendering of hundreds/thousands of pairs

  6. Pair Selection Handling (Lines 514-560)

  handlePairToggle() Logic:

  1. Creates canonical pair key (smaller ID first)
  2. Checks current state: undefined → 'selected' → 'rejected' → undefined
  3. On Selection: Extracts and stores inter-feature pattern positions
  4. On Deselection: Clears highlight data from Map
  5. Calls store action togglePairSelection()

  7. Activation Example Fetching (Lines 602-639)

  ⚠️ TEMPORARY FIX for missing activation data

  Problem: Decoder similarity reveals features not in initial 824-feature dataset

  Solution:
  - Extracts all unique feature IDs from visible pairs
  - Filters out already-requested IDs (prevents infinite loop)
  - Batch fetches missing activation examples
  - Uses requestedFeatureIds ref to track requests

  TODO: Pre-fetch all 16,384 features or implement pagination

  8. Scroll State Tracking (Lines 642-728)

  Provides scroll position to Sankey vertical indicator

  Algorithm:
  - Uses requestAnimationFrame for smooth updates
  - Calculates scroll percentage: scrollTop / (scrollHeight - clientHeight)
  - Computes visible feature IDs from current viewport
  - Only updates if state changed (avoids unnecessary re-renders)
  - Tracks with ResizeObserver for responsive updates

  ---
  🎨 Rendering Structure

  Main Layout (Lines 742-1025)

  <div className="table-panel">
    ├── Loading Overlay
    ├── TableSelectionPanel (header with actions)
    └── Table Container
        └── <table>
            ├── <thead> (6 columns)
            │   ├── # (index)
            │   ├── Feature Splitting (badge)
            │   ├── ID Pair (sortable)
            │   ├── Decoder Similarity (sortable)
            │   ├── Activation Example (main)
            │   └── Activation Example (similar)
            │
            └── <tbody> (virtual scrolling)
                ├── Top spacer
                ├── Virtual rows (visible only)
                └── Bottom spacer

  Row Rendering (Lines 804-1004)

  Row Structure:

  <tr className={rowClassName} onClick={handleRowClick}>
    <td>Index</td>
    <td>Category Badge ("fragmented" / "monosemantic")</td>
    <td>ID Pair (123, 456)</td>
    <td>
      <ScoreCircle
        metric="decoder_similarity"
        score={cosine_similarity}
        onClick={handleBadgeInteraction}
        onMouseEnter={handleBadgeInteraction + fetch}
      />
    </td>
    <td>
      <ActivationExample
        examples={...}
        interFeaturePositions={getInterFeaturePositions}
        isHovered={hoveredPairKey === row.pairKey}
        onHoverChange={handleActivationHover}
      />
    </td>
    <td>Similar Feature Activation Example</td>
  </tr>

  Row Styling Logic (Lines 809-832):

  // Background color based on selection
  if (pairSelectionState === 'selected') {
    categoryClass = source === 'auto'
      ? 'expanded'      // Blue (auto-tagged)
      : 'confirmed'     // Green (manual)
    rowBackgroundColor = source !== 'auto'
      ? badgeConfig.selected.color
      : ''
  }
  else if (pairSelectionState === 'rejected') {
    categoryClass = 'rejected'
    rowBackgroundColor = badgeConfig.rejected.color  // Red
  }

  // CSS custom properties for dynamic colors
  --row-color: full opacity for borders
  --row-bg-color: 30% opacity for backgrounds

  Interactive Elements:

  Decoder Similarity Circle (Lines 890-950)

  - Wrapped in flexbox container for centering
  - Click: Toggles inter-feature highlighting (persistent)
  - Hover: Shows temporary green highlighting + fetches activation data
  - Uses ScoreCircle with dynamic color (metric="decoder_similarity")

  Activation Examples (Lines 952-1002)

  - Two columns: main feature & similar feature
  - Props:
    - interFeaturePositions: Computed positions for green highlighting
    - isHovered: Synchronized hover state across both columns
    - onHoverChange: Triggers inter-feature highlighting on hover
  - Fallback: "—" placeholder if no data

  ---
  🔍 Special Behaviors

  1. Row Click Handling (Lines 838-844)

  onClick={(e) => {
    const target = e.target as HTMLElement
    // Don't toggle if clicking:
    // - .table-panel__category-badge
    // - .decoder-stage-table__cell--activation
    // - .decoder-stage-table__cell--decoder-similarity
    if (!target.closest(...)) {
      handlePairToggle(mainFeatureId, similarFeatureId)
    }
  }}
  Behavior: Clicking row background toggles selection, but interactive elements handle their own
  clicks

  2. Activation Column Width Measurement (Lines 563-584)

  useEffect(() => {
    const measureActivationColumn = () => {
      const headerCell = container.querySelector('.decoder-stage-table__header-cell--activation')
      setActivationColumnWidth(headerCell.getBoundingClientRect().width)
    }

    measureActivationColumn()
    const observer = new ResizeObserver(measureActivationColumn)
    observer.observe(tableContainerRef.current)
  }, [])
  Purpose: Pass accurate width to ActivationExample for proper text wrapping

  3. Hover Coordination (Lines 960-971, 986-997)

  Both activation example columns share hover logic:
  - Set hoveredPairKey to synchronize highlighting
  - Call handleBadgeInteraction() to show green highlights
  - Clear on hover leave

  4. Canonical Pair Keys

  Everywhere: Uses ${min(id1,id2)}-${max(id1,id2)} format
  - Ensures (123,456) and (456,123) map to same key: "123-456"
  - Critical for deduplication and state lookups

  ---
  📈 Performance Optimizations

  1. Virtual Scrolling: Only renders visible rows (~5-10) from potentially thousands
  2. useMemo Memoization: stageContext, stageFeatures, stageRows, sortedRows, getInterFeaturePositions
  3. RAF Throttling: Scroll state updates use requestAnimationFrame
  4. Request Deduplication: requestedFeatureIds ref prevents duplicate API calls
  5. State Change Detection: Only updates scroll state if values actually changed

  ---
  🐛 Known Issues & TODOs

  Temporary Activation Fetching (Lines 587-639)

  Issue: Additional features appear in decoder similarity stage that weren't in initial 824-row table

  Current Fix: Fetch missing activation examples on demand

  Proper Solutions:
  1. Pre-fetch all 16,384 features on startup
  2. Implement pagination with on-demand loading
  3. Load full dataset initially

  ---
  🎯 Data Flow Summary

  1. User selects decoder similarity stage
     ↓
  2. stageContext computed from activeStageNodeId
     ↓
  3. stageFeatures filtered from tableData
     ↓
  4. stageRows created (pairs with top 4 similar features)
     ↓
  5. sortedRows sorted by selected mode
     ↓
  6. Virtual scrolling renders visible rows
     ↓
  7. User interactions:
     - Click decoder circle → Toggle inter-feature highlighting
     - Hover activation → Show temporary green highlights
     - Click row → Toggle pair selection (fragmented/monosemantic)
     - Click badge → Cycle selection state
     ↓
  8. State updates trigger re-render with updated styling

  ---
  🔑 Key Takeaways

  1. Pair-Based Analysis: Unlike other tables (feature-based), this shows feature pairs with
  similarity relationships
  2. Inter-Feature Highlighting: Sophisticated system for showing shared patterns between feature
  pairs (char/word n-grams)
  3. Centralized Circle Rendering: Uses TableScoreCircle for decoder similarity visualization
  4. Three-Tier Sorting: Selected → Unselected (by ML score) → Rejected for efficient manual review
  5. Virtual Scrolling: Essential for performance with large pair counts (hundreds to thousands)
  6. Canonical Keys: Critical design pattern for pair deduplication and state management