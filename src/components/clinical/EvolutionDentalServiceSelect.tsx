import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { useAuth } from '@/contexts/AuthContext'
import { COMMON_DENTAL_PROCEDURES } from '@/constants/dental'
import { GENERAL_DENTISTRY_REHUS_SPECIALTY } from '@/constants/rehusSpecialties'
import { useCatalogSearch } from '@/hooks/useCatalogSearch'
import { useTariffSync } from '@/modules/tariff/useTariffSync'
import { normalizeCupsCode, formatCupsCodeDotted } from '@/services/catalogService'
import { useTariffStore } from '@/store/useTariffStore'
import type { DentalService } from '@/types/dentalServiceCatalog'
import type { EvolutionCatalogService } from '@/types/evolutionNote'
import type { TariffItem } from '@/types/pricing'
import {
  abbreviateProcedureLabel,
  filterCupsProcedureOptions,
  formatCupsProcedureLabel,
  type CupsProcedureOption,
} from '@/utils/cupsProcedureLabel'
import {
  canProfessionalEvolveCupsCode,
  canProfessionalEvolveService,
} from '@/utils/dentalServiceCatalogRules'
import { userProfileToOrganizationId } from '@/utils/organizationId'

interface EvolutionDentalServiceSelectProps {
  service: EvolutionCatalogService
  disabled?: boolean
  showLabel?: boolean
  label?: string
  onChange: (service: EvolutionCatalogService) => void
}

type ServiceOption =
  | { kind: 'tariff'; tariff: TariffItem }
  | { kind: 'dental'; service: DentalService; authorizedSpecialtyIds: string[] }
  | { kind: 'cups'; cupsCode: string; procedure: string }

const EVOLUTION_CUPS_SHORTLIST: CupsProcedureOption[] = COMMON_DENTAL_PROCEDURES.map(
  ({ cupsCode, procedure }) => ({ cupsCode, procedure }),
)

function isCustomCode(code: string): boolean {
  return code.trim().toUpperCase().startsWith('CUSTOM_')
}

function formatTariffLabel(tariff: TariffItem): string {
  if (tariff.type === 'CUSTOM') {
    return `${tariff.code} — ${abbreviateProcedureLabel(tariff.name)}`
  }
  return formatCupsProcedureLabel(tariff.code, tariff.name)
}

function formatDentalServiceLabel(service: DentalService): string {
  const suffix = !service.requiereCupsRips ? ' — sin CUPS RIPS' : ''
  return `${service.name}${suffix}`
}

function serviceToDisplayLabel(service: EvolutionCatalogService): string {
  if (service.serviceName?.trim()) return service.serviceName
  if (service.procedure?.trim() && service.cupsCode) {
    return formatCupsProcedureLabel(service.cupsCode, service.procedure)
  }
  return service.procedure?.trim() ?? ''
}

export function EvolutionDentalServiceSelect({
  service,
  disabled = false,
  showLabel = true,
  label = 'Procedimiento del Catálogo',
  onChange,
}: EvolutionDentalServiceSelectProps) {
  const { user } = useAuth()
  const organizationId = user ? userProfileToOrganizationId(user) : ''
  const professionalSpecialty =
    user?.rehusSpecialty ?? user?.thsSpecialty ?? GENERAL_DENTISTRY_REHUS_SPECIALTY

  const [search, setSearch] = useState(() => serviceToDisplayLabel(service))

  useEffect(() => {
    setSearch(serviceToDisplayLabel(service))
  }, [
    service.id,
    service.procedure,
    service.serviceName,
    service.cupsCode,
    service.dentalServiceId,
  ])

  useTariffSync(user?.id)
  const tariffs = useTariffStore((state) => state.tariffs)

  const cupsCatalog = useCatalogSearch('cups', search, 40)

  const prices = useLiveQuery(
    () => (user?.id ? db.prices.where('userId').equals(user.id).toArray() : []),
    [user?.id],
  )

  const dentalServices = useLiveQuery(
    () =>
      organizationId
        ? db.dentalServices.where('organizationId').equals(organizationId).toArray()
        : [],
    [organizationId],
  )

  const dentalServiceSpecialties = useLiveQuery(
    () => db.dentalServiceSpecialties.toArray(),
    [],
  )

  const authorizedSpecialtiesByServiceId = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const row of dentalServiceSpecialties ?? []) {
      const current = map.get(row.serviceId) ?? []
      current.push(row.rehusSpecialtyId)
      map.set(row.serviceId, current)
    }
    return map
  }, [dentalServiceSpecialties])

  const findDentalService = (code: string): DentalService | undefined => {
    const normalized = isCustomCode(code) ? code.trim().toUpperCase() : normalizeCupsCode(code)
    return (dentalServices ?? []).find(
      (item) =>
        item.internalCode.toUpperCase() === normalized ||
        normalizeCupsCode(item.cupsCode ?? '') === normalized ||
        normalizeCupsCode(item.cupsHomologo ?? '') === normalized,
    )
  }

  const resolveAuthorizedSpecialties = (cupsCode: string): string[] | undefined => {
    return authorizedSpecialtiesByServiceId.get(findDentalService(cupsCode)?.id ?? '')
  }

  const tariffOptions = useMemo(() => {
    const pricedCodes = new Set(
      (prices ?? []).map((price) =>
        isCustomCode(price.cupsCode)
          ? price.cupsCode.trim().toUpperCase()
          : normalizeCupsCode(price.cupsCode),
      ),
    )

    return tariffs.filter((tariff) => {
      if (!tariff.isActive) return false
      if (tariff.type === 'CUSTOM') return true
      if (tariff.price > 0) return true
      return pricedCodes.has(normalizeCupsCode(tariff.code))
    })
  }, [tariffs, prices])

  const serviceOptions = useMemo(() => {
    const map = new Map<string, ServiceOption>()

    for (const tariff of tariffOptions) {
      const key =
        tariff.type === 'CUSTOM'
          ? `tariff|${tariff.code}`
          : `tariff|${normalizeCupsCode(tariff.code)}`
      map.set(key, { kind: 'tariff', tariff })
    }

    for (const dentalService of dentalServices ?? []) {
      if (!dentalService.isActive) continue
      const authorized = authorizedSpecialtiesByServiceId.get(dentalService.id) ?? []
      if (!canProfessionalEvolveService(professionalSpecialty, authorized)) continue
      map.set(`dental|${dentalService.id}`, {
        kind: 'dental',
        service: dentalService,
        authorizedSpecialtyIds: authorized,
      })
    }

    const cupsCandidates: CupsProcedureOption[] = [...EVOLUTION_CUPS_SHORTLIST]
    for (const price of prices ?? []) {
      cupsCandidates.push({ procedure: price.procedure, cupsCode: price.cupsCode })
    }
    for (const item of cupsCatalog ?? []) {
      cupsCandidates.push({ procedure: item.description, cupsCode: item.code })
    }

    for (const candidate of cupsCandidates) {
      if (isCustomCode(candidate.cupsCode)) continue
      if (
        !canProfessionalEvolveCupsCode(
          professionalSpecialty,
          candidate.cupsCode,
          resolveAuthorizedSpecialties(candidate.cupsCode),
        )
      ) {
        continue
      }
      const key = `cups|${normalizeCupsCode(candidate.cupsCode)}`
      if (!map.has(key)) {
        map.set(key, {
          kind: 'cups',
          cupsCode: normalizeCupsCode(candidate.cupsCode),
          procedure: candidate.procedure,
        })
      }
    }

    return [...map.values()]
  }, [
    tariffOptions,
    dentalServices,
    authorizedSpecialtiesByServiceId,
    professionalSpecialty,
    prices,
    cupsCatalog,
  ])

  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) {
      return serviceOptions.slice(0, 14)
    }

    return serviceOptions
      .filter((option) => {
        if (option.kind === 'tariff') {
          const optionLabel = formatTariffLabel(option.tariff).toLowerCase()
          return (
            optionLabel.includes(query) ||
            option.tariff.code.toLowerCase().includes(query) ||
            option.tariff.name.toLowerCase().includes(query)
          )
        }
        if (option.kind === 'dental') {
          return formatDentalServiceLabel(option.service).toLowerCase().includes(query)
        }
        const dotted = formatCupsCodeDotted(option.cupsCode).toLowerCase()
        return (
          option.procedure.toLowerCase().includes(query) ||
          option.cupsCode.toLowerCase().includes(query) ||
          dotted.includes(query)
        )
      })
      .slice(0, 14)
  }, [serviceOptions, search])

  const patchService = (patch: Partial<EvolutionCatalogService>) => {
    onChange({ ...service, ...patch })
  }

  const applyTariff = (tariff: TariffItem) => {
    const dentalService = findDentalService(tariff.code)
    if (tariff.type === 'CUSTOM') {
      patchService({
        dentalServiceId: dentalService?.id,
        serviceName: tariff.name,
        requiereCupsRips: false,
        procedure: tariff.name,
        cupsCode: null,
        cost: tariff.price > 0 ? tariff.price : undefined,
      })
      setSearch(formatTariffLabel(tariff))
      return
    }

    const cupsCode = normalizeCupsCode(tariff.code)
    patchService({
      dentalServiceId: dentalService?.id,
      serviceName: tariff.name,
      requiereCupsRips: true,
      procedure: tariff.name,
      cupsCode,
      cost: tariff.price > 0 ? tariff.price : undefined,
    })
    setSearch(formatTariffLabel(tariff))
  }

  const applyDentalService = (dental: DentalService) => {
    patchService({
      dentalServiceId: dental.id,
      serviceName: dental.name,
      requiereCupsRips: dental.requiereCupsRips ? true : false,
      procedure: dental.name,
      cupsCode: dental.requiereCupsRips ? (dental.cupsCode ?? null) : null,
      cost: dental.defaultPrice > 0 ? dental.defaultPrice : undefined,
    })
    setSearch(formatDentalServiceLabel(dental))
  }

  const applyCupsOption = (option: CupsProcedureOption) => {
    const cupsCode = normalizeCupsCode(option.cupsCode)
    const dentalService = findDentalService(cupsCode)
    const tariff = tariffs.find((item) => normalizeCupsCode(item.code) === cupsCode)
    patchService({
      dentalServiceId: dentalService?.id,
      serviceName: option.procedure,
      requiereCupsRips: true,
      procedure: option.procedure,
      cupsCode,
      cost: tariff && tariff.price > 0 ? tariff.price : undefined,
    })
    setSearch(formatCupsProcedureLabel(cupsCode, option.procedure))
  }

  const applyManualEntry = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) {
      patchService({
        dentalServiceId: undefined,
        serviceName: undefined,
        procedure: '',
        cupsCode: undefined,
        requiereCupsRips: undefined,
        cost: undefined,
      })
      return
    }

    const customMatch = trimmed.match(/^(CUSTOM_\d+)\b/i)
    if (customMatch) {
      const tariff = tariffs.find(
        (item) => item.code.toUpperCase() === customMatch[1].toUpperCase(),
      )
      if (tariff) {
        applyTariff(tariff)
        return
      }
    }

    const cupsDigits = trimmed.replace(/\D/g, '')
    if (/^\d{6}$/.test(cupsDigits)) {
      const cupsCode = normalizeCupsCode(cupsDigits)
      const fromCatalog = filterCupsProcedureOptions(
        [
          ...EVOLUTION_CUPS_SHORTLIST,
          ...(prices ?? []).map((price) => ({
            procedure: price.procedure,
            cupsCode: price.cupsCode,
          })),
        ],
        cupsDigits,
        1,
      )[0]
      const procedure =
        fromCatalog?.procedure ??
        cupsCatalog?.find((item) => normalizeCupsCode(item.code) === cupsCode)?.description ??
        trimmed
      applyCupsOption({ cupsCode, procedure })
      return
    }

    patchService({
      dentalServiceId: undefined,
      serviceName: undefined,
      procedure: trimmed,
      cupsCode: undefined,
      requiereCupsRips: undefined,
    })
  }

  const handleOptionSelect = (option: ServiceOption) => {
    if (option.kind === 'tariff') {
      applyTariff(option.tariff)
      return
    }
    if (option.kind === 'dental') {
      applyDentalService(option.service)
      return
    }
    applyCupsOption(option)
  }

  const renderOptionLabel = (option: ServiceOption): string => {
    if (option.kind === 'tariff') return formatTariffLabel(option.tariff)
    if (option.kind === 'dental') return formatDentalServiceLabel(option.service)
    return formatCupsProcedureLabel(option.cupsCode, option.procedure)
  }

  const renderOptionMeta = (option: ServiceOption): string | null => {
    if (option.kind === 'tariff' && option.tariff.price > 0) {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
      }).format(option.tariff.price)
    }
    if (option.kind === 'dental' && option.service.defaultPrice > 0) {
      return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
      }).format(option.service.defaultPrice)
    }
    if (option.kind === 'tariff' && option.tariff.type === 'CUSTOM') {
      return 'Tratamiento personalizado'
    }
    return null
  }

  return (
    <div>
      {showLabel && (
        <label className="label-field">
          {label} <span className="text-red-500">*</span>
        </label>
      )}
      <input
        disabled={disabled}
        value={search}
        onChange={(event) => {
          const next = event.target.value
          setSearch(next)
          patchService({ procedure: next })
        }}
        onBlur={() => applyManualEntry(search)}
        placeholder="Buscar CUPS, tratamiento personalizado o escribir manualmente…"
        className="input-field"
      />
      {!disabled && search.trim() && (
        <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          {filteredOptions.length === 0 ? (
            <li className="px-3 py-2 text-xs text-slate-500">
              Sin coincidencias en el catálogo — puede dejar el texto manual.
            </li>
          ) : (
            filteredOptions.map((option) => {
              const key =
                option.kind === 'tariff'
                  ? `tariff-${option.tariff.code}`
                  : option.kind === 'dental'
                    ? `dental-${option.service.id}`
                    : `cups-${option.cupsCode}-${option.procedure}`
              const meta = renderOptionMeta(option)
              return (
                <li key={key}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleOptionSelect(option)}
                    className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50"
                  >
                    <span className="text-slate-800">{renderOptionLabel(option)}</span>
                    {meta && <span className="shrink-0 text-slate-500">{meta}</span>}
                  </button>
                </li>
              )
            })
          )}
        </ul>
      )}
    </div>
  )
}
