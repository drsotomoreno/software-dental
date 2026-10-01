import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, MessageSquare, ShoppingBag } from 'lucide-react'
import {
  PAID_PLANS,
  TTC_MESSAGE_PACKAGES,
  fetchTitularProducts,
  purchaseTitularMessagePackage,
  purchaseTitularPlan,
  type TitularProducts,
} from '@/services/subscriptionService'

const STATUS_LABELS: Record<string, string> = {
  exento: 'Exento',
  activo: 'Activo',
  prueba: 'Prueba',
  pendiente: 'Pendiente',
  vencido: 'Vencido',
  none: 'Sin plan',
}

const STATUS_COLORS: Record<string, string> = {
  exento: 'bg-violet-100 text-violet-800',
  activo: 'bg-emerald-100 text-emerald-800',
  prueba: 'bg-amber-100 text-amber-800',
  pendiente: 'bg-slate-100 text-slate-700',
  vencido: 'bg-red-100 text-red-700',
}

function formatDate(iso?: string | null) {
  if (!iso) return 'Sin vencimiento'
  return new Date(iso).toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function planTitle(planId: string | null | undefined, estado: string) {
  if (estado === 'exento') return 'Exento'
  if (estado === 'prueba') return 'Prueba gratuita'
  const found = PAID_PLANS.find((plan) => plan.id === planId)
  if (found) return found.name
  if (estado === 'vencido') return 'Plan vencido'
  return 'Sin plan adquirido'
}

function planDetail(products: TitularProducts) {
  const { plan } = products
  const until = formatDate(plan.fecha_vencimiento)
  if (plan.estado_pago === 'exento') {
    return 'Cuenta del titular con acceso ilimitado. Este producto no tiene fecha de vencimiento.'
  }
  if (plan.estado_pago === 'prueba') {
    return plan.fecha_vencimiento
      ? `Prueba gratuita del titular, vigente hasta el ${until}.`
      : 'Prueba gratuita del titular.'
  }
  if (plan.estado_pago === 'activo') {
    const name = planTitle(plan.id, plan.estado_pago)
    return plan.fecha_vencimiento
      ? `${name} adquirido por el titular. Vence el ${until}.`
      : `${name} adquirido por el titular.`
  }
  if (plan.estado_pago === 'vencido') {
    return plan.fecha_vencimiento
      ? `El plan del titular venció el ${until}.`
      : 'El plan del titular está vencido.'
  }
  return 'El titular todavía no tiene un plan adquirido.'
}

export function AdminSubscriptionUsersPage() {
  const [products, setProducts] = useState<TitularProducts | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [submitting, setSubmitting] = useState<string | null>(null)

  useEffect(() => {
    void fetchTitularProducts().then((result) => {
      if (!result.ok) {
        setError(result.error)
      } else {
        setProducts({
          titular: result.titular,
          plan: result.plan,
          packages: result.packages,
          canPurchase: result.canPurchase,
        })
      }
      setLoading(false)
    })
  }, [])

  const packages = useMemo(() => {
    const list = products?.packages ?? []
    return [...list].sort((a, b) => {
      const aTime = a.purchasedAt ? new Date(a.purchasedAt).getTime() : 0
      const bTime = b.purchasedAt ? new Date(b.purchasedAt).getTime() : 0
      return bTime - aTime
    })
  }, [products])

  const applySnapshot = (next: TitularProducts, message?: string) => {
    setProducts(next)
    setError('')
    if (message) setInfo(message)
  }

  const handlePlan = async (planId: string) => {
    setSubmitting(planId)
    setError('')
    setInfo('')
    const result = await purchaseTitularPlan(planId)
    setSubmitting(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    applySnapshot(
      {
        titular: result.titular,
        plan: result.plan,
        packages: result.packages,
        canPurchase: result.canPurchase,
      },
      result.message,
    )
  }

  const handlePackage = async (packageId: string) => {
    setSubmitting(packageId)
    setError('')
    setInfo('')
    const result = await purchaseTitularMessagePackage(packageId)
    setSubmitting(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    applySnapshot(
      {
        titular: result.titular,
        plan: result.plan,
        packages: result.packages,
        canPurchase: result.canPurchase,
      },
      result.message,
    )
  }

  const estado = products?.plan.estado_pago ?? 'pendiente'
  const currentPlanId = estado === 'activo' ? products?.plan.id : null
  const activePackages = packages.filter((item) => item.status === 'activo').length
  const canPurchase = products?.canPurchase !== false
  const exempt = estado === 'exento'

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Suscripciones</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Plan adquirido por el titular, paquetes de mensajes TTC y la fecha de vencimiento de
            cada producto.
          </p>
        </div>
        <a href="#comprar" className="btn-primary gap-2">
          <ShoppingBag className="h-4 w-4" />
          Comprar planes y paquetes
        </a>
      </div>

      {loading && <p className="text-sm text-slate-500">Cargando la suscripción del titular…</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {info && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{info}</p>}

      {products && (
        <section className="grid gap-4 lg:grid-cols-5">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-dental-700">
              Plan del titular
            </p>
            <h2 className="mt-2 text-xl font-bold text-slate-900">{products.titular.nombre}</h2>
            <p className="text-sm text-slate-500">
              {products.titular.clinicName || 'Cuenta titular'}
              {products.titular.documentNumber ? ` · ${products.titular.documentNumber}` : ''}
            </p>
            <div className="mt-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-slate-900">
                  {planTitle(products.plan.id, estado)}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                  <CalendarDays className="h-4 w-4 text-dental-600" />
                  Vence: {formatDate(products.plan.fecha_vencimiento)}
                </p>
              </div>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  STATUS_COLORS[estado] ?? 'bg-slate-100 text-slate-700'
                }`}
              >
                {STATUS_LABELS[estado] ?? estado}
              </span>
            </div>
            <p className="mt-4 text-sm text-slate-600">{planDetail(products)}</p>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-3">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-dental-700">
                  Paquetes de mensajes TTC
                </p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">
                  {packages.length === 0
                    ? 'Todavía no hay paquetes'
                    : `${activePackages} vigente${activePackages === 1 ? '' : 's'}`}
                </h2>
              </div>
              <MessageSquare className="h-5 w-5 text-dental-600" />
            </div>

            {packages.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                Los paquetes de mensajes TTC que adquiera el titular aparecerán aquí, cada uno con
                su fecha de vencimiento.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="pb-2 pr-3">Paquete</th>
                      <th className="pb-2 pr-3">Mensajes</th>
                      <th className="pb-2 pr-3">Adquirido</th>
                      <th className="pb-2 pr-3">Vence</th>
                      <th className="pb-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {packages.map((item) => (
                      <tr key={item.id}>
                        <td className="py-2.5 pr-3 font-medium text-slate-900">{item.name}</td>
                        <td className="py-2.5 pr-3 text-slate-600">{item.messages}</td>
                        <td className="py-2.5 pr-3 text-slate-600">
                          {item.purchasedAt ? formatDate(item.purchasedAt) : '—'}
                        </td>
                        <td className="py-2.5 pr-3 text-slate-600">{formatDate(item.expiresAt)}</td>
                        <td className="py-2.5">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              STATUS_COLORS[item.status] ?? 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {STATUS_LABELS[item.status] ?? item.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        </section>
      )}

      <section id="comprar" className="scroll-mt-24 space-y-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Comprar planes y paquetes</h2>
          <p className="mt-1 text-sm text-slate-600">
            El plan queda a nombre del titular. Cada paquete de mensajes TTC se suma a los que ya
            tenga y muestra su propia fecha de vencimiento.
          </p>
        </div>

        {exempt && (
          <p className="rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-900">
            La cuenta del titular está exenta de pago, así que no adquiere un plan. Los paquetes de
            mensajes TTC sí se pueden comprar y quedan con su fecha de vencimiento.
          </p>
        )}

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
                <h3 className="text-lg font-semibold text-slate-900">{plan.name}</h3>
                <p className="mt-1 text-sm text-slate-600">{plan.blurb}</p>
                <p className="mt-2 text-2xl font-bold text-dental-700">
                  {plan.priceLabel}
                  {plan.period ? (
                    <span className="text-sm font-normal text-slate-500"> {plan.period}</span>
                  ) : null}
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-600">
                  <CalendarDays className="h-4 w-4 text-dental-600" />
                  Vence a los 30 días
                </p>
                <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-600">
                  {plan.features.map((feature) => (
                    <li key={feature}>✓ {feature}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  disabled={!canPurchase || exempt || isCurrent || Boolean(submitting)}
                  onClick={() => void handlePlan(plan.id)}
                  className={`mt-6 w-full ${isCurrent || plan.featured ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {!canPurchase
                    ? 'Solo el titular'
                    : exempt
                      ? 'Cuenta exenta'
                      : isCurrent
                        ? 'Plan actual'
                        : submitting === plan.id
                          ? 'Comprando…'
                          : 'Comprar plan'}
                </button>
              </article>
            )
          })}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {TTC_MESSAGE_PACKAGES.map((pack) => (
            <article
              key={pack.id}
              className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-dental-700">
                Paquete de mensajes TTC
              </p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">{pack.name}</h3>
              <p className="mt-1 text-sm text-slate-600">{pack.blurb}</p>
              <p className="mt-2 text-2xl font-bold text-dental-700">
                {pack.priceLabel}
                <span className="text-sm font-normal text-slate-500"> {pack.period}</span>
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-600">
                <CalendarDays className="h-4 w-4 text-dental-600" />
                Vence a los {pack.validityDays} días
              </p>
              <button
                type="button"
                disabled={!canPurchase || Boolean(submitting)}
                onClick={() => void handlePackage(pack.id)}
                className="btn-primary mt-6 w-full"
              >
                {!canPurchase ? 'Solo el titular' : submitting === pack.id ? 'Comprando…' : 'Comprar paquete'}
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
