import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  DIAGNOSTIC_AID_DRIVE_GATEWAY_MESSAGE,
  DIAGNOSTIC_AID_DRIVE_RETRY_MS,
  diagnosticAidDriveFailureMessage,
} from '../../shared/diagnosticAidDriveError.js'

const here = dirname(fileURLToPath(import.meta.url))

test('502 sin JSON conserva el archivo en este equipo', () => {
  const message = diagnosticAidDriveFailureMessage(502, {})
  assert.equal(message, DIAGNOSTIC_AID_DRIVE_GATEWAY_MESSAGE)
  assert.match(message, /sigue en este equipo/)
  assert.equal(DIAGNOSTIC_AID_DRIVE_RETRY_MS, 8_000)
})

test('un error JSON de la API se muestra tal cual', () => {
  assert.equal(
    diagnosticAidDriveFailureMessage(400, { error: 'El archivo está vacío.' }),
    'El archivo está vacío.',
  )
  assert.match(diagnosticAidDriveFailureMessage(500, {}), /HTTP 500/)
})

test('el fallo de subida deja el examen en indexeddb', async () => {
  const src = await readFile(join(here, 'diagnosticAidDriveUpload.ts'), 'utf8')
  assert.match(src, /diagnosticAidDriveFailureMessage/)
  assert.match(src, /DIAGNOSTIC_AID_DRIVE_RETRY_MS/)
  assert.match(src, /storageBackend: 'indexeddb'/)
  const markStart = src.indexOf('async function markUploadError')
  const markFn = src.slice(markStart, markStart + 400)
  assert.match(markFn, /storageBackend: 'indexeddb'/)
  assert.match(markFn, /driveUploadStatus: 'error'/)
})
