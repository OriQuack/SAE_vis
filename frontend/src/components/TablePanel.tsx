import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useVisualizationStore } from '../store'
import type { FeatureTableDataResponse, FeatureTableRow, ConsistencyType, SortBy, SortDirection } from '../types'
import {
  buildHeaderStructure,
  buildMetricFirstHeaderStructure,
  formatTableScore,
  extractRowScores,
  extractRowScoresMetricFirst,
  calculateColorBarLayout,
  getConsistencyForCell,
  getConsistencyColor,
  getConsistencyValueForSorting,
  getScoreValue,
  compareValues,
  type HeaderStructure
} from '../lib/d3-table-utils'
import {
  createCellGroup,
  getCellGroup,
  getExplainerForColumnIndex,
  findGroupByKey,
  findGroupsInRectangle
} from '../lib/table-selection-utils'
import '../styles/TablePanel.css'

// ============================================================================
// CONSISTENCY TYPE OPTIONS - Flat Structure
// ============================================================================

const CONSISTENCY_OPTIONS: Array<{
  id: string
  label: string
  value: ConsistencyType
}> = [
  {
    id: 'none',
    label: 'None',
    value: 'none'
  },
  {
    id: 'llm_scorer',
    label: 'LLM Scorer',
    value: 'llm_scorer_consistency'
  },
  {
    id: 'within_exp_score',
    label: 'Within-exp. Score',
    value: 'within_explanation_score'
  },
  {
    id: 'cross_exp_score',
    label: 'Cross-exp. Score',
    value: 'cross_explanation_score'
  },
  {
    id: 'llm_explainer',
    label: 'LLM Explainer',
    value: 'llm_explainer_consistency'
  }
]

// ============================================================================
// MAIN TABLE PANEL COMPONENT
// ============================================================================

interface TablePanelProps {
  className?: string
}

const TablePanel: React.FC<TablePanelProps> = ({ className = '' }) => {
  const tableData = useVisualizationStore(state => state.tableData) as FeatureTableDataResponse | null
  const leftPanel = useVisualizationStore(state => state.leftPanel)
  const rightPanel = useVisualizationStore(state => state.rightPanel)
  const fetchTableData = useVisualizationStore(state => state.fetchTableData)
  const selectedConsistencyType = useVisualizationStore(state => state.selectedConsistencyType)
  const setConsistencyType = useVisualizationStore(state => state.setConsistencyType)
  const setTableScrollState = useVisualizationStore(state => state.setTableScrollState)
  const isLoading = useVisualizationStore(state => state.loading.table)

  const [headerStructure, setHeaderStructure] = useState<HeaderStructure | null>(null)
  const tableContainerRef = useRef<HTMLDivElement>(null)

  // Sorting state
  const [sortBy, setSortBy] = useState<SortBy>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>(null)

  // Cell selection state from store
  const cellSelection = useVisualizationStore(state => state.cellSelection)
  const setCellSelection = useVisualizationStore(state => state.setCellSelection)
  const toggleCellGroup = useVisualizationStore(state => state.toggleCellGroup)
  const clearCellSelection = useVisualizationStore(state => state.clearCellSelection)

  // Saved cell group selection state from store
  const showCellGroupNameInput = useVisualizationStore(state => state.showCellGroupNameInput)
  const startSavingCellGroups = useVisualizationStore(state => state.startSavingCellGroups)
  const finishSavingCellGroups = useVisualizationStore(state => state.finishSavingCellGroups)
  const cancelSavingCellGroups = useVisualizationStore(state => state.cancelSavingCellGroups)

  // Local drag state
  const [isDragging, setIsDragging] = useState(false)
  const [dragMode, setDragMode] = useState<'union' | 'difference' | null>(null)

  // Local state for name input
  const [groupName, setGroupName] = useState('')

  // Get selected LLM explainers (needed for disabled logic)
  const selectedExplainers = new Set<string>()
  if (leftPanel.filters.llm_explainer) {
    leftPanel.filters.llm_explainer.forEach(e => selectedExplainers.add(e))
  }
  if (rightPanel.filters.llm_explainer) {
    rightPanel.filters.llm_explainer.forEach(e => selectedExplainers.add(e))
  }

  // Check if only one explainer is selected (for disabling certain options)
  const hasOnlyOneExplainer = selectedExplainers.size === 1

  // Check if a consistency type is disabled
  const isConsistencyTypeDisabled = (type: ConsistencyType): boolean => {
    // "None" is never disabled
    if (type === 'none') {
      return false
    }

    // When only one explainer: disable cross-explanation and llm_explainer_consistency
    if (hasOnlyOneExplainer) {
      return type === 'cross_explanation_score' || type === 'llm_explainer_consistency'
    }

    // When multiple explainers: disable llm_scorer_consistency
    if (selectedExplainers.size > 1) {
      return type === 'llm_scorer_consistency'
    }

    return false
  }

  // Calculate color bar layout using D3 (following project pattern: D3 for calculations, React for rendering)
  const colorBarLayout = useMemo(() => calculateColorBarLayout(400, 12), [])

  // Calculate if scores are averaged and column count for table key (must be before early returns)
  const isAveraged = tableData ? tableData.is_averaged || false : false
  const columnCount = useMemo(() => {
    if (!tableData) return 0
    const numExplainers = tableData.explainer_ids.length
    const numScorers = tableData.scorer_ids.length

    if (isAveraged) {
      // Averaged mode: 3 columns per explainer (embedding, fuzz, detection)
      return numExplainers * 3
    } else {
      // Individual scorer mode: 1 + (numScorers * 2) columns per explainer
      // 1 embedding + numScorers fuzz + numScorers detection
      return numExplainers * (1 + numScorers * 2)
    }
  }, [tableData, isAveraged])

  // Auto-switch from disabled consistency types when explainer count changes
  useEffect(() => {
    // Check if current selection becomes disabled based on explainer count
    const shouldSwitch = (
      // When only one explainer, these are disabled
      (hasOnlyOneExplainer && (
        selectedConsistencyType === 'cross_explanation_score' ||
        selectedConsistencyType === 'llm_explainer_consistency'
      )) ||
      // When multiple explainers, this is disabled
      (selectedExplainers.size > 1 && selectedConsistencyType === 'llm_scorer_consistency')
    )

    if (shouldSwitch) {
      setConsistencyType('none')
    }
  }, [selectedExplainers.size, selectedConsistencyType, setConsistencyType, hasOnlyOneExplainer]) // Re-run when number of explainers changes

  // Handle consistency type click
  const handleConsistencyClick = (value: ConsistencyType) => {
    // Check if disabled
    if (isConsistencyTypeDisabled(value)) {
      return
    }

    // Set consistency type
    setConsistencyType(value)

    // "None" should not trigger sorting
    if (value !== 'none') {
      // Also handle sort for other consistency types
      handleSort({ type: 'consistency', consistencyType: value })
    }
  }

  // Handle sort click
  const handleSort = (newSortBy: SortBy) => {
    // If same sort target, cycle through: null → asc → desc → null
    if (JSON.stringify(sortBy) === JSON.stringify(newSortBy)) {
      if (sortDirection === null) {
        setSortDirection('asc')
      } else if (sortDirection === 'asc') {
        setSortDirection('desc')
      } else {
        // Reset to no sort
        setSortBy(null)
        setSortDirection(null)
      }
    } else {
      // New sort target, start with ascending
      setSortBy(newSortBy)
      setSortDirection('asc')
    }
  }

  // Tooltip state (reserved for future use)
  const [tooltip] = useState<{
    visible: boolean
    text: string
    x: number
    y: number
  }>({
    visible: false,
    text: '',
    x: 0,
    y: 0
  })

  // Fetch data when component mounts or when filters change
  useEffect(() => {
    fetchTableData()
  }, [
    fetchTableData,
    leftPanel.filters.llm_explainer,
    rightPanel.filters.llm_explainer,
    leftPanel.filters.llm_scorer,
    rightPanel.filters.llm_scorer
  ])

  // Build header structure when table data changes or consistency type changes
  useEffect(() => {
    if (tableData && tableData.explainer_ids.length > 0) {
      const isAveraged = tableData.is_averaged || false
      const scorerIds = tableData.scorer_ids || []

      // Use metric-first structure for cross-explanation consistency
      const structure = selectedConsistencyType === 'cross_explanation_score'
        ? buildMetricFirstHeaderStructure(tableData.explainer_ids, isAveraged)
        : buildHeaderStructure(tableData.explainer_ids, isAveraged, scorerIds)

      setHeaderStructure(structure)
    } else {
      setHeaderStructure(null)
    }
  }, [tableData, selectedConsistencyType])

  // Track scroll position for vertical bar scroll indicator
  // Professional approach: Observe inner <table> element that grows when rows are added
  useEffect(() => {
    const container = tableContainerRef.current

    console.log('[TablePanel] Scroll tracking effect running:', {
      hasContainer: !!container,
      featuresLength: tableData?.features.length
    })

    if (!container) {
      console.warn('[TablePanel] No container ref available, skipping scroll tracking setup')
      return
    }

    // Track cleanup resources
    let tableObserver: ResizeObserver | null = null
    let containerObserver: ResizeObserver | null = null
    let mutationObserver: MutationObserver | null = null
    let rafId: number | null = null
    const cleanupTimeouts: number[] = []

    // Measure and update scroll state
    const measureAndUpdate = (source: string = 'unknown') => {
      // Cancel any pending measurement
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }

      // Use requestAnimationFrame to ensure measurement happens after layout
      rafId = requestAnimationFrame(() => {
        const tableElement = container.querySelector('table')
        const scrollState = {
          scrollTop: container.scrollTop,
          scrollHeight: container.scrollHeight,
          clientHeight: container.clientHeight
        }

        const isScrollable = scrollState.scrollHeight > scrollState.clientHeight
        const scrollPercentage = isScrollable
          ? (scrollState.scrollTop / (scrollState.scrollHeight - scrollState.clientHeight) * 100).toFixed(1)
          : '0.0'

        console.log(
          `[TablePanel] Measured (${source}):`,
          scrollState,
          `hasTable: ${!!tableElement},`,
          `isScrollable: ${isScrollable},`,
          `scrolled: ${scrollPercentage}%`
        )

        // Only update state if dimensions are valid (non-zero)
        // This prevents setting invalid state during transitions
        if (scrollState.scrollHeight > 0 && scrollState.clientHeight > 0) {
          setTableScrollState(scrollState)
        } else {
          console.warn('[TablePanel] Skipping state update - invalid dimensions')
        }

        rafId = null
      })
    }

    console.log('[TablePanel] Setting up scroll tracking')

    // 1. Add scroll event listener for user interactions
    const handleScrollEvent = () => measureAndUpdate('scroll-event')
    container.addEventListener('scroll', handleScrollEvent, { passive: true })

    // 2. Observe container for viewport/size changes
    containerObserver = new ResizeObserver(() => measureAndUpdate('container-resize'))
    containerObserver.observe(container)

    // 3. Find and observe inner <table> element (grows when rows are added)
    // Use retry logic to handle React timing issues
    const setupTableObserver = (): boolean => {
      const tableElement = container.querySelector('table')
      if (tableElement && !tableObserver) {
        console.log('[TablePanel] Table element found, attaching ResizeObserver')
        tableObserver = new ResizeObserver(() => measureAndUpdate('table-resize'))
        tableObserver.observe(tableElement)
        measureAndUpdate('initial')
        return true
      }
      return false
    }

    // Try to find table immediately
    if (!setupTableObserver()) {
      // Table not found yet - this is common when effect runs before headerStructure is built
      // Strategy: Retry after 100ms (gives React time to complete render cycle)
      console.log('[TablePanel] Table not found on initial check, scheduling retry in 100ms')

      const retryTimeout = window.setTimeout(() => {
        console.log('[TablePanel] Retry: checking for table element')
        if (!setupTableObserver()) {
          // Still not found after retry, set up MutationObserver as final fallback
          console.log('[TablePanel] Table still not found after retry, setting up MutationObserver')
          mutationObserver = new MutationObserver(() => {
            if (setupTableObserver() && mutationObserver) {
              console.log('[TablePanel] Table detected via MutationObserver')
              mutationObserver.disconnect()
              mutationObserver = null
            }
          })
          mutationObserver.observe(container, { childList: true, subtree: true })

          // Safety: disconnect mutation observer after 5 seconds
          const mutationTimeout = window.setTimeout(() => {
            if (mutationObserver) {
              console.log('[TablePanel] Disconnecting mutation observer (timeout)')
              mutationObserver.disconnect()
              mutationObserver = null
            }
          }, 5000)

          cleanupTimeouts.push(mutationTimeout)
        }
      }, 100)

      cleanupTimeouts.push(retryTimeout)
    }

    console.log('[TablePanel] Scroll tracking setup complete')

    // Cleanup function
    return () => {
      console.log('[TablePanel] Cleaning up scroll tracking')
      container.removeEventListener('scroll', handleScrollEvent)

      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }

      if (containerObserver) {
        containerObserver.disconnect()
      }

      if (tableObserver) {
        tableObserver.disconnect()
      }

      if (mutationObserver) {
        mutationObserver.disconnect()
      }

      // Clean up all retry/mutation timeouts
      cleanupTimeouts.forEach(timeoutId => clearTimeout(timeoutId))
    }
  }, [setTableScrollState, tableData?.features.length, headerStructure])

  // Tooltip handlers (reserved for future use with hover tooltips)
  // const handleMouseEnter = (event: React.MouseEvent<HTMLTableCellElement>, fullName: string) => {
  //   const rect = event.currentTarget.getBoundingClientRect()
  //   setTooltip({
  //     visible: true,
  //     text: fullName,
  //     x: rect.left + rect.width / 2,
  //     y: rect.top - 10
  //   })
  // }

  // const handleMouseLeave = () => {
  //   setTooltip({
  //     visible: false,
  //     text: '',
  //     x: 0,
  //     y: 0
  //   })
  // }

  // ============================================================================
  // SORTED FEATURES (MUST BE BEFORE HANDLERS THAT USE IT)
  // ============================================================================

  // Sort features based on current sort settings
  const sortedFeatures = useMemo(() => {
    if (!tableData || !sortBy || !sortDirection) {
      return tableData?.features || []
    }

    const features = [...tableData.features]

    features.sort((a, b) => {
      let valueA: number | null = null
      let valueB: number | null = null

      if (sortBy.type === 'consistency') {
        // Sort by consistency value
        valueA = getConsistencyValueForSorting(a, sortBy.consistencyType, tableData.explainer_ids)
        valueB = getConsistencyValueForSorting(b, sortBy.consistencyType, tableData.explainer_ids)
      } else if (sortBy.type === 'column') {
        // Sort by column score value
        valueA = getScoreValue(a, sortBy.explainerId, sortBy.metricType, sortBy.scorerId)
        valueB = getScoreValue(b, sortBy.explainerId, sortBy.metricType, sortBy.scorerId)
      }

      return compareValues(valueA, valueB, sortDirection)
    })

    return features
  }, [tableData, sortBy, sortDirection])

  // ============================================================================
  // DRAG GROUPS CALCULATION (Real-time group preview during drag)
  // ============================================================================

  /**
   * Calculate groups being dragged in real-time
   * This shows group-level preview during drag before finalization
   */
  const dragGroups = useMemo(() => {
    if (
      !isDragging ||
      !tableData ||
      !headerStructure ||
      cellSelection.startRow === null ||
      cellSelection.startCol === null ||
      cellSelection.endRow === null ||
      cellSelection.endCol === null
    ) {
      return []
    }

    return findGroupsInRectangle(
      cellSelection.startRow,
      cellSelection.startCol,
      cellSelection.endRow,
      cellSelection.endCol,
      sortedFeatures,
      headerStructure,
      isAveraged
    )
  }, [
    isDragging,
    tableData,
    headerStructure,
    cellSelection.startRow,
    cellSelection.startCol,
    cellSelection.endRow,
    cellSelection.endCol,
    sortedFeatures,
    isAveraged
  ])

  // ============================================================================
  // CELL SELECTION HANDLERS (Click + Drag with Group-Level Selection)
  // ============================================================================

  /**
   * Handle mouse down on cell - start drag selection
   */
  const handleCellMouseDown = useCallback((rowIndex: number, colIndex: number) => {
    if (!tableData || !headerStructure) return

    // Determine drag mode based on starting cell
    const featureRow = sortedFeatures[rowIndex]
    if (!featureRow) return

    const featureId = featureRow.feature_id
    const explainerId = getExplainerForColumnIndex(colIndex, headerStructure, isAveraged)
    if (!explainerId) return

    // Check if starting cell's group is already selected
    const startingGroup = findGroupByKey(featureId, explainerId, cellSelection.groups)
    const mode = startingGroup ? 'difference' : 'union'
    setDragMode(mode)

    // Start drag selection
    setCellSelection({
      ...cellSelection,
      startRow: rowIndex,
      startCol: colIndex,
      endRow: rowIndex,
      endCol: colIndex
    })

    setIsDragging(true)
  }, [tableData, headerStructure, cellSelection, setCellSelection, sortedFeatures, isAveraged])

  /**
   * Handle mouse enter on cell - update drag selection rectangle
   */
  const handleCellMouseEnter = useCallback((rowIndex: number, colIndex: number) => {
    if (!isDragging) return

    // Update end position
    setCellSelection({
      ...cellSelection,
      endRow: rowIndex,
      endCol: colIndex
    })
  }, [isDragging, cellSelection, setCellSelection])

  /**
   * Handle mouse up - finalize selection with group-level logic
   */
  const handleCellMouseUp = useCallback(() => {
    if (!isDragging) return
    if (!tableData || !headerStructure) return
    if (
      cellSelection.startRow === null ||
      cellSelection.startCol === null ||
      cellSelection.endRow === null ||
      cellSelection.endCol === null
    ) {
      setIsDragging(false)
      return
    }

    // Check if this was a click (no movement) or a drag
    const isClick =
      cellSelection.startRow === cellSelection.endRow &&
      cellSelection.startCol === cellSelection.endCol

    if (isClick) {
      // Click: Toggle single group
      const rowIndex = cellSelection.startRow
      const colIndex = cellSelection.startCol

      const featureRow = sortedFeatures[rowIndex]
      if (!featureRow) {
        setIsDragging(false)
        setCellSelection({
          ...cellSelection,
          startRow: null,
          startCol: null,
          endRow: null,
          endCol: null
        })
        return
      }
      const featureId = featureRow.feature_id

      const explainerId = getExplainerForColumnIndex(colIndex, headerStructure, isAveraged)
      if (!explainerId) {
        setIsDragging(false)
        setCellSelection({
          ...cellSelection,
          startRow: null,
          startCol: null,
          endRow: null,
          endCol: null
        })
        return
      }

      // Check if group already selected
      const existingGroup = findGroupByKey(featureId, explainerId, cellSelection.groups)

      if (existingGroup) {
        // Toggle off
        toggleCellGroup(existingGroup)
      } else {
        // Toggle on - create new group
        const newGroup = createCellGroup(
          featureId,
          explainerId,
          headerStructure,
          isAveraged,
          cellSelection.groups.length
        )
        toggleCellGroup(newGroup)
      }

      // Clear only drag state fields (toggleCellGroup already updated groups)
      // Get current state from store to avoid overwriting the groups that were just updated
      const currentState = useVisualizationStore.getState()
      setCellSelection({
        ...currentState.cellSelection,
        startRow: null,
        startCol: null,
        endRow: null,
        endCol: null
      })
      setIsDragging(false)
    } else {
      // Drag: Find all groups in rectangle
      const draggedGroups = findGroupsInRectangle(
        cellSelection.startRow,
        cellSelection.startCol,
        cellSelection.endRow,
        cellSelection.endCol,
        sortedFeatures,
        headerStructure,
        isAveraged
      )

      const currentGroups = cellSelection.groups

      // Smart multi-selection logic based on where drag started:
      // - Started in unselected group → Union mode (add all dragged groups)
      // - Started in selected group → Difference mode (remove all dragged groups)
      let finalGroups: typeof currentGroups

      if (dragMode === 'union') {
        // Union: Keep all current groups + add new dragged groups (deduplicated)
        const existingIds = new Set(currentGroups.map(g => g.id))
        const newGroups = draggedGroups.filter(dg => !existingIds.has(dg.id))
        finalGroups = [...currentGroups, ...newGroups]
      } else {
        // Difference: Remove dragged groups from current, keep others
        const draggedIds = new Set(draggedGroups.map(dg => dg.id))
        finalGroups = currentGroups.filter(cg => !draggedIds.has(cg.id))
      }

      // Set the selected groups with smart selection logic
      setCellSelection({
        groups: finalGroups,
        startRow: null,
        startCol: null,
        endRow: null,
        endCol: null
      })
    }

    setIsDragging(false)
    setDragMode(null)
  }, [
    isDragging,
    cellSelection,
    tableData,
    headerStructure,
    sortedFeatures,
    isAveraged,
    setCellSelection,
    toggleCellGroup,
    clearCellSelection,
    dragMode
  ])

  /**
   * Handle mouse leave from table - cancel selection
   */
  const handleTableMouseLeave = useCallback(() => {
    if (isDragging) {
      setIsDragging(false)
      setDragMode(null)
      clearCellSelection()
    }
  }, [isDragging, clearCellSelection])

  // Global mouse up listener to handle mouse up outside table
  useEffect(() => {
    if (!isDragging) return

    const handleGlobalMouseUp = () => {
      handleCellMouseUp()
    }

    document.addEventListener('mouseup', handleGlobalMouseUp)
    return () => {
      document.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [isDragging, handleCellMouseUp])

  // If no data or no explainers selected
  if (!tableData || !tableData.features || tableData.features.length === 0 || selectedExplainers.size === 0) {
    return (
      <div className={`table-panel${className ? ` ${className}` : ''}`}>
        <div className="table-panel__content" ref={tableContainerRef}>
          <p className="table-panel__placeholder">
            Select LLM explainers from the flowchart to view feature-level scoring data
          </p>
        </div>
      </div>
    )
  }

  if (!headerStructure) {
    return (
      <div className={`table-panel${className ? ` ${className}` : ''}`}>
        <div className="table-panel__content" ref={tableContainerRef}>
          <p className="table-panel__placeholder">
            Loading...
          </p>
        </div>
      </div>
    )
  }

  // Determine which header rows should be highlighted based on selected consistency type
  const getHighlightedRows = (): { row1: boolean; row2: boolean; row3: boolean } => {
    switch (selectedConsistencyType) {
      case 'none':
        // No consistency: no highlighting
        return { row1: false, row2: false, row3: false }
      case 'llm_scorer_consistency':
        // LLM Scorer: highlights row 3 (scorer labels)
        return { row1: false, row2: false, row3: true }
      case 'within_explanation_score':
        // Within-explanation: highlights row 2 (metric names in normal view)
        return { row1: false, row2: true, row3: false }
      case 'cross_explanation_score':
        // Cross-explanation: In reordered view, row 1 = metrics, row 2 = explainers
        // Highlight row 2 (explainers) since we're comparing across explainers
        return { row1: false, row2: true, row3: false }
      case 'llm_explainer_consistency':
        // LLM Explainer: highlights row 1 (explainer names in normal view)
        return { row1: true, row2: false, row3: false }
      default:
        return { row1: false, row2: false, row3: false }
    }
  }

  const highlightedRows = getHighlightedRows()

  // Render table with conditional 2-row or 3-row header
  return (
    <div className={`table-panel${className ? ` ${className}` : ''}`}>
      {/* Loading Overlay */}
      {isLoading && (
        <div className="table-panel__loading-overlay">
          <div className="table-panel__loading-spinner" />
        </div>
      )}

      {/* Consistency Header */}
      <div className="table-panel__header">
        {/* Title */}
        <div className="table-panel__consistency-title">Consistency</div>

        {/* Consistency Type Buttons (5 horizontal) */}
        <div className="table-panel__main-categories">
          {CONSISTENCY_OPTIONS.map((option) => {
            const disabled = isConsistencyTypeDisabled(option.value)
            // Check if this button is active
            const isActive = selectedConsistencyType === option.value
            // Check if this button is currently sorted
            const isSorted = sortBy?.type === 'consistency' && sortBy.consistencyType === option.value
            // "None" should not have sorting indicator
            const showSortIndicator = option.value !== 'none'
            return (
              <button
                key={option.id}
                className={`table-panel__main-category-button ${
                  isActive ? 'active' : ''
                } ${disabled ? 'disabled' : ''}`}
                onClick={() => handleConsistencyClick(option.value)}
                disabled={disabled}
              >
                {option.label}
                {showSortIndicator && (
                  <span className={`table-panel__sort-indicator ${isSorted ? 'active' : ''} ${sortDirection || ''}`} />
                )}
              </button>
            )
          })}
        </div>

        {/* Color Bar Legend (D3 calculated layout with inline labels) */}
        <div className="table-panel__consistency-legend">
          <svg
            width={colorBarLayout.width}
            height={colorBarLayout.height}
            className="table-panel__color-bar"
          >
            <defs>
              <linearGradient id="consistency-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                {colorBarLayout.gradientStops.map((stop, idx) => (
                  <stop key={idx} offset={stop.offset} stopColor={stop.color} />
                ))}
              </linearGradient>
            </defs>

            {/* Left label */}
            <text
              x={colorBarLayout.leftLabelX}
              y={colorBarLayout.leftLabelY}
              className="table-panel__color-bar-label-left"
              textAnchor="start"
              dominantBaseline="central"
            >
              0 Low
            </text>

            {/* Gradient bar */}
            <rect
              x={colorBarLayout.barX}
              y={colorBarLayout.barY}
              width={colorBarLayout.barWidth}
              height={colorBarLayout.barHeight}
              fill="url(#consistency-gradient)"
              rx="2"
            />

            {/* Right label */}
            <text
              x={colorBarLayout.rightLabelX}
              y={colorBarLayout.rightLabelY}
              className="table-panel__color-bar-label-right"
              textAnchor="start"
              dominantBaseline="central"
            >
              1 High
            </text>
          </svg>
        </div>
      </div>

      <div
        className={`table-panel__content ${isLoading ? 'loading' : ''}`}
        ref={tableContainerRef}
      >
        <table
          className={`table-panel__table ${isDragging ? 'selecting' : ''}`}
          key={`table-${columnCount}-${tableData?.scorer_ids.length || 0}`}
        >
          <thead className="table-panel__thead">
            {/* Row 1: Dynamic (Explainers or Metrics depending on view) */}
            <tr className={`table-panel__header-row-1 ${highlightedRows.row1 ? 'highlighted' : ''}`}>
              <th className="table-panel__feature-id-header" rowSpan={isAveraged ? 2 : 3}>
                ID
              </th>
              {headerStructure.row1.map((cell, idx) => {
                const cellClass = cell.type === 'metric'
                  ? 'table-panel__metric-header'
                  : 'table-panel__explainer-header'
                return (
                  <th
                    key={`row1-${idx}`}
                    colSpan={cell.colSpan}
                    className={`${cellClass} ${highlightedRows.row1 ? 'highlighted' : ''}`}
                  >
                    {cell.type === 'explainer' ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '12px' }}>💬</span>
                        <span>{cell.label}</span>
                      </div>
                    ) : (
                      cell.label
                    )}
                  </th>
                )
              })}
            </tr>

            {/* Row 2: Dynamic (Metrics or Explainers depending on view) */}
            <tr className={`table-panel__header-row-2 ${highlightedRows.row2 ? 'highlighted' : ''}`}>
              {headerStructure.row2.map((cell, idx) => {
                const cellClass = cell.type === 'metric'
                  ? 'table-panel__metric-header'
                  : 'table-panel__explainer-header'

                // Check if this column is sortable (has explainerId and metricType)
                const isSortable = cell.explainerId && cell.metricType
                // Check if currently sorted
                const isSorted = isSortable && sortBy?.type === 'column' &&
                  sortBy.explainerId === cell.explainerId &&
                  sortBy.metricType === cell.metricType &&
                  !sortBy.scorerId // Row2 cells don't have scorerId

                return (
                  <th
                    key={`row2-${idx}`}
                    colSpan={cell.colSpan}
                    className={`${cellClass} ${highlightedRows.row2 ? 'highlighted' : ''} ${isSortable ? 'table-panel__sortable-header' : ''}`}
                    onClick={() => {
                      if (isSortable) {
                        handleSort({
                          type: 'column',
                          explainerId: cell.explainerId!,
                          metricType: cell.metricType!,
                          scorerId: undefined
                        })
                      }
                    }}
                  >
                    {cell.type === 'explainer' ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '12px' }}>💬</span>
                        <span>{cell.label}</span>
                        {isSortable && (
                          <span className={`table-panel__sort-indicator ${isSorted ? 'active' : ''} ${sortDirection || ''}`} />
                        )}
                      </div>
                    ) : (
                      <>
                        {cell.label}
                        {isSortable && (
                          <span className={`table-panel__sort-indicator ${isSorted ? 'active' : ''} ${sortDirection || ''}`} />
                        )}
                      </>
                    )}
                  </th>
                )
              })}
            </tr>

            {/* Row 3: Scorer labels (only shown when not averaged) */}
            {!isAveraged && (
              <tr className={`table-panel__header-row-3 ${highlightedRows.row3 ? 'highlighted' : ''}`}>
                {headerStructure.row3.map((cell, idx) => {
                  // Check if this column is sortable
                  const isSortable = cell.explainerId && cell.metricType && cell.metricType !== 'embedding'
                  // Check if currently sorted
                  const isSorted = isSortable && sortBy?.type === 'column' &&
                    sortBy.explainerId === cell.explainerId &&
                    sortBy.metricType === cell.metricType &&
                    sortBy.scorerId === cell.scorerId

                  // Check if this is an embedding scorer cell (empty cell that needs diagonal line)
                  const isEmbeddingScorer = cell.metricType === 'embedding'

                  return (
                    <th
                      key={`scorer-${idx}`}
                      className={`table-panel__scorer-header ${highlightedRows.row3 ? 'highlighted' : ''} ${isSortable ? 'table-panel__sortable-header' : ''} ${isEmbeddingScorer ? 'table-panel__scorer-header--empty' : ''}`}
                      onClick={() => {
                        if (isSortable) {
                          handleSort({
                            type: 'column',
                            explainerId: cell.explainerId!,
                            metricType: cell.metricType!,
                            scorerId: cell.scorerId
                          })
                        }
                      }}
                    >
                      {cell.type === 'scorer' && cell.label && !isEmbeddingScorer ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1px' }}>
                          <span style={{ fontSize: '10px' }}>🎯</span>
                          <span>{cell.label}</span>
                          {isSortable && (
                            <span className={`table-panel__sort-indicator ${isSorted ? 'active' : ''} ${sortDirection || ''}`} />
                          )}
                        </div>
                      ) : (
                        <>
                          {cell.label}
                          {isSortable && (
                            <span className={`table-panel__sort-indicator ${isSorted ? 'active' : ''} ${sortDirection || ''}`} />
                          )}
                        </>
                      )}
                    </th>
                  )
                })}
              </tr>
            )}
          </thead>

          <tbody className="table-panel__tbody" onMouseLeave={handleTableMouseLeave}>
            {sortedFeatures.map((row: FeatureTableRow, rowIdx: number) => {
              // Use metric-first extraction for cross-explanation consistency
              const scores = selectedConsistencyType === 'cross_explanation_score'
                ? extractRowScoresMetricFirst(row, tableData.explainer_ids, isAveraged)
                : extractRowScores(row, tableData.explainer_ids, isAveraged, tableData.scorer_ids.length)

              return (
                <tr key={row.feature_id} className="table-panel__feature-row">
                  <td className="table-panel__feature-id-cell">
                    {row.feature_id}
                  </td>
                  {scores.map((score, idx) => {
                    // Determine which cell this score belongs to using header structure
                    // Use row3 for scorer-specific cells, row2 for metric cells
                    let consistency: number | null = null

                    // Map score index to header cell for consistency lookup
                    if (!isAveraged && headerStructure.row3.length > 0) {
                      // 3-row header: row3 has scorer-level cells
                      const headerCell = headerStructure.row3[idx]
                      if (headerCell && headerCell.explainerId && headerCell.metricType) {
                        consistency = getConsistencyForCell(
                          row,
                          headerCell.explainerId,
                          headerCell.metricType,
                          selectedConsistencyType
                        )
                      }
                    } else if (headerStructure.row2.length > 0) {
                      // 2-row header: row2 has metric-level cells
                      const headerCell = headerStructure.row2[idx]
                      if (headerCell && headerCell.explainerId && headerCell.metricType) {
                        consistency = getConsistencyForCell(
                          row,
                          headerCell.explainerId,
                          headerCell.metricType,
                          selectedConsistencyType
                        )
                      }
                    }

                    // Apply background color based on consistency
                    const bgColor = consistency !== null ? getConsistencyColor(consistency) : 'transparent'

                    // Check if cell belongs to a finalized group OR a drag group
                    const finalizedGroup = getCellGroup(rowIdx, idx, row.feature_id, cellSelection.groups)
                    const dragGroup = getCellGroup(rowIdx, idx, row.feature_id, dragGroups)

                    // Determine drag state for styling based on drag mode
                    const isDraggingUnion = dragGroup && dragMode === 'union'  // Union mode: blue (will add)
                    const isDraggingDifference = dragGroup && dragMode === 'difference'  // Difference mode: red (will remove)
                    const isFinalized = finalizedGroup && !dragGroup  // Finalized selection (not being dragged)

                    const cellGroup = finalizedGroup || dragGroup

                    // Determine edge positions for group border rectangle
                    let isLeftEdge = false
                    let isRightEdge = false
                    if (cellGroup) {
                      const minColIndex = Math.min(...cellGroup.cellIndices)
                      const maxColIndex = Math.max(...cellGroup.cellIndices)
                      isLeftEdge = idx === minColIndex
                      isRightEdge = idx === maxColIndex
                    }

                    // Build CSS classes with different styles for different states
                    const cellClasses = [
                      'table-panel__score-cell',
                      // Add edge classes with state-specific modifiers
                      cellGroup ? 'selected-edge-top selected-edge-bottom' : '',
                      cellGroup && isLeftEdge ? 'selected-edge-left' : '',
                      cellGroup && isRightEdge ? 'selected-edge-right' : '',
                      // Add state-specific classes for styling
                      isDraggingUnion ? 'dragging-new' : '',  // Blue border (union mode)
                      isDraggingDifference ? 'dragging-existing' : '',  // Red border (difference mode)
                      isFinalized ? 'finalized' : ''  // Blue border (finalized)
                    ].filter(Boolean).join(' ')

                    return (
                      <td
                        key={`${row.feature_id}-${idx}`}
                        className={cellClasses}
                        style={{
                          backgroundColor: bgColor,
                          color: consistency !== null && consistency < 0.5 ? 'white' : '#374151'  // White text for dark backgrounds
                        }}
                        onMouseDown={() => handleCellMouseDown(rowIdx, idx)}
                        onMouseEnter={() => handleCellMouseEnter(rowIdx, idx)}
                      >
                        {formatTableScore(score)}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Save Cell Group Selection UI */}
      {cellSelection.groups.length > 0 && !showCellGroupNameInput && (
        <button
          className="table-panel__save-button"
          onClick={startSavingCellGroups}
        >
          Save Selection
        </button>
      )}

      {/* Name Input for Saving Cell Groups */}
      {showCellGroupNameInput && (
        <div className="table-panel__save-input-container">
          <input
            type="text"
            className="table-panel__save-input"
            placeholder="Enter group name..."
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                finishSavingCellGroups(groupName)
                setGroupName('')
              } else if (e.key === 'Escape') {
                cancelSavingCellGroups()
                setGroupName('')
              }
            }}
            autoFocus
          />
          <div className="table-panel__save-input-buttons">
            <button
              className="table-panel__save-input-cancel"
              onClick={() => {
                cancelSavingCellGroups()
                setGroupName('')
              }}
            >
              Cancel
            </button>
            <button
              className="table-panel__save-input-confirm"
              onClick={() => {
                finishSavingCellGroups(groupName)
                setGroupName('')
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Portal-based tooltip */}
      {tooltip.visible && createPortal(
        <>
          <div
            className="table-panel__tooltip"
            style={{
              left: `${tooltip.x}px`,
              top: `${tooltip.y}px`,
              transform: 'translateX(-50%) translateY(-100%)'
            }}
          >
            {tooltip.text}
          </div>
          <div
            className="table-panel__tooltip-arrow"
            style={{
              left: `${tooltip.x}px`,
              top: `${tooltip.y}px`,
              transform: 'translateX(-50%) translateY(-100%)'
            }}
          />
        </>,
        document.body
      )}
    </div>
  )
}

export default TablePanel
