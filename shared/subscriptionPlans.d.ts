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
    maxSeats: number
    maxRethus: number | 'custom'
    maxAssistants: number | 'custom'
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
  export const PLAN_SEAT_LIMITS: Record<string, number>
  export const CORPORATE_PLAN_ID: string
  export const CUSTOM_PLAN_LIMIT: 'custom'
  export const PLAN_LIMITS: Record<
    string,
    { name: string; maxRethus: number | 'custom'; maxAssistants: number | 'custom' }
  >
  export function isCorporatePlan(plan?: string | null): boolean
  export function normalizeCustomMaxAssistants(value: unknown): number | null
  export function applyClinicAssistantLookup<T extends Record<string, unknown>>(
    account: T,
    lookup?: {
      found?: boolean
      value?: unknown
      custom_max_assistants?: unknown
      custom_max_rethus?: unknown
    } | null,
  ): T
  export function checkUserLimits(
    account: {
      plan?: string | null
      subscription_plan?: string | null
      estado_pago?: string | null
      rol?: string | null
      role?: string | null
      customMaxAssistants?: unknown
      custom_max_assistants?: unknown
      customMaxRethus?: unknown
      custom_max_rethus?: unknown
    } | null | undefined,
    isAssistant: boolean,
    currentUsers: number,
  ): {
    canAdd: boolean
    current: number
    limit: number | null
    planName: string
    userType: 'Auxiliares' | 'Profesionales (ReTHUS)'
  }
  export function userLimitMessage(result: {
    canAdd?: boolean
    current?: number
    limit?: number | null
    planName?: string
    userType?: string
  }): string | null
  export function snapshotLimitError(
    seats: {
      assistantsUsed?: number
      rethusUsed?: number
      maxAssistants?: number | null
      maxRethus?: number | null
      planName?: string
    } | null | undefined,
    isAssistant: boolean,
  ): string | null
  export function seatLimitForAccount(account?: {
    plan?: string | null
    estado_pago?: string | null
    rol?: string | null
  }): number | null
  export function planDisplayName(plan?: string | null, estadoPago?: string | null): string
}
