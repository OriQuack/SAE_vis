/**
 * Frontend action logger — buffers events in memory and flushes to POST /api/action-log.
 *
 * Set LOGGING_ENABLED = false to disable all logging.
 */

const LOGGING_ENABLED = true
const FLUSH_INTERVAL_MS = 5_000
const API_URL = '/api/action-log'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface LogEntry {
  seq: number
  time: string
  elapsed_s: number
  stage: string
  event: string
  details: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let seqCounter = 0
const sessionStart = Date.now()
const buffer: LogEntry[] = []

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

function makeEntry(stage: string, event: string, details: Record<string, unknown>): LogEntry {
  seqCounter += 1
  return {
    seq: seqCounter,
    time: new Date().toISOString(),
    elapsed_s: Math.round((Date.now() - sessionStart) / 100) / 10, // seconds, 1 decimal place
    stage,
    event,
    details,
  }
}

/** Push a log entry into the buffer (never blocks the UI). */
export function logAction(stage: string, event: string, details: Record<string, unknown> = {}): void {
  if (!LOGGING_ENABLED) return
  buffer.push(makeEntry(stage, event, details))
}

/**
 * Create a debounced logger for continuous events (e.g. threshold drag).
 * Returns a function with the same signature as `logAction`, but only the
 * *last* invocation within `delayMs` actually logs.
 */
export function createDebouncedLogger(
  stage: string,
  event: string,
  delayMs = 800,
): (details?: Record<string, unknown>) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (details: Record<string, unknown> = {}) => {
    if (!LOGGING_ENABLED) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      logAction(stage, event, details)
      timer = null
    }, delayMs)
  }
}

// ---------------------------------------------------------------------------
// Flush
// ---------------------------------------------------------------------------

async function flushLog(): Promise<void> {
  if (buffer.length === 0) return
  const batch = buffer.splice(0, buffer.length)
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    })
    if (!res.ok) {
      // Put entries back for retry
      buffer.unshift(...batch)
    }
  } catch {
    buffer.unshift(...batch)
  }
}

// ---------------------------------------------------------------------------
// Lifecycle — interval + beforeunload
// ---------------------------------------------------------------------------

if (LOGGING_ENABLED) {
  // Session start marker
  buffer.push({
    seq: 0,
    time: new Date().toISOString(),
    elapsed_s: 0,
    stage: 'system',
    event: 'session_start',
    details: {
      userAgent: navigator.userAgent,
      url: location.href,
    },
  })

  // Periodic flush
  setInterval(flushLog, FLUSH_INTERVAL_MS)

  // Guaranteed delivery on tab close
  window.addEventListener('beforeunload', () => {
    if (buffer.length === 0) return
    navigator.sendBeacon(API_URL, new Blob([JSON.stringify(buffer)], { type: 'application/json' }))
  })
}
