import { useState } from 'react'
import { APP_INITIALS, APP_NAME } from '@/constants/branding'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { getStoredApiAuth } from '@/services/apiAuthService'

type AuthMode = 'login' | 'register' | 'verify'

async function postJson(url: string, body: Record<string, string>) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  return { response, payload }
}

export function LoginPage() {
  const { user, login, isLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/app'
  const apiAuth = getStoredApiAuth()
  const isSuperAdmin = localStorage.getItem('doctorSEO_rol') === 'superadmin'

  const [mode, setMode] = useState<AuthMode>('login')
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const afterLogin =
    !from || from === '/' || from === '/login' ? '/app' : from

  if (!isLoading && (user || apiAuth?.token || isSuperAdmin)) {
    return <Navigate to={afterLogin} replace />
  }

  const switchMode = (next: AuthMode) => {
    setMode(next)
    setError('')
    setInfo('')
    setCode('')
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const result = await login(email, password)
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    navigate(afterLogin, { replace: true })
  }

  const requestCode = async () => {
    setError('')
    setInfo('')
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.')
      return false
    }
    setSubmitting(true)
    try {
      const { response, payload } = await postJson('/api/auth/register/request-code', {
        nombre: nombre.trim(),
        email: email.trim().toLowerCase(),
        password,
      })
      if (!response.ok) {
        setError(payload.error || 'No se pudo enviar el código.')
        return false
      }
      setInfo(payload.message || 'Enviamos un código de 6 dígitos a su correo.')
      setMode('verify')
      return true
    } catch {
      setError('No se pudo conectar con el servidor. Intente de nuevo.')
      return false
    } finally {
      setSubmitting(false)
    }
  }

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault()
    await requestCode()
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')
    setSubmitting(true)
    try {
      const { response, payload } = await postJson('/api/auth/register/verify', {
        email: email.trim().toLowerCase(),
        code: code.trim(),
      })
      if (!response.ok) {
        setError(payload.error || 'No se pudo verificar el código.')
        return
      }
      setPassword('')
      setConfirmPassword('')
      setCode('')
      setNombre('')
      setMode('login')
      setInfo('Cuenta creada. Inicie sesión con su correo y contraseña.')
    } catch {
      setError('No se pudo conectar con el servidor. Intente de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  const subtitle =
    mode === 'register'
      ? 'Cree su cuenta — verificaremos su correo'
      : mode === 'verify'
        ? 'Ingrese el código enviado a su correo'
        : 'Acceso seguro — Historia clínica odontológica'

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-dental-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-dental-600 text-lg font-bold text-white">
            {APP_INITIALS}
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
        </div>

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="card space-y-4">
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
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <label className="label-field mb-0">Contraseña</label>
                <Link
                  to="/forgot-password"
                  className="shrink-0 text-sm font-semibold text-dental-700 underline underline-offset-2 hover:text-dental-800"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
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

            {Boolean((location.state as { passwordReset?: boolean } | null)?.passwordReset) && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Contraseña actualizada. Inicie sesión con su nueva clave.
              </p>
            )}

            {info && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{info}</p>
            )}
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? 'Ingresando...' : 'Iniciar sesión'}
            </button>
            <p className="text-center text-sm text-slate-500">
              ¿No tiene cuenta?{' '}
              <button
                type="button"
                onClick={() => switchMode('register')}
                className="font-semibold text-dental-700 hover:underline"
              >
                Registrarse
              </button>
            </p>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={handleRequestCode} className="card space-y-4">
            <div>
              <label className="label-field">Nombre completo</label>
              <input
                type="text"
                autoComplete="name"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="input-field"
                placeholder="Dr. Nombre Apellido"
              />
            </div>
            <div>
              <label className="label-field">Correo electrónico</label>
              <input
                type="email"
                autoComplete="email"
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
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input-field"
                placeholder="••••••••"
              />
            </div>
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? 'Enviando código...' : 'Enviar código de verificación'}
            </button>
            <p className="text-center text-sm text-slate-500">
              ¿Ya tiene cuenta?{' '}
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="font-semibold text-dental-700 hover:underline"
              >
                Iniciar sesión
              </button>
            </p>
          </form>
        )}

        {mode === 'verify' && (
          <form onSubmit={handleVerify} className="card space-y-4">
            {info && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{info}</p>
            )}
            <div>
              <label className="label-field">Código de 6 dígitos</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="input-field tracking-[0.35em]"
                placeholder="000000"
              />
            </div>
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
            <button type="submit" disabled={submitting || code.length !== 6} className="btn-primary w-full">
              {submitting ? 'Verificando...' : 'Verificar y crear cuenta'}
            </button>
            <p className="text-center text-sm text-slate-500">
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  void requestCode()
                }}
                className="font-semibold text-dental-700 hover:underline disabled:opacity-50"
              >
                Reenviar código
              </button>
              {' · '}
              <button
                type="button"
                onClick={() => switchMode('register')}
                className="font-semibold text-dental-700 hover:underline"
              >
                Volver
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
