import assert from 'node:assert/strict'
import test from 'node:test'
import { renderAcuerdoVoluntadesXml } from './acuerdoVoluntades.js'
import { suggestFevSector } from './suggestSector.js'
import { hasBlockingFevRipsErrors, validateFevRipsSchemas } from './validateFevRipsSchemas.js'

const CUCON = 'a'.repeat(64)

function ripsWith(usuarioExtra = {}, servicios = {}) {
  return {
    numDocumentoIdObligado: '900123456',
    numFactura: 'FV1',
    usuarios: [
      {
        tipoUsuario: '01',
        servicios: {
          consultas: [
            {
              codConsulta: '890203',
              conceptoRecaudo: '05',
              valorPagoModerador: 0,
            },
          ],
          procedimientos: [],
          otrosServicios: [],
          recienNacidos: [],
          medicamentos: [],
          ...servicios,
        },
        ...usuarioExtra,
      },
    ],
  }
}

test('RVC058 acepta 400 g y 6000 g y rechaza los extremos anteriores', () => {
  for (const peso of [400, 6000, 3200]) {
    const issues = validateFevRipsSchemas({
      rips: ripsWith({}, {
        consultas: [],
        recienNacidos: [{ peso, edadGestacional: 38 }],
      }),
    })
    assert.equal(issues.some((item) => item.code === 'RVC058'), false, String(peso))
  }

  for (const peso of [399, 6001, 3]) {
    const issues = validateFevRipsSchemas({
      rips: ripsWith({}, {
        consultas: [],
        recienNacidos: [{ peso, edadGestacional: 38 }],
      }),
    })
    assert.equal(issues.some((item) => item.code === 'RVC058' && item.level === 'error'), true, String(peso))
  }
})

test('RVC024 exige CUPS en traslado y acepta la prescripción MIPRES en complementarios', () => {
  const traslado = validateFevRipsSchemas({
    rips: ripsWith({}, {
      consultas: [],
      otrosServicios: [{ tipoOS: '02', codTecnologiaSalud: 'MIPRES-1', idMIPRES: null }],
    }),
  })
  assert.equal(traslado.some((item) => item.code === 'RVC024' && item.level === 'error'), true)

  const mipres = validateFevRipsSchemas({
    rips: ripsWith({}, {
      consultas: [],
      otrosServicios: [{
        tipoOS: '04',
        codTecnologiaSalud: 'T2387G',
        idMIPRES: '1034284847',
        numAutorizacion: '12345678901234567890',
      }],
    }),
  })
  assert.equal(hasBlockingFevRipsErrors(mipres.filter((item) => item.code === 'RVC024' || item.code === 'RVC025')), false)

  const reporte = validateFevRipsSchemas({
    rips: ripsWith({}, {
      consultas: [],
      otrosServicios: [{
        tipoOS: '04',
        codTecnologiaSalud: 'T2387G',
        idMIPRES: '1'.repeat(20),
      }],
    }),
  })
  assert.equal(reporte.some((item) => item.code === 'RVC024' && item.field.endsWith('idMIPRES')), true)
})

test('la matriz rechaza cobertura 01, cuota moderadora subsidiada y anticipo en el JSON', () => {
  const inactiva = validateFevRipsSchemas({
    rips: ripsWith(),
    fev: { coberturaPlanBeneficios: '01', modalidadPago: '04' },
    enforceCrossMatrix: true,
  })
  assert.equal(inactiva.some((item) => item.code === 'CIN005'), true)

  const contributivo = validateFevRipsSchemas({
    rips: ripsWith(),
    fev: { coberturaPlanBeneficios: '16', modalidadPago: '04' },
    enforceCrossMatrix: true,
  })
  assert.equal(hasBlockingFevRipsErrors(contributivo), false)

  const subsidiado = validateFevRipsSchemas({
    rips: ripsWith({ tipoUsuario: '04' }, {
      consultas: [{ codConsulta: '890203', conceptoRecaudo: '02', valorPagoModerador: 5000 }],
    }),
    fev: { coberturaPlanBeneficios: '17', modalidadPago: '04' },
    enforceCrossMatrix: true,
  })
  assert.equal(subsidiado.some((item) => item.code === 'CIN006'), true)

  const adres = validateFevRipsSchemas({
    rips: ripsWith({ tipoUsuario: '14' }, {
      consultas: [{ codConsulta: '890703', conceptoRecaudo: '05', valorPagoModerador: 0 }],
    }),
    fev: { coberturaPlanBeneficios: '6', modalidadPago: '01' },
    enforceCrossMatrix: true,
  })
  assert.equal(hasBlockingFevRipsErrors(adres), false)

  const anticipo = validateFevRipsSchemas({
    rips: ripsWith({}, {
      consultas: [{ codConsulta: '890203', conceptoRecaudo: '04', valorPagoModerador: 0 }],
    }),
    fev: { coberturaPlanBeneficios: '16', modalidadPago: '04' },
    enforceCrossMatrix: true,
  })
  assert.equal(anticipo.some((item) => item.code === 'CIN006'), true)
})

test('CUCON ausente no bloquea y un hash inválido sí', () => {
  const pendiente = validateFevRipsSchemas({
    rips: ripsWith(),
    checkAcuerdo: true,
  })
  assert.equal(pendiente.some((item) => item.code === 'CUCON' && item.level === 'warning'), true)
  assert.equal(hasBlockingFevRipsErrors(pendiente), false)

  const malFormado = validateFevRipsSchemas({
    rips: ripsWith(),
    fev: { acuerdoVoluntades: { cucon: 'contrato-123' } },
  })
  assert.equal(malFormado.some((item) => item.code === 'CUCON' && item.level === 'error'), true)

  const xml = renderAcuerdoVoluntadesXml(
    { cucon: CUCON, numeroPoliza: 'SOAT-1' },
    { modalidadPago: '04', coberturaPlanBeneficios: '16' },
  )
  assert.match(xml, new RegExp(`<salud:NumeroContrato>${CUCON}</salud:NumeroContrato>`))
  assert.match(xml, /<salud:ModalidadPago>04<\/salud:ModalidadPago>/)
  assert.equal(renderAcuerdoVoluntadesXml({ cucon: 'corto' }).includes('NumeroContrato'), false)
})

test('la sugerencia de sector usa coberturas 16 y 17', () => {
  assert.equal(suggestFevSector('contributivo').coberturaPlanBeneficios, '16')
  assert.equal(suggestFevSector('subsidiado').tipoUsuario, '04')
  assert.equal(suggestFevSector('particular').coberturaPlanBeneficios, '15')
  assert.notEqual(suggestFevSector('contributivo').coberturaPlanBeneficios, '01')
})
