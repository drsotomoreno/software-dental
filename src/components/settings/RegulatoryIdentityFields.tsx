import type { ReactNode } from 'react'
import { ODONTOLOGY_THS_SPECIALTIES, type OdontologyThsSpecialtyId } from '@/constants/ripsThsSpecialty'
import { GENERAL_DENTISTRY_REHUS_SPECIALTY } from '@/constants/rehusSpecialties'
import { parseRepsCodeWithDane, VERIFIED_REPS_EXAMPLE_DISPLAY } from '@/utils/repsCode'
import { validateRethusNumberFormat, VERIFIED_RETHUS_EXAMPLE } from '@/utils/rethusNumber'
import type { RepsHabilitationStatus } from '@/utils/repsCode'
import type { RethusStatus } from '@/utils/rethusNumber'

export interface RegulatoryIdentityValues {
  repsCode: string
  repsStatus: RepsHabilitationStatus
  rethusNumber: string
  rethusStatus: RethusStatus
  thsSpecialty: OdontologyThsSpecialtyId
  repsEnabledSpecialties: OdontologyThsSpecialtyId[]
}

interface RegulatoryIdentityFieldsProps {
  values: RegulatoryIdentityValues
  onChange: (patch: Partial<RegulatoryIdentityValues>) => void
  /** `simple` = perfil del profesional. `full` = admin (estados y portafolio REPS). */
  variant?: 'simple' | 'full'
}

function CatalogLookupHelp({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="text-xs text-sky-700">
      <summary className="cursor-pointer list-none font-medium hover:underline [&::-webkit-details-marker]:hidden">
        {summary}
      </summary>
      <p className="mt-1 rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-600">{children}</p>
    </details>
  )
}

export function ensureSpecialtyInRepsPortfolio(
  specialty: OdontologyThsSpecialtyId,
  current: readonly OdontologyThsSpecialtyId[] = [],
): OdontologyThsSpecialtyId[] {
  const next = new Set(current.filter(Boolean))
  next.add(GENERAL_DENTISTRY_REHUS_SPECIALTY)
  next.add(specialty)
  return [...next]
}

export function RethusNumberField({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const format = value.trim() ? validateRethusNumberFormat(value) : null

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">
          No. RETHUS (inscripción profesional)
        </label>
        <CatalogLookupHelp summary="¿Qué es y dónde consultarlo?">
          Es el Registro Único Nacional del Talento Humano en Salud que reemplaza la tarjeta
          profesional. Consúltelo en el directorio RETHUS del Ministerio de Salud.
        </CatalogLookupHelp>
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-field font-mono"
        placeholder={`Ej: ${VERIFIED_RETHUS_EXAMPLE}`}
        inputMode="numeric"
        autoComplete="off"
      />
      {format && !format.valid ? (
        <p className="mt-1 text-xs text-red-600">{format.message}</p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">
          Obligatorio para firmar historias clínicas, fórmulas y soportes de RIPS.
        </p>
      )}
    </div>
  )
}

export function RepsHabilitationField({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const parsed = parseRepsCodeWithDane(value)

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">
          Código REPS (habilitación sede)
        </label>
        <CatalogLookupHelp summary="¿Qué es y dónde consultarlo?">
          Es el código de 12 dígitos de la sede habilitada ante la seccional de salud. Se consulta
          en el portal de Prestadores de Servicios de Salud (REPS) del MinSalud. Ejemplo:{' '}
          {VERIFIED_REPS_EXAMPLE_DISPLAY}.
        </CatalogLookupHelp>
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-field font-mono"
        placeholder={`Ej: ${VERIFIED_REPS_EXAMPLE_DISPLAY}`}
        autoComplete="off"
      />
      {value.trim() ? (
        <p className={`mt-1 text-xs ${parsed.valid ? 'text-emerald-700' : 'text-red-600'}`}>
          {parsed.valid
            ? `${parsed.display} · ${parsed.departmentName} / ${parsed.municipalityName} · sede ${parsed.sedeCode}${parsed.isMainSede ? ' (principal)' : ''}`
            : parsed.message}
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">
          Formato: departamento (2) + municipio DANE (3) + consecutivo (5) + sede (2).
        </p>
      )}
    </div>
  )
}

export function RethusSpecialtyField({
  value,
  onChange,
}: {
  value: OdontologyThsSpecialtyId
  onChange: (value: OdontologyThsSpecialtyId) => void
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-700">
        Especialidad (RETHUS)
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as OdontologyThsSpecialtyId)}
        className="input-field bg-white"
      >
        {ODONTOLOGY_THS_SPECIALTIES.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-slate-400">
        Debe coincidir con la especialidad habilitada en el REPS y el RETHUS para la validación MUV.
      </p>
    </div>
  )
}

export function RegulatoryIdentityAdminExtras({
  values,
  onChange,
}: {
  values: RegulatoryIdentityValues
  onChange: (patch: Partial<RegulatoryIdentityValues>) => void
}) {
  return (
    <>
      <div>
        <label className="label-field">Estado habilitación REPS</label>
        <select
          value={values.repsStatus}
          onChange={(e) => onChange({ repsStatus: e.target.value as RepsHabilitationStatus })}
          className="input-field"
        >
          <option value="activo">Activo</option>
          <option value="inactivo">Inactivo</option>
        </select>
      </div>
      <div>
        <label className="label-field">Estado RETHUS</label>
        <select
          value={values.rethusStatus}
          onChange={(e) => onChange({ rethusStatus: e.target.value as RethusStatus })}
          className="input-field"
        >
          <option value="activo">Activo</option>
          <option value="pendiente">Pendiente</option>
          <option value="inactivo">Inactivo</option>
        </select>
      </div>
      <div className="sm:col-span-2">
        <p className="label-field">Servicios habilitados en REPS (portafolio de la sede)</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {ODONTOLOGY_THS_SPECIALTIES.map((item) => (
            <label key={item.id} className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={values.repsEnabledSpecialties.includes(item.id)}
                onChange={() => {
                  const current = values.repsEnabledSpecialties
                  const next = current.includes(item.id)
                    ? current.filter((entry) => entry !== item.id)
                    : [...current, item.id]
                  onChange({
                    repsEnabledSpecialties: ensureSpecialtyInRepsPortfolio(
                      values.thsSpecialty,
                      next,
                    ),
                  })
                }}
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-500">
          No se factura ni se genera RIPS de especialidad si la sede no tiene ese servicio
          habilitado.
        </p>
      </div>
    </>
  )
}

export function RegulatoryIdentityFields({
  values,
  onChange,
  variant = 'full',
}: RegulatoryIdentityFieldsProps) {
  const handleSpecialtyChange = (thsSpecialty: OdontologyThsSpecialtyId) => {
    onChange({
      thsSpecialty,
      repsEnabledSpecialties: ensureSpecialtyInRepsPortfolio(
        thsSpecialty,
        values.repsEnabledSpecialties,
      ),
    })
  }

  return (
    <>
      <div className="sm:col-span-2">
        <RethusNumberField
          value={values.rethusNumber}
          onChange={(rethusNumber) => onChange({ rethusNumber })}
        />
      </div>
      <div className="sm:col-span-2">
        <RepsHabilitationField
          value={values.repsCode}
          onChange={(repsCode) => onChange({ repsCode })}
        />
      </div>
      <div className="sm:col-span-2">
        <RethusSpecialtyField value={values.thsSpecialty} onChange={handleSpecialtyChange} />
      </div>
      {variant === 'full' ? (
        <RegulatoryIdentityAdminExtras values={values} onChange={onChange} />
      ) : null}
    </>
  )
}
