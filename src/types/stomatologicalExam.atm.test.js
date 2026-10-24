import assert from 'node:assert/strict'
import test from 'node:test'
import {
  atmDeniesAllFindings,
  normalizeStomatologicalExam,
} from './stomatologicalExam.ts'

test('un ATM marcado como normal activa la ausencia en clics, dolor y desviación', () => {
  const exam = normalizeStomatologicalExam({
    atm: { isNormal: true, clicks: '', pain: '', deviation: '', notes: '' },
  })

  assert.equal(exam.atm.isNormal, true)
  assert.equal(exam.atm.clicks, 'no')
  assert.equal(exam.atm.pain, 'no')
  assert.equal(exam.atm.deviation, 'no')
  assert.equal(atmDeniesAllFindings(exam.atm), true)
})

test('un hallazgo de ATM no se convierte en No al normalizar', () => {
  const exam = normalizeStomatologicalExam({
    atm: { isNormal: true, clicks: 'derecha', pain: '', deviation: 'apertura', notes: '' },
  })

  assert.equal(exam.atm.isNormal, false)
  assert.equal(exam.atm.clicks, 'derecha')
  assert.equal(exam.atm.pain, '')
  assert.equal(exam.atm.deviation, 'apertura')
})

test('reconoce el texto No guardado en clics, dolor y desviación', () => {
  const exam = normalizeStomatologicalExam({
    atm: { isNormal: false, clicks: 'No', pain: 'ausente', deviation: 'sin desviación', notes: '' },
  })

  assert.equal(exam.atm.clicks, 'no')
  assert.equal(exam.atm.pain, 'no')
  assert.equal(exam.atm.deviation, 'no')
  assert.equal(exam.atm.isNormal, true)
})
