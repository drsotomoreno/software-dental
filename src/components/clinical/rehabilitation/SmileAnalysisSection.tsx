import {
  SMILE_ANALYSIS_OPTIONS,
  smileAnalysisNotesField,
  type RehabSmileAnalysis,
  type SmileAnalysisCategory,
} from '@/constants/smileAnalysis'

interface SmileAnalysisSectionProps {
  value: RehabSmileAnalysis
  onChange: (value: RehabSmileAnalysis) => void
  disabled?: boolean
}

export function SmileAnalysisSection({
  value,
  onChange,
  disabled = false,
}: SmileAnalysisSectionProps) {
  const toggleCategory = (id: SmileAnalysisCategory) => {
    if (disabled) return

    const nextActive = !value[id]
    const notesField = smileAnalysisNotesField(id)

    onChange({
      ...value,
      [id]: nextActive,
      [notesField]: nextActive ? value[notesField] : '',
    })
  }

  const updateNotes = (id: SmileAnalysisCategory, notes: string) => {
    const notesField = smileAnalysisNotesField(id)
    onChange({ ...value, [notesField]: notes })
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <h5 className="text-sm font-semibold text-slate-800">Análisis De Sonrisa</h5>
        <p className="text-xs text-slate-500">
          Documente exposición dental, línea y curva de sonrisa según el hallazgo clínico.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {SMILE_ANALYSIS_OPTIONS.map((option) => {
          const isActive = value[option.id]

          return (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              onClick={() => toggleCategory(option.id)}
              className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${
                isActive
                  ? 'border-violet-300 bg-violet-50 text-violet-900 shadow-sm ring-2 ring-violet-200 ring-offset-1'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white'
              }`}
              aria-pressed={isActive}
            >
              {option.label}
            </button>
          )
        })}
      </div>

      {SMILE_ANALYSIS_OPTIONS.map((option) => {
        if (!value[option.id]) return null
        const notesField = smileAnalysisNotesField(option.id)
        const notes = value[notesField] as string
        const inputId = `smile-analysis-${option.id}`

        return (
          <div key={option.id} className="border-t border-slate-100 pt-3">
            <label className="label-field mb-1" htmlFor={inputId}>
              {option.label}
            </label>
            <textarea
              id={inputId}
              rows={2}
              disabled={disabled}
              value={notes}
              onChange={(e) => updateNotes(option.id, e.target.value)}
              placeholder="Describa el hallazgo clínico..."
              className="input-field resize-y text-sm"
            />
          </div>
        )
      })}
    </section>
  )
}
