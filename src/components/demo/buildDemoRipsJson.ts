import {
  completarRipsSinFactura,
  normalizarEstructuraRips,
} from '../../../shared/ripsEstructura.js'
import {
  DEMO_PRESTADOR_NIT,
  DEMO_PRESTADOR_REPS,
} from '@/constants/rips'
import {
  demoMarkedToothIds,
  demoTreatmentTotal,
  type DemoFormData,
} from './demoTypes'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** Fecha/hora RIPS: `YYYY-MM-DD HH:mm`. */
function formatRipsDateTime(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function compactCie10(code: string | null | undefined): string {
  return (code ?? '').replace(/\./g, '').trim().toUpperCase()
}

/**
 * Arma un JSON RIPS de demostración (estructura tipo Res. 2275 / FEV-RIPS),
 * a partir de los datos capturados en la guía interactiva.
 */
export function buildDemoRipsJson(form: DemoFormData): object {
  const now = new Date()
  const fechaAtencion = formatRipsDateTime(now)
  const diagnosis = form.selectedDiagnosis
  const cie10 = compactCie10(diagnosis?.code) || 'K021'
  const treatment = form.treatmentRow
  const vrServicio = treatment ? demoTreatmentTotal(treatment) : 0
  const firstNames = form.patientName.trim() || 'PACIENTE DEMO'
  const docSeed = firstNames.replace(/\D/g, '').slice(0, 10) || '1000000001'

  const consultas = [
    {
      codPrestador: DEMO_PRESTADOR_REPS,
      fechaInicioAtencion: fechaAtencion,
      numAutorizacion: null,
      codConsulta: '890203',
      modalidadGrupoServicioTecSal: '01',
      grupoServicios: '01',
      codServicio: 325,
      finalidadTecnologiaSalud: '11',
      causaMotivoAtencion: '38',
      codDiagnosticoPrincipal: cie10,
      codDiagnosticoRelacionado1: null,
      codDiagnosticoRelacionado2: null,
      codDiagnosticoRelacionado3: null,
      tipoDiagnosticoPrincipal: '01',
      tipoDocumentoIdentificacion: 'CC',
      numDocumentoIdentificacion: DEMO_PRESTADOR_NIT,
      vrServicio: 0,
      conceptoRecaudo: '05',
      valorPagoModerador: 0,
      numFEVPagoModerador: null,
      consecutivo: 1,
      /** Campo de apoyo en la demo (no forma parte del anexo técnico estricto). */
      motivoConsultaDemo: form.chiefComplaint || null,
    },
  ]

  const procedimientos = treatment
    ? [
        {
          codPrestador: DEMO_PRESTADOR_REPS,
          fechaInicioAtencion: fechaAtencion,
          idMIPRES: null,
          numAutorizacion: null,
          codProcedimiento: treatment.cupsCode.replace(/\D/g, '').padStart(6, '0').slice(-6) || '997301',
          viaIngresoServicioSalud: '01',
          modalidadGrupoServicioTecSal: '01',
          grupoServicios: '04',
          codServicio: 344,
          finalidadTecnologiaSalud: '11',
          tipoDocumentoIdentificacion: 'CC',
          numDocumentoIdentificacion: DEMO_PRESTADOR_NIT,
          codDiagnosticoPrincipal: cie10,
          codDiagnosticoPrincipalCIE11: '',
          codDiagnosticoRelacionado: null,
          codDiagnosticoRelacionadoCIE11: '',
          codComplicacion: null,
          codComplicacionCIE11: '',
          vrServicio,
          conceptoRecaudo: '05',
          valorPagoModerador: form.payment?.amount ?? 0,
          numFEVPagoModerador: null,
          consecutivo: 1,
          codigoVIDA: '',
          /** Descripción del plan (demo). */
          descripcionProcedimientoDemo: treatment.procedureName,
          cantidadDemo: treatment.quantity,
        },
      ]
    : []

  const raw = {
    numDocumentoIdObligado: DEMO_PRESTADOR_NIT,
    numFactura: null,
    tipoNota: 'RS',
    numNota: `NOTA-DEMO-${Date.now()}`,
    usuarios: [
      {
        tipoDocumentoIdentificacion: 'CC',
        numDocumentoIdentificacion: docSeed.padStart(10, '0').slice(0, 10),
        tipoUsuario: '01',
        fechaNacimiento: '1990-01-15',
        codSexo: 'M',
        codPaisResidencia: '170',
        codMunicipioResidencia: '68001',
        codZonaTerritorialResidencia: '01',
        incapacidad: 'NO',
        consecutivo: 1,
        codPaisOrigen: '170',
        /** Nombre del paciente capturado en la demo (fuera del núcleo RIPS). */
        nombrePacienteDemo: firstNames,
        servicios: {
          consultas,
          procedimientos,
          urgencias: [],
          hospitalizacion: [],
          recienNacidos: [],
          medicamentos: [],
          otrosServicios: [],
        },
      },
    ],
    contextoDemo: {
      resolucionReferencia: 'Resolución 2275 de 2023 (FEV-RIPS) — simulación educativa',
      nombrePaciente: form.patientName || null,
      motivoConsulta: form.chiefComplaint || null,
      diagnostico: diagnosis
        ? {
            codigo: diagnosis.code,
            descripcion: diagnosis.description,
            pieza: diagnosis.toothNumber ?? null,
            alcanceAnatomico: diagnosis.anatomicalScope ?? null,
          }
        : null,
      procedimiento: treatment
        ? {
            cups: treatment.cupsCode,
            nombre: treatment.procedureName,
            cantidad: treatment.quantity,
            costoUnitario: treatment.unitCost,
            total: vrServicio,
            diagnosticoVinculado: treatment.diagnosisCode
              ? {
                  codigo: treatment.diagnosisCode,
                  descripcion: treatment.diagnosisDescription ?? null,
                  pieza: treatment.diagnosisToothNumber ?? null,
                  alcanceAnatomico: treatment.diagnosisAnatomicalScope ?? null,
                }
              : null,
          }
        : null,
      abono: form.payment
        ? {
            valor: form.payment.amount,
            medioPago: form.payment.method,
            observacion: form.payment.note || null,
          }
        : null,
      notaEvolucion: form.evolutionNote || null,
      firmaProfesionalEvolucion: form.evolutionProfessionalSignature
        ? {
            profesional: form.evolutionProfessionalName || null,
            rethus: form.evolutionRethus || null,
            firmadoEn: form.evolutionSignedAt,
          }
        : null,
      piezasOdontograma: demoMarkedToothIds(form.odontogramMarks),
      odontogramaDemo: form.odontogramMarks,
      firmaPacienteConsentimiento: Boolean(form.signatureDataUrl),
    },
  }

  return completarRipsSinFactura(normalizarEstructuraRips(raw))
}

export function stringifyDemoRips(form: DemoFormData): string {
  return JSON.stringify(buildDemoRipsJson(form), null, 2)
}

export function downloadDemoRipsJson(jsonText: string, fileName?: string): void {
  const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName ?? `rips-demo-${Date.now()}.json`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
