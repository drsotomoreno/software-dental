import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/database'
import { useAuth } from '@/contexts/AuthContext'
import { GENERAL_DENTISTRY_REHUS_SPECIALTY } from '@/constants/rehusSpecialties'
import { COMMON_DENTAL_PROCEDURES } from '@/constants/dental'
import { useCatalogSearch } from '@/hooks/useCatalogSearch'
import { normalizeCupsCode, formatCupsCodeDotted } from '@/services/catalogService'
import {
  abbreviateProcedureLabel,
  buildCupsProcedureOptions,
  filterCupsProcedureOptions,
  formatCupsProcedureLabel,
  type CupsProcedureOption,
} from '@/utils/cupsProcedureLabel'
import { canProfessionalEvolveCupsCode } from '@/utils/dentalServiceCatalogRules'
import { userProfileToOrganizationId } from '@/utils/organizationId'

interface CupsProcedurePickerProps {
  value: string
  disabled?: boolean
  inputId?: string
  onChange: (value: string) => void
}

const EVOLUTION_CUPS_SHORTLIST: CupsProcedureOption[] = COMMON_DENTAL_PROCEDURES.map(
  ({ cupsCode, procedure }) => ({ cupsCode, procedure }),
)

export function CupsProcedurePicker({
  value,
  disabled = false,
  inputId,
  onChange,
}: CupsProcedurePickerProps) {
  const [search, setSearch] = useState(value)

  useEffect(() => {
    setSearch(value)
  }, [value])

  const { user } = useAuth()
  const cupsCatalog = useCatalogSearch('cups', search, 40)
  const prices = useLiveQuery(
    () => (user?.id ? db.prices.where('userId').equals(user.id).toArray() : []),
    [user?.id],
  )
  const organizationId = user ? userProfileToOrganizationId(user) : ''
  const professionalSpecialty =
    user?.rehusSpecialty ?? user?.thsSpecialty ?? GENERAL_DENTISTRY_REHUS_SPECIALTY

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

  const resolveAuthorizedSpecialties = (cupsCode: string): string[] | undefined => {
    const normalized = normalizeCupsCode(cupsCode)
    const service = (dentalServices ?? []).find(
      (item) =>
        normalizeCupsCode(item.cupsCode ?? '') === normalized ||
        normalizeCupsCode(item.cupsHomologo ?? '') === normalized ||
        item.internalCode.toUpperCase() === normalized,
    )
    if (!service) return undefined
    return authorizedSpecialtiesByServiceId.get(service.id)
  }

  const procedureOptions = useMemo(
    () =>
      buildCupsProcedureOptions(
        EVOLUTION_CUPS_SHORTLIST,
        prices,
        cupsCatalog?.map((item) => ({ code: item.code, description: item.description })),
      ),
    [prices, cupsCatalog],
  )

  const filteredOptions = useMemo(() => {
    const base = !search.trim()
      ? EVOLUTION_CUPS_SHORTLIST
      : filterCupsProcedureOptions(procedureOptions, search)

    return base.filter((option) =>
      canProfessionalEvolveCupsCode(
        professionalSpecialty,
        option.cupsCode,
        resolveAuthorizedSpecialties(option.cupsCode),
      ),
    )
  }, [
    procedureOptions,
    search,
    professionalSpecialty,
    dentalServices,
    authorizedSpecialtiesByServiceId,
  ])

  const applyOption = (option: CupsProcedureOption) => {
    const label = formatCupsProcedureLabel(option.cupsCode, option.procedure)
    setSearch(label)
    onChange(label)
  }

  return (
    <div>
      <input
        id={inputId}
        disabled={disabled}
        value={search}
        onChange={(event) => {
          setSearch(event.target.value)
          onChange(event.target.value)
        }}
        placeholder="Buscar código CUPS o procedimiento..."
        className="input-field"
      />
      {!disabled && (
        <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          {filteredOptions.length === 0 ? (
            <li className="px-3 py-2 text-xs text-slate-500">
              Sin coincidencias — puede dejar el texto manual.
            </li>
          ) : (
            filteredOptions.map((option) => (
              <li key={`${option.cupsCode}-${option.procedure}`}>
                <button
                  type="button"
                  onClick={() => applyOption(option)}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-slate-50"
                >
                  <span className="font-mono font-semibold text-dental-700">
                    {formatCupsCodeDotted(option.cupsCode)}
                  </span>
                  <span className="ml-2 text-slate-700">
                    {abbreviateProcedureLabel(option.procedure)}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
      {!disabled && !search.trim() && (
        <p className="mt-1 text-[10px] text-slate-400">
          Lista abreviada CUPS según su especialidad REHUS. Odontología General está disponible
          para todos los especialistas.
        </p>
      )}
    </div>
  )
}
