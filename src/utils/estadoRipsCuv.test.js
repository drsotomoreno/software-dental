import assert from 'node:assert/strict'
import test from 'node:test'
import {
  leerEstadoMuv,
  leerResultadoValidacion,
  mensajesResultadoValidacion,
} from './estadoRipsCuv.ts'

test('traduce RVC091 y el detalle guardado por el mapper', () => {
  assert.deepEqual(mensajesResultadoValidacion([{ Clase: 'RECHAZADO', Codigo: 'RVC091' }]), [
    'El valor del servicio no se informó. En un RIPS sin factura ese valor se envía en cero.',
  ])
  assert.deepEqual(
    mensajesResultadoValidacion({
      error: 'RVC091: vrServicio no puede ser null ni indefinido.',
      field: 'vrServicio',
    }),
    ['El valor del servicio no se informó. En un RIPS sin factura ese valor se envía en cero.'],
  )
  assert.deepEqual(
    mensajesResultadoValidacion([
      {
        Clase: 'NOTIFICACION',
        Codigo: 'RVC091',
        Descripcion: 'Tener en cuenta que está informando RIPS sin una FEV en salud y no es posible incluir un valor',
      },
    ]),
    [
      'Notificación por regla RVC091: Tener en cuenta que está informando RIPS sin una FEV en salud y no es posible incluir un valor',
    ],
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
    ['El valor del servicio no se informó. En un RIPS sin factura ese valor se envía en cero.'],
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
