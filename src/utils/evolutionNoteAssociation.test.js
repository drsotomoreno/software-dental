import assert from 'node:assert/strict'
import test from 'node:test'
import { buildEvolutionNoteHashPayload } from './evolutionNoteHash.ts'
import {
  collectEvolutionAssociationIssues,
  evolutionDiagnosesPatch,
  formatAssociatedItemLabel,
  omitBlankEvolutionDiagnoses,
} from './evolutionNoteAssociation.ts'
import { serializeForHash } from './crypto.ts'

function nota(extra = {}) {
  return {
    id: 'n1',
    kind: 'evolution',
    date: '2026-10-26T10:00',
    procedure: 'Obturación',
    anesthesia: { type: 'Lidocaína', carpules: 1, vasoconstrictor: '' },
    prescriptions: '',
    professionalName: 'Dra. Pérez',
    professionalLicense: '123',
    createdAt: '2026-10-26T15:00:00.000Z',
    clinicalNote: 'Se obtura la pieza.',
    catalogServices: [{ id: 's1', procedure: 'Obturación', cupsCode: '232102' }],
    diagnoses: [
      {
        id: 'd1',
        code: 'K02.1',
        description: 'Caries de la dentina',
        type: 'principal',
      },
    ],
    patientSignatureDataUrl: 'data:image/png;base64,aa',
    patientSignatureMeta: { strokeCount: 5 },
    professionalSignatureDataUrl: 'data:image/png;base64,bb',
    professionalSignatureMeta: { strokeCount: 5 },
    ...extra,
  }
}

function associationMessages(note) {
  return collectEvolutionAssociationIssues(note).map((issue) => issue.message)
}

test('exige diente, maxilar o dentición en cada procedimiento y diagnóstico', () => {
  const messages = associationMessages(nota())
  assert.equal(messages.length, 2)
  assert.match(messages[0], /Obturación/)
  assert.match(messages[0], /diente, un maxilar o toda la dentición/)
  assert.match(messages[1], /K02\.1/)

  assert.deepEqual(collectEvolutionAssociationIssues(nota()), [
    {
      field: 'catalogServices',
      message:
        'Asocie el procedimiento «Obturación» a un diente, un maxilar o toda la dentición.',
    },
    {
      field: 'diagnoses',
      message: 'Asocie el diagnóstico K02.1 a un diente, un maxilar o toda la dentición.',
    },
  ])
})

test('acepta pieza, maxilar y dentición completa', () => {
  assert.deepEqual(
    associationMessages(
      nota({
        catalogServices: [
          { id: 's1', procedure: 'Obturación', toothNumber: 16 },
          { id: 's2', procedure: 'Prótesis', anatomicalScope: 'maxilar_superior' },
        ],
        diagnoses: [
          {
            id: 'd1',
            code: 'K02.1',
            description: 'Caries de la dentina',
            type: 'principal',
            toothNumber: 16,
          },
          {
            id: 'd2',
            code: 'K05.1',
            description: 'Gingivitis crónica',
            type: 'relacionado',
            anatomicalScope: 'denticion',
          },
        ],
      }),
    ),
    [],
  )

  assert.equal(
    formatAssociatedItemLabel('Obturación', { toothNumber: 16 }),
    'Obturación — Pieza 16',
  )
  assert.equal(
    formatAssociatedItemLabel('Prótesis', { anatomicalScope: 'maxilar_superior' }),
    'Prótesis — Maxilar superior',
  )
  assert.equal(
    formatAssociatedItemLabel('Profilaxis', { anatomicalScope: 'denticion' }),
    'Profilaxis — Toda la dentición',
  )
})

test('el procedimiento legado usa la asociación de la nota', () => {
  const legacy = nota({
    catalogServices: [],
    procedure: 'Detartraje',
    anatomicalScope: 'maxilar_inferior',
    diagnoses: [
      {
        id: 'd1',
        code: 'K05.1',
        description: 'Gingivitis',
        type: 'principal',
        toothNumber: 55,
      },
    ],
  })
  assert.deepEqual(associationMessages(legacy), [])
  assert.equal(
    formatAssociatedItemLabel('Detartraje', { anatomicalScope: 'maxilar_inferior' }),
    'Detartraje — Maxilar inferior',
  )
})

test('un servicio sin RIPS también pide asociación', () => {
  const messages = associationMessages(
    nota({
      catalogServices: [{ id: 's1', procedure: 'Blanqueamiento', requiereCupsRips: false }],
      procedure: 'Blanqueamiento',
      requiereCupsRips: false,
      diagnoses: [],
      ripsMetadata: undefined,
    }),
  )
  assert.deepEqual(messages, [
    'Asocie el procedimiento «Blanqueamiento» a un diente, un maxilar o toda la dentición.',
  ])
})

test('el diagnóstico principal de la sesión actualiza el CIE-10 de RIPS', () => {
  const patch = evolutionDiagnosesPatch([
    {
      id: 'd1',
      code: 'K02.1',
      description: 'Caries de la dentina',
      type: 'principal',
      toothNumber: 21,
    },
    {
      id: 'd2',
      code: 'K05.1',
      description: 'Gingivitis crónica',
      type: 'relacionado',
      anatomicalScope: 'maxilar_superior',
    },
  ])
  assert.equal(patch.ripsMetadata.codDiagnosticoPrincipal, 'K021')
  assert.equal(patch.diagnoses[0].type, 'principal')
  assert.equal(patch.diagnoses[1].anatomicalScope, 'maxilar_superior')
})

test('la firma incluye la asociación y descarta diagnósticos vacíos', () => {
  const base = nota({
    catalogServices: [{ id: 's1', procedure: 'Obturación', toothNumber: 16 }],
    diagnoses: [
      {
        id: 'd1',
        code: 'K02.1',
        description: 'Caries de la dentina',
        type: 'principal',
        toothNumber: 16,
      },
      { id: 'vacio', code: '  ', description: '', type: 'relacionado' },
    ],
  })
  const prepared = omitBlankEvolutionDiagnoses(base)
  assert.equal(prepared.diagnoses.length, 1)

  const withTooth = buildEvolutionNoteHashPayload(prepared)
  const withoutTooth = buildEvolutionNoteHashPayload({
    ...prepared,
    catalogServices: [{ id: 's1', procedure: 'Obturación' }],
  })
  assert.notEqual(serializeForHash(withTooth), serializeForHash(withoutTooth))
  assert.equal(withTooth.diagnoses[0].toothNumber, 16)
  assert.equal(withTooth.ripsMetadata, undefined)
})

test('preparar la firma conserva la asociación y quita diagnósticos vacíos', () => {
  const prepared = omitBlankEvolutionDiagnoses(
    nota({
      catalogServices: [{ id: 's1', procedure: 'Obturación', anatomicalScope: 'denticion' }],
      diagnoses: [
        {
          id: 'd1',
          code: 'K02.1',
          description: 'Caries de la dentina',
          type: 'principal',
          anatomicalScope: 'maxilar_superior',
        },
        { id: 'vacio', code: '', description: '', type: 'relacionado', toothNumber: 11 },
      ],
    }),
  )
  assert.equal(prepared.catalogServices[0].anatomicalScope, 'denticion')
  assert.equal(prepared.diagnoses.length, 1)
  assert.equal(prepared.diagnoses[0].anatomicalScope, 'maxilar_superior')
  const payload = buildEvolutionNoteHashPayload(prepared)
  assert.equal(payload.diagnoses[0].anatomicalScope, 'maxilar_superior')
  assert.equal(payload.catalogServices[0].anatomicalScope, 'denticion')
})
