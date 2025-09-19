# Frontend CLAUDE.md

This file provides guidance to Claude Code when working with the React frontend for the SAE Feature Visualization project.

## Sprint 1: Single Sankey Visualization (Current Implementation)

### Overview
Sprint 1 implements the core React application with TypeScript, D3.js integration, and single Sankey diagram functionality. This provides the foundation for Phase 1 of the SAE feature visualization tool.

### Project Structure
```
frontend/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── FilterPanel.tsx  # Multi-select filter dropdowns
│   │   ├── HistogramSlider.tsx  # Histogram with threshold slider
│   │   ├── SankeyDiagram.tsx    # D3-powered Sankey visualization
│   │   └── LoadingSpinner.tsx   # Loading states
│   ├── views/               # Page-level components
│   │   └── SankeyView.tsx   # Single Sankey container (Phase 1)
│   ├── services/            # API integration layer
│   │   ├── api.ts           # API client with typed requests/responses
│   │   └── types.ts         # TypeScript interfaces for API data
│   ├── stores/              # Zustand state management
│   │   └── visualizationStore.ts  # Global state for filters, thresholds, data
│   ├── utils/               # Helper functions
│   │   ├── d3-helpers.ts    # D3 calculation utilities
│   │   └── formatters.ts    # Data formatting utilities
│   ├── styles/              # CSS modules and global styles
│   │   └── globals.css      # Global styles
│   ├── App.tsx              # Main application component
│   ├── main.tsx             # Application entry point
│   └── vite-env.d.ts        # Vite type declarations
├── package.json
├── tsconfig.json
├── vite.config.ts
└── index.html
```

### Technologies Used
- **React 18** with TypeScript for component development
- **Vite** for fast development and building
- **D3.js ecosystem** (d3-sankey, d3-scale, d3-array) for data visualization
- **Zustand** for lightweight state management
- **Axios** for HTTP client with interceptors
- **CSS Modules** for component-scoped styling

### Development Commands
```bash
cd frontend

# Install dependencies
npm install

# Start development server (runs on http://localhost:3000)
npm run dev

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
The application uses Zustand for global state management with the following structure:

```typescript
interface VisualizationState {
  // Filter state
  filters: {
    sae_id: string[]
    explanation_method: string[]
    llm_explainer: string[]
    llm_scorer: string[]
  }

  // Threshold state
  thresholds: {
    semdist_mean: number
    score_high: number
  }

  // API data
  filterOptions: FilterOptions | null
  histogramData: HistogramData | null
  sankeyData: SankeyData | null

  // UI state
  loading: {
    filters: boolean
    histogram: boolean
    sankey: boolean
  }

  // Actions
  setFilters: (filters: Partial<Filters>) => void
  setThresholds: (thresholds: Partial<Thresholds>) => void
  // ... other actions
}
```

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

#### SankeyView Container
- Orchestrates FilterPanel, HistogramSlider, and SankeyDiagram
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

### Sprint 1 Deliverables (Completed)
- ✅ React application setup with Vite and TypeScript
- ✅ Complete project structure and dependency installation
- ✅ TypeScript interfaces for all API data types
- ✅ HTTP client with error handling and loading states
- ✅ Zustand store for global state management
- ✅ FilterPanel with multi-select dropdowns
- ✅ HistogramSlider with D3 visualization and interactive threshold
- ✅ SankeyDiagram with D3-sankey integration and animations
- ✅ SankeyView container with full API orchestration
- ✅ App component with basic routing and error boundaries
- ✅ Responsive styling and clean research-focused design

### Next Steps (Future Sprints)
- **Sprint 2**: Implement Phase 2 comparison view with dual Sankey diagrams and alluvial flows
- **Sprint 3**: Add debug view with feature drilling and advanced interactions
- **Sprint 4**: Performance optimization and final polish

### Important Notes for Development
- Backend must be running on port 8003 before starting frontend development
- Use the comprehensive API documentation in `/home/dohyun/interface/backend/docs/api_specification.md`
- All data comes from the master parquet file at `/data/master/feature_analysis.parquet`
- Filter options are dynamically loaded from the backend (no hardcoded values)
- Threshold sliders should have sensible defaults based on histogram statistics