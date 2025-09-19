/**
 * Visualization-specific type definitions
 */

import { MetricType } from './common'

export interface PopoverData {
  nodeId: string
  parentNodeId?: string
  metrics: MetricType[]
  position: {
    x: number
    y: number
  }
}

export interface InteractionState {
  hoveredNode: string | null
  selectedNode: string | null
  popoverVisible: boolean
  popoverData: PopoverData | null
}

export interface VisualizationConfig {
  animation: {
    duration: number
    easing: string
  }
  colors: {
    primary: string
    secondary: string
    accent: string
    error: string
    warning: string
    success: string
  }
  layout: {
    margin: {
      top: number
      right: number
      bottom: number
      left: number
    }
  }
}