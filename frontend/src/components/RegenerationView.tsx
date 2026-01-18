import React, { useCallback } from 'react'
import SankeyDiagram from './SankeyDiagram'
import OverviewSummary from './OverviewSummary'
import { useVisualizationStore } from '../store'
import '../styles/RegenerationView.css'

interface RegenerationViewProps {
  className?: string
}

const RegenerationView: React.FC<RegenerationViewProps> = ({ className = '' }) => {
  const {
    pairSelectionStates,
    pairSelectionSources,
    featureSelectionStates,
    featureSelectionSources,
    causeSelectionStates,
    causeSelectionSources
  } = useVisualizationStore()

  const handleDownload = useCallback(() => {
    // Stage 1: Feature Splitting (pairs)
    // Manual = click source (direct user clicks), Auto = threshold or predicted
    const stage1 = {
      fragmented: { manual: [] as string[], auto: [] as string[] },
      monosemantic: { manual: [] as string[], auto: [] as string[] }
    }
    pairSelectionStates.forEach((state, key) => {
      const tag = state === 'selected' ? 'fragmented' : 'monosemantic'
      const source = pairSelectionSources.get(key) === 'click' ? 'manual' : 'auto'
      stage1[tag][source].push(key)
    })

    // Stage 2: Quality (features) + Stage 3 well-explained merged
    // Manual = click source (direct user clicks), Auto = threshold or predicted
    const stage2 = {
      wellExplained: { manual: [] as number[], auto: [] as number[] },
      needRevision: { manual: [] as number[], auto: [] as number[] }
    }
    featureSelectionStates.forEach((state, id) => {
      const tag = state === 'selected' ? 'wellExplained' : 'needRevision'
      const source = featureSelectionSources.get(id) === 'click' ? 'manual' : 'auto'
      stage2[tag][source].push(id)
    })
    // Merge Stage 3 well-explained into Stage 2
    causeSelectionStates.forEach((tag, id) => {
      if (tag === 'well-explained') {
        const source = causeSelectionSources.get(id) === 'click' ? 'manual' : 'auto'
        stage2.wellExplained[source].push(id)
      }
    })

    // Stage 3: Cause categories (excluding well-explained, merged above)
    // Manual = click source (direct user clicks), Auto = threshold or predicted
    const stage3 = {
      patternMiss: { manual: [] as number[], auto: [] as number[] },
      contextMiss: { manual: [] as number[], auto: [] as number[] },
      noisyActivation: { manual: [] as number[], auto: [] as number[] }
    }
    causeSelectionStates.forEach((tag, id) => {
      if (tag === 'missed-N-gram') {
        const source = causeSelectionSources.get(id) === 'click' ? 'manual' : 'auto'
        stage3.patternMiss[source].push(id)
      } else if (tag === 'missed-context') {
        const source = causeSelectionSources.get(id) === 'click' ? 'manual' : 'auto'
        stage3.contextMiss[source].push(id)
      } else if (tag === 'noisy-activation') {
        const source = causeSelectionSources.get(id) === 'click' ? 'manual' : 'auto'
        stage3.noisyActivation[source].push(id)
      }
    })

    const exportData = {
      exportedAt: new Date().toISOString(),
      stage1_featureSplitting: stage1,
      stage2_quality: stage2,
      stage3_cause: stage3,
      summary: {
        totalPairsTagged: pairSelectionStates.size,
        totalFeaturesTagged: featureSelectionStates.size,
        totalCausesTagged: causeSelectionStates.size
      }
    }

    // Download as JSON
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tagging-results-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [
    pairSelectionStates,
    pairSelectionSources,
    featureSelectionStates,
    featureSelectionSources,
    causeSelectionStates,
    causeSelectionSources
  ])

  return (
    <div className={`regeneration-view ${className}`}>
      <div className="regeneration-view__top">
        <SankeyDiagram
          flowDirection="left-to-right"
          panel="left"
        />
        <OverviewSummary />
      </div>
      <div className="regeneration-view__bottom">
        <button
          className="regeneration-view__download-btn"
          onClick={handleDownload}
        >
          Download Results
        </button>
      </div>
    </div>
  )
}

export default React.memo(RegenerationView)
