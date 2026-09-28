import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ClipboardCheck } from 'lucide-react'
import { CuvNotifierPanel } from '@/components/rips/CuvNotifierPanel'
import { procesarArchivoResultadosMSPS } from '@/services/cuvProcessor'
import { guardarYValidarRipsLocalmente } from '@/services/localRipsStore'
import { validarEstructuraRips, type PaqueteRIPS } from '@/utils/ripsValidator'

const PAQUETE_INICIAL: PaqueteRIPS = {
  numDocumentoIdObligado: '900123456',
  numFactura: 'FEV-1024',
  tipoNota: null,
  numNota: null,
  usuarios: [
    {
      tipoDocumentoIdentificacion: 'CC',
      numDocumentoIdentificacion: '123456789',
      tipoUsuario: '01',
      fechaNacimiento: '1990-01-01',
      sexo: 'M',
      servicios: {
        consultas: [
          {
            codPrestador: '680010000001',
            fechaHoraInicioAtencion: '2026-09-28 09:00',
            codConsulta: '890201',
            modalidadGrupoServicioTecnol: '01',
            grupoServicios: '01',
            codServicio: 1,
            finalidadTecnologiaSalud: '10',
            causaExterna: '15',
            tipoDiagnosticoPrincipal: '1',
            codDiagnosticoPrincipal: 'K021',
            valorConsulta: 150000,
            conceptoRecaudo: '05',
            valorPagoModerador: 0,
          },
        ],
        procedimientos: [],
      },
    },
  ],
}

function actualizarCodConsulta(paquete: PaqueteRIPS, codConsulta: string): PaqueteRIPS {
  return {
    ...paquete,
    usuarios: paquete.usuarios.map((usuario, indiceUsuario) =>
      indiceUsuario === 0
        ? {
            ...usuario,
            servicios: {
              ...usuario.servicios,
              consultas: usuario.servicios.consultas.map((consulta, indiceConsulta) =>
                indiceConsulta === 0 ? { ...consulta, codConsulta } : consulta,
              ),
            },
          }
        : usuario,
    ),
  }
}

/**
 * Evalúa el paquete RIPS mientras se edita y solo lo escribe en Dexie
 * cuando la estructura, incluido el CUPS .03, ya es válida.
 */
export function RipsValidationPanel() {
  const [paquete, setPaquete] = useState<PaqueteRIPS>(PAQUETE_INICIAL)
  const [guardadoExitoso, setGuardadoExitoso] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errorGuardado, setErrorGuardado] = useState('')
  const [leyendoCuv, setLeyendoCuv] = useState(false)
  const [errorCuv, setErrorCuv] = useState('')

  const evaluacion = useMemo(() => validarEstructuraRips(paquete), [paquete])
  const codConsulta = paquete.usuarios[0]?.servicios.consultas[0]?.codConsulta ?? ''
  const odontologiaGeneral = codConsulta.startsWith('89')
  const cupsValido = !odontologiaGeneral || codConsulta.endsWith('03')

  const cambiarCodConsulta = (valor: string) => {
    setGuardadoExitoso(false)
    setErrorGuardado('')
    setErrorCuv('')
    setPaquete((prev) => actualizarCodConsulta(prev, valor))
  }

  useEffect(() => {
    const alAplicar = (event: Event) => {
      const detail = (event as CustomEvent<{ success?: boolean; cuv?: string; error?: string; numFactura?: string }>).detail
      if (!detail) return
      const facturaEvento = String(detail.numFactura ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
      const facturaPanel = paquete.numFactura.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
      if (facturaEvento && facturaEvento !== facturaPanel) return
      if (detail.success) {
        setErrorCuv('')
        return
      }
      if (detail.error) setErrorCuv(detail.error)
    }
    window.addEventListener('rips-cuv-aplicado', alAplicar)
    return () => window.removeEventListener('rips-cuv-aplicado', alAplicar)
  }, [paquete.numFactura])

  const handleArchivoMinisterio = async (archivo: File | null) => {
    setErrorCuv('')
    if (!archivo) return
    setLeyendoCuv(true)
    try {
      const resultado = await procesarArchivoResultadosMSPS(archivo, paquete.numFactura)
      if (!resultado.success || !resultado.cuv) {
        setErrorCuv(resultado.error ?? 'No se pudo leer el CUV.')
      }
    } finally {
      setLeyendoCuv(false)
    }
  }

  const handleValidarYGuardar = async () => {
    setGuardadoExitoso(false)
    setErrorGuardado('')
    if (!evaluacion.isValid) return

    setGuardando(true)
    try {
      const resultado = await guardarYValidarRipsLocalmente(paquete)
      setGuardadoExitoso(resultado.success)
      if (!resultado.success) {
        setErrorGuardado('El paquete no se guardó como válido.')
      }
    } catch (error) {
      setErrorGuardado(error instanceof Error ? error.message : 'No se pudo guardar el paquete local.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="card" aria-labelledby="rips-validador-titulo">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="rips-validador-titulo" className="flex items-center gap-2 text-base font-semibold text-slate-800">
            <ClipboardCheck className="h-5 w-5 text-dental-600" aria-hidden="true" />
            Validador de RIPS en tiempo real
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Factura {paquete.numFactura}. La estructura se revisa al escribir. El guardado local ocurre cuando el paquete queda válido.
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            evaluacion.isValid ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
          }`}
        >
          {evaluacion.isValid ? 'Estructura válida' : `${evaluacion.errors.length} error${evaluacion.errors.length === 1 ? '' : 'es'}`}
        </span>
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <label htmlFor="cod-consulta-rips" className="label-field">
          Código de consulta
        </label>
        <input
          id="cod-consulta-rips"
          type="text"
          inputMode="numeric"
          value={codConsulta}
          onChange={(event) => cambiarCodConsulta(event.target.value)}
          aria-invalid={!cupsValido}
          aria-describedby="cod-consulta-ayuda"
          className={`input-field font-mono ${
            cupsValido ? 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500' : 'border-red-400 focus:border-red-500 focus:ring-red-500'
          }`}
        />
        <p id="cod-consulta-ayuda" className="mt-1 text-xs text-slate-500">
          Odontología general empieza por 89 y termina en 03. Pruebe <code className="font-mono">890203</code>.
        </p>
      </div>

      <button
        type="button"
        onClick={() => void handleValidarYGuardar()}
        disabled={!evaluacion.isValid || guardando}
        className="btn-primary mt-4 w-full"
      >
        {guardando ? 'Guardando…' : 'Validar y guardar localmente'}
      </button>

      <div aria-live="polite" className="mt-4 space-y-3">
        {evaluacion.errors.length > 0 && (
          <div className="rounded-r-lg border-l-4 border-red-500 bg-red-50 p-4" role="alert">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-red-800">Se encontraron errores de validación</h3>
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-700">
              {evaluacion.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        {evaluacion.isValid && !guardadoExitoso && (
          <div className="flex items-center gap-2 rounded-r-lg border-l-4 border-emerald-500 bg-emerald-50 p-4">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            <p className="text-sm font-medium text-emerald-800">
              Estructura de RIPS válida. Ya puede guardarla en la base local.
            </p>
          </div>
        )}

        {guardadoExitoso && (
          <div className="flex items-center gap-2 rounded-r-lg border-l-4 border-emerald-500 bg-emerald-50 p-4">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
            <p className="text-sm font-medium text-emerald-800">
              Estructura de RIPS válida. Guardada en la base de datos local.
            </p>
          </div>
        )}

        {errorGuardado && (
          <p className="text-sm text-red-700" role="alert">
            {errorGuardado}
          </p>
        )}
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <label htmlFor="archivo-resultados-msps" className="label-field">
          Archivo de resultados del Ministerio
        </label>
        <input
          id="archivo-resultados-msps"
          type="file"
          accept=".txt,text/plain"
          disabled={leyendoCuv}
          onChange={(event) => {
            const archivo = event.target.files?.[0] ?? null
            void handleArchivoMinisterio(archivo)
            event.target.value = ''
          }}
          className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-dental-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
        />
        <p className="mt-1 text-xs text-slate-500">
          Guarde el paquete y luego elija ResultadosMSPS_{paquete.numFactura}_[ID]_A_CUV.txt. El CUV queda en ese registro local.
        </p>
        {leyendoCuv && <p className="mt-2 text-sm text-slate-600">Leyendo el archivo…</p>}
        {errorCuv && (
          <p className="mt-2 text-sm text-red-700" role="alert">
            {errorCuv}
          </p>
        )}
      </div>

      <CuvNotifierPanel numFactura={paquete.numFactura} />
    </section>
  )
}
