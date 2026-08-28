import type {
  DianInvoicePayload,
  RipsValidateRequestMetadatos,
  RipsValidateResponse,
  RipsCuvStoredRecord,
} from '@/types/ripsCuv'
import type { RipsTransaction } from '@/types/rips'

const API_BASE = import.meta.env.VITE_RIPS_API_URL ?? '/api/rips'

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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rips,
      metadatos: options?.metadatos,
      invoice: options?.invoice,
    }),
  })

  return parseJson<RipsValidateResponse>(response)
}

/** Descarga XML FEV-Salud con CUV inyectado para transmisión DIAN. */
export function downloadDianXml(xml: string, numFactura: string): void {
  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const safe = numFactura.replace(/[^\w.-]/g, '_') || 'FEV'
  link.href = url
  link.download = `FEV_Salud_${safe}.xml`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export async function fetchCuvHistory(): Promise<RipsCuvStoredRecord[]> {
  const response = await fetch(`${API_BASE}/cuv/history`)
  const data = await parseJson<{ success: boolean; records: RipsCuvStoredRecord[] }>(response)
  return data.records ?? []
}
