export function extractNitDigits(value?: string | null): string
export function computeNitDv(nitWithoutDv?: string | null): number
export function formatNitInput(value?: string | null): string
export function validateProviderNit(value?: string | null): {
  valid: boolean
  message?: string
  digits?: string
  body?: string
  dv?: number
  expectedDv?: number
  display?: string
}
