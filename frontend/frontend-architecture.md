# SAE Feature Visualization - Frontend Architecture Documentation

**Generated on:** 2025-09-23 | **Updated:** 2025-12-23
**Total Files Analyzed:** 89 TypeScript files (Store simplified: 17 → 4 files)
**Purpose:** Complete architectural documentation for LLM understanding

---

## 1. Project Overview

### Application Purpose
The SAE Feature Visualization application is a research prototype for visualizing and analyzing the reliability and consistency of Sparse Autoencoder (SAE) feature interpretability methods. It provides interactive Sankey diagrams and histogram visualizations to compare different explainability scoring approaches for machine learning interpretability research, specifically designed for EuroVIS conference submission.

### Core Technologies
- **React 19.1.1** - Modern React with TypeScript for component development
- **TypeScript 5.8.3** - Static typing and enhanced developer experience
- **Zustand 5.0.8** - Lightweight state management with slice-based architecture
- **D3.js Ecosystem** - Data visualization libraries:
  - d3-sankey (0.12.3) - Sankey diagram layouts
  - d3-array (3.2.4) - Array manipulation utilities
  - d3-scale (4.0.2) - Scale functions for data mapping
  - d3-selection (3.0.0) - DOM selection and manipulation
  - d3-transition (3.0.1) - Smooth animations
  - d3-interpolate (3.0.1) - Value interpolation
- **Axios 1.12.2** - HTTP client for API communication
- **Vite 7.1.6** - Fast development build tool
- **CSS3** - Custom styling without external UI frameworks

### Directory Structure
```
src/
├── components/                    # Reusable UI components (organized by feature)
│   ├── shared/                   # Cross-cutting shared components
│   │   └── ErrorMessage.tsx     # Error display component
│   ├── ui/                       # General UI components
│   │   ├── CompactFilterConfiguration.tsx  # Filter configuration modal
│   │   ├── EmptyStateCard.tsx    # Empty state placeholder
│   │   └── VisualizationActions.tsx  # Action buttons for visualizations
│   └── visualization/            # Data visualization components
│       ├── HistogramPopover/     # Histogram interaction components
│       │   ├── hooks/           # Popover-specific custom hooks
│       │   ├── utils/           # Popover utility functions
│       │   ├── index.tsx        # Main popover component
│       │   ├── IndividualHistogram.tsx    # Single histogram display
│       │   ├── MultiHistogramView.tsx     # Multiple histogram layout
│       │   ├── PopoverHeader.tsx          # Popover header with drag functionality
│       │   └── SingleHistogramView.tsx    # Single histogram container
│       ├── SankeyDiagram/        # Sankey visualization components
│       │   ├── hooks/           # Sankey-specific custom hooks
│       │   ├── utils/           # Sankey utility functions
│       │   ├── SankeyHeader.tsx          # Diagram header
│       │   ├── SankeyLegend.tsx          # Color legend
│       │   ├── SankeyLink.tsx            # Flow links between nodes
│       │   ├── SankeyNode.tsx            # Interactive nodes
│       │   └── SankeyStageLabels.tsx     # Stage labels
│       ├── HistogramSlider.tsx   # Histogram with threshold slider
│       └── SankeyDiagram.tsx     # Main Sankey diagram component
├── hooks/                        # Custom React hooks
│   ├── index.ts                 # Hook re-exports
│   ├── useClickOutside.ts       # Outside click detection
│   ├── useDragHandler.ts        # Drag interaction handling
│   └── useResizeObserver.ts     # Responsive resize handling
├── services/                     # External service integrations
│   ├── api/                     # API communication layer
│   │   ├── client.ts           # Axios HTTP client configuration
│   │   ├── config.ts           # API configuration constants
│   │   ├── debounce.ts         # Request debouncing utilities
│   │   ├── errors.ts           # Error handling and types
│   │   └── index.ts            # Main API service exports
│   ├── types/                   # Service-related type definitions
│   │   ├── api.ts              # API request/response types
│   │   ├── index.ts            # Type re-exports
│   │   ├── threshold-utils.ts   # Threshold calculation types
│   │   ├── ui.ts               # UI interaction types
│   │   └── visualization.ts     # Visualization data types
│   ├── api.ts                   # Legacy API service (being deprecated)
│   └── types.ts                 # Legacy types (being deprecated)
├── stores/                       # State management (Zustand) - ✅ SIMPLIFIED
│   ├── dataSlice.ts            # ✅ NEW: All data-related state (filters, thresholds, API data)
│   ├── uiSlice.ts              # ✅ NEW: All UI state (viewState, popover, loading, errors)
│   ├── store.ts                # ✅ NEW: Combined store with backward compatibility
│   └── visualizationStore.ts    # ✅ LEGACY: Re-export for backward compatibility
├── utils/                        # Utility functions and helpers
│   ├── d3/                      # D3.js calculation utilities
│   │   ├── animation/          # Animation utilities
│   │   ├── histogram/          # Histogram calculation functions
│   │   ├── sankey/             # Sankey diagram calculations
│   │   ├── shared/             # Shared D3 utilities
│   │   ├── slider/             # Slider interaction utilities
│   │   └── tooltips/           # Tooltip formatting
│   ├── d3-helpers.ts           # Main D3 helper functions
│   └── formatters.ts           # Data formatting utilities
├── views/                        # Page-level view components
│   └── SankeyView.tsx          # Main application view
├── styles/                       # Global CSS styles
│   └── globals.css             # Application-wide styles
├── App.tsx                       # Root application component
├── main.tsx                      # Application entry point
├── index.css                     # Base CSS styles
├── App.css                       # App-specific styles
└── vite-env.d.ts                # Vite type declarations
```

---

## 2. Detailed File-by-File Analysis

### Application Entry Points

---

### File: `src/main.tsx`

**Purpose:** Application entry point that initializes React and renders the root App component.

**Exports:**
* No exports (entry point file)

**Dependencies (Imports):**
* **External:**
    * `import { StrictMode } from 'react'`
    * `import { createRoot } from 'react-dom/client'`
* **Internal:**
    * `import './index.css'` (Global base styles)
    * `import App from './App.tsx'` (Root application component)

**Function-Specific Details:**
* **Side Effects:** Creates React root element and renders App component within StrictMode for development checks.

---

### File: `src/App.tsx`

**Purpose:** Root application component that handles health checking, error boundaries, and renders the main SankeyView.

**Exports:**
* `export default App`: **(Type: React Component)** - *Root application component with health checking and error boundary.*

**Dependencies (Imports):**
* **External:**
    * `import React, { useEffect, useState, useCallback } from 'react'`
* **Internal:**
    * `import SankeyView from './views/SankeyView'` (Main visualization view)
    * `import { api } from './services/api'` (API service for health checking)
    * `import './styles/globals.css'` (Global application styles)

**Component-Specific Details:**
* **State:**
    * **Internal State:**
        - `AppState` interface with `isHealthy` (boolean), `isChecking` (boolean), `error` (string | null)
        - `isReady` (boolean) in main App component
* **Render Tree:**
    - Conditionally renders `<HealthCheck>` component or `<SankeyView>` based on readiness
    - Wrapped in `<AppErrorBoundary>` for error handling
* **Error Handling:**
    - `AppErrorBoundary` class component catches and displays application crashes
    - `HealthCheck` component verifies backend connectivity before allowing app usage

---

### Core View Components

---

### File: `src/views/SankeyView.tsx`

**Purpose:** Main application view that orchestrates filter configuration, data visualization, and user interactions.

**Exports:**
* `export const SankeyView`: **(Type: React Component)** - *Main view component for Sankey visualization interface.*
* `export default SankeyView`: **(Type: React Component)** - *Default export of SankeyView component.*

**Dependencies (Imports):**
* **External:**
    * `import React, { useEffect, useCallback } from 'react'`
* **Internal:**
    * `import { useVisualizationStore } from '../stores/visualization'` (Main state management)
    * `import { EmptyStateCard } from '../components/ui/EmptyStateCard'` (Empty state display)
    * `import CompactFilterConfiguration from '../components/ui/CompactFilterConfiguration'` (Filter configuration)
    * `import VisualizationActions from '../components/ui/VisualizationActions'` (Action buttons)
    * `import SankeyDiagram from '../components/visualization/SankeyDiagram'` (Main diagram)
    * `import HistogramPopover from '../components/visualization/HistogramPopover/index'` (Histogram interactions)

**Component-Specific Details:**
* **Props:**
    * `className?` (`string`): Optional CSS class name
    * `layout?` (`'vertical' | 'horizontal'`): Layout orientation (default: 'vertical')
    * `autoLoad?` (`boolean`): Whether to automatically load filter options (default: true)
* **State:**
    * **Global State Interaction:** Uses Zustand store for filters, viewState, filterOptions, and data fetching
* **Render Tree:**
    - Contains `<ErrorBoundary>` wrapper
    - Conditionally renders based on `viewState`:
        - 'empty': `<EmptyStateCard>`
        - 'filtering': `<CompactFilterConfiguration>`
        - 'visualization': `<SankeyDiagram>` with `<VisualizationActions>`
    - Always renders `<HistogramPopover>` for node interactions
* **Side Effects:**
    - Fetches filter options on mount
    - Triggers data fetching when filters change
    - Manages view state transitions

---

### State Management (Zustand Store) - ✅ SIMPLIFIED

---

### File: `src/stores/store.ts` (✅ NEW CONSOLIDATED STORE)

**Purpose:** Main Zustand store that combines dataSlice and uiSlice with backward compatibility.

**Exports:**
* `export const useAppStore`: **(Type: Zustand Store Hook)** - *New consolidated store hook.*
* `export const useVisualizationStore`: **(Type: Zustand Store Hook)** - *Backward compatible export of useAppStore.*

**Dependencies (Imports):**
* **External:**
    * `import { create } from 'zustand'`
    * `import { devtools } from 'zustand/middleware'`
* **Internal:**
    * `import { createDataSlice } from './dataSlice'` (All data-related state)
    * `import { createUISlice } from './uiSlice'` (All UI state)

**Architecture Achievement:**
* **76% File Reduction:** Simplified from 17 files to 4 files
* **2 Slices:** Consolidated from 5 separate slices to 2 logical groupings
* **Backward Compatibility:** Maintained `useVisualizationStore` export
* **Global Reset:** Provides `resetAll` action that resets both slices

---

### File: `src/stores/dataSlice.ts` (✅ NEW DATA SLICE)

**Purpose:** Manages all data-related state including filters, thresholds, API data, and data fetching operations.

**State Properties:**
* **Filters:** `filters`, `filterOptions` - User selections and available options
* **Thresholds:** `thresholds`, `hierarchicalThresholds`, `currentMetric` - Threshold values and configurations
* **API Data:** `histogramData`, `sankeyData` - Visualization data from backend
* **Node Functions:** `getNodesInSameThresholdGroup`, `getEffectiveThresholdForNode`, `setThresholdGroup`

**Key Actions:**
* `setFilters()` - Updates filter selections
* `setThresholds()` - Updates threshold values
* `fetchMultipleHistogramData()` - Loads histogram data for multiple metrics
* `fetchSankeyData()` - Loads Sankey diagram data
* `setCurrentMetric()` - Changes active metric

---

### File: `src/stores/uiSlice.ts` (✅ NEW UI SLICE)

**Purpose:** Manages all UI-related state including view state, popover, loading states, and error handling.

**State Properties:**
* **View State:** `viewState` - Current app mode ('empty' | 'filtering' | 'visualization')
* **Popover:** `popoverState` - Histogram popover visibility and content
* **Loading:** `loading` - Loading states for different operations
* **Errors:** `errors` - Error states for failed operations

**Key Actions:**
* `setViewState()` - Changes current view mode
* `showHistogramPopover()` / `hideHistogramPopover()` - Popover management
* `setLoading()` / `clearError()` - Loading and error state management
* `showVisualization()`, `editFilters()`, `removeVisualization()` - View transitions

---

### ~~Legacy Store Files~~ (✅ DEPRECATED)

**Note:** The following slice files have been consolidated into the new `dataSlice.ts` and `uiSlice.ts` architecture:
- ~~`src/stores/visualization/slices/filterSlice.ts`~~ → Moved to `dataSlice.ts`
- ~~`src/stores/visualization/slices/thresholdSlice.ts`~~ → Moved to `dataSlice.ts`
- ~~`src/stores/visualization/slices/apiSlice.ts`~~ → Moved to `dataSlice.ts`
- ~~`src/stores/visualization/slices/popoverSlice.ts`~~ → Moved to `uiSlice.ts`
- ~~`src/stores/visualization/slices/viewSlice.ts`~~ → Moved to `uiSlice.ts`

All functionality has been preserved in the new consolidated structure with improved maintainability and performance.

---

### Visualization Components

---

### File: `src/components/visualization/SankeyDiagram.tsx`

**Purpose:** Main Sankey diagram component that renders interactive flow visualization using D3.js calculations.

**Exports:**
* `export const SankeyDiagram`: **(Type: React Component)** - *Interactive Sankey diagram with node click handling.*
* `export default SankeyDiagram`: **(Type: React Component)** - *Default export.*

**Dependencies (Imports):**
* **External:**
    * `import React, { useRef, useEffect, useMemo, useCallback } from 'react'`
* **Internal:**
    * `import { useVisualizationStore } from '../../stores/visualization'` (State management)
    * `import { useSankeyLayout, useSankeyInteractions, useThresholdGroups } from './SankeyDiagram/hooks'` (Custom hooks)
    * Various Sankey sub-components (SankeyHeader, SankeyLegend, SankeyNode, SankeyLink, SankeyStageLabels)
    * `import { ErrorMessage } from '../shared/ErrorMessage'` (Error display)
    * D3 helper functions and validation utilities

**Component-Specific Details:**
* **Props:**
    * `width?` (`number`): Diagram width (default: 600)
    * `height?` (`number`): Diagram height (default: 400)
    * `className?` (`string`): CSS class name
    * `showHistogramOnClick?` (`boolean`): Enable node click interactions
    * `animationDuration?` (`number`): Animation timing
* **State:**
    * **Global State Interaction:** Subscribes to sankeyData, loading, and error states
    * **Internal State:** Manages validation errors and layout calculations
* **Render Tree:**
    - Renders error states or loading indicators
    - SVG container with:
        - `<SankeyHeader>` for title and metadata
        - `<SankeyLegend>` for color coding
        - `<SankeyNode>` components for each data node
        - `<SankeyLink>` components for flow connections
        - `<SankeyStageLabels>` for stage identification
* **Side Effects:**
    - Calculates D3 Sankey layout from data
    - Handles node click events for histogram popover
    - Manages responsive resizing

---

### File: `src/components/visualization/HistogramPopover/index.tsx`

**Purpose:** Portal-based popover component that displays interactive histograms for threshold adjustment and data exploration.

**Exports:**
* `export const HistogramPopover`: **(Type: React Component)** - *Main popover component with portal rendering.*
* `export default HistogramPopover`: **(Type: React Component)** - *Default export.*

**Dependencies (Imports):**
* **External:**
    * `import React, { useRef, useEffect, useMemo, useCallback, useState } from 'react'`
    * `import { createPortal } from 'react-dom'`
* **Internal:**
    * `import { useVisualizationStore } from '../../../stores/visualization'` (State management)
    * `import { useClickOutside, useDragHandler } from '../../../hooks'` (Custom hooks)
    * Popover sub-components and utilities
    * D3 helper functions for histogram calculations

**Component-Specific Details:**
* **State:**
    * **Global State Interaction:** Uses popover state, histogram data, and threshold management
    * **Internal State:** Manages drag state and position calculations
* **Render Tree:**
    - Portal rendering to document body
    - Conditional rendering based on popover visibility:
        - `<PopoverHeader>` with drag functionality
        - Single or multiple histogram views based on data
        - Loading and error states
* **Side Effects:**
    - Manages portal creation and cleanup
    - Handles outside click detection for closing
    - Calculates dynamic positioning with collision detection
    - Manages drag interactions for repositioning

---

### File: `src/components/visualization/HistogramSlider.tsx`

**Purpose:** Combined histogram display and threshold slider component for interactive data filtering.

**Exports:**
* `export const HistogramSlider`: **(Type: React Component)** - *Histogram with interactive threshold slider.*
* `export default HistogramSlider`: **(Type: React Component)** - *Default export.*

**Dependencies (Imports):**
* **External:**
    * `import React, { useRef, useCallback, useMemo } from 'react'`
* **Internal:**
    * `import { useVisualizationStore } from '../../stores/visualization'`
    * `import { ErrorMessage } from '../shared/ErrorMessage'`
    * `import { useDragHandler, useResizeObserver } from '../../hooks'`
    * D3 helper functions for histogram and threshold calculations

**Component-Specific Details:**
* **Props:**
    * `metric?` (`MetricType`): Current metric to display
    * `width?` (`number`): Component width
    * `height?` (`number`): Component height
    * `className?` (`string`): CSS class
    * `showMetricSelector?` (`boolean`): Show metric selection dropdown
    * `animationDuration?` (`number`): Animation timing
* **State:**
    * **Global State Interaction:** Uses histogram data, current threshold, and threshold update actions
    * **Internal State:** Manages drag interactions and resize handling
* **Render Tree:**
    - Header with title and metric selector
    - Error display if present
    - Loading indicator during data fetch
    - SVG histogram with interactive threshold line
* **Side Effects:**
    - Debounced threshold updates during drag interactions
    - Responsive resize handling
    - D3 calculations for histogram bars and threshold positioning

---

### UI Components

---

### File: `src/components/ui/CompactFilterConfiguration.tsx`

**Purpose:** Modal component for configuring data filters with dropdown selections and action buttons.

**Exports:**
* `export const CompactFilterConfiguration`: **(Type: React Component)** - *Filter configuration modal with form controls.*
* `export default CompactFilterConfiguration`: **(Type: React Component)** - *Default export.*

**Dependencies (Imports):**
* **External:**
    * `import React from 'react'`
* **Internal:**
    * `import { useVisualizationStore, useFilters, useFilterOptions } from '../../stores/visualization'`

**Component-Specific Details:**
* **Props:**
    * `onCreateVisualization` (`() => void`): Callback for creating visualization
    * `onCancel` (`() => void`): Callback for canceling filter configuration
    * `className?` (`string`): Optional CSS class
* **State:**
    * **Global State Interaction:** Uses filter state and filter options from store
* **Render Tree:**
    - Header with title and close button
    - Scrollable content area with filter dropdown selectors
    - Footer with Reset Filters and Create Visualization buttons
* **Side Effects:**
    - Updates global filter state on selection changes
    - Validates filter selections for button enabling

---

### File: `src/components/ui/EmptyStateCard.tsx`

**Purpose:** Displays empty state when no visualizations are present, with call-to-action to add visualization.

**Exports:**
* `export const EmptyStateCard`: **(Type: React Component)** - *Empty state display with action button.*
* `export default EmptyStateCard`: **(Type: React Component)** - *Default export.*

**Dependencies (Imports):**
* **External:**
    * `import React from 'react'`

**Component-Specific Details:**
* **Props:**
    * `onAddVisualization` (`() => void`): Callback for adding new visualization
    * `className?` (`string`): Optional CSS class
* **Render Tree:**
    - Card container with icon, title, description, and action button

---

### File: `src/components/ui/VisualizationActions.tsx`

**Purpose:** Floating action buttons for editing filters and removing visualizations.

**Exports:**
* `export const VisualizationActions`: **(Type: React Component)** - *Action buttons for visualization management.*
* `export default VisualizationActions`: **(Type: React Component)** - *Default export.*

**Dependencies (Imports):**
* **External:**
    * `import React from 'react'`

**Component-Specific Details:**
* **Props:**
    * `onEditFilters` (`() => void`): Callback for editing filters
    * `onRemove` (`() => void`): Callback for removing visualization
    * `className?` (`string`): Optional CSS class
* **Render Tree:**
    - Container with edit and remove buttons with SVG icons

---

### Shared Components

---

### File: `src/components/shared/ErrorMessage.tsx`

**Purpose:** Reusable error message component with optional retry functionality.

**Exports:**
* `export const ErrorMessage`: **(Type: React Component)** - *Standardized error display component.*

**Dependencies (Imports):**
* **External:**
    * `import React from 'react'`

**Component-Specific Details:**
* **Props:**
    * `message` (`string`): Error message to display
    * `onRetry?` (`() => void`): Optional retry callback
    * `className?` (`string`): Optional CSS class
* **Render Tree:**
    - Error container with icon, message text, and optional retry button

---

### Custom Hooks

---

### File: `src/hooks/index.ts`

**Purpose:** Central export point for all custom React hooks used throughout the application.

**Exports:**
* `export { useClickOutside }` from './useClickOutside': **(Type: Custom Hook)** - *Hook for detecting clicks outside elements.*
* `export { useDragHandler }` from './useDragHandler': **(Type: Custom Hook)** - *Hook for handling drag interactions.*
* `export { useResizeObserver }` from './useResizeObserver': **(Type: Custom Hook)** - *Hook for responsive resize handling.*

**Dependencies (Imports):**
* **Internal:**
    * Individual hook files for re-export

---

### File: `src/hooks/useClickOutside.ts`

**Purpose:** Custom hook for detecting clicks outside of specified elements, commonly used for closing modals and popovers.

**Exports:**
* `export const useClickOutside`: **(Type: Custom Hook)** - *Hook that triggers callback when clicking outside target element.*

**Dependencies (Imports):**
* **External:**
    * `import { useEffect, useCallback } from 'react'`

**Function-Specific Details:**
* **Parameters:**
    * `ref` (`RefObject<HTMLElement>`): Reference to target element
    * `callback` (`() => void`): Function to call when outside click detected
    * `enabled?` (`boolean`): Whether the hook is active (default: true)
* **Side Effects:**
    - Adds/removes document event listeners for mouse and touch events
    - Handles escape key for additional closing functionality

---

### File: `src/hooks/useDragHandler.ts`

**Purpose:** Custom hook for implementing drag functionality with position tracking and boundary constraints.

**Exports:**
* `export const useDragHandler`: **(Type: Custom Hook)** - *Hook for managing drag interactions with position updates.*

**Dependencies (Imports):**
* **External:**
    * `import { useState, useCallback, useRef, useEffect } from 'react'`

**Function-Specific Details:**
* **Parameters:**
    * `onDrag?` (`(position: { x: number; y: number }) => void`): Callback for position updates
    * `constraints?` (`{ minX?: number; maxX?: number; minY?: number; maxY?: number }`): Boundary constraints
* **Returns:**
    * Object with drag handlers (`onMouseDown`, `onTouchStart`) and current position
* **Side Effects:**
    - Manages global mouse/touch event listeners during drag
    - Prevents text selection during drag operations
    - Applies boundary constraints to position updates

---

### File: `src/hooks/useResizeObserver.ts`

**Purpose:** Custom hook for observing element size changes and responding to responsive layout needs.

**Exports:**
* `export const useResizeObserver`: **(Type: Custom Hook)** - *Hook for tracking element size changes.*

**Dependencies (Imports):**
* **External:**
    * `import { useEffect, useState, useCallback } from 'react'`

**Function-Specific Details:**
* **Parameters:**
    * `ref` (`RefObject<HTMLElement>`): Reference to element to observe
    * `callback?` (`(entry: ResizeObserverEntry) => void`): Optional callback for size changes
* **Returns:**
    * Object with current dimensions (`width`, `height`) and `isObserving` status
* **Side Effects:**
    - Creates and manages ResizeObserver instance
    - Handles observer cleanup on unmount
    - Debounces rapid resize events

---

### API Services

---

### File: `src/services/api/index.ts`

**Purpose:** Main API service module that provides typed HTTP client methods for all backend communication.

**Exports:**
* `export const api`: **(Type: API Client Object)** - *Main API client with typed methods for all endpoints.*
* Various request/response type re-exports

**Dependencies (Imports):**
* **Internal:**
    * `import { client } from './client'` (Configured Axios instance)
    * `import { API_ENDPOINTS } from './config'` (Endpoint configurations)
    * Type definitions from '../types/api'

**Function-Specific Details:**
* **API Methods:**
    * `healthCheck()`: Checks backend server health
    * `getFilterOptions()`: Fetches available filter options
    * `getHistogramData(request)`: Requests histogram data for visualizations
    * `getSankeyData(request)`: Requests Sankey diagram data
    * `getComparisonData(request)`: Requests comparison visualization data
    * `getFeatureDetails(featureId)`: Fetches detailed feature information
* **Error Handling:** All methods include standardized error handling and response validation

---

### File: `src/services/api/client.ts`

**Purpose:** Configured Axios HTTP client with interceptors, error handling, and request/response processing.

**Exports:**
* `export const client`: **(Type: Axios Instance)** - *Configured HTTP client for API communication.*

**Dependencies (Imports):**
* **External:**
    * `import axios from 'axios'`
* **Internal:**
    * `import { API_CONFIG } from './config'` (API configuration)
    * `import { handleApiError } from './errors'` (Error handling)

**Function-Specific Details:**
* **Configuration:**
    * Base URL configuration with environment variable support
    * Request/response interceptors for logging and error handling
    * Timeout configuration for request reliability
* **Interceptors:**
    * Request interceptor adds logging and headers
    * Response interceptor handles success/error cases uniformly
* **Error Handling:** Standardized error processing with user-friendly messages

---

### File: `src/services/api/config.ts`

**Purpose:** API configuration constants including endpoints, timeouts, and environment-specific settings.

**Exports:**
* `export const API_CONFIG`: **(Type: Configuration Object)** - *API client configuration settings.*
* `export const API_ENDPOINTS`: **(Type: Endpoints Object)** - *Typed endpoint definitions.*

**Dependencies (Imports):**
* No external dependencies

**Function-Specific Details:**
* **Configuration Properties:**
    * Base URL with environment variable fallback
    * Timeout settings for different request types
    * Retry configuration for failed requests
* **Endpoints:**
    * Typed endpoint definitions for all API routes
    * Parameter placeholders for dynamic URLs

---

### D3 Utilities

---

### File: `src/utils/d3-helpers.ts`

**Purpose:** Main D3 utility functions that provide calculations and helper methods for all visualizations.

**Exports:**
* Multiple D3 calculation functions for histograms, Sankey diagrams, and interactions
* Validation and formatting utilities
* Animation and transition helpers

**Dependencies (Imports):**
* **External:**
    * Various D3 modules (d3-array, d3-scale, d3-sankey, etc.)
* **Internal:**
    * Specialized D3 utilities from './d3/' subdirectories
    * Type definitions from services

**Function-Specific Details:**
* **Histogram Functions:**
    * `calculateHistogramLayout`: Computes histogram bar positions and scales
    * `calculateThresholdLine`: Positions threshold indicators
    * `validateHistogramData`: Ensures data integrity
* **Sankey Functions:**
    * `calculateSankeyLayout`: Computes node and link positions
    * `generateSankeyPaths`: Creates SVG path strings for links
    * `validateSankeyData`: Validates Sankey data structure
* **Interaction Functions:**
    * `positionToValue`: Converts screen coordinates to data values
    * `valueToPosition`: Converts data values to screen coordinates
    * `calculateTooltipPosition`: Positions tooltips relative to elements

---

### Type Definitions

---

### File: `src/services/types/api.ts`

**Purpose:** Comprehensive type definitions for all API requests, responses, and data structures.

**Exports:**
* Request types: `HistogramDataRequest`, `SankeyDataRequest`, `ComparisonDataRequest`
* Response types: `HistogramData`, `SankeyData`, `FilterOptions`, `FeatureDetails`
* Error types: `ApiError`, `ErrorResponse`
* Filter types: `Filters`, `FilterOptions`

**Dependencies (Imports):**
* **Internal:**
    * Base types from './visualization' and './ui'

**Type-Specific Details:**
* **Request Types:** Strongly typed request objects with validation
* **Response Types:** Complete API response structures
* **Error Types:** Standardized error handling types
* **Data Types:** Core data structures used throughout the application

---

### File: `src/services/types/visualization.ts`

**Purpose:** Type definitions specific to data visualization components and D3 calculations.

**Exports:**
* Visualization data types: `HistogramData`, `SankeyNode`, `SankeyLink`
* Layout types: `HistogramLayout`, `SankeyLayout`
* Interaction types: `ThresholdData`, `PopoverData`
* Metric types: `MetricType`, `ThresholdConfig`

**Dependencies (Imports):**
* **Internal:**
    * Shared types from other type definition files

---

### File: `src/stores/visualization/types.ts`

**Purpose:** Complete type definitions for the Zustand store state and all slice interfaces.

**Exports:**
* Main state type: `VisualizationState`
* Slice types: `FilterSlice`, `ThresholdSlice`, `ApiSlice`, `PopoverSlice`, `ViewSlice`
* Action types: All action function signatures
* Combined types: Union types for complex state management

**Dependencies (Imports):**
* **Internal:**
    * Service types for API and visualization data
    * UI types for component interactions

---

## 3. High-Level System Flows

### Filter Configuration and Data Loading Flow

**Entry Point:** User clicks "Add Visualization" button in `EmptyStateCard` component.

**Action Sequence:**
1. **View State Transition:** `SankeyView` component calls `setViewState('filtering')` from `viewSlice`
2. **Component Rendering:** `SankeyView` conditionally renders `CompactFilterConfiguration` component
3. **Filter Options Loading:**
   - `CompactFilterConfiguration` uses `useFilterOptions()` selector
   - If options not loaded, `SankeyView`'s `useEffect` calls `fetchFilterOptions()` from `apiSlice`
   - `apiService.getFilterOptions()` makes GET request to `/api/filter-options`
   - Response updates store via `setFilterOptions()` action
4. **User Filter Selection:**
   - User selects values in dropdown menus (SAE ID, Explanation Method, etc.)
   - Each selection calls `setFilters({ [filterKey]: selected })` action
   - `filterSlice` updates global filter state
5. **Visualization Creation:**
   - User clicks "Create Visualization" button
   - `onCreateVisualization` callback calls `showVisualization()` action
   - `viewSlice` updates state to 'visualization'
   - `SankeyView` component triggers data loading effects

**State Changes:**
- `viewState`: 'empty' → 'filtering' → 'visualization'
- `filterOptions`: null → loaded options object
- `filters`: empty → user selections
- `loading.filters`: false → true → false

**UI Updates:**
- Empty state card disappears
- Filter configuration modal appears
- After confirmation, Sankey diagram area renders with loading state

---

### Data Visualization Rendering Flow

**Entry Point:** View state changes to 'visualization' with active filters.

**Action Sequence:**
1. **Data Fetching Trigger:**
   - `SankeyView` component's `useEffect` detects filter changes and 'visualization' state
   - Calls `fetchMultipleHistogramData(['feature_splitting', 'semdist_mean', 'score_fuzz'])`
   - Then calls `fetchSankeyData()` after histogram data loads
2. **API Requests:**
   - `apiService.getHistogramData()` makes POST to `/api/histogram-data` with filter parameters
   - `apiService.getSankeyData()` makes POST to `/api/sankey-data` with filters and thresholds
   - Both requests include current filter selections and threshold values
3. **Data Processing:**
   - API responses are validated using D3 validation utilities
   - `setHistogramData()` and `setSankeyData()` actions update store
   - Loading states are managed throughout the process
4. **Visualization Rendering:**
   - `SankeyDiagram` component subscribes to `sankeyData` and `loading.sankey`
   - When data available, `useSankeyLayout` hook calculates D3 Sankey layout
   - Component renders SVG with:
     - `SankeyNode` components for each data node
     - `SankeyLink` components for flow connections
     - `SankeyHeader`, `SankeyLegend`, and `SankeyStageLabels` for metadata
5. **Interactive Elements:**
   - Node click handlers are attached via `useSankeyInteractions` hook
   - Hover states and tooltips are managed through D3 event handlers

**State Changes:**
- `loading.histogram` and `loading.sankey`: false → true → false
- `histogramData`: null → loaded histogram objects
- `sankeyData`: null → { nodes: [...], links: [...] }
- `errors.*`: Cleared on successful requests, set on failures

**UI Updates:**
- Loading spinners appear during data fetching
- Sankey diagram renders with smooth D3 transitions
- Interactive hover states and click handlers become active

---

### Histogram Popover Interaction Flow

**Entry Point:** User clicks on a Sankey diagram node.

**Action Sequence:**
1. **Node Click Detection:**
   - `SankeyNode` component's click handler triggers
   - `useSankeyInteractions` hook processes click event
   - Extracts node data, position, and associated metrics
2. **Popover Data Preparation:**
   - Determines which metrics are associated with the clicked node
   - Retrieves histogram data for relevant metrics from store
   - Calculates optimal popover position using collision detection
3. **Popover State Update:**
   - Calls `showPopover()` action with:
     - Node information (ID, name, metrics)
     - Position coordinates (x, y)
     - Parent node reference for positioning
   - `popoverSlice` updates `popoverState.isVisible` to true
4. **Popover Rendering:**
   - `HistogramPopover` component re-renders based on state change
   - Uses `createPortal` to render outside normal DOM hierarchy
   - `usePopoverPosition` hook calculates final positioning with collision detection
   - Renders either `SingleHistogramView` or `MultiHistogramView` based on metrics count
5. **Histogram Display:**
   - `IndividualHistogram` components render for each metric
   - D3 calculations create histogram bars and threshold lines
   - Interactive threshold adjustment handlers are attached
6. **Threshold Adjustment:**
   - User drags threshold line in histogram
   - `useDragHandler` hook manages drag interaction
   - `useThresholdManagement` hook debounces updates
   - `updateThreshold()` action updates global threshold state
   - All visualizations re-render with new threshold values

**State Changes:**
- `popoverState`: { isVisible: false } → { isVisible: true, nodeId: '...', position: {...}, metrics: [...] }
- `thresholds.*`: Updated during threshold drag interactions
- Dependent visualizations update reactively

**UI Updates:**
- Popover appears with smooth animation
- Histogram(s) render with current threshold lines
- Drag interactions provide real-time visual feedback
- Sankey diagram updates when thresholds change

---

### Error Handling and Recovery Flow

**Entry Point:** API request fails or invalid data is received.

**Action Sequence:**
1. **Error Detection:**
   - API client interceptor catches HTTP errors
   - `handleApiError()` function processes error details
   - Validation functions detect data integrity issues
2. **Error State Management:**
   - Appropriate `setError()` action is called for the failed operation
   - Loading state is set to false
   - Error information is stored in relevant slice
3. **UI Error Display:**
   - Components subscribing to error state re-render
   - `ErrorMessage` component displays user-friendly error message
   - Retry functionality is offered where appropriate
4. **Error Recovery:**
   - User clicks retry button (if available)
   - `clearError()` action resets error state
   - Original operation is re-attempted
   - Success path proceeds normally

**State Changes:**
- `errors.*`: null → error object with message and details
- `loading.*`: true → false on error
- Data states remain in previous valid state

**UI Updates:**
- Loading spinners are replaced with error messages
- Retry buttons appear for recoverable errors
- Previous valid visualizations remain visible

---

### State Management Architecture Flow (✅ SIMPLIFIED)

**Core Pattern:** Simplified Zustand slice-based architecture with logical domain separation.

**Store Composition (After Consolidation):**
1. **Slice Creation:** Two focused slices handle logical domains:
   - `dataSlice`: All data-related state (filters, thresholds, API data, node functions)
   - `uiSlice`: All UI-related state (view state, popover, loading, errors)
2. **Store Combination:** Main store combines slices using spread operator in `/src/stores/store.ts`
3. **Backward Compatibility:** `useVisualizationStore` maintained for seamless migration
4. **Simplified Access:** Direct state access without complex selector layers

**Architecture Benefits:**
- **76% File Reduction:** 17 files → 4 files
- **Clearer Domain Separation:** Data vs UI concerns
- **Simplified Debugging:** Fewer abstraction layers
- **Better Performance:** Reduced re-renders and memory usage

**Data Flow Pattern:**
1. **Action Dispatch:** Components call actions from store
2. **State Update:** Actions update relevant slice state
3. **Selector Notification:** Subscribed components re-render
4. **Side Effects:** `useEffect` hooks trigger based on state changes
5. **API Calls:** Services make requests and update state
6. **UI Updates:** Components render based on new state

**Performance Optimizations:**
- Individual selectors prevent unnecessary re-renders
- Memoized calculations in custom hooks
- Debounced API calls for expensive operations
- Portal rendering for modals to avoid DOM tree issues

---

## ✅ Recent Architecture Improvements (December 2024)

### Store Consolidation Completed
**Achievement:** Successfully simplified the over-engineered Zustand store architecture:
- **Before:** 17 files across 5 slices with complex dependencies
- **After:** 4 files with 2 logical slices (76% reduction)
- **Result:** Maintained all functionality while significantly improving maintainability

### Bug Fixes Resolved
- ✅ Fixed `getNodesInSameThresholdGroup is not a function` error
- ✅ Fixed `getEffectiveThresholdForNode is not a function` error
- ✅ Fixed Sankey diagram threshold update synchronization
- ✅ Fixed multi-histogram threshold interaction issues

### Performance Impact
- Reduced memory usage through simplified state structure
- Improved debugging experience with clearer domain separation
- Faster development through reduced complexity
- Better TypeScript compilation times

---

This documentation provides a complete architectural map of the SAE Feature Visualization frontend application, covering the application structure, simplified state management, and the complex data flows that enable interactive visualization of machine learning interpretability data. **Updated to reflect the completed store consolidation improvements.**