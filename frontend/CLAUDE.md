# Frontend CLAUDE.md

This file provides guidance to Claude Code when working with the React frontend for the SAE Feature Visualization project.

## Sprint 1: Single Sankey Visualization (✅ COMPLETED)
## Sprint 2: Advanced Histogram Interactions (🔄 IN PROGRESS)

### Overview
Sprint 1 is complete with full React application, TypeScript, D3.js integration, and single Sankey diagram functionality. Sprint 2 development has begun with advanced histogram popover interactions and multi-histogram support, laying groundwork for Phase 2 dual Sankey comparisons.

### Project Structure
```
frontend/
├── src/
│   ├── components/          # Reusable UI components (Modular Architecture)
│   │   ├── FilterPanel.tsx  # Multi-select filter dropdowns
│   │   ├── HistogramSlider.tsx  # Histogram with threshold slider
│   │   ├── HistogramPopover/    # 🆕 Advanced histogram popover (modular)
│   │   │   ├── index.tsx
│   │   │   ├── IndividualHistogram.tsx
│   │   │   ├── MultiHistogramView.tsx
│   │   │   ├── SingleHistogramView.tsx
│   │   │   ├── PopoverFooter.tsx
│   │   │   ├── PopoverHeader.tsx
│   │   │   ├── hooks/
│   │   │   └── utils/
│   │   ├── SankeyDiagram/       # D3-powered Sankey visualization (modular)
│   │   │   ├── SankeyHeader.tsx
│   │   │   ├── SankeyLegend.tsx
│   │   │   ├── SankeyLink.tsx
│   │   │   ├── SankeyNode.tsx
│   │   │   ├── SankeyStageLabels.tsx
│   │   │   ├── hooks/
│   │   │   └── utils/
│   │   ├── shared/              # Shared reusable components
│   │   │   ├── ErrorMessage.tsx
│   │   │   ├── FilterDropdown.tsx
│   │   │   ├── MetricSelector.tsx
│   │   │   └── Tooltip.tsx
│   │   └── LoadingSpinner.tsx   # Loading states
│   ├── hooks/               # Custom hooks
│   │   ├── index.ts
│   │   ├── useClickOutside.ts
│   │   ├── useDragHandler.ts
│   │   └── useResizeObserver.ts
│   ├── views/               # Page-level components
│   │   └── SankeyView.tsx   # Single Sankey container (Phase 1)
│   ├── services/            # API integration layer
│   │   ├── api.ts           # API client with typed requests/responses
│   │   └── types.ts         # TypeScript interfaces for API data
│   ├── stores/              # Zustand state management (Slice-based Architecture)
│   │   ├── visualizationStore.ts  # Main store re-exports
│   │   └── visualization/     # Modular store structure
│   │       ├── index.ts
│   │       ├── selectors.ts
│   │       ├── constants.ts
│   │       ├── types.ts
│   │       ├── utils.ts
│   │       └── slices/
│   │           ├── filterSlice.ts
│   │           ├── thresholdSlice.ts
│   │           ├── popoverSlice.ts
│   │           └── apiSlice.ts
│   ├── utils/               # Helper functions
│   │   ├── d3-helpers.ts    # D3 calculation utilities
│   │   └── formatters.ts    # Data formatting utilities
│   ├── styles/              # CSS and styling
│   │   └── globals.css      # Global styles
│   ├── App.css              # Application-specific styles
│   ├── index.css            # Base styles
│   ├── App.tsx              # Main application component
│   ├── main.tsx             # Application entry point
│   └── vite-env.d.ts        # Vite type declarations
├── package.json
├── tsconfig.json
├── vite.config.ts
└── index.html
```

### Technologies Used
- **React 19.1.1** with TypeScript for component development
- **Vite 7.1.6** for fast development and building
- **D3.js ecosystem** (d3-sankey, d3-scale, d3-array, d3-selection, d3-transition, d3-interpolate) for data visualization
- **Zustand 5.0.8** for lightweight state management
- **Axios 1.12.2** for HTTP client with interceptors
- **Portal-based tooltips** for advanced UI interactions
- **Custom CSS** with responsive design patterns

### Development Commands
```bash
cd frontend

# Install dependencies
npm install

# Start development server (runs on http://localhost:3000)
npm run dev

# Start on specific port (currently running on 3003)
npm run dev -- --port 3003

# Build for production
npm run build

# Preview production build
npm run preview

# Type checking
npm run type-check
```

### Backend API Integration
- **Default Backend URL**: http://localhost:8003 (configurable via environment variables)
- **Proxy Configuration**: Vite dev server proxies `/api/*` to backend for API calls
- **Health Check**: Direct connection to `/health` endpoint using configurable URL
- **API Endpoints Used**:
  - `GET /api/filter-options` - Populate filter dropdowns
  - `POST /api/histogram-data` - Generate histogram for threshold slider
  - `POST /api/sankey-data` - Generate Sankey diagram data
  - `GET /health` - Backend health check (not proxied)

### Environment Configuration
The application supports flexible backend URL configuration:

```bash
# Copy example environment file
cp .env.example .env

# Edit .env to match your backend configuration
VITE_API_BASE_URL=http://localhost:8003  # Your backend URL
VITE_HEALTH_URL=http://localhost:8003    # Optional: separate health URL
```

**Automatic Environment Detection:**
- **Development**: Defaults to `http://localhost:8003`
- **Production**: Uses `window.location.origin` (same-origin deployment)
- **Custom**: Override with `VITE_API_BASE_URL` environment variable

### State Management
The application uses a **slice-based Zustand architecture** for scalable and maintainable state management:

```typescript
// Main store combines all slices
export const useVisualizationStore = create<VisualizationState>()(
  devtools(
    (...a) => ({
      ...createFilterSlice(...a),
      ...createThresholdSlice(...a),
      ...createPopoverSlice(...a),
      ...createApiSlice(...a)
    }),
    { name: 'visualization-store' }
  )
)
```

**Modular Slice Architecture:**
- **`filterSlice.ts`**: Manages filter state (sae_id, explanation_method, llm_explainer, llm_scorer)
- **`thresholdSlice.ts`**: Handles threshold values (semdist_mean, score_high) with validation
- **`popoverSlice.ts`**: Controls popover visibility and positioning state
- **`apiSlice.ts`**: Manages API data (filterOptions, histogramData, sankeyData) and loading states

**Supporting Infrastructure:**
- **`selectors.ts`**: Centralized, memoized selector functions for efficient state access
- **`constants.ts`**: Type-safe constants for default values and state keys
- **`types.ts`**: Comprehensive TypeScript interfaces for all state shapes
- **`utils.ts`**: Helper functions for state transformations and validations

**Key Benefits:**
- **Separation of Concerns**: Each slice handles a specific domain of state
- **Type Safety**: Full TypeScript integration with modular type definitions
- **Developer Experience**: Redux DevTools integration for debugging
- **Maintainability**: Easy to extend and modify individual slices
- **Performance**: Efficient re-rendering through precise selector usage

### Component Architecture

#### FilterPanel Component
- Fetches available filter options from `/api/filter-options` on mount
- Renders multi-select dropdowns for each filter type
- Updates global state when selections change
- Shows loading states during API calls

#### HistogramSlider Component
- Displays histogram for `semdist_mean` metric distribution
- Overlays interactive threshold slider
- Fetches data from `/api/histogram-data` based on current filters
- Debounces slider movements to prevent excessive API calls
- Uses D3 for histogram rendering and React for DOM management

#### SankeyDiagram Component
- Uses `d3-sankey` for layout calculations
- Renders nodes and links as React SVG elements
- Animates transitions when data changes
- Includes hover states and tooltips
- Handles both loading and error states

#### HistogramPopover Component (🆕 NEW - Sprint 2)
- **Advanced popover system** with portal-based rendering for histogram interactions
- **Multi-histogram support** enabling comparison visualizations
- **Sophisticated tooltip system** with dynamic positioning and rich content formatting
- **Complex layout calculations** using multiple D3 helper functions
- **Threshold interaction** with visual feedback and real-time updates
- **Performance optimized** with proper cleanup and event management

#### SankeyView Container
- Orchestrates FilterPanel, HistogramSlider, HistogramPopover, and SankeyDiagram
- Manages API calls and data flow
- Handles error states and loading indicators
- Coordinates filter changes with visualization updates

### API Error Handling
The application handles all API error codes defined in the backend:
- `INVALID_FILTERS` - Shows user-friendly validation messages
- `INSUFFICIENT_DATA` - Displays helpful guidance for filter adjustment
- `INTERNAL_ERROR` - Shows generic error message with retry option

### Performance Optimizations
- **Debounced API calls** for slider interactions (300ms delay)
- **React.memo** for expensive visualization components
- **useMemo/useCallback** for D3 calculations and event handlers
- **Proper cleanup** of D3 event listeners and timers

### Development Guidelines
1. **Type Safety**: All API responses and component props are fully typed
2. **Error Boundaries**: Graceful error handling throughout the application
3. **Accessibility**: Proper ARIA labels and keyboard navigation
4. **Responsive Design**: Mobile-friendly layout with CSS Grid/Flexbox
5. **Code Organization**: Clear separation of concerns between components, services, and stores

### Sprint 1 Deliverables (✅ COMPLETED)
- ✅ React 19.1.1 application setup with Vite 7.1.6 and TypeScript
- ✅ Complete project structure and dependency installation
- ✅ TypeScript interfaces for all API data types
- ✅ HTTP client with error handling and loading states (Axios 1.12.2)
- ✅ Zustand 5.0.8 store for global state management
- ✅ FilterPanel with multi-select dropdowns
- ✅ HistogramSlider with D3 visualization and interactive threshold
- ✅ SankeyDiagram with D3-sankey integration and animations
- ✅ SankeyView container with full API orchestration
- ✅ App component with health checking and error boundaries
- ✅ Responsive styling and clean research-focused design

### Sprint 2 Deliverables (🔄 IN PROGRESS)
- ✅ **HistogramPopover component** with advanced interaction capabilities
- ✅ **Portal-based tooltip system** for rich data display
- ✅ **Multi-histogram layout support** (foundation for Phase 2)
- 🔄 **Dual Sankey comparison view** (planned)
- 🔄 **Alluvial flow diagrams** (planned)

### Next Steps (Future Sprints)
- **Sprint 2 (Current)**: Complete Phase 2 comparison view with dual Sankey diagrams and alluvial flows
- **Sprint 3**: Add debug view with feature drilling and advanced interactions
- **Sprint 4**: Performance optimization and final polish

### 🚨 Current Development Issues
- **Dependency Sync**: Axios is installed (package-lock.json) but missing from package.json
- **Recommendation**: Run `npm install axios@^1.12.2` to sync package.json

### Important Notes for Development
- Backend must be running on port 8003 before starting frontend development
- Use the comprehensive API documentation in `/home/dohyun/interface/backend/docs/api_specification.md`
- All data comes from the master parquet file at `/data/master/feature_analysis.parquet`
- Filter options are dynamically loaded from the backend (no hardcoded values)
- Threshold sliders should have sensible defaults based on histogram statistics