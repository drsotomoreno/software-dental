#!/usr/bin/env node
/**
 * Purga Base64/DataURL y clinicalDraft pesados de clinical-sync.json.
 * Uso (PM2 detenido, heap alto):
 *   node --max-old-space-size=1536 scripts/purge-clinical-sync-heavy.cjs /path/to/clinical-sync.json
 */
const fs = require('node:fs')

const activePath = process.argv[2]
if (!activePath) {
  console.error('Usage: node purge-clinical-sync-heavy.cjs /path/to/clinical-sync.json')
  process.exit(2)
}

const HEAVY_BINARY_KEYS = new Set([
  'dataUrl',
  'dataBase64',
  'base64',
  'fileData',
  'arrayBuffer',
  'blob',
  'data',
  'buffer',
  'bytes',
])
const MAX_INLINE_BINARY_CHARS = 50_000
const MAX_DRAFT_CHARS = 50_000

function isHeavyBinaryString(entry) {
  if (typeof entry !== 'string' || entry.length <= MAX_INLINE_BINARY_CHARS) return false
  return /^data:/i.test(entry) || /^[A-Za-z0-9+/=\s]+$/.test(entry.slice(0, 120))
}

function stripHeavy(value) {
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((row) => stripHeavy(row))
  const out = {}
  for (const [key, entry] of Object.entries(value)) {
    if (HEAVY_BINARY_KEYS.has(key)) continue
    if (key === 'clinicalDraft' || key === 'clinicalDraftForm' || key === 'draftForm') {
      if (typeof entry === 'string' && entry.length > MAX_DRAFT_CHARS) continue
      if (entry && typeof entry === 'object') {
        const asJson = JSON.stringify(entry)
        if (asJson.length > MAX_DRAFT_CHARS) continue
      }
    }
    if (isHeavyBinaryString(entry)) continue
    out[key] = entry && typeof entry === 'object' ? stripHeavy(entry) : entry
  }
  return out
}

function main() {
  if (!fs.existsSync(activePath)) {
    console.error('MISSING', activePath)
    process.exit(1)
  }
  const before = fs.statSync(activePath).size
  const bak = `${activePath}.bak-purge-heavy-${Date.now()}`
  fs.copyFileSync(activePath, bak)

  const store = JSON.parse(fs.readFileSync(activePath, 'utf8'))
  const cleaned = stripHeavy(store)
  const tmp = `${activePath}.tmp-purge-${Date.now()}`
  fs.writeFileSync(tmp, JSON.stringify(cleaned))
  fs.renameSync(tmp, activePath)
  const after = fs.statSync(activePath).size

  console.log(
    JSON.stringify(
      {
        phase: 'done',
        path: activePath,
        bak,
        beforeBytes: before,
        afterBytes: after,
        savedBytes: before - after,
        beforeMb: Math.round(before / (1024 * 1024)),
        afterMb: Math.round(after / (1024 * 1024)),
      },
      null,
      2,
    ),
  )
  if (after > 100 * 1024 * 1024) {
    console.error('PURGE_STILL_TOO_LARGE', after)
    process.exit(1)
  }
  // 80–100 MB: aceptable con poll 60s + pause durante Drive; no fallar el workflow.
  if (after > 80 * 1024 * 1024) {
    console.warn('PURGE_WARN_SIZE', after)
  }
}

main()
