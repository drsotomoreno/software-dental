import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { config } from '../config.js'

const ROOT = join(config.dataDir, 'clinic-attachments')

function safeSegment(value) {
  return String(value || '').replace(/[^a-zA-Z0-9._:-]+/g, '_') || 'unknown'
}

export function attachmentFilePath(clinicId, attachmentId) {
  return join(ROOT, safeSegment(clinicId), safeSegment(attachmentId))
}

export async function writeAttachmentBytes(clinicId, attachmentId, buffer) {
  const dir = join(ROOT, safeSegment(clinicId))
  await mkdir(dir, { recursive: true })
  const filePath = join(dir, safeSegment(attachmentId))
  await writeFile(filePath, buffer)
  return filePath
}

export async function readAttachmentBytes(clinicId, attachmentId) {
  try {
    return await readFile(attachmentFilePath(clinicId, attachmentId))
  } catch {
    return null
  }
}

export function bufferToBase64(buffer) {
  if (!buffer) return ''
  return Buffer.from(buffer).toString('base64')
}

export function base64ToBuffer(base64) {
  if (!base64) return null
  try {
    const buf = Buffer.from(String(base64), 'base64')
    return buf.length > 0 ? buf : null
  } catch {
    return null
  }
}
