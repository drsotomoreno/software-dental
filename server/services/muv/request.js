import { gzipSync } from 'node:zlib'

/**
 * Cuerpo oficial de CargarFevRips (Manual FEVRM001 v4.3).
 * El XML es el AttachedDocument de la FEV, en Base64.
 *
 * @param {{ rips: object, xmlFev?: string, xmlFevFile?: string }} params
 */
export function buildCargarFevRipsBody({ rips, xmlFev, xmlFevFile }) {
  const encodedXml = String(xmlFevFile ?? '').trim()
    || (xmlFev ? Buffer.from(xmlFev, 'utf8').toString('base64') : '')

  return {
    rips,
    xmlFevFile: encodedXml,
  }
}

/**
 * El método documentado envía el JSON con Content-Encoding: gzip.
 * `gzip: false` deja el JSON plano para un gateway que no descomprime.
 *
 * @param {object} body
 * @param {{ gzip?: boolean }} [options]
 */
export function encodeCargarFevRipsRequest(body, options = {}) {
  const json = Buffer.from(JSON.stringify(body))
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }

  if (options.gzip === false) {
    return { body: json, headers, compressed: false, jsonBytes: json.length }
  }

  headers['Content-Encoding'] = 'gzip'
  const compressed = gzipSync(json)
  return { body: compressed, headers, compressed: true, jsonBytes: json.length }
}
