import assert from 'node:assert/strict'
import test from 'node:test'
import {
  armarPaqueteDocumentoCobro,
  asignarValorNetoPorCodigo,
  clasificarGrupoRips,
  esCupsConsulta,
} from './paqueteDocumentoCobro.ts'

const LINEAS = [
  {
    id: 'consulta',
    descripcion: 'Consulta de primera vez',
    cupsCode: '890201',
    cantidad: 1,
    valorNeto: 50000,
  },
  {
    id: 'resina',
    descripcion: 'Restauración de resina',
    cupsCode: '232101',
    cantidad: 1,
    valorNeto: 150000,
  },
  {
    id: 'profilaxis',
    descripcion: 'Profilaxis',
    cupsCode: '997103',
    cantidad: 1,
    valorNeto: 80000,
  },
]

test('varios procedimientos comparten un solo número y la suma RIPS iguala la FEV', () => {
  const { paquete, regla } = armarPaqueteDocumentoCobro({
    tipo: 'FEV',
    numero: 'FV-280',
    lineas: LINEAS,
    valorNetoDocumento: 280000,
  })

  assert.equal(regla.ok, true)
  assert.equal(regla.valorNetoDocumento, 280000)
  assert.equal(regla.valorNetoRips, 280000)
  assert.equal(paquete.numero, 'FV-280')
  assert.equal(paquete.consultas.length, 1)
  assert.equal(paquete.consultas[0].cupsCode, '890201')
  assert.equal(paquete.consultas[0].valorNeto, 50000)
  assert.equal(paquete.consultas[0].numeroDocumento, 'FV-280')
  assert.equal(paquete.procedimientos.length, 2)
  assert.deepEqual(
    paquete.procedimientos.map((item) => [item.cupsCode, item.valorNeto, item.consecutivo, item.numeroDocumento]),
    [
      ['232101', 150000, 1, 'FV-280'],
      ['997103', 80000, 2, 'FV-280'],
    ],
  )
  assert.equal(paquete.otrosServicios.length, 0)
})

test('el mismo paquete cabe en un recibo de caja y el MUV rechaza un peso de diferencia', () => {
  const recibido = armarPaqueteDocumentoCobro({
    tipo: 'RECIBO_CAJA',
    numero: 'RC-12',
    lineas: LINEAS,
  })
  assert.equal(recibido.regla.ok, true)
  assert.equal(recibido.paquete.consultas[0].numeroDocumento, 'RC-12')
  assert.equal(recibido.paquete.procedimientos[1].numeroDocumento, 'RC-12')

  const descuadre = armarPaqueteDocumentoCobro({
    tipo: 'FEV',
    numero: 'FV-280',
    lineas: LINEAS,
    valorNetoDocumento: 280001,
  })
  assert.equal(descuadre.regla.ok, false)
  assert.equal(descuadre.regla.diferencia, 1)
  assert.match(descuadre.regla.message, /exactamente igual/)
  assert.match(descuadre.regla.message, /280000/)
  assert.match(descuadre.regla.message, /280001/)
})

test('un agrupador en cero cuadra cuando cada valor neto es cero', () => {
  const cero = armarPaqueteDocumentoCobro({
    tipo: 'RECIBO_CAJA',
    numero: 'CTRL-050',
    valorNetoDocumento: 0,
    lineas: LINEAS.map((linea) => ({ ...linea, valorNeto: 0 })),
  })
  assert.equal(cero.regla.ok, true)
  assert.equal(cero.regla.valorNetoDocumento, 0)
  assert.equal(cero.regla.valorNetoRips, 0)
  assert.equal(cero.paquete.consultas[0].valorNeto, 0)

  const descuadre = armarPaqueteDocumentoCobro({
    tipo: 'RECIBO_CAJA',
    numero: 'CTRL-050',
    valorNetoDocumento: 0,
    lineas: LINEAS,
  })
  assert.equal(descuadre.regla.ok, false)
  assert.match(descuadre.regla.message, /CTRL-050/)
})

test('la consulta va a consultas y el control mecánico de ortodoncia sigue siendo procedimiento', () => {
  assert.equal(esCupsConsulta('890201'), true)
  assert.equal(esCupsConsulta('89.0.2.03'), true)
  assert.equal(esCupsConsulta('893106'), false)
  assert.equal(clasificarGrupoRips({ cupsCode: '890201' }), 'consultas')
  assert.equal(clasificarGrupoRips({ cupsCode: '232101' }), 'procedimientos')
  assert.equal(clasificarGrupoRips({ cupsCode: '893106' }), 'procedimientos')
  assert.equal(
    clasificarGrupoRips({ cupsCode: null, esPersonalizado: true }),
    'otrosServicios',
  )
})

test('cada CUPS conserva su propio valor neto cuando el catálogo lo trae', () => {
  const mapa = new Map([
    ['890201', 50000],
    ['232101', 150000],
    ['997103', 80000],
  ])
  assert.deepEqual(
    asignarValorNetoPorCodigo(['890201', '232101', '997103'], mapa, 280000),
    [50000, 150000, 80000],
  )
})
