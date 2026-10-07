import { createHash, randomBytes, randomUUID } from 'node:crypto'

/**
 * @param {string} xml
 * @param {string | null | undefined} guid
 */
export function identifyXml(xml, guid) {
  const bytes = Buffer.from(xml, 'utf8')
  return {
    guid: guid || randomUUID(),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes,
  }
}

/**
 * @param {Buffer} bytes
 * @param {number} fragmentBytes
 */
export function splitBytes(bytes, fragmentBytes) {
  if (fragmentBytes <= 0 || bytes.length <= fragmentBytes) {
    return [bytes]
  }
  const parts = []
  for (let offset = 0; offset < bytes.length; offset += fragmentBytes) {
    parts.push(bytes.subarray(offset, offset + fragmentBytes))
  }
  return parts
}

/**
 * @param {Record<string, string | number | null | undefined>} fields
 * @param {{ filename: string, bytes: Buffer }} file
 */
export function encodeMultipart(fields, file) {
  const boundary = `fevcd${randomBytes(8).toString('hex')}`
  const chunks = []
  for (const [name, value] of Object.entries(fields)) {
    if (value == null || value === '') continue
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    ))
  }
  chunks.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="archivo"; filename="${file.filename}"\r\nContent-Type: application/xml\r\n\r\n`,
  ))
  chunks.push(file.bytes)
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`))
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  }
}
