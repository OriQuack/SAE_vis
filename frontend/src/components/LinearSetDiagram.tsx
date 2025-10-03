import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { calculateLinearSetLayout, formatCount, LINEAR_DIAGRAM_MARGIN } from '../lib/d3-linear-set-utils'
import { METRIC_SCORE_FUZZ, METRIC_SCORE_DETECTION, METRIC_SCORE_SIMULATION, METRIC_SCORE_EMBEDDING } from '../lib/constants'
import '../styles/LinearSetDiagram.css'

const SCORING_METRICS = [
  { id: METRIC_SCORE_FUZZ, label: 'Fuzz' },
  { id: METRIC_SCORE_DETECTION, label: 'Detection' },
  { id: METRIC_SCORE_SIMULATION, label: 'Simulation' },
  { id: METRIC_SCORE_EMBEDDING, label: 'Embedding' }
]

interface LinearSetDiagramProps {
  width?: number
  height?: number
}

interface TooltipData {
  x: number
  y: number
  columnLabel: string
  featureCount: number
  metricLabel: string
}

export function LinearSetDiagram({ width: propWidth, height: propHeight }: LinearSetDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const setVisualizationData = useStore((state) => state.setVisualizationData)
  const selectedScoringMetrics = useStore((state) => state.selectedScoringMetrics)
  const toggleScoringMetric = useStore((state) => state.toggleScoringMetric)
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const [dimensions, setDimensions] = useState({ width: propWidth || 300, height: propHeight || 400 })

  // Measure container dimensions
  useEffect(() => {
    if (!containerRef.current) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setDimensions({ width, height })
      }
    })

    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!svgRef.current || !setVisualizationData || selectedScoringMetrics.length === 0) {
      return
    }

    // Calculate layout using D3
    const layout = calculateLinearSetLayout(
      setVisualizationData,
      selectedScoringMetrics,
      dimensions.width,
      dimensions.height
    )

    // React renders the visualization
    const svg = svgRef.current
    svg.innerHTML = '' // Clear previous rendering

    // Create SVG group
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    svg.appendChild(g)

    // No column separators - removed dotted lines

    // Render metric rows with line segments
    layout.rows.forEach((row) => {
      // Metric label on the left (using margin constant)
      const labelX = LINEAR_DIAGRAM_MARGIN.left - 5
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      label.setAttribute('x', labelX.toString())
      label.setAttribute('y', (row.y + row.height / 2).toString())
      label.setAttribute('text-anchor', 'end')
      label.setAttribute('dominant-baseline', 'middle')
      label.setAttribute('font-size', '10')
      label.setAttribute('font-weight', '600')
      label.setAttribute('fill', '#374151')
      label.textContent = row.metricLabel
      g.appendChild(label)

      // Background line showing total possible width
      if (layout.columns.length > 0) {
        const firstCol = layout.columns[0]
        const lastCol = layout.columns[layout.columns.length - 1]
        const totalWidth = (lastCol.x + lastCol.width) - firstCol.x

        const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
        bgRect.setAttribute('x', firstCol.x.toString())
        bgRect.setAttribute('y', row.y.toString())
        bgRect.setAttribute('width', totalWidth.toString())
        bgRect.setAttribute('height', row.height.toString())
        bgRect.setAttribute('fill', '#f3f4f6')
        bgRect.setAttribute('opacity', '0.5')
        g.appendChild(bgRect)
      }

      // Render each line segment for this metric
      row.lineSegments.forEach((segment) => {
        // Find the column data for this segment
        const column = layout.columns.find(col => col.id === segment.columnId)

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
        rect.setAttribute('x', segment.x.toString())
        rect.setAttribute('y', row.y.toString())
        rect.setAttribute('width', segment.width.toString())
        rect.setAttribute('height', row.height.toString())
        rect.setAttribute('fill', row.color)
        rect.setAttribute('opacity', '0.7')
        rect.style.cursor = 'pointer'

        // Add hover effect with tooltip
        rect.addEventListener('mouseenter', (e) => {
          rect.setAttribute('opacity', '0.9')

          if (column) {
            const svgRect = svgRef.current?.getBoundingClientRect()
            const tooltipX = e.clientX - (svgRect?.left || 0)
            const tooltipY = e.clientY - (svgRect?.top || 0)

            setTooltip({
              x: tooltipX,
              y: tooltipY,
              columnLabel: column.label,
              featureCount: column.featureCount,
              metricLabel: row.metricLabel
            })
          }
        })
        rect.addEventListener('mouseleave', () => {
          rect.setAttribute('opacity', '0.7')
          setTooltip(null)
        })

        g.appendChild(rect)
      })
    })

  }, [setVisualizationData, selectedScoringMetrics, dimensions.width, dimensions.height])

  return (
    <div className="linear-set-diagram-container">
      {/* Horizontal Metric Selector */}
      <div className="linear-set-diagram__selector">
        <div className="linear-set-diagram__selector-inner">
          {SCORING_METRICS.map((metric) => {
            const isSelected = selectedScoringMetrics.includes(metric.id)
            return (
              <div key={metric.id} className="linear-set-diagram__metric-item">
                <input
                  type="checkbox"
                  id={`metric-${metric.id}`}
                  checked={isSelected}
                  onChange={() => toggleScoringMetric(metric.id)}
                  className="linear-set-diagram__checkbox"
                />
                <label
                  htmlFor={`metric-${metric.id}`}
                  className="linear-set-diagram__label"
                >
                  {metric.label}
                </label>
              </div>
            )
          })}
        </div>
      </div>

      {/* Linear Set Diagram */}
      {!setVisualizationData || selectedScoringMetrics.length === 0 ? (
        <div className="linear-set-diagram__empty">
          Select scoring metrics to view linear set diagram
        </div>
      ) : (
        <div ref={containerRef} className="linear-set-diagram__viz-container">
          <svg
            ref={svgRef}
            width={dimensions.width}
            height={dimensions.height}
            className="linear-set-diagram__svg"
          />

          {/* Tooltip */}
          {tooltip && (
            <div
              className="linear-set-diagram__tooltip"
              style={{
                left: tooltip.x + 10,
                top: tooltip.y - 10
              }}
            >
              <div className="linear-set-diagram__tooltip-title">
                {tooltip.metricLabel}: {tooltip.columnLabel}
              </div>
              <div className="linear-set-diagram__tooltip-subtitle">
                {formatCount(tooltip.featureCount)} features
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
