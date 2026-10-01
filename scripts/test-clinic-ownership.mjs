import assert from 'node:assert/strict'
import {
  alignClinicOwnership,
  belongsToClinic,
  canRemoveClinicMember,
  canonicalOwnerId,
  isRecordedOwner,
  textId,
} from '../shared/clinicOwnership.js'

const carlos = {
  id: 'user-demo-admin',
  clinicId: 'user-demo-admin',
  isClinicOwner: true,
  rol: 'admin',
  createdAt: '2024-01-01T00:00:00.000Z',
}
const maria = {
  id: 'user-demo-001',
  clinicId: 'user-demo-admin',
  isClinicOwner: false,
  rol: 'odontologo',
}
const leydi = {
  id: 'leydi-1',
  clinicId: 'user-demo-admin',
  isClinicOwner: false,
  rol: 'recepcion',
}
const mauricio = {
  id: 'mauricio-1',
  clinicId: 'mauricio-1',
  isClinicOwner: true,
  rol: 'superadmin',
  createdAt: '2024-06-01T00:00:00.000Z',
}

const mixed = [carlos, maria, leydi, mauricio]
const carlosClinic = canonicalOwnerId(mixed, carlos.id)
assert.equal(carlosClinic, carlos.id)
assert.equal(belongsToClinic(mauricio, carlosClinic), false)
assert.equal(belongsToClinic(leydi, carlosClinic), true)

const duplicate = [
  { ...carlos },
  { ...maria, isClinicOwner: true, clinicId: carlos.id },
  { ...leydi },
]
assert.equal(canonicalOwnerId(duplicate, carlos.id), carlos.id)
assert.equal(alignClinicOwnership(duplicate, carlos.id), true)
assert.equal(duplicate.filter((user) => user.isClinicOwner).length, 1)
assert.equal(duplicate.find((user) => user.id === maria.id).isClinicOwner, false)
assert.equal(isRecordedOwner(duplicate.find((user) => user.id === carlos.id)), true)

const removal = canRemoveClinicMember(carlos.id, duplicate.find((user) => user.id === leydi.id), carlos.id)
assert.equal(removal.ok, true)
const self = canRemoveClinicMember(carlos.id, carlos, carlos.id)
assert.equal(self.ok, false)
const titular = canRemoveClinicMember('admin-2', carlos, carlos.id)
assert.equal(titular.ok, false)

const staffWithoutClinic = { id: 'aux-1', rol: 'recepcion' }
assert.equal(isRecordedOwner(staffWithoutClinic), false)
assert.equal(textId(['mauricio-1']), 'mauricio-1')

const pointed = [
  { id: 'owner-real', createdAt: '2020-01-01T00:00:00.000Z', rol: 'admin' },
  { id: 'extra-owner', clinicId: 'extra-owner', isClinicOwner: true, rol: 'admin', createdAt: '2021-01-01T00:00:00.000Z' },
  { id: 'col-1', clinicId: 'owner-real', rol: 'odontologo' },
  { id: 'col-2', clinicId: 'owner-real', isClinicOwner: true, rol: 'admin' },
]
assert.equal(canonicalOwnerId(pointed, 'owner-real'), 'owner-real')
alignClinicOwnership(pointed, 'owner-real')
assert.equal(pointed.find((user) => user.id === 'extra-owner').isClinicOwner, true)
assert.equal(pointed.find((user) => user.id === 'col-2').isClinicOwner, false)
assert.equal(pointed.find((user) => user.id === 'owner-real').clinicId, 'owner-real')
assert.equal(pointed.find((user) => user.id === 'owner-real').isClinicOwner, true)
assert.equal(canRemoveClinicMember('owner-real', pointed.find((user) => user.id === 'col-2'), 'owner-real').ok, true)

console.log('clinic ownership ok')
