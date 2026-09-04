declare module '../../shared/subscriptionPlans.js' {
  export const PAID_PLANS: Array<{
    id: string
    name: string
    priceLabel: string
    period: string
    blurb: string
    featured: boolean
    features: string[]
  }>
  export const PAID_PLAN_IDS: string[]
  export const TRIAL_DAYS: number
  export const PAID_PLAN_DAYS: number
}
