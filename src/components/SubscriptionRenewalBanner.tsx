import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getStoredApiAuth, type ApiSubscriptionUser } from '@/services/apiAuthService'
import { fetchSubscriptionStatus, getPaidPlanById } from '@/services/subscriptionService'
import { ANNUAL_COMMITMENT_MONTHS } from '../../shared/subscriptionPlans.js'

const DAY_MS = 24 * 60 * 60 * 1000
const WARN_DAYS = 5

function daysUntil(iso?: string | null) {
  if (!iso) return null
  const target = new Date(iso).getTime()
  if (!Number.isFinite(target)) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(target)
  due.setHours(0, 0, 0, 0)
  return Math.round((due.getTime() - today.getTime()) / DAY_MS)
}

function formatCop(amount: number) {
  return new Intl.NumberFormat('es-CO').format(amount)
}

/**
 * Barra global: avisa renovación de cuota anual Bold (≤5 días o pendiente_renovacion).
 */
export function SubscriptionRenewalBanner() {
  const [user, setUser] = useState<ApiSubscriptionUser | null>(
    () => getStoredApiAuth()?.user ?? null,
  )

  useEffect(() => {
    let cancelled = false
    void fetchSubscriptionStatus().then((result) => {
      if (cancelled || !result.ok) return
      setUser(result.user)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const banner = useMemo(() => {
    if (!user) return null
    const estado = String(user.estado_pago || '')
    if (estado === 'exento' || estado === 'prueba') return null
    const installment = Number(user.installmentNumber) || 0
    if (installment < 1) return null

    const nextBilling = user.nextBillingDate || user.fecha_vencimiento
    const remaining = daysUntil(nextBilling)
    const pending = estado === 'pendiente_renovacion'
    const soon = remaining != null && remaining <= WARN_DAYS && remaining >= 0 && estado === 'activo'
    const overdueSoon = remaining != null && remaining < 0 && estado === 'activo'

    if (!pending && !soon && !overdueSoon) return null

    const plan = getPaidPlanById(String(user.plan || ''))
    const amount = plan?.amountCOP
    const amountLabel =
      amount != null ? `$${formatCop(amount)}` : plan?.priceLabel || '$—'
    const nextCuota =
      installment >= ANNUAL_COMMITMENT_MONTHS ? 1 : installment + 1
    const commitment = Number(user.commitmentMonths) || ANNUAL_COMMITMENT_MONTHS

    const timing =
      pending || overdueSoon
        ? 'está pendiente de pago'
        : remaining === 0
          ? 'vence hoy'
          : `vence en ${remaining} día${remaining === 1 ? '' : 's'}`

    return {
      nextCuota,
      commitment,
      amountLabel,
      timing,
      urgent: pending || overdueSoon || (remaining != null && remaining <= 1),
    }
  }, [user])

  if (!banner) return null

  return (
    <div
      className={`border-b px-4 py-2.5 text-center text-sm ${
        banner.urgent
          ? 'border-amber-300 bg-amber-50 text-amber-950'
          : 'border-sky-200 bg-sky-50 text-sky-950'
      }`}
      role="status"
    >
      <p className="inline">
        Tu cuota {banner.nextCuota}/{banner.commitment} de suscripción anual (
        {banner.amountLabel} COP — Excluido de IVA) {banner.timing}.{' '}
      </p>
      <Link
        to="/suscripcion?renovar=1"
        className="inline-flex font-semibold underline underline-offset-2"
      >
        Pagar cuota ahora con Bold
      </Link>
    </div>
  )
}
