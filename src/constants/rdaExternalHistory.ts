import type { RdaDiagnosis, RdaProcedure } from '@/types/rdaExternalHistory'

/** PIN de demostración — simulación Minsalud (no hay envío SMS real). */
export const RDA_DEMO_OTP_PIN = '123456'

export const RDA_OTP_LENGTH = 6

/** Temporizador de reintento de OTP (ms). */
export const RDA_OTP_RETRY_MS = 60_000

/** Latencia simulada de la llamada a Minsalud. */
export const RDA_MINSALUD_DELAY_MS = 600

export const RDA_PRESTADOR_ORIGEN = 'IPS Demo Interoperable — Red Minsalud (simulado)'

export const RDA_DEMO_DIAGNOSES: RdaDiagnosis[] = [
  {
    code: 'K02.1',
    description: 'Caries de la dentina',
    type: 'principal',
    certainty: 'confirmado',
  },
  {
    code: 'K05.1',
    description: 'Gingivitis crónica',
    type: 'relacionado',
    certainty: 'confirmado',
  },
]

export const RDA_DEMO_PROCEDURES: RdaProcedure[] = [
  {
    cupsCode: '890203',
    description: 'Consulta de primera vez por odontología general',
    prestadorOrigen: RDA_PRESTADOR_ORIGEN,
  },
  {
    cupsCode: '997001',
    description: 'Profilaxis dental',
    prestadorOrigen: RDA_PRESTADOR_ORIGEN,
  },
]

export function maskPhoneForDisplay(phone: string | null | undefined): string {
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (digits.length < 2) return '***'
  return `***${digits.slice(-2)}`
}

export function formatRetryCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
