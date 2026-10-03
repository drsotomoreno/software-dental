import assert from 'node:assert/strict'
import test from 'node:test'
import {
  auxiliarAccessPassword,
  hashPasswordSha256,
  passwordMatchesAuxiliarDocument,
  repairClinicStaffAccess,
  resolveLoginPassword,
} from './subscriptionAuthStore.js'

const CEDULA = '1029384756'

test('la contraseña de la auxiliar es la cédula, aunque se haya guardado otra clave', () => {
  const clinicId = 'clinica-doctora'
  const store = {
    users: [
      {
        id: clinicId,
        email: 'doctormauriciosoto@gmail.com',
        rol: 'superadmin',
        estado_pago: 'exento',
        clinicId,
        passwordHash: hashPasswordSha256('otra-clave-del-titular'),
      },
      {
        id: 'auxiliar-1',
        firstName: 'Ana',
        lastName: 'Auxiliar',
        email: 'ana.auxiliar@example.com',
        rol: 'auxiliar',
        documentType: 'CC',
        documentNumber: `CC ${CEDULA}`,
        passwordHash: hashPasswordSha256('temporal-distinta'),
        clinicId,
        estado_pago: 'vencido',
        fecha_vencimiento: '2020-01-01T00:00:00.000Z',
        accessEnabled: true,
      },
    ],
  }

  assert.equal(repairClinicStaffAccess(store), true)
  const auxiliar = store.users[1]
  assert.equal(auxiliar.documentNumber, CEDULA)
  assert.equal(auxiliar.rol, 'recepcion')
  assert.equal(auxiliar.passwordHash, hashPasswordSha256(CEDULA))
  assert.equal(auxiliar.estado_pago, 'activo')
  assert.equal(auxiliar.fecha_vencimiento, null)
  assert.equal(auxiliar.accessEnabled, true)
  assert.equal(resolveLoginPassword(auxiliar, CEDULA).ok, true)
  assert.equal(resolveLoginPassword(auxiliar, 'temporal-distinta').ok, false)
  assert.equal(repairClinicStaffAccess(store), false)
})

test('el ingreso acepta la cédula con puntos, espacios o el prefijo CC', () => {
  const user = {
    rol: 'recepcion',
    documentNumber: CEDULA,
    passwordHash: hashPasswordSha256('clave-vieja'),
    accessEnabled: true,
  }
  for (const typed of [CEDULA, `CC ${CEDULA}`, '1.029.384.756', '1029 384 756']) {
    const result = resolveLoginPassword(user, typed)
    assert.equal(result.ok, true, typed)
    assert.equal(result.auxiliar, true)
    assert.equal(result.passwordHash, hashPasswordSha256(CEDULA))
  }
  const wrong = resolveLoginPassword(user, 'no-es-la-clave')
  assert.equal(wrong.ok, false)
})

test('una auxiliar con acceso cancelado no entra solo con la cédula', () => {
  const result = resolveLoginPassword(
    {
      rol: 'recepcion',
      documentNumber: CEDULA,
      passwordHash: '',
      accessEnabled: false,
    },
    CEDULA,
  )
  assert.equal(result.ok, false)
  assert.equal(result.status, 403)
})

test('el arreglo no cambia la clave de un odontólogo', () => {
  const passwordHash = hashPasswordSha256('Soto1976xx')
  const store = {
    users: [
      {
        id: 'owner',
        rol: 'admin',
        estado_pago: 'activo',
        fecha_vencimiento: '2099-01-01T00:00:00.000Z',
        clinicId: 'owner',
        passwordHash,
        documentNumber: '79456123',
      },
      {
        id: 'odo',
        rol: 'odontologo',
        clinicId: 'owner',
        documentNumber: '52123456',
        passwordHash,
        estado_pago: 'activo',
        fecha_vencimiento: '2099-01-01T00:00:00.000Z',
        accessEnabled: true,
      },
    ],
  }
  repairClinicStaffAccess(store)
  assert.equal(store.users[1].passwordHash, passwordHash)
})

test('la cédula corta también es contraseña válida de auxiliar', () => {
  assert.equal(auxiliarAccessPassword('1234567'), '1234567')
  assert.equal(passwordMatchesAuxiliarDocument('1.234.567', '1234567'), true)
  assert.equal(auxiliarAccessPassword('12345'), '')
})
