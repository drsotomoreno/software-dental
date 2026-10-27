import { useMemo, useState } from 'react'
import type {
  EvolutionCatalogService,
  EvolutionNote,
  EvolutionNoteDiagnosis,
  EvolutionNotePatch,
} from '@/types/evolutionNote'
import { createEmptyCatalogService } from '@/types/evolutionNote'
import {
  appendAestheticServiceToNote,
  appendCatalogServiceToNote,
  buildEvolutionNotePatchFromServices,
  getEvolutionCatalogServices,
} from '@/utils/evolutionCatalogServices'
import {
  evolutionDiagnosesPatch,
  procedureCardsWithDiagnoses,
  sessionDiagnosesFromProcedures,
} from '@/utils/evolutionNoteAssociation'
import { formatCurrency } from '@/utils'
import { AestheticServiceModal } from '@/components/checkout/AestheticServiceModal'
import { AnatomicalAssociationSelect } from '@/components/clinical/diagnostics/DiagnosisAssociationFields'
import { diagnosisLocationLabel } from '@/utils/diagnosisAssociation'
import { Cie10PrincipalCombobox } from './Cie10PrincipalCombobox'
import { EvolutionDentalServiceSelect } from './EvolutionDentalServiceSelect'

interface EvolutionCatalogServicesFieldProps {
  note: EvolutionNote
  disabled?: boolean
  onChange: (patch: EvolutionNotePatch) => void
}

function procedureHasContent(service: EvolutionCatalogService): boolean {
  return Boolean(
    service.dentalServiceId ||
      service.serviceName?.trim() ||
      service.procedure?.trim() ||
      service.cie10Code?.trim() ||
      service.toothNumber ||
      service.anatomicalScope,
  )
}

export function EvolutionCatalogServicesField({
  note,
  disabled = false,
  onChange,
}: EvolutionCatalogServicesFieldProps) {
  const persistedServices = getEvolutionCatalogServices(note)
  const placeholderService = useMemo(() => createEmptyCatalogService(), [note.id])
  const sourceServices = persistedServices.length > 0 ? persistedServices : [placeholderService]
  const view = procedureCardsWithDiagnoses(note, sourceServices)
  const displayServices = view.services
  const extras = view.extras
  const [aestheticOpen, setAestheticOpen] = useState(false)

  const totalCost = displayServices.reduce((sum, service) => sum + (service.cost ?? 0), 0)

  const publish = (services: EvolutionCatalogService[], nextExtras: EvolutionNoteDiagnosis[]) => {
    const diagnoses = sessionDiagnosesFromProcedures(services, nextExtras)
    const hadDiagnosis =
      (note.diagnoses ?? []).some((diagnosis) => diagnosis.code.trim()) ||
      Boolean(note.ripsMetadata?.codDiagnosticoPrincipal?.trim()) ||
      services.some((service) => service.cie10Code?.trim()) ||
      nextExtras.some((diagnosis) => diagnosis.code.trim())
    const base = buildEvolutionNotePatchFromServices(note, services)
    if (!hadDiagnosis && diagnoses.length === 0) {
      onChange(base)
      return
    }
    onChange({ ...base, ...evolutionDiagnosesPatch(diagnoses) })
  }

  const editService = (serviceId: string, patch: Partial<EvolutionCatalogService>) => {
    publish(
      displayServices.map((service) => (service.id === serviceId ? { ...service, ...patch } : service)),
      extras,
    )
  }

  const removeService = (serviceId: string) => {
    const remaining = displayServices.filter((service) => service.id !== serviceId)
    publish(remaining, extras)
  }

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
              onClick={() => {
                if (persistedServices.length === 0) {
                  onChange(
                    buildEvolutionNotePatchFromServices(note, [
                      placeholderService,
                      createEmptyCatalogService(),
                    ]),
                  )
                  return
                }
                onChange(appendCatalogServiceToNote(note))
              }}
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
        Cada procedimiento lleva, juntos, la zona o el diente y el diagnóstico.
        {!disabled && ' Puede eliminar el procedimiento mientras la evolución no esté cerrada.'}
      </p>

      <div className="space-y-3">
        {displayServices.map((service, index) => {
          const filled = procedureHasContent(service)
          const canRemove = !disabled && (displayServices.length > 1 || filled)
          const principal = Boolean(service.cie10Code?.trim()) &&
            displayServices.find((item) => item.cie10Code?.trim())?.id === service.id
          return (
            <div
              key={service.id}
              className="rounded-lg border border-slate-200 bg-white/80 p-3 shadow-sm"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {service.requiereCupsRips === false
                    ? `Estético / insumo ${index + 1}`
                    : `Procedimiento ${index + 1}`}
                  {service.cie10Code?.trim() && (
                    <span className="ml-2 font-medium normal-case tracking-normal text-slate-400">
                      {principal ? 'Diagnóstico principal' : 'Diagnóstico relacionado'}
                    </span>
                  )}
                </span>
                {canRemove && (
                  <button
                    type="button"
                    onClick={() => removeService(service.id)}
                    className="text-xs text-red-500 hover:text-red-700"
                    aria-label={`Eliminar procedimiento ${index + 1}`}
                  >
                    Eliminar procedimiento
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
                    editService(service.id, {
                      ...nextService,
                      cie10Code: service.cie10Code,
                      cie10Description: service.cie10Description,
                      toothNumber: service.toothNumber,
                      anatomicalScope: service.anatomicalScope,
                    })
                  }}
                />
              )}

              <div className="mt-3 grid gap-3 md:grid-cols-2 md:items-start">
                <AnatomicalAssociationSelect
                  toothNumber={service.toothNumber}
                  anatomicalScope={service.anatomicalScope}
                  disabled={disabled}
                  label="Zona o diente"
                  pending={
                    !disabled &&
                    (filled || Boolean(service.cie10Code?.trim())) &&
                    !diagnosisLocationLabel(service)
                  }
                  ariaLabel={`Zona o diente de ${service.serviceName || service.procedure || `procedimiento ${index + 1}`}`}
                  onChange={(location) => editService(service.id, location)}
                />
                <Cie10PrincipalCombobox
                  value={service.cie10Code ?? ''}
                  disabled={disabled}
                  required={service.requiereCupsRips !== false}
                  label="Diagnóstico (CIE-10)"
                  onChange={(code, description) =>
                    editService(service.id, {
                      cie10Code: code,
                      cie10Description: description ?? '',
                    })
                  }
                />
              </div>
            </div>
          )
        })}
      </div>

      {extras.length > 0 && (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-white/80 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Otros diagnósticos de esta sesión
          </p>
          {extras.map((diagnosis) => {
            const where = diagnosisLocationLabel(diagnosis)
            return (
              <div key={diagnosis.id} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <Cie10PrincipalCombobox
                  value={diagnosis.code}
                  disabled={disabled}
                  required={false}
                  label="Diagnóstico relacionado (CIE-10)"
                  onChange={(code, description) =>
                    publish(
                      displayServices,
                      extras.map((item) =>
                        item.id === diagnosis.id
                          ? { ...item, code, description: description ?? '' }
                          : item,
                      ),
                    )
                  }
                />
                <div className="flex items-center justify-between gap-2 pb-1">
                  {where && <span className="text-xs text-slate-500">{where}</span>}
                  {!disabled && (
                    <button
                      type="button"
                      className="text-xs text-red-500 hover:text-red-700"
                      onClick={() =>
                        publish(
                          displayServices,
                          extras.filter((item) => item.id !== diagnosis.id),
                        )
                      }
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

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
