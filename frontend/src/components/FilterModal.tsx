import React, { useEffect, useRef } from 'react'
import { useVisualizationStore } from '../stores/visualizationStore'
import FilterPanel from './FilterPanel'

interface FilterModalProps {
  isOpen: boolean
  onConfirm: () => void
  onCancel: () => void
}

export const FilterModal: React.FC<FilterModalProps> = ({
  isOpen,
  onConfirm,
  onCancel
}) => {
  const modalRef = useRef<HTMLDivElement>(null)
  const filters = useVisualizationStore(state => state.filters)

  // Check if filters have been selected
  const hasActiveFilters = Object.values(filters).some(
    filterArray => filterArray && filterArray.length > 0
  )

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel()
    }
  }

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onCancel])

  // Focus management
  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus()
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      className="filter-modal__backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="filter-modal-title"
    >
      <div
        ref={modalRef}
        className="filter-modal"
        tabIndex={-1}
      >
        <div className="filter-modal__header">
          <h2 id="filter-modal-title" className="filter-modal__title">
            Configure Data Filters
          </h2>
          <button
            className="filter-modal__close"
            onClick={onCancel}
            aria-label="Close modal"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <div className="filter-modal__content">
          <FilterPanel
            title="Select your data filters"
            showResetButton={true}
          />
        </div>

        <div className="filter-modal__footer">
          <button
            className="filter-modal__button filter-modal__button--cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="filter-modal__button filter-modal__button--confirm"
            onClick={onConfirm}
            disabled={!hasActiveFilters}
          >
            Create Visualization
          </button>
        </div>
      </div>
    </div>
  )
}

export default FilterModal