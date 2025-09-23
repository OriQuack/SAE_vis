import { ApiClientError } from '../../../services/api'
import { ERROR_MESSAGES } from '../constants'

/**
 * Convert unknown error to user-friendly error message
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    switch (error.code) {
      case 'INVALID_FILTERS':
        return ERROR_MESSAGES.INVALID_FILTERS
      case 'INSUFFICIENT_DATA':
        return ERROR_MESSAGES.INSUFFICIENT_DATA
      case 'NETWORK_ERROR':
        return ERROR_MESSAGES.NETWORK_ERROR
      case 'INTERNAL_ERROR':
        return ERROR_MESSAGES.INTERNAL_ERROR
      default:
        return error.message
    }
  }
  return ERROR_MESSAGES.UNEXPECTED_ERROR
}