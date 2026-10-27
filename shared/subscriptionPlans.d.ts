declare module '../../shared/subscriptionPlans.js' {
  export const PAID_PLANS: Array<{
    id: string
    name: string
    priceLabel: string
    period: string
    blurb: string
    featured: boolean
    cta: string
    features: string[]
    maxRethus: number | 'custom'
    maxAssistants: number | 'custom'
    maxReps: number | 'custom'
    maxSeats: number | null
  }>
  export const PAID_PLAN_IDS: string[]
  export const TRIAL_DAYS: number
  export const PAID_PLAN_DAYS: number
  export const TRIAL_SEAT_LIMIT: number
  export const TTC_MESSAGE_PACKAGES: Array<{
    id: string
    name: string
    messages: number
    priceLabel: string
    period: string
    validityDays: number
    blurb: string
  }>
  export const TTC_MESSAGE_PACKAGE_IDS: string[]
  export const PLAN_LIMITS: Record<string, {
    name: string
    maxRethus: number | 'custom'
    maxAssistants: number | 'custom'
    maxReps: number | 'custom'
  }>
  export const PLAN_SEAT_LIMITS: Record<string, number | null>
  export function planLimitsForAccount(account?: {
    plan?: string | null
    estado_pago?: string | null
    rol?: string | null
    role?: string | null
  }): { maxRethus: number | null; maxAssistants: number | null; maxReps: number | null }
  export function seatLimitForAccount(account?: {
    plan?: string | null
    estado_pago?: string | null
    rol?: string | null
    role?: string | null
  }): number | null
  export function isAssistantRole(role?: string | null): boolean
  export function countStaffSeats(
    members: Array<{ rol?: string | null; role?: string | null }>,
    roleOf?: (member: { rol?: string | null; role?: string | null }) => string | null | undefined,
  ): { rethus: number; assistants: number }
  export function describeStaffLimit(
    kind: 'assistant' | 'rethus',
    used: number,
    max: number | null,
    planName: string,
  ): string | null
  export function staffSeatBlock(input: {
    members: Array<{ id?: string | number | null; rol?: string | null; role?: string | null }>
    role?: string | null
    planName: string
    limits: { maxRethus: number | null; maxAssistants: number | null }
    ignoreId?: string | number | null
  }): string | null
  export function planDisplayName(plan?: string | null, estadoPago?: string | null): string
}
