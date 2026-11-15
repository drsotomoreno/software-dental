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

test('build-clinical-sync-meta.cjs genera índice patients+appointments+diagnosticAids', async () => {
  const src = await readFile(join(here, '../../scripts/build-clinical-sync-meta.cjs'), 'utf8')
  assert.match(src, /clinical-sync-meta\.json/)
  assert.match(src, /patients/)
  assert.match(src, /appointments/)
  assert.match(src, /diagnosticAids/)
  assert.match(src, /isHeavyBinaryString/)
  assert.doesNotMatch(src, /writeFileSync\(syncPath/)
  assert.doesNotMatch(src, /dataBase64/)
})

test('GET /api/sync/pull default full=0 (no blobs) y marca slim', async () => {
  const src = await readFile(join(here, '../routes/clinicalSync.routes.js'), 'utf8')
  assert.match(src, /booleanQuery\(req\.query\?\.includeBlobs \?\? req\.query\?\.full, false\)/)
  assert.match(src, /slim: snapshot\.slim === true/)
  assert.match(src, /const slim = !includeBlobs/)
  assert.match(src, /SYNC_META_MISSING/)
})

test('slim sin meta: SyncMetaMissingError, sin fallback a clinical-sync.json en request', async () => {
  const src = await readFile(join(here, 'clinicalSyncStore.js'), 'utf8')
  assert.match(src, /async function ensureMetaStore/)
  assert.match(src, /class SyncMetaMissingError/)
  assert.match(src, /code = 'SYNC_META_MISSING'/)
  assert.match(src, /throw new SyncMetaMissingError/)
  // Rama slim de pullClinicSnapshot: meta o error; nunca loadStore en esa rama.
  const pullStart = src.indexOf('export async function pullClinicSnapshot')
  assert.ok(pullStart >= 0)
  const pullFn = src.slice(pullStart, pullStart + 4500)
  assert.match(pullFn, /if \(slim\) \{/)
  assert.match(pullFn, /const meta = await ensureMetaStore\(\)/)
  assert.match(pullFn, /throw new SyncMetaMissingError/)
  assert.match(pullFn, /diagnosticAids: listedDiagnosticAids\(clinic\)/)
  const slimStart = pullFn.indexOf('if (slim) {')
  const afterSlim = pullFn.indexOf('const store = await loadStore()', slimStart)
  assert.ok(afterSlim > slimStart)
  const slimOnly = pullFn.slice(slimStart, afterSlim)
  assert.doesNotMatch(slimOnly, /await loadStore\(/)
})

test('deploy genera meta de forma obligatoria y smoke pull multi-tenant', async () => {
  const deploy = await readFile(join(here, '../../.github/workflows/deploy.yml'), 'utf8')
  assert.match(deploy, /build-clinical-sync-meta\.cjs/)
  assert.match(deploy, /smoke-clinical-sync-pull\.cjs/)
  assert.match(deploy, /SMOKE_REQUIRE_PATIENTS/)
  assert.doesNotMatch(deploy, /WARN: meta build failed; slim pull may fallback/)
})
