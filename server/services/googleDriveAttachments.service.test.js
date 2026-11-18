import assert from 'node:assert/strict'
import test from 'node:test'
import {
  GoogleDriveRequiredError,
  clearDriveFolderCache,
  findFileByAidId,
  isGoogleDriveRequiredError,
  selectExistingAidUpload,
} from './googleDriveAttachments.service.js'
import { base64ToBuffer, bufferToBase64 } from './clinicAttachmentStore.js'

test('GoogleDriveRequiredError expone code google_drive_required y status 428', () => {
  const err = new GoogleDriveRequiredError()
  assert.equal(err.code, 'google_drive_required')
  assert.equal(err.status, 428)
  assert.equal(isGoogleDriveRequiredError(err), true)
  assert.equal(isGoogleDriveRequiredError({ code: 'DRIVE_NOT_CONNECTED' }), true)
})

test('bufferToBase64 / base64ToBuffer redondean sin disco local', () => {
  const buf = Buffer.from('radiografia-demo')
  const b64 = bufferToBase64(buf)
  assert.equal(Buffer.compare(base64ToBuffer(b64), buf), 0)
})

test('clearDriveFolderCache no lanza', () => {
  clearDriveFolderCache()
})

test('aidId con bytes se reutiliza y no pide files.create', () => {
  const decision = selectExistingAidUpload([
    { id: 'vacio', size: '0' },
    { id: 'listo', size: '4096', webViewLink: 'https://drive.google.com/file/d/listo/view' },
  ])
  assert.equal(decision.action, 'reuse')
  assert.equal(decision.file.id, 'listo')
})

test('aidId en archivo vacío se actualiza en el mismo fileId', () => {
  const decision = selectExistingAidUpload([{ id: 'vacio', size: '0' }])
  assert.equal(decision.action, 'update')
  assert.equal(decision.file.id, 'vacio')
})

test('sin coincidencia el upload crea el archivo', () => {
  assert.equal(selectExistingAidUpload([]).action, 'create')
})

test('findFileByAidId consulta appProperties y no crea otro archivo', async () => {
  let created = 0
  const drive = {
    files: {
      list: async ({ q }) => {
        assert.match(q, /key='aidId'/)
        assert.match(q, /eada73bb/)
        assert.match(q, /trashed = false/)
        return {
          data: {
            files: [{ id: 'file-1', size: '40', webViewLink: 'https://drive.example/file-1' }],
          },
        }
      },
      create: async () => {
        created += 1
        return { data: { id: 'nuevo' } }
      },
    },
  }
  const decision = await findFileByAidId(drive, 'eada73bb')
  assert.equal(decision.action, 'reuse')
  assert.equal(decision.file.id, 'file-1')
  assert.equal(created, 0)
})
