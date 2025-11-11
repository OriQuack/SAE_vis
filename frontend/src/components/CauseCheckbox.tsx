import React from 'react'

// ============================================================================
// CAUSE CHECKBOX COMPONENT
// ============================================================================
// Four-state cycle checkbox for cause categories
// States: null → noisy-activation → missed-lexicon → missed-context → unsure → null

export type CauseCategoryState = 'noisy-activation' | 'missed-lexicon' | 'missed-context' | 'unsure'

interface CauseCheckboxProps {
  state: CauseCategoryState | null
  onClick: (e: React.MouseEvent) => void
  className?: string
}

// Category configuration
const CATEGORY_CONFIG: Record<CauseCategoryState, {
  icon: string
  color: string
  label: string
}> = {
  'noisy-activation': {
    icon: '⚠',
    color: '#f97316',  // Orange
    label: 'Noisy Activation Example'
  },
  'missed-lexicon': {
    icon: '📖',
    color: '#a855f7',  // Purple
    label: 'Missed Lexicon'
  },
  'missed-context': {
    icon: '🔍',
    color: '#3b82f6',  // Blue
    label: 'Missed Context'
  },
  'unsure': {
    icon: '?',
    color: '#9ca3af',  // Gray
    label: 'Unsure'
  }
}

const CauseCheckbox: React.FC<CauseCheckboxProps> = ({
  state,
  onClick,
  className = ''
}) => {
  return (
    <div
      className={`table-panel__checkbox-custom cause-checkbox ${className}`}
      onClick={onClick}
      title={state ? CATEGORY_CONFIG[state].label : 'Click to cycle through cause categories'}
    >
      {state ? (
        <span
          className={`cause-checkbox__icon cause-checkbox__icon--${state}`}
          style={{ color: CATEGORY_CONFIG[state].color }}
        >
          {CATEGORY_CONFIG[state].icon}
        </span>
      ) : null}
    </div>
  )
}

export default CauseCheckbox
