declare module '../../shared/clinicalAccess.js' {
  export const MASTER_ACCESS_EMAIL: string
  export const TRIAL_MAX_PATIENTS: number
  export type ClinicalAccessTier = 'none' | 'trial' | 'full'
  export function normalizeAccessEmail(email: unknown): string
  export function isMasterAccessEmail(email: unknown): boolean
  export function hasSubscriptionPaymentProof(user: {
    subscriptionPaidAt?: string | null
  } | null | undefined): boolean
  export function clinicalAccessTier(user: {
    email?: string | null
    estado_pago?: string | null
    plan?: string | null
    fecha_vencimiento?: string | null
    subscriptionPaidAt?: string | null
  } | null | undefined): ClinicalAccessTier
  export function applyStoredAccessPolicy(user: {
    email?: string | null
    rol?: string | null
    estado_pago?: string | null
    plan?: string | null
    fecha_vencimiento?: string | null
    subscriptionPaidAt?: string | null
  } | null | undefined): {
    rol: string
    estado_pago: string
    plan: string | null
    fecha_vencimiento: string | null
    subscriptionPaidAt: string | null
  }
  export function countDistinctClinicalPatients(body: unknown): number
}
