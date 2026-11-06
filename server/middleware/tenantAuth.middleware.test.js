import assert from 'node:assert/strict'
import test from 'node:test'
import { signSessionToken, verifySessionToken } from '../utils/sessionJwt.js'
import { aislarClinica, soloSuperAdmin } from './tenantAuth.middleware.js'

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
  }
}

test('JWT de sesión incluye id, clinica_id, is_superadmin y rol', () => {
  const token = signSessionToken({
    id: 'user-1',
    clinica_id: 'clinic-9',
    is_superadmin: false,
    rol: 'odontologo',
    sid: 'sid-1',
  })
  const claims = verifySessionToken(token)
  assert.equal(claims.id, 'user-1')
  assert.equal(claims.clinica_id, 'clinic-9')
  assert.equal(claims.is_superadmin, false)
  assert.equal(claims.rol, 'odontologo')
  assert.equal(claims.sid, 'sid-1')
})

test('aislarClinica deja pasar al Superadmin hacia cualquier sede', () => {
  const req = {
    user: { id: 'master', clinica_id: null, is_superadmin: true, rol: 'superadmin' },
    params: { clinica_id: 'otra-clinica' },
    body: {},
    query: {},
    headers: {},
  }
  const res = mockRes()
  let nextCalled = false
  aislarClinica(req, res, () => {
    nextCalled = true
  })
  assert.equal(nextCalled, true)
  assert.equal(res.statusCode, 200)
})

test('aislarClinica bloquea acceso cruzado entre clínicas', () => {
  const req = {
    user: { id: 'doc-1', clinica_id: 'clinica-a', is_superadmin: false, rol: 'odontologo' },
    params: { clinica_id: 'clinica-b' },
    body: {},
    query: {},
    headers: {},
  }
  const res = mockRes()
  let nextCalled = false
  aislarClinica(req, res, () => {
    nextCalled = true
  })
  assert.equal(nextCalled, false)
  assert.equal(res.statusCode, 403)
})

test('soloSuperAdmin rechaza cuentas sin God Mode', () => {
  const req = {
    user: { id: 'doc-1', clinica_id: 'clinica-a', is_superadmin: false, rol: 'admin_clinica' },
  }
  const res = mockRes()
  let nextCalled = false
  soloSuperAdmin(req, res, () => {
    nextCalled = true
  })
  assert.equal(nextCalled, false)
  assert.equal(res.statusCode, 403)
})

test('soloSuperAdmin admite is_superadmin', () => {
  const req = {
    user: { id: 'master', clinica_id: null, is_superadmin: true, rol: 'superadmin' },
  }
  const res = mockRes()
  let nextCalled = false
  soloSuperAdmin(req, res, () => {
    nextCalled = true
  })
  assert.equal(nextCalled, true)
})
