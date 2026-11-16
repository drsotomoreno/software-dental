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

type AuthMode = 'login' | 'register' | 'verify'

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
  const { user, login, isLoading, adoptApiSession } = useAuth()
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
  const [pendingId, setPendingId] = useState('')
  const [whatsappUrl, setWhatsappUrl] = useState('')
  const [whatsappCode, setWhatsappCode] = useState('')
  const [emailCode, setEmailCode] = useState('')
  const [whatsappVerified, setWhatsappVerified] = useState(false)
  const [resendLeft, setResendLeft] = useState(0)
  const [checkingWhatsApp, setCheckingWhatsApp] = useState(false)
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
  const demoIntent =
    searchParams.get('destino') === 'demo' ||
    (location.state as { intent?: string } | null)?.intent === 'demo'

  useEffect(() => {
    if (mode !== 'verify') return undefined
    const timer = window.setInterval(() => {
      setResendLeft((current) => (current > 0 ? current - 1 : 0))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [mode])

  useEffect(() => {
    if (mode !== 'verify' || !pendingId) return undefined
    let stop = false
    const tick = async () => {
      try {
        const response = await fetch(`/api/auth/register/status/${encodeURIComponent(pendingId)}`, {
          headers: { Accept: 'application/json' },
        })
        const payload = await response.json().catch(() => ({}))
        if (stop) return
        if (payload.expired) {
          setError('El tiempo de verificación expiró (15 minutos). Vuelva a crear la cuenta.')
          setWhatsappVerified(false)
          return
        }
        if (payload.whatsappVerified) setWhatsappVerified(true)
      } catch {
        /* el siguiente ciclo reintenta */
      }
    }
    void tick()
    const timer = window.setInterval(() => {
      void tick()
    }, 3000)
    return () => {
      stop = true
      window.clearInterval(timer)
    }
  }, [mode, pendingId])

  const switchMode = (next: AuthMode) => {
    setMode(next)
    setError('')
    setInfo('')
    if (next !== 'verify') {
      setWhatsappUrl('')
      setWhatsappCode('')
      setPendingId('')
      setEmailCode('')
      setWhatsappVerified(false)
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
    navigate(postAuthDestination(sessionUser, afterLogin), { replace: true })
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
      if (!payload.pendingId || !payload.whatsapp_url || !payload.whatsapp_code) {
        setError('El servidor no entregó los datos de verificación. Intente de nuevo.')
        return
      }
      setPhoneNumber(phoneCheck.digits)
      setPendingId(String(payload.pendingId))
      setWhatsappUrl(String(payload.whatsapp_url))
      setWhatsappCode(String(payload.whatsapp_code))
      setEmailCode('')
      setWhatsappVerified(false)
      setResendLeft(60)
      setInfo('Le enviamos un código de 6 dígitos al correo. También debe enviar el mensaje de WhatsApp.')
      setMode('verify')
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

  const refreshWhatsAppStatus = async () => {
    if (!pendingId) return
    setCheckingWhatsApp(true)
    setError('')
    try {
      const response = await fetch(`/api/auth/register/status/${encodeURIComponent(pendingId)}`, {
        headers: { Accept: 'application/json' },
      })
      const payload = await response.json().catch(() => ({}))
      if (payload.expired) {
        setWhatsappVerified(false)
        setError('El tiempo de verificación expiró (15 minutos). Vuelva a crear la cuenta.')
        return
      }
      setWhatsappVerified(Boolean(payload.whatsappVerified))
      if (!payload.whatsappVerified) {
        setInfo('Aún no llega el mensaje. Envíelo desde el mismo celular del formulario y vuelva a comprobar.')
      }
    } catch {
      setError('No se pudo comprobar WhatsApp. Intente de nuevo.')
    } finally {
      setCheckingWhatsApp(false)
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
    if (!whatsappVerified) {
      setError('Falta la verificación de WhatsApp. Envíe el mensaje y espere la confirmación.')
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
        if (payload.expired) setWhatsappVerified(false)
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
      navigate('/demo', { replace: true })
    } catch {
      setError('No se pudo conectar con el servidor. Intente de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isLoading && (user || (apiAuth?.token && apiAuth.user)) && (!onRegisterPath || demoIntent)) {
    const dest = demoIntent
      ? '/demo'
      : storedUser && !isSuperAdmin
        ? postAuthDestination(storedUser, afterLogin)
        : afterLogin
    return <Navigate to={dest} replace />
  }

  const subtitle =
    mode === 'register'
      ? 'Registro con verificación de correo y WhatsApp'
      : mode === 'verify'
        ? 'Verificación en 2 pasos — los dos canales son obligatorios'
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
              {submitting ? 'Enviando códigos...' : 'Continuar a la verificación'}
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
              La cuenta no se crea hasta que el correo y el WhatsApp queden verificados. Tiene 15
              minutos.
            </p>

            <section className="space-y-3 rounded-xl border border-slate-200 p-4">
              <h2 className="text-sm font-semibold text-slate-900">Paso 1 — Correo electrónico</h2>
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

            <section className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
              <h2 className="text-sm font-semibold text-emerald-950">
                Paso 2 — WhatsApp (verificación instantánea)
              </h2>
              <p className="text-xs text-emerald-900">
                Se abre WhatsApp con el mensaje listo. Envíelo desde el celular que registró. No
                hace falta que el sistema le responda.
              </p>
              {whatsappCode ? (
                <p className="text-center font-mono text-lg tracking-[0.2em] text-slate-900">
                  {whatsappCode}
                </p>
              ) : null}
              <button
                type="button"
                onClick={openWhatsAppActivation}
                disabled={!whatsappUrl}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Abrir WhatsApp y enviar código
              </button>
              {whatsappVerified ? (
                <p className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-emerald-700">
                  WhatsApp verificado
                </p>
              ) : (
                <p className="text-xs text-emerald-900">Esperando el mensaje de su celular…</p>
              )}
              <button
                type="button"
                disabled={checkingWhatsApp}
                onClick={() => {
                  void refreshWhatsAppStatus()
                }}
                className="w-full rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-60"
              >
                {checkingWhatsApp ? 'Comprobando...' : 'Ya envié el mensaje — comprobar ahora'}
              </button>
            </section>

            <button
              type="button"
              disabled={submitting || !whatsappVerified || emailCode.length !== 6}
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
