import { useState, useEffect } from 'react'
import { db } from '@/db/database'
import { useAuth } from '@/contexts/AuthContext'
import { useAudit } from '@/hooks/useAudit'
import { changeUserPassword } from '@/services/authService'
import { ROLE_LABELS } from '@/utils/permissions'
import { LocalBackupPanel } from '@/components/backup/LocalBackupPanel'
import { ClearTestDatabasePanel } from '@/components/settings/ClearTestDatabasePanel'
import {
  ODONTOLOGY_THS_SPECIALTIES,
  type OdontologyThsSpecialtyId,
} from '@/constants/ripsThsSpecialty'

export function ProfilePage() {
  const { user, can } = useAuth()
  const { audit } = useAudit()
  const [saved, setSaved] = useState(false)
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [passwordError, setPasswordError] = useState('')

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    professionalLicense: '',
    clinicName: '',
    providerNit: '',
    repsCode: '',
    thsSpecialty: 'odontologia_general' as OdontologyThsSpecialtyId,
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
        professionalLicense: user.professionalLicense ?? '',
        clinicName: user.clinicName,
        providerNit: user.providerNit ?? '',
        repsCode: user.repsCode ?? '',
        thsSpecialty: user.thsSpecialty ?? 'odontologia_general',
      })
    }
  }, [user])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user?.id) return
    await db.users.update(user.id, {
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      professionalLicense: form.professionalLicense,
      clinicName: form.clinicName,
      providerNit: form.providerNit,
      repsCode: form.repsCode,
      thsSpecialty: form.thsSpecialty,
    })
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
      <div>
        <h1 className="text-2xl font-bold">Mi perfil</h1>
        <p className="mt-1 text-sm text-slate-600">
          {ROLE_LABELS[user.role]} · {user.email}
        </p>
      </div>

      <form onSubmit={handleSave} className="card space-y-4">
        <h2 className="text-base font-semibold text-slate-800">Datos profesionales</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label-field">Nombres</label>
            <input
              value={form.firstName || user.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="label-field">Apellidos</label>
            <input
              value={form.lastName || user.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              className="input-field"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label-field">Correo</label>
            <input
              type="email"
              value={form.email || user.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="label-field">Tarjeta profesional</label>
            <input
              value={form.professionalLicense || user.professionalLicense || ''}
              onChange={(e) => setForm({ ...form, professionalLicense: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="label-field">Clínica</label>
            <input
              value={form.clinicName || user.clinicName}
              onChange={(e) => setForm({ ...form, clinicName: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="label-field">NIT prestador (RIPS)</label>
            <input
              value={form.providerNit || user.providerNit || ''}
              onChange={(e) => setForm({ ...form, providerNit: e.target.value })}
              className="input-field font-mono"
            />
          </div>
          <div>
            <label className="label-field">Código REPS</label>
            <input
              value={form.repsCode || user.repsCode || ''}
              onChange={(e) => setForm({ ...form, repsCode: e.target.value })}
              className="input-field font-mono"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label-field">Especialidad THS (REPS)</label>
            <select
              value={form.thsSpecialty || user.thsSpecialty || 'odontologia_general'}
              onChange={(e) =>
                setForm({
                  ...form,
                  thsSpecialty: e.target.value as OdontologyThsSpecialtyId,
                })
              }
              className="input-field"
            >
              {ODONTOLOGY_THS_SPECIALTIES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Debe coincidir con la especialidad habilitada en REPS y con el CUPS de consulta en
              RIPS (validación MUV).
            </p>
          </div>
        </div>
        <button type="submit" className="btn-primary">
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
