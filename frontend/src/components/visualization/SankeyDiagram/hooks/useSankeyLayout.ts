import { useMemo } from 'react'
import { calculateSankeyLayout, validateSankeyData, validateDimensions } from '../../../../utils/d3-helpers'
import type { SankeyData } from '../../../../services/types'

interface UseSankeyLayoutProps {
  data: SankeyData | null
  containerSize: { width: number; height: number }
}

interface UseSankeyLayoutReturn {
  layout: any | null
  validationErrors: string[]
  isValid: boolean
}

export const useSankeyLayout = ({
  data,
  containerSize
}: UseSankeyLayoutProps): UseSankeyLayoutReturn => {
  // Validation
  const validationErrors = useMemo(() => {
    const errors: string[] = []

    if (data) {
      errors.push(...validateSankeyData(data))
    }

    errors.push(...validateDimensions(containerSize.width, containerSize.height))

    return errors
  }, [data, containerSize])

  // Calculate layout
  const layout = useMemo(() => {
    if (!data || validationErrors.length > 0) return null
    return calculateSankeyLayout(data, containerSize.width, containerSize.height)
  }, [data, containerSize, validationErrors])

  const isValid = useMemo(() => {
    return validationErrors.length === 0 && layout !== null
  }, [validationErrors, layout])

  return {
    layout,
    validationErrors,
    isValid
  }
}