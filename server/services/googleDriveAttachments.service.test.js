import assert from 'node:assert/strict'
import test from 'node:test'
import {
  GoogleDriveRequiredError,
  clearDriveFolderCache,
  isGoogleDriveRequiredError,
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
