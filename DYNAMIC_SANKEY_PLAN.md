# Dynamic Sankey Diagram Growth Plan

## Executive Summary
Transform the current fixed 3-stage Sankey diagram into a dynamic, user-driven visualization where stages are added incrementally based on user interaction. Users start with only the root node and progressively build their analysis pipeline by selecting which stage to add at each step.

## Core Concept
- **Start Simple**: Begin with only root node showing all features
- **User-Driven Growth**: Click nodes to add new stages
- **Flexible Ordering**: Any stage can be added in any order
- **Real-time Updates**: Sankey diagram grows dynamically as stages are added
- **Threshold Configuration**: Each new stage requires threshold configuration via histogram

## Implementation Architecture

### Phase 1: Foundation (Week 1)
**Goal**: Establish core dynamic stage management system

#### 1.1 Dynamic Threshold Tree Builder
```typescript
// New file: frontend/src/lib/dynamic-tree-builder.ts
interface DynamicTreeBuilder {
  addStage(parentNodeId: string, stageType: StageType, config: StageConfig): ThresholdTreeV2
  removeStage(nodeId: string): ThresholdTreeV2
  canAddStage(nodeId: string): StageType[]
  getAvailableStages(currentTree: ThresholdTreeV2): StageType[]
}
```

#### 1.2 Stage Configuration Types
```typescript
// Update frontend/src/types.ts
type StageType = 'feature_splitting' | 'semantic_distance' | 'score_agreement'

interface StageConfig {
  stageType: StageType
  metric?: string
  thresholds?: number[]
  scoringMethods?: string[]  // For score agreement
}

interface DynamicSankeyState {
  tree: ThresholdTreeV2
  selectedNode: string | null
  stageSelectionOpen: boolean
  availableStages: StageType[]
}
```

### Phase 2: User Interface Components (Week 1-2)
**Goal**: Create intuitive UI for stage selection and configuration

#### 2.1 Stage Selection Popup
```typescript
// New component: frontend/src/components/StageSelectionPopup.tsx
interface StageSelectionPopupProps {
  nodeId: string
  nodeName: string
  availableStages: StageType[]
  position: { x: number, y: number }
  onStageSelect: (stage: StageType) => void
  onClose: () => void
}
```

Features:
- Clean card-based UI with stage options
- Stage descriptions and icons
- Disable already-used stages (if applicable)
- Position near clicked node

#### 2.2 Enhanced Node Interaction
```typescript
// Update SankeyDiagram.tsx
const handleNodeClick = (node: D3SankeyNode) => {
  if (node.id === 'root' || isLeafNode(node)) {
    // Show stage selection popup
    showStageSelection(node)
  } else {
    // Show histogram for reconfiguration
    showHistogram(node)
  }
}
```

### Phase 3: Dynamic Data Flow (Week 2)
**Goal**: Implement progressive data fetching and visualization updates

#### 3.1 Progressive Data Loading
```typescript
// Update store.ts
interface AppState {
  // Add dynamic sankey specific state
  dynamicMode: boolean
  stageHistory: StageAddition[]

  // New actions
  addStageToTree: (parentId: string, stage: StageType) => void
  configureStage: (nodeId: string, config: StageConfig) => void
  removeStageFromTree: (nodeId: string) => void
  fetchDynamicSankeyData: () => Promise<void>
}

interface StageAddition {
  parentId: string
  stage: StageType
  config: StageConfig
  timestamp: number
}
```

#### 3.2 API Integration Updates
```typescript
// Update api.ts
export async function getSankeyDataDynamic(
  filters: Filters,
  partialTree: ThresholdTreeV2
): Promise<SankeyData> {
  // Send partial tree to backend
  // Backend processes only configured stages
}
```

### Phase 4: Stage-Specific Configuration (Week 2-3)
**Goal**: Implement threshold configuration for each stage type

#### 4.1 Feature Splitting Configuration
- Single threshold (binary split: true/false)
- Default: 0.5
- Histogram shows feature_splitting metric

#### 4.2 Semantic Distance Configuration
- Single threshold (binary split: high/low)
- Default: 0.5
- Histogram shows semdist_mean metric

#### 4.3 Score Agreement Configuration
- Multiple thresholds (one per scoring method)
- User selects which scores to use (2-N scores)
- Shows multiple histograms in popover
- Creates N+1 branches based on agreement patterns

### Phase 5: Visual Feedback & Polish (Week 3)
**Goal**: Enhance user experience with visual cues

#### 5.1 Visual States
```typescript
interface NodeVisualState {
  isExpandable: boolean      // Can add child stages
  isConfigurable: boolean    // Has thresholds to adjust
  isProcessing: boolean      // Currently loading data
  hasChildren: boolean       // Already has child stages
}
```

#### 5.2 Interactive Hints
- Pulsing animation on expandable nodes
- "+" icon overlay on hover for expandable nodes
- Gear icon for configurable nodes
- Loading spinner during data fetch

### Phase 6: State Management (Week 3-4)
**Goal**: Robust state handling for dynamic trees

#### 6.1 Tree Validation
```typescript
// New file: frontend/src/lib/tree-validator.ts
interface TreeValidator {
  isValidTree(tree: ThresholdTreeV2): boolean
  validateStageAddition(tree: ThresholdTreeV2, parent: string, stage: StageType): ValidationResult
  getTreeDepth(tree: ThresholdTreeV2): number
  getTreeComplexity(tree: ThresholdTreeV2): number
}
```

#### 6.2 Undo/Redo Support
```typescript
interface HistoryState {
  past: ThresholdTreeV2[]
  present: ThresholdTreeV2
  future: ThresholdTreeV2[]

  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}
```

## Backend Modifications

### API Endpoint Updates
```python
# backend/app/api/sankey.py
@router.post("/sankey-data-dynamic")
async def get_dynamic_sankey_data(request: DynamicSankeyRequest):
    """
    Process partial threshold tree and return sankey data
    Only processes stages that are configured in the tree
    """
    # Validate partial tree
    # Apply only configured stages
    # Return sankey nodes/links for configured stages
```

### Dynamic Classification
```python
# backend/app/services/classification.py
class DynamicClassificationEngine:
    def classify_partial_tree(self, df, partial_tree):
        """Classify features through partial tree only"""
        # Stop at leaf nodes even if more stages could be added
        # Return intermediate classification results
```

## User Flow Example

1. **Initial State**
   - User sees only root node with 1,648 features
   - Root node has pulsing "+" indicator

2. **First Click - Add Feature Splitting**
   - User clicks root node
   - Popup shows 3 options: Feature Splitting, Semantic Distance, Score Agreement
   - User selects "Feature Splitting"
   - Histogram popup appears for feature_splitting metric
   - User adjusts threshold to 0.8
   - Clicks "Apply"
   - Sankey updates: Root → [False: 1,200, True: 448]

3. **Second Click - Add Semantic Distance to "True" branch**
   - User clicks "True" node
   - Popup shows remaining options
   - User selects "Semantic Distance"
   - Histogram for semdist_mean appears
   - User sets threshold to 0.3
   - Sankey updates: True → [Low: 300, High: 148]

4. **Third Click - Add Score Agreement to "Low" branch**
   - User clicks "Low" node under semantic distance
   - Selects "Score Agreement"
   - Multi-histogram popup shows 3 scores
   - User configures thresholds
   - Sankey updates with agreement patterns

## Benefits of This Approach

1. **User Control**: Complete control over analysis pipeline
2. **Exploratory**: Try different stage orderings easily
3. **Incremental**: Build complexity gradually
4. **Intuitive**: Click-to-expand is natural interaction
5. **Flexible**: Any ordering of stages is possible
6. **Manageable**: Each stage is independent module

## Implementation Priority

### Week 1: Core Foundation
- [ ] Dynamic tree builder utilities
- [ ] Basic stage selection UI
- [ ] Update store for dynamic mode

### Week 2: Stage Configuration
- [ ] Histogram-based threshold configuration
- [ ] Stage-specific configuration logic
- [ ] API integration for partial trees

### Week 3: Visual Polish
- [ ] Node visual states and hints
- [ ] Smooth transitions on growth
- [ ] Loading states and feedback

### Week 4: Robustness
- [ ] Tree validation
- [ ] Error handling
- [ ] Undo/redo support
- [ ] Save/load tree configurations

## Key Design Principles

1. **Progressive Disclosure**: Start simple, reveal complexity as needed
2. **Direct Manipulation**: Click on what you want to change
3. **Immediate Feedback**: Show results instantly after configuration
4. **Reversibility**: Allow undoing stage additions
5. **Consistency**: Same interaction pattern for all stages

## Technical Considerations

### Performance
- Lazy load stage data only when needed
- Cache intermediate results
- Debounce threshold adjustments
- Use React.memo for node components

### State Management
- Single source of truth in Zustand store
- Immutable tree updates
- Optimistic UI updates with rollback

### Error Handling
- Graceful degradation if stage fails
- Clear error messages
- Retry mechanisms
- Fallback to last valid state

### Testing Strategy
- Unit tests for tree builder logic
- Integration tests for stage addition flow
- E2E tests for complete user journeys
- Performance tests for large trees

## Migration Path

1. **Phase 1**: Add dynamic mode toggle (keep existing mode)
2. **Phase 2**: Implement dynamic features behind flag
3. **Phase 3**: Test with subset of users
4. **Phase 4**: Gradual rollout
5. **Phase 5**: Deprecate fixed mode

## Success Metrics

- **Usability**: Time to build first 3-stage tree
- **Flexibility**: Number of unique tree configurations created
- **Performance**: Time to update after stage addition
- **Reliability**: Error rate in stage configuration
- **Adoption**: Percentage using dynamic vs fixed mode

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Complex state management | High | Use immutable updates, comprehensive testing |
| Performance with many stages | Medium | Implement stage limit (max 5-6 levels) |
| User confusion | Medium | Add tutorial/guided mode |
| Backend compatibility | Low | Version API endpoints |

## Conclusion

This dynamic sankey approach transforms the visualization from a fixed pipeline into a flexible exploration tool. By starting with just the root and letting users build their analysis step-by-step, we create a more intuitive and powerful interface while keeping the implementation manageable and maintainable.

The key is progressive disclosure - showing only what's needed at each step, and building complexity only when the user requests it. This makes the tool accessible to beginners while still powerful for advanced users.