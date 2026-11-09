import { Download, FileJson } from 'lucide-react'
import type { DemoFormData } from './demoTypes'
import { downloadDemoRipsJson, stringifyDemoRips } from './buildDemoRipsJson'

interface DemoStepRipsProps {
  formData: DemoFormData
  generatedRipsJson: string | null
  onGenerated: (json: string) => void
}

/** Paso 9 — Generación y descarga del JSON RIPS (simulación Res. 2275). */
export function DemoStepRips({ formData, generatedRipsJson, onGenerated }: DemoStepRipsProps) {
  const handleGenerate = () => {
    onGenerated(stringifyDemoRips(formData))
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-dental-600">Paso 9 de 9</p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-800">Generación de RIPS</h2>
      <p className="mt-2 text-sm text-slate-500">
        mihistoriadental automatiza la generación de RIPS en formato JSON y su articulación con la
        Factura Electrónica de Venta (FEV) según lo exigido por la Resolución 2275 de 2023 del
        Ministerio de Salud, la Resolución 2333 de 2023 (CUPS) y la Resolución 000165 de 2023 de la
        DIAN. El sistema ejecuta una pre-validación diagnóstica inteligente que audita
        visualmente inconsistencias entre la codificación CIE-10/CUPS y la factura antes del envío
        formal a la plataforma ministerial, garantizando una validación inmediata y eliminando
        devoluciones o rechazos fiscales y de auditoría.
      </p>

      <button
        type="button"
        onClick={handleGenerate}
        className="mt-8 flex w-full items-center justify-center gap-3 rounded-2xl bg-dental-600 px-6 py-5 text-lg font-semibold text-white shadow-md transition hover:bg-dental-700 focus:outline-none focus:ring-2 focus:ring-dental-500 focus:ring-offset-2 sm:text-xl"
      >
        <FileJson className="h-7 w-7 shrink-0" aria-hidden />
        Generar RIPS (JSON)
      </button>

      {generatedRipsJson ? (
        <div className="mt-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-slate-700">JSON generado</p>
            <button
              type="button"
              onClick={() => downloadDemoRipsJson(generatedRipsJson)}
              className="btn-secondary gap-2"
            >
              <Download className="h-4 w-4" aria-hidden />
              Descargar .json
            </button>
          </div>
          <pre className="max-h-[28rem] overflow-auto rounded-xl border border-slate-700 bg-slate-900 p-4 text-xs leading-relaxed text-sky-100 sm:text-sm">
            {generatedRipsJson}
          </pre>
        </div>
      ) : (
        <p className="mt-6 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          El JSON aparecerá aquí después de generar el RIPS.
        </p>
      )}
    </div>
  )
}
