import type { ReactNode } from 'react'

/** Inline display-only checkbox toggle replica. */
function hintToggle(label: string, variant?: 'disagreement') {
  const cls = variant === 'disagreement'
    ? 'hint-toggle hint-toggle--disagreement'
    : 'hint-toggle'
  return (
    <span className={cls}>
      <span className="hint-toggle__checkbox" />
      {label}
    </span>
  )
}

/**
 * Build styled empty-state hint JSX with inline toggle replicas.
 * Returns null when no hints apply.
 */
export function buildEmptyHints(
  itemLabel: string,
  showDisagreementOnly: boolean,
  hideTagged: boolean,
  showThresholdHint: boolean
): ReactNode | null {
  const parts: Array<{ key: string; verb: string; Verb: string; rest: ReactNode }> = []

  if (showDisagreementOnly) {
    parts.push({
      key: 'disagree',
      verb: 'uncheck', Verb: 'Uncheck',
      rest: <> {hintToggle('Disagreement Only', 'disagreement')}</>
    })
  }
  if (showThresholdHint) {
    parts.push({
      key: 'threshold',
      verb: 'adjust', Verb: 'Adjust',
      rest: <> the threshold range</>
    })
  }
  if (hideTagged) {
    parts.push({
      key: 'hide',
      verb: 'uncheck', Verb: 'Uncheck',
      rest: <> {hintToggle('Hide Labeled')} to review labeled {itemLabel}</>
    })
  }

  if (parts.length === 0) return null

  return (
    <>
      {parts.map((p, i) => (
        <span key={p.key}>
          {i > 0 && ', or '}
          {i === 0 ? p.Verb : p.verb}{p.rest}
        </span>
      ))}
    </>
  )
}
