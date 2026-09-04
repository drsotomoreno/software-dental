import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getStoredApiAuth, isApiSuperAdmin, type ApiSubscriptionUser } from '@/services/apiAuthService'
import { activatePaidPlan, fetchSubscriptionStatus, PAID_PLANS } from '@/services/subscriptionService'
import { userHasTrialLimits } from '@/utils/subscriptionAccess'

function formatDate(iso?: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function planLabel(planId?: string | null) {
  if (!planId) return null
  const found = PAID_PLANS.find((plan) => plan.id === planId)
  return found?.name ?? planId
}

function currentPlanSummary(user: ApiSubscriptionUser | null) {
  if (!user || isApiSuperAdmin(user) || user.estado_pago === 'exento') {
    return {
      title: 'Acceso ilimitado',
      detail: 'Cuenta de superadministrador: sin prueba gratuita ni restricciones de plan.',
      showTrial: false,
    }
  }

  if (userHasTrialLimits(user) || user.estado_pago === 'prueba') {
    const until = formatDate(user.fecha_vencimiento)
    return {
      title: 'Prueba gratuita',
      detail: until
        ? `Vigente hasta el ${until}. Incluye 1 paciente y 1 nota de voz por casilla.`
        : 'Prueba de 7 días activa. Incluye 1 paciente y 1 nota de voz por casilla.',
      showTrial: true,
    }
  }

  if (user.estado_pago === 'activo') {
    const name = planLabel(user.plan) ?? 'Plan de pago'
    const until = formatDate(user.fecha_vencimiento)
    return {
      title: name,
      detail: until ? `Vigente hasta el ${until}.` : 'Suscripción activa.',
      showTrial: false,
    }
  }

  if (user.estado_pago === 'vencido') {
    return {
      title: 'Suscripción vencida',
      detail: 'Renueve un plan para continuar sin restricciones.',
      showTrial: false,
    }
  }

  return {
    title: 'Sin plan activo',
    detail: 'Elija un plan o solicite la prueba gratuita con validación ReTHUS.',
    showTrial: false,
  }
}

export function SubscriptionPage() {
  const [user, setUser] = useState<ApiSubscriptionUser | null>(() => getStoredApiAuth()?.user ?? null)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [submitting, setSubmitting] = useState<string | null>(null)

  useEffect(() => {
    void fetchSubscriptionStatus().then((result) => {
      if (result.ok) setUser(result.user)
    })
  }, [])

  const summary = useMemo(() => currentPlanSummary(user), [user])
  const isMaster = isApiSuperAdmin(user)
  const currentPlanId = user?.plan && user.estado_pago === 'activo' ? user.plan : null

  const handlePlan = async (planId: string) => {
    if (isMaster) return
    setError('')
    setInfo('')
    setSubmitting(planId)
    const result = await activatePaidPlan(planId)
    setSubmitting(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setUser(result.user)
    setInfo(result.message || 'Plan actualizado.')
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">Mi Suscripción</h1>
      <p className="mb-6 text-slate-600">
        Plan actual:{' '}
        <span className="font-semibold text-dental-700">{summary.title}</span>
        {summary.detail ? ` — ${summary.detail}` : null}
      </p>

      {summary.showTrial && (
        <p className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Esta cuenta está en prueba gratuita porque validó documento y ReTHUS.{' '}
          <Link to="/welcome-trial" className="font-semibold underline">
            Ver planes
          </Link>
        </p>
      )}

      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {info && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{info}</p>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PAID_PLANS.map((plan) => {
          const isCurrent = currentPlanId === plan.id
          return (
            <article
              key={plan.id}
              className={`flex flex-col rounded-2xl border bg-white p-5 shadow-sm ${
                isCurrent || plan.featured ? 'border-dental-600 ring-2 ring-dental-200' : 'border-slate-200'
              }`}
            >
              <h2 className="text-lg font-semibold">{plan.name}</h2>
              <p className="mt-1 text-sm text-slate-600">{plan.blurb}</p>
              <p className="mt-2 text-2xl font-bold text-dental-700">
                {plan.priceLabel}
                {plan.period ? (
                  <span className="text-sm font-normal text-slate-500"> {plan.period}</span>
                ) : null}
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-600">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <span className="text-green-500">✓</span> {feature}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={isMaster || isCurrent || Boolean(submitting)}
                onClick={() => void handlePlan(plan.id)}
                className={`mt-6 w-full ${isCurrent || plan.featured ? 'btn-primary' : 'btn-secondary'}`}
              >
                {isMaster ? 'Incluido' : isCurrent ? 'Plan actual' : submitting === plan.id ? 'Activando...' : 'Elegir este plan'}
              </button>
            </article>
          )
        })}
      </div>
    </div>
  )
}
