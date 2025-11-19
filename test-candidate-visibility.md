# Candidate Node Visibility at Stage 1 - Implementation

## Changes Made

### 1. Visibility Logic Updates (threshold-utils.ts)

**Enhanced visibility filter to include candidate children:**
- When `maxVisibleStage` is set (e.g., stage 1), candidate nodes at that stage now include their child destination nodes
- Special case: nodes at `maxVisibleStage + 1` are included if their parent is a candidate at `maxVisibleStage`

**Key changes:**
- Lines 319-347: Updated first pass to include candidate children in maxDepth/maxStage calculation
- Lines 339-353: Added special visibility logic for candidate children in visibleNodeIds set
- Lines 369-383: Skip rejected destination nodes (they don't appear visually)

### 2. Node Positioning (threshold-utils.ts)

**Candidate destination nodes positioned at rightmost:**
- Lines 392-399: Added special positioning logic for candidate destinations
- Unsure and Selected/Fragmented nodes appear at `maxStage` (rightmost position)
- They appear as vertical bars at the end of the flow

### 3. Link Routing (threshold-utils.ts)

**Special link handling for candidate nodes:**
- Lines 436-473: Implemented special link creation for candidates
- **Unsure node**: Normal link from candidate → unsure (at rightmost)
- **Selected/Fragmented node**: Normal link from candidate → selected (at rightmost)
- **Rejected features**: Link routes back from candidate → below-threshold sibling (e.g., Monosemantic)

## Expected Behavior

### When viewing Stage 1 (Feature Splitting):

```
Visual Layout:
                                           ┌────────────┐
Root(6583) ────────────────────────────┬──→│Monosemantic│ (terminal, green)
                                       │   │   (6119)   │
                                       │   └────────────┘
                                       │         ↑
                                       │         │ (rejected features)
                                       │         │
                                       │   ┌─────────────┐    ┌────────┐
                                       └──→│  Candidate  │───→│ Unsure │ (rightmost, yellow)
                                           │ (Review-464)│    │ (464)  │
                                           └─────────────┘    └────────┘
                                                    │
                                                    └────────→ [Fragmented] (if selected)
```

### Feature Flow:

1. **Initial state**: All 464 features in candidate flow to Unsure node
2. **User selects features as fragmented**: Features move from Unsure → Fragmented
3. **User rejects features as monosemantic**: Features flow back to Monosemantic node
4. **Dynamic updates**: As table selection changes, links update in real-time

### Key Features:

- ✅ Candidate node visible at its position (between stages)
- ✅ Unsure node visible at rightmost with all unreviewed features
- ✅ Fragmented node ready for selected features
- ✅ Rejected features flow back to Monosemantic (below-threshold)
- ✅ No separate rejected node shown (features merge with Monosemantic)

## Testing Steps

1. Navigate to http://localhost:3003
2. View should auto-initialize with Feature Splitting stage active
3. Verify Unsure node appears at rightmost position with 464 features
4. Check that candidate node shows "Review" label
5. The table should show features from the candidate node when selected

## Note on Table Integration

The current implementation handles the Sankey diagram visualization part. The table selection integration (moving features between destinations based on user actions) may require additional implementation in:

1. **Table selection actions**: Functions to move features between candidate destinations
2. **Store updates**: Actions to update feature distribution in candidate child nodes
3. **TableSelectionBar**: Visual feedback for current selection state

The infrastructure is in place:
- Candidate nodes have `candidateDestinations` property with rejected/unsure/selected node IDs
- Links are properly routed (rejected → below-threshold, unsure/selected → rightmost)
- Node visibility and positioning work correctly

## Technical Details

The implementation uses:
- Integer stages for d3-sankey compatibility
- `isBetweenStages` flag for visual positioning of candidates
- Special visibility override for candidate children at maxVisibleStage
- Link routing logic to handle rejected features flowing back