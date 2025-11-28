# Frontend CLAUDE.md - SAE Feature Visualization React Application

Professional guidance for the React frontend of the SAE Feature Visualization research prototype.

## Frontend Architecture Overview

**Purpose**: Interactive visualization interface for exploring SAE feature explanation reliability
**Status**: Conference-ready research prototype
**Dataset**: 16,000+ features
**Key Innovation**: Smart tree-based Sankey building with frontend-side set intersection

## Important Development Principles

### This is a Conference Prototype
- **Avoid over-engineering**: Use straightforward React patterns suitable for research demonstrations
- **Simple solutions first**: Don't add complex state management, optimization, or abstraction unless clearly needed
- **Research-focused**: Prioritize easy modification and exploration over production patterns
- **Demo reliability**: Code should work reliably for demonstrations

### Code Quality Guidelines

**Before Making Changes:**
1. **Search existing code**: Use Grep to find similar components or utilities before creating new ones
2. **Check lib/ directory**: Many D3 utilities and helpers already exist - reuse or extend them
3. **Review store/**: Understand existing state management patterns before adding new state
4. **Ask about patterns**: If implementing something that feels common, check if it exists first

**After Making Changes:**
1. **Remove dead code**: Delete unused components, functions, and imports
2. **Clean up styles**: Remove unused CSS classes, especially in component-specific CSS files
3. **Update types**: Keep types.ts synchronized with your changes
4. **Run linter**: `npm run lint` to catch errors and warnings

## Core Architecture

### Tree-Based Sankey Building
Instead of backend computing the entire tree, frontend builds it dynamically:

```typescript
// Backend sends simple groups, frontend builds tree
Backend: {groups: [{feature_ids, range_label}]}
Frontend: Tree Building with Set Intersection

// Cache feature groups globally
featureGroupCache["semdist_mean:0.3,0.7"] = response.groups

// Build Sankey tree using set intersection
function buildChildNodes(parent: SankeyTreeNode, groups: FeatureGroup[]) {
  for (const group of groups) {
    const childFeatures = intersection(parent.featureIds, group.feature_ids)
    if (childFeatures.size > 0) {
      createChildNode(parent, childFeatures, group.range_label)
    }
  }
}
```

**Performance Benefits**:
- **Cache Hit**: Instant tree rebuild (no backend call)
- **Cache Miss**: ~50ms for new feature groups
- **Set Intersection**: O(min(|A|,|B|)) complexity
- **Threshold Changes**: Local recomputation only

### Zustand State Management (Modularized)
```
store/
├── index.ts                          # Main store composition
├── sankey-actions.ts                 # Sankey tree operations
├── table-actions-quality.ts          # Quality table mode
├── table-actions-feature-splitting.ts # Pair mode (clustering, similarity)
├── table-actions-cause.ts            # Cause table mode
├── table-actions-common.ts           # Shared table operations
├── activation-actions.ts             # Activation data
└── utils.ts                          # Store helper functions
```

## Key Components

### Main Views

**App.tsx** - Main Orchestrator
- Health check on startup
- View state management
- Layout orchestration based on active stage

**SankeyDiagram.tsx** - Tree Visualization
- D3-Sankey integration
- Inline histogram rendering
- Node click handling → SankeyOverlay
- Threshold handle integration

**FeatureSplitView.tsx** - Feature Splitting Workflow
- Pair list with clustering
- FeatureSplitPairViewer for pair analysis
- TagAutomaticPanel for histogram-based tagging
- Commit history for state snapshots
- Apply Tags workflow with sort capture

**QualityTable.tsx** - Quality Assessment Table
- Feature scores display
- Explanation highlighting
- Mode-specific rendering (quality/cause)

### Selection & Tagging

**SelectionPanel.tsx** - Unified Selection Interface
- Handles 3 modes: feature, pair, cause
- Selection state bar with 4 categories
- Commit history circles for pair mode
- Auto-tagging preview integration

**SelectionBar.tsx** - Selection State Visualization
- Vertical/horizontal stacked bar
- 4 categories: confirmed, expanded, rejected, unsure
- Preview state with stripe pattern overlay
- Interactive category filtering

**TagStagePanel.tsx** - Tag Stage Management
- 3-stage workflow: Quality → Feature Splitting → Cause
- Stage activation and navigation

**TagAutomaticPanel.tsx** - Automatic Tagging
- Histogram-based threshold configuration
- Dual thresholds (select/reject)
- Real-time preview

### Visualization Components

**SankeyHistogramPopover.tsx** - Threshold Editing
- Histogram visualization
- Draggable threshold handles
- Portal-based rendering

**FeatureSplitPairViewer.tsx** - Pair Analysis
- Interactive pair exploration
- Decoder similarity visualization
- Selection/rejection interface

**ScrollableItemList.tsx** - Pair Lists
- Scrollable list with fixed height
- Color-coded selection states
- Click handlers for navigation

## Feature Splitting Workflow

The Feature Splitting stage implements a sophisticated tagging workflow:

### 1. Clustering
- Backend clusters features by decoder weight similarity
- Frontend fetches all pairs for selected Sankey segment
- Pairs organized by cluster

### 2. Manual Tagging
- User selects/rejects pairs manually
- Selection states: selected, rejected, or null

### 3. Similarity Scoring
- After manual tagging, user can "Sort by Similarity"
- Backend scores all pairs based on similarity to selected/rejected examples
- Pairs sorted by score (most similar to selected at top)

### 4. Auto-Tagging
- Histogram shows distribution of similarity scores
- User adjusts select/reject thresholds
- "Apply Tags" applies thresholds to untagged pairs
- Sort order captured at apply time for uncertainty-based ordering

### 5. Commit History
- Each "Apply Tags" creates a new commit
- User can navigate back to previous states
- Maximum 10 commits stored

## Project Structure

```
frontend/src/
├── components/                    # React Components
│   ├── App.tsx                   # Main application
│   ├── SankeyDiagram.tsx         # Sankey visualization
│   ├── SankeyOverlay.tsx         # Stage addition interface
│   ├── SankeyHistogramPopover.tsx # Histogram popover
│   ├── FeatureSplitView.tsx      # Feature splitting workflow
│   ├── FeatureSplitPairViewer.tsx # Pair viewer
│   ├── QualityTable.tsx          # Quality/Cause table
│   ├── CauseTable.tsx            # Root cause table
│   ├── SelectionPanel.tsx        # Unified selection panel
│   ├── SelectionBar.tsx          # Selection state bar
│   ├── TagStagePanel.tsx         # Stage navigation
│   ├── TagAutomaticPanel.tsx     # Auto-tagging controls
│   ├── TagAutomaticPopover.tsx   # Threshold tagging popover
│   ├── ScrollableItemList.tsx    # Scrollable pair list
│   ├── ActivationExample.tsx     # Activation display
│   ├── TableExplanation.tsx      # Explanation text
│   ├── QualityScoreBreakdown.tsx # Score breakdown
│   └── AppHeader.tsx             # Header
├── lib/                          # Utilities
│   ├── constants.ts              # App constants
│   ├── sankey-utils.ts           # Sankey calculations
│   ├── sankey-histogram-utils.ts # Inline histograms
│   ├── histogram-utils.ts        # Histogram processing
│   ├── table-utils.ts            # Table layout
│   ├── color-utils.tsx           # Color encoding
│   ├── tag-system.ts             # Tag colors/labels
│   ├── utils.ts                  # General helpers
│   └── ...                       # Other utilities
├── store/                        # Zustand State
│   ├── index.ts                  # Main store
│   ├── sankey-actions.ts         # Sankey operations
│   ├── table-actions-*.ts        # Mode-specific actions
│   └── ...
├── styles/                       # CSS Files
│   └── *.css                     # Component styles
├── types.ts                      # TypeScript types
├── api.ts                        # API client
└── main.tsx                      # Entry point
```

## Development Workflow

### Starting Development
```bash
cd frontend
npm install
npm run dev -- --port 3003
```

### Build & Lint
```bash
npm run build      # Production build
npm run lint       # ESLint check
npx tsc --noEmit   # Type check
```

## Key Implementation Patterns

### React-D3 Integration
```typescript
function SankeyDiagram() {
  const svgRef = useRef<SVGSVGElement>(null)

  // D3 calculations in useMemo
  const {nodes, links} = useMemo(() => {
    return calculateSankeyLayout(sankeyData, width, height)
  }, [sankeyData, width, height])

  // React renders using D3-calculated positions
  return (
    <svg ref={svgRef}>
      {nodes.map(node => (
        <g key={node.id} transform={`translate(${node.x0},${node.y0})`}>
          {/* Node rendering */}
        </g>
      ))}
    </svg>
  )
}
```

### State Management Rules
1. **Never mutate state directly** - Use Zustand actions
2. **Keep derived state in useMemo** - Don't store computed values
3. **Use proper typing** - All state must be typed
4. **Action naming** - Use verb prefixes (set, update, fetch, etc.)

### Performance Patterns
```typescript
// Memoization for expensive calculations
const processedData = useMemo(() => computeExpensiveData(rawData), [rawData])

// React.memo for expensive components
export const ExpensiveViz = React.memo(({data}) => {
  // Component
})

// Debouncing for user interactions
const debouncedUpdate = useMemo(
  () => debounce(updateThresholds, 300),
  [updateThresholds]
)
```

## Common Issues & Solutions

### Issue: Sankey not updating after threshold change
**Solution**: Ensure `recomputeSankeyTree()` is called after tree modification

### Issue: API calls failing with CORS
**Solution**: Backend must include frontend port in CORS origins

### Issue: State updates not reflected
**Solution**: Check Zustand action is properly updating state

### Issue: Hook dependency warnings
**Solution**: Either add dependencies or use eslint-disable with explanation

---

## Remember

**This is a research prototype for conference demonstrations**

When working on frontend code:
- **Avoid over-engineering**: Use simple React patterns
- **Clean up after changes**: Remove unused components, functions, styles, imports
- **Reuse existing code**: Check lib/, store/, components/ first
- **Run linter**: Always check `npm run lint` before committing

The goal is a flexible, maintainable visualization tool, not a production application.
