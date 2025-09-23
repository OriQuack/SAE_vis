import type { MetricType, Thresholds, HistogramData } from '../../../services/types'

// ============================================================================
// THRESHOLD CALCULATION SERVICE
// ============================================================================

class ThresholdCalculationService {
  /**
   * Get the appropriate threshold key for a given metric
   */
  getThresholdKey(metric: MetricType): keyof Thresholds | MetricType {
    if (metric === 'semdist_mean') {
      return 'semdist_mean'
    }
    if (metric.includes('score')) {
      return 'score_high'
    }
    return metric
  }

  /**
   * Check if a threshold should be automatically updated for a metric
   */
  shouldUpdateThreshold(metric: MetricType, currentThresholds: Thresholds): boolean {
    const thresholdKey = this.getThresholdKey(metric)
    return thresholdKey in currentThresholds
  }

  /**
   * Calculate new thresholds from histogram data for a single metric
   */
  calculateThresholdFromHistogram(
    metric: MetricType,
    histogramData: HistogramData,
    currentThresholds: Thresholds
  ): Partial<Thresholds> {
    if (!this.shouldUpdateThreshold(metric, currentThresholds)) {
      return {}
    }

    const meanValue = histogramData.statistics.mean
    const thresholdKey = this.getThresholdKey(metric)

    return {
      [thresholdKey]: meanValue
    } as Partial<Thresholds>
  }

  /**
   * Calculate new thresholds from multiple histogram data
   */
  calculateThresholdsFromMultipleHistograms(
    metrics: MetricType[],
    histogramResults: HistogramData[],
    _currentThresholds: Thresholds
  ): Partial<Thresholds> {
    const newThresholds: Partial<Thresholds> = {}

    metrics.forEach((metric, index) => {
      const meanValue = histogramResults[index].statistics.mean

      if (metric === 'feature_splitting') {
        newThresholds.feature_splitting = meanValue
      } else if (metric === 'semdist_mean') {
        newThresholds.semdist_mean = meanValue
      } else if (metric.includes('score')) {
        // For score metrics, calculate average of all score means
        const scoreMetrics = metrics.filter(m => m.includes('score'))
        if (scoreMetrics.length > 0) {
          const scoreMeans = scoreMetrics
            .map(scoreMetric => {
              const idx = metrics.indexOf(scoreMetric)
              return idx !== -1 ? histogramResults[idx].statistics.mean : 0
            })
            .filter(v => v > 0)

          if (scoreMeans.length > 0) {
            newThresholds.score_high = scoreMeans.reduce((a, b) => a + b, 0) / scoreMeans.length
          }
        }
      }
    })

    return newThresholds
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const thresholdCalculationService = new ThresholdCalculationService()