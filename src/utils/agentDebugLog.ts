/** Debug-mode NDJSON logger (session 752ead). Safe no-op if sinks are down. */
export function agentDebugLog(payload: {
  hypothesisId: string
  location: string
  message: string
  data?: Record<string, unknown>
  runId?: string
}): void {
  const entry = {
    sessionId: '752ead',
    runId: payload.runId || 'post-fix',
    hypothesisId: payload.hypothesisId,
    location: payload.location,
    message: payload.message,
    data: payload.data || {},
    timestamp: Date.now(),
  }
  const body = JSON.stringify(entry)
  try {
    const w = window as Window & { __DBG_752ead?: unknown[] }
    if (!Array.isArray(w.__DBG_752ead)) w.__DBG_752ead = []
    w.__DBG_752ead.push(entry)
    if (w.__DBG_752ead.length > 200) w.__DBG_752ead.splice(0, w.__DBG_752ead.length - 200)
    localStorage.setItem('agent_debug_752ead_last', body)
  } catch {
    /* ignore */
  }
  // Same-origin Vite middleware → .cursor/debug-752ead.log
  fetch('/__agent_debug', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  }).catch(() => {})
  // Cursor debug ingest
  fetch('http://127.0.0.1:7354/ingest/7f4246ef-35bb-44a5-bcc0-66832f0a2430', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': '752ead',
    },
    body,
  }).catch(() => {})
}
