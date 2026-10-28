export function preferRicherPayment<T>(left: T, right: T): T
export function mergePaymentRecords<T>(left: T[] | undefined, right: T[] | undefined): T[]
export function mergePaymentControlLines<T>(left: T[] | undefined, right: T[] | undefined): T[]
export function mergeOrthodonticsPaymentRecords<T>(
  left: T[] | undefined,
  right: T[] | undefined,
): T[]
export function mergePaymentPlanItems<T>(left: T[] | undefined, right: T[] | undefined): T[]
export function paymentControlHasContent(form: unknown): boolean
export function dropsPaymentRecords(prev: unknown, next: unknown): boolean
export function mergeClinicalPaymentSections<T extends Record<string, unknown>>(
  base: T | null | undefined,
  incoming: T | null | undefined,
): {
  paymentControl: unknown[]
  paymentControlLines: unknown[]
  orthodonticsPaymentControl: unknown[]
  paymentPlan: unknown[]
}
export function withMergedClinicalPayments<T>(winner: T, other: unknown): T
