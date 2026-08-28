import { db } from '@/db/database'
import type { BillingModalitySettings, ClinicBillingSettingsRecord } from '@/types/billingModality'
import {
  BILLING_MODALITY_STORAGE_KEY,
  CLINIC_BILLING_SETTINGS_ID,
  DEFAULT_BILLING_MODALITY_SETTINGS,
  WELCOME_FOLIO_GRANT,
} from '@/types/billingModality'
import { setPaymentInvoicePrefix } from '@/services/paymentInvoiceService'
import { generateId } from '@/utils/crypto'

export const BILLING_SETTINGS_CHANGED_EVENT = 'dental-billing-modality-changed'

function notifyChanged(): void {
  window.dispatchEvent(new Event(BILLING_SETTINGS_CHANGED_EVENT))
}

function ensureTenantApiKey(key: string | undefined): string {
  const trimmed = key?.trim() ?? ''
  return trimmed || `mb-${generateId()}`
}

function persistIndexedDbCopy(settings: BillingModalitySettings): void {
  const record: ClinicBillingSettingsRecord = {
    ...settings,
    id: CLINIC_BILLING_SETTINGS_ID,
    updatedAt: new Date().toISOString(),
  }
  void db.clinicBillingSettings.put(record).catch(() => {
    /* IndexedDB puede no estar listo en el primer arranque */
  })
}

export function getBillingModalitySettings(): BillingModalitySettings {
  try {
    const raw = localStorage.getItem(BILLING_MODALITY_STORAGE_KEY)
    if (!raw) {
      const fresh: BillingModalitySettings = {
        ...DEFAULT_BILLING_MODALITY_SETTINGS,
        resolution: { ...DEFAULT_BILLING_MODALITY_SETTINGS.resolution },
        tenantApiKey: ensureTenantApiKey(''),
        foliosAvailable: WELCOME_FOLIO_GRANT,
        welcomeFolios: WELCOME_FOLIO_GRANT,
      }
      localStorage.setItem(BILLING_MODALITY_STORAGE_KEY, JSON.stringify(fresh))
      persistIndexedDbCopy(fresh)
      return fresh
    }
    const parsed = JSON.parse(raw) as Partial<BillingModalitySettings> & {
      apiKey?: string
      provider?: string
    }
    const folios =
      typeof parsed.foliosAvailable === 'number'
        ? parsed.foliosAvailable
        : WELCOME_FOLIO_GRANT
    const settings: BillingModalitySettings = {
      ...DEFAULT_BILLING_MODALITY_SETTINGS,
      ...parsed,
      tenantApiKey: ensureTenantApiKey(parsed.tenantApiKey || parsed.apiKey),
      resolution: {
        ...DEFAULT_BILLING_MODALITY_SETTINGS.resolution,
        ...parsed.resolution,
      },
      foliosAvailable: Math.max(0, folios),
      welcomeFolios: parsed.welcomeFolios ?? WELCOME_FOLIO_GRANT,
      hasPurchasedPack: Boolean(parsed.hasPurchasedPack),
    }
    return settings
  } catch {
    return {
      ...DEFAULT_BILLING_MODALITY_SETTINGS,
      resolution: { ...DEFAULT_BILLING_MODALITY_SETTINGS.resolution },
      tenantApiKey: ensureTenantApiKey(''),
    }
  }
}

export function saveBillingModalitySettings(settings: BillingModalitySettings): void {
  const next = {
    ...settings,
    tenantApiKey: ensureTenantApiKey(settings.tenantApiKey),
  }
  localStorage.setItem(BILLING_MODALITY_STORAGE_KEY, JSON.stringify(next))
  persistIndexedDbCopy(next)
  const prefix = next.resolution.prefix.trim().toUpperCase()
  if (prefix) setPaymentInvoicePrefix(prefix)
  notifyChanged()
}

/** Restaura folios, clave de tenant y resolución DIAN desde IndexedDB si localStorage está vacío. */
export async function hydrateBillingSettingsFromIndexedDb(): Promise<void> {
  try {
    const row = await db.clinicBillingSettings.get(CLINIC_BILLING_SETTINGS_ID)
    const raw = localStorage.getItem(BILLING_MODALITY_STORAGE_KEY)
    if (!raw && row) {
      const { id: _id, updatedAt: _updatedAt, ...settings } = row
      saveBillingModalitySettings(settings)
      return
    }
    persistIndexedDbCopy(getBillingModalitySettings())
  } catch {
    /* Sin IndexedDB el saldo sigue en localStorage */
  }
}

export function getFoliosAvailable(
  settings: BillingModalitySettings = getBillingModalitySettings(),
): number {
  return Math.max(0, settings.foliosAvailable)
}

export function hasElectronicFolios(
  settings: BillingModalitySettings = getBillingModalitySettings(),
): boolean {
  return getFoliosAvailable(settings) > 0
}

export function consumeElectronicFolio(): boolean {
  const settings = getBillingModalitySettings()
  if (settings.foliosAvailable <= 0) return false
  saveBillingModalitySettings({
    ...settings,
    foliosAvailable: settings.foliosAvailable - 1,
  })
  return true
}

export function creditElectronicFolios(quantity: number): BillingModalitySettings {
  const settings = getBillingModalitySettings()
  const next: BillingModalitySettings = {
    ...settings,
    foliosAvailable: settings.foliosAvailable + Math.max(0, quantity),
    hasPurchasedPack: true,
  }
  saveBillingModalitySettings(next)
  return next
}

/** Servicio de marca blanca listo: clave de tenant y modalidad electrónica. */
export function isWhiteLabelBillingActive(
  settings: BillingModalitySettings = getBillingModalitySettings(),
): boolean {
  return settings.modality === 'automatic' && Boolean(settings.tenantApiKey.trim())
}

export function isAutomaticBillingConfigured(
  settings: BillingModalitySettings = getBillingModalitySettings(),
): boolean {
  return isWhiteLabelBillingActive(settings) && hasElectronicFolios(settings)
}

export function usesProviderEmission(
  settings: BillingModalitySettings = getBillingModalitySettings(),
): boolean {
  return settings.modality === 'automatic' && hasElectronicFolios(settings)
}

export function usesManualCashReceipt(
  settings: BillingModalitySettings = getBillingModalitySettings(),
): boolean {
  return !usesProviderEmission(settings)
}

export function getFolioBalanceLabel(
  settings: BillingModalitySettings = getBillingModalitySettings(),
): string {
  const available = getFoliosAvailable(settings)
  if (!settings.hasPurchasedPack) {
    return `Tienes ${available} / ${settings.welcomeFolios} facturas de bienvenida disponibles`
  }
  return `Tienes ${available} facturas electrónicas disponibles`
}
