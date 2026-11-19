import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

process.env.DATABASE_URL = ''

const dataDir = join(tmpdir(), `clinic-sync-test-${Date.now()}`)
await mkdir(dataDir, { recursive: true })
process.env.NODE_ENV = 'test'

const { config } = await import('../server/config.js')
config.dataDir = dataDir

const {
  findClinicAttachment,
  pullClinicSnapshot,
  pushClinicSnapshot,
} = await import('../server/services/clinicalSyncStore.js')

const clinicId = 'clinic:test-tenant'
const now = new Date().toISOString()
const aidId = 'aid-stl-1'
const fileHash = 'abc123hash'

const pushed = await pushClinicSnapshot(clinicId, {
  patients: [
    {
      syncId: 'patient-1',
      updatedAt: now,
      payload: { documentNumber: '123', firstName: 'Ana', lastName: 'Pérez' },
    },
  ],
  diagnosticAids: [
    {
      syncId: aidId,
      updatedAt: now,
      payload: {
        id: aidId,
        patientId: 'patient-1',
        encounterId: 'evo-9',
        fileName: 'scan.stl',
        fileHash,
        fileType: 'STL',
      },
    },
  ],
  sync_queue: [
    {
      syncId: aidId,
      updatedAt: now,
      payload: {
        id: aidId,
        aidId,
        patientId: 'patient-1',
        encounterId: 'evo-9',
        fileName: 'scan.stl',
        fileHash,
        entityType: 'diagnostic_aid',
        dataBase64: Buffer.from('solid test').toString('base64'),
      },
    },
  ],
})

if (!pushed.accepted.sync_queue) {
  throw new Error(`sync_queue no se aceptó: ${JSON.stringify(pushed.accepted)}`)
}

const snapshot = await pullClinicSnapshot(clinicId, [], { includeBlobs: true })
if (snapshot.patients.length !== 1) throw new Error('pull no devolvió pacientes')
if (snapshot.attachments.length < 1) throw new Error('pull no devolvió adjuntos')
if (snapshot.attachments[0]?.payload?.dataBase64) {
  throw new Error('el listado full=1 no debe embeber dataBase64 (OOM JsonStringify)')
}
if (snapshot.attachments[0]?.payload?.fileHash !== fileHash) {
  throw new Error('el listado perdió el hash del adjunto')
}

const byHash = await findClinicAttachment(clinicId, { fileHash, patientId: 'patient-1', encounterId: 'evo-9' })
if (!byHash?.payload?.fileHash) throw new Error('no se encontró el adjunto por paciente/evolución/hash')
if (byHash.payload.dataBase64) throw new Error('el binario no vive en el JSON de la clínica')

const aliasId = 'legacy-clinic-key'
const aliasAid = 'aid-stl-alias'
await pushClinicSnapshot(aliasId, {
  sync_queue: [
    {
      syncId: aliasAid,
      updatedAt: now,
      payload: {
        id: aliasAid,
        aidId: aliasAid,
        patientId: 'patient-1',
        encounterId: 'evo-9',
        fileName: 'scan-alias.stl',
        fileHash: 'alias-hash',
        entityType: 'diagnostic_aid',
        dataBase64: Buffer.from('solid alias').toString('base64'),
      },
    },
  ],
})

const aliased = await pullClinicSnapshot(clinicId, [aliasId], { includeBlobs: true })
const aliasBlob = aliased.attachments.concat(aliased.sync_queue).find((row) => {
  const payload = row?.payload || {}
  return payload.aidId === aliasAid || row.syncId === aliasAid
})
if (aliasBlob?.payload?.dataBase64) {
  throw new Error('el pull de alias no debe hidratar base64 en el listado')
}
if (!aliasBlob) throw new Error('el pull no encontró el adjunto guardado en un alias de clínica')

const byAliasHash = await findClinicAttachment(clinicId, { fileHash: 'alias-hash' }, [aliasId])
if (!byAliasHash?.payload?.fileName) {
  throw new Error('findClinicAttachment no resolvió el metadato del alias')
}

const light = await pullClinicSnapshot(clinicId, [], { includeBlobs: false })
if (light.attachments[0]?.payload?.dataBase64) throw new Error('el pull ligero no debe incluir blobs')

await rm(dataDir, { recursive: true, force: true })
console.log('ok clinic snapshot pull/push attachments', pushed.accepted)
