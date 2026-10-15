import assert from 'node:assert/strict'
import test from 'node:test'
import {
  leerEstadoMuv,
  leerResultadoValidacion,
  mensajesResultadoValidacion,
  textoCorreccionRips,
} from './estadoRipsCuv.ts'

test('traduce RVC091 y el detalle guardado por el mapper', () => {
  assert.deepEqual(mensajesResultadoValidacion([{ Clase: 'RECHAZADO', Codigo: 'RVC091' }]), [
    'Rechazado por regla RVC091: el valor pagado por el paciente no puede ser 0.',
  ])
  assert.deepEqual(
    mensajesResultadoValidacion({
      error: 'RVC091: vrServicio no puede ser 0, null ni indefinido.',
      field: 'vrServicio',
    }),
    ['Rechazado por regla RVC091: el valor pagado por el paciente no puede ser 0.'],
  )
})

test('lee estado_muv y traduce una fecha inválida', () => {
  assert.equal(leerEstadoMuv({ estado_muv: 'rechazado' }), 'RECHAZADO')
  assert.equal(leerEstadoMuv({ estadoMuv: 'APROBADO' }), 'APROBADO')
  assert.equal(leerEstadoMuv({ estado_muv: 'otro' }), null)
  assert.deepEqual(
    leerResultadoValidacion({ resultado_validacion: [{ Codigo: 'RVG01' }] }),
    [{ Codigo: 'RVG01' }],
  )
  assert.deepEqual(
    mensajesResultadoValidacion({
      error: 'fechaInicioAtencion no se pudo interpretar: ayer',
      field: 'fechaInicioAtencion',
    }),
    ['Rechazado: la fecha de inicio de la atención no es válida.'],
  )
  assert.deepEqual(
    mensajesResultadoValidacion('{"field":"vrServicio","error":"vrServicio es 0"}'),
    ['Rechazado por regla RVC091: el valor pagado por el paciente no puede ser 0.'],
  )
})

test('explica la corrección sin el código de la regla', () => {
  assert.equal(
    textoCorreccionRips([{ Clase: 'RECHAZADO', Codigo: 'RVC091' }]),
    'El valor pagado por el paciente no puede ser 0.',
  )
  assert.equal(
    textoCorreccionRips(null),
    'No recibimos el detalle. Revise los datos de la atención y vuelva a enviarla.',
  )
  assert.equal(
    textoCorreccionRips([
      { Clase: 'RECHAZADO', Codigo: 'OTRO1', Descripcion: 'El CUPS no existe.' },
    ]),
    'El CUPS no existe.',
  )
})

test('conserva otras reglas y un rechazo sin detalle', () => {
  assert.deepEqual(
    mensajesResultadoValidacion([
      { Clase: 'RECHAZADO', Codigo: 'OTRO1', Descripcion: 'El CUPS no existe.' },
    ]),
    ['Rechazado por regla OTRO1: El CUPS no existe.'],
  )
  assert.deepEqual(mensajesResultadoValidacion(null), [
    'El MUV rechazó el RIPS de esta atención.',
  ])
})
