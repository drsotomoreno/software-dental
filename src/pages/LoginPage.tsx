import { useState } from 'react'
import { APP_INITIALS, APP_NAME } from '@/constants/branding'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { getStoredApiAuth } from '@/services/apiAuthService'
import { DEMO_DEFAULT_PASSWORD } from '@/types/auth'

export function LoginPage() {
  const { user, login, isLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  const apiAuth = getStoredApiAuth()
  const isSuperAdmin = localStorage.getItem('doctorSEO_rol') === 'superadmin'

  const [email, setEmail] = useState('odontologo@clinica.co')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!isLoading && (user || apiAuth?.token || isSuperAdmin)) {
    return <Navigate to={from} replace />
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const result = await login(email, password)
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    navigate(from, { replace: true })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-dental-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-dental-600 text-lg font-bold text-white">
            {APP_INITIALS}
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-slate-600">
            Acceso seguro — Historia clínica odontológica
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label className="label-field">Correo electrónico</label>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="usuario@clinica.co"
            />
          </div>
          <div>
            <label className="label-field">Contraseña</label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? 'Ingresando...' : 'Iniciar sesión'}
          </button>
        </form>

        <div className="mt-6 rounded-lg border border-slate-200 bg-white/80 p-4 text-xs text-slate-600">
          <p className="font-medium text-slate-800">Usuarios demo</p>
          <ul className="mt-2 space-y-1">
            <li>
              <strong>Odontólogo:</strong> odontologo@clinica.co
            </li>
            <li>
              <strong>Administrador:</strong> admin@clinica.co
            </li>
            <li>
              <strong>Contraseña:</strong> {DEMO_DEFAULT_PASSWORD}
            </li>
          </ul>
          <p className="mt-2 text-slate-500">
            Los accesos quedan registrados en la bitácora de auditoría (Ley 1581 / custodia HC).
          </p>
        </div>
      </div>
    </div>
  )
}
