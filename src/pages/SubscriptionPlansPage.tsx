import { useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { APP_INITIALS, APP_NAME } from '@/constants/branding'
import { BoldCheckoutButton } from '@/components/BoldCheckoutButton'
import {
  isBoldCheckoutPlan,
  normalizePaidPlanId,
  PAID_PLANS,
} from '@/services/subscriptionService'
import { SUBSCRIPTION_PURCHASES_ENABLED } from '../../shared/subscriptionPlans.js'

/**
 * Vitrina pública de planes. Checkout Bold para nomad/smart/bionic (IVA excluido).
 * Corporativo permanece como contacto manual.
 */
export function SubscriptionPlansPage() {
  const [searchParams] = useSearchParams()
  const focusPlanId = useMemo(
    () => normalizePaidPlanId(searchParams.get('plan')),
    [searchParams],
  )
  const autoCheckout =
    searchParams.get('checkout') === '1' && isBoldCheckoutPlan(focusPlanId)
  const paymentPending = searchParams.get('pago') === 'procesando'

  useEffect(() => {
    if (!focusPlanId) return
    const node = document.querySelector(`[data-plan-card="${focusPlanId}"]`)
    if (node instanceof HTMLElement) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [focusPlanId])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-dental-50 px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-dental-600 text-sm font-bold text-white">
              {APP_INITIALS}
            </div>
            <div>
              <p className="text-sm font-semibold text-dental-700">{APP_NAME}</p>
              <h1 className="text-2xl font-bold text-slate-900">Planes de suscripción</h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/" className="btn-secondary px-4 py-2 text-sm">
              Volver al inicio
            </Link>
            <Link to="/demo" className="btn-secondary px-4 py-2 text-sm">
              Ver demo
            </Link>
          </div>
        </div>

        <div className="mb-8 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-950 shadow-sm">
          <p className="font-semibold">Suscripción anual · débito mensual con Bold</p>
          <p className="mt-1 text-sm leading-relaxed text-emerald-900">
            Planes Pioneros, Smart y BioniC: facturación mensual con compromiso mínimo de 12 meses y
            débito automático a tarjeta. Tarifas{' '}
            <strong>Excluidas de IVA (0 % - Art. 476 ET)</strong>. Si aún no tiene cuenta, el botón
            lo llevará al registro o inicio de sesión y, al volver, abrirá la pasarela Bold.
          </p>
        </div>

        {paymentPending ? (
          <div className="mb-6 rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 text-sky-950 shadow-sm">
            <p className="font-semibold">Pago en proceso</p>
            <p className="mt-1 text-sm leading-relaxed">
              Bold está confirmando su pago. En unos segundos su plan quedará activo; si no ve el
              cambio, actualice esta página o revise «Mi Suscripción».
            </p>
          </div>
        ) : null}

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {PAID_PLANS.map((plan) => {
            const boldReady = SUBSCRIPTION_PURCHASES_ENABLED && isBoldCheckoutPlan(plan.id)
            const isFocused = focusPlanId === plan.id
            return (
              <article
                key={plan.id}
                data-plan-card={plan.id}
                className={`relative flex flex-col rounded-2xl border p-6 shadow-sm ${
                  plan.featured
                    ? 'border-dental-800 bg-dental-800 text-white shadow-dental-900/20 xl:-translate-y-1'
                    : 'border-slate-200 bg-white text-slate-800'
                } ${isFocused ? 'ring-2 ring-amber-400 ring-offset-2' : ''}`}
              >
                {plan.featured ? (
                  <p className="mb-4 inline-flex self-start rounded-full bg-amber-400 px-3 py-1 text-xs font-semibold text-dental-950">
                    ★ El más elegido
                  </p>
                ) : null}
                <h2 className="text-xl font-bold">{plan.name}</h2>
                <p
                  className={`mt-2 text-sm leading-relaxed ${
                    plan.featured ? 'text-dental-100' : 'text-slate-600'
                  }`}
                >
                  {plan.blurb}
                </p>
                <p className="mt-5 flex items-end gap-1">
                  <span className="text-3xl font-bold tracking-tight">{plan.priceLabel}</span>
                  {plan.period ? (
                    <span
                      className={`mb-1 text-sm font-medium ${
                        plan.featured ? 'text-dental-100' : 'text-slate-500'
                      }`}
                    >
                      {plan.period}
                    </span>
                  ) : null}
                </p>
                {plan.amountCOP != null ? (
                  <div
                    className={`mt-3 space-y-1 text-xs leading-relaxed ${
                      plan.featured ? 'text-dental-100' : 'text-slate-600'
                    }`}
                  >
                    <p className="font-semibold">
                      {plan.priceLabel} COP / mes ({plan.taxLabel})
                    </p>
                    <p>
                      Suscripción anual con débito mensual automático (compromiso mínimo de 12
                      meses).
                    </p>
                    {plan.commitmentLabel ? <p>{plan.commitmentLabel}</p> : null}
                  </div>
                ) : null}
                <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <span className={`mt-0.5 ${plan.featured ? 'text-sky-200' : 'text-dental-600'}`}>
                        ✓
                      </span>
                      <span className={plan.featured ? 'text-dental-50' : 'text-slate-600'}>
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  {boldReady ? (
                    <BoldCheckoutButton
                      planId={plan.id}
                      planName={plan.name}
                      label={plan.cta}
                      autoCheckout={autoCheckout && isFocused}
                      mutedClassName={plan.featured ? 'text-dental-100' : 'text-slate-500'}
                      className={`inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${
                        plan.featured
                          ? 'bg-white text-dental-800 hover:bg-dental-50'
                          : 'bg-dental-600 text-white hover:bg-dental-700'
                      }`}
                    />
                  ) : (
                    <Link
                      to="/registro"
                      className={`inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium ${
                        plan.featured
                          ? 'bg-white text-dental-800 hover:bg-dental-50'
                          : 'bg-dental-600 text-white hover:bg-dental-700'
                      }`}
                    >
                      {plan.cta}
                    </Link>
                  )}
                </div>
              </article>
            )
          })}
        </div>

        <p className="mt-8 text-center text-sm text-slate-500">
          ¿Aún no tiene cuenta?{' '}
          <Link to="/registro" className="font-semibold text-dental-700 hover:underline">
            Regístrese para la demo
          </Link>
        </p>
      </div>
    </div>
  )
}
