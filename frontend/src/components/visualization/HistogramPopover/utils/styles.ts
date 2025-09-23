// ============================================================================
// STYLE CONSTANTS
// ============================================================================

export const POPOVER_STYLES = {
  container: {
    position: 'fixed' as const,
    zIndex: 1001,
    transition: 'all',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15), 0 4px 12px rgba(0, 0, 0, 0.1)',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    backgroundColor: '#ffffff'
  }
}

export const HEADER_STYLES = {
  container: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 16px',
    borderBottom: '1px solid #e2e8f0',
    backgroundColor: '#f8fafc',
    borderRadius: '8px 8px 0 0',
    height: '48px',
    flexShrink: 0
  },
  titleSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'center',
    flex: 1,
    minWidth: 0
  },
  title: {
    margin: 0,
    fontSize: '14px',
    fontWeight: '600',
    color: '#1f2937',
    lineHeight: '1.3',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  parent: {
    fontSize: '10px',
    color: '#7c3aed',
    fontWeight: '500',
    lineHeight: '1.2',
    marginTop: '1px'
  },
  metric: {
    fontSize: '11px',
    color: '#6b7280',
    fontWeight: '500',
    lineHeight: '1.2',
    marginTop: '2px'
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '16px',
    fontWeight: 'normal' as const,
    color: '#6b7280',
    cursor: 'pointer',
    padding: '2px',
    lineHeight: '1',
    width: '20px',
    height: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '3px',
    transition: 'all 150ms ease',
    flexShrink: 0,
    marginLeft: '8px'
  },
  closeButtonHover: {
    backgroundColor: '#f3f4f6',
    color: '#374151'
  }
}

export const CHART_STYLES = {
  container: {
    padding: '8px',
    overflow: 'hidden'
  },
  svg: {
    display: 'block',
    margin: '0 auto'
  }
}

export const FOOTER_STYLES = {
  base: {
    padding: '8px 16px',
    borderTop: '1px solid #e2e8f0',
    backgroundColor: '#f9fafb',
    borderRadius: '0 0 8px 8px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center'
  },
  single: {
    height: '36px'
  },
  multi: {
    minHeight: '36px',
    justifyContent: 'center'
  },
  thresholdDisplay: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px'
  },
  thresholdLabel: {
    color: '#6b7280',
    fontWeight: '500'
  },
  thresholdValue: {
    color: '#1f2937',
    fontWeight: '600',
    fontFamily: 'monospace'
  },
  thresholdNote: {
    color: '#9ca3af',
    fontStyle: 'italic'
  },
  multiSummary: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '11px',
    flexWrap: 'wrap' as const
  },
  metricItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  },
  metricLabel: {
    color: '#6b7280',
    fontWeight: '500'
  },
  metricValue: {
    color: '#1f2937',
    fontWeight: '600',
    fontFamily: 'monospace'
  },
  metricDefault: {
    color: '#9ca3af',
    fontStyle: 'italic',
    fontSize: '9px'
  }
}

export const ERROR_STYLES = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    backgroundColor: '#fef2f2',
    borderLeft: '4px solid #ef4444',
    margin: '8px 16px',
    borderRadius: '4px'
  },
  icon: {
    fontSize: '16px',
    color: '#ef4444'
  },
  text: {
    flex: 1,
    color: '#7f1d1d',
    fontSize: '14px'
  },
  retry: {
    padding: '4px 8px',
    fontSize: '12px',
    color: '#ef4444',
    background: 'transparent',
    border: '1px solid #ef4444',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'all 150ms ease'
  },
  retryHover: {
    backgroundColor: '#ef4444',
    color: 'white'
  }
}

export const LOADING_STYLES = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '40px 16px',
    color: '#6b7280'
  },
  spinner: {
    width: '16px',
    height: '16px',
    border: '2px solid #e5e7eb',
    borderTop: '2px solid #3b82f6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  }
}

export const VALIDATION_ERROR_STYLES = {
  container: {
    padding: '8px 16px',
    backgroundColor: '#fffbeb',
    borderLeft: '4px solid #f59e0b',
    margin: '8px 16px',
    borderRadius: '4px'
  },
  item: {
    color: '#92400e',
    fontSize: '12px',
    marginBottom: '4px'
  }
}

export const createTransitionStyle = (duration: number) => ({
  transition: `all ${duration}ms ease-out`
})

export const createDynamicContainerStyle = (
  position: { x: number; y: number },
  transform: string,
  animationDuration: number
) => ({
  ...POPOVER_STYLES.container,
  left: position.x,
  top: position.y,
  transform,
  ...createTransitionStyle(animationDuration)
})