# Table Selection to Sankey Diagram Integration - Stage 1 Implementation

## Overview
Implemented real-time Sankey diagram updates when users select features in the FeatureSplitTable for Stage 1 (Feature Splitting).

## Implementation Details

### 1. Store Actions

#### Existing Action: `updateCandidateNodeLinks` (sankey-actions.ts)
- Already existed in the codebase
- Takes a candidateNodeId and redistributes features between three destination nodes:
  - **Rejected** → Monosemantic (flows back to below-threshold node)
  - **Unsure** → Default state for unreviewed features
  - **Selected** → Fragmented (above-threshold confirmed)

### 2. Modified Actions

#### `togglePairSelection` (index.ts)
Enhanced to:
1. Update pair selection states (existing functionality)
2. Derive feature selection states from pair selections
3. Trigger Sankey updates when viewing a candidate node

**Logic for deriving feature states:**
- If ANY pair involving the feature is 'selected' → feature is 'selected' (Fragmented)
- If ALL pairs involving the feature are 'rejected' → feature is 'rejected' (Monosemantic)
- Otherwise → feature is null/unsure

#### `clearPairSelection` (index.ts)
Enhanced to:
1. Clear pair selection states (existing functionality)
2. Clear feature selection states
3. Trigger Sankey updates to reset all features to Unsure

### 3. Data Flow

1. **User clicks checkbox in FeatureSplitTable**
   - Calls `togglePairSelection(mainFeatureId, similarFeatureId)`

2. **State Update**
   - Pair selection state cycles: null → selected → rejected → null
   - Feature selection states derived from all pairs

3. **Sankey Update**
   - If viewing a candidate node, calls `updateCandidateNodeLinks`
   - Redistributes features between the three destination nodes
   - Recomputes Sankey tree to update visualization

4. **Visual Result**
   - Links from candidate node update in real-time
   - Features flow between Unsure, Fragmented, and Monosemantic nodes

## Testing Instructions

### Test Scenario 1: Basic Feature Selection
1. Navigate to http://localhost:3003
2. Stage 1 (Feature Splitting) should auto-activate
3. Verify candidate node shows "Review" label
4. Verify Unsure node appears at rightmost with 464 features

5. **Select a feature as Fragmented:**
   - Click checkbox in table → turns to checkmark (✓)
   - Feature should move from Unsure → Fragmented node
   - Link from candidate → Fragmented should appear/update

6. **Reject a feature as Monosemantic:**
   - Click checkbox again → turns to X
   - Feature should flow from Unsure → Monosemantic node
   - Link from candidate → Monosemantic should increase

7. **Reset to Unsure:**
   - Click checkbox third time → returns to empty
   - Feature should return to Unsure node

### Test Scenario 2: Multiple Features
1. Select multiple features (click multiple checkboxes)
2. Verify counts update correctly in Sankey links
3. Mix of selected and rejected features should distribute properly

### Test Scenario 3: Clear All
1. Select/reject several features
2. Use clear selection function (if available)
3. All features should return to Unsure node

## Expected Visual Layout

```
Stage 1 View:
                                           ┌────────────────┐
Root(6583) ────────────────────────────┬──→│ Monosemantic  │ (terminal)
                                       │   │  (6119 + X)   │ ← rejected features
                                       │   └────────────────┘
                                       │
                                       │   ┌─────────────┐    ┌──────────┐
                                       └──→│  Candidate  │───→│  Unsure  │ (rightmost)
                                           │   (464)     │    │  (Y)     │
                                           └─────────────┘    └──────────┘
                                                    │
                                                    └────────→ Fragmented (Z)
                                                               (if selected)

Where: X + Y + Z = 464 (total features in candidate)
```

## Technical Notes

### Candidate Node Structure
- Has property `candidateDestinations` with three node IDs:
  - `rejected`: Links back to Monosemantic
  - `unsure`: Shows at rightmost (yellow)
  - `selected`: Shows at rightmost (Fragmented)

### Feature State Mapping
- Pair selection states are stored per pair: `"featureId1-featureId2"`
- Feature selection states are derived and stored per feature
- The derivation logic ensures consistent behavior across all pairs

## Known Limitations

1. **Single Stage Support**: Currently only implemented for Stage 1 (Feature Splitting)
2. **Manual Selection Only**: Automatic tagging integration may need additional work
3. **Left Panel Only**: Currently hardcoded to PANEL_LEFT

## Next Steps

To extend to other stages (Quality, Cause):
1. Check for different candidate node types
2. Apply similar logic but with different destination labels
3. Ensure proper tag mappings for each stage