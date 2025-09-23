export class DebounceManager {
  private timers: Map<string, number> = new Map()

  debounce<T extends (..._args: any[]) => Promise<any>>(
    key: string,
    fn: T,
    delay: number
  ): T {
    return ((..._args: any[]) => {
      return new Promise((resolve, reject) => {
        // Clear existing timer
        const existingTimer = this.timers.get(key)
        if (existingTimer) {
          clearTimeout(existingTimer)
        }

        // Set new timer
        const timer = setTimeout(async () => {
          try {
            const result = await fn(..._args)
            resolve(result)
          } catch (error) {
            reject(error)
          } finally {
            this.timers.delete(key)
          }
        }, delay)

        this.timers.set(key, timer)
      })
    }) as T
  }

  clear(key?: string) {
    if (key) {
      const timer = this.timers.get(key)
      if (timer) {
        clearTimeout(timer)
        this.timers.delete(key)
      }
    } else {
      this.timers.forEach(timer => clearTimeout(timer))
      this.timers.clear()
    }
  }
}

// Global debounce manager instance
export const debounceManager = new DebounceManager()