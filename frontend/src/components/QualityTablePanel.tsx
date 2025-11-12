import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import ReactDOM from 'react-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useVisualizationStore } from '../store/index'
import type { FeatureTableDataResponse } from '../types'
import {
  sortFeatures,
  getExplainerDisplayName,
  findMaxQualityScoreExplainer
} from '../lib/table-utils'
import { getBadgeColors } from '../lib/utils'
import { TAG_CATEGORY_QUALITY, TAG_CATEGORIES } from '../lib/tag-constants'
import {
  getCircleRadius
} from '../lib/circle-encoding-utils'
import {
  METRIC_QUALITY_SCORE,
  CATEGORY_DECODER_SIMILARITY
} from '../lib/constants'
import {
  TAG_CATEGORY_FEATURE_SPLITTING,
  TAG_CATEGORY_CAUSE
} from '../lib/tag-constants'
import { HighlightedExplanation } from './HighlightedExplanation'
import ActivationExample from './ActivationExample'
import QualityScoreBreakdown from './QualityScoreBreakdown'
import DecoderSimilarityTable from './FeatureSplitTable'
import CauseTablePanel from './CauseTablePanel'
import SimilarityTaggingPopover from './SimilarityTaggingPopover'
import TableSelectionPanel from './TableSelectionPanel'
import '../styles/QualityTablePanel.css'

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
  const setTableScrollState = useVisualizationStore(state => state.setTableScrollState)
  const isLoading = useVisualizationStore(state => state.loading.table)
  const tableSelectedNodeIds = useVisualizationStore(state => state.tableSelectedNodeIds)
  const activeStageNodeId = useVisualizationStore(state => state.activeStageNodeId)
  const activeStageCategory = useVisualizationStore(state => state.activeStageCategory)

  // Feature selection state (three-state: null -> selected -> rejected -> null)
  const featureSelectionStates = useVisualizationStore(state => state.featureSelectionStates)
  const featureSelectionSources = useVisualizationStore(state => state.featureSelectionSources)
  const toggleFeatureSelection = useVisualizationStore(state => state.toggleFeatureSelection)

  const tableContainerRef = useRef<HTMLDivElement>(null)
  const qualityScoreCellRef = useRef<HTMLTableCellElement>(null)

  // Track activation column width to pass to ActivationExample components
  const [activationColumnWidth, setActivationColumnWidth] = useState<number>(630) // Default: 45% of ~1400px

  // Ref map to track row elements for scrolling to highlighted features
  const featureRowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map())

  // Sorting state from store
  const sortBy = useVisualizationStore(state => state.tableSortBy)
  const sortDirection = useVisualizationStore(state => state.tableSortDirection)
  const setTableSort = useVisualizationStore(state => state.setTableSort)

  // Similarity sort state and action
  const similarityScores = useVisualizationStore(state => state.similarityScores)
  const sortedBySelectionStates = useVisualizationStore(state => state.sortedBySelectionStates)
  const moveToNextStep = useVisualizationStore(state => state.moveToNextStep)

  // ============================================================================
  // STATE
  // ============================================================================

  // Simple popover state (like activation example)
  const [showExplanationPopover, setShowExplanationPopover] = useState<{
    featureId: number
    validExplainerIds: string[]
    featureRow: any
    position?: 'above' | 'below'
  } | null>(null)

  const [qualityPopover, setQualityPopover] = useState<{
    featureId: number
    rect: DOMRect
    feature: any
    position: 'above' | 'below'
    width: number
  } | null>(null)

  // Activation examples from global store (centralized cache)
  const activationExamples = useVisualizationStore(state => state.activationExamples)

  // Get badge labels and colors from tag categories
  const badgeConfig = useMemo(() => {
    const sankeyTree = leftPanel.sankeyTree
    const colors = getBadgeColors(sankeyTree, TAG_CATEGORY_QUALITY, TAG_CATEGORIES)
    const category = TAG_CATEGORIES[TAG_CATEGORY_QUALITY]

    return {
      selected: {
        label: category.tags[1], // "well-explained" (group 1, HIGH quality)
        color: colors[category.tags[1]] || '#10b981'
      },
      rejected: {
        label: category.tags[0], // "need revision" (group 0, LOW quality)
        color: colors[category.tags[0]] || '#ef4444'
      }
    }
  }, [leftPanel.sankeyTree])

  // Get selected LLM explainers (needed for disabled logic)
  const selectedExplainers = new Set<string>()
  if (leftPanel.filters.llm_explainer) {
    leftPanel.filters.llm_explainer.forEach(e => selectedExplainers.add(e))
  }
  if (rightPanel.filters.llm_explainer) {
    rightPanel.filters.llm_explainer.forEach(e => selectedExplainers.add(e))
  }

  // Detect popover position (above/below) based on available space
  const detectExplanationPopoverPosition = (cellElement: HTMLElement): 'above' | 'below' => {
    const rect = cellElement.getBoundingClientRect()
    // Estimated popover height ~150px
    const spaceBelow = window.innerHeight - rect.bottom
    return spaceBelow < 150 ? 'above' : 'below'
  }

  // Handle sort click
  const handleSort = (sortKey: 'featureId' | typeof METRIC_QUALITY_SCORE) => {
    // Cycle through: null → asc → desc → null
    if (sortBy === sortKey) {
      if (sortDirection === null) {
        setTableSort(sortKey, 'asc')
      } else if (sortDirection === 'asc') {
        setTableSort(sortKey, 'desc')
      } else {
        // Reset to no sort
        setTableSort(null, null)
      }
    } else {
      // New sort target, start with ascending
      setTableSort(sortKey, 'asc')
    }
  }

  // Handler for quality score hover (portal-based)
  const handleQualityScoreHover = useCallback((feature: any | null, cellElement?: HTMLElement | null) => {
    if (feature === null || !cellElement) {
      setQualityPopover(null)
      return
    }

    const rect = cellElement.getBoundingClientRect()

    // Calculate if there's enough space below for the popover (estimated 120px height)
    const popoverHeight = 120
    const spaceBelow = window.innerHeight - rect.bottom
    const position = spaceBelow < popoverHeight ? 'above' : 'below'

    // Calculate combined width of ID and Quality Score cells and get left position from ID cell
    const rowElement = cellElement.parentElement as HTMLTableRowElement | null
    let width = 180 // default
    let adjustedRect = rect
    if (rowElement) {
      const idCell = rowElement.cells[1] as HTMLTableCellElement | undefined
      const qsCell = rowElement.cells[2] as HTMLTableCellElement | undefined
      if (idCell && qsCell) {
        const idRect = idCell.getBoundingClientRect()
        const qsRect = qsCell.getBoundingClientRect()
        width = qsRect.right - idRect.left
        // Create new rect with left position from ID cell
        adjustedRect = new DOMRect(idRect.left, rect.top, width, rect.height)
      }
    }

    setQualityPopover({
      featureId: feature.feature_id,
      rect: adjustedRect,
      feature,
      position,
      width
    })
  }, [])

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

  // Measure activation column width once (eliminates shifting in ActivationExample)
  useEffect(() => {
    if (!tableContainerRef.current) return

    const measureActivationColumn = () => {
      const headerCell = tableContainerRef.current?.querySelector('.table-panel__header-cell--activation-example')
      if (headerCell) {
        const width = headerCell.getBoundingClientRect().width
        if (width > 0) {
          setActivationColumnWidth(width)
        }
      }
    }

    // Initial measurement
    measureActivationColumn()

    // Watch for table resize
    const observer = new ResizeObserver(measureActivationColumn)
    observer.observe(tableContainerRef.current)

    return () => observer.disconnect()
  }, [])

  // 🚀 NO FETCH NEEDED: Activation examples are pre-fetched by store.fetchTableData()
  // and available instantly from global cache (activationExamples)

  // ============================================================================
  // SORTED FEATURES
  // ============================================================================

  // Get selected node features for filtering
  const leftPanelSankeyTree = useVisualizationStore(state => state.leftPanel.sankeyTree)

  // Compute selected features with proper reactive dependencies
  const selectedFeatures = useMemo(() => {
    if (tableSelectedNodeIds.length === 0) {
      return null
    }

    const featureIds = new Set<number>()
    for (const nodeId of tableSelectedNodeIds) {
      const node = leftPanelSankeyTree?.get(nodeId)
      if (node?.featureIds) {
        node.featureIds.forEach((id: number) => featureIds.add(id))
      }
    }

    console.log('[TablePanel] Selected features computed:', {
      nodeCount: tableSelectedNodeIds.length,
      featureCount: featureIds.size
    })

    return featureIds
  }, [tableSelectedNodeIds, leftPanelSankeyTree])

  // Sort features based on current sort settings (using shared utility)
  const sortedFeatures = useMemo(() => {
    let features = tableData?.features || []

    // Filter by selected node features if any nodes are selected
    if (selectedFeatures && selectedFeatures.size > 0) {
      features = features.filter(f => selectedFeatures.has(f.feature_id))
      console.log(`[TablePanel] Filtered to ${features.length} features from ${tableSelectedNodeIds.length} selected node(s)`)
    }

    // Special handling for similarity sorting
    if (sortBy === 'similarity') {
      const selected: any[] = []
      const rejected: any[] = []
      const unselected: any[] = []

      // Use frozen selection states (from when sort was performed)
      // This prevents re-grouping when user changes selection after sorting
      const groupingStates = sortedBySelectionStates || new Map<number, 'selected' | 'rejected'>()

      // Separate into three groups based on FROZEN states
      features.forEach(feature => {
        const selectionState = groupingStates.get(feature.feature_id)
        if (selectionState === 'selected') {
          selected.push(feature)
        } else if (selectionState === 'rejected') {
          rejected.push(feature)
        } else {
          unselected.push(feature)
        }
      })

      // Sort unselected by similarity score (descending - higher is better)
      unselected.sort((a, b) => {
        const scoreA = similarityScores.get(a.feature_id) ?? -Infinity
        const scoreB = similarityScores.get(b.feature_id) ?? -Infinity
        return scoreB - scoreA // Descending
      })

      console.log('[TablePanel] Similarity sort applied:', {
        selected: selected.length,
        unselected: unselected.length,
        rejected: rejected.length,
        usingFrozenStates: !!sortedBySelectionStates
      })

      // Return three-tier structure
      return [...selected, ...unselected, ...rejected]
    }

    // Standard sorting using utility function
    return sortFeatures(
      features,
      sortBy,
      sortDirection,
      tableData
    )
  }, [tableData, sortBy, sortDirection, selectedFeatures, tableSelectedNodeIds.length, sortedBySelectionStates, similarityScores])

  // Get list of explainer IDs for iteration (moved before early returns)
  const explainerIds = useMemo(() => tableData?.explainer_ids || [], [tableData?.explainer_ids])

  // Calculate total row count for row-level virtualization (moved before early returns)
  // Now simplified: 1 row per feature (showing only max quality score explainer)
  const totalRowCount = useMemo(() => {
    return sortedFeatures.length
  }, [sortedFeatures])

  // Virtual scrolling for performance with large datasets (moved before early returns)
  const rowVirtualizer = useVirtualizer({
    count: totalRowCount,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 54,  /* Matches fixed activation example height: 3 quantiles × 18px */
    overscan: 5,
  })

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
    const measureAndUpdate = () => {
      // Cancel any pending measurement
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }

      // Use requestAnimationFrame to ensure measurement happens after layout
      rafId = requestAnimationFrame(() => {
        // Get virtual items to determine visible rows and features
        const virtualItems = rowVirtualizer.getVirtualItems()
        const firstVisibleRowIndex = virtualItems[0]?.index ?? 0
        const lastVisibleRowIndex = virtualItems[virtualItems.length - 1]?.index ?? 0

        // Extract visible feature IDs from visible row range
        const visibleFeatureIds = new Set<number>()
        if (sortedFeatures.length > 0 && explainerIds.length > 0) {
          let currentRowIndex = 0
          for (const feature of sortedFeatures) {
            const validExplainerCount = explainerIds.filter(explainerId => {
              const data = feature.explainers[explainerId]
              return data !== undefined && data !== null
            }).length

            // Check if this feature overlaps with visible row range
            const featureStartRow = currentRowIndex
            const featureEndRow = currentRowIndex + validExplainerCount - 1

            if (featureEndRow >= firstVisibleRowIndex && featureStartRow <= lastVisibleRowIndex) {
              visibleFeatureIds.add(feature.feature_id)
            }

            currentRowIndex += validExplainerCount

            // Early exit if we've passed the visible range
            if (currentRowIndex > lastVisibleRowIndex) break
          }
        }

        const scrollState = {
          scrollTop: container.scrollTop,
          scrollHeight: container.scrollHeight,
          clientHeight: container.clientHeight,
          firstVisibleRowIndex,
          lastVisibleRowIndex,
          totalRowCount,
          visibleFeatureIds
        }

        // Only update state if dimensions are valid (non-zero)
        if (scrollState.scrollHeight > 0 && scrollState.clientHeight > 0) {
          setTableScrollState(scrollState)
        }

        rafId = null
      })
    }

    // 1. Add scroll event listener for user interactions
    const handleScrollEvent = () => measureAndUpdate()
    container.addEventListener('scroll', handleScrollEvent, { passive: true })

    // 2. Observe container for viewport/size changes
    containerObserver = new ResizeObserver(() => measureAndUpdate())
    containerObserver.observe(container)

    // 3. Find and observe inner <table> element (grows when rows are added)
    // Use retry logic to handle React timing issues
    const setupTableObserver = (): boolean => {
      const tableElement = container.querySelector('table')
      if (tableElement && !tableObserver) {
        tableObserver = new ResizeObserver(() => measureAndUpdate())
        tableObserver.observe(tableElement)
        measureAndUpdate()
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
  }, [setTableScrollState, sortedFeatures, explainerIds, rowVirtualizer, totalRowCount, tableData?.features.length])  // Re-run when features change

  // Check if we should render stage-specific table (moved before other early returns)
  // Use stored category for simple and reliable check
  if (activeStageNodeId && activeStageCategory) {
    // Feature Splitting category → Show DecoderSimilarityTable
    if (activeStageCategory === TAG_CATEGORY_FEATURE_SPLITTING) {
      return <DecoderSimilarityTable className={className} />
    }

    // Cause category → Show CauseTablePanel
    if (activeStageCategory === TAG_CATEGORY_CAUSE) {
      return <CauseTablePanel className={className} />
    }

    // Quality category → Show normal TablePanel (fall through)
    // This is handled by continuing with the normal table rendering below
  }

  // Legacy support: Check old CATEGORY_DECODER_SIMILARITY constant
  if (activeStageNodeId && activeStageCategory === CATEGORY_DECODER_SIMILARITY) {
    return <DecoderSimilarityTable className={className} />
  }

  // Show loading indicator during initial fetch
  if (isLoading && (!tableData || !tableData.features || tableData.features.length === 0)) {
    return (
      <div className={`table-panel${className ? ` ${className}` : ''}`}>
        <div className="table-panel__loading-overlay">
          <div className="table-panel__loading-spinner" />
        </div>
      </div>
    )
  }

  // If no data or no explainers selected (and not loading)
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

  // Render new simplified table with 3 sub-rows per feature
  return (
    <div className={`table-panel${className ? ` ${className}` : ''}`}>
      {/* Loading Overlay */}
      {isLoading && (
        <div className="table-panel__loading-overlay">
          <div className="table-panel__loading-spinner" />
        </div>
      )}

      {/* Unified Selection Panel with header, buttons, and state bar */}
      <TableSelectionPanel
        mode="feature"
        tagLabel="Well-Explained"
        onDone={moveToNextStep}
        doneButtonEnabled={true}
      />

      <div
        className={`table-panel__content ${isLoading ? 'loading' : ''}`}
        ref={tableContainerRef}
      >
        <table className="table-panel__table table-panel__table--simple">
          <thead className="table-panel__thead">
            <tr className="table-panel__header-row">
              {/* Index column */}
              <th className="table-panel__header-cell table-panel__header-cell--index">
                #
              </th>
              {/* Checkbox column */}
              <th className="table-panel__header-cell table-panel__header-cell--checkbox">
                Quality
              </th>
              <th
                className="table-panel__header-cell table-panel__header-cell--id"
                onClick={() => handleSort('featureId')}
              >
                ID
                {sortBy === 'featureId' && (
                  <span className={`table-panel__sort-indicator ${sortDirection || ''}`} />
                )}
              </th>
              <th className="table-panel__header-cell table-panel__header-cell--explainer">
                LLM Explainer
              </th>
              <th
                className="table-panel__header-cell table-panel__header-cell--quality-score"
                onClick={() => handleSort(METRIC_QUALITY_SCORE)}
                title="Quality Score"
              >
                Quality Score
                {sortBy === METRIC_QUALITY_SCORE && (
                  <span className={`table-panel__sort-indicator ${sortDirection || ''}`} />
                )}
              </th>
              <th className="table-panel__header-cell table-panel__header-cell--explanation">
                Explanation
                <span className="table-panel__highlight-legend">
                  <span className="table-panel__highlight-legend-prefix">Segment similarity:</span>
                  <span className="table-panel__highlight-legend-item">
                    <span className="table-panel__highlight-legend-swatch" style={{ backgroundColor: 'rgba(102, 204, 170, 1.0)' }} />
                    <span className="table-panel__highlight-legend-label">0.85-1.0</span>
                  </span>
                  <span className="table-panel__highlight-legend-item">
                    <span className="table-panel__highlight-legend-swatch" style={{ backgroundColor: 'rgba(153, 230, 204, 0.7)' }} />
                    <span className="table-panel__highlight-legend-label">0.7-0.85</span>
                  </span>
                </span>
              </th>
              <th className="table-panel__header-cell table-panel__header-cell--activation-example">
                Activation Example
              </th>
            </tr>
          </thead>

          <tbody className="table-panel__tbody">
            {/* Top padding spacer for virtual scrolling */}
            {rowVirtualizer.getVirtualItems().length > 0 && (
              <tr style={{ height: `${rowVirtualizer.getVirtualItems()[0]?.start ?? 0}px` }}>
                <td colSpan={7} />
              </tr>
            )}

            {/* Render only visible virtual items */}
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              // Simplified: 1 row per feature, direct mapping
              const featureIndex = virtualRow.index
              const featureRow = sortedFeatures[featureIndex]

              // Skip if feature doesn't exist
              if (!featureRow) return null

              // Find the explainer with max quality score
              const maxQualityInfo = findMaxQualityScoreExplainer(featureRow, tableData?.global_stats)
              if (!maxQualityInfo) return null

              const explainerId = maxQualityInfo.explainerId
              const explainerData = featureRow.explainers[explainerId]
              if (!explainerData) return null

              // Get all valid explainer IDs (for hover popup showing all explainers)
              const validExplainerIds = explainerIds.filter(explId => {
                const data = featureRow.explainers[explId]
                return data !== undefined && data !== null
              })

              // Get selection state for this feature (current selection)
              const selectionState = featureSelectionStates.get(featureRow.feature_id)
              const selectionSource = featureSelectionSources.get(featureRow.feature_id)

              // Determine category class based on selection state and source
              let categoryClass = ''
              let rowBackgroundColor = ''
              if (selectionState === 'selected') {
                // Confirmed (manual) -> use "well-explained" color, Expanded (auto) -> keep blue
                categoryClass = selectionSource === 'auto' ? 'table-panel__sub-row--expanded' : 'table-panel__sub-row--confirmed'
                // Use dynamic color with opacity 0.3 for manual selection
                if (selectionSource !== 'auto') {
                  rowBackgroundColor = badgeConfig.selected.color
                }
              } else if (selectionState === 'rejected') {
                // Rejected -> use "need revision" color
                categoryClass = 'table-panel__sub-row--rejected'
                rowBackgroundColor = badgeConfig.rejected.color
              }
              // No class for unsure state (default styling)

              const rowClassName = [
                'table-panel__sub-row',
                'table-panel__sub-row--first',
                categoryClass,
                // Add auto-tagged indicator for items tagged via "Tag Automatically"
                selectionSource === 'auto' ? 'table-panel__sub-row--auto-tagged' : ''
              ].filter(Boolean).join(' ')

              return (
              <React.Fragment key={`${featureRow.feature_id}`}>
                {/* Render single row showing max quality score explainer */}
                <tr
                  key={`${featureRow.feature_id}`}
                  ref={(el) => {
                    if (el) {
                      featureRowRefs.current.set(featureRow.feature_id, el)
                    } else {
                      featureRowRefs.current.delete(featureRow.feature_id)
                    }
                  }}
                  className={rowClassName}
                  onClick={(e) => {
                    // Allow clicking anywhere on the row to toggle the feature selection
                    // but don't trigger if clicking interactive elements (badge, explanation, activation example)
                    const target = e.target as HTMLElement
                    if (!target.closest('.table-panel__category-badge, .table-panel__cell--explanation, .table-panel__cell--activation-example')) {
                      toggleFeatureSelection(featureRow.feature_id)
                    }
                  }}
                  style={{
                    cursor: 'pointer',
                    // Use CSS custom properties for dynamic colors
                    ...(rowBackgroundColor && {
                      '--row-color': rowBackgroundColor, // Full opacity for borders
                      '--row-bg-color': `${rowBackgroundColor}4D` // 30% opacity for backgrounds
                    } as React.CSSProperties)
                  }}
                >
                  {/* Index - just row number */}
                  <td className="table-panel__cell table-panel__cell--index">
                    {featureIndex + 1}
                  </td>

                  {/* Category badge: null -> well-explained -> need revision -> null */}
                  <td className="table-panel__cell table-panel__cell--checkbox">
                    {(() => {
                      const state = featureSelectionStates.get(featureRow.feature_id)
                      if (!state) return null

                      const config = state === 'selected' ? badgeConfig.selected : badgeConfig.rejected
                      const { label, color } = config

                      return (
                        <div
                          className="table-panel__category-badge"
                          style={{ backgroundColor: color }}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleFeatureSelection(featureRow.feature_id)
                          }}
                          title={label}
                        >
                          {label}
                        </div>
                      )
                    })()}
                  </td>

                  {/* Feature ID */}
                  <td className="table-panel__cell table-panel__cell--id">
                    {featureRow.feature_id}
                  </td>

                  {/* LLM Explainer column - Badge showing max quality score explainer */}
                  <td className="table-panel__cell table-panel__cell--explainer">
                    <span className="table-panel__explainer-badge">
                      {getExplainerDisplayName(explainerId)}
                    </span>
                  </td>

                  {/* Quality Score column - Size-encoded circle showing max quality score */}
                  <td
                    ref={featureIndex === 0 ? qualityScoreCellRef : undefined}
                    className="table-panel__cell table-panel__cell--score"
                    title={`Quality Score: ${maxQualityInfo.qualityScore.toFixed(3)} (${getExplainerDisplayName(explainerId)})\nComponent range: [${maxQualityInfo.componentRange.min.toFixed(3)}, ${maxQualityInfo.componentRange.max.toFixed(3)}]\nSize = score | Opacity = component variation`}
                    onMouseEnter={(e) => handleQualityScoreHover(featureRow, e.currentTarget)}
                    onMouseLeave={() => handleQualityScoreHover(null)}
                    style={{ cursor: 'pointer', position: 'relative' }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '4px',
                        background: 'transparent'
                      }}
                    >
                      {/* Circle */}
                      <svg
                        width={getCircleRadius(maxQualityInfo.qualityScore) * 2 + 4}
                        height={getCircleRadius(maxQualityInfo.qualityScore) * 2 + 4}
                        style={{
                          display: 'block',
                          marginBottom: '4px',
                          background: 'transparent'
                        }}
                      >
                        <circle
                          cx={getCircleRadius(maxQualityInfo.qualityScore) + 2}
                          cy={getCircleRadius(maxQualityInfo.qualityScore) + 2}
                          r={getCircleRadius(maxQualityInfo.qualityScore)}
                          fill="#1f2937"
                          opacity={(() => {
                            // Calculate opacity based on component range spread
                            const spread = maxQualityInfo.componentRange.max - maxQualityInfo.componentRange.min
                            // Low spread (all components similar) = high opacity (solid)
                            // High spread (components vary) = low opacity (transparent)
                            // Map spread [0, 1] to opacity [1.0, 0.3]
                            return 1.0 - (spread)
                          })()}
                          stroke="none"
                        />
                      </svg>

                      {/* Number below circle */}
                      <div
                        style={{
                          fontSize: '11px',
                          fontFamily: 'monospace',
                          color: qualityPopover && qualityPopover.featureId === featureRow.feature_id ? '#3b82f6' : '#6b7280',
                          fontWeight: qualityPopover && qualityPopover.featureId === featureRow.feature_id ? 600 : 400,
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {maxQualityInfo.qualityScore.toFixed(3)}
                      </div>
                    </div>
                  </td>

                  {/* Explanation text */}
                  <td
                    className="table-panel__cell table-panel__cell--explanation"
                    title={!explainerData.highlighted_explanation ? (explainerData.explanation_text ?? undefined) : undefined}
                    style={{ position: 'relative', overflow: 'visible' }}
                    onMouseEnter={(e) => {
                      const position = detectExplanationPopoverPosition(e.currentTarget)
                      setShowExplanationPopover({
                        featureId: featureRow.feature_id,
                        validExplainerIds,
                        featureRow,
                        position
                      })
                    }}
                    onMouseLeave={() => setShowExplanationPopover(null)}
                  >
                    <div className="table-panel__explanation-text-wrapper">
                      {explainerData.highlighted_explanation ? (
                        <HighlightedExplanation
                          segments={explainerData.highlighted_explanation.segments}
                          explainerNames={['Llama', 'Qwen', 'OpenAI']}
                          truncated={false}
                        />
                      ) : (
                        explainerData.explanation_text ?? '-'
                      )}
                    </div>

                    {/* Inline explanation popover (like activation example) */}
                    {showExplanationPopover && showExplanationPopover.featureId === featureRow.feature_id && (
                      <div className={`table-panel__explanation-popover table-panel__explanation-popover--${showExplanationPopover.position ?? 'below'}`}>
                        <div className="table-panel__explanation-popover-content">
                          {showExplanationPopover.validExplainerIds.map((explId: string) => {
                            const explData = showExplanationPopover.featureRow.explainers[explId]
                            if (!explData) return null

                            const explanation = explData.highlighted_explanation
                            const plainText = explData.explanation_text ?? '-'

                            return (
                              <div key={explId} className="table-panel__popover-explanation">
                                <div className="table-panel__popover-explainer-name">
                                  {getExplainerDisplayName(explId)}:
                                </div>
                                <div className="table-panel__popover-text">
                                  {explanation ? (
                                    <HighlightedExplanation
                                      segments={explanation.segments}
                                      explainerNames={['Llama', 'Qwen', 'OpenAI']}
                                      truncated={false}
                                    />
                                  ) : (
                                    plainText
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </td>

                  {/* Activation Example column */}
                  <td className="table-panel__cell table-panel__cell--activation-example" style={{ position: 'relative', overflow: 'visible' }}>
                    {activationExamples[featureRow.feature_id] ? (
                      <ActivationExample
                        examples={activationExamples[featureRow.feature_id]}
                        containerWidth={activationColumnWidth}
                      />
                    ) : (
                      <span className="table-panel__placeholder">—</span>
                    )}
                  </td>
                </tr>
              </React.Fragment>
            )})}

            {/* Bottom padding spacer for virtual scrolling */}
            {rowVirtualizer.getVirtualItems().length > 0 && (
              <tr style={{
                height: `${
                  rowVirtualizer.getTotalSize() -
                  (rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1]?.end ?? 0)
                }px`
              }}>
                <td colSpan={7} />
              </tr>
            )}
          </tbody>
        </table>
      </div>


      {/* Portal-based quality score breakdown popover */}
      {qualityPopover && tableData && ReactDOM.createPortal(
        <div
          className="table-panel__floating-popover table-panel__floating-popover--quality"
          style={{
            position: 'fixed',
            top: qualityPopover.position === 'below'
              ? `${qualityPopover.rect.bottom + 8}px`
              : 'auto',
            bottom: qualityPopover.position === 'above'
              ? `${window.innerHeight - qualityPopover.rect.top + 8}px`
              : 'auto',
            left: `${qualityPopover.rect.left}px`,
            width: `${qualityPopover.width}px`,
            zIndex: 9999
          }}
          onMouseEnter={() => {/* Keep popover open */}}
          onMouseLeave={() => setQualityPopover(null)}
        >
          <QualityScoreBreakdown
            feature={qualityPopover.feature}
            globalStats={tableData.global_stats}
            width={qualityPopover.width}
          />
        </div>,
        document.body
      )}

      {/* Similarity tagging popover (automatic tagging) */}
      <SimilarityTaggingPopover />

    </div>
  )
}

export default TablePanel
