import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  applyLoginClinicBinding,
  mergeStaffUser,
  recoverDetachedAuxiliares,
} from '../server/services/clinicStaffGuard.js'
import { mergeDurableStores } from '../server/services/durableStore.js'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const ownerId = 'clinic-mauricio'
const leidyId = 'user-leidy'
const clinicName = 'Consultorio Mauricio Soto'

const goodLeidy = {
  id: leidyId,
  firstName: 'Leidy',
  lastName: 'Blanco',
  nombre: 'Leidy Blanco',
  email: 'leidy.blanco@example.com',
  phone: '3001234567',
  documentType: 'CC',
  documentNumber: '1094123456',
  rol: 'recepcion',
  clinicId: ownerId,
  clinicName,
  passwordHash: 'hash-buena',
  accessEnabled: true,
  updatedAt: '2026-10-01T12:00:00.000Z',
  createdAt: '2026-09-01T12:00:00.000Z',
}

const detachedByLogin = {
  ...goodLeidy,
  rol: 'admin',
  clinicId: leidyId,
  updatedAt: '2026-10-08T12:00:00.000Z',
}

const merged = mergeStaffUser(goodLeidy, detachedByLogin)
assert(merged.clinicId === ownerId, `la fusión no debe quitar la clínica (quedó ${merged.clinicId})`)
assert(merged.rol === 'recepcion', `la fusión no debe promover a la auxiliar (quedó ${merged.rol})`)
assert(merged.passwordHash === 'hash-buena', 'la fusión no debe borrar la clave si no hubo suspensión')
assert(merged.documentNumber === '1094123456', 'la fusión no debe perder la cédula')

const suspended = mergeStaffUser(goodLeidy, {
  ...goodLeidy,
  accessEnabled: false,
  passwordHash: '',
  suspendedAt: '2026-10-09T12:00:00.000Z',
  updatedAt: '2026-10-09T12:00:00.000Z',
})
assert(suspended.accessEnabled === false, 'una suspensión más nueva debe conservarse')
assert(suspended.passwordHash === '', 'la suspensión cancela la clave')
assert(suspended.clinicId === ownerId, 'la suspensión no saca a la persona de la clínica')

const loginUntouched = applyLoginClinicBinding({
  id: leidyId,
  rol: 'auxiliar',
  clinicId: '',
  accessEnabled: true,
})
assert(!loginUntouched.clinicId, 'el login no debe inventar una clínica propia para la auxiliar')
assert(loginUntouched.rol === 'auxiliar', 'el login no debe volver administrador a la auxiliar')

const titular = applyLoginClinicBinding({
  id: ownerId,
  rol: 'odontologo',
  accessEnabled: true,
})
assert(titular.clinicId === ownerId, 'un titular sin clínica sigue quedando como dueño de la suya')
assert(titular.rol === 'admin', 'un titular sin clínica sigue promovido a administración')

const storeMerge = mergeDurableStores(
  {
    users: [detachedByLogin],
    staffEvents: [{ id: 'evt-1', at: '2026-10-08T12:00:00.000Z', type: 'repair' }],
  },
  {
    users: [
      goodLeidy,
      {
        id: 'user-solo-postgres',
        nombre: 'Otra auxiliar',
        rol: 'recepcion',
        clinicId: ownerId,
        updatedAt: '2026-10-02T12:00:00.000Z',
      },
    ],
    staffEvents: [{ id: 'evt-2', at: '2026-10-01T12:00:00.000Z', type: 'create' }],
  },
)
const leidyAfterStore = storeMerge.users.find((user) => user.id === leidyId)
const other = storeMerge.users.find((user) => user.id === 'user-solo-postgres')
assert(leidyAfterStore?.clinicId === ownerId, 'Postgres/archivo no debe dejar a Leidy fuera de la clínica')
assert(leidyAfterStore?.rol === 'recepcion', 'Postgres/archivo debe conservar el rol de auxiliar')
assert(other, 'un usuario que solo está en una copia no puede desaparecer')
assert(storeMerge.staffEvents.length === 2, 'los eventos de personal no se pueden perder al fusionar')

const owner = {
  id: ownerId,
  nombre: 'Mauricio Soto',
  rol: 'admin',
  clinicId: ownerId,
  clinicName,
  estado_pago: 'exento',
  email: 'doctormauriciosoto@gmail.com',
}
const recovered = recoverDetachedAuxiliares(
  [owner, { ...detachedByLogin, rethusNumber: '', passwordHash: 'hash-buena' }],
  ownerId,
)
assert(recovered.changed, 'Leidy desvinculada debe recuperarse')
const leidyBack = recovered.users.find((user) => user.id === leidyId)
assert(leidyBack.clinicId === ownerId, 'la recuperación debe devolver la clínica del titular')
assert(leidyBack.rol === 'recepcion', 'la recuperación debe dejarla como auxiliar')
assert(leidyBack.passwordHash === 'hash-buena', 'la recuperación no debe borrar la clave')

const outsider = recoverDetachedAuxiliares(
  [
    owner,
    {
      id: 'otra-clinica',
      nombre: 'Otra Titular',
      rol: 'admin',
      clinicId: 'otra-clinica',
      clinicName: 'Otra sede',
      documentNumber: '1234567890',
      phone: '3009998877',
      estado_pago: 'pendiente',
      updatedAt: '2026-10-08T12:00:00.000Z',
    },
    {
      id: 'prueba-propia',
      nombre: 'Prueba Propia',
      rol: 'admin',
      clinicId: 'prueba-propia',
      clinicName,
      documentNumber: '1094000001',
      phone: '3001112233',
      estado_pago: 'prueba',
      rethusNumber: '',
      updatedAt: '2026-10-08T12:00:00.000Z',
    },
  ],
  ownerId,
)
assert(!outsider.changed, 'otra sede o una prueba propia no deben absorberse como auxiliar')

const dataDir = join(tmpdir(), `staff-retention-${Date.now()}`)
await mkdir(dataDir, { recursive: true })
process.env.NODE_ENV = 'test'

const { config } = await import('../server/config.js')
config.dataDir = dataDir

const { listClinicUsers, deleteClinicUser } = await import('../server/services/subscriptionAuthStore.js')

const now = new Date().toISOString()
const token = 'session-mauricio-test'
await writeFile(
  join(dataDir, 'subscription-users.json'),
  JSON.stringify({
    users: [
      {
        ...owner,
        passwordHash: 'x',
        accessEnabled: true,
        updatedAt: now,
      },
      {
        ...detachedByLogin,
        rethusNumber: '',
        updatedAt: '2026-10-08T12:00:00.000Z',
      },
    ],
    sessions: [
      {
        token,
        userId: ownerId,
        rol: 'superadmin',
        createdAt: now,
        expiresAt: '2036-01-01T00:00:00.000Z',
      },
    ],
    passwordResets: [],
    emailVerifications: [],
    staffEvents: [],
  }),
)

const listed = await listClinicUsers({ token, hint: {} })
assert(listed.ok, `listar clínica falló: ${listed.error || ''}`)
const visible = listed.users.find((user) => user.id === leidyId)
assert(visible, 'Leidy debe volver a aparecer en Gestión de Usuarios')
assert(visible.rol === 'recepcion', `Leidy debe figurar como auxiliar, no como ${visible.rol}`)
assert(visible.detached !== true, 'después de recuperar no debe seguir marcada como desvinculada')
assert(String(visible.nombre || `${visible.firstName} ${visible.lastName}`).includes('Leidy'), 'debe conservar el nombre')

const removed = await deleteClinicUser({ token, hint: {}, userId: leidyId })
assert(removed.ok, `suspender falló: ${removed.error || ''}`)
const afterSuspend = await listClinicUsers({ token, hint: {} })
const stillThere = afterSuspend.users.find((user) => user.id === leidyId)
assert(stillThere, 'suspender el acceso no debe borrar la ficha de la lista')
assert(stillThere.accessEnabled === false, 'el acceso suspendido debe verse como sin acceso')

const persisted = JSON.parse(await readFile(join(dataDir, 'subscription-users.json'), 'utf8'))
const storedLeidy = persisted.users.find((user) => user.id === leidyId)
assert(storedLeidy, 'la ficha debe seguir en el almacén')
assert(storedLeidy.clinicId === ownerId, 'la ficha guardada debe seguir en la clínica')
assert(storedLeidy.firstName === 'Leidy' && storedLeidy.lastName === 'Blanco', 'no se pierde el nombre')
assert(persisted.staffEvents.some((event) => event.type === 'suspend' && event.userId === leidyId), 'debe quedar constancia de la suspensión')

console.log('Retención de auxiliares: ok')
