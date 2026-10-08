import assert from 'node:assert/strict'
import test from 'node:test'
import { mensajesResultadoValidacion } from './estadoRipsCuv.ts'

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
