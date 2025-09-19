/**
 * Custom hook for API calls with loading, error handling, and caching
 */

import { useState, useCallback, useRef, useEffect } from 'react'

interface UseApiCallOptions<T> {
  cache?: boolean
  cacheTime?: number // milliseconds
  retryCount?: number
  retryDelay?: number // milliseconds
  onSuccess?: (data: T) => void
  onError?: (error: Error) => void
}

interface UseApiCallReturn<T, P extends any[]> {
  data: T | null
  loading: boolean
  error: Error | null
  execute: (...params: P) => Promise<T | null>
  reset: () => void
}

export function useApiCall<T, P extends any[]>(
  apiFunc: (...params: P) => Promise<T>,
  options: UseApiCallOptions<T> = {}
): UseApiCallReturn<T, P> {
  const {
    cache = false,
    cacheTime = 5 * 60 * 1000, // 5 minutes default
    retryCount = 0,
    retryDelay = 1000,
    onSuccess,
    onError
  } = options

  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const cacheRef = useRef<{ data: T; timestamp: number } | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const execute = useCallback(async (...params: P): Promise<T | null> => {
    // Check cache
    if (cache && cacheRef.current) {
      const now = Date.now()
      if (now - cacheRef.current.timestamp < cacheTime) {
        setData(cacheRef.current.data)
        return cacheRef.current.data
      }
    }

    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    abortControllerRef.current = new AbortController()

    setLoading(true)
    setError(null)

    let attempts = 0
    let lastError: Error | null = null

    while (attempts <= retryCount) {
      try {
        const result = await apiFunc(...params)

        // Cache the result
        if (cache) {
          cacheRef.current = {
            data: result,
            timestamp: Date.now()
          }
        }

        setData(result)
        setLoading(false)
        onSuccess?.(result)
        return result
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Unknown error')

        if (attempts < retryCount) {
          await new Promise(resolve => setTimeout(resolve, retryDelay))
          attempts++
        } else {
          break
        }
      }
    }

    // All retries failed
    if (lastError) {
      setError(lastError)
      setLoading(false)
      onError?.(lastError)
    }

    return null
  }, [apiFunc, cache, cacheTime, retryCount, retryDelay, onSuccess, onError])

  const reset = useCallback(() => {
    setData(null)
    setError(null)
    setLoading(false)
    cacheRef.current = null

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  return { data, loading, error, execute, reset }
}

/**
 * Hook for debounced API calls
 */
export function useDebouncedApiCall<T, P extends any[]>(
  apiFunc: (...params: P) => Promise<T>,
  delay: number = 300,
  options: UseApiCallOptions<T> = {}
): UseApiCallReturn<T, P> {
  const timeoutRef = useRef<NodeJS.Timeout>()
  const apiCall = useApiCall(apiFunc, options)

  const debouncedExecute = useCallback((...params: P): Promise<T | null> => {
    return new Promise((resolve) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      timeoutRef.current = setTimeout(async () => {
        const result = await apiCall.execute(...params)
        resolve(result)
      }, delay)
    })
  }, [apiCall, delay])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return {
    ...apiCall,
    execute: debouncedExecute
  }
}