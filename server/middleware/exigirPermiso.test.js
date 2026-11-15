import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluarPermiso } from './exigirPermiso.js'
import { verifySessionToken } from '../utils/sessionJwt.js'
import {
  CUPOS_PLAN,
  cupoDisponible,
  identidadClinicaTitular,
  signColaboradorToken,
} from '../routes/colaboradores.js'

test('superadmin omite el filtro de rol y de activo', () => {
  const decision = evaluarPermiso(
    { id: 'm', is_superadmin: true, rol: 'superadmin', activo: false },
    ['TITULAR'],
  )
  assert.equal(decision.ok, true)
  assert.equal(decision.bypass, true)
})

test('el dueño con rol admin administra colaboradores', () => {
  const id = '11111111-1111-1111-1111-111111111111'
  const decision = evaluarPermiso(
    { id, rol: 'admin', activo: true, clinica_id: id, is_superadmin: false },
    ['TITULAR'],
  )
  assert.equal(decision.ok, true)
})

test('un odontólogo de otra sede no administra el equipo', () => {
  const decision = evaluarPermiso(
    {
      id: '22222222-2222-2222-2222-222222222222',
      rol: 'odontologo',
      activo: true,
      clinica_id: '11111111-1111-1111-1111-111111111111',
      is_superadmin: false,
    },
    ['TITULAR'],
  )
  assert.equal(decision.ok, false)
  assert.equal(decision.status, 403)
})

test('rol superadmin sin God Mode no abre el bypass', () => {
  const decision = evaluarPermiso(
    { id: 'x', is_superadmin: false, rol: 'superadmin', activo: true, email: 'otro@clinica.com' },
    ['TITULAR'],
  )
  assert.equal(decision.ok, false)
  assert.equal(decision.status, 403)
})

test('cuenta suspendida no pasa', () => {
  const decision = evaluarPermiso(
    { id: 't', rol: 'TITULAR', activo: false },
    ['TITULAR'],
  )
  assert.equal(decision.ok, false)
  assert.equal(decision.status, 403)
})

test('colaborador clínico sin ReTHUS queda fuera', () => {
  const vacio = evaluarPermiso(
    { id: 'c', rol: 'COLABORADOR_CLINICO', activo: true, rethus: '  ' },
    ['COLABORADOR_CLINICO'],
  )
  assert.equal(vacio.ok, false)
  const conRethus = evaluarPermiso(
    { id: 'c', rol: 'COLABORADOR_CLINICO', activo: true, rethus: '12345' },
    ['COLABORADOR_CLINICO'],
  )
  assert.equal(conRethus.ok, true)
})

test('cupos: el titular ocupa un profesional', () => {
  assert.deepEqual(CUPOS_PLAN.NOMAD, { profesionales: 1, administrativos: 1 })
  assert.equal(cupoDisponible('NOMAD', { clinicos: 0, admins: 0 }, 'COLABORADOR_CLINICO').ok, false)
  assert.equal(cupoDisponible('NOMAD', { clinicos: 0, admins: 0 }, 'COLABORADOR_ADMIN').ok, true)
  assert.equal(cupoDisponible('NOMAD', { clinicos: 0, admins: 1 }, 'COLABORADOR_ADMIN').ok, false)

  assert.equal(cupoDisponible('SMART', { clinicos: 2, admins: 0 }, 'COLABORADOR_CLINICO').ok, true)
  assert.equal(cupoDisponible('SMART', { clinicos: 3, admins: 0 }, 'COLABORADOR_CLINICO').ok, false)
  assert.equal(cupoDisponible('SMART', { clinicos: 0, admins: 2 }, 'COLABORADOR_ADMIN').ok, false)

  assert.equal(cupoDisponible('BIONIC', { clinicos: 4, admins: 0 }, 'COLABORADOR_CLINICO').ok, true)
  assert.equal(cupoDisponible('BIONIC', { clinicos: 5, admins: 0 }, 'COLABORADOR_CLINICO').ok, false)
  assert.equal(cupoDisponible('BIONIC', { clinicos: 0, admins: 3 }, 'COLABORADOR_ADMIN').ok, false)

  assert.equal(cupoDisponible('CORPORATIVO', { clinicos: 97, admins: 98 }, 'COLABORADOR_CLINICO').ok, true)
  assert.equal(cupoDisponible('CORPORATIVO', { clinicos: 98, admins: 0 }, 'COLABORADOR_CLINICO').ok, false)
  assert.equal(cupoDisponible('CORPORATIVO', { clinicos: 0, admins: 99 }, 'COLABORADOR_ADMIN').ok, false)
})

test('el JWT conserva al colaborador y el clinicSyncId del titular', () => {
  const titular = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'titular@clinica.com',
    clinica_id: '22222222-2222-4222-8222-222222222222',
  }
  const clinica = identidadClinicaTitular(titular)
  assert.equal(clinica.clinicSyncId, 'clinic:22222222-2222-4222-8222-222222222222')
  assert.notEqual(clinica.clinicId, '33333333-3333-4333-8333-333333333333')

  const token = signColaboradorToken({
    id: '33333333-3333-4333-8333-333333333333',
    userId: '33333333-3333-4333-8333-333333333333',
    clinica_id: titular.clinica_id,
    clinicId: clinica.clinicId,
    clinicSyncId: clinica.clinicSyncId,
    rol: 'COLABORADOR_CLINICO',
    nombre: 'Ana Pérez',
    rethus: 'RETHUS-9',
    activo: true,
    email: 'ana@clinica.com',
  })
  const claims = verifySessionToken(token)
  assert.equal(claims.id, '33333333-3333-4333-8333-333333333333')
  assert.equal(claims.userId, '33333333-3333-4333-8333-333333333333')
  assert.equal(claims.rol, 'COLABORADOR_CLINICO')
  assert.equal(claims.nombre, 'Ana Pérez')
  assert.equal(claims.rethus, 'RETHUS-9')
  assert.equal(claims.clinicSyncId, clinica.clinicSyncId)
  assert.equal(claims.is_superadmin, false)
  assert.equal(claims.activo, true)
})
