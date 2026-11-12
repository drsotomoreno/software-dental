import assert from 'node:assert/strict'
import test from 'node:test'

test('frontendRedirectAfterOAuth en producción siempre usa www', async () => {
  const prevNode = process.env.NODE_ENV
  const prevRender = process.env.RENDER
  const prevApp = process.env.APP_PUBLIC_URL
  process.env.NODE_ENV = 'production'
  process.env.RENDER = 'true'
  process.env.APP_PUBLIC_URL = 'https://mihistoriadental.com'
  try {
    const { frontendRedirectAfterOAuth } = await import(
      `./googleDriveOAuth.service.js?prod=${Date.now()}`
    )
    const url = frontendRedirectAfterOAuth({ ok: true })
    assert.equal(url, 'https://www.mihistoriadental.com/perfil?googleDrive=connected')
    const errUrl = frontendRedirectAfterOAuth({ ok: false, errorCode: 'x' })
    assert.match(errUrl, /^https:\/\/www\.mihistoriadental\.com\/perfil\?googleDrive=error/)
  } finally {
    process.env.NODE_ENV = prevNode
    if (prevRender === undefined) delete process.env.RENDER
    else process.env.RENDER = prevRender
    if (prevApp === undefined) delete process.env.APP_PUBLIC_URL
    else process.env.APP_PUBLIC_URL = prevApp
  }
})
