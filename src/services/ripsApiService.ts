import type {
  DianInvoicePayload,
  RipsValidateRequestMetadatos,
  RipsValidateResponse,
  RipsCuvStoredRecord,
} from '@/types/ripsCuv'
import type { RipsTransaction } from '@/types/rips'
import { getStoredApiAuth } from '@/services/apiAuthService'
import type { FiscalProfile } from '@/utils/fiscalProfile'

const API_BASE = import.meta.env.VITE_RIPS_API_URL ?? '/api/rips'

function identityHeaders() {
  const auth = getStoredApiAuth()
  return {
    ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
    ...(auth?.user?.email ? { 'X-Client-Email': String(auth.user.email) } : {}),
    ...(auth?.user?.id ? { 'X-Client-User-Id': String(auth.user.id) } : {}),
    ...(auth?.user?.documentNumber
      ? { 'X-Client-Document': String(auth.user.documentNumber) }
      : {}),
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  const data = await response.json()
  if (!response.ok && !('success' in data)) {
    throw new Error((data as { error?: string }).error ?? `Error HTTP ${response.status}`)
  }
  return data as T
}

/** Verifica que el backend RIPS esté disponible en localhost:3000 (vía proxy). */
export async function checkRipsApiHealth(): Promise<boolean> {
  try {
    const response = await fetch('/api/health')
    return response.ok
  } catch {
    return false
  }
}

/**
 * Radica el paquete RIPS ante MinSalud y obtiene el CUV si es aprobado.
 */
export async function validateRipsWithMinistry(
  rips: RipsTransaction,
  options?: {
    metadatos?: RipsValidateRequestMetadatos
    invoice?: DianInvoicePayload
  },
): Promise<RipsValidateResponse> {
  const response = await fetch(`${API_BASE}/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...identityHeaders() },
    body: JSON.stringify({
      rips,
      metadatos: options?.metadatos,
      invoice: options?.invoice,
    }),
  })

  return parseJson<RipsValidateResponse>(response)
}

export type FiscalBillingRoute = 'generarFEV_y_RIPS' | 'guardarRIPS_Pendiente'

export interface DualValidationLegalizeResult {
  ok: boolean
  success: boolean
  legalizada: boolean
  approved?: boolean
  failedStep?: 'dian' | 'rips_cufe' | 'muv' | 'rips_local' | string | null
  error?: string
  estado_dian?: import('@/types/dualValidation').EstadoDian
  codigo_cufe?: string | null
  estado_muv?: import('@/types/dualValidation').EstadoMuv
  codigo_cuv?: string | null
  detalles_rechazo_muv?: Array<{ code?: string; field?: string; message: string }>
  cufe?: string | null
  cuv?: string | null
  cuvRecordId?: string
  dianXml?: string | null
  rips?: RipsTransaction
  source?: string
  procesoId?: string
  fechaRadicacion?: string
  localIssues?: Array<{ level: string; field?: string; message: string }>
  ministryErrors?: Array<{ message: string }>
}

/**
 * Legaliza la transacción clínica: DIAN (CUFE) → inyecta CUFE en RIPS → MUV (CUV).
 */
export async function legalizeElectronicPayment(input: {
  rips: RipsTransaction | Record<string, unknown>
  invoice: DianInvoicePayload & { invoiceNumber?: string; numFactura?: string }
  metadatos?: RipsValidateRequestMetadatos
  transactionId?: string
}): Promise<DualValidationLegalizeResult> {
  const response = await fetch('/api/payments/legalize', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...identityHeaders(),
    },
    body: JSON.stringify(input),
  })
  return parseJson<DualValidationLegalizeResult>(response)
}

export interface DictatedEvolutionBillingResult {
  ok: boolean
  success: boolean
  route?: FiscalBillingRoute
  perfilFiscal?: FiscalProfile
  numFactura?: string | null
  cuv?: string | null
  cufe?: string | null
  cuvRecordId?: string
  dianXml?: string | null
  pendingRips?: { id: string; numFactura: string | null; status: string }
  message?: string
  error?: string
  codes?: { cie10: string[]; cups: string[] }
  localIssues?: Array<{ level: string; field?: string; message: string }>
  ministryErrors?: Array<{ message: string }>
  estado_dian?: import('@/types/dualValidation').EstadoDian
  codigo_cufe?: string | null
  estado_muv?: import('@/types/dualValidation').EstadoMuv
  codigo_cuv?: string | null
  detalles_rechazo_muv?: Array<{ message: string }>
  legalizada?: boolean
}

/**
 * Tras extraer CIE-10 y CUPS, el backend valida el perfil fiscal:
 * Obligado → generarFEV_y_RIPS(); No obligado → guardarRIPS_Pendiente(numFactura: null).
 */
export async function routeDictatedEvolutionByFiscalProfile(input: {
  rips: RipsTransaction
  invoice?: DianInvoicePayload
  metadatos?: RipsValidateRequestMetadatos
  cie10?: Array<string | null | undefined>
  cups?: Array<string | null | undefined>
  clinicalItems?: Array<{ cie10Code?: string | null; cupsCode?: string | null }>
}): Promise<DictatedEvolutionBillingResult> {
  const response = await fetch(`${API_BASE}/evolucion-dictada`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...identityHeaders(),
    },
    body: JSON.stringify(input),
  })
  return parseJson<DictatedEvolutionBillingResult>(response)
}

/** Descarga XML FEV-Salud con CUV inyectado para transmisión DIAN. */
export function downloadDianXml(xml: string, numFactura: string | null | undefined): void {
  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const safe = (numFactura ?? 'SIN_FEV').replace(/[^\w.-]/g, '_') || 'FEV'
  link.href = url
  link.download = `FEV_Salud_${safe}.xml`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export async function fetchCuvHistory(): Promise<RipsCuvStoredRecord[]> {
  const response = await fetch(`${API_BASE}/cuv/history`, {
    headers: identityHeaders(),
  })
  const data = await parseJson<{ success: boolean; records: RipsCuvStoredRecord[] }>(response)
  return data.records ?? []
}
