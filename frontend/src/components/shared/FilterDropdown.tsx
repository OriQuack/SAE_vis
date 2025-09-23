import React, { useState, useCallback } from 'react'

// ============================================================================
// TYPES
// ============================================================================

interface FilterDropdownProps {
  label: string
  options: string[]
  selectedValues: string[]
  onChange: (_values: string[]) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

// ============================================================================
// FILTER DROPDOWN COMPONENT
// ============================================================================

export const FilterDropdown: React.FC<FilterDropdownProps> = ({
  label,
  options,
  selectedValues,
  onChange,
  placeholder = 'Select options...',
  disabled = false,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false)

  const handleToggleOption = useCallback((option: string) => {
    if (selectedValues.includes(option)) {
      onChange(selectedValues.filter(value => value !== option))
    } else {
      onChange([...selectedValues, option])
    }
  }, [selectedValues, onChange])

  const handleSelectAll = useCallback(() => {
    if (selectedValues.length === options.length) {
      onChange([])
    } else {
      onChange(options)
    }
  }, [selectedValues.length, options, onChange])

  const getDisplayText = useCallback(() => {
    if (selectedValues.length === 0) {
      return placeholder
    } else if (selectedValues.length === 1) {
      return selectedValues[0]
    } else if (selectedValues.length === options.length) {
      return 'All selected'
    } else {
      return `${selectedValues.length} selected`
    }
  }, [selectedValues, options.length, placeholder])

  return (
    <div className={`filter-dropdown ${className}`}>
      <label className="filter-dropdown__label">{label}</label>
      <div className="filter-dropdown__container">
        <button
          className={`filter-dropdown__button ${isOpen ? 'filter-dropdown__button--open' : ''}`}
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
          type="button"
        >
          <span className="filter-dropdown__text">{getDisplayText()}</span>
          <span className="filter-dropdown__arrow">▼</span>
        </button>

        {isOpen && (
          <div className="filter-dropdown__menu">
            <button
              className="filter-dropdown__option filter-dropdown__option--select-all"
              onClick={handleSelectAll}
              type="button"
            >
              {selectedValues.length === options.length ? 'Deselect All' : 'Select All'}
            </button>

            <div className="filter-dropdown__divider" />

            {options.map(option => (
              <button
                key={option}
                className={`filter-dropdown__option ${
                  selectedValues.includes(option) ? 'filter-dropdown__option--selected' : ''
                }`}
                onClick={() => handleToggleOption(option)}
                type="button"
              >
                <span className="filter-dropdown__checkbox">
                  {selectedValues.includes(option) ? '✓' : '○'}
                </span>
                <span className="filter-dropdown__option-text">{option}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

