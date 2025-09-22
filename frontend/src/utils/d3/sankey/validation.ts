// Sankey validation utilities

import type { SankeyData } from '../shared'

/**
 * Validates sankey data structure and content
 * @param data - Sankey data from API
 * @returns Array of validation error messages (empty if valid)
 */
export function validateSankeyData(data: SankeyData): string[] {
  const errors: string[] = []

  if (!data) {
    errors.push('No data provided')
    return errors
  }

  // Validate nodes
  if (!data.nodes || data.nodes.length === 0) {
    errors.push('No nodes provided')
  } else {
    data.nodes.forEach((node, index) => {
      if (!node) {
        errors.push(`Node ${index}: is null or undefined`)
        return
      }

      if (!node.id) {
        errors.push(`Node ${index}: missing required 'id' property`)
      }

      if (!node.name) {
        errors.push(`Node ${index}: missing required 'name' property`)
      }

      if (typeof node.feature_count !== 'number') {
        errors.push(`Node ${index}: 'feature_count' must be a number`)
      } else if (node.feature_count < 0) {
        errors.push(`Node ${index}: 'feature_count' must be non-negative`)
      }

      if (typeof node.stage !== 'number') {
        errors.push(`Node ${index}: 'stage' must be a number`)
      } else if (node.stage < 0) {
        errors.push(`Node ${index}: 'stage' must be non-negative`)
      }

      if (!node.category) {
        errors.push(`Node ${index}: missing required 'category' property`)
      }
    })
  }

  // Validate links
  if (!data.links || data.links.length === 0) {
    errors.push('No links provided')
  } else {
    data.links.forEach((link, index) => {
      if (!link) {
        errors.push(`Link ${index}: is null or undefined`)
        return
      }

      if (!link.source) {
        errors.push(`Link ${index}: missing required 'source' property`)
      }

      if (!link.target) {
        errors.push(`Link ${index}: missing required 'target' property`)
      }

      if (typeof link.value !== 'number') {
        errors.push(`Link ${index}: 'value' must be a number`)
      } else if (link.value <= 0) {
        errors.push(`Link ${index}: 'value' must be positive`)
      }
    })
  }

  // Validate node IDs are unique
  if (data.nodes && data.nodes.length > 0) {
    const nodeIds = data.nodes
      .filter(node => node != null)
      .map(node => node.id)
      .filter(id => id != null)

    const uniqueNodeIds = new Set(nodeIds)
    if (nodeIds.length !== uniqueNodeIds.size) {
      errors.push('Duplicate node IDs found')
    }

    // Validate link references
    const nodeIdSet = new Set(nodeIds)
    if (data.links) {
      data.links.forEach((link, index) => {
        if (link && link.source && !nodeIdSet.has(link.source)) {
          errors.push(`Link ${index}: source node '${link.source}' not found`)
        }
        if (link && link.target && !nodeIdSet.has(link.target)) {
          errors.push(`Link ${index}: target node '${link.target}' not found`)
        }
      })
    }
  }

  return errors
}