import React from 'react'
import { STAGE_LABELS } from './utils/constants'
import type { D3SankeyNode } from '../../services/types'

interface SankeyStageLabelsProps {
  nodes: D3SankeyNode[]
}

export const SankeyStageLabels: React.FC<SankeyStageLabelsProps> = React.memo(({ nodes }) => {
  const uniqueStages = Array.from(new Set(nodes.map(node => node.stage)))

  return (
    <g className="sankey-diagram__stage-labels">
      {uniqueStages.map(stage => {
        const stageNodes = nodes.filter(node => node.stage === stage)
        const avgX = stageNodes.reduce((sum, node) => sum + ((node.x0 || 0) + (node.x1 || 0)) / 2, 0) / stageNodes.length

        return (
          <text
            key={stage}
            x={avgX}
            y={-5}
            textAnchor="middle"
            fontSize={12}
            fontWeight={600}
            fill="#374151"
          >
            Stage {stage + 1}: {STAGE_LABELS[stage] || `Stage ${stage + 1}`}
          </text>
        )
      })}
    </g>
  )
})

SankeyStageLabels.displayName = 'SankeyStageLabels'