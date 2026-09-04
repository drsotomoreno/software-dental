import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { APP_INITIALS, APP_NAME } from '@/constants/branding'
import { useAuth } from '@/contexts/AuthContext'
import { getStoredApiAuth } from '@/services/apiAuthService'
import { activatePaidPlan, activateRethusTrial, PAID_PLANS, TRIAL_DAYS } from '@/services/subscriptionService'
import { userHasTrialLimits, userNeedsWelcome } from '@/utils/subscriptionAccess'

export function WelcomeTrialPage() {
  const navigate = useNavigate()
  const { refreshSessionUser } = useAuth()
  const stored = getStoredApiAuth()
  const alreadyLimited = userHasTrialLimits(stored?.user)
  const needsPlan = userNeedsWelcome(stored?.user)

  const [documentNumber, setDocumentNumber] = useState(stored?.user?.documentNumber ?? '')
  const [rethusNumber, setRethusNumber] = useState(stored?.user?.rethusNumber ?? '')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [submitting, setSubmitting] = useState<'trial' | string | null>(null)

  const goApp = async () => {
    await refreshSessionUser()
    navigate('/app', { replace: true })
  }

  const handleTrial = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setInfo('')
    setSubmitting('trial')
    const result = await activateRethusTrial(documentNumber, rethusNumber)
    setSubmitting(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setInfo(result.message)
    await goApp()
  }

  const handlePlan = async (planId: string) => {
    setError('')
    setInfo('')
    setSubmitting(planId)
    const result = await activatePaidPlan(planId)
    setSubmitting(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    await goApp()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-dental-50 px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-dental-600 text-sm font-bold text-white">
            {APP_INITIALS}
          </div>
          <div>
            <p className="text-sm font-semibold text-dental-700">{APP_NAME}</p>
            <h1 className="text-2xl font-bold text-slate-900">Bienvenido. Active su acceso</h1>
          </div>
        </div>

        {alreadyLimited && !needsPlan && (
          <p className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Su prueba de {TRIAL_DAYS} días está activa con un paciente y una nota de voz por casilla.
            Puede continuar en el sistema o pasar a un plan de pago cuando lo desee.
          </p>
        )}

        <section className="mb-10 overflow-hidden rounded-2xl border-2 border-dental-600 bg-white shadow-sm">
          <div className="bg-dental-600 px-6 py-4 text-white">
            <p className="text-xs font-semibold uppercase tracking-wide text-dental-100">
              Recomendado para comenzar
            </p>
            <h2 className="text-xl font-bold">Prueba gratuita de {TRIAL_DAYS} días</h2>
            <p className="mt-1 text-sm text-dental-100">
              Valide su ReTHUS. Incluye 1 paciente y 1 nota de voz por casilla de dictado.
            </p>
          </div>
          <form onSubmit={handleTrial} className="grid gap-4 px-6 py-5 md:grid-cols-2">
            <div>
              <label className="label-field" htmlFor="trial-document">
                Número de documento de identidad
              </label>
              <input
                id="trial-document"
                className="input-field"
                required
                inputMode="numeric"
                autoComplete="off"
                placeholder="Ej. 79456123"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
              />
            </div>
            <div>
              <label className="label-field" htmlFor="trial-rethus">
                Número de registro ReTHUS
              </label>
              <input
                id="trial-rethus"
                className="input-field"
                required
                autoComplete="off"
                placeholder="Ej. 438265"
                value={rethusNumber}
                onChange={(e) => setRethusNumber(e.target.value)}
              />
            </div>
            <p className="md:col-span-2 text-xs text-slate-500">
              El ReTHUS debe existir y estar asociado formalmente a ese documento en el directorio
              de talento humano en salud. Si los datos no coinciden, la prueba no se activa.
            </p>
            {error && (
              <p className="md:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
            {info && (
              <p className="md:col-span-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {info}
              </p>
            )}
            <div className="md:col-span-2 flex flex-wrap items-center gap-3">
              <button type="submit" disabled={Boolean(submitting)} className="btn-primary">
                {submitting === 'trial' ? 'Validando ReTHUS...' : `Activar prueba de ${TRIAL_DAYS} días`}
              </button>
              {alreadyLimited && (
                <Link to="/app" className="text-sm font-semibold text-dental-700 hover:underline">
                  Continuar con la prueba
                </Link>
              )}
            </div>
          </form>
        </section>

        <h2 className="mb-4 text-lg font-semibold text-slate-800">Planes de suscripción</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PAID_PLANS.map((plan) => (
            <article
              key={plan.id}
              className={`flex flex-col rounded-2xl border bg-white p-5 shadow-sm ${
                plan.featured ? 'border-dental-600 ring-2 ring-dental-200' : 'border-slate-200'
              }`}
            >
              {plan.featured && (
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-dental-700">
                  El más elegido
                </p>
              )}
              <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
              <p className="mt-1 text-sm text-slate-600">{plan.blurb}</p>
              <p className="mt-3 text-2xl font-bold text-dental-700">
                {plan.priceLabel}
                {plan.period ? (
                  <span className="text-sm font-normal text-slate-500"> {plan.period}</span>
                ) : null}
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-600">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <span className="text-green-600">✓</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={Boolean(submitting)}
                onClick={() => void handlePlan(plan.id)}
                className={`mt-5 w-full ${plan.featured ? 'btn-primary' : 'btn-secondary'}`}
              >
                {submitting === plan.id ? 'Activando...' : 'Elegir este plan'}
              </button>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
