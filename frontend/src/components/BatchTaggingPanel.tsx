// ============================================================================
// BATCH TAGGING PANEL
// Reusable batch tagging UI with category-specific and bulk tagging buttons
// ============================================================================

import React from 'react'
import { ThresholdHandleIcon } from './ThresholdHandles'
import '../styles/BatchTaggingPanel.css'

// ============================================================================
// TYPES
// ============================================================================

export interface BatchTagCategory {
  id: string            // e.g., 'missed-N-gram'
  label: string         // e.g., 'Pattern Miss'
  color: string         // Tag color
  count: number         // Preview count (striped) - for confirm buttons
  inputCount?: number   // Input count for "Tag All Unsure" button (defaults to count)
  outputCount?: number  // Output count for "Tag All Unsure" button
}

export interface BatchTaggingPanelProps {
  /** Categories configuration */
  categories: BatchTagCategory[]
  /** Count of unsure/untagged items */
  unsureCount: number
  /** Whether all buttons are disabled */
  disabled: boolean
  /** Show instruction placeholder instead of buttons */
  showPlaceholder: boolean
  /** Custom placeholder message */
  placeholderMessage?: string

  // Multi-class mode handlers (CauseView)
  /** Handler for per-category confirm buttons */
  onConfirmCategory?: (categoryId: string) => void
  /** Handler for "Confirm All" button */
  onConfirmAll?: () => void

  // Binary mode handlers (ThresholdTaggingPanel)
  /** Handler for "Confirm Threshold" button - applies boundary list items */
  onApplyThreshold?: () => void
  /** Counts for threshold button legend (boundary list sizes) */
  thresholdCounts?: { left: number; right: number }
  /** Handler for "Tag All Unsure as {category}" button */
  onTagAllAsCategory?: (categoryId: string) => void

  // Shared handler
  /** Handler for "Tag All Unsure by Decision Boundary" button */
  onTagAllUnsure?: () => void
}

// ============================================================================
// COMPONENT
// ============================================================================

const BatchTaggingPanel: React.FC<BatchTaggingPanelProps> = ({
  categories,
  unsureCount,
  disabled,
  showPlaceholder,
  placeholderMessage = 'Batch tagging not available',
  onConfirmCategory,
  onConfirmAll,
  onApplyThreshold,
  thresholdCounts,
  onTagAllAsCategory,
  onTagAllUnsure
}) => {
  // Calculate total taggable count for "Confirm All" button
  const totalTaggableCount = categories.reduce((sum, cat) => sum + cat.count, 0)

  // Calculate total input count for "Tag All Unsure" button
  const totalInputCount = categories.reduce((sum, cat) => sum + (cat.inputCount ?? cat.count), 0)

  // ============================================================================
  // PLACEHOLDER STATE
  // ============================================================================

  if (showPlaceholder) {
    return (
      <div className="batch-tagging__placeholder">
        <div className="batch-tagging__placeholder-instruction">
          <span className="batch-tagging__placeholder-number">2</span>
          {placeholderMessage}
        </div>
      </div>
    )
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <>
      {/* Swatch Legend */}
      <div className="batch-tagging__swatch-legend">
        <div className="batch-tagging__swatch-legend-item">
          <span
            className="action-button__legend-swatch action-button__legend-swatch--striped"
            style={{ '--swatch-color': '#000000' } as React.CSSProperties}
          />
          <span className="batch-tagging__swatch-legend-label">Preview</span>
        </div>
        {categories.map(cat => (
          <div key={cat.id} className="batch-tagging__swatch-legend-item">
            <span
              className="action-button__legend-swatch"
              style={{ backgroundColor: cat.color }}
            />
            <span className="batch-tagging__swatch-legend-label">{cat.label}</span>
          </div>
        ))}
        <div className="batch-tagging__swatch-legend-item">
          <span
            className="action-button__legend-swatch"
            style={{ backgroundColor: '#e0e0e0' }}
          />
          <span className="batch-tagging__swatch-legend-label">Unsure</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="batch-tagging__action-section">
        <div className="batch-tagging__action-row">
          {/* Per-category confirm buttons */}
          {onConfirmCategory && categories.map(cat => (
            <button
              key={cat.id}
              className="batch-tagging__button"
              onClick={() => onConfirmCategory(cat.id)}
              disabled={disabled || cat.count === 0}
              title={`Confirm all ${cat.label} predictions`}
            >
              <div className="batch-tagging__button-content">
                <ThresholdHandleIcon
                  className="batch-tagging__button-icon"
                  orientation="horizontal"
                  width={24}
                  height={20}
                />
                <span className="batch-tagging__button-text">Confirm Confident {cat.label}</span>
              </div>
              <div className="batch-tagging__button-legend">
                {cat.count > 0 ? (
                  <>
                    <span className="batch-tagging__legend-item">
                      <span
                        className="action-button__legend-swatch action-button__legend-swatch--striped"
                        style={{ '--swatch-color': cat.color } as React.CSSProperties}
                      />
                      <span className="batch-tagging__legend-count">{cat.count}</span>
                    </span>
                    <span className="batch-tagging__legend-arrow">→</span>
                    <span className="batch-tagging__legend-item">
                      <span
                        className="action-button__legend-swatch"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="batch-tagging__legend-count">{cat.count}</span>
                    </span>
                  </>
                ) : (
                  <span className="batch-tagging__legend-empty">&nbsp;</span>
                )}
              </div>
            </button>
          ))}

          {/* Confirm All button (multi-class mode) */}
          {onConfirmAll && (
            <button
              className="batch-tagging__button"
              onClick={onConfirmAll}
              disabled={disabled || totalTaggableCount === 0}
              title="Confirm all confident predictions"
            >
              <div className="batch-tagging__button-content">
                <ThresholdHandleIcon
                  className="batch-tagging__button-icon"
                  orientation="horizontal"
                  width={24}
                  height={20}
                />
                <span className="batch-tagging__button-text">Confirm Confident by Decision Boundary</span>
              </div>
              <div className="batch-tagging__button-legend">
                {totalTaggableCount > 0 ? (
                  <>
                    {categories.map(cat => cat.count > 0 && (
                      <span key={`in-${cat.id}`} className="batch-tagging__legend-item">
                        <span
                          className="action-button__legend-swatch action-button__legend-swatch--striped"
                          style={{ '--swatch-color': cat.color } as React.CSSProperties}
                        />
                        <span className="batch-tagging__legend-count">{cat.count}</span>
                      </span>
                    ))}
                    <span className="batch-tagging__legend-arrow">→</span>
                    {categories.map(cat => cat.count > 0 && (
                      <span key={`out-${cat.id}`} className="batch-tagging__legend-item">
                        <span
                          className="action-button__legend-swatch"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span className="batch-tagging__legend-count">{cat.count}</span>
                      </span>
                    ))}
                  </>
                ) : (
                  <span className="batch-tagging__legend-empty">&nbsp;</span>
                )}
              </div>
            </button>
          )}

          {/* Confirm Threshold button (binary mode) */}
          {onApplyThreshold && thresholdCounts && categories.length === 2 && (
            <button
              className="batch-tagging__button"
              onClick={onApplyThreshold}
              disabled={disabled || (thresholdCounts.left === 0 && thresholdCounts.right === 0)}
              title="Apply auto-tags from threshold regions"
            >
              <div className="batch-tagging__button-content">
                <ThresholdHandleIcon
                  className="batch-tagging__button-icon"
                  orientation="horizontal"
                  width={24}
                  height={20}
                />
                <span className="batch-tagging__button-text">Confirm Threshold</span>
              </div>
              <div className="batch-tagging__button-legend">
                <span className="batch-tagging__legend-item">
                  <span
                    className="action-button__legend-swatch action-button__legend-swatch--striped"
                    style={{ '--swatch-color': categories[0].color } as React.CSSProperties}
                  />
                  <span className="batch-tagging__legend-count">{thresholdCounts.left}</span>
                </span>
                <span className="batch-tagging__legend-item">
                  <span
                    className="action-button__legend-swatch action-button__legend-swatch--striped"
                    style={{ '--swatch-color': categories[1].color } as React.CSSProperties}
                  />
                  <span className="batch-tagging__legend-count">{thresholdCounts.right}</span>
                </span>
                <span className="batch-tagging__legend-arrow">→</span>
                <span className="batch-tagging__legend-item">
                  <span
                    className="action-button__legend-swatch"
                    style={{ backgroundColor: categories[0].color }}
                  />
                  <span className="batch-tagging__legend-count">{thresholdCounts.left}</span>
                </span>
                <span className="batch-tagging__legend-item">
                  <span
                    className="action-button__legend-swatch"
                    style={{ backgroundColor: categories[1].color }}
                  />
                  <span className="batch-tagging__legend-count">{thresholdCounts.right}</span>
                </span>
              </div>
            </button>
          )}

          {/* Tag All Unsure as Single Category button (binary mode) */}
          {onTagAllAsCategory && categories.length >= 1 && (
            <button
              className="batch-tagging__button"
              onClick={() => onTagAllAsCategory(categories[0].id)}
              disabled={disabled || unsureCount === 0}
              title={`Tag all remaining as ${categories[0].label}`}
            >
              <div className="batch-tagging__button-content">
                <svg className="batch-tagging__button-icon" viewBox="0 0 24 20">
                  <rect
                    x="1" y="2" width="22" height="16" rx="3"
                    fill={categories[0].color}
                    stroke="#fff"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M6 10 L16 10 M12 6 L17 10 L12 14"
                    stroke="#fff"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </svg>
                <span className="batch-tagging__button-text">Tag All Unsure as {categories[0].label}</span>
              </div>
              <div className="batch-tagging__button-legend">
                <span className="batch-tagging__legend-item">
                  <span
                    className="action-button__legend-swatch"
                    style={{ backgroundColor: '#e0e0e0' }}
                  />
                  <span className="batch-tagging__legend-count">{unsureCount}</span>
                </span>
                <span className="batch-tagging__legend-arrow">→</span>
                <span className="batch-tagging__legend-item">
                  <span
                    className="action-button__legend-swatch"
                    style={{ backgroundColor: categories[0].color }}
                  />
                  <span className="batch-tagging__legend-count">{unsureCount}</span>
                </span>
              </div>
            </button>
          )}

          {/* Tag All Unsure by Decision Boundary button */}
          {onTagAllUnsure && (
            <button
              className="batch-tagging__button"
              onClick={onTagAllUnsure}
              disabled={disabled || (unsureCount === 0 && totalInputCount === 0)}
              title="Auto-tag remaining items using decision boundary"
            >
              <div className="batch-tagging__button-content">
                {categories.length === 2 ? (
                  <svg className="batch-tagging__button-icon" viewBox="0 0 24 20">
                    <rect x="1" y="2" width="10" height="16" rx="2" fill={categories[0].color} stroke="#fff" strokeWidth="1.5"/>
                    <rect x="13" y="2" width="10" height="16" rx="2" fill={categories[1].color} stroke="#fff" strokeWidth="1.5"/>
                    <text x="6" y="14" fill="#fff" fontSize="10" fontWeight="bold" textAnchor="middle">&lt;</text>
                    <text x="18" y="14" fill="#fff" fontSize="10" fontWeight="bold" textAnchor="middle">&gt;</text>
                  </svg>
                ) : (
                  <svg className="batch-tagging__button-icon" viewBox="0 0 24 20">
                    {categories.map((cat, i) => (
                      <rect
                        key={cat.id}
                        x={2 + i * 7.25}
                        y="2"
                        width="5.5"
                        height="16"
                        rx="2"
                        fill={cat.color}
                        stroke="#fff"
                        strokeWidth="1"
                      />
                    ))}
                  </svg>
                )}
                <span className="batch-tagging__button-text">Tag All Unsure by Decision Boundary</span>
              </div>
              <div className="batch-tagging__button-legend">
                <span className="batch-tagging__legend-item">
                  <span
                    className="action-button__legend-swatch"
                    style={{ backgroundColor: '#e0e0e0' }}
                  />
                  <span className="batch-tagging__legend-count">{unsureCount}</span>
                </span>
                <span className="batch-tagging__legend-arrow">→</span>
                {categories.map(cat => {
                  const outputCount = cat.outputCount ?? 0
                  return outputCount > 0 && (
                    <span key={`unsure-out-${cat.id}`} className="batch-tagging__legend-item">
                      <span
                        className="action-button__legend-swatch"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="batch-tagging__legend-count">{outputCount}</span>
                    </span>
                  )
                })}
              </div>
            </button>
          )}
        </div>
      </div>
    </>
  )
}

export default BatchTaggingPanel
