import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import express from 'express'

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'clinic-team-'))

const { errorHandler } = await import('../server/middleware/errorHandler.js')
const authRoutes = (await import('../server/routes/auth.routes.js')).default
const { hashPasswordSha256 } = await import('../server/services/subscriptionAuthStore.js')

const app = express()
app.use(express.json())
app.use('/api', authRoutes)
app.use(errorHandler)

const server = app.listen(0)
const port = server.address().port
const base = `http://127.0.0.1:${port}`

async function api(path, options = {}) {
  const response = await fetch(`${base}${path}`, options)
  const text = await response.text()
  let payload = {}
  try {
    payload = text ? JSON.parse(text) : {}
  } catch {
    payload = { raw: text }
  }
  return { status: response.status, payload }
}

const email = 'titular.prueba@clinica.test'
const password = 'ClaveTitular123'
const registered = await api('/api/registro', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    nombre: 'Titular Prueba',
    email,
    password,
  }),
})
assert.equal(registered.status, 201, JSON.stringify(registered.payload))

const login = await api('/api/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
})
assert.equal(login.status, 200, JSON.stringify(login.payload))
const token = login.payload.token
const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

const created = await api('/api/clinic/users', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({
    firstName: 'Leydi',
    lastName: 'Blanco',
    documentType: 'CC',
    documentNumber: '1096538381',
    email: 'leydi.prueba@clinica.test',
    phone: '3332543597',
    rol: 'recepcion',
    password: 'Auxiliar123',
  }),
})
assert.equal(created.status, 201, JSON.stringify(created.payload))
assert.equal(created.payload.user.isClinicOwner, false)
const collaboratorId = created.payload.user.id

const listed = await api('/api/clinic/users', { headers: { Authorization: `Bearer ${token}` } })
assert.equal(listed.status, 200, JSON.stringify(listed.payload))
const titulares = listed.payload.users.filter((user) => user.isClinicOwner)
assert.equal(titulares.length, 1)
assert.equal(listed.payload.users.some((user) => user.id === collaboratorId), true)

const renamed = await api(`/api/clinic/users/${collaboratorId}`, {
  method: 'PUT',
  headers: auth,
  body: JSON.stringify({ role: 'odontologo', firstName: 'Leydi', lastName: 'Blanco' }),
})
assert.equal(renamed.status, 200, JSON.stringify(renamed.payload))
assert.equal(renamed.payload.user.rol, 'odontologo')
assert.equal(renamed.payload.user.isClinicOwner, false)

const reset = await api(`/api/clinic/users/${collaboratorId}/password`, {
  method: 'PUT',
  headers: auth,
  body: JSON.stringify({ password: 'NuevaClave123' }),
})
assert.equal(reset.status, 200, JSON.stringify(reset.payload))

const loginStaff = await api('/api/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ documentNumber: '1096538381', password: 'NuevaClave123' }),
})
assert.equal(loginStaff.status, 200, JSON.stringify(loginStaff.payload))

const emptyDelete = await api(`/api/clinic/users/${collaboratorId}`, {
  method: 'DELETE',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
})
assert.equal(emptyDelete.status, 200, JSON.stringify(emptyDelete.payload))

const afterDelete = await api('/api/clinic/users', { headers: { Authorization: `Bearer ${token}` } })
const removed = afterDelete.payload.users.find((user) => user.id === collaboratorId)
assert.equal(removed.accessEnabled, false)
assert.equal(afterDelete.payload.users.filter((user) => user.isClinicOwner).length, 1)

const ownerId = titulares[0].id
const deleteOwner = await api(`/api/clinic/users/${ownerId}`, {
  method: 'DELETE',
  headers: { Authorization: `Bearer ${token}` },
})
assert.notEqual(deleteOwner.status, 200)
assert.match(deleteOwner.payload.error, /titular|propio/i)

assert.equal(typeof hashPasswordSha256('NuevaClave123'), 'string')

const { config } = await import('../server/config.js')
const usersFile = join(config.dataDir, 'subscription-users.json')
const raw = JSON.parse(await readFile(usersFile, 'utf8'))
raw.users.push(null)
raw.users.push({
  id: 'falso-titular',
  clinicId: ownerId,
  isClinicOwner: true,
  rol: 'admin',
  firstName: 'Falso',
  lastName: 'Titular',
  nombre: 'Falso Titular',
  email: 'falso@clinica.test',
  documentNumber: '7990463800',
  passwordHash: hashPasswordSha256('Falso1234'),
  accessEnabled: true,
})
raw.sessions.push(null)
await writeFile(usersFile, JSON.stringify(raw))

const healed = await api('/api/clinic/users', { headers: { Authorization: `Bearer ${token}` } })
assert.equal(healed.status, 200, JSON.stringify(healed.payload))
assert.equal(healed.payload.users.filter((user) => user.isClinicOwner).length, 1)
const falso = healed.payload.users.find((user) => user.id === 'falso-titular')
assert.ok(falso)
assert.equal(falso.isClinicOwner, false)

const resetFalso = await api('/api/clinic/users/falso-titular/password', {
  method: 'PUT',
  headers: auth,
  body: JSON.stringify({ password: 'OtraClave123' }),
})
assert.equal(resetFalso.status, 200, JSON.stringify(resetFalso.payload))

const deleteFalso = await api('/api/clinic/users/falso-titular', {
  method: 'DELETE',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
})
assert.equal(deleteFalso.status, 200, JSON.stringify(deleteFalso.payload))

server.close()
console.log('clinic team api ok')
