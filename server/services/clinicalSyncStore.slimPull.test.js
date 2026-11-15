import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

test('pullClinicSnapshot: full=0/slim no serializa clinicalRecords/drafts', async () => {
  const src = await readFile(join(here, 'clinicalSyncStore.js'), 'utf8')
  assert.match(src, /Metadata-only: lee índice liviano/)
  assert.match(src, /clinical-sync-meta\.json/)
  assert.match(src, /slim:\s*true/)
  assert.match(src, /Drafts \(~31MB\) no van por HTTP/)
  // Caché por mtime para no re-parsear 83MB
  assert.match(src, /storeCache/)
  assert.match(src, /metaCache/)
  assert.match(src, /invalidateStoreCache/)
  assert.match(src, /mtimeMs/)
})

test('build-clinical-sync-meta.cjs genera índice patients+appointments', async () => {
  const src = await readFile(join(here, '../../scripts/build-clinical-sync-meta.cjs'), 'utf8')
  assert.match(src, /clinical-sync-meta\.json/)
  assert.match(src, /patients/)
  assert.match(src, /appointments/)
  assert.doesNotMatch(src, /writeFileSync\(syncPath/)
})

test('GET /api/sync/pull default full=0 (no blobs) y marca slim', async () => {
  const src = await readFile(join(here, '../routes/clinicalSync.routes.js'), 'utf8')
  assert.match(src, /booleanQuery\(req\.query\?\.includeBlobs \?\? req\.query\?\.full, false\)/)
  assert.match(src, /slim: snapshot\.slim === true/)
  assert.match(src, /const slim = !includeBlobs/)
})
