/**
 * Custom hook for debounced API calls
 * Prevents excessive requests during rapid state changes
 */

import { useRef, useCallback, useState } from 'react'

interface UseDebouncedApiCallOptions {
  delay?: number
  onSuccess?: (data: any) => void
  onError?: (error: Error) => void
}

interface UseDebouncedApiCallReturn<T> {
  execute: (...args: any[]) => void
  data: T | null
  loading: boolean
  error: Error | null
  cancel: () => void
}

export function useDebouncedApiCall<T>(
  apiFunc: (...args: any[]) => Promise<T>,
  options: UseDebouncedApiCallOptions = {}
): UseDebouncedApiCallReturn<T> {
  const { delay = 300, onSuccess, onError } = options
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setLoading(false)
  }, [])

  const execute = useCallback((...args: any[]) => {
    // Clear any pending timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    // Abort any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // Set loading immediately for UI feedback
    setLoading(true)
    setError(null)

    // Create new abort controller
    abortControllerRef.current = new AbortController()

    // Debounce the actual API call
    timeoutRef.current = setTimeout(async () => {
      try {
        const result = await apiFunc(...args)

        // Check if request was aborted
        if (!abortControllerRef.current?.signal.aborted) {
          setData(result)
          setLoading(false)
          setError(null)
          if (onSuccess) {
            onSuccess(result)
          }
        }
      } catch (err) {
        // Ignore aborted requests
        if (err instanceof Error && err.name === 'AbortError') {
          return
        }

        const error = err instanceof Error ? err : new Error('Unknown error')
        setError(error)
        setLoading(false)
        if (onError) {
          onError(error)
        }
      }
    }, delay)
  }, [apiFunc, delay, onSuccess, onError])

  return {
    execute,
    data,
    loading,
    error,
    cancel
  }
}