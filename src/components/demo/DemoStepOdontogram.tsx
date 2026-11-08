import { Mic, Sparkles } from 'lucide-react'

interface DemoStepOdontogramProps {
  selectedTeeth: string[]
  onChange: (selectedTeeth: string[]) => void
}

/** Cuadrantes FDI adultos: superior der./izq. e inferior der./izq. */
const UPPER_RIGHT = ['18', '17', '16', '15', '14', '13', '12', '11']
const UPPER_LEFT = ['21', '22', '23', '24', '25', '26', '27', '28']
const LOWER_RIGHT = ['48', '47', '46', '45', '44', '43', '42', '41']
const LOWER_LEFT = ['31', '32', '33', '34', '35', '36', '37', '38']

function ToothCell({
  toothId,
  selected,
  onToggle,
}: {
  toothId: string
  selected: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      title={`Pieza ${toothId}`}
      className={[
        'flex h-9 w-8 items-center justify-center rounded-md border text-[11px] font-semibold transition sm:h-10 sm:w-9 sm:text-xs',
        selected
          ? 'border-dental-600 bg-dental-600 text-white shadow-sm'
          : 'border-slate-300 bg-white text-slate-600 hover:border-dental-400 hover:bg-dental-50',
      ].join(' ')}
    >
      {toothId}
    </button>
  )
}

function QuadrantRow({
  teeth,
  selectedTeeth,
  onToggle,
}: {
  teeth: string[]
  selectedTeeth: string[]
  onToggle: (toothId: string) => void
}) {
  return (
    <div className="flex flex-wrap justify-center gap-1">
      {teeth.map((toothId) => (
        <ToothCell
          key={toothId}
          toothId={toothId}
          selected={selectedTeeth.includes(toothId)}
          onToggle={() => onToggle(toothId)}
        />
      ))}
    </div>
  )
}

/** Paso 3 — Odontograma visual básico (cuadrantes FDI). */
export function DemoStepOdontogram({ selectedTeeth, onChange }: DemoStepOdontogramProps) {
  const toggleTooth = (toothId: string) => {
    onChange(
      selectedTeeth.includes(toothId)
        ? selectedTeeth.filter((id) => id !== toothId)
        : [...selectedTeeth, toothId],
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-dental-600">Paso 3 de 10</p>
      <h2 className="mt-1 text-2xl font-semibold text-slate-800">Odontograma</h2>
      <p className="mt-2 text-sm text-slate-500">
        Vista simplificada de los cuatro cuadrantes (sistema FDI). Pulse una pieza para marcarla.
      </p>

      <div className="mt-8 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-6">
        <div className="mx-auto grid min-w-[20rem] max-w-3xl gap-3">
          <div className="grid grid-cols-2 gap-3 border-b border-slate-300 pb-3">
            <div>
              <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Superior derecho
              </p>
              <QuadrantRow
                teeth={UPPER_RIGHT}
                selectedTeeth={selectedTeeth}
                onToggle={toggleTooth}
              />
            </div>
            <div>
              <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Superior izquierdo
              </p>
              <QuadrantRow
                teeth={UPPER_LEFT}
                selectedTeeth={selectedTeeth}
                onToggle={toggleTooth}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Inferior derecho
              </p>
              <QuadrantRow
                teeth={LOWER_RIGHT}
                selectedTeeth={selectedTeeth}
                onToggle={toggleTooth}
              />
            </div>
            <div>
              <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Inferior izquierdo
              </p>
              <QuadrantRow
                teeth={LOWER_LEFT}
                selectedTeeth={selectedTeeth}
                onToggle={toggleTooth}
              />
            </div>
          </div>
        </div>

        {selectedTeeth.length > 0 && (
          <p className="mt-4 text-center text-xs text-slate-500">
            Piezas marcadas: {selectedTeeth.slice().sort().join(', ')}
          </p>
        )}
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-xl border border-dental-300 bg-gradient-to-r from-dental-50 via-sky-50 to-dental-100 px-4 py-3 shadow-sm">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-dental-600 text-white">
          <Mic className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-dental-900">
            <Sparkles className="h-4 w-4 shrink-0 text-dental-600" aria-hidden />
            Versión paga
          </p>
          <p className="mt-0.5 text-sm text-dental-800">
            ¡En la versión paga podrás dictar todos los hallazgos del odontograma por voz!
          </p>
        </div>
      </div>
    </div>
  )
}
