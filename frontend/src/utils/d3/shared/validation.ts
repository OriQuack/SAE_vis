// Shared validation utilities for d3 modules

import { MIN_DIMENSIONS } from './constants'

/**
 * Validates container dimensions for visualizations
 * @param width - Container width in pixels
 * @param height - Container height in pixels
 * @returns Array of validation error messages (empty if valid)
 */
export function validateDimensions(width: number, height: number): string[] {
  const errors: string[] = []

  if (width <= 0) {
    errors.push('Width must be positive')
  }

  if (height <= 0) {
    errors.push('Height must be positive')
  }

  if (width < MIN_DIMENSIONS.width) {
    errors.push(`Width should be at least ${MIN_DIMENSIONS.width}px for proper visualization`)
  }

  if (height < MIN_DIMENSIONS.height) {
    errors.push(`Height should be at least ${MIN_DIMENSIONS.height}px for proper visualization`)
  }

  return errors
}

/**
 * Validates that a value is a valid number within bounds
 * @param value - Value to validate
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @param fieldName - Name of the field for error messages
 * @returns Array of validation error messages (empty if valid)
 */
export function validateNumericRange(
  value: number,
  min: number,
  max: number,
  fieldName: string
): string[] {
  const errors: string[] = []

  if (typeof value !== 'number' || isNaN(value)) {
    errors.push(`${fieldName} must be a valid number`)
    return errors
  }

  if (value < min || value > max) {
    errors.push(`${fieldName} must be between ${min} and ${max}`)
  }

  return errors
}