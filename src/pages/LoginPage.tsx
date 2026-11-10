import { useState } from 'react'
import { APP_INITIALS, APP_NAME } from '@/constants/branding'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { clearStoredApiAuth, getStoredApiAuth, isApiSuperAdmin } from '@/services/apiAuthService'
import { postAuthDestination } from '@/utils/subscriptionAccess'
import {
  clearExpressRegisterFlag,
  markExpressRegisterComplete,
} from '@/utils/expressRegister'
import { validateColombiaMobile } from '@/utils/phoneValidation'
import { PasswordInput } from '@/components/ui/PasswordInput'

type AuthMode = 'login' | 'register' | 'activate'

function initialAuthMode(pathname: string, searchParams: URLSearchParams): AuthMode {
  const modeParam = (searchParams.get('mode') || searchParams.get('modo') || '').toLowerCase()
  if (
    pathname === '/registro' ||
    modeParam === 'register' ||
    modeParam === 'registro' ||
    modeParam === 'signup'
  ) {
    return 'register'
  }
  return 'login'
}

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
  const [searchParams] = useSearchParams()
  const from = (location.state as { from?: string } | null)?.from ?? '/app'
  const apiAuth = getStoredApiAuth()
  const isSuperAdmin = isApiSuperAdmin(apiAuth?.user)

  const [mode, setMode] = useState<AuthMode>(() =>
    initialAuthMode(location.pathname, searchParams),
  )
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [whatsappUrl, setWhatsappUrl] = useState('')
  const [activationToken, setActivationToken] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const afterLogin =
    !from ||
    from === '/' ||
    from === '/login' ||
    from === '/registro' ||
    from === '/welcome-trial' ||
    from === '/demo'
      ? '/app'
      : from
  const storedUser = apiAuth?.user
  const onRegisterPath = location.pathname === '/registro'
  if (!isLoading && (user || (apiAuth?.token && apiAuth.user)) && !onRegisterPath) {
    const dest =
      storedUser && !isSuperAdmin ? postAuthDestination(storedUser, afterLogin) : afterLogin
    return <Navigate to={dest} replace />
  }

  const switchMode = (next: AuthMode) => {
    setMode(next)
    setError('')
    setInfo('')
    if (next !== 'activate') {
      setWhatsappUrl('')
      setActivationToken('')
    }
  }

  const finishLoginAfterRegister = async (registerEmail: string, registerPassword: string) => {
    clearStoredApiAuth()
    try {
      const { clearClinicIsolationOnLogout } = await import('@/services/clinicLocalIsolation')
      await clearClinicIsolationOnLogout()
    } catch {
      /* ignore */
    }
    markExpressRegisterComplete()
    const result = await login(registerEmail, registerPassword)
    if (result.ok) {
      const session = getStoredApiAuth()
      if (isApiSuperAdmin(session?.user) || session?.user?.email !== registerEmail) {
        clearStoredApiAuth()
        clearExpressRegisterFlag()
        setMode('login')
        setPassword('')
        setConfirmPassword('')
        setError(
          'La cuenta se creó, pero la sesión quedó inválida por seguridad. Inicie sesión con su correo y contraseña.',
        )
        setInfo('Cuenta creada. Use el correo del registro para entrar a la versión demo.')
        return
      }
    }
    if (!result.ok) {
      clearExpressRegisterFlag()
      setMode('login')
      setPassword('')
      setConfirmPassword('')
      setError(
        'Cuenta creada, pero no se pudo iniciar sesión automáticamente. Inicie sesión para continuar.',
      )
      setInfo('Use su correo y contraseña para acceder.')
      return
    }

    setPassword('')
    setConfirmPassword('')
    setNombre('')
    setPhoneNumber('')
    setWhatsappUrl('')
    setActivationToken('')
    navigate('/demo', { replace: true })
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const result = await login(email, password.trim())
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    const sessionUser = getStoredApiAuth()?.user
    navigate(postAuthDestination(sessionUser, afterLogin), { replace: true })
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.')
      return
    }
    const phoneCheck = validateColombiaMobile(phoneNumber)
    if (!phoneCheck.ok) {
      setError(phoneCheck.error || 'Celular colombiano inválido.')
      return
    }
    setSubmitting(true)
    try {
      const { response, payload } = await postJson('/api/auth/register/request-code', {
        nombre: nombre.trim(),
        email: email.trim().toLowerCase(),
        phone_number: phoneCheck.digits,
        password,
      })
      if (!response.ok) {
        setError(payload.error || 'No se pudo completar el registro.')
        return
      }
      setPhoneNumber(phoneCheck.digits)
      setWhatsappUrl(String(payload.whatsapp_url || ''))
      setActivationToken(String(payload.activation_token || ''))
      setInfo(
        payload.message ||
          'Cuenta creada. Active su celular enviando el mensaje por WhatsApp.',
      )
      setMode('activate')
    } catch {
      setError('No se pudo conectar con el servidor. Intente de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  const openWhatsAppActivation = () => {
    if (!whatsappUrl) {
      setError('No hay un enlace de WhatsApp disponible. Vuelva a registrarse.')
      return
    }
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer')
  }

  const continueToDemo = async () => {
    setError('')
    setSubmitting(true)
    try {
      await finishLoginAfterRegister(email.trim().toLowerCase(), password.trim())
    } catch {
      setError('No se pudo iniciar sesión. Intente desde Iniciar sesión.')
    } finally {
      setSubmitting(false)
    }
  }

  const subtitle =
    mode === 'register'
      ? 'Registro express — sin plan entra a la versión demo'
      : mode === 'activate'
        ? 'Active su cuenta enviando un mensaje por WhatsApp'
        : 'Acceso seguro — cédula y contraseña de su clínica'

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
              <label className="label-field">Número de documento (cédula)</label>
              <input
                type="text"
                inputMode="text"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="Cédula o correo del titular"
              />
              <p className="mt-1 text-xs text-slate-500">
                Los colaboradores ingresan con su cédula y la clave asignada por el administrador de
                la clínica. El titular también puede usar su correo.
              </p>
            </div>
            <div>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <label className="label-field mb-0">Contraseña</label>
                <Link
                  to="/forgot-password"
                  className="shrink-0 text-sm font-semibold text-dental-700 underline underline-offset-2 hover:text-dental-800"
                >
                  ¿Olvidó su contraseña?
                </Link>
              </div>
              <PasswordInput
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
          <form onSubmit={handleRegister} className="card space-y-4">
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
              <label className="label-field">Celular (WhatsApp Colombia)</label>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="input-field"
                placeholder="300 123 4567"
              />
              <p className="mt-1 text-xs text-slate-500">
                Indicativo +57. Tras crear la cuenta abrirá WhatsApp para activarla con un mensaje
                único.
              </p>
            </div>
            <div>
              <label className="label-field">Contraseña</label>
              <PasswordInput
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="label-field">Confirmar contraseña</label>
              <PasswordInput
                autoComplete="new-password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? 'Creando cuenta...' : 'Crear cuenta'}
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

        {mode === 'activate' && (
          <div className="card space-y-4">
            {info && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{info}</p>
            )}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-center">
              <p className="text-sm font-semibold text-emerald-900">
                Haz clic para activar tu cuenta por WhatsApp
              </p>
              <p className="mt-2 text-xs text-emerald-800">
                Se abrirá WhatsApp con el mensaje listo. Solo pulse enviar.
              </p>
              {activationToken ? (
                <p className="mt-3 font-mono text-lg tracking-[0.2em] text-slate-900">
                  {activationToken}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={openWhatsAppActivation}
              disabled={!whatsappUrl}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Abrir WhatsApp y activar
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                void continueToDemo()
              }}
              className="btn-primary w-full"
            >
              {submitting ? 'Entrando...' : 'Ya envié el mensaje — entrar a la demo'}
            </button>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            <p className="text-center text-sm text-slate-500">
              <button
                type="button"
                onClick={() => switchMode('register')}
                className="font-semibold text-dental-700 hover:underline"
              >
                Volver
              </button>
            </p>
          </div>
        )}
      </div>

      {mode === 'activate' && whatsappUrl ? (
        <button
          type="button"
          onClick={openWhatsAppActivation}
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/20 hover:bg-emerald-700"
          aria-label="Activar cuenta por WhatsApp"
        >
          Activar por WhatsApp
        </button>
      ) : null}
    </div>
  )
}
