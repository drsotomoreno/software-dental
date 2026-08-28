import { useEffect, useState } from 'react'
import { Printer, X } from 'lucide-react'
import {
  CLINICAL_HISTORY_PRINT_SECTIONS,
  clinicalPrintSectionLabel,
  type ClinicalHistoryPrintSectionId,
} from '@/constants/clinicalHistorySections'
import type { ClinicalRecordFormData } from '@/types/clinicalRecord'
import type { OdontogramData } from '@/types/odontogram'
import type { Patient } from '@/types/patient'
import type { UserProfile } from '@/types/user'
import { printClinicalHistorySections } from '@/utils/clinicalHistoryPrint'

interface ClinicalHistoryPrintDialogProps {
  patient: Patient
  professional: UserProfile
  clinicalData: ClinicalRecordFormData
  odontogram?: OdontogramData | null
}

export function ClinicalHistoryPrintDialog({
  patient,
  professional,
  clinicalData,
  odontogram,
}: ClinicalHistoryPrintDialogProps) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [selectedSections, setSelectedSections] = useState<ClinicalHistoryPrintSectionId[]>(
    CLINICAL_HISTORY_PRINT_SECTIONS.map((section) => section.id),
  )

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  const toggleSection = (sectionId: ClinicalHistoryPrintSectionId) => {
    setSelectedSections((current) =>
      current.includes(sectionId)
        ? current.filter((id) => id !== sectionId)
        : [...current, sectionId],
    )
    setError('')
  }

  const selectAll = () => {
    setSelectedSections(CLINICAL_HISTORY_PRINT_SECTIONS.map((section) => section.id))
    setError('')
  }

  const clearAll = () => {
    setSelectedSections([])
    setError('')
  }

  const handlePrint = () => {
    try {
      printClinicalHistorySections({
        patient,
        professional,
        clinicalData,
        odontogram,
        sections: CLINICAL_HISTORY_PRINT_SECTIONS.filter((section) =>
          selectedSections.includes(section.id),
        ).map((section) => section.id),
      })
      setOpen(false)
    } catch (printError) {
      setError(
        printError instanceof Error
          ? printError.message
          : 'No se pudo abrir el diálogo de impresión.',
      )
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError('')
          setOpen(true)
        }}
        className="btn-secondary inline-flex items-center gap-2"
        title="Imprimir secciones de la historia clínica"
      >
        <Printer className="h-4 w-4" aria-hidden="true" />
        Imprimir historia
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="clinical-print-dialog-title"
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h4
                  id="clinical-print-dialog-title"
                  className="text-lg font-semibold text-slate-900"
                >
                  Imprimir historia clínica
                </h4>
                <p className="mt-1 text-sm text-slate-600">
                  Seleccione las secciones a enviar a la impresora del equipo. Se abrirá el diálogo
                  de impresión del sistema operativo.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-3 flex flex-wrap gap-2">
              <button type="button" onClick={selectAll} className="btn-secondary text-xs">
                Seleccionar todo
              </button>
              <button type="button" onClick={clearAll} className="btn-secondary text-xs">
                Deseleccionar todo
              </button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {CLINICAL_HISTORY_PRINT_SECTIONS.map((section) => {
                const checked = selectedSections.includes(section.id)
                return (
                  <label
                    key={section.id}
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm transition ${
                      checked
                        ? 'border-dental-500 bg-dental-50'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSection(section.id)}
                      className="mt-0.5 rounded border-slate-300 text-dental-600 focus:ring-dental-500"
                    />
                    <span className="font-medium text-slate-800">
                      {clinicalPrintSectionLabel(section)}
                    </span>
                  </label>
                )
              })}
            </div>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
                Cancelar
              </button>
              <button
                type="button"
                onClick={handlePrint}
                disabled={selectedSections.length === 0}
                className="btn-primary inline-flex items-center gap-2"
              >
                <Printer className="h-4 w-4" aria-hidden="true" />
                Imprimir selección
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
