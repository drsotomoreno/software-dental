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
import {
  PROVIDER_TYPES,
  isInstitutionProvider,
  normalizeProviderType,
} from '@/utils/providerType'

type ProviderTypeId = 'institucion' | 'profesional_independiente'

type IdentityDraft = {
  firstName: string
  lastName: string
  legalName: string
  documentType: string
  documentNumber: string
  rethusNumber: string
  clinicName: string
  providerNit: string
  repsCode: string
  repsStatus: RepsHabilitationStatus
  thsSpecialty: OdontologyThsSpecialtyId
  repsEnabledSpecialties: OdontologyThsSpecialtyId[]
}

function emptyIdentityDraft(): IdentityDraft {
  return {
    firstName: '',
    lastName: '',
    legalName: '',
    documentType: 'CC',
    documentNumber: '',
    rethusNumber: '',
    clinicName: '',
    providerNit: '',
    repsCode: '',
    repsStatus: 'activo',
    thsSpecialty: 'odontologia_general',
    repsEnabledSpecialties: ['odontologia_general'],
  }
}

function identityDraftFromUser(
  user: {
    providerType?: string
    firstName?: string
    lastName?: string
    legalName?: string
    clinicName?: string
    documentType?: string
    documentNumber?: string
    rethusNumber?: string
    providerNit?: string
    repsCode?: string
    repsStatus?: RepsHabilitationStatus
    thsSpecialty?: OdontologyThsSpecialtyId
    repsEnabledSpecialties?: OdontologyThsSpecialtyId[]
  },
  type: ProviderTypeId,
): IdentityDraft {
  const savedType = normalizeProviderType(user.providerType)
  if (savedType !== type) return emptyIdentityDraft()
  const names = splitPersonName({
    firstName: user.firstName,
    lastName: user.lastName,
  })
  const institution = isInstitutionProvider(type)
  return {
    firstName: names.firstName,
    lastName: names.lastName,
    legalName: institution ? user.legalName ?? '' : '',
    documentType: user.documentType || 'CC',
    documentNumber: institution ? '' : user.documentNumber ?? '',
    rethusNumber: institution ? '' : user.rethusNumber ?? '',
    clinicName: user.clinicName ?? '',
    providerNit: formatNitInput(user.providerNit ?? ''),
    repsCode: user.repsCode ?? '',
    repsStatus: user.repsStatus ?? 'activo',
    thsSpecialty: user.thsSpecialty ?? 'odontologia_general',
    repsEnabledSpecialties: user.repsEnabledSpecialties?.length
      ? user.repsEnabledSpecialties
      : [user.thsSpecialty ?? 'odontologia_general'],
  }
}

export function ProfilePage() {
  const { user, can, applySessionUser } = useAuth()
  const { audit } = useAudit()
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [passwordError, setPasswordError] = useState('')

  const [providerType, setProviderType] = useState<ProviderTypeId>('profesional_independiente')
  const [email, setEmail] = useState('')
  const [drafts, setDrafts] = useState<Record<ProviderTypeId, IdentityDraft>>({
    institucion: emptyIdentityDraft(),
    profesional_independiente: emptyIdentityDraft(),
  })
  const form = drafts[providerType]
  const updateDraft = (patch: Partial<IdentityDraft>) => {
    setDrafts((current) => ({
      ...current,
      [providerType]: { ...current[providerType], ...patch },
    }))
  }

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!user) return
    const savedType = normalizeProviderType(user.providerType)
    setProviderType(savedType)
    setEmail(user.email)
    setDrafts({
      institucion: identityDraftFromUser(user, 'institucion'),
      profesional_independiente: identityDraftFromUser(user, 'profesional_independiente'),
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
        providerType,
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
        legalName: isInstitutionProvider(identity.providerType) ? identity.legalName : '',
        documentType: identity.documentType,
        documentNumber: isInstitutionProvider(identity.providerType) ? '' : identity.documentNumber,
        rethusNumber: isInstitutionProvider(identity.providerType) ? '' : identity.rethusNumber,
        clinicName: identity.clinicName,
        providerNit: identity.providerNitDisplay || identity.providerNit,
        repsCode: identity.repsDisplay || identity.repsCode,
        repsStatus: form.repsStatus,
        thsSpecialty: form.thsSpecialty,
        rehusSpecialty: form.thsSpecialty,
        repsEnabledSpecialties,
      }

      const apiAuth = getStoredApiAuth()
      const remote = await updateOwnProfile({
        ...patch,
        clientEmail: email || apiAuth?.user?.email,
        clientUserId: apiAuth?.user?.id,
      })
      const sessionUnavailable =
        !remote.ok &&
        (remote.error === 'SESSION_UNAVAILABLE' ||
          /sesi[oó]n inv[aá]lida|expirada/i.test(remote.error))
      if (!remote.ok && !sessionUnavailable) {
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
      if (remote.ok) {
        const latestAuth = getStoredApiAuth()
        setStoredApiAuth(latestAuth?.token ?? apiAuth?.token ?? `session-${remote.user.id}`, remote.user)
        applySessionUser(remote.user)
        const remoteType = normalizeProviderType(remote.user.providerType)
        setProviderType(remoteType)
        setDrafts({
          institucion: identityDraftFromUser(remote.user, 'institucion'),
          profesional_independiente: identityDraftFromUser(remote.user, 'profesional_independiente'),
        })
      } else {
        const savedType = normalizeProviderType(identity.providerType)
        setProviderType(savedType)
        setDrafts({
          institucion: savedType === 'institucion' ? { ...form, legalName: identity.legalName } : emptyIdentityDraft(),
          profesional_independiente:
            savedType === 'profesional_independiente'
              ? { ...form, legalName: '', documentNumber: identity.documentNumber, rethusNumber: identity.rethusNumber }
              : emptyIdentityDraft(),
        })
      }

      try {
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
      } catch (localError) {
        console.error('[perfil] La API guardó el perfil; IndexedDB local falló:', localError)
      }
      setSaved(true)
      window.setTimeout(() => setSaved(false), 5000)
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
            const selected = providerType === option.id
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
                  onChange={() => {
                    setFieldErrors({})
                    setSaveError('')
                    setProviderType(option.id as ProviderTypeId)
                  }}
                />
                <span>
                  <span className="block text-sm font-medium text-slate-800">{option.label}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{option.hint}</span>
                </span>
              </label>
            )
          })}
          <p className="text-xs text-slate-500">
            IPS y profesional independiente tienen formularios distintos. Solo se conserva el tipo
            que pulse en Guardar.
          </p>
        </fieldset>
        {isInstitutionProvider(providerType) ? (
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-700">
              Razón social
            </label>
            <input
              value={form.legalName}
              onChange={(e) => updateDraft({ legalName: e.target.value })}
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
              {isInstitutionProvider(providerType) ? 'Nombres del representante' : 'Nombres'}
            </label>
            <input
              value={form.firstName}
              onChange={(e) => updateDraft({ firstName: cleanPersonNameInput(e.target.value) })}
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
              {isInstitutionProvider(providerType) ? 'Apellidos del representante' : 'Apellidos'}
            </label>
            <input
              value={form.lastName}
              onChange={(e) => updateDraft({ lastName: cleanPersonNameInput(e.target.value) })}
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
            value={email}
            readOnly
            autoComplete="email"
            className="input-field bg-slate-50 text-slate-600"
          />
          <p className="mt-1 text-xs text-slate-500">
            El correo de sesión no se modifica desde aquí.
          </p>
        </div>
        {!isInstitutionProvider(providerType) ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DocumentIdentityField
              compact
              required
              documentType={form.documentType}
              documentNumber={form.documentNumber}
              error={fieldErrors.documentNumber}
              onChange={(patch) => updateDraft(patch)}
            />
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {!isInstitutionProvider(providerType) ? (
            <RethusCodeField
              compact
              required
              value={form.rethusNumber}
              error={fieldErrors.rethusNumber}
              onChange={(rethusNumber) => updateDraft({ rethusNumber })}
            />
          ) : null}
          <div className={isInstitutionProvider(providerType) ? 'sm:col-span-2' : ''}>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-700">
              {isInstitutionProvider(providerType)
                ? 'Nombre comercial de la sede'
                : 'Nombre de la clínica / consultorio'}
            </label>
            <input
              value={form.clinicName}
              onChange={(e) => updateDraft({ clinicName: e.target.value })}
              autoComplete="organization"
              className={`input-field ${fieldErrors.clinicName ? 'border-red-400' : ''}`}
              placeholder={
                isInstitutionProvider(providerType)
                  ? 'Opcional si coincide con la razón social'
                  : ''
              }
            />
            {fieldErrors.clinicName ? (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.clinicName}</p>
            ) : isInstitutionProvider(providerType) ? (
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
              onChange={(e) => updateDraft({ providerNit: formatNitInput(e.target.value) })}
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
            onChange={(repsCode) => updateDraft({ repsCode })}
          />
        </div>
        <RethusSpecialtyField
          value={form.thsSpecialty}
          onChange={(thsSpecialty) =>
            updateDraft({
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
