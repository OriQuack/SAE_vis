/**
 * Interactive threshold slider component
 */

import React, { useCallback, useRef, useEffect } from 'react'
import { clampThreshold, formatThreshold } from '../../utils/threshold-helpers'

interface ThresholdSliderProps {
  value: number
  min: number
  max: number
  width: number
  height: number
  onChange: (value: number) => void
  onChangeComplete?: (value: number) => void
  color?: string
  label?: string
  disabled?: boolean
}

export const ThresholdSlider: React.FC<ThresholdSliderProps> = React.memo(({
  value,
  min,
  max,
  width,
  height,
  onChange,
  onChangeComplete,
  color = '#3b82f6',
  label,
  disabled = false
}) => {
  const isDraggingRef = useRef(false)
  const svgRef = useRef<SVGSVGElement>(null)

  // Calculate slider position
  const sliderX = ((value - min) / (max - min)) * width

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled) return

    e.preventDefault()
    e.stopPropagation()
    isDraggingRef.current = true

    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return

    const updateValue = (clientX: number) => {
      const x = clientX - rect.left
      const newValue = min + (x / width) * (max - min)
      const clampedValue = clampThreshold(newValue, min, max)
      onChange(clampedValue)
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current) {
        updateValue(e.clientX)
      }
    }

    const handleMouseUp = (e: MouseEvent) => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false
        const x = e.clientX - rect.left
        const newValue = min + (x / width) * (max - min)
        const clampedValue = clampThreshold(newValue, min, max)
        onChangeComplete?.(clampedValue)
      }
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    // Initial update
    updateValue(e.clientX)
  }, [disabled, min, max, width, onChange, onChangeComplete])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isDraggingRef.current = false
    }
  }, [])

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="threshold-slider"
      style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
      onMouseDown={handleMouseDown}
    >
      {/* Track */}
      <rect
        x={0}
        y={height / 2 - 2}
        width={width}
        height={4}
        rx={2}
        fill={disabled ? '#e5e7eb' : '#d1d5db'}
      />

      {/* Active track */}
      <rect
        x={0}
        y={height / 2 - 2}
        width={sliderX}
        height={4}
        rx={2}
        fill={disabled ? '#9ca3af' : color}
      />

      {/* Slider handle */}
      <g transform={`translate(${sliderX}, ${height / 2})`}>
        <circle
          r={8}
          fill={disabled ? '#9ca3af' : color}
          stroke="white"
          strokeWidth={2}
          className="slider-handle"
          style={{
            filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1))',
            cursor: disabled ? 'not-allowed' : 'grab'
          }}
        />
      </g>

      {/* Value label */}
      {label && (
        <text
          x={sliderX}
          y={height - 5}
          fontSize={11}
          fill={disabled ? '#9ca3af' : '#4b5563'}
          textAnchor="middle"
        >
          {label}: {formatThreshold(value)}
        </text>
      )}
    </svg>
  )
})

ThresholdSlider.displayName = 'ThresholdSlider'