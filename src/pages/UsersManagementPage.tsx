import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { RequirePermission } from '@/components/auth/RequirePermission'
import { useAuth } from '@/contexts/AuthContext'
import { useAudit } from '@/hooks/useAudit'
import { upsertProfessionalFromUser } from '@/services/dentalServiceCatalogService'
import {
  createAppUser,
  deleteAppUser,
  listAppUsers,
  resetAppUserPassword,
  updateAppUser,
} from '@/services/authService'
import type { UserProfile, UserRole } from '@/types/user'
import { ASSIGNABLE_ROLES, ROLE_LABELS, USERS_MANAGE_DENIED, canManageUsers } from '@/utils/permissions'
import {
  RegulatoryIdentityAdminExtras,
  RepsHabilitationField,
  RethusNumberField,
  RethusSpecialtyField,
  ensureSpecialtyInRepsPortfolio,
} from '@/components/settings/RegulatoryIdentityFields'
import type { OdontologyThsSpecialtyId } from '@/constants/ripsThsSpecialty'

function assignableRoleValue(role: UserRole | undefined): UserRole {
  return role === 'superadmin' ? 'admin' : (role ?? 'odontologo')
}

const DOCUMENT_TYPES = [
  { value: 'CC', label: 'Cédula de Ciudadanía' },
  { value: 'TI', label: 'Tarjeta de Identidad' },
  { value: 'CE', label: 'Cédula de Extranjería' },
  { value: 'PA', label: 'Pasaporte' },
]

function emptyUserForm(clinicName = ''): Omit<UserProfile, 'id'> & { password: string } {
  return {
    email: '',
    firstName: '',
    lastName: '',
    documentType: 'CC',
    documentNumber: '',
    professionalLicense: '',
    role: 'odontologo',
    clinicName,
    providerNit: '',
    repsCode: '',
    repsStatus: 'activo',
    rethusNumber: '',
    rethusStatus: 'activo',
    thsSpecialty: 'odontologia_general',
    repsEnabledSpecialties: ['odontologia_general'],
    password: '',
  }
}

export function UsersManagementPage() {
  const { user: currentUser } = useAuth()
  const { audit } = useAudit()
  const users = useLiveQuery(() => listAppUsers())

  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(() =>
    emptyUserForm(currentUser?.clinicName ?? ''),
  )
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null)
  const [editForm, setEditForm] = useState<Partial<UserProfile>>({})
  const [resetUserId, setResetUserId] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const canManage = canManageUsers(currentUser?.role)

  const showMsg = (text: string) => {
    setMessage(text)
    setError('')
    setTimeout(() => setMessage(''), 4000)
  }

  const showErr = (text: string) => {
    setError(text)
    setMessage('')
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canManage) {
      showErr(USERS_MANAGE_DENIED)
      return
    }
    const { password, ...userData } = createForm
    const result = await createAppUser(userData, password)
    if (!result.ok) {
      showErr(result.error)
      return
    }
    await upsertProfessionalFromUser(result.user)
    await audit({
      action: 'CREATE_USER',
      resourceType: 'user',
      resourceId: result.user.id,
      details: `${result.user.email} — ${ROLE_LABELS[result.user.role]}`,
    })
    setShowCreate(false)
    setCreateForm(emptyUserForm(currentUser?.clinicName ?? ''))
    showMsg('Usuario creado correctamente.')
  }

  const openEdit = (u: UserProfile) => {
    setEditingUser(u)
    setEditForm({
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      documentType: u.documentType,
      documentNumber: u.documentNumber,
      professionalLicense: u.professionalLicense ?? '',
      role: u.role,
      clinicName: u.clinicName,
      providerNit: u.providerNit ?? '',
      repsCode: u.repsCode ?? '',
      repsStatus: u.repsStatus ?? 'activo',
      rethusNumber: u.rethusNumber ?? '',
      rethusStatus: u.rethusStatus ?? 'activo',
      thsSpecialty: u.thsSpecialty ?? 'odontologia_general',
      repsEnabledSpecialties:
        u.repsEnabledSpecialties?.length
          ? u.repsEnabledSpecialties
          : [u.thsSpecialty ?? 'odontologia_general'],
    })
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return
    if (!canManage) {
      showErr(USERS_MANAGE_DENIED)
      return
    }
    const result = await updateAppUser(editingUser.id, {
      ...editForm,
      rehusSpecialty: editForm.thsSpecialty ?? editingUser.thsSpecialty,
    })
    if (!result.ok) {
      showErr(result.error)
      return
    }
    const updated = await db.users.get(editingUser.id)
    if (updated) await upsertProfessionalFromUser(updated)
    await audit({
      action: 'UPDATE_USER',
      resourceType: 'user',
      resourceId: editingUser.id,
      details: `Actualización de ${editingUser.email}`,
    })
    setEditingUser(null)
    showMsg('Usuario actualizado.')
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetUserId) return
    if (!canManage) {
      showErr(USERS_MANAGE_DENIED)
      return
    }
    const result = await resetAppUserPassword(resetUserId, newPassword)
    if (!result.ok) {
      showErr(result.error)
      return
    }
    await audit({
      action: 'RESET_USER_PASSWORD',
      resourceType: 'user',
      resourceId: resetUserId,
      details: 'Contraseña restablecida por administrador',
    })
    setResetUserId(null)
    setNewPassword('')
    showMsg('Contraseña restablecida.')
  }

  const handleDelete = async (u: UserProfile) => {
    if (!currentUser || !canManage) return
    if (!window.confirm(`¿Eliminar el usuario ${u.email}? Esta acción no se puede deshacer.`)) {
      return
    }
    const result = await deleteAppUser(u.id, currentUser.id)
    if (!result.ok) {
      showErr(result.error)
      return
    }
    await audit({
      action: 'DELETE_USER',
      resourceType: 'user',
      resourceId: u.id,
      details: `Usuario eliminado: ${u.email}`,
    })
    showMsg('Usuario eliminado.')
  }

  const handleRoleChange = async (u: UserProfile, role: UserRole) => {
    if (!canManage) return
    if (assignableRoleValue(u.role) === role) return
    const result = await updateAppUser(u.id, { role })
    if (!result.ok) {
      showErr(result.error)
      return
    }
    await audit({
      action: 'UPDATE_USER',
      resourceType: 'user',
      resourceId: u.id,
      details: `Rol de ${u.email} → ${ROLE_LABELS[role]}`,
    })
    showMsg(`Rol actualizado a ${ROLE_LABELS[role]}.`)
  }

  return (
    <RequirePermission
      permission="users.manage"
      fallback={
        <div className="card border-amber-200 bg-amber-50 text-sm text-amber-900">
          {USERS_MANAGE_DENIED}
        </div>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Gestión de Usuarios</h1>
            <p className="mt-1 text-sm text-slate-600">
              Solo Administración y Super Administrador pueden crear, editar y asignar roles.
            </p>
          </div>
          {canManage && (
            <button type="button" onClick={() => setShowCreate(true)} className="btn-primary">
              + Nuevo usuario
            </button>
          )}
        </div>

        {(message || error) && (
          <div
            className={`rounded-lg px-4 py-3 text-sm ${
              error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
            }`}
          >
            {error || message}
          </div>
        )}

        <div className="card overflow-hidden p-0">
          {!users ? (
            <p className="p-4 text-sm text-slate-500">Cargando usuarios...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 font-medium text-slate-600">Nombre</th>
                    <th className="px-3 py-2 font-medium text-slate-600">Correo</th>
                    <th className="px-3 py-2 font-medium text-slate-600">Rol</th>
                    <th className="px-3 py-2 font-medium text-slate-600">Documento</th>
                    <th className="px-3 py-2 font-medium text-slate-600">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="px-3 py-2 font-medium text-slate-800">
                        {u.firstName} {u.lastName}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{u.email}</td>
                      <td className="px-3 py-2">
                        <select
                          value={assignableRoleValue(u.role)}
                          disabled={!canManage}
                          onChange={(event) =>
                            handleRoleChange(u, event.target.value as UserRole)
                          }
                          className="input-field py-1 text-xs disabled:cursor-not-allowed disabled:bg-slate-100"
                          aria-label={`Rol de ${u.firstName} ${u.lastName}`}
                        >
                          {ASSIGNABLE_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-600">
                        {u.documentType} {u.documentNumber}
                      </td>
                      <td className="px-3 py-2">
                        {canManage ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(u)}
                            className="text-xs font-medium text-dental-600 hover:underline"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setResetUserId(u.id)
                              setNewPassword('')
                            }}
                            className="text-xs font-medium text-slate-600 hover:underline"
                          >
                            Restablecer clave
                          </button>
                          {u.id !== currentUser?.id && (
                            <button
                              type="button"
                              onClick={() => handleDelete(u)}
                              className="text-xs font-medium text-red-600 hover:underline"
                            >
                              Eliminar
                            </button>
                          )}
                        </div>
                        ) : (
                          <span className="text-xs text-slate-400">Sin permisos</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {showCreate && (
          <Modal title="Nuevo usuario" onClose={() => setShowCreate(false)}>
            <form onSubmit={handleCreate} className="space-y-4">
              <UserFields
                values={createForm}
                onChange={(patch) => setCreateForm({ ...createForm, ...patch })}
                includePassword
                password={createForm.password}
                onPasswordChange={(password) => setCreateForm({ ...createForm, password })}
              />
              <div className="flex gap-2">
                <button type="submit" className="btn-primary">
                  Crear usuario
                </button>
                <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">
                  Cancelar
                </button>
              </div>
            </form>
          </Modal>
        )}

        {editingUser && (
          <Modal title={`Editar: ${editingUser.email}`} onClose={() => setEditingUser(null)}>
            <form onSubmit={handleUpdate} className="space-y-4">
              <UserFields values={editForm} onChange={(patch) => setEditForm({ ...editForm, ...patch })} />
              <div className="flex gap-2">
                <button type="submit" className="btn-primary">
                  Guardar cambios
                </button>
                <button type="button" onClick={() => setEditingUser(null)} className="btn-secondary">
                  Cancelar
                </button>
              </div>
            </form>
          </Modal>
        )}

        {resetUserId && (
          <Modal
            title="Restablecer contraseña"
            onClose={() => {
              setResetUserId(null)
              setNewPassword('')
            }}
          >
            <form onSubmit={handleResetPassword} className="space-y-4">
              <p className="text-sm text-slate-600">
                Ingrese la nueva contraseña para el usuario seleccionado (mínimo 8 caracteres).
              </p>
              <div>
                <label className="label-field">Nueva contraseña</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input-field"
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary">
                  Restablecer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setResetUserId(null)
                    setNewPassword('')
                  }}
                  className="btn-secondary"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </Modal>
        )}
      </div>
    </RequirePermission>
  )
}

function UserFields({
  values,
  onChange,
  includePassword,
  password,
  onPasswordChange,
}: {
  values: Partial<UserProfile>
  onChange: (patch: Partial<UserProfile>) => void
  includePassword?: boolean
  password?: string
  onPasswordChange?: (password: string) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label-field">Nombres</label>
        <input
          required
          value={values.firstName ?? ''}
          onChange={(e) => onChange({ firstName: e.target.value })}
          className="input-field"
        />
      </div>
      <div>
        <label className="label-field">Apellidos</label>
        <input
          required
          value={values.lastName ?? ''}
          onChange={(e) => onChange({ lastName: e.target.value })}
          className="input-field"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="label-field">Correo electrónico</label>
        <input
          type="email"
          required
          value={values.email ?? ''}
          onChange={(e) => onChange({ email: e.target.value })}
          className="input-field"
        />
      </div>
      <div>
        <label className="label-field">Tipo documento</label>
        <select
          value={values.documentType ?? 'CC'}
          onChange={(e) => onChange({ documentType: e.target.value })}
          className="input-field"
        >
          {DOCUMENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label-field">Nº documento</label>
        <input
          required
          value={values.documentNumber ?? ''}
          onChange={(e) => onChange({ documentNumber: e.target.value })}
          className="input-field font-mono"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="label-field">Rol</label>
        <select
          value={assignableRoleValue(values.role)}
          onChange={(e) => onChange({ role: e.target.value as UserRole })}
          className="input-field"
        >
          {ASSIGNABLE_ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <RethusNumberField
          value={values.rethusNumber ?? ''}
          onChange={(rethusNumber) => onChange({ rethusNumber })}
        />
      </div>
      <div>
        <label className="label-field">Nombre de la clínica / consultorio</label>
        <input
          required
          value={values.clinicName ?? ''}
          onChange={(e) => onChange({ clinicName: e.target.value })}
          className="input-field"
        />
      </div>
      <div>
        <label className="label-field">NIT fiscal (DIAN)</label>
        <input
          value={values.providerNit ?? ''}
          onChange={(e) => onChange({ providerNit: e.target.value })}
          className="input-field font-mono"
          placeholder="NIT con dígito de verificación"
        />
      </div>
      <div className="sm:col-span-2">
        <RepsHabilitationField
          value={values.repsCode ?? ''}
          onChange={(repsCode) => onChange({ repsCode })}
        />
      </div>
      <div className="sm:col-span-2">
        <RethusSpecialtyField
          value={(values.thsSpecialty ?? 'odontologia_general') as OdontologyThsSpecialtyId}
          onChange={(thsSpecialty) =>
            onChange({
              thsSpecialty,
              rehusSpecialty: thsSpecialty,
              repsEnabledSpecialties: ensureSpecialtyInRepsPortfolio(
                thsSpecialty,
                values.repsEnabledSpecialties ?? [],
              ),
            })
          }
        />
      </div>
      <RegulatoryIdentityAdminExtras
        values={{
          repsCode: values.repsCode ?? '',
          repsStatus: values.repsStatus ?? 'activo',
          rethusNumber: values.rethusNumber ?? '',
          rethusStatus: values.rethusStatus ?? 'activo',
          thsSpecialty: (values.thsSpecialty ?? 'odontologia_general') as OdontologyThsSpecialtyId,
          repsEnabledSpecialties:
            values.repsEnabledSpecialties?.length
              ? values.repsEnabledSpecialties
              : [values.thsSpecialty ?? 'odontologia_general'],
        }}
        onChange={(patch) =>
          onChange({
            ...patch,
            rehusSpecialty: patch.thsSpecialty ?? values.thsSpecialty,
          })
        }
      />
      {includePassword && (
        <div className="sm:col-span-2">
          <label className="label-field">Contraseña inicial</label>
          <input
            type="password"
            required
            minLength={8}
            value={password ?? ''}
            onChange={(e) => onPasswordChange?.(e.target.value)}
            className="input-field"
          />
        </div>
      )}
    </div>
  )
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
