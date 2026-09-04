import { useState, useEffect } from 'react'
import { db } from '@/db/database'
import { useAuth } from '@/contexts/AuthContext'
import { useAudit } from '@/hooks/useAudit'
import { changeUserPassword } from '@/services/authService'
import { upsertProfessionalFromUser } from '@/services/dentalServiceCatalogService'
import { ROLE_LABELS } from '@/utils/permissions'
import { LocalBackupPanel } from '@/components/backup/LocalBackupPanel'
import { ClearTestDatabasePanel } from '@/components/settings/ClearTestDatabasePanel'
import { MailSettingsPanel } from '@/components/settings/MailSettingsPanel'
import {
  DocumentIdentityField,
  RepsHabilitationField,
  RethusCodeField,
  RethusSpecialtyField,
  ensureSpecialtyInRepsPortfolio,
} from '@/components/settings/RegulatoryIdentityFields'
import { getStoredApiAuth, setStoredApiAuth } from '@/services/apiAuthService'
import { updateOwnProfile } from '@/services/subscriptionService'
import type { OdontologyThsSpecialtyId } from '@/constants/ripsThsSpecialty'
import type { RepsHabilitationStatus } from '@/utils/repsCode'
import { validateActiveRepsSede } from '@/utils/repsCode'
import { validateProfessionalDocumentNumber } from '@/utils/professionalDocument'
import { validateRethusNumberFormat } from '@/utils/rethusNumber'

export function ProfilePage() {
  const { user, can, refreshSessionUser } = useAuth()
  const { audit } = useAudit()
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [passwordError, setPasswordError] = useState('')

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    documentType: 'CC',
    documentNumber: '',
    rethusNumber: '',
    clinicName: '',
    providerNit: '',
    repsCode: '',
    repsStatus: 'activo' as RepsHabilitationStatus,
    thsSpecialty: 'odontologia_general' as OdontologyThsSpecialtyId,
    repsEnabledSpecialties: ['odontologia_general'] as OdontologyThsSpecialtyId[],
  })

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  useEffect(() => {
    if (user) {
      setForm({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        documentType: user.documentType || 'CC',
        documentNumber: user.documentNumber ?? '',
        rethusNumber: user.rethusNumber ?? '',
        clinicName: user.clinicName,
        providerNit: user.providerNit ?? '',
        repsCode: user.repsCode ?? '',
        repsStatus: user.repsStatus ?? 'activo',
        thsSpecialty: user.thsSpecialty ?? 'odontologia_general',
        repsEnabledSpecialties:
          user.repsEnabledSpecialties?.length
            ? user.repsEnabledSpecialties
            : [user.thsSpecialty ?? 'odontologia_general'],
      })
    }
  }, [user])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user?.id) return
    setSaveError('')

    const documentCheck = validateProfessionalDocumentNumber(form.documentNumber)
    if (!documentCheck.valid) {
      setSaveError(documentCheck.message ?? 'El número de documento es obligatorio.')
      return
    }

    if (form.rethusNumber.trim()) {
      const rethus = validateRethusNumberFormat(form.rethusNumber)
      if (!rethus.valid) {
        setSaveError(rethus.message ?? 'El código ReTHUS no es válido.')
        return
      }
    }

    if (form.repsCode.trim()) {
      const reps = validateActiveRepsSede(form.repsCode, form.repsStatus)
      if (!reps.valid) {
        setSaveError(reps.message ?? 'El código REPS no es válido.')
        return
      }
    }

    const repsEnabledSpecialties = ensureSpecialtyInRepsPortfolio(
      form.thsSpecialty,
      form.repsEnabledSpecialties,
    )
    const patch = {
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      documentType: form.documentType,
      documentNumber: documentCheck.normalized ?? form.documentNumber.trim(),
      rethusNumber: form.rethusNumber.trim(),
      clinicName: form.clinicName,
      providerNit: form.providerNit,
      repsCode: form.repsCode,
      repsStatus: form.repsStatus,
      thsSpecialty: form.thsSpecialty,
      rehusSpecialty: form.thsSpecialty,
      repsEnabledSpecialties,
    }

    const apiAuth = getStoredApiAuth()
    if (apiAuth?.token) {
      const remote = await updateOwnProfile(patch)
      if (!remote.ok) {
        setSaveError(remote.error)
        return
      }
      setStoredApiAuth(apiAuth.token, remote.user)
    }

    const localUser = await db.users.get(user.id)
    if (localUser) {
      await db.users.update(user.id, patch)
      await upsertProfessionalFromUser({ ...localUser, ...patch })
    } else {
      await upsertProfessionalFromUser({ ...user, ...patch })
    }
    await refreshSessionUser()
    await audit({
      action: 'UPDATE_PROFILE',
      resourceType: 'profile',
      resourceId: user.id,
      details: 'Actualización de datos del profesional',
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user?.id) return
    setPasswordError('')

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('La confirmación de contraseña no coincide.')
      return
    }

    const result = await changeUserPassword(
      user.id,
      passwordForm.currentPassword,
      passwordForm.newPassword,
    )

    if (!result.ok) {
      setPasswordError(result.error)
      return
    }

    await audit({
      action: 'CHANGE_PASSWORD',
      resourceType: 'profile',
      resourceId: user.id,
      details: 'Cambio de contraseña exitoso',
    })

    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    setPasswordSaved(true)
    setTimeout(() => setPasswordSaved(false), 3000)
  }

  if (!user) return <p className="text-slate-500">Cargando perfil...</p>

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <form onSubmit={handleSave} className="card space-y-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Mi perfil</h1>
          <p className="mt-1 text-sm text-slate-500">
            {ROLE_LABELS[user.role]} · {user.email}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-700">
              Nombres
            </label>
            <input
              value={form.firstName || user.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-700">
              Apellidos
            </label>
            <input
              value={form.lastName || user.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              className="input-field"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-slate-700">
            Correo electrónico
          </label>
          <input
            type="email"
            value={form.email || user.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="input-field bg-slate-50"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DocumentIdentityField
            compact
            documentType={form.documentType}
            documentNumber={form.documentNumber}
            onChange={(patch) => setForm({ ...form, ...patch })}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <RethusCodeField
            compact
            value={form.rethusNumber}
            onChange={(rethusNumber) => setForm({ ...form, rethusNumber })}
          />
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-700">
              Nombre de la clínica / consultorio
            </label>
            <input
              value={form.clinicName || user.clinicName}
              onChange={(e) => setForm({ ...form, clinicName: e.target.value })}
              className="input-field"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-700">
              NIT fiscal (DIAN)
            </label>
            <input
              value={form.providerNit || user.providerNit || ''}
              onChange={(e) => setForm({ ...form, providerNit: e.target.value })}
              className="input-field font-mono"
              placeholder="NIT con dígito de verificación"
            />
          </div>
          <RepsHabilitationField
            compact
            value={form.repsCode}
            onChange={(repsCode) => setForm({ ...form, repsCode })}
          />
        </div>
        <RethusSpecialtyField
          value={form.thsSpecialty}
          onChange={(thsSpecialty) =>
            setForm({
              ...form,
              thsSpecialty,
              repsEnabledSpecialties: ensureSpecialtyInRepsPortfolio(
                thsSpecialty,
                form.repsEnabledSpecialties,
              ),
            })
          }
        />
        {saveError ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</p>
        ) : null}
        <button type="submit" className="btn-primary w-full py-2.5">
          Guardar cambios
        </button>
        {saved && <p className="text-sm text-green-600">Perfil actualizado.</p>}
      </form>

      <form onSubmit={handlePasswordChange} className="card space-y-4">
        <h2 className="text-base font-semibold text-slate-800">Cambiar contraseña</h2>
        <p className="text-xs text-slate-500">
          Use al menos 8 caracteres. El cambio queda registrado en la bitácora de auditoría.
        </p>
        <div>
          <label className="label-field">Contraseña actual</label>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={passwordForm.currentPassword}
            onChange={(e) =>
              setPasswordForm({ ...passwordForm, currentPassword: e.target.value })
            }
            className="input-field"
          />
        </div>
        <div>
          <label className="label-field">Nueva contraseña</label>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={passwordForm.newPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
            className="input-field"
          />
        </div>
        <div>
          <label className="label-field">Confirmar nueva contraseña</label>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={passwordForm.confirmPassword}
            onChange={(e) =>
              setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
            }
            className="input-field"
          />
        </div>
        {passwordError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{passwordError}</p>
        )}
        <button type="submit" className="btn-secondary">
          Actualizar contraseña
        </button>
        {passwordSaved && (
          <p className="text-sm text-green-600">Contraseña actualizada correctamente.</p>
        )}
      </form>

      {(getStoredApiAuth()?.user?.rol === 'superadmin' || user.role === 'superadmin') && (
        <MailSettingsPanel />
      )}

      {can('backups.manage') && (
        <div className="card space-y-3">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Copias de seguridad</h2>
            <p className="mt-1 text-sm text-slate-600">
              Descargue o restaure IndexedDB (pacientes, evoluciones, facturas y RIPS) al cambiar
              de computador o al cerrar la jornada.
            </p>
          </div>
          <LocalBackupPanel compact />
        </div>
      )}

      {can('backups.manage') && <ClearTestDatabasePanel />}
    </div>
  )
}
