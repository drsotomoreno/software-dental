import assert from 'node:assert/strict'
import test from 'node:test'
import { CANONICAL_PRODUCTION_ORIGIN, resolveAppPublicUrl } from '../config.js'
import {
  canManageClinicGoogleDrive,
  frontendRedirectAfterOAuth,
  isGoogleDriveSuperAdmin,
  resolveManagedClinicId,
} from './googleDriveOAuth.service.js'

test('resolveAppPublicUrl fuerza www en apex de producción', () => {
  assert.equal(resolveAppPublicUrl('https://mihistoriadental.com'), CANONICAL_PRODUCTION_ORIGIN)
  assert.equal(resolveAppPublicUrl('https://mihistoriadental.com/'), CANONICAL_PRODUCTION_ORIGIN)
  assert.equal(resolveAppPublicUrl('https://www.mihistoriadental.com'), CANONICAL_PRODUCTION_ORIGIN)
  assert.equal(
    resolveAppPublicUrl('https://www.mihistoriadental.com/perfil'),
    CANONICAL_PRODUCTION_ORIGIN,
  )
})

test('frontendRedirectAfterOAuth aterriza en /perfil con flag googleDrive', () => {
  const okUrl = new URL(frontendRedirectAfterOAuth({ ok: true }))
  assert.equal(okUrl.pathname, '/perfil')
  assert.equal(okUrl.searchParams.get('googleDrive'), 'connected')
  if (okUrl.hostname.endsWith('mihistoriadental.com')) {
    assert.equal(okUrl.origin, CANONICAL_PRODUCTION_ORIGIN)
  }

  const errUrl = new URL(
    frontendRedirectAfterOAuth({ ok: false, errorCode: 'access_denied' }),
  )
  assert.equal(errUrl.pathname, '/perfil')
  assert.equal(errUrl.searchParams.get('googleDrive'), 'error')
  assert.equal(errUrl.searchParams.get('code'), 'access_denied')
})

test('callback OAuth con APP_PUBLIC_URL apex no redirige sin www', () => {
  const base = resolveAppPublicUrl('https://mihistoriadental.com')
  const url = new URL(`${base}/perfil`)
  url.searchParams.set('googleDrive', 'connected')
  assert.equal(url.toString(), 'https://www.mihistoriadental.com/perfil?googleDrive=connected')
  assert.equal(resolveAppPublicUrl('http://localhost:5173'), 'http://localhost:5173')
})

test('superadmin maestro puede gestionar Drive', () => {
  const master = {
    id: 'master-id',
    email: 'doctormauriciosoto@gmail.com',
    rol: 'superadmin',
    clinicId: null,
  }
  assert.equal(isGoogleDriveSuperAdmin(master), true)
  assert.equal(canManageClinicGoogleDrive(master), true)
  assert.equal(resolveManagedClinicId(master), 'clinic:doctormauriciosoto@gmail.com')
  assert.equal(
    resolveManagedClinicId(master, 'otra-clinica-uuid'),
    'clinic:otra-clinica-uuid',
  )
})

test('dueño y admin de clínica pueden gestionar Drive', () => {
  const owner = { id: 'c1', clinicId: 'c1', email: 'owner@clinic.com', rol: 'odontologo' }
  const admin = { id: 'u2', clinicId: 'c1', email: 'admin@clinic.com', rol: 'admin' }
  assert.equal(canManageClinicGoogleDrive(owner), true)
  assert.equal(canManageClinicGoogleDrive(admin), true)
})

test('odontólogo colaborador no puede gestionar Drive', () => {
  const doc = { id: 'u3', clinicId: 'c1', email: 'doc@clinic.com', rol: 'odontologo' }
  assert.equal(canManageClinicGoogleDrive(doc), false)
})
