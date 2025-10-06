import React, { useEffect, useRef, useState } from 'react'
import { useVisualizationStore } from '../store'
import { formatThresholdRange, formatMetricName } from '../lib/selection-utils'
import '../styles/ThresholdGroupPanel.css'

// ==================== COMPONENT-SPECIFIC TYPES ====================
interface ThresholdGroupPanelProps {
  className?: string
}

// ==================== MAIN COMPONENT ====================
export const ThresholdGroupPanel: React.FC<ThresholdGroupPanelProps> = ({ className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 400, height: 800 })
  const [groupName, setGroupName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Store state
  const selectionMode = useVisualizationStore(state => state.selectionMode)
  const selections = useVisualizationStore(state => state.selections)
  const thresholdGroups = useVisualizationStore(state => state.thresholdGroups)
  const pendingGroup = useVisualizationStore(state => state.pendingGroup)
  const isCreatingGroup = useVisualizationStore(state => state.isCreatingGroup)
  const showGroupNameInput = useVisualizationStore(state => state.showGroupNameInput)

  const setSelectionMode = useVisualizationStore(state => state.setSelectionMode)
  const removeSelection = useVisualizationStore(state => state.removeSelection)
  const clearAllSelections = useVisualizationStore(state => state.clearAllSelections)
  const startGroupCreation = useVisualizationStore(state => state.startGroupCreation)
  const finishGroupCreation = useVisualizationStore(state => state.finishGroupCreation)
  const cancelGroupCreation = useVisualizationStore(state => state.cancelGroupCreation)
  const toggleGroupVisibility = useVisualizationStore(state => state.toggleGroupVisibility)
  const deleteGroup = useVisualizationStore(state => state.deleteGroup)
  const setShowGroupNameInput = useVisualizationStore(state => state.setShowGroupNameInput)

  // Placeholder states - ready for future data integration
  const loading = false
  const error = null

  // Update container size on resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setContainerSize({ width: rect.width, height: rect.height })
      }
    }

    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  // Focus input when shown and set default name
  useEffect(() => {
    if (showGroupNameInput && inputRef.current) {
      // Generate default name based on existing groups
      const defaultName = `group ${thresholdGroups.length + 1}`
      setGroupName(defaultName)
      inputRef.current.focus()
      // Select all text for easy replacement
      inputRef.current.select()
    }
  }, [showGroupNameInput, thresholdGroups.length])

  // Handle button click
  const handleButtonClick = () => {
    if (isCreatingGroup && pendingGroup.length > 0) {
      // Show name input when check button is clicked with selections
      setShowGroupNameInput(true)
    } else if (!isCreatingGroup) {
      // Start group creation
      startGroupCreation()
    }
  }

  // Handle name submission
  const handleNameSubmit = () => {
    if (groupName.trim()) {
      finishGroupCreation(groupName)
      setGroupName('')
    }
  }

  // Handle escape key to cancel
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameSubmit()
    } else if (e.key === 'Escape') {
      cancelGroupCreation()
      setGroupName('')
    }
  }

  // Render loading state
  if (loading) {
    return (
      <div className={`threshold-group-panel ${className}`} ref={containerRef}>
        <div className="threshold-group-panel__loading">
          <div className="threshold-group-panel__spinner" />
          <span>Loading threshold groups...</span>
        </div>
      </div>
    )
  }

  // Render error state
  if (error) {
    return (
      <div className={`threshold-group-panel ${className}`} ref={containerRef}>
        <div className="threshold-group-panel__error">
          <div className="threshold-group-panel__error-icon">⚠️</div>
          <div className="threshold-group-panel__error-message">{error}</div>
        </div>
      </div>
    )
  }

  // Main render
  return (
    <div className={`threshold-group-panel ${className}`} ref={containerRef}>
      {/* Name input modal */}
      {showGroupNameInput && (
        <div className="threshold-group-panel__name-input-overlay">
          <div className="threshold-group-panel__name-input-container">
            <h3>Name this threshold group</h3>
            <input
              ref={inputRef}
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter group name..."
              className="threshold-group-panel__name-input"
            />
            <div className="threshold-group-panel__name-input-buttons">
              <button onClick={handleNameSubmit} disabled={!groupName.trim()}>
                OK
              </button>
              <button onClick={() => {
                cancelGroupCreation()
                setGroupName('')
              }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="threshold-group-panel__container">
        {/* Display threshold groups */}
        {thresholdGroups.length > 0 && (
          <div className="threshold-group-panel__groups">
            {thresholdGroups.map(group => (
              <div key={group.id} className="threshold-group-panel__group">
                <div
                  className={`threshold-group-panel__group-header ${
                    group.visible ? 'threshold-group-panel__group-header--visible' : ''
                  }`}
                  onClick={() => toggleGroupVisibility(group.id)}
                >
                  <div className={`threshold-group-panel__group-indicator ${
                    group.visible ? 'threshold-group-panel__group-indicator--visible' : ''
                  }`} />
                  <span className="threshold-group-panel__group-name">{group.name}</span>
                  <span className="threshold-group-panel__group-count">
                    ({group.selections.length})
                  </span>
                  <button
                    className="threshold-group-panel__group-delete"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteGroup(group.id)
                    }}
                    title="Delete group"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Don't show pending selections during creation - they're visible on histogram */}

        {/* Empty state */}
        {thresholdGroups.length === 0 && !isCreatingGroup && (
          <div className="threshold-group-panel__empty">
            <div className="threshold-group-panel__empty-icon">🎯</div>
            <div className="threshold-group-panel__empty-message">
              No threshold groups
            </div>
            <div className="threshold-group-panel__empty-submessage">
              Click + to create a group
            </div>
          </div>
        )}

        {/* Selection instructions when creating */}
        {isCreatingGroup && pendingGroup.length === 0 && (
          <div className="threshold-group-panel__empty">
            <div className="threshold-group-panel__empty-icon">✋</div>
            <div className="threshold-group-panel__empty-message">
              Drag on histogram to select
            </div>
            <div className="threshold-group-panel__empty-submessage">
              Selection mode active
            </div>
          </div>
        )}

        {/* Add button positioned at bottom of groups */}
        <button
          className={`threshold-group-panel__add-button ${
            isCreatingGroup ? 'threshold-group-panel__add-button--check' : ''
          } ${isCreatingGroup && pendingGroup.length > 0 ? 'threshold-group-panel__add-button--ready' : ''}`}
          onClick={handleButtonClick}
          title={
            isCreatingGroup
              ? pendingGroup.length > 0
                ? 'Finish selection'
                : 'Select thresholds by dragging on histogram'
              : 'Create new threshold group'
          }
        >
          {isCreatingGroup ? (
            // Check mark icon
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
            </svg>
          ) : (
            // Plus icon
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}

export default ThresholdGroupPanel
