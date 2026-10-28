import assert from 'node:assert/strict'
import test from 'node:test'
import {
  omitOrthodonticsPackageBudgetLines,
  orthodonticsPackageProcedureNames,
  shouldShowOrthodonticsBudgetSection,
} from './orthodonticsBudgetLines.ts'

const PACKAGE =
  'Ortodoncia Convencional con Brackets — Brackets Cerámicos Transparentes'

const planItem = {
  id: 'plan-ortho',
  source: 'orthodontics_annex',
  procedure: PACKAGE,
}

const resin = {
  id: 'resin',
  procedure: 'Obturación dental con resina de fotocurado',
  quantity: 1,
  unitPrice: 700000,
}

test('quita el paquete de ortodoncia y conserva los demás procedimientos', () => {
  const lines = omitOrthodonticsPackageBudgetLines(
    [
      {
        id: 'ortho-line',
        treatmentPlanItemId: 'plan-ortho',
        procedure: PACKAGE,
        quantity: 1,
        unitPrice: 3600000,
      },
      resin,
      {
        id: 'control',
        procedure: 'Control de ortodoncia',
        cupsCode: '893106',
        quantity: 1,
        unitPrice: 80000,
      },
    ],
    [planItem],
    orthodonticsPackageProcedureNames({
      treatmentType: 'convencional_brackets',
      conventionalBracketType: 'ceramicos_transparentes',
      alignerTreatmentMode: '',
      alignerPhaseCount: '',
      maxillaryOrthopedicsAppliance: { type: '', name: '', description: '' },
    }),
  )

  assert.deepEqual(
    lines.map((line) => line.id),
    ['resin', 'control'],
  )
})

test('quita la fila importada aunque no tenga el id del plan', () => {
  const lines = omitOrthodonticsPackageBudgetLines(
    [
      {
        id: 'ortho-copy',
        procedure: PACKAGE,
        quantity: 1,
        unitPrice: 3600000,
      },
      resin,
    ],
    [planItem],
  )

  assert.deepEqual(
    lines.map((line) => line.procedure),
    [resin.procedure],
  )
})

test('no toca el listado si no hay tratamiento de ortodoncia', () => {
  const items = [resin]
  assert.equal(omitOrthodonticsPackageBudgetLines(items, []), items)
  assert.deepEqual(orthodonticsPackageProcedureNames(null), [])
})

test('oculta la caja de presupuesto si no hay plan ni presupuesto de ortodoncia', () => {
  assert.equal(shouldShowOrthodonticsBudgetSection({ active: false }, []), false)
  assert.equal(shouldShowOrthodonticsBudgetSection(undefined, []), false)
  // Fantasma: active sin montos no debe mostrar la caja
  assert.equal(
    shouldShowOrthodonticsBudgetSection(
      {
        active: true,
        initialInstallment: { quantity: 1, unitPrice: 0 },
        controls: { quantity: 0, unitPrice: 0 },
        retainers: { quantity: 0, unitPrice: 0 },
      },
      [],
    ),
    false,
  )
})

test('muestra la caja si hay montos reales o plan del anexo', () => {
  assert.equal(
    shouldShowOrthodonticsBudgetSection(
      {
        active: true,
        initialInstallment: { quantity: 1, unitPrice: 1_500_000 },
        controls: { quantity: 12, unitPrice: 150_000 },
        retainers: { quantity: 1, unitPrice: 0 },
      },
      [],
    ),
    true,
  )
  assert.equal(shouldShowOrthodonticsBudgetSection({ active: false }, [planItem]), true)
})
