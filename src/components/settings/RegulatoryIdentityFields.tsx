import type { ReactNode } from 'react'
import { ODONTOLOGY_THS_SPECIALTIES, type OdontologyThsSpecialtyId } from '@/constants/ripsThsSpecialty'
import { GENERAL_DENTISTRY_REHUS_SPECIALTY } from '@/constants/rehusSpecialties'
import { parseRepsCodeWithDane, VERIFIED_REPS_EXAMPLE_DISPLAY } from '@/utils/repsCode'
import {
  PROFESSIONAL_DOCUMENT_LABEL,
  PROFESSIONAL_DOCUMENT_TYPES,
  sanitizeDocumentNumber,
  validateProfessionalDocumentNumber,
} from '@/utils/professionalDocument'
import type { RepsHabilitationStatus } from '@/utils/repsCode'
import {
  validateRethusNumberFormat,
  VERIFIED_RETHUS_EXAMPLE,
  type RethusStatus,
} from '@/utils/rethusNumber'
import { sanitizeRepsInput, sanitizeRethusInput } from '@/utils/prestadorIdentity'

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

export function DocumentIdentityField({
  documentType,
  documentNumber,
  onChange,
  compact = false,
  required = true,
  error,
}: {
  documentType: string
  documentNumber: string
  onChange: (patch: { documentType?: string; documentNumber?: string }) => void
  compact?: boolean
  required?: boolean
  error?: string
}) {
  const format = documentNumber.trim()
    ? validateProfessionalDocumentNumber(documentNumber, documentType)
    : null

  return (
    <>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase text-slate-700">
          Tipo de documento
        </label>
        <select
          required={required}
          value={documentType || 'CC'}
          onChange={(e) => onChange({ documentType: e.target.value, documentNumber: sanitizeDocumentNumber(documentNumber, e.target.value) })}
          className="input-field bg-white"
        >
          {PROFESSIONAL_DOCUMENT_TYPES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <div className={`mb-1 ${compact ? '' : 'flex items-center justify-between gap-3'}`}>
          <label className="block text-xs font-semibold uppercase text-slate-700">
            {PROFESSIONAL_DOCUMENT_LABEL}
          </label>
          {compact ? null : (
            <CatalogLookupHelp summary="¿Por qué la cédula?">
              El directorio ReTHUS del Ministerio de Salud se consulta con el número de cédula. Es
              la llave del talento humano en el sistema nacional de salud.
            </CatalogLookupHelp>
          )}
        </div>
        <input
          required={required}
          value={sanitizeDocumentNumber(documentNumber, documentType)}
          onChange={(e) =>
            onChange({ documentNumber: sanitizeDocumentNumber(e.target.value, documentType) })
          }
          className={`input-field font-mono ${error || (format && !format.valid) ? 'border-red-400' : ''}`}
          placeholder="Ej: 1234567890"
          inputMode="numeric"
          autoComplete="off"
          aria-invalid={Boolean(error || (format && !format.valid))}
        />
        {error || (format && !format.valid) ? (
          <p className="mt-1 text-xs text-red-600">{error || format?.message}</p>
        ) : compact ? null : (
          <p className="mt-1 text-xs text-slate-500">
            Obligatorio. La cédula es la llave de consulta en ReTHUS para firmar historias clínicas y
            RIPS.
          </p>
        )}
      </div>
    </>
  )
}

export function RethusCodeField({
  value,
  onChange,
  compact = false,
  required = false,
  error,
}: {
  value: string
  onChange: (value: string) => void
  compact?: boolean
  required?: boolean
  error?: string
}) {
  const format = value.trim() ? validateRethusNumberFormat(value) : null

  return (
    <div>
      <div className={`mb-1 ${compact ? '' : 'flex items-center justify-between gap-3'}`}>
        <label className="block text-xs font-semibold uppercase text-slate-700">
          Código ReTHUS
        </label>
        {compact ? null : (
          <CatalogLookupHelp summary="¿Qué es el código ReTHUS?">
            Es el consecutivo nacional del Registro Único de Talento Humano en Salud (6 a 12
            dígitos). No es una tarjeta profesional. Ejemplo: {VERIFIED_RETHUS_EXAMPLE}.
          </CatalogLookupHelp>
        )}
      </div>
      <input
        value={sanitizeRethusInput(value)}
        onChange={(e) => onChange(sanitizeRethusInput(e.target.value))}
        className={`input-field font-mono ${error || (format && !format.valid) ? 'border-red-400' : ''}`}
        placeholder={`Ej: ${VERIFIED_RETHUS_EXAMPLE}`}
        inputMode="numeric"
        autoComplete="off"
        required={required}
        aria-invalid={Boolean(error || (format && !format.valid))}
      />
      {error || (format && !format.valid) ? (
        <p className="mt-1 text-xs text-red-600">{error || format?.message}</p>
      ) : compact ? null : (
        <p className="mt-1 text-xs text-slate-500">
          Queda guardado en su perfil junto con la cédula.
        </p>
      )}
    </div>
  )
}

export function RepsHabilitationField({
  value,
  onChange,
  compact = false,
  error,
}: {
  value: string
  onChange: (value: string) => void
  compact?: boolean
  error?: string
}) {
  const parsed = parseRepsCodeWithDane(value)

  return (
    <div>
      <div className={`mb-1 ${compact ? '' : 'flex items-center justify-between gap-3'}`}>
        <label className="block text-xs font-semibold uppercase text-slate-700">
          Código REPS (habilitación sede)
        </label>
        {compact ? null : (
          <CatalogLookupHelp summary="¿Qué es y dónde consultarlo?">
            Es el código de 12 dígitos de la sede habilitada ante la seccional de salud. Se consulta
            en el portal de Prestadores de Servicios de Salud (REPS) del MinSalud. Ejemplo:{' '}
            {VERIFIED_REPS_EXAMPLE_DISPLAY}.
          </CatalogLookupHelp>
        )}
      </div>
      <input
        value={sanitizeRepsInput(value)}
        onChange={(e) => onChange(sanitizeRepsInput(e.target.value))}
        className={`input-field font-mono ${error || (value.trim() && !parsed.valid) ? 'border-red-400' : ''}`}
        placeholder={`Ej: ${VERIFIED_REPS_EXAMPLE_DISPLAY}`}
        autoComplete="off"
        aria-invalid={Boolean(error || (value.trim() && !parsed.valid))}
      />
      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : value.trim() ? (
        <p className={`mt-1 text-xs ${parsed.valid ? 'text-emerald-700' : 'text-red-600'}`}>
          {parsed.valid
            ? compact
              ? `${parsed.display} · ${parsed.departmentName}`
              : `${parsed.display} · ${parsed.departmentName} / ${parsed.municipalityName} · sede ${parsed.sedeCode}${parsed.isMainSede ? ' (principal)' : ''}`
            : parsed.message}
        </p>
      ) : compact ? null : (
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
      <label className="mb-1 block text-xs font-semibold uppercase text-slate-700">
        Especialidad (REPS)
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
        Indique la especialidad habilitada de la sede en el REPS. Debe coincidir con el RETHUS para la validación MUV.
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
        <RethusCodeField
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
