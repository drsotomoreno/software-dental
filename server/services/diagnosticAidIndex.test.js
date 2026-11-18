import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  overlayClinicDiagnosticAids,
  overlayIndexOntoMeta,
  readDiagnosticAidIndex,
  setDiagnosticAidIndexPathForTests,
  upsertDiagnosticAidIndexEntry,
} from './diagnosticAidIndex.js'

const here = dirname(fileURLToPath(import.meta.url))

test('POST /upload no abre clinical-sync ni loadStore', async () => {
  const route = await readFile(join(here, '../routes/googleDrive.routes.js'), 'utf8')
  assert.match(route, /upsertDiagnosticAidIndexEntry/)
  assert.doesNotMatch(route, /clinicalSyncStore/)
  assert.doesNotMatch(route, /upsertDiagnosticAidMetadata/)
  assert.doesNotMatch(route, /loadStore\(/)
  assert.doesNotMatch(route, /saveStore\(/)
  const uploadStart = route.indexOf("router.post('/upload'")
  assert.ok(uploadStart > 0)
  const uploadFn = route.slice(uploadStart, uploadStart + 8000)
  assert.match(uploadFn, /upsertDiagnosticAidIndexEntry/)
  assert.doesNotMatch(uploadFn, /loadStore\(/)
})

test('upsert de metadato y el pull slim no parsean el JSON grande', async () => {
  const src = await readFile(join(here, 'clinicalSyncStore.js'), 'utf8')
  const upsertStart = src.indexOf('export async function upsertDiagnosticAidMetadata')
  assert.ok(upsertStart > 0)
  const upsertFn = src.slice(upsertStart, upsertStart + 1400)
  assert.match(upsertFn, /upsertDiagnosticAidIndexEntry/)
  assert.doesNotMatch(upsertFn, /loadStore\(/)
  assert.doesNotMatch(upsertFn, /saveStore\(/)

  const pullStart = src.indexOf('export async function pullClinicSnapshot')
  const pullFn = src.slice(pullStart, pullStart + 5500)
  const slimStart = pullFn.indexOf('if (slim) {')
  const loadAt = pullFn.indexOf('const store = await loadStore()', slimStart)
  assert.ok(slimStart >= 0 && loadAt > slimStart)
  const slimOnly = pullFn.slice(slimStart, loadAt)
  assert.match(slimOnly, /readDiagnosticAidIndex/)
  assert.match(slimOnly, /overlayClinicDiagnosticAids/)
  assert.doesNotMatch(slimOnly, /await loadStore\(/)

  const saveStart = src.indexOf('async function saveStore')
  const saveFn = src.slice(saveStart, saveStart + 1800)
  assert.match(saveFn, /overlayIndexOntoMeta/)
})

test('la segunda subida reutiliza aidId antes de files.create', async () => {
  const src = await readFile(join(here, 'googleDriveAttachments.service.js'), 'utf8')
  const start = src.indexOf('export async function uploadClinicAttachmentToDrive')
  const fn = src.slice(start, start + 7000)
  const reuse = fn.indexOf("decision.action === 'reuse'")
  const create = fn.indexOf('drive.files.create')
  assert.ok(reuse > 0)
  assert.ok(create > reuse)
})

test('el índice guarda driveFileId sin base64 y el meta lo recupera', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aid-index-'))
  const filePath = join(dir, 'diagnostic-aid-index.json')
  setDiagnosticAidIndexPathForTests(filePath)
  try {
    const saved = await upsertDiagnosticAidIndexEntry('clinic-1', {
      id: 'aid-gemini',
      fileName: 'Gemini_Generated_Image.png',
      fileHash: 'eada73bb',
      driveFileId: 'drive-file-1',
      webViewLink: 'https://drive.google.com/file/d/drive-file-1/view',
      dataBase64: 'A'.repeat(80_000),
      patientSyncId: 'pac-1',
      updatedAt: '2026-11-18T20:46:00.000Z',
    })
    assert.equal(saved.metadataPersisted, true)

    const index = await readDiagnosticAidIndex()
    const record = index.clinics['clinic-1']['aid-gemini']
    assert.equal(record.payload.driveFileId, 'drive-file-1')
    assert.equal(record.payload.dataBase64, undefined)
    assert.equal(record.payload.storageBackend, 'google_drive')

    const meta = {
      clinics: {
        'clinic-1': { patients: {}, appointments: {}, diagnosticAids: {} },
      },
    }
    overlayIndexOntoMeta(meta, index)
    assert.equal(
      meta.clinics['clinic-1'].diagnosticAids['aid-gemini'].payload.driveFileId,
      'drive-file-1',
    )

    const clinic = { diagnosticAids: {} }
    overlayClinicDiagnosticAids(clinic, index, ['clinic-1'])
    assert.equal(clinic.diagnosticAids['aid-gemini'].payload.driveFileId, 'drive-file-1')

    const other = { diagnosticAids: {} }
    overlayClinicDiagnosticAids(other, index, ['otra-clinica'])
    assert.equal(other.diagnosticAids['aid-gemini'], undefined)
  } finally {
    setDiagnosticAidIndexPathForTests(null)
    await rm(dir, { recursive: true, force: true })
  }
})

test('un meta más nuevo conserva el driveFileId; un borrado reciente no se revive', () => {
  const index = {
    clinics: {
      'clinic-1': {
        'aid-1': {
          syncId: 'aid-1',
          clinicId: 'clinic-1',
          updatedAt: '2026-11-18T20:46:00.000Z',
          deletedAt: null,
          payload: {
            id: 'aid-1',
            driveFileId: 'drive-1',
            webViewLink: 'https://drive.google.com/file/d/drive-1/view',
            fileName: 'imagen.png',
          },
        },
      },
    },
  }
  const meta = {
    clinics: {
      'clinic-1': {
        patients: {},
        appointments: {},
        diagnosticAids: {
          'aid-1': {
            syncId: 'aid-1',
            clinicId: 'clinic-1',
            updatedAt: '2026-11-18T21:00:00.000Z',
            deletedAt: null,
            payload: { id: 'aid-1', fileName: 'imagen.png', comments: 'control' },
          },
        },
      },
    },
  }
  overlayIndexOntoMeta(meta, index)
  const kept = meta.clinics['clinic-1'].diagnosticAids['aid-1']
  assert.equal(kept.payload.comments, 'control')
  assert.equal(kept.payload.driveFileId, 'drive-1')

  const deletedMeta = {
    clinics: {
      'clinic-1': {
        diagnosticAids: {
          'aid-1': {
            syncId: 'aid-1',
            updatedAt: '2026-11-18T21:10:00.000Z',
            deletedAt: '2026-11-18T21:10:00.000Z',
            payload: { id: 'aid-1' },
          },
        },
      },
    },
  }
  overlayIndexOntoMeta(deletedMeta, index)
  assert.equal(deletedMeta.clinics['clinic-1'].diagnosticAids['aid-1'].deletedAt, '2026-11-18T21:10:00.000Z')
  assert.equal(deletedMeta.clinics['clinic-1'].diagnosticAids['aid-1'].payload.driveFileId, undefined)
})
