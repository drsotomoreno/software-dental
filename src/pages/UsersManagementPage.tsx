import { useCallback, useEffect, useState } from 'react'
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
import { fetchClinicUsers, type ClinicSeatSnapshot } from '@/services/subscriptionService'
import type { UserProfile, UserRole } from '@/types/user'
import {
  ASSIGNABLE_ROLES,
  ROLE_LABELS,
  USERS_MANAGE_DENIED,
  canManageClinicTeam,
} from '@/utils/permissions'
import {
  DocumentIdentityField,
  RegulatoryIdentityAdminExtras,
  RepsHabilitationField,
  RethusCodeField,
  RethusSpecialtyField,
  ensureSpecialtyInRepsPortfolio,
} from '@/components/settings/RegulatoryIdentityFields'
import type { OdontologyThsSpecialtyId } from '@/constants/ripsThsSpecialty'

function assignableRoleValue(role: UserRole | undefined): UserRole {
  return role === 'superadmin' ? 'admin' : (role ?? 'odontologo')
}

function emptyUserForm(defaults?: {
  clinicName?: string
  legalName?: string
  providerNit?: string
  repsCode?: string
  providerType?: UserProfile['providerType']
}): Omit<UserProfile, 'id'> & { password: string } {
  return {
    email: '',
    firstName: '',
    lastName: '',
    documentType: 'CC',
    documentNumber: '',
    role: 'odontologo',
    clinicName: defaults?.clinicName ?? '',
    legalName: defaults?.legalName ?? defaults?.clinicName ?? '',
    providerType: defaults?.providerType ?? 'profesional_independiente',
    providerNit: defaults?.providerNit ?? '',
    repsCode: defaults?.repsCode ?? '',
    repsStatus: 'activo',
    rethusNumber: '',
    rethusStatus: 'activo',
    thsSpecialty: 'odontologia_general',
    repsEnabledSpecialties: ['odontologia_general'],
    password: '',
  }
}

function sedeDefaults(user: UserProfile | null | undefined) {
  return {
    clinicName: user?.clinicName,
    legalName: user?.legalName,
    providerNit: user?.providerNit,
    repsCode: user?.repsCode,
    providerType: user?.providerType,
  }
}

function userLabel(user: Pick<UserProfile, 'firstName' | 'lastName' | 'documentNumber' | 'email'>) {
  const name = `${user.firstName} ${user.lastName}`.trim()
  if (user.documentNumber) return `${name} · ${user.documentNumber}`
  return user.email ? `${name} · ${user.email}` : name
}

export function UsersManagementPage() {
  const { user: currentUser } = useAuth()
  const { audit } = useAudit()
  const [users, setUsers] = useState<UserProfile[] | null>(null)
  const [seats, setSeats] = useState<ClinicSeatSnapshot | null>(null)

  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(() =>
    emptyUserForm(sedeDefaults(currentUser)),
  )
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null)
  const [editForm, setEditForm] = useState<Partial<UserProfile>>({})
  const [resetUserId, setResetUserId] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const canManage = canManageClinicTeam(currentUser)
  const seatsExhausted = Boolean(seats && seats.max != null && seats.used >= seats.max)

  const reloadUsers = useCallback(async () => {
    const api = await fetchClinicUsers()
    if (api.ok) {
      setUsers(api.users)
      setSeats(api.seats)
      return
    }
    setUsers(await listAppUsers())
  }, [])

  useEffect(() => {
    void reloadUsers()
  }, [reloadUsers])

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
    if (seatsExhausted) {
      showErr(
        `Su plan ${seats?.planName ?? 'actual'} permite máximo ${seats?.max} colaboradores. Actualmente tiene ${seats?.used}. Mejore el plan para agregar más usuarios.`,
      )
      return
    }
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
      details: `${userLabel(result.user)} — ${ROLE_LABELS[result.user.role]}`,
    })
    setShowCreate(false)
    setCreateForm(emptyUserForm(sedeDefaults(currentUser)))
    await reloadUsers()
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
      role: u.role,
      clinicName: u.clinicName,
      legalName: u.legalName ?? u.clinicName,
      providerType: u.providerType ?? 'profesional_independiente',
      providerNit: u.providerNit ?? '',
      repsCode: u.repsCode ?? '',
      repsStatus: u.repsStatus ?? 'activo',
      rethusNumber: u.rethusNumber?.trim() || '',
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
      documentNumber: (editForm.documentNumber ?? '').trim(),
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
    await reloadUsers()
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
    await reloadUsers()
    showMsg('Contraseña temporal asignada.')
  }

  const handleDelete = async (u: UserProfile) => {
    if (!currentUser || !canManage) return
    if (!window.confirm(`¿Eliminar el usuario ${userLabel(u)}? Esta acción no se puede deshacer.`)) {
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
      details: `Usuario eliminado: ${userLabel(u)}`,
    })
    await reloadUsers()
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
      details: `Rol de ${userLabel(u)} → ${ROLE_LABELS[role]}`,
    })
    await reloadUsers()
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
              El administrador de esta clínica crea colaboradores con cédula y una contraseña
              temporal. El correo no es obligatorio.
            </p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => {
                if (seatsExhausted) {
                  showErr(
                    `Su plan ${seats?.planName ?? 'actual'} permite máximo ${seats?.max} colaboradores. Actualmente tiene ${seats?.used}. Mejore el plan para agregar más usuarios.`,
                  )
                  return
                }
                setShowCreate(true)
              }}
              className="btn-primary"
            >
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

        {seats && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              seatsExhausted
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-slate-200 bg-slate-50 text-slate-700'
            }`}
          >
            {seats.max == null ? (
              <>Licencias de colaboradores: sin tope en esta cuenta.</>
            ) : (
              <>
                Plan {seats.planName}: {seats.used} de {seats.max} colaboradores.
                {seatsExhausted
                  ? ' Alcanzó el máximo de su plan. Mejore la suscripción para agregar más usuarios.'
                  : ''}
              </>
            )}
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
                    <th className="px-3 py-2 font-medium text-slate-600">Documento</th>
                    <th className="px-3 py-2 font-medium text-slate-600">Correo (opcional)</th>
                    <th className="px-3 py-2 font-medium text-slate-600">Rol</th>
                    <th className="px-3 py-2 font-medium text-slate-600">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="px-3 py-2 font-medium text-slate-800">
                        {u.firstName} {u.lastName}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-600">
                        {u.documentType} {u.documentNumber}
                        {u.isClinicOwner ? (
                          <span className="ml-2 rounded bg-dental-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-dental-700">
                            Titular
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{u.email || '—'}</td>
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
                          {u.id !== currentUser?.id && !u.isClinicOwner && (
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
          <Modal title={`Editar: ${userLabel(editingUser)}`} onClose={() => setEditingUser(null)}>
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
        <label className="label-field">Correo electrónico (opcional)</label>
        <input
          type="email"
          value={values.email ?? ''}
          onChange={(e) => onChange({ email: e.target.value })}
          className="input-field"
          placeholder="No es necesario para ingresar"
        />
        <p className="mt-1 text-xs text-slate-500">
          El colaborador inicia sesión con su cédula y la contraseña que usted asigne. El correo no
          se verifica ni es obligatorio.
        </p>
      </div>
      <DocumentIdentityField
        compact
        documentType={values.documentType ?? 'CC'}
        documentNumber={values.documentNumber ?? ''}
        onChange={onChange}
      />
      <div>
        <RethusCodeField
          compact
          required={false}
          value={values.rethusNumber ?? ''}
          onChange={(rethusNumber) => onChange({ rethusNumber })}
        />
        <p className="mt-1 text-xs text-slate-500">
          Cada odontólogo se identifica con su ReTHUS. El REPS y el NIT de la sede se heredan de la
          IPS o del consultorio.
        </p>
      </div>
      <div>
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
      <div>
        <label className="label-field">Razón social / nombre legal</label>
        <input
          value={values.legalName ?? values.clinicName ?? ''}
          onChange={(e) => onChange({ legalName: e.target.value })}
          className="input-field"
        />
      </div>
      <div>
        <label className="label-field">Nombre de la clínica / consultorio</label>
        <input
          required={false}
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
          <label className="label-field">Contraseña temporal</label>
          <input
            type="password"
            required
            minLength={8}
            value={password ?? ''}
            onChange={(e) => onPasswordChange?.(e.target.value)}
            className="input-field"
          />
          <p className="mt-1 text-xs text-slate-500">
            El administrador de la clínica asigna esta clave. El colaborador la usa junto con su
            cédula, sin verificación externa.
          </p>
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
