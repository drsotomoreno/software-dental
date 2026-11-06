import { API_AUTH_TOKEN_KEY } from '@/services/apiAuthService'
import type {
  DashboardMetrics,
  InfraSnapshot,
  IntegrationLogFeed,
  MinsaludPingResult,
  SubscriptionFeed,
  SuperadminTenant,
  SystemSettings,
  TenantMutationResult,
  TenantStatus,
} from '@/types/superadmin'

export class SuperAdminApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'SuperAdminApiError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem(API_AUTH_TOKEN_KEY)
  let response: Response
  try {
    response = await fetch(`/api/superadmin${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new SuperAdminApiError(0, 'No hay conexión con el API del panel.')
  }

  const payload = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) {
    const message =
      typeof payload.error === 'string' ? payload.error : 'No se pudo completar la operación.'
    throw new SuperAdminApiError(response.status, message)
  }
  return payload as T
}

export function fetchDashboardMetrics() {
  return request<DashboardMetrics>('/metrics')
}

export function fetchInfrastructure() {
  return request<InfraSnapshot>('/infrastructure')
}

export function fetchTenants() {
  return request<{ ok: true; source: 'postgres' | 'fixture'; tenants: SuperadminTenant[] }>('/tenants')
}

export function suspendTenantAccount(id: string, status: TenantStatus) {
  return request<TenantMutationResult>(`/tenants/${encodeURIComponent(id)}/suspend`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  })
}

export function forceTenantOfflineSync(id: string) {
  return request<TenantMutationResult>(`/tenants/${encodeURIComponent(id)}/sync`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function fetchIntegrationLogs() {
  return request<IntegrationLogFeed>('/logs')
}

export function pingMinsaludEndpoint() {
  return request<MinsaludPingResult>('/ping/minsalud', { method: 'POST', body: '{}' })
}

export function forceGlobalOfflineSync() {
  return request<{ ok: true; queued: number; queuedAt: string; message: string }>('/sync', {
    method: 'POST',
    body: '{}',
  })
}

export function verifyDianCredentials() {
  return request<{ ok: boolean; configured: boolean; softwareId: string; message: string }>(
    '/dian/credentials',
    { method: 'POST', body: '{}' },
  )
}

export function fetchSubscriptions() {
  return request<SubscriptionFeed>('/subscriptions')
}

export function fetchSystemSettings() {
  return request<SystemSettings>('/settings')
}
