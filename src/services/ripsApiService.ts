import type {
  DianInvoicePayload,
  DualValidationApiResponse,
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

export interface DictatedEvolutionBillingResult {
  ok: boolean
  success: boolean
  route?: FiscalBillingRoute
  perfilFiscal?: FiscalProfile
  numFactura?: string | null
  cuv?: string | null
  cufe?: string | null
  codigo_cufe?: string | null
  codigo_cuv?: string | null
  estado_dian?: import('@/utils/dualValidation').EstadoDian
  estado_minsalud_muv?: import('@/utils/dualValidation').EstadoMinsaludMuv
  detalles_rechazo_muv?: import('@/utils/dualValidation').MuvRejectionDetail[]
  listoParaEntrega?: boolean
  cuvRecordId?: string
  dianXml?: string | null
  rips?: RipsTransaction
  pendingRips?: { id: string; numFactura: string | null; status: string }
  message?: string
  error?: string
  codes?: { cie10: string[]; cups: string[] }
  localIssues?: Array<{ level: string; field?: string; message: string }>
  ministryErrors?: Array<{ message: string }>
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

const INVOICES_API = import.meta.env.VITE_INVOICES_API_URL ?? '/api/invoices'

/**
 * Orquesta CUFE (DIAN) → RIPS → CUV (MUV) en el backend.
 */
export async function emitDualValidation(input: {
  rips?: RipsTransaction | Record<string, unknown>
  invoice?: DianInvoicePayload & { invoiceNumber?: string; amount?: number }
  metadatos?: RipsValidateRequestMetadatos
  options?: { forceDianReject?: boolean; apiKey?: string }
}): Promise<DualValidationApiResponse> {
  const response = await fetch(`${INVOICES_API}/emit-dual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...identityHeaders() },
    body: JSON.stringify(input),
  })
  return parseJson<DualValidationApiResponse>(response)
}

/** Descarga XML FEV-Salud (CUFE inyectado; CUV opcional en copias de entrega). */
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
