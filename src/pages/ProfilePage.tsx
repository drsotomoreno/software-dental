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
import { updateOwnProfile, changeOwnPassword } from '@/services/subscriptionService'
import type { OdontologyThsSpecialtyId } from '@/constants/ripsThsSpecialty'
import type { RepsHabilitationStatus } from '@/utils/repsCode'
import { validateActiveRepsSede } from '@/utils/repsCode'
import { cleanPersonNameInput, splitPersonName } from '@/utils/personName'
import { computeNitDv, extractNitDigits, formatNitInput } from '@/utils/nit'
import { validatePrestadorIdentityFields } from '@/utils/prestadorIdentity'
import { PROVIDER_TYPES, isInstitutionProvider, normalizeProviderType } from '@/utils/providerType'

export function ProfilePage() {
  const { user, can, refreshSessionUser } = useAuth()
  const { audit } = useAudit()
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [passwordError, setPasswordError] = useState('')

  const [form, setForm] = useState({
    providerType: 'profesional_independiente' as 'institucion' | 'profesional_independiente',
    firstName: '',
    lastName: '',
    legalName: '',
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
  const [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!user) return
    const names = splitPersonName({
      firstName: user.firstName,
      lastName: user.lastName,
    })
    setForm({
      providerType: normalizeProviderType(user.providerType),
      firstName: names.firstName,
      lastName: names.lastName,
      legalName: user.legalName ?? user.clinicName ?? '',
      email: user.email,
      documentType: user.documentType || 'CC',
      documentNumber: user.documentNumber ?? '',
      rethusNumber: user.rethusNumber ?? '',
      clinicName: user.clinicName ?? '',
      providerNit: formatNitInput(user.providerNit ?? ''),
      repsCode: user.repsCode ?? '',
      repsStatus: user.repsStatus ?? 'activo',
      thsSpecialty: user.thsSpecialty ?? 'odontologia_general',
      repsEnabledSpecialties:
        user.repsEnabledSpecialties?.length
          ? user.repsEnabledSpecialties
          : [user.thsSpecialty ?? 'odontologia_general'],
    })
  }, [user?.id])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user?.id) return
    setSaveError('')
    setSaved(false)
    setFieldErrors({})
    setSaving(true)

    try {
      const identityCheck = validatePrestadorIdentityFields({
        providerType: form.providerType,
        firstName: form.firstName,
        lastName: form.lastName,
        legalName: form.legalName,
        documentType: form.documentType,
        documentNumber: form.documentNumber,
        clinicName: form.clinicName || form.legalName,
        providerNit: form.providerNit,
        repsCode: form.repsCode,
        rethusNumber: form.rethusNumber,
      })
      if (!identityCheck.valid) {
        setFieldErrors(identityCheck.fieldErrors ?? {})
        setSaveError(identityCheck.message ?? 'Complete la identidad del prestador.')
        return
      }

      const reps = validateActiveRepsSede(identityCheck.identity.repsDisplay || form.repsCode, form.repsStatus)
      if (!reps.valid) {
        setFieldErrors({ repsCode: reps.message ?? 'El código REPS no es válido.' })
        setSaveError(reps.message ?? 'El código REPS no es válido.')
        return
      }

      const identity = identityCheck.identity
      const repsEnabledSpecialties = ensureSpecialtyInRepsPortfolio(
        form.thsSpecialty,
        form.repsEnabledSpecialties,
      )
      const patch = {
        providerType: identity.providerType,
        firstName: identity.firstName,
        lastName: identity.lastName,
        legalName: identity.legalName,
        documentType: identity.documentType,
        documentNumber: identity.documentNumber,
        rethusNumber: identity.rethusNumber,
        clinicName: identity.clinicName,
        providerNit: identity.providerNitDisplay || identity.providerNit,
        repsCode: identity.repsDisplay || identity.repsCode,
        repsStatus: form.repsStatus,
        thsSpecialty: form.thsSpecialty,
        rehusSpecialty: form.thsSpecialty,
        repsEnabledSpecialties,
      }

      setForm((current) => ({
        ...current,
        providerType: identity.providerType,
        firstName: identity.firstName,
        lastName: identity.lastName,
        legalName: identity.legalName,
        documentNumber: identity.documentNumber,
        rethusNumber: identity.rethusNumber,
        clinicName: identity.clinicName,
        providerNit: identity.providerNitDisplay || identity.providerNit,
        repsCode: identity.repsDisplay || identity.repsCode,
      }))

      const apiAuth = getStoredApiAuth()
      if (apiAuth?.token) {
        const remote = await updateOwnProfile(patch)
        if (!remote.ok) {
          setSaveError(remote.error)
          const lower = remote.error.toLowerCase()
          if (lower.includes('cédula') || lower.includes('documento')) {
            setFieldErrors({ documentNumber: remote.error })
          } else if (lower.includes('reps') || lower.includes('dane')) {
            setFieldErrors({ repsCode: remote.error })
          } else if (lower.includes('nit')) {
            setFieldErrors({ providerNit: remote.error })
          } else if (lower.includes('rethus')) {
            setFieldErrors({ rethusNumber: remote.error })
          } else if (lower.includes('apellido')) {
            setFieldErrors({ lastName: remote.error })
          } else if (lower.includes('nombre') || lower.includes('razón')) {
            setFieldErrors({ firstName: remote.error })
          }
          return
        }
        setStoredApiAuth(apiAuth.token, remote.user)
        const remoteType = normalizeProviderType(remote.user.providerType)
        setForm((current) => ({
          ...current,
          providerType: remoteType,
          firstName: remote.user.firstName ?? current.firstName,
          lastName: remote.user.lastName ?? current.lastName,
          legalName: remote.user.legalName ?? current.legalName,
          clinicName: remote.user.clinicName ?? current.clinicName,
          providerNit: formatNitInput(remote.user.providerNit ?? current.providerNit),
          repsCode: remote.user.repsCode ?? current.repsCode,
          documentNumber: remote.user.documentNumber ?? current.documentNumber,
          rethusNumber: remote.user.rethusNumber ?? current.rethusNumber,
        }))
      }

      const localUser = await db.users.get(user.id)
      if (localUser) {
        await db.users.update(user.id, patch)
        await upsertProfessionalFromUser({ ...localUser, ...patch })
      } else {
        await upsertProfessionalFromUser({ ...user, ...patch })
      }
      await audit({
        action: 'UPDATE_PROFILE',
        resourceType: 'profile',
        resourceId: user.id,
        details: 'Actualización de identidad del prestador',
      })
      setSaved(true)
      window.setTimeout(() => setSaved(false), 5000)
      await refreshSessionUser()
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : 'No se pudo guardar el perfil. Intente de nuevo.',
      )
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user?.id) return
    setPasswordError('')

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('La confirmación de contraseña no coincide.')
      return
    }

    const apiAuth = getStoredApiAuth()
    if (apiAuth?.token) {
      const remote = await changeOwnPassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      })
      if (!remote.ok) {
        setPasswordError(remote.error)
        return
      }
      await changeUserPassword(
        user.id,
        passwordForm.currentPassword,
        passwordForm.newPassword,
      )
    } else {
      const result = await changeUserPassword(
        user.id,
        passwordForm.currentPassword,
        passwordForm.newPassword,
      )
      if (!result.ok) {
        setPasswordError(result.error)
        return
      }
    }

    await audit({
      action: 'CHANGE_PASSWORD',
      resourceType: 'profile',
      resourceId: user.id,
      details: 'Cambio de contraseña exitoso',
    })

    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    setPasswordSaved(true)
    setTimeout(() => setPasswordSaved(false), 5000)
  }

  if (!user) return <p className="text-slate-500">Cargando perfil...</p>

  const verifiedAt = getStoredApiAuth()?.user?.prestadorVerifiedAt

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <form onSubmit={handleSave} className="card space-y-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Mi perfil</h1>
          <p className="mt-1 text-sm text-slate-500">
            {ROLE_LABELS[user.role]} · {user.email}
          </p>
          <p className="mt-2 text-xs text-slate-600">
            El código REPS identifica la sede. Una IPS opera con NIT y razón social (sin ReTHUS). Un
            profesional independiente se valida con cédula y ReTHUS.
          </p>
          {verifiedAt ? (
            <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              Prestador verificado. Los datos quedan guardados de forma permanente en la sede REPS.
            </p>
          ) : null}
        </div>
        <fieldset className="space-y-2">
          <legend className="mb-1 block text-xs font-semibold uppercase text-slate-700">
            Tipo de prestador
          </legend>
          {PROVIDER_TYPES.map((option) => {
            const selected = form.providerType === option.id
            return (
              <label
                key={option.id}
                className={`flex cursor-pointer gap-3 rounded-lg border px-3 py-2 ${
                  selected ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="providerType"
                  className="mt-1"
                  checked={selected}
                  onChange={() =>
                    setForm({
                      ...form,
                      providerType: option.id as typeof form.providerType,
                    })
                  }
                />
                <span>
                  <span className="block text-sm font-medium text-slate-800">{option.label}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{option.hint}</span>
                </span>
              </label>
            )
          })}
        </fieldset>
        {isInstitutionProvider(form.providerType) ? (
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-700">
              Razón social
            </label>
            <input
              value={form.legalName}
              onChange={(e) => setForm({ ...form, legalName: e.target.value, clinicName: e.target.value })}
              autoComplete="organization"
              required
              className={`input-field ${fieldErrors.legalName ? 'border-red-400' : ''}`}
              placeholder="Nombre jurídico de la IPS / SAS"
            />
            {fieldErrors.legalName ? (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.legalName}</p>
            ) : null}
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-700">
              {isInstitutionProvider(form.providerType) ? 'Nombres del representante' : 'Nombres'}
            </label>
            <input
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: cleanPersonNameInput(e.target.value) })}
              autoComplete="given-name"
              required
              className={`input-field ${fieldErrors.firstName ? 'border-red-400' : ''}`}
              aria-invalid={Boolean(fieldErrors.firstName)}
            />
            {fieldErrors.firstName ? (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.firstName}</p>
            ) : null}
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-700">
              {isInstitutionProvider(form.providerType) ? 'Apellidos del representante' : 'Apellidos'}
            </label>
            <input
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: cleanPersonNameInput(e.target.value) })}
              autoComplete="family-name"
              required
              className={`input-field ${fieldErrors.lastName ? 'border-red-400' : ''}`}
              aria-invalid={Boolean(fieldErrors.lastName)}
            />
            {fieldErrors.lastName ? (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.lastName}</p>
            ) : null}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-slate-700">
            Correo electrónico
          </label>
          <input
            type="email"
            value={form.email}
            readOnly
            autoComplete="email"
            className="input-field bg-slate-50 text-slate-600"
          />
          <p className="mt-1 text-xs text-slate-500">
            El correo de sesión no se modifica desde aquí.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DocumentIdentityField
            compact
            required={!isInstitutionProvider(form.providerType)}
            documentType={form.documentType}
            documentNumber={form.documentNumber}
            error={fieldErrors.documentNumber}
            onChange={(patch) => setForm({ ...form, ...patch })}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <RethusCodeField
            compact
            required={!isInstitutionProvider(form.providerType)}
            value={form.rethusNumber}
            error={fieldErrors.rethusNumber}
            onChange={(rethusNumber) => setForm({ ...form, rethusNumber })}
          />
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-700">
              {isInstitutionProvider(form.providerType)
                ? 'Nombre comercial de la sede'
                : 'Nombre de la clínica / consultorio'}
            </label>
            <input
              value={form.clinicName}
              onChange={(e) => setForm({ ...form, clinicName: e.target.value })}
              autoComplete="organization"
              className={`input-field ${fieldErrors.clinicName ? 'border-red-400' : ''}`}
              placeholder={
                isInstitutionProvider(form.providerType)
                  ? 'Opcional si coincide con la razón social'
                  : ''
              }
            />
            {fieldErrors.clinicName ? (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.clinicName}</p>
            ) : isInstitutionProvider(form.providerType) ? (
              <p className="mt-1 text-xs text-slate-500">
                Los odontólogos se vinculan en Gestión de usuarios con su ReTHUS individual. Esta
                cuenta factura y genera RIPS con el REPS y el NIT de la IPS.
              </p>
            ) : null}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-700">
              NIT fiscal (DIAN)
            </label>
            <input
              value={form.providerNit}
              onChange={(e) => setForm({ ...form, providerNit: formatNitInput(e.target.value) })}
              className={`input-field font-mono ${fieldErrors.providerNit ? 'border-red-400' : ''}`}
              placeholder="Ej: 79904620-4"
              inputMode="numeric"
              autoComplete="off"
              aria-invalid={Boolean(fieldErrors.providerNit)}
            />
            {fieldErrors.providerNit ? (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.providerNit}</p>
            ) : null}
            {!String(form.providerNit).includes('-') &&
            extractNitDigits(form.providerNit).length >= 8 &&
            extractNitDigits(form.providerNit).length <= 10 ? (
              <p className="mt-1 text-xs text-slate-500">
                DV esperado: {computeNitDv(form.providerNit)}
              </p>
            ) : null}
          </div>
          <RepsHabilitationField
            compact
            value={form.repsCode}
            error={fieldErrors.repsCode}
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
        {saved ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
            Cambios guardados. La identidad de la sede REPS quedó persistida.
          </p>
        ) : null}
        <button type="submit" disabled={saving} className="btn-primary w-full py-2.5 disabled:opacity-60">
          {saving ? 'Verificando identidad...' : 'Guardar cambios'}
        </button>
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
        {passwordSaved ? (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
            Contraseña actualizada. El cambio aplica al inicio de sesión.
          </p>
        ) : null}
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
