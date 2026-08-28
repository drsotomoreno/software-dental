import { useMemo } from 'react'
import type { EvolutionNote } from '@/types/evolutionNote'
import { createEmptyCatalogService } from '@/types/evolutionNote'
import {
  appendCatalogServiceToNote,
  buildEvolutionNotePatchFromServices,
  getEvolutionCatalogServices,
  removeCatalogServiceFromNote,
  updateCatalogServiceInNote,
} from '@/utils/evolutionCatalogServices'
import { formatCurrency } from '@/utils'
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

  const totalCost = displayServices.reduce((sum, service) => sum + (service.cost ?? 0), 0)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="label-field mb-0">
          Procedimiento del Catálogo <span className="text-red-500">*</span>
        </label>
        {!disabled && (
          <button
            type="button"
            onClick={() => onChange(appendCatalogServiceToNote(note))}
            className="text-xs font-medium text-dental-700 hover:text-dental-900"
          >
            + Agregar otro procedimiento
          </button>
        )}
      </div>

      <p className="text-[10px] text-slate-400">
        Puede registrar varios CUPS o tratamientos realizados en la misma sesión clínica.
      </p>

      <div className="space-y-3">
        {displayServices.map((service, index) => (
          <div
            key={service.id}
            className="rounded-lg border border-slate-200 bg-white/80 p-3 shadow-sm"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Procedimiento {index + 1}
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
          </div>
        ))}
      </div>

      {totalCost > 0 && (
        <p className="text-xs text-slate-600">
          Costo estimado de procedimientos: <strong>{formatCurrency(totalCost)}</strong>
        </p>
      )}
    </div>
  )
}
