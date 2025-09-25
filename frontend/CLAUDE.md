# Frontend CLAUDE.md

This file provides comprehensive guidance to Claude Code when working with the React frontend for the SAE Feature Visualization project.

## Current Status: ✅ PRODUCTION-READY REACT APPLICATION

**Implementation Complete**: Advanced React 19.1.1 application with sophisticated D3.js visualizations
**Architecture**: Modern TypeScript-based frontend with consolidated state management
**Status**: Production-quality single Sankey visualization with advanced interactive features
**Development Server**: Active on http://localhost:3003 with hot reload and comprehensive error handling

## Technology Stack & Architecture

### Core Technologies
- **React 19.1.1**: Latest React with modern component patterns and concurrent features
- **TypeScript 5.8.3**: Full type safety throughout the application
- **Vite 7.1.6**: Lightning-fast development server with hot module replacement
- **D3.js Ecosystem**: Complete visualization suite
  - d3-sankey 0.12.3: Sankey diagram layout calculations
  - d3-scale 4.0.2: Data scaling and transformations
  - d3-array 3.2.4: Data manipulation utilities
  - d3-selection 3.0.0: DOM selection and manipulation
  - d3-transition 3.0.1: Smooth animations and transitions
  - d3-interpolate 3.0.1: Value interpolation for animations
- **Zustand 5.0.8**: Lightweight state management with DevTools integration
- **Axios 1.12.2**: HTTP client with interceptors and comprehensive error handling

### Application Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     React Application Layer                     │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │   Components    │ │   Zustand       │ │   API Client    │   │
│  │   (Functional)  │ │   Store         │ │   (Axios)       │   │
│  │   + Hooks       │ │   + DevTools    │ │   + Interceptors│   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                 ↕ D3.js Integration
┌─────────────────────────────────────────────────────────────────┐
│                     D3.js Visualization Layer                   │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │   Sankey        │ │   Histogram     │ │   Interactive   │   │
│  │   Layout        │ │   Calculations  │ │   Popovers      │   │
│  │   Calculations  │ │   + Statistics  │ │   + Positioning │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                 ↕ Event Handling & State Updates
┌─────────────────────────────────────────────────────────────────┐
│                     UI Interaction Layer                        │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │   Click         │ │   Hover         │ │   Drag & Drop   │   │
│  │   Handlers      │ │   Effects       │ │   Interactions  │   │
│  │   + Navigation  │ │   + Tooltips    │ │   + Positioning │   │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Current Project Structure (Actual Implementation)

```
frontend/
├── src/
│   ├── components/              # React Components (Production-Ready)
│   │   ├── FilterPanel.tsx      # Multi-select filter interface with dynamic options
│   │   ├── SankeyDiagram.tsx    # Advanced D3 Sankey visualization with interactions
│   │   └── HistogramPopover.tsx # Portal-based histogram popover with drag functionality
│   ├── lib/                     # Utility Libraries
│   │   ├── d3-utils.ts         # Advanced D3 calculations and helper functions
│   │   └── utils.ts            # General utility functions and formatters
│   ├── styles/                  # Styling
│   │   └── globals.css         # Global styles with responsive design patterns
│   ├── store.ts                # Consolidated Zustand store (Production Implementation)
│   ├── types.ts                # Comprehensive TypeScript type definitions
│   ├── api.ts                  # HTTP client and API integration layer
│   ├── App.tsx                 # Main application component with routing and error boundaries
│   ├── main.tsx                # Application entry point with React 19 setup
│   └── vite-env.d.ts          # Vite environment type declarations
├── public/                     # Static Assets
├── package.json               # Dependencies and build scripts
├── tsconfig.json              # TypeScript configuration
├── tsconfig.node.json         # Node-specific TypeScript config
├── vite.config.ts             # Vite build configuration
└── index.html                 # HTML template
```

## Implementation Details

### ✅ Advanced State Management

The frontend uses a **consolidated Zustand store** with comprehensive state management:

```typescript
interface AppState {
  // Core data state
  filters: Filters
  filterOptions: FilterOptions | null
  hierarchicalThresholds: HierarchicalThresholds
  histogramData: Record<string, HistogramData> | null
  sankeyData: SankeyData | null

  // UI state management
  viewState: ViewState  // 'empty' | 'filtering' | 'visualization'
  popoverState: PopoverState
  loading: LoadingStates
  errors: ErrorStates

  // Comprehensive API actions
  fetchFilterOptions: () => Promise<void>
  fetchHistogramData: (metric?: MetricType, nodeId?: string) => Promise<void>
  fetchMultipleHistogramData: (metrics: MetricType[], nodeId?: string) => Promise<void>
  fetchSankeyData: () => Promise<void>
}
```

**Key Features:**
- **Hierarchical Threshold Management**: Support for complex threshold configurations
- **Multi-histogram Data**: Batch loading of histogram data for different metrics
- **Automatic Threshold Updates**: Dynamic threshold adjustment based on histogram statistics
- **Comprehensive Error Handling**: Structured error states with user-friendly messages
- **Loading State Management**: Granular loading indicators for all async operations

### ✅ Advanced Component Architecture

#### App Component (Production-Grade Orchestrator)
- **Health Check System**: Automatic backend connectivity validation on startup
- **Three-State View Management**: Empty → Filtering → Visualization workflow
- **Comprehensive Error Boundaries**: Graceful error handling with user guidance
- **Hot-Reload Development**: Automatic server reconnection and port conflict resolution
- **Responsive Layout**: Adaptive design for different screen sizes

**View States:**
```typescript
type ViewState = 'empty' | 'filtering' | 'visualization'

// empty: Shows add visualization button
// filtering: Shows FilterPanel for configuration
// visualization: Shows complete Sankey diagram with interactions
```

#### FilterPanel Component
- **Dynamic Filter Options**: Real-time loading from backend `/api/filter-options`
- **Multi-select Dropdowns**: Advanced selection interface for multiple filter types
- **Filter Categories**: sae_id, explanation_method, llm_explainer, llm_scorer
- **Validation & Error Handling**: User-friendly error messages for invalid selections
- **State Synchronization**: Automatic store updates with filter changes

#### SankeyDiagram Component (Advanced D3 Integration)
- **D3-Sankey Integration**: Professional Sankey layout calculations with d3-sankey
- **Interactive Nodes**: Click handlers for histogram popover activation
- **Advanced Animations**: Smooth transitions with d3-transition
- **Color Coding**: Sophisticated color scheme based on node categories
- **Hover Effects**: Interactive feedback with tooltips and highlighting
- **Error States**: Comprehensive error handling with user-friendly messages

**Node Interaction Logic:**
```typescript
function getMetricsForNode(node: D3SankeyNode): MetricType[] | null {
  switch (node.category) {
    case 'root': return null // No histogram for root
    case 'feature_splitting': return ['feature_splitting']
    case 'semantic_distance': return ['semdist_mean']
    case 'score_agreement': return ['score_detection', 'score_fuzz', 'score_simulation']
  }
}
```

#### HistogramPopover Component (Portal-Based Advanced UI)
- **Portal-Based Rendering**: Proper z-index layering for complex layouts
- **Multi-Histogram Support**: Simultaneous display of multiple metric histograms
- **Advanced Positioning**: Right-side positioning with collision detection
- **Drag & Drop Functionality**: Interactive popover repositioning
- **Threshold Interaction**: Real-time threshold adjustment with visual feedback
- **Performance Optimization**: Efficient D3 calculations with React integration

### 🎯 Advanced D3.js Integration

#### D3 Utility Functions (lib/d3-utils.ts)
- **Sankey Layout Calculations**: Complete sankey diagram layout with positioning
- **Histogram Generation**: Advanced histogram calculations with statistics
- **Color Management**: Sophisticated color schemes for different node types
- **Animation Utilities**: Smooth transitions and interactive feedback
- **Threshold Line Calculations**: Visual threshold indicators on histograms
- **Position Calculations**: Advanced positioning logic for popovers

#### D3-React Integration Patterns
```typescript
// Proper React-D3 integration
useEffect(() => {
  if (!sankeyData) return

  // D3 calculations
  const { nodes, links } = calculateSankeyLayout(sankeyData, width, height)

  // React rendering with calculated positions
  setProcessedData({ nodes, links })
}, [sankeyData, width, height])
```

### 📊 API Integration Architecture

#### HTTP Client (api.ts)
- **Axios Configuration**: Advanced interceptors for request/response handling
- **Environment-Aware URLs**: Automatic backend URL detection and configuration
- **Structured Error Handling**: Comprehensive error parsing and user-friendly messages
- **Request/Response Types**: Full TypeScript integration with backend API schema
- **Health Check System**: Automatic connectivity validation

**API Endpoints Integration:**
```typescript
// All 5 backend endpoints fully integrated
export const getFilterOptions = (): Promise<FilterOptions>
export const getHistogramData = (request: HistogramDataRequest): Promise<HistogramData>
export const getSankeyData = (request: SankeyDataRequest): Promise<SankeyData>
export const getComparisonData = (request: ComparisonDataRequest): Promise<ComparisonData>
export const getFeatureData = (featureId: number): Promise<FeatureDetail>
export const healthCheck = (): Promise<boolean>
```

#### Backend Integration Features
- **Default Backend URL**: http://localhost:8003 (configurable via environment)
- **CORS Handling**: Proper cross-origin request configuration
- **Error Code Mapping**: Backend error codes mapped to user-friendly messages
- **Retry Logic**: Automatic retry for transient network errors
- **Performance Monitoring**: Request timing and error rate tracking

### 🚀 Performance Optimizations

#### React Optimizations
- **React.memo**: Expensive visualization components memoized
- **useMemo/useCallback**: D3 calculations and event handlers optimized
- **Efficient Re-rendering**: Precise dependency arrays for optimal performance
- **Proper Cleanup**: D3 event listeners and timers properly cleaned up

#### D3 Performance
- **Lazy Calculations**: D3 operations only triggered when necessary
- **Efficient Updates**: Minimal DOM manipulation with data binding
- **Animation Optimization**: Smooth 60fps animations with proper timing
- **Memory Management**: Proper cleanup of D3 selections and scales

#### API Performance
- **Debounced Interactions**: 300ms debounce for threshold slider interactions
- **Batch Requests**: Multiple histogram data requests batched together
- **Intelligent Caching**: Avoid redundant API calls with state caching
- **Progressive Loading**: Load critical data first, then enhance with additional data

### 🔧 Development Features

#### TypeScript Integration
- **Comprehensive Type Safety**: All components, hooks, and API calls fully typed
- **Type Definitions**: Complete type definitions in types.ts covering all data structures
- **IDE Support**: Excellent autocomplete and error detection
- **Type Guards**: Runtime type validation for API responses

#### Error Handling
- **Error Boundaries**: React error boundaries for graceful component failure handling
- **API Error Mapping**: Backend error codes mapped to user-friendly messages
- **Fallback UI**: Comprehensive fallback interfaces for error states
- **Debug Information**: Detailed error information for development

#### Development Experience
- **Hot Module Replacement**: Instant updates during development
- **Comprehensive Logging**: Detailed console logging for debugging
- **DevTools Integration**: Zustand DevTools for state debugging
- **Port Conflict Resolution**: Automatic fallback ports for development

## Development Commands

### Quick Start
```bash
cd frontend

# Install dependencies
npm install

# Start development server (default: http://localhost:3000)
npm run dev

# Start on specific port (currently active: 3003)
npm run dev -- --port 3003

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

### Current Development Status (🟢 ACTIVE)

**Development Server**: http://localhost:3003
- ✅ Hot reload with React Fast Refresh
- ✅ TypeScript compilation with error reporting
- ✅ Vite development server with optimized bundling
- ✅ Backend API integration with automatic health checking

**Performance Metrics**:
- **Bundle Size**: Optimized with code splitting and tree shaking
- **Load Time**: Sub-second initial load with progressive enhancement
- **Interaction Response**: Real-time updates with smooth D3 animations
- **Memory Usage**: Efficient with proper cleanup and garbage collection

## Backend Integration

### API Endpoints (All Functional)
| Method | Endpoint | Purpose | Frontend Integration |
|--------|----------|---------|---------------------|
| `GET` | `/api/filter-options` | Dynamic filter population | FilterPanel dropdown options |
| `POST` | `/api/histogram-data` | Threshold visualization | HistogramPopover data |
| `POST` | `/api/sankey-data` | Sankey diagram generation | SankeyDiagram main visualization |
| `POST` | `/api/comparison-data` | Phase 2 comparisons | Future dual Sankey implementation |
| `GET` | `/api/feature/{id}` | Individual feature details | Future debug view |
| `GET` | `/health` | Backend connectivity | App startup health check |

### Error Handling Integration
- **INVALID_FILTERS**: User-friendly filter validation messages
- **INSUFFICIENT_DATA**: Helpful guidance for filter adjustment
- **INTERNAL_ERROR**: Generic error with retry functionality
- **SERVICE_UNAVAILABLE**: Backend connection status with retry

### Real-time Data Flow
```
User Interaction → State Update → API Request → Data Processing → UI Update
```

## Advanced Features

### 🎨 Interactive Visualizations
- **Multi-Stage Sankey Diagrams**: Complex flow visualization with 4 stages
- **Interactive Nodes**: Click-to-expand histogram analysis
- **Smooth Animations**: D3-powered transitions with proper timing
- **Hover Effects**: Rich tooltips with detailed information
- **Color-Coded Categories**: Intuitive visual categorization

### 🔄 State Management
- **Hierarchical Thresholds**: Complex threshold configuration support
- **Multi-Histogram Data**: Batch loading and management
- **View State Management**: Comprehensive workflow state tracking
- **Error State Management**: Granular error handling and recovery
- **Loading State Management**: Detailed loading indicators for all operations

### 📱 User Experience
- **Responsive Design**: Adaptive layout for different screen sizes
- **Accessibility**: Proper ARIA labels and keyboard navigation
- **Error Recovery**: User-friendly error states with clear recovery paths
- **Performance Feedback**: Loading indicators and progress feedback
- **Intuitive Navigation**: Clear workflow from filtering to visualization

## Future Development (Phase 2 Ready)

### Dual Sankey Comparison (Next Phase)
- ✅ **Backend API**: Comparison endpoint implemented and ready
- ✅ **Data Structures**: All required types and interfaces defined
- ✅ **Architecture**: Component structure ready for dual visualization
- 📝 **Implementation**: Frontend dual Sankey layout and alluvial flows

### Debug View & Feature Drilling
- ✅ **Backend Support**: Feature detail endpoint operational
- ✅ **Type Definitions**: Complete types for individual feature analysis
- 📝 **UI Components**: Detailed feature inspection interface

### Performance Enhancements
- ✅ **Current Performance**: Production-ready with optimized bundle
- 📝 **Future Optimizations**: Virtual scrolling for large datasets
- 📝 **Advanced Caching**: Intelligent data caching strategies

## Critical Development Notes

1. **Backend Dependency**: Requires backend server on port 8003
2. **Type Safety**: Maintain comprehensive TypeScript integration
3. **Performance**: All D3 calculations optimized for smooth interactions
4. **Error Handling**: Use structured error codes for proper user messaging
5. **State Management**: Maintain centralized state with Zustand store
6. **API Integration**: All 5 backend endpoints must be operational
7. **Component Architecture**: Maintain clear separation of concerns

## Project Assessment

This React frontend represents a **production-ready research visualization interface** with:

- ✅ **Modern React Architecture** with latest React 19.1.1 and TypeScript 5.8.3
- ✅ **Advanced D3.js Integration** with sophisticated interactive visualizations
- ✅ **Professional State Management** with comprehensive data flow
- ✅ **Production-Quality Error Handling** with graceful degradation
- ✅ **Optimal Performance** with advanced React and D3 optimizations
- ✅ **Excellent Developer Experience** with hot reload and comprehensive tooling

The application is ready for **academic research presentation** and capable of handling **complex SAE feature analysis workflows** with professional-grade user experience.