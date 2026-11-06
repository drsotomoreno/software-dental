export type TenantStatus = 'activa' | 'suspendida'

export type DataSource = 'postgres' | 'fixture' | 'simulated'

export type ServiceHealth = 'operativo' | 'degradado' | 'caido' | 'pendiente'

export interface SuperadminTenant {
  id: string
  clinicName: string
  ownerName: string
  repsCode: string
  rethus: string
  plan: string
  status: TenantStatus
  patientCount: number
  mrrCop: number
  lastSyncAt: string | null
}

export interface ServiceStatus {
  id: 'muv' | 'dian' | 'googleDrive'
  label: string
  status: ServiceHealth
  detail: string
  simulated: boolean
}

export interface DashboardMetrics {
  ok: true
  source: 'postgres' | 'fixture'
  activeClinics: number
  registeredPatients: number
  mrrCop: number
  mrrSimulated: boolean
  services: ServiceStatus[]
}

export interface InfraSnapshot {
  ok: true
  source: 'simulated'
  sampledAt: string
  cpuPercent: number
  ramPercent: number
  rdsUsedGb: number
  rdsAllocatedGb: number
  note: string
}

export type LogLevel = 'info' | 'warning' | 'error'
export type LogSource = 'RIPS' | 'MinSalud' | 'DIAN' | 'Drive' | 'Sistema'

export interface IntegrationLogEvent {
  id: string
  at: string
  level: LogLevel
  source: LogSource
  message: string
}

export interface IntegrationLogFeed {
  ok: true
  source: 'postgres' | 'fixture'
  events: IntegrationLogEvent[]
}

export interface MinsaludPingResult {
  ok: boolean
  url: string
  httpStatus: number
  latencyMs: number
  sandbox: boolean
  error?: string
  event: IntegrationLogEvent
}

export interface SubscriptionRow {
  id: string
  clinicName: string
  plan: string
  mrrCop: number
  status: TenantStatus | 'prueba'
  renewsAt: string | null
}

export interface SubscriptionFeed {
  ok: true
  source: 'fixture'
  note: string
  subscriptions: SubscriptionRow[]
}

export interface SystemSettings {
  ok: true
  environment: string
  publicUrl: string
  database: 'configurada' | 'no configurada'
  minsaludSandbox: boolean
  minsaludConfigured: boolean
  dianSoftwareId: string
  dianConfigured: boolean
  googleDriveConfigured: boolean
  ripsCron: string
}

export interface TenantMutationResult {
  ok: true
  tenant: SuperadminTenant
  message?: string
  queuedAt?: string
}
