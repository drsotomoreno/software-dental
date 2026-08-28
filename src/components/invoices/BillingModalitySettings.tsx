import { useEffect, useState } from 'react'
import { CheckCircle2, Receipt, Sparkles, Wallet } from 'lucide-react'
import type { BillingModality, BillingModalitySettings } from '@/types/billingModality'
import {
  getBillingModalitySettings,
  getFolioBalanceLabel,
  getFoliosAvailable,
  saveBillingModalitySettings,
  BILLING_SETTINGS_CHANGED_EVENT,
} from '@/services/billingModalityService'
import { FolioRechargeModal } from './FolioRechargeModal'

export function BillingModalitySettingsPanel() {
  const [settings, setSettings] = useState<BillingModalitySettings>(() => getBillingModalitySettings())
  const [saved, setSaved] = useState(false)
  const [rechargeOpen, setRechargeOpen] = useState(false)

  useEffect(() => {
    const refresh = () => setSettings(getBillingModalitySettings())
    window.addEventListener(BILLING_SETTINGS_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(BILLING_SETTINGS_CHANGED_EVENT, refresh)
  }, [])

  const persist = (next: BillingModalitySettings) => {
    saveBillingModalitySettings(next)
    setSettings(next)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2500)
  }

  const selectModality = (modality: BillingModality) => {
    persist({ ...settings, modality })
  }

  const available = getFoliosAvailable(settings)
  const depleted = available <= 0

  return (
    <section className="space-y-5">
      <div className="overflow-hidden rounded-2xl border border-dental-200 bg-gradient-to-br from-dental-50 via-white to-emerald-50 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-dental-700">
              Saldo de Facturas Electrónicas
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{getFolioBalanceLabel(settings)}</p>
            <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Servicio de Facturación DIAN Activo
            </p>
            {depleted && (
              <p className="mt-3 max-w-xl text-sm text-amber-900">
                Has agotado tu saldo de facturas electrónicas. Tu sistema seguirá emitiendo Recibos
                de Caja e Historias Clínicas sin interrupción. Puedes recargar cuando lo desees.
              </p>
            )}
          </div>
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-2"
            onClick={() => setRechargeOpen(true)}
          >
            <Wallet className="h-4 w-4" aria-hidden />
            Recargar Paquete de Facturas
          </button>
        </div>
      </div>

      <div className="card space-y-5">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Cómo quiere cobrar</h2>
          <p className="mt-1 text-sm text-slate-600">
            La facturación electrónica usa 1 folio por cobro. El Recibo de Caja interno no tiene
            costo de folios.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <button
            type="button"
            onClick={() => selectModality('automatic')}
            className={`rounded-2xl border p-5 text-left transition ${
              settings.modality === 'automatic'
                ? 'border-dental-500 bg-dental-50 ring-2 ring-dental-200'
                : 'border-slate-200 bg-white hover:border-dental-200'
            }`}
          >
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-dental-700" aria-hidden />
              <span className="rounded-full bg-dental-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                Recomendada
              </span>
            </div>
            <h3 className="text-base font-semibold text-slate-900">
              Facturación Electrónica DIAN integrada
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Al cobrar, el sistema firma la factura, genera el RIPS con CUV y imprime el ticket de
              80 mm con CUFE y código QR de la DIAN. Consume 1 folio.
            </p>
          </button>

          <button
            type="button"
            onClick={() => selectModality('manual')}
            className={`rounded-2xl border p-5 text-left transition ${
              settings.modality === 'manual'
                ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-200'
                : 'border-slate-200 bg-white hover:border-amber-200'
            }`}
          >
            <div className="mb-2 flex items-center gap-2">
              <Receipt className="h-5 w-5 text-amber-700" aria-hidden />
            </div>
            <h3 className="text-base font-semibold text-slate-900">
              Recibo de Caja interno de 80 mm
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Imprime el comprobante clínico y el RIPS JSON sin descontar folios ($0). Ideal si ya
              emitió la factura en el portal de la DIAN o no desea usar saldo.
            </p>
          </button>
        </div>

        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <p className="text-sm font-medium text-slate-800">Resolución DIAN de su clínica</p>
          <div className="grid gap-4 sm:grid-cols-4">
            <label className="block text-sm sm:col-span-2">
              <span className="label-field">Número de Resolución DIAN</span>
              <input
                className="input-field"
                value={settings.resolution.resolutionNumber}
                onChange={(event) =>
                  persist({
                    ...settings,
                    resolution: { ...settings.resolution, resolutionNumber: event.target.value },
                  })
                }
                placeholder="Ej. 18764000001234"
              />
            </label>
            <label className="block text-sm">
              <span className="label-field">Prefijo</span>
              <input
                className="input-field font-mono uppercase"
                value={settings.resolution.prefix}
                onChange={(event) =>
                  persist({
                    ...settings,
                    resolution: { ...settings.resolution, prefix: event.target.value.toUpperCase() },
                  })
                }
                placeholder="FV"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">
                <span className="label-field">Rango desde</span>
                <input
                  className="input-field"
                  inputMode="numeric"
                  value={settings.resolution.rangeFrom}
                  onChange={(event) =>
                    persist({
                      ...settings,
                      resolution: { ...settings.resolution, rangeFrom: event.target.value },
                    })
                  }
                  placeholder="1"
                />
              </label>
              <label className="block text-sm">
                <span className="label-field">Rango hasta</span>
                <input
                  className="input-field"
                  inputMode="numeric"
                  value={settings.resolution.rangeTo}
                  onChange={(event) =>
                    persist({
                      ...settings,
                      resolution: { ...settings.resolution, rangeTo: event.target.value },
                    })
                  }
                  placeholder="5000"
                />
              </label>
            </div>
          </div>
          <label className="block text-sm">
            <span className="label-field">Clave de su clínica (Marca Blanca)</span>
            <input
              className="input-field font-mono text-xs"
              value={settings.tenantApiKey}
              readOnly
            />
          </label>
        </div>

        {saved && <p className="text-sm text-green-700">Configuración guardada en este equipo.</p>}
      </div>

      <FolioRechargeModal
        open={rechargeOpen}
        onClose={() => setRechargeOpen(false)}
        onPurchased={() => setSettings(getBillingModalitySettings())}
      />
    </section>
  )
}
