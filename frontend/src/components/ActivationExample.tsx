import React, { useState, useMemo } from 'react'
import type { ActivationExamples } from '../types'
import {
  buildActivationTokens,
  getActivationColor,
  formatTokensWithEllipsis
} from '../lib/activation-utils'
import '../styles/ActivationExample.css'

interface ActivationExampleProps {
  examples: ActivationExamples
  compact?: boolean  // Kept for backwards compatibility but not used
}

// Helper function to generate appropriate whitespace symbol
const getWhitespaceSymbol = (text: string): string => {
  const newlineCount = (text.match(/\n/g) || []).length
  const tabCount = (text.match(/\t/g) || []).length
  const crCount = (text.match(/\r/g) || []).length

  if (tabCount > 0) {
    return '→'.repeat(tabCount)
  } else if (crCount > 0 && newlineCount === 0) {
    return '⏎'.repeat(crCount)
  } else if (newlineCount > 0) {
    return '↵'.repeat(newlineCount)
  }
  return '·' // Generic whitespace indicator
}

const ActivationExample: React.FC<ActivationExampleProps> = ({
  examples,
  compact = true
}) => {
  const [showPopover, setShowPopover] = useState<boolean>(false)

  // Group examples by quantile_index (memoized for performance)
  const quantileGroups = useMemo(() => {
    return [0, 1, 2, 3].map(qIndex =>
      examples.quantile_examples
        .filter(ex => ex.quantile_index === qIndex)
        .slice(0, 2)
    )
  }, [examples.quantile_examples])

  return (
    <div
      className="activation-example"
      onMouseEnter={() => setShowPopover(true)}
      onMouseLeave={() => setShowPopover(false)}
    >
      {/* Default view: 3 quantiles (0, 1, 2), character-based truncation */}
      {[0, 1, 2].map(qIndex => {
        // Get first example from this quantile
        const example = examples.quantile_examples.find(ex => ex.quantile_index === qIndex)
        if (!example) return null

        // Build tokens from 32-token window
        const tokens = buildActivationTokens(example, 32)
        // Truncate to ~50 characters
        const { displayTokens, hasEllipsis } = formatTokensWithEllipsis(tokens, 50)

        return (
          <div
            key={qIndex}
            className="activation-example__quantile"
          >
            {displayTokens.map((token, tokenIdx) => (
              <span
                key={tokenIdx}
                className={`activation-token ${token.is_max ? 'activation-token--max' : ''} ${token.is_newline ? 'activation-token--newline' : ''}`}
                style={{
                  backgroundColor: token.activation_value
                    ? getActivationColor(token.activation_value, example.max_activation)
                    : 'transparent'
                }}
                title={token.activation_value?.toFixed(3) || 'No activation'}
              >
                {token.is_newline ? (
                  <>
                    <span className="newline-symbol">{getWhitespaceSymbol(token.text)}</span>
                    <span className="newline-actual">{token.text}</span>
                  </>
                ) : (
                  token.text
                )}
              </span>
            ))}
            {hasEllipsis && <span className="activation-example__ellipsis">...</span>}
          </div>
        )
      })}

      {/* Hover popover: All 8 examples (2 per quantile) */}
      {showPopover && (
        <div className="activation-example__popover">
          <div className="activation-example__popover-header">
            All Examples (2 per quantile)
          </div>
          <div className="activation-example__popover-content">
            {quantileGroups.map((group, qIdx) => (
              <div key={qIdx} className="activation-example__popover-quantile-group">
                <div className="activation-example__popover-quantile-label">
                  Quantile {qIdx + 1}
                </div>
                {group.map((example, exIdx) => {
                  // Show full 32-token window without truncation
                  const tokens = buildActivationTokens(example, 32)

                  return (
                    <div key={exIdx} className="activation-example__popover-row">
                      {tokens.map((token, tokenIdx) => (
                        <span
                          key={tokenIdx}
                          className={`activation-token ${token.is_max ? 'activation-token--max' : ''} ${token.is_newline ? 'activation-token--newline' : ''}`}
                          style={{
                            backgroundColor: token.activation_value
                              ? getActivationColor(token.activation_value, example.max_activation)
                              : 'transparent'
                          }}
                          title={token.activation_value?.toFixed(3) || 'No activation'}
                        >
                          {token.is_newline ? (
                            <>
                              <span className="newline-symbol">{getWhitespaceSymbol(token.text)}</span>
                              <span className="newline-actual">{token.text}</span>
                            </>
                          ) : (
                            token.text
                          )}
                        </span>
                      ))}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Memoize component to prevent unnecessary re-renders
export default React.memo(ActivationExample)
