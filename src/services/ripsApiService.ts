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

export interface RipsApiStatus {
  online: boolean
  /** true cuando el servidor simula el MUV. null si el health no lo dijo. */
  sandbox: boolean | null
}

/** El health local no significa que el MUV haya respondido. */
export async function fetchRipsApiStatus(): Promise<RipsApiStatus> {
  try {
    const response = await fetch('/api/health')
    if (!response.ok) return { online: false, sandbox: null }
    const data = (await response.json().catch(() => ({}))) as {
      minsalud?: { sandbox?: boolean }
    }
    return {
      online: true,
      sandbox: data.minsalud?.sandbox === true ? true : data.minsalud?.sandbox === false ? false : null,
    }
  } catch {
    return { online: false, sandbox: null }
  }
}

/** Verifica que el backend RIPS esté disponible (vía proxy). No consulta al MUV. */
export async function checkRipsApiHealth(): Promise<boolean> {
  const status = await fetchRipsApiStatus()
  return status.online
}

export interface RadicacionRipsResult {
  success: boolean
  cuv?: string | null
  canal?: 'fev' | 'sin_factura' | string
  /** sandbox: el CUV es de prueba y el MUV no fue contactado. */
  source?: 'sandbox' | 'minsalud' | string | null
  logId?: string | null
  retryable?: boolean
  code?: string
  error?: string
  errors?: Array<{ code?: string; message?: string; path?: string }>
}

/**
 * Entrega definitiva del paquete. Con CUFE o XML usa CargarFevRips.
 * Sin ellos, CargarRipsSinFactura (registro epidemiológico).
 */
export async function radicarRipsAnteMinisterio(envelope: {
  rips: RipsTransaction
  cufe?: string | null
  xmlFevFile?: string | null
  evolutionId?: string | null
  patientId?: string | null
}): Promise<RadicacionRipsResult> {
  const response = await fetch(`${API_BASE}/send-single`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...identityHeaders() },
    body: JSON.stringify({
      rips: envelope.rips,
      cufe: envelope.cufe ?? '',
      xmlFevFile: envelope.xmlFevFile ?? '',
      evolutionId: envelope.evolutionId ?? null,
      patientId: envelope.patientId ?? null,
    }),
  })
  return parseJson<RadicacionRipsResult>(response)
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

export type FiscalBillingRoute = 'generarFEV_y_RIPS' | 'guardarRIPS_Pendiente' | 'muv_sin_factura'

export type EstadoMuv = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO'

export interface DictatedEvolutionBillingResult {
  ok: boolean
  success: boolean
  route?: FiscalBillingRoute
  perfilFiscal?: FiscalProfile
  numFactura?: string | null
  cuv?: string | null
  cuvRecordId?: string
  estadoMuv?: EstadoMuv
  clinicoGuardado?: boolean
  resultadoValidacion?: unknown
  consultaId?: string | null
  dianXml?: string | null
  pendingRips?: { id: string; numFactura: string | null; status: string }
  message?: string
  error?: string
  field?: string | null
  codes?: { cie10: string[]; cups: string[] }
  localIssues?: Array<{ level: string; field?: string; message: string }>
  ministryErrors?: Array<{ message: string }>
}

/**
 * Tras extraer CIE-10 y CUPS, el backend elige la ruta:
 * FEV → generarFEV_y_RIPS(); recibo interno o valor cero → RIPS sin factura;
 * no obligado → guardarRIPS_Pendiente(numFactura: null).
 */
export async function routeDictatedEvolutionByFiscalProfile(input: {
  rips?: RipsTransaction
  atencion?: object
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
