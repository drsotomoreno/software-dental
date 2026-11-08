import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const socketSrc = readFileSync(join(root, 'server/socket/kioskSocket.js'), 'utf8')
const routesSrc = readFileSync(join(root, 'server/routes/kiosk.routes.js'), 'utf8')
const clientSrc = readFileSync(join(root, 'src/kiosk/kioskSocketClient.ts'), 'utf8')

test('el ack de submit_signature no reenvía la PNG (evita operation has timed out)', () => {
  assert.match(socketSrc, /signatureBase64:\s*''/)
  assert.match(socketSrc, /maxHttpBufferSize:\s*12\s*\*\s*1024\s*\*\s*1024/)
  const ackIdx = socketSrc.indexOf("signatureBase64: ''")
  const emitIdx = socketSrc.indexOf("io.to(room).emit('kiosk:signature_received'")
  assert.ok(ackIdx > 0 && emitIdx > ackIdx, 'el ack liviano debe ir antes del broadcast con la firma')
})

test('existe respaldo HTTP /api/v1/kiosk/signature', () => {
  assert.match(routesSrc, /\/signature/)
  assert.match(routesSrc, /createKioskSignature/)
  assert.match(clientSrc, /\/api\/v1\/kiosk\/signature/)
  assert.match(clientSrc, /compressSignatureDataUrl/)
})
