import { useMemo, useState } from 'react'
import type { EvolutionNote } from '@/types/evolutionNote'
import { createEmptyCatalogService } from '@/types/evolutionNote'
import {
  appendAestheticServiceToNote,
  appendCatalogServiceToNote,
  buildEvolutionNotePatchFromServices,
  getEvolutionCatalogServices,
  removeCatalogServiceFromNote,
  updateCatalogServiceInNote,
} from '@/utils/evolutionCatalogServices'
import { formatCurrency } from '@/utils'
import { AestheticServiceModal } from '@/components/checkout/AestheticServiceModal'
import { EvolutionDentalServiceSelect } from './EvolutionDentalServiceSelect'

interface EvolutionCatalogServicesFieldProps {
  note: EvolutionNote
  disabled?: boolean
  onChange: (patch: Partial<EvolutionNote>) => void
}

export function EvolutionCatalogServicesField({
  note,
  disabled = false,
  onChange,
}: EvolutionCatalogServicesFieldProps) {
  const persistedServices = getEvolutionCatalogServices(note)
  const placeholderService = useMemo(() => createEmptyCatalogService(), [note.id])
  const displayServices =
    persistedServices.length > 0 ? persistedServices : [placeholderService]
  const [aestheticOpen, setAestheticOpen] = useState(false)

  const totalCost = displayServices.reduce((sum, service) => sum + (service.cost ?? 0), 0)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="label-field mb-0">
          Procedimiento del Catálogo <span className="text-red-500">*</span>
        </label>
        {!disabled && (
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onChange(appendCatalogServiceToNote(note))}
              className="text-xs font-medium text-dental-700 hover:text-dental-900"
            >
              + Agregar otro procedimiento
            </button>
            <button
              type="button"
              onClick={() => setAestheticOpen(true)}
              className="text-xs font-medium text-dental-700 hover:text-dental-900"
            >
              + Agregar Servicio Estético/Insumo
            </button>
          </div>
        )}
      </div>

      <p className="text-[10px] text-slate-400">
        Puede registrar varios CUPS o tratamientos realizados en la misma sesión clínica. Los
        servicios estéticos sin CUPS se facturan a la DIAN con el nombre literal y van a RIPS como
        Otros Servicios.
      </p>

      <div className="space-y-3">
        {displayServices.map((service, index) => (
          <div
            key={service.id}
            className="rounded-lg border border-slate-200 bg-white/80 p-3 shadow-sm"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {service.requiereCupsRips === false
                  ? `Estético / insumo ${index + 1}`
                  : `Procedimiento ${index + 1}`}
              </span>
              {!disabled && displayServices.length > 1 && (
                <button
                  type="button"
                  onClick={() => onChange(removeCatalogServiceFromNote(note, service.id))}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Quitar
                </button>
              )}
            </div>

            {service.requiereCupsRips === false ? (
              <div className="space-y-1 text-sm">
                <p className="font-medium text-slate-800">{service.serviceName || service.procedure}</p>
                <p className="text-xs text-slate-500">
                  Sin CUPS · DIAN nombre literal · RIPS Otros Servicios
                  {typeof service.cost === 'number' ? ` · ${formatCurrency(service.cost)}` : ''}
                </p>
              </div>
            ) : (
              <EvolutionDentalServiceSelect
                service={service}
                disabled={disabled}
                showLabel={false}
                onChange={(nextService) => {
                  if (persistedServices.length === 0) {
                    onChange(buildEvolutionNotePatchFromServices(note, [nextService]))
                    return
                  }
                  onChange(updateCatalogServiceInNote(note, service.id, nextService))
                }}
              />
            )}
          </div>
        ))}
      </div>

      {totalCost > 0 && (
        <p className="text-xs text-slate-600">
          Costo estimado de procedimientos: <strong>{formatCurrency(totalCost)}</strong>
        </p>
      )}

      <AestheticServiceModal
        open={aestheticOpen}
        onClose={() => setAestheticOpen(false)}
        onSubmit={(values) => onChange(appendAestheticServiceToNote(note, values.name, values.unitPrice))}
      />
    </div>
  )
}
