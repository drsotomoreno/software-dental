import assert from 'node:assert/strict'
import test from 'node:test'
import { isRipsPackageReadyForExport } from './ripsPackageReady.ts'

function paquete(servicios = {}) {
  return {
    usuarios: [
      {
        servicios: {
          consultas: servicios.consultas ?? [],
          procedimientos: servicios.procedimientos ?? [],
          otrosServicios: servicios.otrosServicios ?? [],
        },
      },
    ],
  }
}

test('el paquete sigue bloqueado mientras exista un error, aunque haya servicios', () => {
  const ready = isRipsPackageReadyForExport({
    sourceCount: 2,
    issues: [
      { level: 'error', message: 'CUPS 997403 exige especialidad Endodoncia' },
      { level: 'error', message: 'La sede no tiene habilitado el servicio' },
      { level: 'warning', message: 'procedimiento del plan sin código CUPS' },
    ],
    rips: paquete({ consultas: [{}], procedimientos: [{}, {}, {}] }),
  })
  assert.equal(ready, false)
})

test('se habilita la exportación cuando solo quedan advertencias y hay servicios', () => {
  const ready = isRipsPackageReadyForExport({
    sourceCount: 2,
    issues: [{ level: 'warning', message: 'procedimiento del plan sin código CUPS' }],
    rips: paquete({ consultas: [{}], procedimientos: [{}, {}] }),
  })
  assert.equal(ready, true)
})

test('un paquete sin errores y sin advertencias está listo', () => {
  assert.equal(
    isRipsPackageReadyForExport({
      sourceCount: 1,
      issues: [],
      rips: paquete({ procedimientos: [{}] }),
    }),
    true,
  )
})

test('otros servicios también dejan el paquete listo para exportar', () => {
  assert.equal(
    isRipsPackageReadyForExport({
      sourceCount: 1,
      issues: [],
      rips: paquete({ otrosServicios: [{}] }),
    }),
    true,
  )
})

test('sin atenciones, sin usuarios o sin servicios el paquete no está listo', () => {
  assert.equal(
    isRipsPackageReadyForExport({
      sourceCount: 0,
      issues: [],
      rips: paquete({ consultas: [{}] }),
    }),
    false,
  )
  assert.equal(
    isRipsPackageReadyForExport({
      sourceCount: 1,
      issues: [],
      rips: { usuarios: [] },
    }),
    false,
  )
  assert.equal(
    isRipsPackageReadyForExport({
      sourceCount: 1,
      issues: [],
      rips: paquete({}),
    }),
    false,
  )
})
