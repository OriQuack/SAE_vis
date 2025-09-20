import { useRef, useEffect, useCallback } from 'react'

// ============================================================================
// TYPES
// ============================================================================

interface UseClickOutsideOptions {
  enabled?: boolean
  ignoreEscape?: boolean
}

interface UseClickOutsideReturn {
  ref: React.RefObject<HTMLElement>
}

// ============================================================================
// CLICK OUTSIDE HOOK
// ============================================================================

export const useClickOutside = (
  onClickOutside: () => void,
  options: UseClickOutsideOptions = {}
): UseClickOutsideReturn => {
  const { enabled = true, ignoreEscape = false } = options
  const ref = useRef<HTMLElement>(null)

  const handleClick = useCallback((event: MouseEvent) => {
    if (!enabled) return

    if (ref.current && !ref.current.contains(event.target as Node)) {
      onClickOutside()
    }
  }, [enabled, onClickOutside])

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled || ignoreEscape) return

    if (event.key === 'Escape') {
      onClickOutside()
    }
  }, [enabled, ignoreEscape, onClickOutside])

  useEffect(() => {
    if (!enabled) return

    document.addEventListener('mousedown', handleClick)
    if (!ignoreEscape) {
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('mousedown', handleClick)
      if (!ignoreEscape) {
        document.removeEventListener('keydown', handleKeyDown)
      }
    }
  }, [enabled, handleClick, handleKeyDown, ignoreEscape])

  return { ref }
}

export default useClickOutside