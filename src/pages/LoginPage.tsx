import { useEffect, useState } from 'react'
import { APP_INITIALS, APP_NAME } from '@/constants/branding'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  clearStoredApiAuth,
  getStoredApiAuth,
  isApiSuperAdmin,
  type ApiSubscriptionUser,
} from '@/services/apiAuthService'
import { postAuthDestination } from '@/utils/subscriptionAccess'
import {
  clearExpressRegisterFlag,
  markExpressRegisterComplete,
} from '@/utils/expressRegister'
import { validateInternationalMobile } from '@/utils/phoneValidation'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { PhoneCountryInput } from '@/components/ui/PhoneCountryInput'
import { PublicLegalFooter } from '@/components/legal/PublicLegalFooter'
import { isBoldCheckoutPlan, normalizePaidPlanId } from '@/services/subscriptionService'

type AuthMode = 'login' | 'register' | 'verify'

function boldCheckoutReturnPath(searchParams: URLSearchParams): string | null {
  const planId = normalizePaidPlanId(searchParams.get('plan'))
  if (!planId || !isBoldCheckoutPlan(planId)) return null
  return `/subscription-plans?plan=${encodeURIComponent(planId)}&checkout=1`
}

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
  const { user, login, logout, isLoading, adoptApiSession } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const boldReturn = boldCheckoutReturnPath(searchParams)
  const from =
    boldReturn ||
    (location.state as { from?: string } | null)?.from ||
    '/app'
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
  const [pendingId, setPendingId] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [resendLeft, setResendLeft] = useState(0)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [switchingAccount, setSwitchingAccount] = useState(false)

  const afterLogin = boldReturn
    ? boldReturn
    : !from ||
        from === '/' ||
        from === '/login' ||
        from === '/registro' ||
        from === '/welcome-trial' ||
        from === '/demo'
      ? '/app'
      : from
  const storedUser = apiAuth?.user
  const onRegisterPath = location.pathname === '/registro'
  const demoIntent =
    !boldReturn &&
    (searchParams.get('destino') === 'demo' ||
      (location.state as { intent?: string } | null)?.intent === 'demo')

  useEffect(() => {
    if (mode !== 'verify') return undefined
    const timer = window.setInterval(() => {
      setResendLeft((current) => (current > 0 ? current - 1 : 0))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [mode])

  const switchMode = (next: AuthMode) => {
    setMode(next)
    setError('')
    setInfo('')
    if (next !== 'verify') {
      setPendingId('')
      setEmailCode('')
      setResendLeft(0)
    }
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
    // Checkout Bold: priorizar retorno al plan (no mandar a /demo).
    navigate(
      boldReturn || postAuthDestination(sessionUser, afterLogin),
      { replace: true },
    )
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')
    const passwordValue = password.trim()
    if (passwordValue !== confirmPassword.trim()) {
      setError('Las contraseñas no coinciden.')
      return
    }
    if (passwordValue.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    const phoneCheck = validateInternationalMobile(phoneNumber)
    if (!phoneCheck.ok) {
      setError(phoneCheck.error || 'Celular inválido.')
      return
    }
    setSubmitting(true)
    try {
      const { response, payload } = await postJson('/api/auth/register/request-code', {
        nombre: nombre.trim(),
        email: email.trim().toLowerCase(),
        phone_number: phoneCheck.digits,
        password: passwordValue,
      })
      if (!response.ok) {
        const apiError = String(payload.error || '').trim()
        if (response.status === 409) {
          setError(apiError || 'Ese correo o ese WhatsApp ya están registrados.')
          return
        }
        setError(apiError || 'No se pudo iniciar la verificación.')
        return
      }
      if (!payload.pendingId) {
        setError('El servidor no entregó los datos de verificación. Intente de nuevo.')
        return
      }
      setPhoneNumber(phoneCheck.digits)
      setPendingId(String(payload.pendingId))
      setEmailCode('')
      setResendLeft(60)
      setInfo('Le enviamos un código de 6 dígitos al correo.')
      setMode('verify')
    } catch {
      setError('No se pudo conectar con el servidor. Intente de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  const resendEmailCode = async () => {
    if (!pendingId || resendLeft > 0) return
    setError('')
    setSubmitting(true)
    try {
      const { response, payload } = await postJson('/api/auth/register/resend-email', { pendingId })
      if (!response.ok) {
        if (response.status === 429) {
          const wait = Number(payload.retryAfterSeconds) || 60
          setResendLeft(wait)
        }
        setError(String(payload.error || 'No se pudo reenviar el código.'))
        return
      }
      setResendLeft(60)
      setInfo('Enviamos un código nuevo. Use solo el más reciente. Sigue siendo válido dentro de los 15 minutos.')
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setSubmitting(false)
    }
  }

  const completeRegistration = async () => {
    setError('')
    const code = emailCode.replace(/\D/g, '').slice(0, 6)
    if (code.length !== 6) {
      setError('Escriba el código de 6 dígitos que llegó al correo.')
      return
    }
    setSubmitting(true)
    try {
      const { response, payload } = await postJson('/api/auth/register/complete', {
        pendingId,
        emailCode: code,
      })
      if (!response.ok || !payload.token || !payload.user) {
        setError(String(payload.error || 'No se pudo crear la cuenta.'))
        return
      }
      clearStoredApiAuth()
      try {
        const { clearClinicIsolationOnLogout } = await import('@/services/clinicLocalIsolation')
        await clearClinicIsolationOnLogout()
      } catch {
        /* ignore */
      }
      markExpressRegisterComplete()
      const result = await adoptApiSession(
        String(payload.token),
        payload.user as ApiSubscriptionUser,
        password.trim(),
      )
      if (!result.ok) {
        clearExpressRegisterFlag()
        setError(result.error || 'La cuenta se creó, pero no se pudo abrir la sesión.')
        return
      }
      setPassword('')
      setConfirmPassword('')
      // Checkout Bold: tras registro volver a planes y abrir pasarela.
      navigate(boldReturn || '/demo', { replace: true })
    } catch {
      setError('No se pudo conectar con el servidor. Intente de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  const hasActiveSession = !isLoading && Boolean(user || (apiAuth?.token && apiAuth.user))
  const dest = boldReturn
    ? boldReturn
    : demoIntent
      ? '/demo'
      : storedUser && !isSuperAdmin
        ? postAuthDestination(storedUser, afterLogin)
        : afterLogin
  const offerAccountSwitch = hasActiveSession && !onRegisterPath && !demoIntent && !boldReturn
  const activeEmail = String(storedUser?.email || user?.email || '').trim()

  if (hasActiveSession && !offerAccountSwitch && (!onRegisterPath || demoIntent || boldReturn)) {
    return <Navigate to={dest} replace />
  }

  const continueActiveSession = () => {
    navigate(dest, { replace: true })
  }

  const switchAccount = async () => {
    setSwitchingAccount(true)
    setError('')
    setInfo('')
    try {
      await logout()
      setEmail('')
      setPassword('')
    } finally {
      setSwitchingAccount(false)
    }
  }

  const subtitle =
    mode === 'register'
      ? 'Registro de prueba gratuita'
      : mode === 'verify'
        ? 'Confirme el código enviado a su correo'
        : 'Acceso seguro — cédula y contraseña de su clínica'

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 to-dental-50">
      <div className="flex flex-1 items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-dental-600 text-lg font-bold text-white">
            {APP_INITIALS}
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{APP_NAME}</h1>
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
        </div>

        {offerAccountSwitch && mode === 'login' && (
          <div className="card mb-4 space-y-4 border border-amber-200 bg-amber-50">
            <div>
              <p className="text-sm font-semibold text-slate-900">Hay una sesión activa</p>
              <p className="mt-1 text-sm text-slate-700">
                {activeEmail
                  ? `Este navegador tiene abierta la cuenta ${activeEmail}.`
                  : 'Este navegador tiene una sesión abierta.'}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button type="button" onClick={continueActiveSession} className="btn-primary w-full">
                {dest === '/demo' ? 'Continuar a la demo' : 'Continuar'}
              </button>
              <button
                type="button"
                onClick={() => void switchAccount()}
                disabled={switchingAccount}
                className="btn-secondary w-full"
              >
                {switchingAccount ? 'Cerrando sesión...' : 'Cerrar sesión y usar otra cuenta'}
              </button>
            </div>
          </div>
        )}

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
              <label className="label-field" htmlFor="register-email">
                Correo electrónico
              </label>
              <input
                id="register-email"
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
              <label className="label-field" htmlFor="register-password">
                Contraseña
              </label>
              <PasswordInput
                id="register-password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="label-field" htmlFor="register-confirm-password">
                Confirmar contraseña
              </label>
              <PasswordInput
                id="register-confirm-password"
                autoComplete="new-password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="label-field" htmlFor="register-phone">
                Celular (WhatsApp)
              </label>
              <PhoneCountryInput
                id="register-phone"
                required
                value={phoneNumber}
                onChange={setPhoneNumber}
                placeholder="300 123 4567"
              />
              <p className="mt-1 text-xs text-slate-500">
                Colombia (+57) viene seleccionada. También puede elegir otro país: solo se aceptan
                celulares, en formato internacional.
              </p>
            </div>
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? 'Enviando código...' : 'Continuar a la verificación'}
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
          <div className="card space-y-4">
            {info && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{info}</p>
            )}
            <p className="text-sm text-slate-600">
              Escriba el código de 6 dígitos del correo para crear la cuenta. Tiene 15 minutos.
            </p>

            <section className="space-y-3 rounded-xl border border-slate-200 p-4">
              <h2 className="text-sm font-semibold text-slate-900">Código del correo</h2>
              <p className="text-xs text-slate-500">
                Código de 6 dígitos enviado a <span className="font-medium text-slate-700">{email}</span>.
              </p>
              <label className="label-field" htmlFor="register-email-code">
                Código del correo
              </label>
              <input
                id="register-email-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={emailCode}
                onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                className="input-field text-center font-mono text-lg tracking-[0.35em]"
                placeholder="000000"
              />
              <button
                type="button"
                disabled={submitting || resendLeft > 0}
                onClick={() => {
                  void resendEmailCode()
                }}
                className="text-sm font-semibold text-dental-700 underline underline-offset-2 disabled:text-slate-400 disabled:no-underline"
              >
                {resendLeft > 0 ? `Reenviar código (${resendLeft}s)` : 'Reenviar código'}
              </button>
            </section>

            <button
              type="button"
              disabled={submitting || emailCode.length !== 6}
              onClick={() => {
                void completeRegistration()
              }}
              className="btn-primary w-full"
            >
              {submitting ? 'Creando cuenta...' : 'Crear cuenta y entrar a la demo'}
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
      </div>
      <PublicLegalFooter />
    </div>
  )
}
