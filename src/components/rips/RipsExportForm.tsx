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
  clasificarRadicacionRips,
  countRipsIssues,
  cufeDeAtenciones,
  evolucionIdDeAtencion,
  explicarFalloCuv,
  textoFalloDeRed,
  facturasDelPaquete,
  formatRipsIssuePatientLabel,
  createCatalogLookupFromServices,
  isRipsPackageReadyForExport,
  pickInvoiceNumberForRips,
  ripsParaRadicar,
  textoRadicacionExitosa,
  vinculosDeAtenciones,
} from '@/utils'
import { userProfileToOrganizationId } from '@/utils/organizationId'
import { DEFAULT_ODONTOLOGY_CONSULTATION_CUPS } from '@/constants/rips'
import { buildRipsMetadataFromInvoice } from '@/services/invoiceService'
import {
  downloadDianXml,
  fetchRipsApiStatus,
  radicarRipsAnteMinisterio,
  validateRipsWithMinistry,
} from '@/services/ripsApiService'
import { saveTemporaryRips } from '@/services/ripsTemporalService'
import { getBillingModalitySettings } from '@/services/billingModalityService'
import {
  isNoObligadoFev,
  normalizePerfilFiscal,
  normalizeRipsNumFactura,
} from '@/utils/fiscalProfile'

interface RipsExportFormProps {
  sources: RipsSourceRecord[]
  professional: UserProfile
  initialMetadata?: Partial<RipsExportMetadata>
  onExported?: (info: { cuv: string; source?: string | null; canal?: string | null }) => void
  onCuvObtained?: (result: RipsValidateSuccessResponse) => void
  /** Cambia cuando la fila Exportar arranca, para borrar un rechazo viejo. */
  formReset?: number
  /** Limpia el aviso de la fila antes de validar o radicar el lote. */
  onUserAction?: () => void
}

export function RipsExportForm({
  sources,
  professional,
  initialMetadata,
  onExported,
  onCuvObtained,
  formReset = 0,
  onUserAction,
}: RipsExportFormProps) {
  const [metadata, setMetadata] = useState<RipsExportMetadata>(() => {
    const perfilFiscal = normalizePerfilFiscal(
      professional.perfilFiscal ?? getBillingModalitySettings().perfilFiscal,
    )
    const noObligado = isNoObligadoFev(perfilFiscal)
    return {
      ...buildDefaultRipsMetadata(professional),
      ...initialMetadata,
      perfilFiscal,
      numFactura: noObligado ? null : normalizeRipsNumFactura(initialMetadata?.numFactura),
      esRipsTemporal: noObligado,
    }
  })
  const [exported, setExported] = useState(false)
  const [radicando, setRadicando] = useState(false)
  const [radicacionMensaje, setRadicacionMensaje] = useState('')
  const [radicacionCuv, setRadicacionCuv] = useState('')
  const [apiOnline, setApiOnline] = useState<boolean | null>(null)
  const [apiSandbox, setApiSandbox] = useState<boolean | null>(null)
  const [validating, setValidating] = useState(false)
  const [cuvResult, setCuvResult] = useState<RipsValidateSuccessResponse | null>(null)
  const [ministryErrors, setMinistryErrors] = useState<RipsMinistryError[]>([])
  const [serverIssues, setServerIssues] = useState<RipsValidationIssue[]>([])
  const [validateMessage, setValidateMessage] = useState('')
  const invoiceTouchedRef = useRef(Boolean(normalizeRipsNumFactura(initialMetadata?.numFactura)))

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
          numFactura: metadata.numFactura ?? null,
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
  const packageReady = isRipsPackageReadyForExport({
    sourceCount: sources.length,
    issues: result.issues,
    rips: result.rips,
  })
  const atenciones = sources.map(({ record }) => record)
  const facturasPaquete = facturasDelPaquete(atenciones, invoices ?? [])
  const cufePaquete = cufeDeAtenciones(atenciones, facturasPaquete)
  const clasificacion = clasificarRadicacionRips({
    vinculaciones: vinculosDeAtenciones(atenciones),
    cufe: cufePaquete,
  })
  const canExport = packageReady && clasificacion.listo
  const canValidate = packageReady && apiOnline === true
  const exportHint = !packageReady
    ? sources.length === 0
      ? 'Seleccione atenciones para armar el paquete. Exportar RIPS se habilita cuando quede listo para radicar.'
      : errors > 0
        ? 'Corrija los errores de bloqueo. Exportar RIPS radica el paquete cuando quede listo.'
        : 'El paquete aún no tiene servicios para radicar.'
    : !clasificacion.listo
      ? clasificacion.motivo
      : warnings > 0
        ? `${clasificacion.motivo} ${warnings} advertencia(s).`
        : clasificacion.motivo

  useEffect(() => {
    fetchRipsApiStatus().then((status) => {
      setApiOnline(status.online)
      setApiSandbox(status.sandbox)
    })
  }, [])

  useEffect(() => {
    setExported(false)
    setRadicacionMensaje('')
    setRadicacionCuv('')
    setCuvResult(null)
    setMinistryErrors([])
    setServerIssues([])
    setValidateMessage('')
  }, [sourceKey, formReset])

  useEffect(() => {
    const defaults = buildDefaultRipsMetadata(professional)
    setMetadata((prev) => {
      const nit = prev.numDocumentoIdObligado.trim() || defaults.numDocumentoIdObligado
      const reps = prev.codPrestador.trim() || defaults.codPrestador
      if (nit === prev.numDocumentoIdObligado && reps === prev.codPrestador) return prev
      return { ...prev, numDocumentoIdObligado: nit, codPrestador: reps }
    })
  }, [professional.id, professional.providerNit, professional.repsCode])

  const perfilFiscal = normalizePerfilFiscal(
    metadata.perfilFiscal ?? professional.perfilFiscal ?? getBillingModalitySettings().perfilFiscal,
  )
  const noObligado = isNoObligadoFev(perfilFiscal)

  useEffect(() => {
    if (noObligado) {
      setMetadata((prev) => {
        if (prev.numFactura == null && prev.perfilFiscal === perfilFiscal && prev.esRipsTemporal) {
          return prev
        }
        return {
          ...prev,
          numFactura: null,
          fevReferencia: undefined,
          perfilFiscal,
          esRipsTemporal: true,
        }
      })
      return
    }
    if (invoiceTouchedRef.current) return
    if (sources.length === 0) return
    if (invoices === undefined) return
    const suggested = pickInvoiceNumberForRips(sources, invoices)
    if (!suggested) return
    const matched = invoices.find((invoice) => invoice.invoiceNumber?.trim() === suggested)
    const fromInvoice = matched ? buildRipsMetadataFromInvoice(matched, professional) : null
    setMetadata((prev) => {
      const next = {
        ...prev,
        numFactura: suggested,
        fevReferencia: suggested,
        perfilFiscal,
        esRipsTemporal: false as const,
        ...(fromInvoice
          ? {
              conceptoRecaudo: fromInvoice.conceptoRecaudo,
              valorPagoModerador: fromInvoice.valorPagoModerador,
              numFEVPagoModerador: fromInvoice.numFEVPagoModerador,
              vrConsulta: fromInvoice.vrConsulta,
              codPrestador: prev.codPrestador.trim() || fromInvoice.codPrestador,
              numDocumentoIdObligado:
                prev.numDocumentoIdObligado.trim() || fromInvoice.numDocumentoIdObligado,
            }
          : {}),
      }
      if (
        next.numFactura === prev.numFactura &&
        next.fevReferencia === prev.fevReferencia &&
        next.perfilFiscal === prev.perfilFiscal &&
        next.esRipsTemporal === prev.esRipsTemporal &&
        next.conceptoRecaudo === prev.conceptoRecaudo &&
        next.valorPagoModerador === prev.valorPagoModerador &&
        next.numFEVPagoModerador === prev.numFEVPagoModerador &&
        next.vrConsulta === prev.vrConsulta &&
        next.codPrestador === prev.codPrestador &&
        next.numDocumentoIdObligado === prev.numDocumentoIdObligado
      ) {
        return prev
      }
      return next
    })
  }, [invoices, sources, sourceKey, noObligado, perfilFiscal, professional])

  const handleExport = async () => {
    if (!canExport || radicando) return
    onUserAction?.()
    const first = sources[0]
    const rips = ripsParaRadicar(result.rips, clasificacion.canal)
    const cufe = clasificacion.canal === 'fev' ? cufePaquete : ''
    const patientIds = [...new Set(sources.map(({ patient }) => String(patient.id ?? '')).filter(Boolean))]
    setRadicando(true)
    setRadicacionMensaje('')
    setRadicacionCuv('')
    setExported(false)

    let response
    try {
      response = await radicarRipsAnteMinisterio({
        rips,
        cufe,
        evolutionId: sources.length === 1 && first ? evolucionIdDeAtencion(first.record) : null,
        patientId: patientIds.length === 1 ? patientIds[0] : null,
      })
    } catch (error) {
      setRadicando(false)
      setRadicacionMensaje(
        error instanceof Error ? error.message : 'No se pudo contactar el Ministerio de Salud.',
      )
      return
    }
    setRadicando(false)

    if (!response.success || !response.cuv) {
      const detalle =
        response.errors?.map((item) => item.message).filter(Boolean).join(' ') ||
        response.error ||
        'El Ministerio de Salud no radicó el paquete.'
      setRadicacionMensaje(detalle)
      setMinistryErrors(
        (response.errors ?? []).map((item) => ({
          field: item.path,
          code: item.code,
          message: item.message || 'Rechazo del Ministerio de Salud.',
        })),
      )
      return
    }

    void saveTemporaryRips({
      clinicId: professional.clinicId || professional.id,
      patientId: first ? String(first.patient.id) : null,
      professionalId: professional.id,
      clinicalRecordId: first ? String(first.record.id ?? '') : null,
      numDocumentoIdObligado: rips.numDocumentoIdObligado,
      numFactura: normalizeRipsNumFactura(rips.numFactura),
      perfilFiscal,
      status: 'submitted',
      ripsJson: { ...rips, cuv: response.cuv },
    })
    setRadicacionCuv(response.cuv)
    setRadicacionMensaje(textoRadicacionExitosa({ source: response.source, canal: response.canal }))
    setExported(true)
    onExported?.({ cuv: response.cuv, source: response.source, canal: response.canal })
  }

  const handleValidateMinistry = async () => {
    if (!canValidate) return
    onUserAction?.()

    setValidating(true)
    setCuvResult(null)
    setMinistryErrors([])
    setServerIssues([])
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

    const sinFactura = noObligado || normalizeRipsNumFactura(result.rips.numFactura) == null
    let response
    try {
      response = await validateRipsWithMinistry(result.rips, {
      metadatos: {
        patientUuid,
        clinicalRecordIds,
        patientDocument: firstPatient
          ? `${firstPatient.documentType} ${firstPatient.documentNumber}`
          : undefined,
        perfilFiscal,
        esRipsTemporal: sinFactura,
        allowNullNumFactura: sinFactura,
      },
      invoice: sinFactura
        ? undefined
        : {
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
    } catch (error) {
      setValidating(false)
      setValidateMessage(
        textoFalloDeRed(
          error instanceof Error ? error.message : 'No se pudo contactar el servicio de validación.',
        ),
      )
      return
    }

    setValidating(false)

    if (response.success && response.approved) {
      setCuvResult(response)
      setValidateMessage('RIPS aprobado por el motor de validación. CUV almacenado.')
      onCuvObtained?.(response)
      return
    }

    if (!response.success) {
      const localIssues = response.localIssues ?? []
      setServerIssues(localIssues)
      setMinistryErrors(response.ministryErrors ?? [])
      setValidateMessage(explicarFalloCuv(response).message)
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
              ? apiSandbox
                ? 'Sandbox local · CUV de prueba'
                : 'API local conectada'
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

      {result.issues.length > 0 && (
        <RipsValidationList issues={result.issues} errors={errors} warnings={warnings} />
      )}

      {serverIssues.length > 0 && (
        <RipsValidationList
          issues={serverIssues}
          errors={countRipsIssues(serverIssues, 'error')}
          warnings={countRipsIssues(serverIssues, 'warning')}
        />
      )}

      {ministryErrors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="mb-2 text-sm font-medium text-red-900">
            {ministryErrors.every((err) => err.code === 'RIPS_LOCAL')
              ? 'Errores que impiden obtener el CUV'
              : 'Errores del Ministerio de Salud'}{' '}
            ({ministryErrors.length})
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
          onClick={() => void handleExport()}
          disabled={!canExport || radicando}
          title={exportHint}
          aria-label="Exportar RIPS"
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {radicando ? 'Radicando ante MinSalud…' : 'Exportar RIPS'}
        </button>
        <button
          type="button"
          onClick={() => void handleValidateMinistry()}
          disabled={!canValidate || validating}
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {validating ? 'Validando ante MinSalud…' : 'Validar y obtener CUV'}
        </button>
        {exported && radicacionCuv ? (
          <span className="text-sm text-green-700">
            {radicacionMensaje} CUV {radicacionCuv}.
          </span>
        ) : (
          <span
            className={`text-sm ${
              radicacionMensaje ? 'text-red-700' : canExport ? 'text-emerald-700' : 'text-amber-700'
            }`}
          >
            {radicacionMensaje || exportHint}
          </span>
        )}
        {apiOnline === false && (
          <span className="text-sm text-red-700">Sin conexión con el servicio de radicación.</span>
        )}
      </div>

      <p className="text-xs text-slate-500">
        Resolución 2275 de 2023 — RIPS JSON como soporte de la FEV en salud. El MUV valida que el{' '}
        <strong>codConsulta</strong> coincida con la especialidad THS del prestador declarada en REPS.
        En sandbox, Exportar y Validar no llaman al MUV: ambos devuelven un CUV de prueba. El aviso
        «API RIPS» solo indica que este servidor respondió. Con{' '}
        <code className="font-mono">MINSALUD_SANDBOX=false</code> la radicación sí contacta el MUV.
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
        {issues.map((issue, index) => {
          const patientLabel = formatRipsIssuePatientLabel(issue)
          return (
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
                {patientLabel ? (
                  <span className="font-semibold">Paciente {patientLabel}. </span>
                ) : null}
                {issue.field && <span className="font-mono">[{issue.field}] </span>}
                {issue.message}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
