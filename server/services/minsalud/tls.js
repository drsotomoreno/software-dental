import https from 'node:https'
import { MinsaludAuthConfigError } from './errors.js'

/**
 * @param {string} value
 */
function decodePem(value) {
  if (!value) return ''
  return value.includes('\\n') ? value.replace(/\\n/g, '\n') : value
}

/**
 * @param {{ cert?: string, key?: string, ca?: string, certPath?: string, keyPath?: string, caPath?: string }} tls
 * @param {(path: string) => string} readFile
 * @param {'cert' | 'key' | 'ca'} kind
 */
function loadMaterial(tls, readFile, kind) {
  const pathKey = `${kind}Path`
  const path = tls[pathKey]
  if (path) {
    try {
      return readFile(path)
    } catch (cause) {
      throw new MinsaludAuthConfigError(
        `No se pudo leer el material TLS «${kind}» de MinSalud.`,
        cause instanceof Error ? cause.message : undefined,
      )
    }
  }
  return decodePem(tls[kind] ?? '')
}

/**
 * Agent HTTPS con mTLS o CA propia. `null` cuando basta el almacén del sistema.
 *
 * @param {import('./settings.js').readMinsaludAuthSettings extends Function ? ReturnType<import('./settings.js').readMinsaludAuthSettings>['tls'] : never} tls
 * @param {(path: string) => string} [readFile]
 */
export function createTlsAgent(tls, readFile = (path) => {
  throw new MinsaludAuthConfigError(`No hay lector de archivos para ${path}.`)
}) {
  const cert = loadMaterial(tls, readFile, 'cert')
  const key = loadMaterial(tls, readFile, 'key')
  const ca = loadMaterial(tls, readFile, 'ca')

  if (Boolean(cert) !== Boolean(key)) {
    throw new MinsaludAuthConfigError(
      'El certificado de cliente y su llave privada deben configurarse juntos (MINSALUD_TLS_CERT y MINSALUD_TLS_KEY, o sus rutas).',
    )
  }

  const custom = Boolean(cert || ca || tls.rejectUnauthorized === false)
  if (!custom) return null

  return new https.Agent({
    keepAlive: true,
    cert: cert || undefined,
    key: key || undefined,
    ca: ca || undefined,
    passphrase: tls.passphrase || undefined,
    rejectUnauthorized: tls.rejectUnauthorized !== false,
  })
}
