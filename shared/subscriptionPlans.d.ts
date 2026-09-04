declare module '../../shared/subscriptionPlans.js' {
  export const PAID_PLANS: Array<{
    id: string
    name: string
    priceLabel: string
    period: string
    blurb: string
    featured: boolean
    features: string[]
    maxSeats: number
  }>
  export const PAID_PLAN_IDS: string[]
  export const TRIAL_DAYS: number
  export const PAID_PLAN_DAYS: number
  export const TRIAL_SEAT_LIMIT: number
  export const PLAN_SEAT_LIMITS: Record<string, number>
  export function seatLimitForAccount(account?: {
    plan?: string | null
    estado_pago?: string | null
    rol?: string | null
  }): number | null
  export function planDisplayName(plan?: string | null, estadoPago?: string | null): string
}
