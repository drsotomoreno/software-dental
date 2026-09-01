import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { APP_INITIALS, APP_NAME } from '@/constants/branding'

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token')?.trim() ?? ''
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(payload.error || 'No se pudo actualizar la contraseña.')
        return
      }
      navigate('/login', { replace: true, state: { passwordReset: true } })
    } catch {
      setError('No se pudo conectar con el servidor. Intente de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-dental-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-dental-600 text-lg font-bold text-white">
            {APP_INITIALS}
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-slate-600">Nueva contraseña</p>
        </div>

        {!token ? (
          <div className="card space-y-4">
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              El enlace de recuperación no es válido. Solicite uno nuevo.
            </p>
            <Link to="/forgot-password" className="btn-primary inline-flex w-full">
              Solicitar nuevo enlace
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card space-y-4">
            <div>
              <label className="label-field">Nueva contraseña</label>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="label-field">Confirmar contraseña</label>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="input-field"
                placeholder="••••••••"
              />
            </div>
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? 'Guardando...' : 'Actualizar contraseña'}
            </button>
            <p className="text-center text-sm text-slate-500">
              <Link to="/login" className="font-medium text-dental-700 hover:underline">
                Volver al inicio de sesión
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
