export type PaidPlan = {
  id: string
  name: string
  priceLabel: string
  /** Monto entero COP para Bold. null = plan sin self-checkout (corporativo). */
  amountCOP: number | null
  period: string
  billingCycle: 'monthly' | null
  minimumCommitmentMonths: number | null
  commitmentLabel: string | null
  taxLabel: string | null
  blurb: string
  featured: boolean
  cta: string
  features: string[]
  maxSeats: number
  maxRethus: number | 'custom'
  maxReps: number | 'custom'
}

export const ANNUAL_COMMITMENT_MONTHS: number
export const ANNUAL_CONTRACT_DAYS: number
export const DEFAULT_COMMITMENT_LABEL: string
export const DEFAULT_TAX_LABEL: string
export const PAID_PLANS: PaidPlan[]
export const PAID_PLAN_IDS: string[]
export const SUBSCRIPTION_PURCHASES_ENABLED: boolean
export const SUBSCRIPTION_PURCHASES_DISABLED_MESSAGE: string
export function getPaidPlanById(planId?: string | null): PaidPlan | null
export function isBoldCheckoutPlan(planId?: string | null): boolean
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
  { name: string; maxRethus: number | 'custom'; maxReps: number | 'custom' }
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
export function hasRethusCode(user?: {
  rethusNumber?: unknown
  rethus_code?: unknown
  rethusCode?: unknown
} | null): boolean
export function checkRethusLimit(
  clinic: {
    plan?: string | null
    subscription_plan?: string | null
    estado_pago?: string | null
    rol?: string | null
    role?: string | null
    customMaxRethus?: unknown
    custom_max_rethus?: unknown
  } | null | undefined,
  currentRethusUsers: number,
): {
  canAdd: boolean
  current: number
  limit: number | null
  planName: string
}
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
export function checkRepsLimit(
  account: {
    plan?: string | null
    subscription_plan?: string | null
    estado_pago?: string | null
    rol?: string | null
    role?: string | null
    customMaxReps?: unknown
    custom_max_reps?: unknown
  } | null | undefined,
  projectedSedes: number,
  previousSedes?: number,
): {
  canAdd: boolean
  current: number
  limit: number | null
  planName: string
  userType: 'Sedes REPS'
}
export function rethusLimitReachedMessage(limitCheck: {
  canAdd?: boolean
  limit?: number | null
  planName?: string
}): string | null
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
