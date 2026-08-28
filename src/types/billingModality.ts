export type BillingModality = 'automatic' | 'manual'

export type FolioPaymentGateway = 'wompi' | 'mercadopago' | 'nequi'

export interface BillingResolutionSettings {
  resolutionNumber: string
  prefix: string
  rangeFrom: string
  rangeTo: string
}

export interface FolioPack {
  id: 'basico' | 'profesional' | 'clinica'
  name: string
  invoices: number
  priceCop: number
}

export const WELCOME_FOLIO_GRANT = 20

export const FOLIO_PACKS: FolioPack[] = [
  { id: 'basico', name: 'Paquete Básico', invoices: 100, priceCop: 120_000 },
  { id: 'profesional', name: 'Paquete Profesional', invoices: 250, priceCop: 220_000 },
  { id: 'clinica', name: 'Paquete Clínica', invoices: 500, priceCop: 350_000 },
]

export const FOLIO_PAYMENT_GATEWAYS: Array<{
  id: FolioPaymentGateway
  label: string
}> = [
  { id: 'wompi', label: 'Wompi' },
  { id: 'mercadopago', label: 'Mercado Pago' },
  { id: 'nequi', label: 'Nequi' },
]

export const FOLIO_DEPLETED_MESSAGE =
  'Has agotado tu saldo de facturas electrónicas. Tu sistema seguirá emitiendo Recibos de Caja e Historias Clínicas sin interrupción. Puedes recargar cuando lo desees.'

export interface BillingModalitySettings {
  modality: BillingModality
  /** Clave del tenant de marca blanca (no es de un proveedor externo). */
  tenantApiKey: string
  resolution: BillingResolutionSettings
  lastConnectionOkAt: string | null
  foliosAvailable: number
  welcomeFolios: number
  hasPurchasedPack: boolean
}

export const BILLING_MODALITY_STORAGE_KEY = 'dental_emr_billing_modality'
export const CLINIC_BILLING_SETTINGS_ID = 'white-label'

export interface ClinicBillingSettingsRecord extends BillingModalitySettings {
  id: typeof CLINIC_BILLING_SETTINGS_ID
  updatedAt: string
}

export const DEFAULT_BILLING_MODALITY_SETTINGS: BillingModalitySettings = {
  modality: 'automatic',
  tenantApiKey: '',
  resolution: {
    resolutionNumber: '',
    prefix: 'FV',
    rangeFrom: '',
    rangeTo: '',
  },
  lastConnectionOkAt: null,
  foliosAvailable: WELCOME_FOLIO_GRANT,
  welcomeFolios: WELCOME_FOLIO_GRANT,
  hasPurchasedPack: false,
}
