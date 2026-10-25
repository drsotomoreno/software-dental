import assert from 'node:assert/strict'
import test from 'node:test'
import { importOdontogramCieDiagnoses } from './odontogramDiagnosis.ts'
import {
  assignCieToTooth,
  detachTeethFromDiagnoses,
  reassignDiagnosticChartCie,
  reassignImportedDiagnosisCie,
} from './importedCieEdit.ts'

function diagnosis(overrides) {
  return {
    code: 'K02.1',
    description: 'Caries de la dentina',
    type: 'principal',
    certainty: 'impresion',
    source: 'odontograma',
    affectedTeeth: [16, 26, 36, 46],
    ...overrides,
  }
}

test('cambia el CIE de una pieza y conserva el resto', () => {
  const next = reassignImportedDiagnosisCie(
    [diagnosis()],
    {
      fromCode: 'K02.1',
      toCode: 'K04.0',
      toDescription: 'Pulpitis',
      toothNumber: 16,
    },
  )

  assert.deepEqual(
    next.map((item) => ({
      code: item.code,
      type: item.type,
      teeth: item.affectedTeeth,
      certainty: item.certainty,
    })),
    [
      {
        code: 'K02.1',
        type: 'principal',
        teeth: [26, 36, 46],
        certainty: 'impresion',
      },
      {
        code: 'K04.0',
        type: 'relacionado',
        teeth: [16],
        certainty: 'impresion',
      },
    ],
  )
})

test('la pieza que era el único diagnóstico principal conserva ese tipo', () => {
  const next = reassignImportedDiagnosisCie(
    [diagnosis({ affectedTeeth: [16] })],
    {
      fromCode: 'K02.1',
      toCode: 'K04.0',
      toDescription: 'Pulpitis',
      toothNumber: 16,
    },
  )

  assert.equal(next.length, 1)
  assert.equal(next[0].code, 'K04.0')
  assert.equal(next[0].type, 'principal')
  assert.deepEqual(next[0].affectedTeeth, [16])
  assert.equal(next[0].source, 'odontograma')
})

test('si el CIE nuevo ya existe, la pieza se suma a ese diagnóstico', () => {
  const next = reassignImportedDiagnosisCie(
    [
      diagnosis(),
      diagnosis({
        code: 'K08.8',
        description: 'Exodoncia indicada',
        type: 'relacionado',
        affectedTeeth: [38, 48],
      }),
    ],
    {
      fromCode: 'K02.1',
      toCode: 'K08.8',
      toDescription: 'Exodoncia indicada',
      toothNumber: 46,
    },
  )

  assert.deepEqual(
    next.map((item) => [item.code, item.affectedTeeth]),
    [
      ['K02.1', [16, 26, 36]],
      ['K08.8', [38, 46, 48]],
    ],
  )
})

test('cambiar el CIE de un diagnóstico sin piezas reemplaza el código y no lo reimporta', () => {
  const edited = reassignImportedDiagnosisCie(
    [
      diagnosis({
        code: 'K01.0',
        description: 'Dientes incluidos',
        type: 'relacionado',
        source: 'odontograma_suplementario',
        affectedTeeth: undefined,
      }),
    ],
    {
      fromCode: 'K01.0',
      toCode: 'K07.3',
      toDescription: 'Dientes incluidos',
    },
  )

  assert.equal(edited[0].code, 'K07.3')
  assert.deepEqual(edited[0].overridesOdontogramCodes, ['K01.0'])

  const reimported = importOdontogramCieDiagnoses(edited, [
    diagnosis({
      code: 'K01.0',
      description: 'Dientes incluidos',
      type: 'relacionado',
      source: 'odontograma_suplementario',
      affectedTeeth: undefined,
    }),
  ])

  assert.equal(reimported.added, 0)
  assert.deepEqual(
    reimported.diagnoses.map((item) => item.code),
    ['K07.3'],
  )
})

test('volver al CIE original quita la marca de reemplazo', () => {
  const edited = reassignImportedDiagnosisCie(
    [
      diagnosis({
        code: 'K07.3',
        description: 'Anomalías de la posición del diente',
        type: 'relacionado',
        source: 'odontograma_suplementario',
        affectedTeeth: undefined,
        overridesOdontogramCodes: ['K01.0'],
      }),
    ],
    {
      fromCode: 'K07.3',
      toCode: 'K01.0',
      toDescription: 'Dientes incluidos',
    },
  )

  assert.equal(edited[0].code, 'K01.0')
  assert.equal(edited[0].overridesOdontogramCodes, undefined)
})

test('la reimportación no devuelve una pieza a su CIE anterior', () => {
  const edited = reassignImportedDiagnosisCie(
    [diagnosis(), diagnosis({ code: 'K08.8', type: 'relacionado', affectedTeeth: [38] })],
    {
      fromCode: 'K02.1',
      toCode: 'K04.0',
      toDescription: 'Pulpitis',
      toothNumber: 16,
    },
  )

  const reimported = importOdontogramCieDiagnoses(edited, [
    diagnosis(),
    diagnosis({
      code: 'K02.9',
      description: 'Caries dental, no especificada',
      type: 'relacionado',
      affectedTeeth: [11],
    }),
  ])

  const byCode = Object.fromEntries(
    reimported.diagnoses.map((item) => [item.code, item.affectedTeeth]),
  )
  assert.deepEqual(byCode['K02.1'], [26, 36, 46])
  assert.deepEqual(byCode['K04.0'], [16])
  assert.deepEqual(byCode['K02.9'], [11])
  assert.equal(reimported.added, 1)
})

test('el mismo CIE no modifica la lista', () => {
  const current = [diagnosis()]
  assert.equal(
    reassignImportedDiagnosisCie(current, {
      fromCode: 'K02.1',
      toCode: 'K02.1',
      toDescription: 'Otra descripción',
      toothNumber: 16,
    }),
    current,
  )
})

test('asignar una pieza ocupada la mueve y no la deja en dos códigos', () => {
  const next = assignCieToTooth(
    [diagnosis(), diagnosis({ code: 'K08.8', description: 'Exodoncia indicada', type: 'relacionado', affectedTeeth: [48] })],
    { code: 'K08.8', description: 'Exodoncia indicada', toothNumber: 16 },
  )

  const byCode = Object.fromEntries(next.map((item) => [item.code, item.affectedTeeth]))
  assert.deepEqual(byCode['K02.1'], [26, 36, 46])
  assert.deepEqual(byCode['K08.8'], [16, 48])
})

test('el primer CIE de una pieza nueva queda como principal', () => {
  const next = assignCieToTooth([], {
    code: 'K02.0',
    description: 'Caries limitada al esmalte',
    toothNumber: 11,
  })
  assert.equal(next.length, 1)
  assert.equal(next[0].type, 'principal')
  assert.deepEqual(next[0].affectedTeeth, [11])
})

test('asignar una pieza reemplaza el alcance de maxilar o dentición', () => {
  const next = assignCieToTooth(
    [
      diagnosis({
        affectedTeeth: undefined,
        anatomicalScope: 'maxilar_superior',
      }),
    ],
    {
      code: 'K02.1',
      description: 'Caries de la dentina',
      toothNumber: 16,
    },
  )

  assert.deepEqual(next[0].affectedTeeth, [16])
  assert.equal(next[0].anatomicalScope, undefined)
})

test('desvincular la última pieza conserva el código sin dientes', () => {
  const next = detachTeethFromDiagnoses(
    [diagnosis({ affectedTeeth: [16] })],
    [16],
  )
  assert.equal(next.length, 1)
  assert.equal(next[0].code, 'K02.1')
  assert.equal(next[0].affectedTeeth, undefined)
})

test('el esquema solo actualiza la pieza editada y hereda el color del CIE destino', () => {
  const chart = {
    entries: [
      {
        dienteId: '16',
        diagnosisCode: 'K02.1',
        diagnosisDescription: 'Caries de la dentina',
        color: '#EF4444',
      },
      {
        dienteId: '26',
        diagnosisCode: 'K02.1',
        diagnosisDescription: 'Caries de la dentina',
        color: '#EF4444',
      },
      {
        dienteId: '38',
        diagnosisCode: 'K08.8',
        diagnosisDescription: 'Exodoncia indicada',
        color: '#0D9488',
      },
    ],
    notes: '',
  }

  const next = reassignDiagnosticChartCie(chart, {
    fromCode: 'K02.1',
    toCode: 'K08.8',
    toDescription: 'Exodoncia indicada',
    toothId: '16',
  })

  assert.equal(next.entries[0].diagnosisCode, 'K08.8')
  assert.equal(next.entries[0].color, '#0D9488')
  assert.equal(next.entries[1].diagnosisCode, 'K02.1')
  assert.equal(next.entries[1].color, '#EF4444')
  assert.equal(chart.entries[0].diagnosisCode, 'K02.1')
})
