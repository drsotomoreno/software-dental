import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clasificarRadicacionRips,
  cufeDeAtenciones,
  explicarFalloCuv,
  textoFalloDeRed,
  ripsParaRadicar,
  textoRadicacionExitosa,
  vinculosDeAtenciones,
} from './ripsRadicacion.ts'

test('un recibo estándar se radica sin factura ante el Ministerio', () => {
  const clasificacion = clasificarRadicacionRips({
    vinculaciones: ['recibo_interno'],
    cufe: '',
  })
  assert.equal(clasificacion.canal, 'sin_factura')
  assert.equal(clasificacion.listo, true)
  assert.equal(ripsParaRadicar({ numFactura: 'FV20261027106893', usuarios: [] }, 'sin_factura').numFactura, null)
})

test('sin vínculo de factura también es RIPS sin factura', () => {
  const clasificacion = clasificarRadicacionRips({ vinculaciones: [], cufe: null })
  assert.equal(clasificacion.canal, 'sin_factura')
  assert.equal(clasificacion.listo, true)
})

test('la factura electrónica con CUFE va como paquete FEV', () => {
  const clasificacion = clasificarRadicacionRips({
    vinculaciones: ['fev'],
    cufe: 'CUFE-DIAN-1',
  })
  assert.equal(clasificacion.canal, 'fev')
  assert.equal(clasificacion.listo, true)
  assert.equal(
    ripsParaRadicar({ numFactura: 'FV1', usuarios: [] }, 'fev').numFactura,
    'FV1',
  )
})

test('una FEV sin CUFE no se radica todavía', () => {
  const clasificacion = clasificarRadicacionRips({ vinculaciones: ['fev'] })
  assert.equal(clasificacion.listo, false)
  assert.match(clasificacion.motivo, /CUFE/)
})

test('no mezcla recibo y factura electrónica en el mismo envío', () => {
  const clasificacion = clasificarRadicacionRips({
    vinculaciones: ['recibo_interno', 'fev'],
    cufe: 'CUFE-1',
  })
  assert.equal(clasificacion.listo, false)
})

test('lee el vínculo y el CUFE desde la atención', () => {
  const records = [
    {
      evolutionNotes: [{ id: 'evo-1', ripsMetadata: { tipoVinculacionFinanciera: 'recibo_interno' } }],
      paymentControl: [{ documentKind: 'recibo_interno', cufe: '' }],
    },
  ]
  assert.deepEqual(vinculosDeAtenciones(records), ['recibo_interno', 'recibo_interno'])
  assert.equal(cufeDeAtenciones(records, [{ cufe: '  ' }, { cufe: 'CUFE-9' }]), 'CUFE-9')
})

test('fetch failed no se muestra tal cual', () => {
  const fallo = explicarFalloCuv({ error: 'fetch failed', localIssues: [], ministryErrors: [] })
  assert.equal(fallo.kind, 'infra')
  assert.equal(fallo.message.includes('fetch failed'), false)
  assert.match(fallo.message, /No se pudo contactar el MUV/)
  assert.equal(textoFalloDeRed('Failed to fetch').includes('Failed to fetch'), false)
})

test('un fallo de red no se presenta como rechazo del Ministerio', () => {
  const fallo = explicarFalloCuv({
    error: 'No se pudo contactar el MUV.',
    localIssues: [],
    ministryErrors: [],
  })
  assert.equal(fallo.kind, 'infra')
  assert.equal(fallo.message, 'No se pudo contactar el MUV.')
  assert.equal(fallo.message.includes('rechazó'), false)
})

test('el rechazo del Ministerio solo se anuncia si hay errores de campo', () => {
  assert.equal(
    explicarFalloCuv({
      ministryErrors: [{ message: 'CIE-10 inválido' }],
    }).kind,
    'ministry',
  )
  assert.equal(
    explicarFalloCuv({
      localIssues: [{ level: 'error', message: 'NIT obligatorio' }],
      ministryErrors: [],
    }).kind,
    'local',
  )
})

test('el CUV de sandbox no dice que el Ministerio radicó el paquete', () => {
  const texto = textoRadicacionExitosa({
    source: 'sandbox',
    canal: 'sin_factura',
    paciente: 'nicolas andres Álvarez bayona',
  })
  assert.match(texto, /CUV de prueba/)
  assert.match(texto, /nicolas andres Álvarez bayona/)
  assert.equal(texto.includes('radicado en el Ministerio'), false)
})
