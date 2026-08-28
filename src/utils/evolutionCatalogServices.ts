import type { EvolutionCatalogService, EvolutionNote } from '@/types/evolutionNote'
import { createEmptyCatalogService } from '@/types/evolutionNote'

export function getEvolutionCatalogServices(note: EvolutionNote): EvolutionCatalogService[] {
  if (note.catalogServices?.length) {
    return note.catalogServices
  }

  if (
    note.dentalServiceId ||
    note.serviceName?.trim() ||
    note.procedure?.trim() ||
    note.cupsCode
  ) {
    return [
      {
        id: `legacy-${note.id}`,
        dentalServiceId: note.dentalServiceId,
        serviceName: note.serviceName,
        procedure: note.procedure ?? '',
        cupsCode: note.cupsCode,
        requiereCupsRips: note.requiereCupsRips,
        cost: note.cost,
        isBillable: note.isBillable,
      },
    ]
  }

  return []
}

export function noteHasCatalogServices(note: EvolutionNote): boolean {
  return getEvolutionCatalogServices(note).some(
    (service) =>
      Boolean(service.dentalServiceId) ||
      Boolean(service.serviceName?.trim()) ||
      Boolean(service.procedure?.trim()),
  )
}

export function resolveEvolutionNoteRipsMode(
  note: EvolutionNote,
): 'non_rips' | 'rips' | 'mixed' | 'empty' {
  const services = getEvolutionCatalogServices(note)
  if (services.length === 0) {
    return note.requiereCupsRips === false ? 'non_rips' : 'empty'
  }

  const nonRipsCount = services.filter((service) => service.requiereCupsRips === false).length
  if (nonRipsCount === services.length) return 'non_rips'
  if (nonRipsCount === 0) return 'rips'
  return 'mixed'
}

export function buildEvolutionNotePatchFromServices(
  note: EvolutionNote,
  services: EvolutionCatalogService[],
): Partial<EvolutionNote> {
  const filled = services.filter(
    (service) =>
      service.procedure?.trim() ||
      service.serviceName?.trim() ||
      service.dentalServiceId,
  )
  const primary = filled[0]
  const totalCost = filled.reduce((sum, service) => sum + (service.cost ?? 0), 0)
  const ripsMode = resolveEvolutionNoteRipsMode({ ...note, catalogServices: filled })

  const procedureSummary =
    filled.length > 1
      ? filled
          .map((service) => service.serviceName || service.procedure)
          .filter(Boolean)
          .join(' · ')
      : (primary?.procedure ?? '')

  return {
    catalogServices: services,
    dentalServiceId: primary?.dentalServiceId,
    serviceName: primary?.serviceName,
    procedure: procedureSummary,
    cupsCode: primary?.cupsCode ?? null,
    requiereCupsRips: ripsMode === 'non_rips' ? false : ripsMode === 'rips' ? true : undefined,
    cost: totalCost > 0 ? totalCost : undefined,
    isBillable:
      filled.length === 0
        ? note.isBillable
        : filled.some((service) => service.isBillable !== false && (service.cost ?? 0) > 0),
  }
}

export function appendCatalogServiceToNote(note: EvolutionNote): Partial<EvolutionNote> {
  const current = getEvolutionCatalogServices(note)
  return buildEvolutionNotePatchFromServices(note, [...current, createEmptyCatalogService()])
}

export function updateCatalogServiceInNote(
  note: EvolutionNote,
  serviceId: string,
  patch: Partial<EvolutionCatalogService>,
): Partial<EvolutionNote> {
  const current = getEvolutionCatalogServices(note)
  const next = current.map((service) =>
    service.id === serviceId ? { ...service, ...patch } : service,
  )
  return buildEvolutionNotePatchFromServices(note, next)
}

export function removeCatalogServiceFromNote(
  note: EvolutionNote,
  serviceId: string,
): Partial<EvolutionNote> {
  const current = getEvolutionCatalogServices(note)
  const next = current.filter((service) => service.id !== serviceId)
  return buildEvolutionNotePatchFromServices(note, next)
}

/** Expande una nota en ítems clínicos (uno por servicio del catálogo). */
export function expandEvolutionNoteServices(
  note: EvolutionNote,
): Array<{ note: EvolutionNote; service: EvolutionCatalogService }> {
  const services = getEvolutionCatalogServices(note).filter(
    (service) =>
      service.procedure?.trim() || service.serviceName?.trim() || service.dentalServiceId,
  )

  if (services.length === 0) {
    return [{ note, service: { id: note.id, procedure: note.procedure ?? '' } }]
  }

  return services.map((service) => ({
    note: {
      ...note,
      dentalServiceId: service.dentalServiceId,
      serviceName: service.serviceName,
      procedure: service.procedure,
      cupsCode: service.cupsCode,
      requiereCupsRips: service.requiereCupsRips,
      cost: service.cost,
      isBillable: service.isBillable,
    },
    service,
  }))
}
