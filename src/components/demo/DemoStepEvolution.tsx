interface DemoStepEvolutionProps {
  value: string
  onChange: (value: string) => void
}

/** Paso 9 — Nota de evolución clínica (textarea). */
export function DemoStepEvolution({ value, onChange }: DemoStepEvolutionProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-dental-600">Paso 9 de 10</p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-800">Notas de evolución</h2>
      <p className="mt-2 text-sm text-slate-500">
        Redacte una nota de evolución clínica. En la versión completa esta nota se firma solo con
        el profesional (ReTHUS + marca de tiempo), sin firma del paciente.
      </p>

      <div className="mt-8 space-y-2">
        <label htmlFor="demo-evolution-note" className="text-sm font-medium text-slate-700">
          Nota de evolución
        </label>
        <textarea
          id="demo-evolution-note"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={10}
          placeholder="Ej. Paciente asiste a control. Se realiza procedimiento planificado sin complicaciones. Se dan indicaciones de higiene y analgesia."
          className="input-field min-h-[14rem] resize-y"
        />
        <p className="text-xs text-slate-500">{value.trim().length} caracteres</p>
      </div>
    </div>
  )
}
