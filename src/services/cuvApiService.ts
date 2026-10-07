import type { CuvExpediente, CuvEstado } from '@/types/cuvExpediente'
import { db } from '@/db/database'
import { getStoredApiAuth } from '@/services/apiAuthService'

function identityHeaders() {
  const auth = getStoredApiAuth()
  return {
    ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
    ...(auth?.user?.email ? { 'X-Client-Email': String(auth.user.email) } : {}),
    ...(auth?.user?.id ? { 'X-Client-User-Id': String(auth.user.id) } : {}),
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  const data = await response.json()
  return data as T
}

export async function cacheCuvExpedientes(rows: CuvExpediente[]): Promise<void> {
  if (rows.length === 0) return
  await db.cuvExpedientes.bulkPut(rows)
}

export async function listCuvExpedientes(estado?: CuvEstado): Promise<{
  expedientes: CuvExpediente[]
  requierenAtencion: number
}> {
  const params = new URLSearchParams()
  if (estado) params.set('estado', estado)
  const response = await fetch(`/api/rips/cuv/expedientes?${params.toString()}`, {
    headers: identityHeaders(),
  })
  const data = await parseJson<{
    success: boolean
    expedientes?: CuvExpediente[]
    requierenAtencion?: number
    error?: string
  }>(response)
  if (!response.ok || !data.success) {
    throw new Error(data.error ?? 'No se pudo consultar la bandeja de CUV.')
  }
  const expedientes = data.expedientes ?? []
  await cacheCuvExpedientes(expedientes)
  return { expedientes, requierenAtencion: data.requierenAtencion ?? 0 }
}

export async function consultCuvEstado(query: {
  id?: string
  cuv?: string
  numFactura?: string
}): Promise<CuvExpediente> {
  const response = await fetch('/api/rips/cuv/consultar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...identityHeaders() },
    body: JSON.stringify(query),
  })
  const data = await parseJson<{ success: boolean; expediente?: CuvExpediente; error?: string }>(response)
  if (!data.expediente) throw new Error(data.error ?? 'No hay validación para ese CUV.')
  await cacheCuvExpedientes([data.expediente])
  return data.expediente
}

export async function resendCuvPackage(id: string): Promise<CuvExpediente> {
  const response = await fetch(`/api/rips/cuv/expedientes/${encodeURIComponent(id)}/reenviar`, {
    method: 'POST',
    headers: identityHeaders(),
  })
  const data = await parseJson<{ success: boolean; expediente?: CuvExpediente; error?: string }>(response)
  if (!data.expediente) throw new Error(data.error ?? 'No se pudo reenviar el paquete.')
  await cacheCuvExpedientes([data.expediente])
  return data.expediente
}
