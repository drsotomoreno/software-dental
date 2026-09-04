import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { v4 as uuidv4 } from 'uuid'
import { db } from '@/db/database'
import type { RipsExportMetadata, RipsValidationIssue } from '@/types/rips'
import type { RipsMinistryError, RipsValidateSuccessResponse } from '@/types/ripsCuv'
import type { RipsSourceRecord } from '@/utils/rips'
import type { UserProfile } from '@/types/user'
import {
  buildDefaultRipsMetadata,
  buildRipsFromRecords,
  countRipsIssues,
  createCatalogLookupFromServices,
  downloadRipsJson,
  hasRipsBlockingErrors,
  pickInvoiceNumberForRips,
  suggestRipsFilename,
} from '@/utils'
import { userProfileToOrganizationId } from '@/utils/organizationId'
import { DEFAULT_ODONTOLOGY_CONSULTATION_CUPS } from '@/constants/rips'
import {
  ODONTOLOGY_THS_SPECIALTIES,
  RIPS_CONSULTATION_VISIT_TYPE_LABELS,
  resolveConsultationCupsForThs,
  type OdontologyThsSpecialtyId,
  type RipsConsultationVisitType,
} from '@/constants/ripsThsSpecialty'
import { formatCupsCodeDotted } from '@/services/catalogService'
import {
  checkRipsApiHealth,
  downloadDianXml,
  validateRipsWithMinistry,
} from '@/services/ripsApiService'

interface RipsExportFormProps {
  sources: RipsSourceRecord[]
  professional: UserProfile
  initialMetadata?: Partial<RipsExportMetadata>
  onExported?: () => void
  onCuvObtained?: (result: RipsValidateSuccessResponse) => void
}

export function RipsExportForm({
  sources,
  professional,
  initialMetadata,
  onExported,
  onCuvObtained,
}: RipsExportFormProps) {
  const [metadata, setMetadata] = useState<RipsExportMetadata>(() => ({
    ...buildDefaultRipsMetadata(professional),
    ...initialMetadata,
  }))
  const [exported, setExported] = useState(false)
  const [apiOnline, setApiOnline] = useState<boolean | null>(null)
  const [validating, setValidating] = useState(false)
  const [cuvResult, setCuvResult] = useState<RipsValidateSuccessResponse | null>(null)
  const [ministryErrors, setMinistryErrors] = useState<RipsMinistryError[]>([])
  const [validateMessage, setValidateMessage] = useState('')
  const invoiceTouchedRef = useRef(Boolean(initialMetadata?.numFactura?.trim()))

  const sourceKey = sources
    .map(({ record, patient }) => `${patient.id}:${record.id}`)
    .join('|')

  const invoices = useLiveQuery(async () => {
    const patientIds = [
      ...new Set(sources.map(({ patient }) => String(patient.id ?? '')).filter(Boolean)),
    ]
    if (patientIds.length === 0) return []
    const rows = await Promise.all(
      patientIds.map((id) => db.electronicInvoices.where('patientId').equals(id).toArray()),
    )
    return rows.flat()
  }, [sourceKey])

  const organizationId = userProfileToOrganizationId(professional)
  const dentalServices = useLiveQuery(
    () =>
      organizationId
        ? db.dentalServices.where('organizationId').equals(organizationId).toArray()
        : [],
    [organizationId],
  )

  const catalogLookup = useMemo(
    () => createCatalogLookupFromServices(dentalServices ?? []),
    [dentalServices],
  )

  const result = useMemo(() => {
    try {
      return buildRipsFromRecords(sources, professional, metadata, { catalogLookup })
    } catch {
      return {
        rips: {
          numDocumentoIdObligado: metadata.numDocumentoIdObligado ?? '',
          numFactura: metadata.numFactura ?? '',
          tipoNota: metadata.tipoNota ?? null,
          numNota: metadata.numNota ?? null,
          usuarios: [],
        },
        issues: [
          {
            level: 'error' as const,
            message: 'No se pudo preparar el RIPS para esta historia clínica.',
          },
        ],
        recordCount: 0,
        patientCount: 0,
      }
    }
  }, [sources, professional, metadata, catalogLookup])

  const evolutionOmittedTotal = useMemo(
    () =>
      (result.compileStats ?? []).reduce(
        (sum, stats) =>
          sum + stats.omissions.filter((o) => o.reason === 'requiere_cups_rips_false').length,
        0,
      ),
    [result.compileStats],
  )

  const errors = countRipsIssues(result.issues, 'error')
  const warnings = countRipsIssues(result.issues, 'warning')
  const canExport = !hasRipsBlockingErrors(result.issues) && sources.length > 0
  const canValidate = canExport && apiOnline === true

  useEffect(() => {
    checkRipsApiHealth().then(setApiOnline)
  }, [])

  useEffect(() => {
    const defaults = buildDefaultRipsMetadata(professional)
    setMetadata((prev) => {
      const nit = prev.numDocumentoIdObligado.trim() || defaults.numDocumentoIdObligado
      const reps = prev.codPrestador.trim() || defaults.codPrestador
      if (nit === prev.numDocumentoIdObligado && reps === prev.codPrestador) return prev
      return { ...prev, numDocumentoIdObligado: nit, codPrestador: reps }
    })
  }, [professional.id, professional.providerNit, professional.repsCode])

  useEffect(() => {
    if (invoiceTouchedRef.current) return
    if (sources.length === 0) return
    if (invoices === undefined) return
    const suggested = pickInvoiceNumberForRips(sources, invoices)
    if (!suggested) return
    setMetadata((prev) => {
      if (prev.numFactura.trim() === suggested) return prev
      return {
        ...prev,
        numFactura: suggested,
        fevReferencia: prev.fevReferencia?.trim() ? prev.fevReferencia : suggested,
      }
    })
  }, [invoices, sources, sourceKey])

  const update = (patch: Partial<RipsExportMetadata>) => {
    setMetadata((prev) => {
      const next = { ...prev, ...patch }
      const specialty = next.thsSpecialty ?? professional.thsSpecialty ?? 'odontologia_general'
      const visitType = next.tipoConsulta ?? prev.tipoConsulta ?? 'primera_vez'

      if (patch.thsSpecialty !== undefined || patch.tipoConsulta !== undefined) {
        if (
          visitType === 'urgencias' &&
          specialty !== 'odontologia_general'
        ) {
          next.tipoConsulta = 'primera_vez'
        }
        const effectiveVisitType = next.tipoConsulta ?? visitType
        const resolved = resolveConsultationCupsForThs(specialty, effectiveVisitType)
        if (resolved) {
          next.codConsultaOdontologia = resolved
        }
      }

      return next
    })
    setExported(false)
    setCuvResult(null)
    setMinistryErrors([])
    setValidateMessage('')
  }

  const thsSpecialty = metadata.thsSpecialty ?? professional.thsSpecialty ?? 'odontologia_general'
  const visitType = metadata.tipoConsulta ?? 'primera_vez'
  const expectedConsultaCups =
    resolveConsultationCupsForThs(thsSpecialty, visitType) ??
    metadata.codConsultaOdontologia ??
    DEFAULT_ODONTOLOGY_CONSULTATION_CUPS
  const urgenciasDisabled = thsSpecialty !== 'odontologia_general'

  const handleExport = () => {
    if (!canExport) return
    downloadRipsJson(result.rips, suggestRipsFilename(metadata.numFactura))
    setExported(true)
    onExported?.()
  }

  const handleValidateMinistry = async () => {
    if (!canValidate) return

    setValidating(true)
    setCuvResult(null)
    setMinistryErrors([])
    setValidateMessage('')

    const patientUuid = uuidv4()
    const clinicalRecordIds = sources
      .map((s) => s.record.id)
      .filter((id): id is string | number => id != null)
      .map(String)

    const firstPatient = sources[0]?.patient
    const totalAmount =
      (metadata.vrConsulta ?? 0) +
      sources.reduce(
        (sum, { record }) =>
          sum +
          (record.budgetItems ?? []).reduce(
            (itemSum, item) => itemSum + item.unitPrice * item.quantity,
            0,
          ),
        0,
      )

    const response = await validateRipsWithMinistry(result.rips, {
      metadatos: {
        patientUuid,
        clinicalRecordIds,
        patientDocument: firstPatient
          ? `${firstPatient.documentType} ${firstPatient.documentNumber}`
          : undefined,
      },
      invoice: {
        nitEmisor: metadata.numDocumentoIdObligado,
        razonSocialEmisor:
          professional.legalName ?? professional.clinicName ?? 'Prestador odontológico',
        nitAdquiriente: firstPatient?.documentNumber ?? '222222222222',
        razonSocialAdquiriente: firstPatient
          ? `${firstPatient.firstName} ${firstPatient.lastName}`
          : 'Paciente',
        issueDate: new Date().toISOString().slice(0, 10),
        payableAmount: totalAmount,
        lines: [
          {
            description: 'Servicios odontológicos — consulta y procedimientos',
            quantity: 1,
            unitPrice: totalAmount,
            cupsCode: metadata.codConsultaOdontologia ?? DEFAULT_ODONTOLOGY_CONSULTATION_CUPS,
          },
        ],
      },
    })

    setValidating(false)

    if (response.success && response.approved) {
      setCuvResult(response)
      setValidateMessage('RIPS aprobado por el motor de validación. CUV almacenado.')
      onCuvObtained?.(response)
      return
    }

    if (!response.success) {
      setMinistryErrors(response.ministryErrors ?? [])
      const localCount = response.localIssues?.filter((i) => i.level === 'error').length ?? 0
      setValidateMessage(
        localCount > 0
          ? 'Corrija los errores locales antes de radicar ante el Ministerio.'
          : 'El Ministerio de Salud rechazó el paquete RIPS. Revise los detalles.',
      )
    }
  }

  const totalConsultas = result.rips.usuarios.reduce(
    (n, u) => n + u.servicios.consultas.length,
    0,
  )
  const totalProcedimientos = result.rips.usuarios.reduce(
    (n, u) => n + u.servicios.procedimientos.length,
    0,
  )

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="font-medium text-slate-800">Resumen de exportación</p>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              apiOnline === true
                ? 'bg-emerald-100 text-emerald-800'
                : apiOnline === false
                  ? 'bg-red-100 text-red-800'
                  : 'bg-slate-200 text-slate-600'
            }`}
          >
            API RIPS:{' '}
            {apiOnline === true
              ? 'Conectada (localhost:3000)'
              : apiOnline === false
                ? 'Sin conexión — ejecute npm run server'
                : 'Verificando…'}
          </span>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-4">
          <div>
            <span className="text-xs text-slate-500">Historias</span>
            <p className="font-semibold">{result.recordCount}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">Pacientes</span>
            <p className="font-semibold">{result.patientCount}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">Consultas</span>
            <p className="font-semibold">{totalConsultas}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">Procedimientos</span>
            <p className="font-semibold">{totalProcedimientos}</p>
          </div>
        </div>
        {evolutionOmittedTotal > 0 && (
          <p className="mt-2 text-xs text-violet-800">
            {evolutionOmittedTotal} evolución(es) sin CUPS RIPS omitida(s) del JSON — la secuencia
            consecutiva y la transmisión continúan sin interrupción.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label-field">NIT prestador (obligado a reportar)</label>
          <input
            value={metadata.numDocumentoIdObligado}
            onChange={(e) => update({ numDocumentoIdObligado: e.target.value })}
            placeholder="900123456"
            className="input-field font-mono"
          />
        </div>
        <div>
          <label className="label-field">Nº factura electrónica (FEV)</label>
          <input
            value={metadata.numFactura}
            onChange={(e) => {
              invoiceTouchedRef.current = true
              update({ numFactura: e.target.value })
            }}
            placeholder="FV12345"
            className="input-field font-mono"
          />
          <p className="mt-1 text-[10px] text-slate-500">
            Formato Prefijo + Número (sin espacios ni guiones). Debe coincidir 1:1 con la FEV DIAN.
            {metadata.numFactura.trim() ? ' Si hay factura electrónica del paciente, se completa sola.' : ''}
          </p>
        </div>
        <div>
          <label className="label-field">Referencia FEV (validación 1:1)</label>
          <input
            value={metadata.fevReferencia ?? ''}
            onChange={(e) => update({ fevReferencia: e.target.value || undefined })}
            placeholder={metadata.numFactura || 'Igual que numFactura'}
            className="input-field font-mono"
          />
        </div>
        <div>
          <label className="label-field">Código REPS prestador</label>
          <input
            value={metadata.codPrestador}
            onChange={(e) => update({ codPrestador: e.target.value })}
            placeholder="6800103898-01"
            className="input-field font-mono"
          />
          <p className="mt-1 text-[10px] text-slate-500">
            12 dígitos REPS de la sede (ej. 6800103898-01 → 680010389801 en el JSON).
          </p>
        </div>
        <div>
          <label className="label-field">Inicio vigencia convenio</label>
          <input
            type="date"
            value={metadata.convenioFechaInicio ?? ''}
            onChange={(e) => update({ convenioFechaInicio: e.target.value || undefined })}
            className="input-field"
          />
          <p className="mt-1 text-[10px] text-slate-500">
            Las fechas de atención no pueden ser anteriores a esta fecha.
          </p>
        </div>
        <div>
          <label className="label-field">Especialidad THS (REPS)</label>
          <select
            value={thsSpecialty}
            onChange={(e) =>
              update({ thsSpecialty: e.target.value as OdontologyThsSpecialtyId })
            }
            className="input-field"
          >
            {ODONTOLOGY_THS_SPECIALTIES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-slate-500">
            Debe coincidir con la especialidad habilitada del profesional en REPS para el MUV.
            Un odontólogo general que emita consulta 89.0.2.22 (ortodoncia) sin parametrizar la
            especialidad generará rechazo en el validador.
          </p>
        </div>
        <div>
          <label className="label-field">Tipo de consulta</label>
          <select
            value={visitType}
            onChange={(e) =>
              update({ tipoConsulta: e.target.value as RipsConsultationVisitType })
            }
            className="input-field"
          >
            {(Object.keys(RIPS_CONSULTATION_VISIT_TYPE_LABELS) as RipsConsultationVisitType[]).map(
              (type) => (
                <option key={type} value={type} disabled={type === 'urgencias' && urgenciasDisabled}>
                  {RIPS_CONSULTATION_VISIT_TYPE_LABELS[type]}
                  {type === 'urgencias' && urgenciasDisabled ? ' (solo odontología general)' : ''}
                </option>
              ),
            )}
          </select>
        </div>
        <div>
          <label className="label-field">CUPS consulta odontológica</label>
          <input
            value={metadata.codConsultaOdontologia ?? expectedConsultaCups}
            onChange={(e) => update({ codConsultaOdontologia: e.target.value })}
            className="input-field font-mono"
          />
          <p className="mt-1 text-[10px] text-slate-500">
            CUPS esperado para MUV:{' '}
            <span className="font-mono font-semibold">
              {formatCupsCodeDotted(expectedConsultaCups)} ({expectedConsultaCups})
            </span>
          </p>
        </div>
        <div>
          <label className="label-field">Valor consulta (COP)</label>
          <input
            type="number"
            min={0}
            value={metadata.vrConsulta ?? 0}
            onChange={(e) => update({ vrConsulta: Number(e.target.value) })}
            className="input-field"
          />
        </div>
        <div>
          <label className="label-field">Concepto de recaudo</label>
          <select
            value={metadata.conceptoRecaudo ?? '05'}
            onChange={(e) => update({ conceptoRecaudo: e.target.value })}
            className="input-field"
          >
            <option value="01">Copago</option>
            <option value="02">Cuota moderadora</option>
            <option value="03">Pagos compartidos</option>
            <option value="04">Anticipo</option>
            <option value="05">No aplica</option>
          </select>
        </div>
        <div>
          <label className="label-field">Valor pago moderador</label>
          <input
            type="number"
            min={0}
            value={metadata.valorPagoModerador ?? 0}
            onChange={(e) => update({ valorPagoModerador: Number(e.target.value) })}
            className="input-field"
          />
        </div>
        <div>
          <label className="label-field">Nº FEV pago moderador</label>
          <input
            value={metadata.numFEVPagoModerador ?? ''}
            onChange={(e) => update({ numFEVPagoModerador: e.target.value || null })}
            placeholder="Opcional"
            className="input-field font-mono"
          />
        </div>
      </div>

      {result.issues.length > 0 && (
        <RipsValidationList issues={result.issues} errors={errors} warnings={warnings} />
      )}

      {ministryErrors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="mb-2 text-sm font-medium text-red-900">
            Errores del Ministerio de Salud ({ministryErrors.length})
          </p>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-red-800">
            {ministryErrors.map((err, index) => (
              <li key={index}>
                {err.field && <span className="font-mono">[{err.field}] </span>}
                {err.code && <span className="font-semibold">{err.code}: </span>}
                {err.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {cuvResult && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-900">CUV obtenido correctamente</p>
          <p className="mt-2 font-mono text-lg font-bold tracking-wide text-emerald-800">
            {cuvResult.cuv}
          </p>
          <p className="mt-1 text-xs text-emerald-700">
            Proceso: {cuvResult.procesoId ?? '—'} · Fuente: {cuvResult.source} · Estado:{' '}
            {cuvResult.estado ?? 'APROBADO'}
          </p>
          {cuvResult.dianXml && (
            <button
              type="button"
              onClick={() => downloadDianXml(cuvResult.dianXml!, metadata.numFactura)}
              className="btn-primary mt-3 text-xs"
            >
              Descargar XML FEV-Salud (DIAN)
            </button>
          )}
        </div>
      )}

      {validateMessage && !cuvResult && (
        <p className="text-sm text-amber-800">{validateMessage}</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleExport}
          disabled={!canExport}
          className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
        >
          Descargar RIPS JSON
        </button>
        <button
          type="button"
          onClick={() => void handleValidateMinistry()}
          disabled={!canValidate || validating}
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {validating ? 'Validando ante MinSalud…' : 'Validar y obtener CUV'}
        </button>
        {exported && (
          <span className="text-sm text-green-600">Archivo RIPS descargado correctamente.</span>
        )}
        {!canExport && (
          <span className="text-sm text-amber-700">
            Corrija los errores antes de exportar o validar.
          </span>
        )}
        {apiOnline === false && (
          <span className="text-sm text-red-700">
            Inicie el servidor con <code className="font-mono">npm run server</code>
          </span>
        )}
      </div>

      <p className="text-xs text-slate-500">
        Resolución 2275 de 2023 — RIPS JSON como soporte de la FEV en salud. El MUV valida que el{' '}
        <strong>codConsulta</strong> coincida con la especialidad THS del prestador declarada en REPS.
        La validación se realiza mediante el API en{' '}
        <code className="font-mono">http://localhost:3000</code> (proxy /api en desarrollo). En sandbox
        se simula la respuesta del MUV y se genera un CUV de prueba.
      </p>
    </div>
  )
}

function RipsValidationList({
  issues,
  errors,
  warnings,
}: {
  issues: RipsValidationIssue[]
  errors: number
  warnings: number
}) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
      <p className="mb-2 text-sm font-medium text-amber-900">
        Validación local: {errors} error(es), {warnings} advertencia(s)
      </p>
      <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-amber-900">
        {issues.map((issue, index) => (
          <li key={index} className="flex gap-2">
            <span
              className={
                issue.level === 'error'
                  ? 'font-semibold text-red-700'
                  : 'font-medium text-amber-800'
              }
            >
              {issue.level === 'error' ? 'Error' : 'Aviso'}:
            </span>
            <span>
              {issue.field && <span className="font-mono">[{issue.field}] </span>}
              {issue.patientDocument ? `[${issue.patientDocument}] ` : ''}
              {issue.message}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
