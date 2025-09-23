// ============================================================================
// DEBOUNCING UTILITIES
// ============================================================================

/**
 * Generic debounced function manager
 */
export class DebounceManager {
  private timeouts: Map<string, any> = new Map()

  /**
   * Execute a function with debouncing
   * @param key - Unique key for this debounced operation
   * @param fn - Function to execute
   * @param delay - Delay in milliseconds
   */
  debounce(key: string, fn: () => void, delay: number): void {
    // Clear existing timeout for this key
    const existingTimeout = this.timeouts.get(key)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }

    // Set new timeout
    const timeout = setTimeout(() => {
      fn()
      this.timeouts.delete(key)
    }, delay)

    this.timeouts.set(key, timeout)
  }

  /**
   * Cancel a debounced operation
   * @param key - Unique key for the operation to cancel
   */
  cancel(key: string): void {
    const timeout = this.timeouts.get(key)
    if (timeout) {
      clearTimeout(timeout)
      this.timeouts.delete(key)
    }
  }

  /**
   * Cancel all debounced operations
   */
  cancelAll(): void {
    this.timeouts.forEach(timeout => clearTimeout(timeout))
    this.timeouts.clear()
  }

  /**
   * Check if an operation is currently debounced
   * @param key - Unique key for the operation
   */
  isPending(key: string): boolean {
    return this.timeouts.has(key)
  }
}

/**
 * Default debounce manager instance
 */
export const defaultDebounceManager = new DebounceManager()

/**
 * Simple debounce function for one-off usage
 */
export function debounce<T extends (..._args: any[]) => any>(
  func: T,
  delay: number
): (..._args: Parameters<T>) => void {
  let timeoutId: any

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => func.apply(null, args), delay)
  }
}