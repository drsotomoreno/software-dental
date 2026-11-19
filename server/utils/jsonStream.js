/**
 * Escribe JSON por trozos. Evita un único JSON.stringify del snapshot de la clínica
 * (V8 JsonStringifier::SerializeString → OOM → 502 en /api/sync/pull).
 */

function writeValue(res, value) {
  if (Array.isArray(value)) {
    res.write('[')
    for (let index = 0; index < value.length; index += 1) {
      if (index) res.write(',')
      writeValue(res, value[index])
    }
    res.write(']')
    return
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value)
    res.write('{')
    let emitted = 0
    for (const key of keys) {
      if (value[key] === undefined) continue
      if (emitted) res.write(',')
      emitted += 1
      res.write(JSON.stringify(key))
      res.write(':')
      const entry = value[key]
      if (entry && typeof entry === 'object') writeValue(res, entry)
      else res.write(JSON.stringify(entry))
    }
    res.write('}')
    return
  }
  res.write(JSON.stringify(value === undefined ? null : value))
}

export function sendJsonStream(res, status, value) {
  if (res.headersSent || res.writableEnded) return
  res.status(status)
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  writeValue(res, value)
  res.end()
}
