import React from 'react'
import { useVisualizationStore } from '../store'
import { getSavedGroupColor } from '../lib/utils'
import '../styles/SavedGroupsPanel.css'

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_SAVED_GROUPS = 8 // Maximum number of saved groups (4 cols x 2 rows)
const PLACEHOLDER_COLOR = '#d1d5db' // Gray color for empty slots

// ============================================================================
// SAVED GROUPS PANEL COMPONENT
// ============================================================================

/**
 * SavedGroupsPanel Component
 *
 * Displays 8 circular slots in a 4x2 grid for saved cell group selections.
 * Empty slots are shown in gray, filled slots show colored circles.
 * Users can click badges to restore selections or delete them.
 *
 * Features:
 * - Fixed 4x2 grid layout (8 circles total)
 * - Gray placeholder circles for empty slots
 * - Colored circles for saved groups
 * - Click to restore saved selection
 * - Delete button (× icon) on hover
 */
const SavedGroupsPanel: React.FC = () => {
  // Saved cell group selections from store
  const savedCellGroupSelections = useVisualizationStore(state => state.savedCellGroupSelections)
  const activeSavedGroupId = useVisualizationStore(state => state.activeSavedGroupId)
  const restoreSavedCellGroups = useVisualizationStore(state => state.restoreSavedCellGroups)
  const deleteSavedCellGroups = useVisualizationStore(state => state.deleteSavedCellGroups)

  // Create array of 8 slots
  const slots = Array.from({ length: MAX_SAVED_GROUPS }, (_, index) => {
    const savedGroup = savedCellGroupSelections[index]
    return savedGroup || null
  })

  return (
    <div className="saved-groups-panel">
      <div className="saved-groups-panel__header">
        <span className="saved-groups-panel__title">Saved Groups</span>
      </div>
      <div className="saved-groups-panel__grid">
        {slots.map((savedGroup, index) => {
          const isActive = savedGroup && savedGroup.id === activeSavedGroupId
          const hasActiveGroup = activeSavedGroupId !== null
          const shouldDim = savedGroup && hasActiveGroup && !isActive

          return (
            <div
              key={savedGroup?.id || `empty-${index}`}
              className="saved-groups-panel__slot"
            >
              <div
                className={`saved-groups-panel__badge ${savedGroup ? 'active' : 'empty'} ${isActive ? 'selected' : ''}`}
                style={{
                  backgroundColor: savedGroup ? getSavedGroupColor(savedGroup.colorIndex) : PLACEHOLDER_COLOR,
                  opacity: shouldDim ? 0.4 : 1
                }}
                onClick={() => savedGroup && restoreSavedCellGroups(savedGroup.id)}
                title={savedGroup?.name}
              >
              {savedGroup && (
                <button
                  className="saved-groups-panel__badge-delete"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteSavedCellGroups(savedGroup.id)
                  }}
                  aria-label={`Delete ${savedGroup.name}`}
                >
                  ×
                </button>
              )}

              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default SavedGroupsPanel
