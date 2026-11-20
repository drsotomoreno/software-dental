import assert from 'node:assert/strict'
import test from 'node:test'
import { CANONICAL_PRODUCTION_ORIGIN, resolveAppPublicUrl } from '../config.js'
import {
  canManageClinicGoogleDrive,
  frontendRedirectAfterOAuth,
  GOOGLE_DRIVE_AUTH_URL_OPTIONS,
  GOOGLE_DRIVE_RECONNECT_REQUIRED,
  GoogleDriveReconnectRequiredError,
  isGoogleDriveAuthFailure,
  isGoogleDriveReconnectRequiredError,
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

  const dash = new URL(frontendRedirectAfterOAuth({ ok: true, returnPath: '/superadmin' }))
  assert.equal(dash.pathname, '/superadmin')
  assert.equal(dash.searchParams.get('googleDrive'), 'connected')

  const blocked = new URL(
    frontendRedirectAfterOAuth({ ok: true, returnPath: 'https://evil.test/phish' }),
  )
  assert.equal(blocked.pathname, '/perfil')
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

test('OAuth auth URL fuerza offline + consent para refresh_token', () => {
  assert.equal(GOOGLE_DRIVE_AUTH_URL_OPTIONS.access_type, 'offline')
  assert.equal(GOOGLE_DRIVE_AUTH_URL_OPTIONS.prompt, 'consent')
})

test('isGoogleDriveAuthFailure detecta invalid_grant y 401 de Google', () => {
  assert.equal(
    isGoogleDriveAuthFailure({
      response: { status: 400, data: { error: 'invalid_grant' } },
    }),
    true,
  )
  assert.equal(
    isGoogleDriveAuthFailure({
      response: { status: 401, data: { error: { message: 'Unauthorized' } } },
      status: 401,
    }),
    true,
  )
  assert.equal(isGoogleDriveAuthFailure({ message: 'invalid_grant: Token has been expired or revoked' }), true)
  assert.equal(isGoogleDriveAuthFailure({ status: 404, message: 'Not Found' }), false)
})

test('GoogleDriveReconnectRequiredError expone código contractual', () => {
  const err = new GoogleDriveReconnectRequiredError()
  assert.equal(err.code, GOOGLE_DRIVE_RECONNECT_REQUIRED)
  assert.equal(err.status, 401)
  assert.equal(isGoogleDriveReconnectRequiredError(err), true)
  assert.equal(isGoogleDriveAuthFailure(err), true)
})

test('GET /callback declara query fuera del try (no ReferenceError en catch)', async () => {
  const { readFileSync } = await import('node:fs')
  const { dirname, join } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../routes/googleDrive.routes.js'),
    'utf8',
  )
  const callback = src.match(/router\.get\(\s*'\/callback'[\s\S]*?\n\}\)/)
  assert.ok(callback, 'debe existir el handler /callback')
  const body = callback[0]
  const queryBeforeTry = body.search(/const query = req\.query/)
  const tryIdx = body.search(/\btry\s*\{/)
  const catchUsesQuery = /catch\s*\([^)]*\)\s*\{[\s\S]*redirectAfterDriveOAuth\(\s*query/.test(
    body,
  )
  assert.ok(queryBeforeTry >= 0, 'debe declarar query')
  assert.ok(tryIdx > queryBeforeTry, 'query debe declararse antes del try')
  assert.equal(catchUsesQuery, true, 'el catch debe reutilizar query sin redeclararlo')
})
