import http from 'node:http'
import https from 'node:https'

/**
 * @param {object} options
 * @param {string} options.url
 * @param {string} options.method
 * @param {Record<string, string>} [options.headers]
 * @param {string} [options.body]
 * @param {https.Agent | undefined} [options.agent]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{ status: number, headers: http.IncomingHttpHeaders, text: string }>}
 */
export function minsaludRequest(options) {
  const target = new URL(options.url)
  const transport = target.protocol === 'https:' ? https : http
  const body = options.body ?? ''
  const headers = {
    Accept: 'application/json',
    ...options.headers,
  }
  if (body) headers['Content-Length'] = String(Buffer.byteLength(body))

  return new Promise((resolve, reject) => {
    const req = transport.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || undefined,
        path: `${target.pathname}${target.search}`,
        method: options.method,
        headers,
        agent: target.protocol === 'https:' ? options.agent : undefined,
      },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            text: Buffer.concat(chunks).toString('utf8'),
          })
        })
      },
    )

    if (options.timeoutMs) {
      req.setTimeout(options.timeoutMs, () => {
        const error = new Error('Timeout')
        error.name = 'TimeoutError'
        error.code = 'ETIMEDOUT'
        req.destroy(error)
      })
    }

    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}
