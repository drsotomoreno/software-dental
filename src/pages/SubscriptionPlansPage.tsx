import { Link } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { APP_INITIALS, APP_NAME } from '@/constants/branding'
import {
  PAID_PLANS,
  SUBSCRIPTION_PURCHASES_DISABLED_MESSAGE,
  SUBSCRIPTION_PURCHASES_ENABLED,
} from '../../shared/subscriptionPlans.js'

/**
 * Vitrina pública de planes. No inicia sesión ni reutiliza la cuenta maestra.
 * La compra permanece inactiva hasta activar la pasarela de pago.
 */
export function SubscriptionPlansPage() {
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

        <div className="mb-8 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-amber-950 shadow-sm">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
            <div>
              <p className="font-semibold">Compra temporalmente inactiva</p>
              <p className="mt-1 text-sm leading-relaxed text-amber-900">
                {SUBSCRIPTION_PURCHASES_DISABLED_MESSAGE}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {PAID_PLANS.map((plan) => (
            <article
              key={plan.id}
              className={`relative flex flex-col rounded-2xl border p-6 shadow-sm ${
                plan.featured
                  ? 'border-dental-800 bg-dental-800 text-white shadow-dental-900/20 xl:-translate-y-1'
                  : 'border-slate-200 bg-white text-slate-800'
              }`}
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
              <button
                type="button"
                disabled
                className={`mt-8 inline-flex w-full cursor-not-allowed items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium opacity-70 ${
                  plan.featured
                    ? 'bg-white text-dental-800'
                    : 'bg-dental-600 text-white'
                }`}
              >
                {SUBSCRIPTION_PURCHASES_ENABLED ? plan.cta : 'Compra próximamente'}
              </button>
            </article>
          ))}
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
