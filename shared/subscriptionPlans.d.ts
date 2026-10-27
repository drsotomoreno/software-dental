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
  export function isCorporatePlan(plan?: string | null): boolean
  export function normalizeCustomMaxAssistants(value: unknown): number | null
  export function applyClinicAssistantLookup<T extends Record<string, unknown>>(
    account: T,
    lookup?: { found?: boolean; value?: unknown } | null,
  ): T
  export function customMaxAssistantsForAccount(account?: {
    plan?: string | null
    estado_pago?: string | null
    rol?: string | null
    role?: string | null
    customMaxAssistants?: unknown
    custom_max_assistants?: unknown
  }): number | null
  export function assistantLimitMessage(max: number, used: number): string
  export function assistantLimitError(
    maxAssistants: number | null | undefined,
    assistantsUsed: number,
    becomingAssistant?: boolean,
  ): string | null
  export function seatLimitForAccount(account?: {
    plan?: string | null
    estado_pago?: string | null
    rol?: string | null
  }): number | null
  export function planDisplayName(plan?: string | null, estadoPago?: string | null): string
}
