/**
 * Prueba rápida del Motor RIPS mock.
 * Uso: node scripts/test-rips-transmitir.mjs
 *
 * 1) POST válido (CUPS de odontología general, subcategoría .03)
 * 2) POST inválido (NIT fiscal en codigoHabilitacionREPS)
 */
const URL = process.env.RIPS_TRANSMITIR_URL ?? 'http://localhost:3000/api/rips/transmitir'

const payloadValido = {
  codigoHabilitacionREPS: '680010389801',
  identificacionPaciente: '1234567890',
  codigoDiagnosticoPrincipal: 'K021',
  codigoProcedimientoCUPS: '890203',
  valorConsulta: 0,
  finalidadConsulta: 11,
}

const payloadInvalido = {
  ...payloadValido,
  codigoHabilitacionREPS: '900123456',
}

async function postRips(label, payload) {
  console.log('\n========================================')
  console.log(label)
  console.log('POST', URL)
  console.log('Body:', JSON.stringify(payload, null, 2))

  const started = Date.now()
  const response = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  })
  const elapsedMs = Date.now() - started
  const text = await response.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }

  console.log(`HTTP ${response.status} (${elapsedMs} ms)`)
  console.log('Respuesta:', typeof body === 'string' ? body : JSON.stringify(body, null, 2))
  return { status: response.status, body }
}

try {
  await postRips('1) JSON válido — CUPS odontología general (.03)', payloadValido)
  await postRips('2) Error intencional — NIT en lugar de REPS de 12 dígitos', payloadInvalido)
} catch (error) {
  console.error('\nNo se pudo contactar el servidor:', error.message)
  console.error('¿Está corriendo en http://localhost:3000 ?')
  process.exit(1)
}
